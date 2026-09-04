import logging
from typing import List, Dict, Any

log = logging.getLogger("ai-quiz.explanation-generator")

class ExplanationGenerator:
    def __init__(self):
        pass

    def ensure_explanations(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Reject missing explanations; never fabricate an explanation or answer."""
        for index, question in enumerate(questions):
            explanation = question.get("explanation")
            if not isinstance(explanation, str) or len(explanation.strip()) < 10:
                raise ValueError(f"Question {index + 1} needs a generated and verified explanation.")
        return questions
