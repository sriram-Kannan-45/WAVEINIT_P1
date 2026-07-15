import random
import logging
from typing import List, Dict, Any

log = logging.getLogger("ai-quiz.option-randomizer")

class OptionRandomizer:
    def __init__(self):
        pass

    def randomize_options(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Shuffles options for MCQ questions and updates the correctAnswer to match the correct option text.
        Also maps the options to individual optionA, optionB, optionC, optionD fields for backend/frontend compatibility.
        """
        for q in questions:
            # We only process MCQ questions
            q_type = str(q.get("questionType", "MCQ")).upper()
            if q_type != "MCQ":
                continue
                
            options = q.get("options", [])
            correct_val = q.get("correctAnswer", "")
            
            # If correctAnswer is a letter, try to resolve it from the un-shuffled options list
            correct_val_str = str(correct_val).strip()
            correct_letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
            
            if correct_val_str in correct_letter_map and len(options) == 4:
                idx = correct_letter_map[correct_val_str]
                correct_option_text = options[idx]
            elif correct_val_str in ("0", "1", "2", "3") and len(options) == 4:
                idx = int(correct_val_str)
                correct_option_text = options[idx]
            else:
                correct_option_text = correct_val_str

            # Shuffling the options list
            options_shuffled = list(options)
            random.shuffle(options_shuffled)
            
            # Ensure correct option is still present in the shuffled list
            if correct_option_text not in options_shuffled:
                if len(options_shuffled) > 0:
                    options_shuffled[0] = correct_option_text
                    random.shuffle(options_shuffled)
                else:
                    options_shuffled = [correct_option_text, "Option B", "Option C", "Option D"]
            
            # Find the new index of the correct option
            new_idx = options_shuffled.index(correct_option_text)
            new_letter = chr(65 + new_idx)  # A, B, C, D
            
            # Update values
            q["options"] = options_shuffled
            q["correctAnswer"] = correct_option_text
            q["correct_answer"] = new_letter
            
            # Also populate optionA, optionB, optionC, optionD for prompt-to-quiz compatibility
            q["optionA"] = options_shuffled[0] if len(options_shuffled) > 0 else ""
            q["optionB"] = options_shuffled[1] if len(options_shuffled) > 1 else ""
            q["optionC"] = options_shuffled[2] if len(options_shuffled) > 2 else ""
            q["optionD"] = options_shuffled[3] if len(options_shuffled) > 3 else ""

        return questions
