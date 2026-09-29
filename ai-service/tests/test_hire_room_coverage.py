import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from inference.room_scanner import (room_scanner, _laptop_motion, laptop_pose_tracker,
    _visual_signature, _scene_descriptor, _feature_descriptor, _reference_similarity)


def photo(image):
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 82])
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(encoded).decode()


def panorama_frame(degrees):
    width, height = 2400, 360
    image = np.full((height, width, 3), (191, 198, 207), dtype=np.uint8)
    rng = np.random.default_rng(31)
    for index in range(120):
        x = int(rng.integers(0, width - 45))
        y = int(rng.integers(0, height - 35))
        color = tuple(int(v) for v in rng.integers(25, 225, 3))
        cv2.rectangle(image, (x, y), (x + 20 + index % 25, y + 10 + index % 20), color, -1)
    for index in range(16):
        cv2.putText(image, str(index), (index * 150 + 12, 100 + (index % 3) * 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (35, 50, 75), 3)
    start = int((degrees % 360) * width / 360)
    extended = np.concatenate((image, image), axis=1)
    return photo(extended[:, start:start + 640])


def laptop_samples(moving, pixels=9):
    samples = []
    for index in range(5):
        frame = np.full((240, 320, 3), (135, 143, 151), dtype=np.uint8)
        cv2.rectangle(frame, (85 + (index * pixels if moving else 0), 110),
                      (135 + (index * pixels if moving else 0), 185), (55, 70, 85), -1)
        samples.append(photo(frame))
    return samples


class HireRoomCoverageTest(unittest.TestCase):
    def setUp(self):
        self.old_yolo = room_scanner.yolo
        room_scanner.yolo = None
        room_scanner.scan_states.clear()
        # Room-scanner unit tests exercise the deterministic optical fallback.
        # MediaPipe pose inference is covered by the tracker contract and would
        # make these synthetic-frame tests both slow and hardware dependent.
        self.old_landmarker = laptop_pose_tracker.landmarker if laptop_pose_tracker else None
        self.old_retry_at = laptop_pose_tracker.retry_at if laptop_pose_tracker else None
        if laptop_pose_tracker:
            laptop_pose_tracker.landmarker = None
            laptop_pose_tracker.retry_at = float("inf")

    def tearDown(self):
        room_scanner.yolo = self.old_yolo
        room_scanner.scan_states.clear()
        if laptop_pose_tracker:
            laptop_pose_tracker.landmarker = self.old_landmarker
            laptop_pose_tracker.retry_at = self.old_retry_at

    def scan(self, session, angles, sensor=True):
        result = None
        for angle in angles:
            result = room_scanner.analyze_360(
                [panorama_frame(angle)], session,
                [{"yaw": angle % 360, "pitch": 0}] if sensor else [None],
            )
        return result

    def recorded_references(self):
        references = []
        for step, angle in (("left", 270), ("front", 0), ("right", 90),
                            ("bottom", 180), ("desk", 30)):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            references.append({"step": step, "visualSignature": _visual_signature(gray),
                               "sceneDescriptor": _scene_descriptor(gray),
                               "featureDescriptor": _feature_descriptor(gray)})
        return references

    def test_finished_recording_is_reviewed_once_without_full_circle(self):
        room_scanner.yolo = object()
        angles = (270, 285, 300, 315, 330, 345, 360, 375, 390, 405, 420, 450)
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        pose = {"available": True, "moved": True, "participantDetected": True,
                "mode": "pose", "score": 0.7}
        with patch('inference.room_scanner._laptop_motion', return_value=pose), \
             patch.object(room_scanner, '_yolo_detections', return_value=detections):
            result = room_scanner.analyze_180_recording(
                [panorama_frame(angle) for angle in angles], 'recorded-pass',
                require_laptop=True, laptop_frames=laptop_samples(True),
                references=self.recorded_references())
        self.assertTrue(result['complete'], result)
        self.assertEqual(result['verdict'], 'PASS')
        self.assertEqual(result['failureReason'], 'scan_complete')
        self.assertEqual(result['mode'], 'recorded_video')
        self.assertIsNone(result['pendingObject'])
        self.assertEqual(result['postScanReport']['coverageMode'], 'recorded_video')
        self.assertEqual(len(result['sampledFrames']), 5)
        self.assertEqual(result['postScanReport']['reviewedSectors'], 5)

    def test_finished_recording_rejects_static_or_wrong_order(self):
        room_scanner.yolo = object()
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        pose = {"available": True, "moved": True, "participantDetected": True,
                "mode": "pose", "score": 0.7}
        with patch('inference.room_scanner._laptop_motion', return_value=pose), \
             patch.object(room_scanner, '_yolo_detections', return_value=detections):
            for angles in ((270,) * 12, (90, 75, 60, 45, 30, 15, 0, 345, 330, 315, 300, 270)):
                result = room_scanner.analyze_180_recording(
                    [panorama_frame(angle) for angle in angles], 'recorded-reject',
                    require_laptop=True, laptop_frames=laptop_samples(True),
                    references=self.recorded_references())
                self.assertFalse(result['complete'])
                self.assertTrue(result['rescanRequired'])
                # A sweep that is simply not usable is a plain RETRY: the room
                # may be fine, the recording was not.
                self.assertEqual(result['verdict'], 'RETRY')
                self.assertIn(result['failureReason'],
                              ('room_mismatch', 'movement_unconfirmed'))
                self.assertIsNone(result['pendingObject'])

    def test_short_recording_is_retried_without_blaming_the_room(self):
        room_scanner.yolo = object()
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        pose = {"available": True, "moved": True, "participantDetected": True,
                "mode": "pose", "score": 0.7}
        with patch('inference.room_scanner._laptop_motion', return_value=pose), \
             patch.object(room_scanner, '_yolo_detections', return_value=detections):
            result = room_scanner.analyze_180_recording(
                [panorama_frame(angle) for angle in (270, 300, 0, 90)],
                'recorded-short', require_laptop=True, laptop_frames=laptop_samples(True),
                references=self.recorded_references())
        self.assertFalse(result['complete'])
        self.assertEqual(result['verdict'], 'RETRY')
        self.assertEqual(result['failureReason'], 'recording_short')
        self.assertEqual(result['sampledFrames'], [])

    def test_finished_recording_blocks_repeated_prohibited_object(self):
        room_scanner.yolo = object()
        angles = (270, 285, 300, 315, 330, 345, 360, 375, 390, 405, 420, 450)
        pose = {"available": True, "moved": True, "participantDetected": True,
                "mode": "pose", "score": 0.7}
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        observation = [{"objectType": "additional phone", "confidence": 0.9}]
        with patch('inference.room_scanner._laptop_motion', return_value=pose), \
             patch.object(room_scanner, '_yolo_detections', return_value=detections), \
             patch.object(room_scanner, '_observations', return_value=observation):
            result = room_scanner.analyze_180_recording(
                [panorama_frame(angle) for angle in angles], 'recorded-object',
                require_laptop=True, laptop_frames=laptop_samples(True),
                references=self.recorded_references())
        self.assertFalse(result['complete'])
        self.assertFalse(result['postScanReport']['checks']['unauthorizedObjects'])
        self.assertEqual(result['objectTransition']['type'], 'DETECTED')
        # The sweep itself was fine, so this is a FLAG and never a room mismatch.
        self.assertEqual(result['verdict'], 'FLAG')
        self.assertEqual(result['failureReason'], 'remove_object')
        self.assertEqual(result['guideKey'], 'remove_object')
        self.assertIsNotNone(result['pendingObject'])
        self.assertEqual(result['pendingObject']['objectType'], 'additional phone')
        self.assertEqual(result['pendingObject']['action'], 'REMOVE_AND_RESCAN')
        self.assertIn('additional phone', result['message'])

    def test_prohibited_object_outranks_a_failed_sweep(self):
        room_scanner.yolo = object()
        pose = {"available": True, "moved": True, "participantDetected": True,
                "mode": "pose", "score": 0.7}
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        observation = [{"objectType": "second laptop", "confidence": 0.9}]
        with patch('inference.room_scanner._laptop_motion', return_value=pose), \
             patch.object(room_scanner, '_yolo_detections', return_value=detections), \
             patch.object(room_scanner, '_observations', return_value=observation):
            result = room_scanner.analyze_180_recording(
                [panorama_frame(270)] * 12, 'recorded-object-static',
                require_laptop=True, laptop_frames=laptop_samples(True),
                references=self.recorded_references())
        # The sweep also failed here, but the object still has to be named: the
        # candidate has to clear the room before any re-recording can pass.
        self.assertEqual(result['verdict'], 'FLAG')
        self.assertEqual(result['failureReason'], 'remove_object')
        self.assertFalse(result['postScanReport']['checks']['coverage'])
        self.assertIn('second laptop', result['message'])

    def test_pose_tracker_outage_does_not_fail_every_recording(self):
        # MediaPipe missing/loading/erroring is an infrastructure fault, not
        # evidence that the candidate is absent. Optical movement plus the
        # webcam person check must still be able to approve the sweep.
        room_scanner.yolo = object()
        angles = (270, 285, 300, 315, 330, 345, 360, 375, 390, 405, 420, 450)
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        for mode in ("optical_fallback", "pose_unavailable"):
            degraded = {"available": True, "moved": True, "score": 0.4, "mode": mode,
                        "participantDetected": None, "poseVerdict": None}
            with patch('inference.room_scanner._laptop_motion', return_value=degraded), \
                 patch.object(room_scanner, '_yolo_detections', return_value=detections):
                result = room_scanner.analyze_180_recording(
                    [panorama_frame(angle) for angle in angles], f'recording-{mode}',
                    require_laptop=True, laptop_frames=laptop_samples(True),
                    references=self.recorded_references())
            self.assertTrue(result['complete'], f'{mode}: {result}')
            self.assertEqual(result['verdict'], 'PASS')

    def test_pose_that_ran_and_saw_nobody_still_fails_the_person_gate(self):
        room_scanner.yolo = object()
        angles = (270, 285, 300, 315, 330, 345, 360, 375, 390, 405, 420, 450)
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        empty_room = {"available": True, "moved": True, "score": 0.4,
                      "mode": "optical_fallback", "participantDetected": None,
                      "poseVerdict": "no_participant"}
        with patch('inference.room_scanner._laptop_motion', return_value=empty_room), \
             patch.object(room_scanner, '_yolo_detections', return_value=detections):
            result = room_scanner.analyze_180_recording(
                [panorama_frame(angle) for angle in angles], 'recording-empty-webcam',
                require_laptop=True, laptop_frames=laptop_samples(True),
                references=self.recorded_references())
        self.assertFalse(result['complete'])
        self.assertFalse(result['postScanReport']['checks']['person'])
        self.assertEqual(result['failureReason'], 'laptop_motion_missing')

    def test_stationary_phone_never_completes(self):
        result = self.scan("still", [0] * 60)
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)

    def test_reference_similarity_scores_same_view_above_changed_view(self):
        first = room_scanner.decode_frame(panorama_frame(0))
        second = room_scanner.decode_frame(panorama_frame(180))
        _, first_gray, _ = room_scanner._prepare(first)
        _, second_gray, _ = room_scanner._prepare(second)
        reference = {"visualSignature": _visual_signature(first_gray),
                     "sceneDescriptor": _scene_descriptor(first_gray),
                     "featureDescriptor": _feature_descriptor(first_gray)}
        same = _reference_similarity(reference["visualSignature"], reference["sceneDescriptor"],
                                     reference["featureDescriptor"], reference)
        changed = _reference_similarity(_visual_signature(second_gray), _scene_descriptor(second_gray),
                                        _feature_descriptor(second_gray), reference)
        self.assertGreaterEqual(same, 0.95)
        self.assertGreater(same, changed)

    def test_360_compares_directional_views_with_initial_reference(self):
        def reference(step, angle):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            return {"step": step, "visualSignature": _visual_signature(gray),
                    "sceneDescriptor": _scene_descriptor(gray),
                    "featureDescriptor": _feature_descriptor(gray)}
        references = [reference("front", 0), reference("right", 90), reference("left", 270),
                      reference("bottom", 180), reference("desk", 30)]
        result = None
        room_scanner.yolo = object()
        with patch.object(room_scanner, "_yolo_detections", return_value=[
                {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]):
            for angle in range(0, 361, 30):
                result = room_scanner.analyze_360([panorama_frame(angle)], "matched-room",
                    [{"yaw": angle % 360}], references=references)
        self.assertTrue(result["sweepCovered"])
        self.assertTrue(result["complete"])
        self.assertEqual(result["postScanReport"]["result"], "PASS")
        self.assertEqual(len(result["sampledFrames"]), 8)
        self.assertEqual(result["similarityReport"]["result"], "PASS")
        self.assertGreaterEqual(result["similarityReport"]["overallSimilarity"], 0.6)
        self.assertEqual(result["similarityReport"]["sectorResults"][2]["matchedReference"], "right")

    def test_180_scan_requires_ordered_left_front_right_and_saved_review(self):
        def reference(step, angle):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            return {"step": step, "visualSignature": _visual_signature(gray),
                    "sceneDescriptor": _scene_descriptor(gray),
                    "featureDescriptor": _feature_descriptor(gray)}
        references = [reference("left", 270), reference("front", 0),
                      reference("right", 90), reference("bottom", 180), reference("desk", 30)]
        pose = {"available": True, "moved": True, "participantDetected": True,
                "multiplePersonsDetected": False, "mode": "pose", "score": 0.1}
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        room_scanner.yolo = object()
        result = None
        with patch("inference.room_scanner._laptop_motion", return_value=pose), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            for angle in (270, 300, 330, 0, 30, 60, 90):
                result = room_scanner.analyze_180([panorama_frame(angle)], "half-room",
                    [{"yaw": angle}], laptop_frames=laptop_samples(True), require_laptop=True,
                    references=references)
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)
        self.assertEqual(result["postScanReport"]["reviewedSectors"], 5)
        self.assertEqual(len(result["sampledFrames"]), 5)
        self.assertGreaterEqual(result["similarityReport"]["overallSimilarity"], 0.6)

    def test_180_scan_rejects_repeated_view_even_without_sensor(self):
        _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(0)))
        reference = {"step": "left", "visualSignature": _visual_signature(gray),
                     "sceneDescriptor": _scene_descriptor(gray),
                     "featureDescriptor": _feature_descriptor(gray)}
        for angle in (0, 0, 0, 0, 0):
            result = room_scanner.analyze_180([panorama_frame(angle)], "static-half",
                [{"yaw": angle}], references=[reference])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 20)
        missing = room_scanner.analyze_180([panorama_frame(30)], "no-sensor",
            [None], references=[reference])
        self.assertEqual(missing["coverage"], 20)
        self.assertEqual(missing["mode"], "visual_baseline")
        self.assertFalse(missing["complete"])

    def test_180_visual_fallback_uses_ordered_baseline_and_mediapipe_hand(self):
        def reference(step, angle):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            return {"step": step, "visualSignature": _visual_signature(gray),
                    "sceneDescriptor": _scene_descriptor(gray),
                    "featureDescriptor": _feature_descriptor(gray)}
        references = [reference("left", 270), reference("front", 0),
                      reference("right", 90), reference("bottom", 180), reference("desk", 30)]
        hand = {"available": True, "moved": True, "participantDetected": None,
                "handDetected": True, "mode": "hand", "score": 0.12,
                "motionSource": "mediapipe_hands"}
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]},
                      {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}]
        room_scanner.yolo = object()
        with patch("inference.room_scanner._laptop_motion", return_value=hand), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            for angle in (270, 285, 300, 315, 330, 345, 0, 15, 30, 45, 60, 75, 90):
                result = room_scanner.analyze_180([panorama_frame(angle)], "visual-half",
                    [None], laptop_frames=laptop_samples(True), require_laptop=True,
                    references=references)
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)
        self.assertEqual(result["mode"], "visual_baseline")
        self.assertGreaterEqual(result["motionEvidence"]["visualContinuity"], 4)

    def test_180_scan_cannot_pass_without_pose_or_visible_computer(self):
        def reference(step, angle):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            return {"step": step, "visualSignature": _visual_signature(gray),
                    "sceneDescriptor": _scene_descriptor(gray),
                    "featureDescriptor": _feature_descriptor(gray)}
        references = [reference("left", 270), reference("front", 0),
                      reference("right", 90), reference("bottom", 180), reference("desk", 30)]
        detections = [{"class_name": "person", "confidence": 0.9, "box": [10, 10, 80, 200]}]
        room_scanner.yolo = object()
        angles = (270, 300, 330, 0, 30, 60, 90)
        for label, pose in (("missing-pose", {"available": True, "moved": False,
                            "participantDetected": False, "mode": "pose_no_participant"}),
                            ("missing-computer", {"available": True, "moved": True,
                            "participantDetected": True, "mode": "pose"})):
            result = None
            with patch("inference.room_scanner._laptop_motion", return_value=pose), \
                 patch.object(room_scanner, "_yolo_detections", return_value=detections):
                for angle in angles:
                    result = room_scanner.analyze_180([panorama_frame(angle)], label,
                        [{"yaw": angle}], laptop_frames=laptop_samples(True),
                        require_laptop=True, references=references)
                    if result["rescanRequired"]:
                        break
            self.assertFalse(result["complete"])
            self.assertEqual(result["coverage"], 100)
            if label == "missing-computer":
                self.assertTrue(result["rescanRequired"])
                self.assertFalse(result["postScanReport"]["checks"]["computer"])

    def test_covered_sweep_waits_for_person_in_laptop_camera(self):
        def reference(step, angle):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            return {"step": step, "visualSignature": _visual_signature(gray),
                    "sceneDescriptor": _scene_descriptor(gray), "featureDescriptor": _feature_descriptor(gray)}
        references = [reference(step, angle) for step, angle in
                      (("front", 0), ("right", 90), ("left", 270), ("bottom", 180), ("desk", 30))]
        room_scanner.yolo = object()
        computer = {"class_name": "laptop", "confidence": 0.9, "box": [120, 80, 320, 230]}
        with patch.object(room_scanner, "_yolo_detections", side_effect=lambda image:
                          [computer] if image.shape[1] > 400 else []):
            result = None
            for angle in range(0, 361, 30):
                result = room_scanner.analyze_360([panorama_frame(angle)], "missing-person",
                    [{"yaw": angle % 360}], laptop_frames=laptop_samples(True),
                    require_laptop=True, references=references)
        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertFalse(result["postScanReport"]["checks"]["person"])
        self.assertEqual(result["postScanReport"]["result"], "FAIL")

    def test_covered_sweep_without_computer_requires_rescan(self):
        def reference(step, angle):
            _, gray, _ = room_scanner._prepare(room_scanner.decode_frame(panorama_frame(angle)))
            return {"step": step, "visualSignature": _visual_signature(gray),
                    "sceneDescriptor": _scene_descriptor(gray), "featureDescriptor": _feature_descriptor(gray)}
        references = [reference(step, angle) for step, angle in
                      (("front", 0), ("right", 90), ("left", 270), ("bottom", 180), ("desk", 30))]
        room_scanner.yolo = object()
        with patch.object(room_scanner, "_yolo_detections", return_value=[]):
            reviews = [room_scanner.analyze_360([panorama_frame(angle)], "missing-computer",
                [{"yaw": angle % 360}], references=references) for angle in range(0, 361, 30)]
        rejected = [item for item in reviews if item["rescanRequired"]]
        self.assertTrue(rejected)
        self.assertFalse(rejected[0]["complete"])
        self.assertFalse(rejected[0]["postScanReport"]["checks"]["computer"])

    def test_slow_inference_does_not_expire_same_batch_laptop_evidence(self):
        clock = [1000.0]
        def slow_detection(_image):
            clock[0] += 5.0
            return []
        with patch('inference.room_scanner.time.time', side_effect=lambda: clock[0]), \
                patch('inference.room_scanner._laptop_motion', return_value={
                    'available': True, 'moved': True, 'score': 0.4}), \
                patch.object(room_scanner, '_yolo_detections', side_effect=slow_detection):
            result = room_scanner.analyze_360(
                [panorama_frame(angle) for angle in (0, 30, 60, 90)], 'slow-batch',
                [{'yaw': angle} for angle in (0, 30, 60, 90)],
                laptop_frames=['paired-evidence'], require_laptop=True)
        self.assertGreater(result['coverage'], 13)
        self.assertNotEqual(result['guideKey'], 'laptop_motion_missing')

    def test_paused_laptop_gate_keeps_visual_baseline_current(self):
        with patch('inference.room_scanner._laptop_motion', return_value={
                'available': True, 'moved': False, 'score': 0.0}):
            self.scan('resume-baseline', [0], sensor=False)
            frame = panorama_frame(90)
            result = room_scanner.analyze_360([frame], 'resume-baseline',
                laptop_frames=['static'], require_laptop=True)
        state = room_scanner.scan_states['scan_resume-baseline']
        _, expected, _ = room_scanner._prepare(room_scanner.decode_frame(frame))
        self.assertTrue(np.array_equal(state['lastGray'], expected))
        self.assertLessEqual(result['coverage'], 13)

    def test_same_wall_with_claimed_orientation_does_not_count(self):
        frame = panorama_frame(0)
        result = None
        for angle in range(0, 361, 30):
            result = room_scanner.analyze_360([frame], "same-wall", [{"yaw": angle % 360}])
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)

    def test_turning_back_and_forth_does_not_accumulate_a_full_circle(self):
        angles = [0, 30, 60, 90, 60, 30, 0] * 5
        result = self.scan("oscillating", angles)
        self.assertFalse(result["complete"])
        self.assertLess(result["coverage"], 50)

    def test_half_sweep_stays_incomplete_then_full_sweep_closes(self):
        halfway = self.scan("real-turn", range(0, 181, 30))
        self.assertFalse(halfway["complete"])
        self.assertLess(halfway["coverage"], 100)
        complete = self.scan("real-turn", range(210, 361, 30))
        self.assertTrue(complete["sweepCovered"])
        self.assertFalse(complete["complete"])
        self.assertEqual(complete["coverage"], 87)
        self.assertTrue(all(sector["verified"] for sector in complete["sectors"]))

    def test_visual_fallback_requires_distinct_overlapping_scenes_and_loop(self):
        result = self.scan("visual-turn", range(0, 361, 20), sensor=False)
        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 87)

    def test_second_photo_cannot_reuse_first_view(self):
        first = room_scanner.analyze_step(panorama_frame(0), "front", "six-photo")
        self.assertTrue(first["valid"])
        second = room_scanner.analyze_step(panorama_frame(0), "left", "six-photo",
            prior_captures=[{"step": "front", "visualSignature": first["visualSignature"]}])
        self.assertFalse(second["valid"])
        self.assertEqual(second["guideKey"], "move_left_further")
        moved = room_scanner.analyze_step(panorama_frame(90), "left", "six-photo",
            prior_captures=[{"step": "front", "visualSignature": first["visualSignature"]}])
        self.assertTrue(moved["valid"])

    def test_strong_mobile_view_is_not_rejected_after_candidate_stops_moving(self):
        front = room_scanner.analyze_step(panorama_frame(0), "front", "cross-camera",
            laptop_frames=laptop_samples(False), require_laptop=True)
        self.assertTrue(front["valid"])
        prior = [{"step": "front", "visualSignature": front["visualSignature"],
                  "sceneDescriptor": front["sceneDescriptor"]}]
        still = room_scanner.analyze_step(panorama_frame(90), "left", "cross-camera",
            prior_captures=prior, laptop_frames=laptop_samples(False), require_laptop=True)
        self.assertTrue(still["valid"])
        self.assertTrue(still["mobileActionConfirmed"])
        moving = room_scanner.analyze_step(panorama_frame(96), "left", "cross-camera",
            prior_captures=prior, laptop_frames=laptop_samples(True), require_laptop=True)
        self.assertTrue(moving["valid"])

    def test_recompressed_exposure_changed_photo_is_still_a_duplicate(self):
        original = panorama_frame(0)
        front = room_scanner.analyze_step(original, "front", "near-duplicate")
        raw = base64.b64decode(original.split(",", 1)[1])
        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        adjusted = cv2.convertScaleAbs(image, alpha=1.04, beta=8)
        prior = [{"step": "front", "visualSignature": front["visualSignature"],
                  "sceneDescriptor": front["sceneDescriptor"]}]
        second = room_scanner.analyze_step(photo(adjusted), "left", "near-duplicate", prior_captures=prior)
        self.assertFalse(second["valid"])
        self.assertTrue(second["sameView"])

    def test_360_cannot_advance_with_static_laptop_camera(self):
        result = None
        for angle in range(0, 361, 30):
            result = room_scanner.analyze_360([panorama_frame(angle)], "static-laptop",
                [{"yaw": angle % 360}], laptop_frames=laptop_samples(False), require_laptop=True)
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)

    def test_normal_small_webcam_movement_is_detected(self):
        self.assertFalse(_laptop_motion(laptop_samples(False))["moved"])
        self.assertTrue(_laptop_motion(laptop_samples(True, pixels=2))["moved"])

    def test_pose_tracker_reports_missing_and_multiple_participants(self):
        if laptop_pose_tracker is None:
            self.skipTest("optional MediaPipe laptop pose tracker is unavailable")
        laptop_pose_tracker.retry_at = 0.0
        with patch.object(laptop_pose_tracker, "_detect_poses", return_value=[]), \
             patch.object(laptop_pose_tracker, "_detect_hand_tracks", return_value={}):
            missing = laptop_pose_tracker.evaluate_motion(laptop_samples(False))
        self.assertFalse(missing["participantDetected"])
        self.assertEqual(missing["personCount"], 0)

        pose = [(0.4, 0.4, 0.0)] * 33
        with patch.object(laptop_pose_tracker, "_detect_poses", return_value=[pose, pose]), \
             patch.object(laptop_pose_tracker, "_detect_hand_tracks", return_value={}):
            consecutive = laptop_pose_tracker.evaluate_motion(laptop_samples(False))
        self.assertTrue(consecutive["participantDetected"])
        self.assertFalse(consecutive["multiplePersonsDetected"])
        self.assertEqual(consecutive["personCount"], 1)

    def test_mediapipe_hand_motion_detects_moving_hand_but_not_static_hand(self):
        if laptop_pose_tracker is None:
            self.skipTest("MediaPipe laptop tracker is unavailable")
        laptop_pose_tracker.retry_at = 0.0
        moving = {"Right": [(0, 0.30, 0.40), (1, 0.36, 0.43), (2, 0.43, 0.47)]}
        still = {"Right": [(0, 0.30, 0.40), (1, 0.31, 0.405), (2, 0.305, 0.40)]}
        with patch.object(laptop_pose_tracker, "_detect_poses", return_value=[]), \
             patch.object(laptop_pose_tracker, "_detect_hand_tracks", return_value=moving):
            moved = laptop_pose_tracker.evaluate_motion(laptop_samples(False))
        self.assertTrue(moved["moved"])
        self.assertEqual(moved["mode"], "hand")
        self.assertEqual(moved["motionSource"], "mediapipe_hands")
        with patch.object(laptop_pose_tracker, "_detect_poses", return_value=[]), \
             patch.object(laptop_pose_tracker, "_detect_hand_tracks", return_value=still):
            static = laptop_pose_tracker.evaluate_motion(laptop_samples(False))
        self.assertFalse(static["moved"])

    def test_360_completes_with_distinct_views_and_repeated_laptop_movement(self):
        result = None
        for angle in range(0, 361, 30):
            result = room_scanner.analyze_360([panorama_frame(angle)], "moving-laptop",
                [{"yaw": angle % 360}], laptop_frames=laptop_samples(True), require_laptop=True)
        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 87)

    def test_360_not_visible_in_laptop_camera_still_completes(self):
        if laptop_pose_tracker is None:
            self.skipTest("optional MediaPipe laptop pose tracker is unavailable")
        # A candidate sweeping the room with the phone is routinely outside the
        # laptop webcam's view, so pose inference reports nobody. That is
        # inconclusive, not proof of stillness: treating it as "no movement"
        # deadlocked every such sweep at its first sector (1 of 8 / 12%).
        blind = {"available": True, "moved": False, "score": 0.0,
                 "pose_detected": False, "participantDetected": False,
                 "multiplePersonsDetected": False, "personCount": 0,
                 "mode": "pose_no_participant"}
        result = None
        with patch.object(laptop_pose_tracker, "evaluate_motion", return_value=dict(blind)):
            for angle in range(0, 361, 30):
                result = room_scanner.analyze_360([panorama_frame(angle)], "not-in-laptop-view",
                    [None], laptop_frames=laptop_samples(True), require_laptop=True)
        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 87)
        self.assertEqual(len([s for s in result["sectors"] if s["verified"]]), 8)

    def test_360_not_visible_and_static_laptop_still_cannot_advance(self):
        if laptop_pose_tracker is None:
            self.skipTest("optional MediaPipe laptop pose tracker is unavailable")
        # The same blind pose verdict must NOT turn a genuinely static laptop
        # camera into movement evidence.
        blind = {"available": True, "moved": False, "score": 0.0,
                 "pose_detected": False, "participantDetected": False,
                 "multiplePersonsDetected": False, "personCount": 0,
                 "mode": "pose_no_participant"}
        result = None
        with patch.object(laptop_pose_tracker, "evaluate_motion", return_value=dict(blind)):
            for angle in range(0, 361, 30):
                result = room_scanner.analyze_360([panorama_frame(angle)], "blind-and-static",
                    [None], laptop_frames=laptop_samples(False), require_laptop=True)
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)

    def test_random_noise_is_not_a_verified_room_view(self):
        noise = np.random.default_rng(7).integers(0, 256, (480, 640, 3), dtype=np.uint8)
        result = room_scanner.analyze_step(photo(noise), "front", "noise-photo")
        self.assertFalse(result["valid"])
        self.assertEqual(result["guideKey"], "image_invalid")

    def test_sensor_rejects_side_photo_without_turn(self):
        front = room_scanner.analyze_step(panorama_frame(0), "front", "view-angle",
            orientation={"yaw": 0, "pitch": 0})
        left = room_scanner.analyze_step(panorama_frame(90), "left", "view-angle",
            prior_captures=[{"step": "front", "visualSignature": front["visualSignature"],
                             "orientation": front["orientation"]}],
            orientation={"yaw": 4, "pitch": 0})
        self.assertFalse(left["valid"])
        self.assertTrue(left["wrongDirection"])

    def test_sensor_requires_right_view_on_opposite_side_of_front(self):
        front = room_scanner.analyze_step(panorama_frame(0), "front", "opposite-sides",
            orientation={"yaw": 0, "pitch": 0})
        left = room_scanner.analyze_step(panorama_frame(70), "left", "opposite-sides",
            prior_captures=[{"step": "front", "visualSignature": front["visualSignature"],
                             "sceneDescriptor": front["sceneDescriptor"], "orientation": front["orientation"]}],
            orientation={"yaw": 70, "pitch": 0})
        priors = [
            {"step": "front", "visualSignature": front["visualSignature"],
             "sceneDescriptor": front["sceneDescriptor"], "orientation": front["orientation"]},
            {"step": "left", "visualSignature": left["visualSignature"],
             "sceneDescriptor": left["sceneDescriptor"], "orientation": left["orientation"]},
        ]
        same_side = room_scanner.analyze_step(panorama_frame(140), "right", "opposite-sides",
            prior_captures=priors, orientation={"yaw": 140, "pitch": 0})
        self.assertFalse(same_side["valid"])
        self.assertTrue(same_side["wrongDirection"])
        opposite = room_scanner.analyze_step(panorama_frame(290), "right", "opposite-sides",
            prior_captures=priors, orientation={"yaw": 290, "pitch": 0})
        self.assertTrue(opposite["valid"])

    def test_laptop_camera_missing_uses_dedicated_failure_guide(self):
        # No webcam samples at all (denied camera) must be reported as a camera
        # problem, NOT as "movement could not be confirmed".
        result = room_scanner.analyze_step(panorama_frame(0), "left", "no-laptop-cam",
            laptop_frames=[], require_laptop=True)
        self.assertFalse(result["valid"])
        self.assertEqual(result["guideKey"], "laptop_camera_required")
        self.assertFalse(result["laptopMovement"]["available"])

    def test_sensor_rejects_bottom_without_tilt_change(self):
        front = room_scanner.analyze_step(panorama_frame(0), "front", "tilt-gate",
            orientation={"yaw": 0, "pitch": 0})
        prior = [{"step": "front", "visualSignature": front["visualSignature"],
                  "sceneDescriptor": front["sceneDescriptor"], "orientation": front["orientation"]}]
        # BOTTOM must tilt down; a distinct view at the same (level) pitch is not enough.
        level_bottom = room_scanner.analyze_step(panorama_frame(170), "bottom", "tilt-gate",
            prior_captures=prior, orientation={"yaw": 0, "pitch": 0})
        self.assertFalse(level_bottom["valid"])
        self.assertTrue(level_bottom["wrongDirection"])

    def test_five_steps_complete_in_spec_order(self):
        # FRONT, LEFT, RIGHT, BOTTOM, DESK -- each step verified in order
        # with distinct framing and laptop-confirmed movement for the turns.
        sequence = [
            ("front", 0, 0),
            ("left", 90, 0),
            ("right", 180, 0),
            ("bottom", 220, -40),
            ("desk", 300, 0),
        ]
        priors = []

        def capture(step, angle, pitch):
            frame = panorama_frame(angle)
            if step in ("bottom", "desk"):
                # These are separately framed vertical views, not another crop
                # of the horizontal panorama used for the side directions.
                rng = np.random.default_rng(200 if step == "bottom" else 300)
                scene = np.full((360, 640, 3), (165, 173, 181), dtype=np.uint8)
                for index in range(85):
                    x, y = int(rng.integers(0, 595)), int(rng.integers(0, 320))
                    color = tuple(int(value) for value in rng.integers(35, 225, 3))
                    cv2.rectangle(scene, (x, y), (x + 25, y + 20), color, -1)
                frame = photo(scene)
            result = room_scanner.analyze_step(frame, step, "five-order",
                prior_captures=priors, orientation={"yaw": angle % 360, "pitch": pitch},
                laptop_frames=laptop_samples(True), require_laptop=True)

            self.assertTrue(result["valid"], f"{step} should be valid: {result['guideKey']}")
            priors.append({"step": step, "visualSignature": result["visualSignature"],
                           "sceneDescriptor": result["sceneDescriptor"], "orientation": result["orientation"]})

        for step, angle, pitch in sequence:
            capture(step, angle, pitch)

        self.assertEqual([item["step"] for item in priors],
                         ["front", "left", "right", "bottom", "desk"])

    def test_object_blocks_360_until_removed_then_restarts_from_zero(self):
        calls = 0

        def detection(_frame):
            nonlocal calls
            calls += 1
            return [{"class_name": "cell phone", "confidence": 0.91, "box": [20, 20, 80, 100]}] if calls in (3, 4) else []

        with patch.object(room_scanner, "_yolo_detections", side_effect=detection):
            blocked = self.scan("object-restart", [0, 30, 60, 90])
            self.assertEqual(blocked["pendingObject"]["objectType"], "additional phone")
            self.assertFalse(blocked["complete"])
            self.assertTrue(blocked["sectors"][0]["verified"])
            self.assertFalse(blocked["sectors"][2]["verified"])

            # A single clean view is not enough to confirm removal.
            first_clean = self.scan("object-restart", [90])
            self.assertIsNotNone(first_clean["pendingObject"])
            self.assertFalse(first_clean["restarted"])

            # Three same-area clear frames are required before the restart.
            second_clean = self.scan("object-restart", [90])
            self.assertIsNotNone(second_clean["pendingObject"])
            restored = self.scan("object-restart", [90])
            self.assertIsNone(restored["pendingObject"])
            self.assertTrue(restored["restarted"])
            self.assertEqual(restored["coverage"], 0)
            self.assertEqual(restored["guideKey"], "scan_restarted")
            self.assertFalse(any(sector["verified"] for sector in restored["sectors"]))

            # The fresh sweep can complete like any other turn.
            complete = self.scan("object-restart", range(0, 361, 30))
            self.assertTrue(complete["sweepCovered"])
            self.assertFalse(complete["complete"])
            self.assertEqual(complete["coverage"], 87)

    def test_sensorless_small_camera_wiggle_is_not_a_new_direction(self):
        front_img = panorama_frame(0)
        front = room_scanner.analyze_step(front_img, "front", "sensorless-wiggle")
        self.assertTrue(front["valid"])
        raw = base64.b64decode(front_img.split(",", 1)[1])
        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        shifted = np.roll(image, 6, axis=1)
        small = room_scanner.analyze_step(photo(shifted), "left", "sensorless-wiggle",
            prior_captures=[{"step": "front", "visualSignature": front["visualSignature"],
                              "sceneDescriptor": front["sceneDescriptor"]}])
        self.assertFalse(small["valid"])
        self.assertTrue(small["sameView"] or small["wrongDirection"])
        true_turn = room_scanner.analyze_step(panorama_frame(90), "left", "sensorless-wiggle",
            prior_captures=[{"step": "front", "visualSignature": front["visualSignature"],
                              "sceneDescriptor": front["sceneDescriptor"]}])
        self.assertTrue(true_turn["valid"])

    def test_360_restart_batch_never_reports_complete(self):
        calls = 0

        def detection(_frame):
            nonlocal calls
            calls += 1
            return [{"class_name": "book", "confidence": 0.90, "box": [10, 10, 60, 80]}] if calls in (2, 3) else []

        with patch.object(room_scanner, "_yolo_detections", side_effect=detection):
            blocked = self.scan("restart-safety", [0, 30, 60, 90])
            self.assertIsNotNone(blocked["pendingObject"])
            self.assertFalse(blocked["complete"])

            # Three consecutive same-area clean views trigger the full reset.
            reset_batch = None
            for angle in (60, 60, 60):
                result = self.scan("restart-safety", [angle])
                if result["restarted"]:
                    reset_batch = result
                    break
            self.assertIsNotNone(reset_batch)
            self.assertTrue(reset_batch["restarted"])
            self.assertEqual(reset_batch["coverage"], 0)
            self.assertFalse(reset_batch["complete"])
            self.assertFalse(any(sector["verified"] for sector in reset_batch["sectors"]))

            # The next batch begins the fresh sweep and is still incomplete.
            resumed = self.scan("restart-safety", [90])
            self.assertFalse(resumed["restarted"])
            self.assertFalse(resumed["complete"])
            self.assertLess(resumed["coverage"], 100)

    def test_single_uncertain_object_frame_does_not_restart_the_scan(self):
        calls = 0

        def detection(_frame):
            nonlocal calls
            calls += 1
            return [{"class_name": "cell phone", "confidence": 0.76,
                     "box": [20, 20, 80, 100]}] if calls == 2 else []

        with patch.object(room_scanner, "_yolo_detections", side_effect=detection):
            result = self.scan("single-object-frame", [0, 30, 60, 90])
        self.assertIsNone(result["pendingObject"])
        self.assertFalse(result["restarted"])
        self.assertGreater(result["coverage"], 0)

    def test_object_removal_requires_clear_frames_from_same_area(self):
        calls = 0
        def detection(_frame):
            nonlocal calls
            calls += 1
            return [{"class_name": "book", "confidence": 0.9, "box": [10, 10, 60, 80]}] if calls <= 2 else []
        with patch.object(room_scanner, "_yolo_detections", side_effect=detection):
            blocked = self.scan("same-area", [0, 30])
            self.assertIsNotNone(blocked["pendingObject"])
            wrong_area = self.scan("same-area", [180, 210, 240, 270])
            self.assertIsNotNone(wrong_area["pendingObject"])
            self.assertFalse(wrong_area["restarted"])
            cleared = self.scan("same-area", [30, 30, 30])
            self.assertTrue(cleared["restarted"])
            self.assertEqual(cleared["objectTransition"]["type"], "CLEARED")

    def test_person_rendered_inside_laptop_screen_is_not_an_additional_person(self):
        detections = [
            {"class_name": "laptop", "confidence": 0.94, "box": [150, 80, 620, 430]},
            {"class_name": "person", "confidence": 0.89, "box": [15, 70, 145, 450]},
            {"class_name": "person", "confidence": 0.81, "box": [310, 145, 390, 285]},
        ]
        observations = room_scanner._observations(detections, (480, 640, 3))
        self.assertFalse(any(item["objectType"] == "additional person" for item in observations))

    def test_restart_stops_processing_old_frames_and_returns_exactly_zero(self):
        calls = 0

        def detection(_frame):
            nonlocal calls
            calls += 1
            return [{"class_name": "book", "confidence": 0.91,
                     "box": [20, 20, 100, 120]}] if calls <= 2 else []

        with patch.object(room_scanner, "_yolo_detections", side_effect=detection):
            blocked = room_scanner.analyze_360(
                [panorama_frame(0), panorama_frame(30)], "hard-restart",
                [{"yaw": 0}, {"yaw": 30}],
            )
            self.assertIsNotNone(blocked["pendingObject"])
            restarted = room_scanner.analyze_360(
                [panorama_frame(30), panorama_frame(30), panorama_frame(30), panorama_frame(120)], "hard-restart",
                [{"yaw": 30}, {"yaw": 30}, {"yaw": 30}, {"yaw": 120}],
            )
        self.assertTrue(restarted["restarted"])
        self.assertEqual(restarted["coverage"], 0)
        self.assertEqual(restarted["accumulatedSweep"], 0)
        self.assertEqual(restarted["samplesSeen"], 0)
        self.assertFalse(any(sector["verified"] for sector in restarted["sectors"]))

    def test_case1_same_front_image_for_all_five_steps(self):
        front_img = panorama_frame(0)
        res_front = room_scanner.analyze_step(front_img, "front", "sess-test1")
        self.assertTrue(res_front["valid"])
        priors = [{"step": "front", "visualSignature": res_front["visualSignature"], "sceneDescriptor": res_front["sceneDescriptor"]}]

        res_left = room_scanner.analyze_step(front_img, "left", "sess-test1", prior_captures=priors)
        self.assertFalse(res_left["valid"])
        self.assertTrue(res_left["sameView"])

        res_right = room_scanner.analyze_step(front_img, "right", "sess-test1", prior_captures=priors)
        self.assertFalse(res_right["valid"])
        self.assertTrue(res_right["sameView"])

        res_bottom = room_scanner.analyze_step(front_img, "bottom", "sess-test1", prior_captures=priors)
        self.assertFalse(res_bottom["valid"])
        self.assertTrue(res_bottom["sameView"])

        res_desk = room_scanner.analyze_step(front_img, "desk", "sess-test1", prior_captures=priors)
        self.assertFalse(res_desk["valid"])
        self.assertTrue(res_desk["sameView"])

    def test_case2_desk_corners_without_real_rotation_rejected(self):
        front_img = panorama_frame(0)
        res_front = room_scanner.analyze_step(front_img, "front", "sess-test2", orientation={"yaw": 0, "pitch": -20})
        self.assertTrue(res_front["valid"])
        priors = [{"step": "front", "visualSignature": res_front["visualSignature"],
                   "sceneDescriptor": res_front["sceneDescriptor"], "orientation": res_front["orientation"]}]

        corner_left = panorama_frame(5)
        res_left = room_scanner.analyze_step(corner_left, "left", "sess-test2", prior_captures=priors, orientation={"yaw": 5, "pitch": -20})
        self.assertFalse(res_left["valid"])
        self.assertTrue(res_left["wrongDirection"])

        angles = [0, 5, 10, 15, 20, 15, 10, 5, 0] * 4
        res_360 = self.scan("desk-sweep-small", angles)
        self.assertFalse(res_360["complete"])
        self.assertLess(res_360["coverage"], 40)

    def test_case3_stationary_candidate_waving_hands_cannot_verify_360(self):
        frames = []
        base = np.full((360, 640, 3), (180, 185, 190), dtype=np.uint8)
        cv2.putText(base, "Stationary Wall", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 30, 40), 2)
        for i in range(25):
            f = base.copy()
            cv2.rectangle(f, (200 + (i % 6) * 15, 120), (320 + (i % 6) * 15, 260), (40, 60, 90), -1)
            frames.append(photo(f))

        result = None
        for fr in frames:
            result = room_scanner.analyze_360([fr], "waving-hands")
        self.assertFalse(result["complete"])
        self.assertLess(result["coverage"], 50)

    def test_case4_complete_room_rotation_verifies_360(self):
        angles = list(range(0, 361, 30))
        result = None
        for ang in angles:
            result = room_scanner.analyze_360(
                [panorama_frame(ang)], "full-360-turn",
                [{"yaw": ang % 360, "pitch": 0}],
                laptop_frames=laptop_samples(True),
                require_laptop=True,
            )
        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 87)
        self.assertEqual(len([s for s in result["sectors"] if s["verified"]]), 8)

    def test_case5_orientation_unavailable_does_not_use_insecure_counter(self):
        stationary_frame = panorama_frame(0)
        result = None
        for _ in range(15):
            result = room_scanner.analyze_360([stationary_frame], "sensorless-still", [None])
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)
        self.assertEqual(result["guideKey"], "rotation_unconfirmed")

    def test_case6_laptop_small_head_movement_not_proof_of_360(self):
        result = None
        for ang in range(0, 361, 30):
            result = room_scanner.analyze_360(
                [panorama_frame(ang)], "still-laptop-session",
                [{"yaw": ang % 360, "pitch": 0}],
                laptop_frames=laptop_samples(False),
                require_laptop=True,
            )
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)

    def test_cropped_and_tilted_same_side_is_rejected_by_local_features(self):
        canvas = np.full((620, 900, 3), (205, 198, 184), dtype=np.uint8)
        rng = np.random.default_rng(91)
        for index in range(90):
            x, y = int(rng.integers(20, 820)), int(rng.integers(20, 540))
            color = tuple(int(v) for v in rng.integers(20, 230, 3))
            cv2.rectangle(canvas, (x, y), (x + 25 + index % 30, y + 18 + index % 25), color, -1)
        cv2.putText(canvas, "SAME ROOM SIDE", (170, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (20, 30, 40), 4)
        first_image = canvas[:480, :640]
        matrix = cv2.getRotationMatrix2D((320, 240), 2.0, 1.02)
        shifted = cv2.warpAffine(canvas[55:535, 70:710], matrix, (640, 480), borderMode=cv2.BORDER_REFLECT)

        front = room_scanner.analyze_step(photo(first_image), "front", "feature-duplicate")
        prior = [{"step": "front", "visualSignature": front["visualSignature"],
                  "sceneDescriptor": front["sceneDescriptor"],
                  "featureDescriptor": front["featureDescriptor"]}]
        repeated = room_scanner.analyze_step(photo(shifted), "left", "feature-duplicate",
                                             prior_captures=prior)
        self.assertFalse(repeated["valid"])
        self.assertTrue(repeated["sameView"])
        self.assertGreaterEqual(repeated["sceneSignals"][0]["featureMatches"], 28)
        # A changed phone yaw must not override the repeated visual content.
        prior[0]["orientation"] = {"yaw": 0, "pitch": 0}
        spoofed_turn = room_scanner.analyze_step(photo(shifted), "left", "feature-duplicate-yaw",
            prior_captures=prior, orientation={"yaw": 70, "pitch": 0})
        self.assertFalse(spoofed_turn["valid"])
        self.assertTrue(spoofed_turn["sameView"])

    def test_visual_scan_ignores_one_noisy_reverse_motion_estimate(self):
        calls = 0

        def motion(_prior, _current):
            nonlocal calls
            calls += 1
            return (40.0 if calls == 6 else -40.0, 0.0, 30, 0.10)

        result = None
        with patch("inference.room_scanner._orb_direction_displacement", side_effect=motion):
            for angle in range(0, 361, 20):
                result = room_scanner.analyze_360([panorama_frame(angle)], "visual-noise", [None])
        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 87)
        self.assertGreaterEqual(result["accumulatedSweep"], 330)

    def test_recorded_87_percent_pattern_closes_without_erasing_confirmed_sweep(self):
        calls = 0

        def motion(_prior, _current):
            nonlocal calls
            calls += 1
            # The real session reached about 306 degrees and then reported the
            # closing arc with the opposite visual sign.
            return (34.0 if calls > 15 else -34.0, 0.0, 30, 0.10)

        result = None
        with patch("inference.room_scanner._orb_direction_displacement", side_effect=motion):
            for angle in range(0, 361, 20):
                result = room_scanner.analyze_360([panorama_frame(angle)], "recorded-87-pattern", [None])

        self.assertTrue(result["sweepCovered"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["coverage"], 87)
        self.assertTrue(result["sectors"][7]["verified"])
        self.assertGreaterEqual(result["maxForwardSweep"], 300)
        self.assertTrue(result["closingEvidence"]["proved"])

    def test_sudden_static_front_replay_cannot_fill_front_right(self):
        calls = 0

        def motion(_prior, _current):
            nonlocal calls
            calls += 1
            if calls > 14:
                # A replay jump has no consecutive feature overlap.
                return 34.0, 0.0, 0, 0.0
            return -34.0, 0.0, 30, 0.10

        result = None
        with patch("inference.room_scanner._orb_direction_displacement", side_effect=motion):
            for angle in range(0, 281, 20):
                result = room_scanner.analyze_360([panorama_frame(angle)], "front-replay", [None])
            for _ in range(5):
                result = room_scanner.analyze_360([panorama_frame(0)], "front-replay", [None])

        self.assertFalse(result["complete"])
        self.assertFalse(result["sectors"][7]["verified"])
        self.assertLess(result["coverage"], 100)


if __name__ == "__main__":
    unittest.main()
