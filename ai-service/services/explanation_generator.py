import logging
from typing import List, Dict, Any

log = logging.getLogger("ai-quiz.explanation-generator")

class ExplanationGenerator:
    def __init__(self):
        pass

    def ensure_explanations(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Verify that every question has a non-empty explanation field.
        Appends a reasonable default fallback if missing.
        """
        for i, q in enumerate(questions):
            explanation = q.get("explanation", "").strip()
            if not explanation:
                correct = q.get("correctAnswer", "")
                q["explanation"] = f"This is the correct answer based on technical validation of the concept '{correct}'."
                log.info(f"Added default explanation for question {i + 1}")
        return questions
