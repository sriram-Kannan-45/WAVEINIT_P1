from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class QuestionType(str, Enum):
    MCQ = "MCQ"
    TRUE_FALSE = "TRUE_FALSE"
    FILL_BLANK = "FILL_BLANK"


class Difficulty(str, Enum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"


class BloomLevel(str, Enum):
    REMEMBER = "Remember"
    UNDERSTAND = "Understand"
    APPLY = "Apply"
    ANALYZE = "Analyze"
    EVALUATE = "Evaluate"
    CREATE = "Create"


def normalize_difficulty(value: Any, allow_mixed: bool = False) -> str:
    raw = str(value or "Medium").strip().replace("_", " ").lower()
    mapping = {
        "easy": "Easy",
        "medium": "Medium",
        "hard": "Hard",
        "mixed": "Mixed",
    }
    normalized = mapping.get(raw)
    if normalized == "Mixed" and not allow_mixed:
        return "Medium"
    return normalized or "Medium"


def normalize_question_type(value: Any) -> str:
    raw = str(value or "MIXED").strip().replace("-", "_").replace(" ", "_").upper()
    aliases = {
        "TRUE/FALSE": "TRUE_FALSE",
        "TRUE_FALSE": "TRUE_FALSE",
        "TF": "TRUE_FALSE",
        "FILL_IN_THE_BLANK": "FILL_BLANK",
        "FILL_BLANK": "FILL_BLANK",
        "MCQ": "MCQ",
        "MULTIPLE_CHOICE": "MCQ",
        "MIXED": "MIXED",
        "ALL": "MIXED",
    }
    return aliases.get(raw, "MIXED")


class QuizQuestion(BaseModel):
    questionType: QuestionType = QuestionType.MCQ
    question: str = Field(min_length=8)
    options: List[str] = Field(default_factory=list)
    correctAnswer: str = Field(min_length=1)
    explanation: str = Field(min_length=10)
    difficulty: Difficulty = Difficulty.MEDIUM
    topic: str = Field(min_length=2)
    bloomsLevel: BloomLevel = BloomLevel.UNDERSTAND

    @model_validator(mode="before")
    @classmethod
    def normalize_keys(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        aliases = {
            "question_type": "questionType",
            "type": "questionType",
            "questionText": "question",
            "question_text": "question",
            "correct_answer": "correctAnswer",
            "answer": "correctAnswer",
            "bloomLevel": "bloomsLevel",
            "bloom_level": "bloomsLevel",
            "blooms_level": "bloomsLevel",
        }
        for old, new in aliases.items():
            if old in normalized and new not in normalized:
                normalized[new] = normalized[old]
        if "difficulty" in normalized:
            normalized["difficulty"] = normalize_difficulty(normalized["difficulty"])
        if "questionType" in normalized:
            normalized["questionType"] = normalize_question_type(normalized["questionType"])
        return normalized

    @field_validator("question", "correctAnswer", "explanation", "topic", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("options", mode="before")
    @classmethod
    def normalize_options(cls, value: Any) -> List[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        return [str(option).strip() for option in value if str(option).strip()]

    @model_validator(mode="after")
    def validate_by_type(self) -> "QuizQuestion":
        if self.questionType == QuestionType.MCQ:
            if len(self.options) != 4:
                raise ValueError("MCQ questions must contain exactly four options.")
            if len({option.lower() for option in self.options}) != 4:
                raise ValueError("MCQ options must be unique.")
            if self.correctAnswer.lower() not in {option.lower() for option in self.options}:
                raise ValueError("MCQ correctAnswer must exactly match one option.")

        if self.questionType == QuestionType.TRUE_FALSE:
            self.options = ["True", "False"]
            if self.correctAnswer.lower() not in {"true", "false"}:
                raise ValueError("True/False correctAnswer must be True or False.")
            self.correctAnswer = "True" if self.correctAnswer.lower() == "true" else "False"

        if self.questionType == QuestionType.FILL_BLANK:
            self.options = []
            if "____" not in self.question:
                raise ValueError("Fill in the Blank question must contain exactly one blank token: ____.")
            if self.question.count("____") != 1:
                raise ValueError("Fill in the Blank question must contain exactly one blank token.")

        return self


class QuizOutput(BaseModel):
    title: str = Field(min_length=3)
    difficulty: str = "Mixed"
    totalQuestions: int
    questions: List[QuizQuestion]

    @model_validator(mode="before")
    @classmethod
    def normalize_payload(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "quizTitle" in normalized and "title" not in normalized:
            normalized["title"] = normalized["quizTitle"]
        if "total_questions" in normalized and "totalQuestions" not in normalized:
            normalized["totalQuestions"] = normalized["total_questions"]
        if "difficulty" in normalized:
            normalized["difficulty"] = normalize_difficulty(normalized["difficulty"], allow_mixed=True)
        return normalized

    @model_validator(mode="after")
    def validate_quiz(self) -> "QuizOutput":
        if not self.questions:
            raise ValueError("Quiz must contain at least one question.")
        self.totalQuestions = len(self.questions)
        seen = set()
        for question in self.questions:
            key = " ".join(question.question.lower().split())
            if key in seen:
                raise ValueError("Duplicate questions are not allowed.")
            seen.add(key)
        return self

    def to_response(self, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = self.model_dump(mode="json")
        if metadata:
            payload["metadata"] = metadata
        return payload

