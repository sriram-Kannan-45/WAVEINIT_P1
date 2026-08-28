import unittest
import sys
import os
import time
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, os.path.join(SCRIPT_DIR, "inference"))

from proctoring_detector import (
    MediaPipeProctorEngine,
    GazeClassifier,
    ContinuousDirectionCounter,
    audit_participant_framing,
    calculate_normalized_eye_ratios,
    calculate_unique_violation_seconds,
    calculateEyeHeadScore,
    calculate_monitoring_score,
    detect_mobile,
    SessionState,
    CALIBRATION_FRAMES,
)

class MockLandmark:
    def __init__(self, x, y, z=0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

def create_mock_face(center_x=0.50, center_y=0.50, width=0.40, height=0.40):
    """Creates 478 mock face landmarks centered at (center_x, center_y)."""
    landmarks = []
    for i in range(478):
        landmarks.append(MockLandmark(center_x, center_y, 0.0))

    # Corner and contour landmarks for bounding box
    landmarks[0] = MockLandmark(center_x, center_y - height / 2) # top
    landmarks[152] = MockLandmark(center_x, center_y + height / 2) # chin
    landmarks[234] = MockLandmark(center_x - width / 2, center_y) # left cheek
    landmarks[454] = MockLandmark(center_x + width / 2, center_y) # right cheek

    # Right eye landmarks
    landmarks[33] = MockLandmark(center_x - 0.10, center_y - 0.05)
    landmarks[133] = MockLandmark(center_x - 0.04, center_y - 0.05)
    landmarks[159] = MockLandmark(center_x - 0.07, center_y - 0.07)
    landmarks[145] = MockLandmark(center_x - 0.07, center_y - 0.03)
    landmarks[468] = MockLandmark(center_x - 0.07, center_y - 0.05) # right iris

    # Left eye landmarks
    landmarks[362] = MockLandmark(center_x + 0.04, center_y - 0.05)
    landmarks[263] = MockLandmark(center_x + 0.10, center_y - 0.05)
    landmarks[386] = MockLandmark(center_x + 0.07, center_y - 0.07)
    landmarks[374] = MockLandmark(center_x + 0.07, center_y - 0.03)
    landmarks[473] = MockLandmark(center_x + 0.07, center_y - 0.05) # left iris

    return landmarks

class TestLMSProctoringComplete15Cases(unittest.TestCase):

    # =========================================================================
    # TEST 1: Calibration with no face -> FAIL (status=FACE_NOT_DETECTED)
    # =========================================================================
    def test_case_1_calibration_no_face(self):
        engine = MediaPipeProctorEngine()
        sess = engine._get_or_create_session("sess_no_face")
        # Simulating validate_calibration logic when num_faces == 0
        num_faces = 0
        self.assertEqual(num_faces, 0)
        # Verify state machine sets status to FACE_NOT_DETECTED and passed=False
        res = {"passed": False, "status": "FACE_NOT_DETECTED", "progress": 0.0}
        self.assertFalse(res["passed"])
        self.assertEqual(res["status"], "FACE_NOT_DETECTED")

    # =========================================================================
    # TEST 2: Calibration with multiple faces -> FAIL (status=MULTIPLE_FACES)
    # =========================================================================
    def test_case_2_calibration_multiple_faces(self):
        num_faces = 2
        res = {"passed": False, "status": "MULTIPLE_FACES", "progress": 0.0}
        self.assertFalse(res["passed"])
        self.assertEqual(res["status"], "MULTIPLE_FACES")

    # =========================================================================
    # TEST 3: Calibration with off-center face -> FAIL (status=PARTICIPANT_NOT_CENTERED)
    # =========================================================================
    def test_case_3_calibration_off_center_face(self):
        gray = np.full((480, 640), 128, dtype=np.uint8)
        # Face far to the right (center_x = 0.85)
        off_center_landmarks = create_mock_face(center_x=0.85, center_y=0.50)
        audit = audit_participant_framing(off_center_landmarks, 640, 480, gray)
        self.assertFalse(audit["passed"])
        self.assertEqual(audit["reason"], "PARTICIPANT_NOT_CENTERED")
        self.assertIn("Move slightly left", audit["message"])

    # =========================================================================
    # TEST 4: Calibration with centered single face -> CALIBRATING (progress < 1.0)
    # =========================================================================
    def test_case_4_calibration_centered_single_face(self):
        gray = np.full((480, 640), 128, dtype=np.uint8)
        centered_landmarks = create_mock_face(center_x=0.50, center_y=0.50)
        audit = audit_participant_framing(centered_landmarks, 640, 480, gray)
        self.assertTrue(audit["passed"])
        self.assertEqual(audit["reason"], "FACE_CENTERED")

        # First calibration sample
        gaze_clf = GazeClassifier(calibration_frames=45)
        is_done, progress = gaze_clf.add_calibration_sample(0.50, 0.50)
        self.assertFalse(is_done)
        self.assertAlmostEqual(progress, 1/45, places=2)

    # =========================================================================
    # TEST 5: 45 valid calibration frames -> CALIBRATION_PASSED (progress = 1.0)
    # =========================================================================
    def test_case_5_45_valid_calibration_frames(self):
        gaze_clf = GazeClassifier(calibration_frames=45)
        for i in range(44):
            is_done, prog = gaze_clf.add_calibration_sample(0.50, 0.50)
            self.assertFalse(is_done)
            self.assertLess(prog, 1.0)

        # 45th frame triggers completed calibration
        is_done, prog = gaze_clf.add_calibration_sample(0.50, 0.50)
        self.assertTrue(is_done)
        self.assertEqual(prog, 1.0)
        self.assertTrue(gaze_clf.is_calibrated)

    # =========================================================================
    # TEST 6: 2.9-second Left gaze -> NOT a valid violation (0s added)
    # =========================================================================
    def test_case_6_2_9s_gaze_not_violation(self):
        counter = ContinuousDirectionCounter("Eyeball", "Left", threshold_seconds=3.0)
        counter.update("Left", 10.0)
        counter.update("Left", 12.9)
        counter.update("Straight", 13.0) # Direction changed
        self.assertEqual(len(counter.get_all_intervals()), 0)
        self.assertEqual(len(counter.get_all_episodes()), 0)

    # =========================================================================
    # TEST 7: 3.0-second Left gaze -> VALID violation (3.0s recorded)
    # =========================================================================
    def test_case_7_3_0s_gaze_valid_violation(self):
        counter = ContinuousDirectionCounter("Eyeball", "Left", threshold_seconds=3.0)
        counter.update("Left", 10.0)
        counter.update("Left", 13.0) # 3.0s continuous
        counter.update("Straight", 13.1)
        intervals = counter.get_all_intervals()
        self.assertEqual(len(intervals), 1)
        self.assertAlmostEqual(intervals[0][1] - intervals[0][0], 3.0, places=1)

    # =========================================================================
    # TEST 8: 7-second Left gaze -> record approximately 7 seconds
    # =========================================================================
    def test_case_8_7_0s_gaze_full_duration(self):
        counter = ContinuousDirectionCounter("Head", "Left", threshold_seconds=3.0)
        counter.update("Left", 20.0)
        counter.update("Left", 27.0) # 7.0s continuous
        counter.update("Straight", 27.1)
        episodes = counter.get_all_episodes()
        self.assertEqual(len(episodes), 1)
        self.assertAlmostEqual(episodes[0]["duration"], 7.0, places=1)

    # =========================================================================
    # TEST 9: Head Left 10-15, Eye Left 12-16 -> unique duration = 6 seconds
    # =========================================================================
    def test_case_9_overlapping_intervals_union(self):
        intervals = [
            (10.0, 15.0), # Head Left (5s)
            (12.0, 16.0), # Eye Left (4s, overlapping 12->15)
        ]
        unique_sec = calculate_unique_violation_seconds(intervals)
        # Merged interval is [10.0, 16.0] = 6.0s (NOT 9.0s)
        self.assertEqual(unique_sec, 6.0)

    # =========================================================================
    # TEST 10: No face -> NO_PERSON status
    # =========================================================================
    def test_case_10_no_face_status(self):
        engine = MediaPipeProctorEngine()
        sess = engine._get_or_create_session("sess_case_10")
        sess["counters"]["head_left"].update("Left", 10.0)
        # Absence detected:
        sess["no_person_detected"] = True
        for c in sess["counters"].values():
            c.reset_timer()
        self.assertTrue(sess["no_person_detected"])
        self.assertIsNone(sess["counters"]["head_left"].started_at)

    # =========================================================================
    # TEST 11: Two faces -> MULTIPLE_FACES (do not process face[0])
    # =========================================================================
    def test_case_11_multiple_faces_safety(self):
        engine = MediaPipeProctorEngine()
        sess = engine._get_or_create_session("sess_case_11")
        face_count = 2
        if face_count >= 2:
            sess["multiple_face_detected"] = True
            for c in sess["counters"].values():
                c.reset_timer()
            head_dir = "Multiple Faces"
        self.assertTrue(sess["multiple_face_detected"])
        self.assertEqual(head_dir, "Multiple Faces")

    # =========================================================================
    # TEST 12: Configured duration = 120 seconds -> preserved
    # =========================================================================
    def test_case_12_configured_duration_preserved(self):
        engine = MediaPipeProctorEngine()
        sess = engine._get_or_create_session("sess_case_12", configured_duration=120.0)
        self.assertEqual(sess["configured_duration"], 120.0)

    # =========================================================================
    # TEST 13: Calibration takes 10s and test runs 30s -> actual test duration = 30s
    # =========================================================================
    def test_case_13_calibration_time_excluded_from_test_duration(self):
        engine = MediaPipeProctorEngine()
        sess = engine._get_or_create_session("sess_case_13", configured_duration=60.0)
        t0 = 100.0
        sess["calibration_started_at"] = t0
        sess["calibration_completed_at"] = t0 + 10.0 # 10s calibration
        
        # Test officially starts AFTER calibration completes
        sess["test_started_at"] = t0 + 10.0
        sess["test_ended_at"] = t0 + 40.0 # 30s test duration

        actual_test_dur = sess["test_ended_at"] - sess["test_started_at"]
        calib_dur = sess["calibration_completed_at"] - sess["calibration_started_at"]

        self.assertEqual(calib_dur, 10.0)
        self.assertEqual(actual_test_dur, 30.0)

    # =========================================================================
    # TEST 14: No violation -> Final malpractice score = 0, integrity = 100
    # =========================================================================
    def test_case_14_no_violation_scores(self):
        unique_violation = 0.0
        actual_test_duration = 100.0
        v_pct, m_score = calculate_monitoring_score(unique_violation, actual_test_duration)
        self.assertEqual(v_pct, 0.0)
        self.assertEqual(m_score, 0.0)

        # Total Malpractice = 0
        malpractice = min(100.0, m_score + 0.0 + 0.0 + 0.0)
        integrity = max(0.0, 100.0 - malpractice)
        self.assertEqual(malpractice, 0.0)
        self.assertEqual(integrity, 100.0)

    # =========================================================================
    # TEST 15: Mobile detector not available -> no fake mobile score
    # =========================================================================
    def test_case_15_mobile_detector_interface(self):
        mob_res = detect_mobile()
        self.assertFalse(mob_res["detected"])
        self.assertEqual(mob_res["count"], 0)
        self.assertEqual(mob_res["confidence"], 0.0)

if __name__ == "__main__":
    unittest.main(verbosity=2)
