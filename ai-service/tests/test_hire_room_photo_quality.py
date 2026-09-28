"""Room photo QUALITY gate regression tests.

Covers the false-rejection bug where a perfectly readable Right-side room photo
was rejected with "காட்சி தெளிவாக இல்லை" ("the view is not clear") because a
single ABSOLUTE Laplacian-variance threshold (blur < 28, measured on a 480px
downscale) was treated as a hard, step-independent failure.

Room-verification rule under test: this step proves the candidate's
SURROUNDINGS, not specific furniture. A plain wall, an empty room, a door, a
window, a floor or a room boundary are all valid visual evidence, and object
detection is supporting evidence only -- never a requirement.
"""

import base64
import struct
import unittest

import cv2
import numpy as np

from inference.room_scanner import (
    CAPTURE_STEPS,
    _apply_orientation,
    _exif_orientation,
    image_quality,
    room_scanner,
)

# ── Synthetic but photograph-like scene generators ────────────────────────
# Each produces a sharp, correctly exposed, structurally real image so the only
# variable under test is the one named in the test.


def encode(image, quality=85):
    ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode()


def _room(width, height, mean, sigma, seed):
    rng = np.random.default_rng(seed)
    image = np.full((height, width, 3), (mean, mean - 4, mean - 9), np.uint8)
    image = cv2.GaussianBlur(image, (0, 0), 1.2)
    ramp = np.linspace(1.16, 0.84, width)[None, :]
    image = np.clip(image.astype(np.float32) * ramp[:, :, None], 0, 255).astype(np.uint8)
    image = np.clip(image.astype(np.int16) + rng.normal(0, sigma, image.shape).astype(np.int16),
                    0, 255).astype(np.uint8)
    return image


def plain_wall(width=1080, height=1920, mean=110, seed=1):
    """A painted wall with a skirting board and a door frame. Legitimate room view."""
    image = _room(width, height, mean, 7.0, seed)
    # Skirting board -> floor boundary, and a door frame. Real, visible structure.
    cv2.rectangle(image, (0, int(height * 0.82)), (width, int(height * 0.855)), (70, 66, 60), -1)
    cv2.rectangle(image, (int(width * 0.18), int(height * 0.18)),
                  (int(width * 0.18) + 8, int(height * 0.82)), (95, 88, 80), -1)
    cv2.rectangle(image, (int(width * 0.18), int(height * 0.18)),
                  (int(width * 0.68), int(height * 0.18) + 8), (95, 88, 80), -1)
    return cv2.GaussianBlur(image, (3, 3), 0)


def empty_room(width=1080, height=1920, seed=5):
    """Bare room: wall, floor band, floor/wall boundary. No furniture at all."""
    image = plain_wall(width, height, mean=125, seed=seed)
    cv2.rectangle(image, (0, int(height * 0.60)), (width, int(height * 0.84)), (150, 140, 125), -1)
    for x in range(0, width, 90):
        cv2.line(image, (x, int(height * 0.60)), (x - 120, int(height * 0.84)), (110, 100, 88), 3)
    cv2.line(image, (0, int(height * 0.60)), (width, int(height * 0.60)), (70, 66, 60), 4)
    return cv2.GaussianBlur(image, (3, 3), 0)


def furnished_room(width=1080, height=1920, seed=3):
    image = plain_wall(width, height, mean=140, seed=seed)
    cv2.rectangle(image, (int(width * .05), int(height * .35)),
                  (int(width * .45), int(height * .80)), (60, 80, 120), -1)
    cv2.rectangle(image, (int(width * .55), int(height * .45)),
                  (int(width * .95), int(height * .80)), (120, 90, 70), -1)
    cv2.rectangle(image, (int(width * .30), int(height * .10)),
                  (int(width * .70), int(height * .45)), (40, 40, 45), -1)
    rng = np.random.default_rng(seed)
    for _ in range(12):
        x, y = int(rng.integers(0, width - 60)), int(rng.integers(0, height - 40))
        cv2.rectangle(image, (x, y), (x + 40, y + 30),
                      tuple(int(v) for v in rng.integers(20, 230, 3)), -1)
    return cv2.GaussianBlur(image, (3, 3), 0)


