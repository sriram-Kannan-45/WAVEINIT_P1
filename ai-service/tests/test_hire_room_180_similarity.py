import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from inference.room_scanner import (
    room_scanner,
    _visual_signature,
    _scene_descriptor,
    _feature_descriptor,
    _reference_similarity,
    REFERENCE_MATCH_THRESHOLD,
)


def _encode_jpeg(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def _make_room_scene(seed: int, label: str) -> np.ndarray:
    """Generate a distinct room-like scene with textured objects and keypoints."""
    h, w = 360, 480
    img = np.full((h, w, 3), (180, 185, 190), dtype=np.uint8)
    rng = np.random.default_rng(seed)
    # Background patterns (walls/doors/shelves)
    for _ in range(30):
        x1 = int(rng.integers(10, w - 80))
        y1 = int(rng.integers(10, h - 80))
        box_w = int(rng.integers(30, 90))
        box_h = int(rng.integers(30, 90))
        col = tuple(int(c) for c in rng.integers(30, 220, 3))
        cv2.rectangle(img, (x1, y1), (x1 + box_w, y1 + box_h), col, -1)
    cv2.putText(img, label, (40, 70), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (20, 30, 40), 3)
    return img


def _make_laptop_samples():
    samples = []
    for i in range(5):
        frame = np.full((240, 320, 3), (120, 130, 140), dtype=np.uint8)
        cv2.rectangle(frame, (80 + i * 8, 100), (130 + i * 8, 180), (50, 60, 70), -1)
        samples.append(_encode_jpeg(frame))
    return samples


class TestHireRoom180Similarity(unittest.TestCase):
    def setUp(self):
        self.old_yolo = room_scanner.yolo
        room_scanner.yolo = object()  # mock YOLO detector available

    def tearDown(self):
        room_scanner.yolo = self.old_yolo

    def _build_references(self):
        left_img = _make_room_scene(101, "LEFT")
        front_img = _make_room_scene(102, "FRONT")
        right_img = _make_room_scene(103, "RIGHT")

        refs = []
        for step, img in (("left", left_img), ("front", front_img), ("right", right_img)):
            _, gray, _ = room_scanner._prepare(img)
            refs.append({
                "step": step,
                "visualSignature": _visual_signature(gray),
                "sceneDescriptor": _scene_descriptor(gray),
                "featureDescriptor": _feature_descriptor(gray),
            })
        return refs, left_img, front_img, right_img

    def test_threshold_is_0_50(self):
        self.assertEqual(REFERENCE_MATCH_THRESHOLD, 0.50)

    def test_same_room_recording_with_perspective_shift_and_lighting_passes(self):
        """Room recording with shift, zoom, exposure difference should pass >= 50% match."""
        refs, left_img, front_img, right_img = self._build_references()

        h, w = left_img.shape[:2]
        # Generate video frames from Left -> Front -> Right with shifts and lighting perturbations
        frames = []
        # Left frames (indices 0..3)
        for i in range(4):
            shifted = np.roll(left_img, i * 6, axis=1)
            perturbed = (shifted.astype(np.float32) * (0.85 + i * 0.03)).astype(np.uint8)
            frames.append(_encode_jpeg(perturbed))

        # Transition / Front frames (indices 4..7)
        for i in range(4):
            zoom = cv2.resize(front_img, (int(w * 1.05), int(h * 1.05)))[:h, :w]
            shifted = np.roll(zoom, (i - 2) * 5, axis=1)
            perturbed = (shifted.astype(np.float32) * (0.90 + i * 0.02)).astype(np.uint8)
            frames.append(_encode_jpeg(perturbed))

        # Right frames (indices 8..11)
        for i in range(4):
            shifted = np.roll(right_img, (i - 2) * 6, axis=1)
            blurred = cv2.GaussianBlur(shifted, (3, 3), 1.0)
            frames.append(_encode_jpeg(blurred))

        detections = [
            {"class_name": "person", "confidence": 0.92, "box": [10, 10, 80, 200]},
            {"class_name": "laptop", "confidence": 0.90, "box": [120, 80, 320, 230]},
        ]
        pose = {"available": True, "moved": True, "participantDetected": True, "mode": "pose", "score": 0.8}

        with patch("inference.room_scanner._laptop_motion", return_value=pose), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            result = room_scanner.analyze_180_recording(
                frames, "session-same-room",
                require_laptop=True,
                laptop_frames=_make_laptop_samples(),
                references=refs,
                reference_threshold=0.50,
            )

        self.assertTrue(result["complete"], f"Scan should pass: {result}")
        self.assertEqual(result["verdict"], "PASS")
        self.assertFalse(result["rescanRequired"])
        self.assertIn("180° Room Scan Verified", result["message"])

        views = result["similarityReport"]["views"]
        self.assertTrue(views["left"]["verified"], f"Left view: {views['left']}")
        self.assertTrue(views["front"]["verified"], f"Front view: {views['front']}")
        self.assertTrue(views["right"]["verified"], f"Right view: {views['right']}")
        self.assertGreaterEqual(views["left"]["similarity"], 0.50)
        self.assertGreaterEqual(views["front"]["similarity"], 0.50)
        self.assertGreaterEqual(views["right"]["similarity"], 0.50)

    def test_different_room_recording_fails(self):
        """Recording of a completely different room should fail < 50% match."""
        refs, _, _, _ = self._build_references()

        # Build recording from a totally different room (different seed / colors)
        diff_room_left = _make_room_scene(991, "OTHER_A")
        diff_room_front = _make_room_scene(992, "OTHER_B")
        diff_room_right = _make_room_scene(993, "OTHER_C")

        frames = []
        for img in (diff_room_left, diff_room_front, diff_room_right):
            for i in range(4):
                frames.append(_encode_jpeg(np.roll(img, i * 10, axis=1)))

        detections = [
            {"class_name": "person", "confidence": 0.92, "box": [10, 10, 80, 200]},
            {"class_name": "laptop", "confidence": 0.90, "box": [120, 80, 320, 230]},
        ]
        pose = {"available": True, "moved": True, "participantDetected": True, "mode": "pose", "score": 0.8}

        with patch("inference.room_scanner._laptop_motion", return_value=pose), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            result = room_scanner.analyze_180_recording(
                frames, "session-diff-room",
                require_laptop=True,
                laptop_frames=_make_laptop_samples(),
                references=refs,
                reference_threshold=0.50,
            )

        self.assertFalse(result["complete"])
        self.assertEqual(result["verdict"], "RETRY")
        self.assertTrue(result["rescanRequired"])
        self.assertEqual(result["failureReason"], "room_mismatch")

    def test_low_light_and_motion_blurred_recording_passes(self):
        """Low light (0.75x dim) and motion-blurred recording of the same room should still pass >= 50%."""
        refs, left_img, front_img, right_img = self._build_references()

        frames = []
        for base_img in (left_img, front_img, right_img):
            for i in range(4):
                # Apply dimming (low light) and motion blur
                dimmed = (base_img.astype(np.float32) * 0.75).astype(np.uint8)
                blurred = cv2.GaussianBlur(dimmed, (5, 5), 1.5)
                shifted = np.roll(blurred, i * 8, axis=1)
                frames.append(_encode_jpeg(shifted))

        detections = [
            {"class_name": "person", "confidence": 0.90, "box": [10, 10, 80, 200]},
            {"class_name": "laptop", "confidence": 0.90, "box": [120, 80, 320, 230]},
        ]
        pose = {"available": True, "moved": True, "participantDetected": True, "mode": "pose", "score": 0.8}

        with patch("inference.room_scanner._laptop_motion", return_value=pose), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            result = room_scanner.analyze_180_recording(
                frames, "session-dim-blur",
                require_laptop=True,
                laptop_frames=_make_laptop_samples(),
                references=refs,
                reference_threshold=0.50,
            )

        self.assertTrue(result["complete"], f"Dim & blur scan should pass: {result}")
        views = result["similarityReport"]["views"]
        self.assertGreaterEqual(views["left"]["similarity"], 0.50)
        self.assertGreaterEqual(views["front"]["similarity"], 0.50)
        self.assertGreaterEqual(views["right"]["similarity"], 0.50)

    def test_partial_failure_reports_section_breakdown(self):
        """When 1 of 3 views fails, result message specifies exactly which view failed and percentages."""
        refs, left_img, front_img, _ = self._build_references()

        # Left and Front match, but Right is completely different scene
        unmatched_right = _make_room_scene(888, "WRONG_RIGHT")

        frames = []
        for i in range(4):
            frames.append(_encode_jpeg(np.roll(left_img, i * 6, axis=1)))
        for i in range(4):
            frames.append(_encode_jpeg(np.roll(front_img, i * 6, axis=1)))
        for i in range(4):
            frames.append(_encode_jpeg(np.roll(unmatched_right, i * 6, axis=1)))

        detections = [
            {"class_name": "person", "confidence": 0.92, "box": [10, 10, 80, 200]},
            {"class_name": "laptop", "confidence": 0.90, "box": [120, 80, 320, 230]},
        ]
        pose = {"available": True, "moved": True, "participantDetected": True, "mode": "pose", "score": 0.8}

        with patch("inference.room_scanner._laptop_motion", return_value=pose), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            result = room_scanner.analyze_180_recording(
                frames, "session-partial",
                require_laptop=True,
                laptop_frames=_make_laptop_samples(),
                references=refs,
                reference_threshold=0.50,
            )

        self.assertFalse(result["complete"])
        self.assertEqual(result["verdict"], "RETRY")
        self.assertIn("2/3 views verified", result["message"])
        self.assertIn("Right", result["message"])
        self.assertIn("rescan the Right side", result["message"])
        self.assertIn("2/3", result["taMessage"])
        self.assertIn("வலது", result["taMessage"])

    def test_duplicate_stationary_and_blurred_front_passes_cleanly(self):
        """Duplicate stationary frames at left and motion-blurred front frames during sweep must pass."""
        refs, left_img, front_img, right_img = self._build_references()

        frames = []
        # 5 duplicate stationary frames at Left (user holding phone before turning)
        for _ in range(5):
            frames.append(_encode_jpeg(left_img))

        # 2 motion-blurred Front frames (camera panning through front)
        blurred_front_1 = cv2.GaussianBlur(front_img, (15, 15), 5.0)
        blurred_front_2 = cv2.GaussianBlur(front_img, (11, 11), 3.5)
        frames.append(_encode_jpeg(blurred_front_1))
        frames.append(_encode_jpeg(blurred_front_2))

        # 5 frames at Right
        for i in range(5):
            shifted = np.roll(right_img, i * 4, axis=1)
            frames.append(_encode_jpeg(shifted))

        detections = [
            {"class_name": "person", "confidence": 0.92, "box": [10, 10, 80, 200]},
            {"class_name": "laptop", "confidence": 0.90, "box": [120, 80, 320, 230]},
        ]
        pose = {"available": True, "moved": True, "participantDetected": True, "mode": "pose", "score": 0.8}

        with patch("inference.room_scanner._laptop_motion", return_value=pose), \
             patch.object(room_scanner, "_yolo_detections", return_value=detections):
            result = room_scanner.analyze_180_recording(
                frames, "session-dup-blur",
                require_laptop=True,
                laptop_frames=_make_laptop_samples(),
                references=refs,
                reference_threshold=0.50,
            )

        self.assertTrue(result["complete"], f"Scan should pass: {result}")
        self.assertEqual(result["verdict"], "PASS")
        self.assertFalse(result["rescanRequired"])
        self.assertIn("180° Room Scan Verified", result["message"])

        views = result["similarityReport"]["views"]
        self.assertTrue(views["left"]["verified"], f"Left view: {views['left']}")
        self.assertTrue(views["front"]["verified"], f"Front view: {views['front']}")
        self.assertTrue(views["right"]["verified"], f"Right view: {views['right']}")
        self.assertGreaterEqual(views["left"]["similarity"], 0.50)
        self.assertGreaterEqual(views["front"]["similarity"], 0.50)
        self.assertGreaterEqual(views["right"]["similarity"], 0.50)


if __name__ == "__main__":
    unittest.main()
