"""Hire framing policy tests use detection fixtures, not camera accuracy claims."""
import unittest

from inference.hire_mobile_framing import evaluate_hire_mobile


def detection(name, box, confidence=0.9):
    return {"class_name": name, "box": box, "confidence": confidence}


LAPTOP = detection("laptop", [170, 120, 480, 390])
TABLE = detection("dining table", [20, 320, 620, 475])
PERSON = detection("person", [0, 0, 150, 450])
LEFT_HAND = [(0.22, 0.75)] * 21
RIGHT_HAND = [(0.75, 0.75)] * 21
HANDS = [LEFT_HAND, RIGHT_HAND]
HANDS_AWAY_FROM_DESK = [[(0.05, 0.05)] * 21, [(0.95, 0.05)] * 21]


class HireMobileFramingTests(unittest.TestCase):
    def sample(self, objects, hands, state, now):
        return evaluate_hire_mobile(objects, hands, 640, 480, state, now=now)

    def test_both_hands_laptop_workspace_unlock_without_person(self):
        state = {}
        first = self.sample([LAPTOP, TABLE], HANDS, state, 0)
        second = self.sample([LAPTOP, TABLE], HANDS, state, 0.6)
        self.assertFalse(first["eligible"])
        self.assertTrue(second["eligible"])
        self.assertFalse(second["person_detected"])
        self.assertEqual(second["framing_mode"], "HIRE_WORKSPACE")
        self.assertEqual(second["composition_state"], "VALID")

    def test_missing_signals_get_requested_guidance(self):
        cases = [
            ([TABLE], HANDS, "LAPTOP", "Please adjust the phone so your laptop is visible."),
            ([LAPTOP, TABLE], [], "HANDS", "Please keep both hands visible near your workspace."),
            ([LAPTOP], HANDS_AWAY_FROM_DESK, "WORKSPACE", "Please show your laptop and workspace clearly."),
        ]
        for objects, hands, key, message in cases:
            with self.subTest(key=key):
                result = self.sample(objects, hands, {}, 0)
                self.assertFalse(result["eligible"])
                self.assertEqual(result["guidance_key"], key)
                self.assertEqual(result["user_message"], message)

    def test_workspace_geometry_can_verify_real_desk_without_table_label(self):
        state = {}
        self.sample([LAPTOP], HANDS, state, 0)
        result = self.sample([LAPTOP], HANDS, state, 0.6)
        self.assertTrue(result["workspace_detected"])
        self.assertTrue(result["eligible"])

    def test_side_view_with_one_hand_landmark_still_verifies(self):
        # Two overlapping visible hands can yield one MediaPipe hand result.
        state = {}
        laptop_at_edge = detection("laptop", [330, 130, 690, 430])
        visible_hand = [[(0.55, 0.86)] * 21]
        self.sample([laptop_at_edge], visible_hand, state, 0)
        result = self.sample([laptop_at_edge], visible_hand, state, 0.6)
        self.assertTrue(result["hands_detected"])
        self.assertTrue(result["workspace_detected"])
        self.assertTrue(result["eligible"])
        self.assertEqual(result["hand_count"], 1)

    def test_person_never_substitutes_for_missing_hands(self):
        state = {}
        for n in range(4):
            result = self.sample([PERSON, LAPTOP, TABLE], [], state, n * 0.6)
            self.assertFalse(result["eligible"])
            self.assertEqual(result["guidance_key"], "HANDS")

    def test_short_loss_grace_then_reacquisition(self):
        state = {}
        self.sample([LAPTOP, TABLE], HANDS, state, 0)
        self.sample([LAPTOP, TABLE], HANDS, state, 0.6)
        self.assertTrue(self.sample([LAPTOP, TABLE], [], state, 1.2)["eligible"])
        self.assertTrue(self.sample([LAPTOP, TABLE], [], state, 1.8)["eligible"])
        self.assertFalse(self.sample([LAPTOP, TABLE], [], state, 2.4)["eligible"])
        self.assertFalse(self.sample([LAPTOP, TABLE], HANDS, state, 3)["eligible"])
        self.assertTrue(self.sample([LAPTOP, TABLE], HANDS, state, 3.6)["eligible"])


if __name__ == "__main__":
    unittest.main()