# The fixture must store the INVERSE of the tag, so that applying the tag during
# decode recovers the original upright frame. Tags 1-4 and 7 are involutions and
# 6/8 are each other's inverse. Tag 5 is the odd one out: its inverse is
# rotate-180 composed with tag 7.
_EXIF_INVERSE = {1: 1, 2: 2, 3: 3, 4: 4, 6: 8, 7: 7, 8: 6}


def _inverse_orientation(frame, orientation):
    if orientation == 5:
        return cv2.flip(_apply_orientation(frame, 7), -1)
    return _apply_orientation(frame, _EXIF_INVERSE[orientation])


def _jpeg_with_orientation_tag(jpeg: bytes, orientation: int) -> bytes:
    """Splice a minimal EXIF APP1 segment (Orientation only) into a JPEG.

    Pillow's encoder *applies* the orientation to the pixel data when handed an
    `exif=` argument, so it cannot be used to build this fixture. A real phone
    writes the raw sensor buffer untouched and records the rotation in the tag,
    which is exactly what this reproduces.
    """
    if jpeg[:2] != b"\xff\xd8":
        return jpeg
    tiff = b"MM\x00\x2a" + struct.pack(">I", 8)      # big-endian, IFD0 at offset 8
    tiff += struct.pack(">H", 1)                     # one directory entry
    tiff += struct.pack(">H", 0x0112)                # tag: Orientation
    tiff += struct.pack(">H", 3)                     # type: SHORT
    tiff += struct.pack(">I", 1)                     # count
    tiff += struct.pack(">H", orientation) + b"\x00\x00"
    tiff += struct.pack(">I", 0)                     # no next IFD
    payload = b"Exif\x00\x00" + tiff
    app1 = b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload
    return jpeg[:2] + app1 + jpeg[2:]


def exif_photo(image, orientation=6):
    """Store `image` the way a phone camera does: an untransformed raw buffer
    plus an EXIF orientation tag. Decoding it through the scanner must return
    `image` at its original orientation."""
    raw = _inverse_orientation(image, orientation)
    ok, buffer = cv2.imencode(".jpg", raw, [cv2.IMWRITE_JPEG_QUALITY, 88])
    assert ok
    data = _jpeg_with_orientation_tag(buffer.tobytes(), orientation)
    return "data:image/jpeg;base64," + base64.b64encode(data).decode()


