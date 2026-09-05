"""Policy tests use detection fixtures; these are not camera accuracy claims."""
import unittest
from inference.mobile_composition import evaluate_mobile


def detection(name, box, confidence=0.9):
    return {"class_name": name, "box": box, "confidence": confidence}


PERSON = detection("person", [10, 10, 270, 460])
LAPTOP = detection("laptop", [300, 240, 620, 460])
PHONE = detection("cell phone", [400, 100, 460, 220])


class MobileCompositionTests(unittest.TestCase):
    def sample(self, objects, state, now):
        return evaluate_mobile(objects, 640, 480, state, now=now)

    def test_full_and_partial_objects_require_two_frames(self):
        for objects in ([PERSON, LAPTOP], [PERSON, detection("laptop", [500, 320, 700, 470])],
                        [detection("person", [-80, 20, 120, 350]), LAPTOP]):
            state = {}
            self.assertFalse(self.sample(objects, state, 0)["eligible"])
            self.assertTrue(self.sample(objects, state, 0.6)["eligible"])

    def test_person_only_laptop_only_empty_and_monitor_never_unlock(self):
        for objects in ([PERSON], [LAPTOP], [], [PERSON, detection("tv", LAPTOP["box"])]):
            state = {}
            for n in range(10):
                self.assertFalse(self.sample(objects, state, n * 0.6)["eligible"])

    def test_weak_or_tiny_partial_evidence_does_not_unlock(self):
        for objects in ([PERSON, detection("laptop", [0, 0, 10, 10])],
                        [PERSON, detection("laptop", LAPTOP["box"], 0.2)]):
            state = {}
            for n in range(5):
                self.assertFalse(self.sample(objects, state, n * 0.6)["eligible"])

    def test_loss_grace_and_reacquisition(self):
        state = {}
        self.sample([PERSON, LAPTOP], state, 0)
        self.sample([PERSON, LAPTOP], state, 0.6)
        self.assertTrue(self.sample([], state, 1.2)["eligible"])
        self.assertTrue(self.sample([], state, 1.8)["eligible"])
        self.assertFalse(self.sample([], state, 2.4)["eligible"])
        self.assertFalse(self.sample([PERSON, LAPTOP], state, 3)["eligible"])
        self.assertTrue(self.sample([PERSON, LAPTOP], state, 3.6)["eligible"])

    def test_phone_requires_consecutive_frames_independent_of_composition(self):
        state = {}
        self.assertFalse(self.sample([PHONE], state, 0)["phone_stable"])
        self.assertTrue(self.sample([PHONE], state, 0.6)["phone_stable"])
        self.assertFalse(self.sample([], state, 1.2)["phone_stable"])
        self.assertFalse(self.sample([PHONE], state, 1.8)["phone_stable"])

    def test_reconnect_gap_discards_stale_evidence(self):
        state = {}
        self.sample([PERSON, LAPTOP, PHONE], state, 0)
        self.sample([PERSON, LAPTOP, PHONE], state, 0.6)
        result = self.sample([PERSON, LAPTOP, PHONE], state, 7)
        self.assertFalse(result["eligible"])
        self.assertFalse(result["phone_stable"])

    def test_existing_extra_screen_and_book_rules_remain_stable(self):
        for extra, expected in ((detection("laptop", [0, 100, 180, 260]), "SECONDARY_DEVICE"),
                                (detection("book", [0, 100, 180, 260]), "BOOK_NOTES_DETECTED")):
            state = {}
            self.assertIsNone(self.sample([PERSON, LAPTOP, extra], state, 0)["other_violation"])
            self.assertEqual(self.sample([PERSON, LAPTOP, extra], state, 0.6)["other_violation"], expected)


if __name__ == '__main__':
    unittest.main()
