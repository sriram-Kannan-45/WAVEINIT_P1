import unittest
import sys
import os

# Add inference directory to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, os.path.join(SCRIPT_DIR, "inference"))

from proctoring_detector import (
    calculateEyeHeadScore,
    calculate_monitoring_score,
    calculate_unique_violation_seconds,
    merge_intervals,
    ContinuousDirectionCounter,
)

class TestMediaPipeScoringAndTiming(unittest.TestCase):
    # =========================================================================
    # 1. EXACT USER CASES
    # =========================================================================

    def test_exact_100s_6_categories_10s_each(self):
        """
        Test: Actual test = 100s, 6 categories 10s each = 60s total violation
        Expected: (60 / 100) * 60 = 36 / 60
        """
        intervals = [
            (0.0, 10.0),   # Head Left (10s)
            (10.0, 20.0),  # Head Right (10s)
            (20.0, 30.0),  # Head Up (10s)
            (30.0, 40.0),  # Eye Left (10s)
            (40.0, 50.0),  # Eye Right (10s)
            (50.0, 60.0),  # Eye Up (10s)
        ]
        unique_violation = calculate_unique_violation_seconds(intervals)
        self.assertEqual(unique_violation, 60.0)
        score = calculateEyeHeadScore(unique_violation, 100.0)
        self.assertEqual(score, 36.0)

    def test_exact_100s_35s_non_overlapping(self):
        """
        Test: Actual test = 100s, Head Left=10s, Head Right=5s, Eye Left=20s (Total=35s)
        Expected: (35 / 100) * 60 = 21 / 60
        """
        intervals = [
            (0.0, 10.0),   # Head Left: 10s
            (15.0, 20.0),  # Head Right: 5s
            (30.0, 50.0),  # Eye Left: 20s
        ]
        unique_violation = calculate_unique_violation_seconds(intervals)
        self.assertEqual(unique_violation, 35.0)
        score = calculateEyeHeadScore(unique_violation, 100.0)
        self.assertEqual(score, 21.0)

    def test_exact_overlapping_intervals_union(self):
        """
        Test: Head Left = 10 -> 20 (10s), Eye Left = 12 -> 18 (overlaps inside 10->20)
        Expected: Unique violation = 10s (NOT 16s!), Score = (10 / 100) * 60 = 6 / 60
        """
        intervals = [
            (10.0, 20.0), # Head Left (10s)
            (12.0, 18.0), # Eye Left (6s inside Head Left)
        ]
        unique_violation = calculate_unique_violation_seconds(intervals)
        self.assertEqual(unique_violation, 10.0)
        score = calculateEyeHeadScore(unique_violation, 100.0)
        self.assertEqual(score, 6.0)

    def test_exact_early_submission_at_63s(self):
        """
        Test: Configured = 100s, Participant submits at 63s, Violation = 21s
        Expected: Actual duration = 63s, Score = (21 / 63) * 60 = 20 / 60 (NOT 21/100*60=12.6)
        """
        actual_test_duration = 63.0
        unique_violation = 21.0
        score = calculateEyeHeadScore(unique_violation, actual_test_duration)
        self.assertEqual(score, 20.0)

    def test_early_submission_configured_600s_actual_300s(self):
        """
        Test: Configured = 600s, Actual = 300s, Violation = 60s
        Expected: Denominator = 300s, Score = (60 / 300) * 60 = 12 / 60 (NOT 6 / 60)
        """
        actual_test_duration = 300.0
        unique_violation = 60.0
        score = calculateEyeHeadScore(unique_violation, actual_test_duration)
        self.assertEqual(score, 12.0)

    # =========================================================================
    # 2. THREE-SECOND CONTINUOUS VALIDATION & ACTUAL DURATION PRESERVATION
    # =========================================================================

    def test_validation_threshold_1_5s_discarded(self):
        """1.5s looking left (< 3.0s) -> Discarded (0s counted)."""
        counter = ContinuousDirectionCounter("Head", "Left", threshold_seconds=3.0)
        counter.update("Left", 10.0)
        counter.update("Left", 11.5) # 1.5s
        counter.update("Straight", 11.6) # Direction changed
        self.assertEqual(len(counter.get_all_intervals()), 0)
        self.assertEqual(len(counter.get_all_episodes()), 0)

    def test_validation_threshold_2_9s_discarded(self):
        """2.9s looking left (< 3.0s) -> Discarded (0s counted)."""
        counter = ContinuousDirectionCounter("Head", "Left", threshold_seconds=3.0)
        counter.update("Left", 10.0)
        counter.update("Left", 12.9) # 2.9s
        counter.update("Straight", 13.0) # Direction changed
        self.assertEqual(len(counter.get_all_intervals()), 0)
        self.assertEqual(len(counter.get_all_episodes()), 0)

    def test_validation_threshold_3_0s_valid(self):
        """3.0s looking left (>= 3.0s) -> Valid 3.0s recorded."""
        counter = ContinuousDirectionCounter("Head", "Left", threshold_seconds=3.0)
        counter.update("Left", 10.0)
        counter.update("Left", 13.0) # 3.0s
        counter.update("Straight", 13.1)
        intervals = counter.get_all_intervals()
        self.assertEqual(len(intervals), 1)
        self.assertAlmostEqual(intervals[0][1] - intervals[0][0], 3.0, places=1)

    def test_validation_threshold_7_4s_full_actual_duration(self):
        """7.4s looking left (>= 3.0s) -> Full 7.4s recorded (NOT 3.0s)."""
        counter = ContinuousDirectionCounter("Head", "Left", threshold_seconds=3.0)
        counter.update("Left", 10.0)
        counter.update("Left", 17.4) # 7.4s continuous
        counter.update("Straight", 17.4)
        episodes = counter.get_all_episodes()
        self.assertEqual(len(episodes), 1)
        self.assertAlmostEqual(episodes[0]["duration"], 7.4, places=1)

    def test_validation_threshold_8_7s_full_actual_duration(self):
        """8.7s looking left (>= 3.0s) -> Full 8.7s recorded (NOT 3.0s)."""
        counter = ContinuousDirectionCounter("Eyeball", "Right", threshold_seconds=3.0)
        counter.update("Right", 20.0)
        counter.update("Right", 28.7) # 8.7s continuous
        counter.update("Straight", 28.7)
        episodes = counter.get_all_episodes()
        self.assertEqual(len(episodes), 1)
        self.assertAlmostEqual(episodes[0]["duration"], 8.7, places=1)

    # =========================================================================
    # 3. BOUNDARY AND CLAMPING TESTS
    # =========================================================================

    def test_zero_violation(self):
        self.assertEqual(calculateEyeHeadScore(0.0, 100.0), 0.0)

    def test_full_violation_clamped_at_60(self):
        self.assertEqual(calculateEyeHeadScore(100.0, 100.0), 60.0)
        self.assertEqual(calculateEyeHeadScore(150.0, 100.0), 60.0)

if __name__ == "__main__":
    unittest.main(verbosity=2)
