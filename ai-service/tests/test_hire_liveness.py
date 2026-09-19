import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inference.hire_liveness import check_movement


def frames(*yaw):
    return [{"yaw": value, "eyeOpen": 0.25} for value in yaw]


class HireLivenessTests(unittest.TestCase):
    def test_left_right_center_sequence_requires_temporal_pose_change(self):
        left = check_movement(frames(0.01, 0.015, 0.04, 0.10, 0.12), "TURN_LEFT")
        self.assertTrue(left["completed"])
        self.assertEqual(left["detectedMovement"], "LEFT")
        neutral = left["neutralYaw"]
        right = check_movement(frames(0.12, 0.11, 0.03, -0.07, -0.08), "TURN_RIGHT", neutral, left["poseYaw"])
        self.assertTrue(right["completed"])
        self.assertEqual(right["detectedMovement"], "RIGHT")
        center = check_movement(frames(-0.08, -0.075, -0.03, 0.0, 0.01), "LOOK_CENTER", neutral, right["poseYaw"])
        self.assertTrue(center["completed"])
        self.assertEqual(center["detectedMovement"], "CENTER")
        early_center = check_movement(frames(0.0, 0.01, 0.0, 0.01), "LOOK_CENTER", neutral, right["poseYaw"])
        self.assertTrue(early_center["completed"])

    def test_static_and_one_frame_spikes_do_not_pass(self):
        self.assertFalse(check_movement(frames(0, 0, 0, 0, 0), "TURN_LEFT")["completed"])
        self.assertFalse(check_movement(frames(0, 0, 0.11, 0, 0), "TURN_LEFT")["completed"])
        self.assertFalse(check_movement(frames(0.1, 0.11, 0.02, 0.0, 0.0), "TURN_RIGHT", 0)["completed"])
        self.assertFalse(check_movement(frames(0, 0, 0, 0, 0), "LOOK_CENTER", 0)["completed"])


if __name__ == "__main__":
    unittest.main()
