import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from inference.room_scanner import room_scanner, _laptop_motion, laptop_pose_tracker


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

    def test_stationary_phone_never_completes(self):
        result = self.scan("still", [0] * 60)
        self.assertFalse(result["complete"])
        self.assertLessEqual(result["coverage"], 13)

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
        self.assertTrue(complete["complete"])
        self.assertEqual(complete["coverage"], 100)
        self.assertTrue(all(sector["verified"] for sector in complete["sectors"]))

    def test_visual_fallback_requires_distinct_overlapping_scenes_and_loop(self):
        result = self.scan("visual-turn", range(0, 361, 20), sensor=False)
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)

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
        with patch.object(laptop_pose_tracker, "_detect_poses", return_value=[]):
            missing = laptop_pose_tracker.evaluate_motion(laptop_samples(False))
        self.assertFalse(missing["participantDetected"])
        self.assertEqual(missing["personCount"], 0)

        pose = [(0.4, 0.4, 0.0)] * 33
        with patch.object(laptop_pose_tracker, "_detect_poses", return_value=[pose, pose]):
            multiple = laptop_pose_tracker.evaluate_motion(laptop_samples(False))
        self.assertTrue(multiple["participantDetected"])
        self.assertTrue(multiple["multiplePersonsDetected"])
        self.assertEqual(multiple["personCount"], 2)

    def test_360_completes_with_distinct_views_and_repeated_laptop_movement(self):
        result = None
        for angle in range(0, 361, 30):
            result = room_scanner.analyze_360([panorama_frame(angle)], "moving-laptop",
                [{"yaw": angle % 360}], laptop_frames=laptop_samples(True), require_laptop=True)
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)

    def test_360_not_visible_in_laptop_camera_still_completes(self):
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
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)
        self.assertEqual(len([s for s in result["sectors"] if s["verified"]]), 8)

    def test_360_not_visible_and_static_laptop_still_cannot_advance(self):
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
            result = room_scanner.analyze_step(panorama_frame(angle), step, "five-order",
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

            # Second clean view confirms removal -> the ENTIRE sweep restarts.
            restored = self.scan("object-restart", [90])
            self.assertIsNone(restored["pendingObject"])
            self.assertTrue(restored["restarted"])
            self.assertEqual(restored["coverage"], 0)
            self.assertEqual(restored["guideKey"], "scan_restarted")
            self.assertFalse(any(sector["verified"] for sector in restored["sectors"]))

            # The fresh sweep can complete like any other turn.
            complete = self.scan("object-restart", range(0, 361, 30))
            self.assertTrue(complete["complete"])
            self.assertEqual(complete["coverage"], 100)

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

            # A single clean view confirms removal and triggers the full reset.
            reset_batch = self.scan("restart-safety", [90])
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
                [panorama_frame(60), panorama_frame(90), panorama_frame(120)], "hard-restart",
                [{"yaw": 60}, {"yaw": 90}, {"yaw": 120}],
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
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)
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
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)
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

        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)
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