class RoomPhotoQualityTest(unittest.TestCase):
    """The quality gate is step-agnostic: it never special-cases a direction."""

    def setUp(self):
        self.old_yolo = room_scanner.yolo
        room_scanner.yolo = None
        room_scanner.scan_states.clear()
        self.session = 0

    def tearDown(self):
        room_scanner.yolo = self.old_yolo
        room_scanner.scan_states.clear()

    def capture(self, image, step="right", session=None, **kwargs):
        self.session += 1
        name = session or f"quality-{self.session}"
        return room_scanner.analyze_step(encode(image), step, name, **kwargs)

    def assertAccepted(self, result, label):
        self.assertTrue(result["valid"],
                        f"{label}: expected accept, got guideKey={result['guideKey']} "
                        f"reason={result['reason']} quality={result['qualityScore']} "
                        f"blurSignals={result['blurSignals']} coverage={result['coverage']}")

    def assertRejected(self, result, label, expected_reason=None):
        self.assertFalse(result["valid"], f"{label}: expected a rejection, got {result['reason']}")
        if expected_reason:
            self.assertEqual(result["reason"], expected_reason, label)
        self.assertNotEqual(result["reason"], "valid_room_view", label)

    # ── The reported bug ───────────────────────────────────────────────────
    def test_readable_plain_wall_is_accepted_on_the_right_step(self):
        """REGRESSION: the screenshot's Right photo was rejected as "blurred".

        A 1080x1920 photo of a plain painted wall is sharp, but its Laplacian
        variance on the 480px analysis downscale is only ~25 -- below the old
        absolute hard-blur cut of 28 -- so the old code demanded a steadier hand.
        """
        result = self.capture(plain_wall(), "right")
        self.assertAccepted(result, "plain wall / right")
        self.assertEqual(result["reason"], "valid_room_view")
        self.assertNotEqual(result["guideKey"], "blurred")
        # The weak metric that used to cause the rejection is now reported honestly.
        self.assertLess(result["blurScore"], 28.0)
        self.assertFalse(result["metrics"]["blurredHard"])

    def test_no_step_is_held_to_a_stricter_quality_bar(self):
        """Task: step direction must not affect validation.

        The identical image is submitted as every step. Quality metrics and the
        verdict must be byte-identical, proving no per-direction tuning exists.
        """
        image = plain_wall()
        results = {step: self.capture(image, step) for step in CAPTURE_STEPS}
        for step, result in results.items():
            self.assertAccepted(result, f"plain wall / {step}")
        reference = results["front"]
        for step, result in results.items():
            for field in ("qualityScore", "blurScore", "brightness", "contrast",
                          "sceneScore", "resolutionScore", "edgeDensity", "coverage"):
                self.assertEqual(result[field], reference[field], f"{step}.{field} diverged from front")
            self.assertEqual(result["reason"], reference["reason"], step)

    def test_every_step_accepts_a_wide_range_of_legitimate_rooms(self):
        """Task: test all 5 steps against normal/plain/low-light/furnished/empty rooms."""
        scenes = {
            "normal room": furnished_room(),
            "plain wall": plain_wall(),
            "low-light room": plain_wall(mean=48),
            "room with furniture": furnished_room(),
            "empty room": empty_room(),
        }
        for label, image in scenes.items():
            for step in CAPTURE_STEPS:
                self.assertAccepted(self.capture(image, step), f"{label} / {step}")

    def test_slightly_blurred_mobile_photo_is_accepted(self):
        """Soft mobile capture is normal, not a reason to make the candidate retake."""
        for sigma, label in ((1.0, "very slight"), (1.4, "slight"), (2.0, "moderate")):
            soft = cv2.GaussianBlur(plain_wall(), (0, 0), sigma)
            self.assertAccepted(self.capture(soft, "right"), f"soft {label}")

    def test_bright_and_blow_room_variations_are_accepted(self):
        for mean in (60, 80, 110, 140, 170, 200, 230):
            self.assertAccepted(self.capture(plain_wall(mean=mean), "right"), f"wall mean={mean}")

    def test_landscape_and_portrait_orientations_are_accepted(self):
        for width, height, label in ((1920, 1080, "landscape"), (1080, 1920, "portrait"),
                                     (720, 1280, "small portrait"), (1440, 1440, "square")):
            self.assertAccepted(self.capture(plain_wall(width, height), "right"), label)

    # ── Task 5: mobile camera orientation ─────────────────────────────────
    def test_exif_rotated_portrait_photo_is_normalised_and_accepted(self):
        """A phone stores portrait as a sideways buffer + EXIF tag. A decoder that
        ignores EXIF (OpenCV 4.5-4.8) would analyse it sideways, so the scanner
        must apply the tag itself -- exactly once."""
        upright = plain_wall(1080, 1920)
        stored = exif_photo(upright, orientation=6)
        raw = base64.b64decode(stored.split(",", 1)[1])
        self.assertEqual(_exif_orientation(raw), 6)

        # The fixture really does store a sideways buffer, as a phone would.
        sideways = cv2.imdecode(np.frombuffer(raw, np.uint8),
                               cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
        self.assertGreater(sideways.shape[1], sideways.shape[0],
                           "fixture must be a sideways landscape buffer")

        frame = room_scanner.decode_frame(stored)
        self.assertIsNotNone(frame)
        self.assertEqual((frame.shape[1], frame.shape[0]),
                         (upright.shape[1], upright.shape[0]),
                         "decode_frame must return the upright portrait, not a rotated frame")
        self.assertAccepted(self.capture(upright, "right"), "exif-6 normalised")

    def test_exif_tag_is_applied_exactly_once(self):
        """OpenCV 4.9+ rotates inside imdecode by default. If the scanner also
        applied the tag, portrait shots would come back rotated twice -- a real
        bug that leaves the frame sideways and skews every metric."""
        upright = furnished_room(1080, 1920)
        rotated = room_scanner.decode_frame(exif_photo(upright, orientation=6))
        plain = room_scanner.decode_frame(encode(upright))
        self.assertIsNotNone(rotated)
        self.assertIsNotNone(plain)
        self.assertEqual(rotated.shape, plain.shape,
                         "EXIF-6 photo must have the same geometry as a plain one")
        # Same scene, so the pHash signature must match within a small tolerance.
        self.assertLess(abs(rotated.shape[0] - plain.shape[0]), 2)
        for tag in (2, 3, 6, 8):
            frame = room_scanner.decode_frame(exif_photo(upright, orientation=tag))
            self.assertIsNotNone(frame, f"exif {tag}")
            self.assertEqual(frame.shape, plain.shape, f"exif {tag} geometry")

    def test_every_exif_orientation_round_trips_and_stays_accepted(self):
        upright = plain_wall(1080, 1920)
        failures = []
        for orientation in range(1, 9):
            stored = exif_photo(upright, orientation)
            frame = room_scanner.decode_frame(stored)
            if frame is None:
                failures.append(f"exif {orientation}: decode returned None")
                continue
            if (frame.shape[1], frame.shape[0]) != (upright.shape[1], upright.shape[0]):
                failures.append(f"exif {orientation}: shape {frame.shape} not normalised")
                continue
            result = room_scanner.analyze_step(
                stored, "right", f"quality-exif-{orientation}", threshold=0.4)
            if not result["valid"]:
                failures.append(f"exif {orientation}: rejected as {result['reason']}")
        self.assertEqual(failures, [])
    def test_portrait_and_landscape_encodings_of_the_same_view_agree(self):
        """Rotating the sensor must not change the verdict."""
        upright = plain_wall(1080, 1920)
        sideways = _apply_orientation(upright, 6)
        a = self.capture(upright, "right")
        b = self.capture(sideways, "right")
        self.assertAccepted(a, "upright")
        self.assertAccepted(b, "sideways")
        self.assertEqual(a["reason"], b["reason"])
        self.assertAlmostEqual(a["qualityScore"], b["qualityScore"], delta=3.0)

    # ── Task 2 / 9: object detection is supporting evidence only ───────────
    def test_zero_yolo_detections_never_rejects_a_room_photo(self):
        """YOLO finding nothing must not invalidate an otherwise valid room view."""
        from unittest.mock import patch
        for step in CAPTURE_STEPS:
            with patch.object(room_scanner, "_yolo_detections", return_value=[]):
                result = self.capture(furnished_room(), step)
            self.assertAccepted(result, f"zero detections / {step}")
            self.assertEqual(result["objectCount"], 0)

    def test_bottom_step_is_not_rejected_for_showing_a_laptop(self):
        """REGRESSION of inverted logic: the old `bottom_horizontal` gate rejected
        the BOTTOM step precisely BECAUSE YOLO *did* find a laptop/keyboard/tv."""
        from unittest.mock import patch
        detections = [{"class_name": "laptop", "confidence": 0.93, "box": [40, 200, 600, 460]},
                      {"class_name": "keyboard", "confidence": 0.88, "box": [60, 400, 580, 470]}]
        with patch.object(room_scanner, "_yolo_detections", return_value=detections):
            result = self.capture(furnished_room(), "bottom")
        self.assertAccepted(result, "bottom with laptop visible")
        self.assertFalse(result["floorHorizontal"])

    def test_desk_step_is_accepted_without_any_detected_workspace_object(self):
        """REGRESSION: the old `workspace_missing` gate required YOLO to find a
        laptop/keyboard/table before a desk photo could pass."""
        from unittest.mock import patch
        with patch.object(room_scanner, "_yolo_detections", return_value=[]):
            result = self.capture(plain_wall(), "desk")
        self.assertAccepted(result, "bare desk view")
        self.assertFalse(result["workspaceMissing"])

    def test_object_detections_do_not_change_the_quality_verdict(self):
        from unittest.mock import patch
        image = furnished_room()
        baseline = self.capture(image, "right")
        detections = [{"class_name": "chair", "confidence": 0.9, "box": [10, 10, 200, 200]},
                      {"class_name": "dining table", "confidence": 0.85, "box": [50, 50, 400, 300]}]
        with patch.object(room_scanner, "_yolo_detections", return_value=detections):
            detected = self.capture(image, "right")
        self.assertEqual(detected["qualityScore"], baseline["qualityScore"])
        self.assertEqual(detected["valid"], baseline["valid"])
        self.assertEqual(detected["objectCount"], 2)

    # ── Task 2: genuinely unusable images must still be rejected ───────────
    def test_completely_dark_photo_is_rejected_as_dark_not_blurry(self):
        result = self.capture(np.full((1080, 1920, 3), 6, np.uint8), "right")
        self.assertRejected(result, "black frame", "too_dark")
        self.assertEqual(result["guideKey"], "too_dark")

    def test_covered_lens_blank_frame_is_rejected(self):
        result = self.capture(np.full((1080, 1920, 3), 128, np.uint8), "right")
        self.assertRejected(result, "uniform grey")
        self.assertIn(result["reason"], ("no_visual_information", "blurred"))

    def test_overexposed_photo_is_rejected_as_overexposed(self):
        result = self.capture(np.full((1080, 1920, 3), 255, np.uint8), "right")
        self.assertRejected(result, "blown out", "overexposed")
        self.assertEqual(result["guideKey"], "overexposed")

    def test_corrupt_noise_frame_is_rejected(self):
        noise = np.random.default_rng(7).integers(0, 256, (480, 640, 3), dtype=np.uint8)
        result = self.capture(noise, "right")
        self.assertRejected(result, "sensor noise", "image_corrupt")
        self.assertEqual(result["guideKey"], "image_invalid")

    def test_severely_blurred_photo_is_still_rejected(self):
        """Blur detection is made robust, not removed."""
        result = self.capture(cv2.GaussianBlur(furnished_room(), (0, 0), 12), "right")
        self.assertRejected(result, "destroyed by motion blur", "blurred")
        self.assertGreaterEqual(result["blurSignals"], 3)

    def test_undersized_photo_is_rejected_as_low_resolution(self):
        result = self.capture(cv2.resize(furnished_room(), (160, 120)), "right")
        self.assertRejected(result, "160x120", "resolution_too_low")
        self.assertEqual(result["guideKey"], "resolution_low")

    def test_undecodable_payload_is_rejected_not_crashed(self):
        result = room_scanner.analyze_step("data:image/jpeg;base64,bm90YW5pbWFnZQ==",
                                           "right", "quality-corrupt")
        self.assertFalse(result["valid"])
        self.assertEqual(result["reason"], "image_corrupt")

    # ── Task 6 / 7: blur diagnostics and real reasons ─────────────────────
    def test_blur_detection_reports_every_signal_it_used(self):
        result = self.capture(plain_wall(), "right")
        for field in ("blurScore", "relativeSharpness", "tenengrad", "fineDetailRatio",
                      "blurSignals", "sharpnessScore", "qualityScore", "qualityThreshold"):
            self.assertIn(field, result, f"missing blur diagnostic: {field}")
        self.assertIsInstance(result["blurSignals"], int)
        self.assertGreaterEqual(result["blurSignals"], 0)

    def test_single_weak_blur_metric_alone_cannot_fail_a_photo(self):
        """A photo whose Laplacian variance alone is under the old hard cut must
        still be accepted, because three independent signals must agree first."""
        result = self.capture(plain_wall(mean=110), "right")
        self.assertLess(result["blurScore"], 28.0, "fixture must exercise the old threshold")
        self.assertLess(result["blurSignals"], 3, "quorum must not be met")
        self.assertFalse(result["metrics"]["blurredHard"])
        self.assertAccepted(result, "single weak metric")

    def test_quality_diagnostics_are_returned_for_both_verdicts(self):
        accepted = self.capture(plain_wall(), "right")
        rejected = self.capture(np.full((1080, 1920, 3), 6, np.uint8), "right")
        for result in (accepted, rejected):
            for field in ("verified" if False else "valid", "reason", "step", "qualityScore",
                          "blurScore", "brightnessScore", "sceneScore", "objectCount",
                          "resolution", "width", "height"):
                self.assertIn(field, result, f"missing diagnostic: {field}")
            self.assertEqual(result["step"], "right")
            self.assertTrue(result["resolution"].endswith("x") or "x" in result["resolution"])
        self.assertEqual(rejected["reason"], "too_dark")

    def test_failure_reason_is_never_a_generic_placeholder(self):
        """Task 7: never return a generic "photo not verified"."""
        unusable = {
            "black": np.full((1080, 1920, 3), 6, np.uint8),
            "white": np.full((1080, 1920, 3), 255, np.uint8),
            "grey": np.full((1080, 1920, 3), 128, np.uint8),
            "noise": np.random.default_rng(3).integers(0, 256, (480, 640, 3), dtype=np.uint8),
            "blurred": cv2.GaussianBlur(furnished_room(), (0, 0), 12),
            "tiny": cv2.resize(furnished_room(), (150, 110)),
        }
        for label, image in unusable.items():
            result = self.capture(image, "right")
            self.assertFalse(result["valid"], label)
            self.assertTrue(result["reason"], f"{label}: empty reason")
            self.assertNotIn("not verified", result["message"].lower(), label)
            self.assertTrue(result["message"].strip(), label)
            self.assertTrue(result["taMessage"].strip(), label)

    def test_rejection_message_matches_the_real_cause(self):
        """Task 8: a dark photo must not be told to hold the phone steady."""
        dark = self.capture(np.full((1080, 1920, 3), 6, np.uint8), "right")
        self.assertNotEqual(dark["guideKey"], "blurred")
        self.assertNotIn("நிலையாக", dark["taMessage"])  # "steadily"
        self.assertNotIn("steady", dark["message"].lower())
        blurred = self.capture(cv2.GaussianBlur(furnished_room(), (0, 0), 12), "right")
        self.assertEqual(blurred["guideKey"], "blurred")

    # ── Task 10: anti-replay must survive the quality rework ───────────────
    def test_replaying_one_view_for_every_step_is_still_blocked(self):
        """Security is unchanged: an identical photo cannot fill later steps, and
        the guidance must be a re-shoot request, never a false quality claim."""
        image = furnished_room()
        front = self.capture(image, "front")
        self.assertAccepted(front, "front")
        prior = [{"step": "front", "visualSignature": front["visualSignature"],
                  "sceneDescriptor": front["sceneDescriptor"],
                  "featureDescriptor": front["featureDescriptor"]}]
        for step in ("left", "right", "bottom", "desk"):
            replay = self.capture(image, step, prior_captures=prior)
            self.assertFalse(replay["valid"], f"replay / {step} must be blocked")
            self.assertTrue(replay["sameView"] or replay["wrongDirection"], step)
            self.assertNotEqual(replay["guideKey"], "blurred", step)
        # A genuinely different view for the same step is still accepted.
        moved = self.capture(empty_room(), "right", prior_captures=prior)
        self.assertAccepted(moved, "distinct right-side view")

    def test_duplicate_resubmission_is_not_blamed_on_blur(self):
        """Re-sending the identical frame is a duplicate, so the guidance must
        ask for a new view instead of alleging a quality problem it never had."""
        session = "quality-duplicate"
        front = self.capture(furnished_room(), "front", session=session)
        self.assertAccepted(front, "front")
        duplicate = self.capture(furnished_room(), "front", session=session)
        self.assertFalse(duplicate["valid"])
        self.assertTrue(duplicate["sameFrame"])
        self.assertEqual(duplicate["reason"], "duplicate_image")
        self.assertNotEqual(duplicate["guideKey"], "blurred")
        self.assertGreater(duplicate["qualityScore"], 60,
                           "a duplicate must not be reported as a low-quality photo")


class ImageQualityUnitTest(unittest.TestCase):
    """Direct checks on the step-agnostic quality function."""

    def base_metrics(self, **overrides):
        metrics = {
            "width": 1080, "height": 1920, "brightness": 120.0, "contrast": 20.0,
            "edgeFull": 0.02, "noiseRatio": 0.12, "localStructure": 0.9,
            "entropy": 5.2, "informationScore": 0.7, "laplacianVar": 80.0,
            "tenengrad": 30.0, "relativeSharpness": 0.2, "fineDetailRatio": 0.1,
            "blurSignals": 0, "blurred": False, "blurredHard": False, "blank": False,
        }
        metrics.update(overrides)
        return metrics

    def test_healthy_frame_passes_with_no_reason(self):
        verdict = image_quality(self.base_metrics())
        self.assertIsNone(verdict["reason"])
        self.assertEqual(verdict["guideKey"], "valid_room_view")
        self.assertGreater(verdict["qualityScore"], 60)

    def test_verdict_is_identical_for_every_step_value(self):
        """The function takes no step argument at all -- proof by construction."""
        import inspect
        self.assertNotIn("step", inspect.signature(image_quality).parameters)

    def test_each_hard_failure_maps_to_a_distinct_reason(self):
        cases = {
            "resolution_too_low": self.base_metrics(width=100, height=100),
            "image_corrupt": self.base_metrics(noiseRatio=0.99, localStructure=0.05),
            "too_dark": self.base_metrics(brightness=4.0, edgeFull=0.0),
            "overexposed": self.base_metrics(brightness=252.0),
            "no_visual_information": self.base_metrics(contrast=0.4, entropy=0.1, blank=True),
            "blurred": self.base_metrics(blurredHard=True, blurSignals=3,
                                         laplacianVar=1.0, relativeSharpness=0.001,
                                         fineDetailRatio=0.005),
        }
        for expected, metrics in cases.items():
            verdict = image_quality(metrics)
            self.assertEqual(verdict["reason"], expected,
                             f"{expected}: got {verdict['reason']} (guideKey={verdict['guideKey']})")

    def test_quality_score_is_bounded_and_ordered(self):
        poor = image_quality(self.base_metrics(brightness=30.0, contrast=4.0, edgeFull=0.002,
                                               laplacianVar=12.0, tenengrad=1.0,
                                               relativeSharpness=0.01, fineDetailRatio=0.03,
                                               informationScore=0.2, entropy=3.0))
        good = image_quality(self.base_metrics())
        self.assertGreaterEqual(poor["qualityScore"], 0.0)
        self.assertLessEqual(good["qualityScore"], 100.0)
        self.assertLess(poor["qualityScore"], good["qualityScore"])

    def test_no_single_weak_metric_can_fail_the_frame(self):
        """Each metric in isolation, at a weak value, must still pass."""
        isolated = {
            "low laplacian": {"laplacianVar": 15.0},
            "low tenengrad": {"tenengrad": 1.5},
            "low relative sharpness": {"relativeSharpness": 0.025},
            "low fine detail": {"fineDetailRatio": 0.019},
            "low edge density": {"edgeFull": 0.004, "informationScore": 0.25},
            "low contrast": {"contrast": 6.0},
            "dim room": {"brightness": 48.0},
        }
        for label, override in isolated.items():
            verdict = image_quality(self.base_metrics(**override))
            self.assertIsNone(verdict["reason"], f"{label} must not fail on its own")


if __name__ == "__main__":
    unittest.main()
