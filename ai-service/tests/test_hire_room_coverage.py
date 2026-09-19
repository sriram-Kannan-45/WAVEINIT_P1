import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from inference.room_scanner import room_scanner, _laptop_motion


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

    def tearDown(self):
        room_scanner.yolo = self.old_yolo
        room_scanner.scan_states.clear()

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

    def test_laptop_motion_supports_new_mobile_view_but_static_webcam_rejects_it(self):
        front = room_scanner.analyze_step(panorama_frame(0), "front", "cross-camera",
            laptop_frames=laptop_samples(False), require_laptop=True)
        self.assertTrue(front["valid"])
        prior = [{"step": "front", "visualSignature": front["visualSignature"],
                  "sceneDescriptor": front["sceneDescriptor"]}]
        still = room_scanner.analyze_step(panorama_frame(90), "left", "cross-camera",
            prior_captures=prior, laptop_frames=laptop_samples(False), require_laptop=True)
        self.assertFalse(still["valid"])
        self.assertEqual(still["guideKey"], "movement_unconfirmed")
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

    def test_360_completes_with_distinct_views_and_repeated_laptop_movement(self):
        result = None
        for angle in range(0, 361, 30):
            result = room_scanner.analyze_360([panorama_frame(angle)], "moving-laptop",
                [{"yaw": angle % 360}], laptop_frames=laptop_samples(True), require_laptop=True)
        self.assertTrue(result["complete"])
        self.assertEqual(result["coverage"], 100)

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

    def test_extra_phone_blocks_only_its_sector_until_rescanned(self):
        calls = 0

        def detection(_frame):
            nonlocal calls
            calls += 1
            return [{"class_name": "cell phone", "confidence": 0.91, "box": [20, 20, 80, 100]}] if calls == 4 else []

        with patch.object(room_scanner, "_yolo_detections", side_effect=detection):
            blocked = self.scan("object-rescan", [0, 30, 60, 90])
            self.assertEqual(blocked["pendingObject"]["objectType"], "additional phone")
            self.assertTrue(blocked["sectors"][0]["verified"])
            self.assertFalse(blocked["sectors"][2]["verified"])
            first_clean = self.scan("object-rescan", [90])
            self.assertIsNotNone(first_clean["pendingObject"])
            cleared = self.scan("object-rescan", [90])
            self.assertIsNone(cleared["pendingObject"])
            self.assertTrue(cleared["sectors"][2]["verified"])
            self.assertTrue(cleared["sectors"][0]["verified"])


if __name__ == "__main__":
    unittest.main()
