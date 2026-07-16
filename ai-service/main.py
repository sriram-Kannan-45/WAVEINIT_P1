b"""
AI Quiz Generator Microservice - Enterprise Edition
Uses LangChain + Gemini to generate quizzes from documents.

Enhanced with:
- Advanced prompt engineering with Bloom's taxonomy
- Response caching for improved performance
- Structured JSON output validation
- Semantic similarity filtering for question diversity
- Retry logic with exponential backoff
- Comprehensive error handling and logging
"""
import os
import sys
import logging
import asyncio
import hashlib
import re
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")  # Load ai-service/.env regardless of cwd

import json
import random
import tempfile
import time
from typing import List, Dict, Any, Optional, Tuple, TypedDict
import difflib
from services.gemini_client import GeminiClient, GeminiTemporaryError
from services.prompt_builder import PromptBuilder
from services.json_validator import JSONValidator
from services.duplicate_remover import DuplicateRemover
from services.option_randomizer import OptionRandomizer
from services.explanation_generator import ExplanationGenerator
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
import PyPDF2
import docx
from rag.extraction import UnsupportedSourceError
from rag.generation import QuizGenerationError
from rag.orchestrator import RAGQuizGenerator, RAGQuizRequest

# ── Logging Setup ──────────────────────────────────────
class ColoredFormatter(logging.Formatter):
    """Custom logging formatter that adds ANSI colors to logs."""
    GREY = "\x1b[38;20m"
    YELLOW = "\x1b[33;20m"
    RED = "\x1b[31;20m"
    BOLD_RED = "\x1b[31;1m"
    GREEN = "\x1b[32;20m"
    CYAN = "\x1b[36;20m"
    RESET = "\x1b[0m"
    
    FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
    
    COLORS = {
        logging.DEBUG: GREY,
        logging.INFO: CYAN,
        logging.WARNING: YELLOW,
        logging.ERROR: RED,
        logging.CRITICAL: BOLD_RED
    }
    
    def format(self, record):
        log_fmt = self.COLORS.get(record.levelno, self.RESET) + self.FORMAT + self.RESET
        formatter = logging.Formatter(log_fmt, datefmt="%H:%M:%S")
        return formatter.format(record)

handler = logging.StreamHandler()
handler.setFormatter(ColoredFormatter())
logging.basicConfig(
    level=logging.INFO,
    handlers=[handler]
)
log = logging.getLogger("ai-quiz")

# Global port state for health checking and dynamic binding
current_port = int(os.getenv("AI_SERVICE_PORT", 8000))

# ── Application Setup ──────────────────────────────────
app = FastAPI(
    title="LMS AI Quiz Generator",
    version="3.0.0",
    description="Enterprise-grade AI quiz generation service with advanced prompt engineering and caching"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Cache Implementation ───────────────────────────────
class SimpleCache:
    """In-memory cache with TTL support for quiz generation results."""
    
    def __init__(self, default_ttl: int = 3600):
        self._cache: Dict[str, Dict] = {}
        self._timestamps: Dict[str, datetime] = {}
        self.default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Dict]:
        """Get item from cache if not expired."""
        if key in self._cache:
            if datetime.now() - self._timestamps[key] < timedelta(seconds=self.default_ttl):
                return self._cache[key]
            else:
                del self._cache[key]
                del self._timestamps[key]
        return None
    
    def set(self, key: str, value: Dict) -> None:
        """Set item in cache with current timestamp."""
        self._cache[key] = value
        self._timestamps[key] = datetime.now()
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()
        self._timestamps.clear()

# Initialize cache
quiz_cache = SimpleCache(default_ttl=7200)  # 2 hour TTL

# ── Configuration ──────────────────────────────────────
class Config:
    """Centralized configuration for AI service."""
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_TEXT_LENGTH = 15000
    MIN_TEXT_LENGTH = 50
    MAX_QUESTIONS = 50
    MIN_QUESTIONS = 1
    DEFAULT_CHUNK_SIZE = 4000
    DEFAULT_CHUNK_OVERLAP = 200
    MAX_RETRIES = 3
    RETRY_DELAY = 2  # seconds
    SIMILARITY_THRESHOLD = 0.7  # For duplicate detection

# ── Enhanced Prompt Templates ─────────────────────────
DIFFICULTY_CONFIGS = {
    "EASY": {
        "description": "Basic recall and comprehension questions",
        "bloom_level": "Remember, Understand",
        "instruction": "Focus on key terms, definitions, and basic concepts. Questions should test fundamental understanding.",
        "complexity": "low"
    },
    "MEDIUM": {
        "description": "Application and analysis questions",
        "bloom_level": "Apply, Analyze",
        "instruction": "Include scenario-based questions that require applying concepts. Test ability to analyze relationships.",
        "complexity": "medium"
    },
    "HARD": {
        "description": "Evaluation and creation questions",
        "bloom_level": "Evaluate, Create",
        "instruction": "Create complex scenarios requiring critical thinking. Test ability to evaluate, synthesize, and make judgments.",
        "complexity": "high"
    },
    "MIXED": {
        "description": "Balanced difficulty distribution",
        "bloom_level": "All levels",
        "instruction": "Distribute questions across all difficulty levels: ~30% easy, ~40% medium, ~30% hard.",
        "complexity": "mixed"
    }
}

TOPIC_EXTRACTION_PROMPT = """You are a senior curriculum designer and subject-matter analyst.

You will be given a piece of source text. This text may be informal — a personal learning journal, notes, or a diary-style entry — describing a person's day-to-day learning activity rather than presenting clean facts.

Your job is NOT to summarize what the person did. Your job is to identify the underlying technical subjects, tools, libraries, frameworks, design patterns, and concepts that are MENTIONED in the text, so they can be used as a syllabus/scope for an independent quiz that will be written separately, by someone who will never see this text.

## SOURCE TEXT:
{text}

## INSTRUCTIONS:
1. Ignore narrative framing entirely. Phrases like "Yesterday I started", "Today I plan to", "I also learned", "After that I learned" describe the person's timeline, not testable facts — discard them completely.
2. List every distinct technical subject, tool, library, framework, design pattern, or concept that is named or clearly implied in the text.
3. For each one, write a one-line description of what it actually IS in the real world, using your own general knowledge of the subject — not a paraphrase of how the text mentioned it.
4. Rate each topic's depth as BASIC (terminology-level), INTERMEDIATE (usage-level), or ADVANCED (architecture/design-level), based on how thoroughly it's discussed.
5. Do not invent topics that are not named or clearly implied in the text.

## OUTPUT FORMAT (raw JSON only, no markdown fences, nothing before or after):
{{
  "subjectDomain": "A short label for the overall domain, e.g. 'Java API Test Automation'",
  "topics": [
    {{
      "name": "REST Assured",
      "realWorldDescription": "A Java library used to automate and validate REST API requests and responses.",
      "depth": "INTERMEDIATE"
    }}
  ]
}}
"""

QUESTION_GENERATION_PROMPT = """You are an expert certification exam item-writer, in the style of Oracle Java certification, API-testing certifications, or professional courses on Udemy/Coursera.

You are NOT summarizing a document. You are writing an ORIGINAL quiz that tests real-world knowledge of the subjects listed below. Treat the topic list as a syllabus only. Do not reference, quote, or rephrase any specific source text — there is no document in this conversation, only a syllabus. Write every question, option, and explanation from your own expert knowledge of these subjects.

## SYLLABUS (topics to test — use your own domain knowledge of each):
{topics_json}

## DIFFICULTY LEVEL: {difficulty}
- EASY: terminology, basic syntax, definitions.
- MEDIUM: usage, behavior, comparisons between related concepts.
- HARD: edge cases, design trade-offs, scenario-based reasoning.

## QUESTION TYPE DISTRIBUTION — MANDATORY EXACT COUNTS, NOT APPROXIMATE
Generate EXACTLY {num_questions} questions in total, with this EXACT breakdown:
- Exactly {mcq_count} questions with "questionType": "MCQ"
- Exactly {true_false_count} questions with "questionType": "TRUE_FALSE"
- Exactly {fill_blank_count} questions with "questionType": "FILL_BLANK"
- Exactly {matching_count} questions with "questionType": "MATCHING"
These counts are non-negotiable. Do not skip a type, substitute one type for another, or default to whichever type feels easiest to write, even if a topic feels better suited to a different format. Spread questions across the different syllabus topics — do not cluster every question on a single topic.

## SELF-CHECK BEFORE YOU RESPOND
Count how many questions you have written for each questionType. If any count does not exactly match the breakdown above, add, remove, or convert questions until every count matches exactly. Only output the JSON once this is true.

## ABSOLUTE RULES
1. NEVER use or imply the words "document", "text", "passage", or "author" — there is no source document in this task, only a syllabus.
2. NEVER ask about what someone "learned", "did", "plans to do", or any diary/narrative content. Every question must be a standalone, real-world knowledge question about the subject itself, exactly like a textbook or certification exam question.
3. For FILL_BLANK: compose a brand-new sentence, in your own words, that explains a fact about the concept, then blank exactly ONE key technical term in that new sentence. Never construct a blank from anything resembling a diary sentence.
4. Write in the neutral voice of an exam writer. Never first person, never past tense narrative.
5. No markdown symbols (no **, no backticks, no bullet points) anywhere in question, option, or explanation text.
6. No duplicate questions or duplicate options within a question.

## TYPE-SPECIFIC RULES

### MCQ
- Max 20 words for the question, exactly one idea.
- Exactly 4 options, each max 8 words, only one correct.
- Distractors must be real, plausible wrong answers a learner might actually pick — not random unrelated text.

### TRUE_FALSE
- One declarative factual statement, max 20 words.
- Mix true and false statements roughly evenly across the quiz — do not make every statement true.

### FILL_BLANK
- One new, original sentence, max 20 words, with exactly one key technical term replaced by "____".
- correctAnswer = the blanked term.
- acceptableAnswers = an array containing correctAnswer plus close variants (with/without parentheses, casing, singular/plural).

### MATCHING
- 3 to 5 pairs of {{left: short term, right: short definition/effect}} from the SAME topic.
- Each "right" value max 10 words and unique — not guessable by length or grammar alone.

## STYLE CALIBRATION EXAMPLE (match this tone and rigor — write about the actual syllabus topics, not this example):
  Question: Which method in REST Assured sends the configured HTTP request?
  Options: A. given()  B. when()  C. then()  D. validate()
  Correct: B
  Explanation: when() executes the request after given() sets up parameters, and then() validates the response.

## JSON OUTPUT FORMAT
Return ONLY raw JSON, no markdown fences, nothing before or after it:
{{
  "quizTitle": "A concise, appropriate title for the quiz",
  "subjectDomain": "{{subjectDomain from syllabus}}",
  "difficulty": "{difficulty}",
  "questions": [
    {{
      "questionType": "MCQ",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": "exact text of the correct option",
      "explanation": "one-line reason"
    }},
    {{
      "questionType": "TRUE_FALSE",
      "question": "...",
      "correctAnswer": "True",
      "explanation": "one-line reason"
    }},
    {{
      "questionType": "FILL_BLANK",
      "question": "New original sentence with one term replaced by ____.",
      "correctAnswer": "term",
      "acceptableAnswers": ["term", "term variant"],
      "explanation": "one-line reason"
    }},
    {{
      "questionType": "MATCHING",
      "question": "Match each term to its correct definition.",
      "pairs": [
        {{"left": "term1", "right": "definition1"}},
        {{"left": "term2", "right": "definition2"}},
        {{"left": "term3", "right": "definition3"}}
      ],
      "explanation": "one-line reason"
    }}
  ]
}}
"""


# ── Similarity Detection ───────────────────────────────
def simple_text_similarity(text1: str, text2: str) -> float:
    """
    Simple Jaccard similarity for detecting duplicate questions.
    Returns a value between 0 and 1.
    """
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = words1 & words2
    union = words1 | words2
    
    return len(intersection) / len(union) if union else 0.0

def filter_duplicate_questions(questions: List[Dict], threshold: float = 0.7) -> List[Dict]:
    """
    Filter out questions that are too similar to each other.
    Returns a deduplicated list.
    """
    if len(questions) <= 1:
        return questions
    
    filtered = [questions[0]]
    
    for q in questions[1:]:
        is_duplicate = False
        for existing in filtered:
            # Check question text similarity
            sim = simple_text_similarity(q.get("question", ""), existing.get("question", ""))
            if sim >= threshold:
                is_duplicate = True
                break
            
            # Also check if options are too similar
            q_options = " ".join(q.get("options", []))
            existing_options = " ".join(existing.get("options", []))
            opt_sim = simple_text_similarity(q_options, existing_options)
            if opt_sim >= threshold:
                is_duplicate = True
                break
        
        if not is_duplicate:
            filtered.append(q)
    
    return filtered

# ── JSON Validation & Repair ───────────────────────────
def validate_question_structure(question: Dict) -> bool:
    """Validate that a question has all required fields with correct types."""
    required_fields = {
        "question": str,
        "options": list,
        "correct_answer": str,
    }
    
    for field, field_type in required_fields.items():
        if field not in question:
            return False
        if not isinstance(question[field], field_type):
            return False
    
    # Validate options count
    if not isinstance(question["options"], list) or len(question["options"]) != 4:
        return False
    
    # Validate correct_answer is valid index
    if question["correct_answer"] not in ["A", "B", "C", "D", "0", "1", "2", "3"]:
        return False
    
    # Validate all options are non-empty strings
    for opt in question["options"]:
        if not isinstance(opt, str) or not opt.strip():
            return False

    # Ensure option values are unique
    opts_stripped = [str(opt).strip().lower() for opt in question["options"]]
    if len(set(opts_stripped)) < 4:
        return False

    # Ensure question ends with a question mark
    if not str(question["question"]).strip().endswith("?"):
        return False

    # Ensure explanation is present
    if not question.get("explanation") or not str(question.get("explanation")).strip():
        return False
    
    return True

def repair_question(question: Dict, index: int) -> Dict:
    """Attempt to repair a malformed question structure."""
    repaired = {
        "question": str(question.get("question", "Question " + str(index + 1))),
        "options": [],
        "correct_answer": question.get("correct_answer", "A"),
        "explanation": question.get("explanation", "Answer based on document content."),
        "difficulty": question.get("difficulty", "MEDIUM"),
        "bloom_level": question.get("bloom_level", "Understand")
    }
    
    # Fix question ending
    if not repaired["question"].strip().endswith("?"):
        repaired["question"] = repaired["question"].strip() + "?"
    
    # Fix options
    raw_options = question.get("options", [])
    if isinstance(raw_options, list):
        repaired["options"] = [str(o).strip() for o in raw_options[:4]]
        # Pad with placeholder if less than 4
        opt_count = len(repaired["options"])
        while opt_count < 4:
            repaired["options"].append("Option " + chr(65 + opt_count))
            opt_count += 1
    else:
        repaired["options"] = ["Option A", "Option B", "Option C", "Option D"]
        
    # De-duplicate options if any are identical
    unique_opts = []
    seen = set()
    for opt in repaired["options"]:
        opt_lower = opt.lower()
        if opt_lower not in seen:
            seen.add(opt_lower)
            unique_opts.append(opt)
        else:
            placeholder = f"{opt} (Alt)"
            unique_opts.append(placeholder)
            seen.add(placeholder.lower())
    repaired["options"] = unique_opts
    
    # Fix correct_answer
    ca = repaired["correct_answer"]
    if ca not in ["A", "B", "C", "D"]:
        repaired["correct_answer"] = "A"
    
    return repaired

def validate_and_filter_prompt_questions(raw_questions: List[Dict], requested_count: int) -> List[Dict]:
    """
    Validates and filters prompt-based generated questions.
    Ensures:
    - No duplicate questions.
    - No duplicate options within a question.
    - Exactly 4 options exist.
    - Correct answer matches one option text.
    - Explanation is present and non-empty.
    - Question is a complete sentence ending with '?'.
    - Returns a list of formatted, valid questions.
    Raises ValueError if the number of valid questions is less than requested_count.
    """
    if not isinstance(raw_questions, list):
        raise ValueError("Raw questions is not a list")

    valid_questions = []
    seen_questions = set()

    for i, q in enumerate(raw_questions):
        if not isinstance(q, dict):
            continue

        q_text = (q.get("question") or q.get("questionText") or "").strip()
        if not q_text:
            log.warning("Validation failure: question text is empty in question %d", i)
            continue
        if not q_text.endswith("?"):
            log.warning("Validation failure: question does not end with '?' in question %d: '%s'", i, q_text)
            continue

        opt_a = str(q.get("optionA") or q.get("option_a") or "").strip()
        opt_b = str(q.get("optionB") or q.get("option_b") or "").strip()
        opt_c = str(q.get("optionC") or q.get("option_c") or "").strip()
        opt_d = str(q.get("optionD") or q.get("option_d") or "").strip()

        options = [opt_a, opt_b, opt_c, opt_d]

        # Ensure exactly 4 options exist and they are all non-empty
        if any(not opt for opt in options):
            log.warning("Validation failure: one or more options are empty in question %d: %s", i, options)
            continue

        # Remove duplicate options: check if unique options count is less than 4
        if len(set(options)) < 4:
            log.warning("Validation failure: duplicate options found in question %d: %s", i, options)
            continue

        correct = str(q.get("correctAnswer") or q.get("correct_answer") or "").strip()
        if not correct:
            log.warning("Validation failure: correctAnswer is empty in question %d", i)
            continue

        explanation = str(q.get("explanation") or "").strip()
        if not explanation:
            log.warning("Validation failure: explanation is empty in question %d", i)
            continue

        # Map correct answer to option values
        # If correct answer is a letter or index, resolve it to option text
        c_lower = correct.lower()
        correct_val = ""
        if c_lower in ["optiona", "option_a", "opt_a", "a", "option a", "0"]:
            correct_val = opt_a
        elif c_lower in ["optionb", "option_b", "opt_b", "b", "option b", "1"]:
            correct_val = opt_b
        elif c_lower in ["optionc", "option_c", "opt_c", "c", "option c", "2"]:
            correct_val = opt_c
        elif c_lower in ["optiond", "option_d", "opt_d", "d", "option d", "3"]:
            correct_val = opt_d
        else:
            # Check if correct answer matches any option value directly
            if correct in options:
                correct_val = correct
            elif c_lower in [o.lower() for o in options]:
                # find the correct case match
                for o in options:
                    if o.lower() == c_lower:
                        correct_val = o
                        break
            else:
                log.warning("Validation failure: correctAnswer '%s' does not match any option in question %d", correct, i)
                continue

        # Remove duplicate questions (case-insensitive and whitespace-stripped)
        q_norm = q_text.lower()
        if q_norm in seen_questions:
            log.warning("Validation failure: duplicate question text found in question %d: '%s'", i, q_text)
            continue
        seen_questions.add(q_norm)

        # Clean markdown formatting (bold, headers, bullets, backticks)
        def clean_md(t: str) -> str:
            t = re.sub(r"\*\*|##|`", "", t)
            t = re.sub(r"^[•\-\*\+]\s*", "", t)
            return t.strip()

        q_clean = clean_md(q_text)
        opt_a_clean = clean_md(opt_a)
        opt_b_clean = clean_md(opt_b)
        opt_c_clean = clean_md(opt_c)
        opt_d_clean = clean_md(opt_d)
        explanation_clean = clean_md(explanation)
        correct_clean = clean_md(correct_val)

        # Enforce question length limit (max 20 words)
        q_words = q_clean.split()
        if len(q_words) > 20:
            q_clean = " ".join(q_words[:20])
            if not q_clean.endswith("?"):
                q_clean += "?"

        # Put options in a list to shuffle
        options_clean = [opt_a_clean, opt_b_clean, opt_c_clean, opt_d_clean]
        
        # Enforce option length limit (max 8 words)
        for idx, opt in enumerate(options_clean):
            opt_words = opt.split()
            if len(opt_words) > 8:
                options_clean[idx] = " ".join(opt_words[:8])
        
        # Make sure correct_clean value is updated if its corresponding option was truncated
        # We find which index matched the original correct_val, and use that index's clean/truncated version
        orig_options = [opt_a, opt_b, opt_c, opt_d]
        try:
            matched_idx = orig_options.index(correct_val)
            correct_clean = options_clean[matched_idx]
        except ValueError:
            pass

        # Shuffle correct answer position (Shuffle Options)
        random.shuffle(options_clean)

        # Ensure correct answer is still present in options
        if correct_clean not in options_clean:
            options_clean[0] = correct_clean
            random.shuffle(options_clean)

        valid_questions.append({
            "question": q_clean,
            "optionA": options_clean[0],
            "optionB": options_clean[1],
            "optionC": options_clean[2],
            "optionD": options_clean[3],
            "correctAnswer": correct_clean,
            "explanation": explanation_clean
        })

    if len(valid_questions) < requested_count:
        raise ValueError(f"Only generated {len(valid_questions)} valid questions out of {requested_count} requested.")

    return valid_questions[:requested_count]

def _try_json_repair(text: str) -> Tuple[Optional[Any], Optional[str]]:
    """Try to repair malformed JSON using the json-repair library if available."""
    try:
        from json_repair import repair_json
        repaired = repair_json(text, return_objects=True)
        return repaired, None
    except ImportError:
        return None, "json-repair library not installed"
    except Exception as e:
        return None, f"json-repair failed: {e}"


def _extract_question_objects(text: str) -> List[Dict]:
    """
    Last-resort parser: scan for top-level {...} blocks inside the array
    and try to parse each one independently. This recovers as many
    questions as possible when the overall array has syntax errors.
    """
    results: List[Dict] = []
    depth = 0
    start_idx = -1
    in_string = False
    escape = False

    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            if depth == 0:
                start_idx = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start_idx != -1:
                block = text[start_idx:i + 1]
                # Try strict JSON, then json-repair
                try:
                    parsed = json.loads(block)
                    if isinstance(parsed, dict):
                        results.append(parsed)
                except json.JSONDecodeError:
                    repaired, _ = _try_json_repair(block)
                    if isinstance(repaired, dict):
                        results.append(repaired)
                start_idx = -1
    return results


def safe_json_parse(text: str) -> Tuple[List[Dict], List[str]]:
    """
    Safely parse JSON from text, with auto-repair capabilities.
    Returns (parsed_questions, warnings)

    Strategy (in order):
      1. Strip markdown fences and locate the JSON payload.
      2. Try strict json.loads on the cleaned text.
      3. Try json-repair on the cleaned text.
      4. Scan for individual {...} question blocks and parse each.
    """
    warnings: List[str] = []

    if not text or not text.strip():
        warnings.append("Empty response")
        return [], warnings

    cleaned = text.strip()

    # Remove markdown code fences (```json ... ``` or ``` ... ```)
    fence_match = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # Locate JSON payload. Prefer an array; fall back to a top-level object
    # that contains a "questions" array (JSON mode wraps things this way).
    array_start = cleaned.find('[')
    array_end = cleaned.rfind(']')
    obj_start = cleaned.find('{')
    obj_end = cleaned.rfind('}')

    payload = None
    if array_start != -1 and array_end > array_start:
        payload = cleaned[array_start:array_end + 1]
    elif obj_start != -1 and obj_end > obj_start:
        payload = cleaned[obj_start:obj_end + 1]
    else:
        warnings.append("No JSON object or array found in response")
        return [], warnings

    # Light, *safe* fixups (do NOT touch quotes — that breaks apostrophes).
    payload = re.sub(r',\s*([}\]])', r'\1', payload)   # trailing commas
    payload = re.sub(r'}\s*{', '},{', payload)         # missing commas between objects

    def _normalize(parsed: Any) -> List[Dict]:
        """Coerce parsed JSON into a list of question dicts."""
        if isinstance(parsed, list):
            return [q for q in parsed if isinstance(q, dict)]
        if isinstance(parsed, dict):
            for key in ("questions", "quiz", "items", "data", "results"):
                val = parsed.get(key)
                if isinstance(val, list):
                    return [q for q in val if isinstance(q, dict)]
            # Single question wrapped in an object
            if "question" in parsed and "options" in parsed:
                return [parsed]
        return []

    questions: List[Dict] = []

    # Attempt 1: strict parse
    try:
        questions = _normalize(json.loads(payload))
    except json.JSONDecodeError as e:
        warnings.append(f"Strict JSON parse failed: {e}")

    # Attempt 2: json-repair
    if not questions:
        repaired, repair_err = _try_json_repair(payload)
        if repaired is not None:
            questions = _normalize(repaired)
            if questions:
                warnings.append("Recovered using json-repair")
        elif repair_err:
            warnings.append(repair_err)

    # Attempt 3: per-object extraction
    if not questions:
        extracted = _extract_question_objects(payload)
        if extracted:
            questions = extracted
            warnings.append(f"Recovered {len(extracted)} question(s) via per-object extraction")

    if not questions:
        warnings.append("Could not parse any questions from response")
        return [], warnings

    # Validate / repair each question
    valid_questions: List[Dict] = []
    for i, q in enumerate(questions):
        if validate_question_structure(q):
            valid_questions.append(q)
        else:
            warnings.append(f"Question {i + 1} had structural issues - repaired")
            valid_questions.append(repair_question(q, i))

    return valid_questions, warnings

# ── LLM Setup (Gemini only — Groq removed) ────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
raw_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
if raw_model not in ("gemini-2.5-flash", "gemini-2.5-pro"):
    GEMINI_MODEL = "gemini-2.5-pro" if "pro" in raw_model.lower() else "gemini-2.5-flash"
    log.warning(f"Global invalid model '{raw_model}' coerced to '{GEMINI_MODEL}'.")
else:
    GEMINI_MODEL = raw_model
llm = None
llm_type = "None"

if GEMINI_API_KEY and GEMINI_API_KEY not in ("", "your-gemini-api-key-here"):
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.prompts import PromptTemplate
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        # Gemini's native JSON mode (response_mime_type) guarantees valid JSON
        # output — no more "Expecting ',' delimiter" parse failures.
        llm = ChatGoogleGenerativeAI(
            google_api_key=GEMINI_API_KEY,
            model=GEMINI_MODEL,
            temperature=0.2,
            max_output_tokens=8192,
            timeout=120,
            max_retries=3,
            response_mime_type="application/json",
        )
        llm_type = f"Gemini ({GEMINI_MODEL})"
        log.info("✅ LLM initialized with %s (JSON mode enabled)", llm_type)
    except ImportError as e:
        log.error("❌ Missing dependency: %s — run: pip install langchain-google-genai", e)
    except Exception as e:
        log.error("❌ Gemini initialization failed: %s", e)

if llm is None:
    log.warning("⚠️ No Gemini LLM available (GEMINI_API_KEY not set) — using text-based fallback")

# ── Service Instantiations ─────────────────────────────
gemini_client = GeminiClient()
prompt_builder = PromptBuilder()
json_validator = JSONValidator()
duplicate_remover = DuplicateRemover()
option_randomizer = OptionRandomizer()
explanation_generator = ExplanationGenerator()
rag_quiz_generator = RAGQuizGenerator()

# ── Request / Response Models ─────────────────────────
class QuizRequest(BaseModel):
    text: str
    num_questions: int = 10
    difficulty: str = "MIXED"  # EASY, MEDIUM, HARD, MIXED
    training_id: Optional[Any] = None
    course_id: Optional[Any] = None
    question_type: str = "MIXED"
    source_title: Optional[str] = None

class RAGGenerateRequest(BaseModel):
    training_id: Optional[Any] = None
    course_id: Optional[Any] = None
    difficulty: str = "MIXED"
    numberOfQuestions: int = 10
    questionType: str = "MIXED"
    file_path: Optional[str] = None
    mime_type: Optional[str] = None
    source_url: Optional[str] = None
    text: Optional[str] = None
    source_title: Optional[str] = None

class PromptQuizRequest(BaseModel):
    prompt: str
    questionCount: int = 10
    difficulty: str = "Medium"

    @field_validator('questionCount')
    @classmethod
    def validate_count(cls, v):
        if v < 1 or v > 50:
            raise ValueError('Number of questions must be between 1 and 50.')
        return v

    @field_validator('prompt')
    @classmethod
    def validate_prompt(cls, v):
        if not v or not v.strip():
            raise ValueError('Prompt/Topic cannot be empty.')
        return v

class Question(BaseModel):
    questionText: str
    questionType: str = "MCQ"
    options: Optional[List[str]] = None
    correctAnswer: Optional[str] = None
    explanation: Optional[str] = None
    difficulty: str = "MEDIUM"
    order: int = 0

class QuizResponse(BaseModel):
    success: bool
    questions: List[Question]
    message: Optional[str] = None

class EvaluateRequest(BaseModel):
    questionText: str
    modelAnswer: str
    userAnswer: str

class EvaluateResponse(BaseModel):
    score: float
    feedback: str
    isCorrect: bool

# ── Text Extraction ─────────────────────────────────────
def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file."""
    try:
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text[:15000]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(e)}")

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX file."""
    try:
        doc = docx.Document(file_path)
        return "\n".join([p.text for p in doc.paragraphs])[:15000]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DOCX extraction failed: {str(e)}")

def extract_text_from_txt(file_path: str) -> str:
    """Read text file."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()[:15000]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"TXT extraction failed: {str(e)}")

# ── Text Cleaning ─────────────────────────────────────
def clean_text_for_quiz(text: str) -> str:
    """Clean extracted text for better quiz generation."""
    import re
    text = re.sub(r'[\w.-]+?@\w+\.\w{2,}', '[EMAIL]', text)
    text = re.sub(r'https?://\S+', '[URL]', text)
    text = re.sub(r'[|•■◆▪–—]+', ' ', text)
    text = re.sub(r'([a-z])\n([A-Z])', r'\1. \2', text)
    text = re.sub(r'\n{2,}', '. ', text)
    text = re.sub(r'  +', ' ', text)
    return text.strip()

# ── Quiz Generation ─────────────────────────────────────
QUIZ_PROMPT_TEMPLATE = """
You are an expert educational quiz generator. Based ONLY on the provided document content, generate {num_questions} multiple-choice quiz questions.

DOCUMENT CONTENT:
{text}

INSTRUCTIONS:
1. Generate exactly {num_questions} MCQ questions STRICTLY based on the document content above
2. Difficulty: {difficulty}
3. For each question: Provide exactly 4 options (A, B, C, D), mark correct answer as "A", "B", "C", or "D"
4. Do NOT add external information not in the document
5. Ensure questions test understanding, not just memorization
6. Use the document's key concepts and terminology
7. Return ONLY the question text in the question field

OUTPUT FORMAT (return ONLY valid JSON array, no markdown, no explanation):
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "A",
    "explanation": "Why this is correct based on document"
  }}
]

Generate ONLY the JSON array:
"""

MAX_RETRIES = 3


def _parse_retry_delay(text: str) -> int | None:
    """Extract retry_delay seconds from Gemini API error text (JSON or protobuf)."""
    try:
        data = json.loads(text)
        details = data.get("error", {}).get("details", [])
        for d in details:
            rd = d.get("retry_delay") or {}
            if rd.get("seconds"):
                return int(rd["seconds"])
    except Exception:
        pass
    m = re.search(r'retry_delay\s*\{[^}]*seconds:\s*(\d+)', text)
    if m:
        return int(m.group(1))
    return None


def _question_is_grounded(question: Dict, doc_tokens: set) -> bool:
    """
    Heuristic: a question is "grounded" if the question text or its correct
    option contains at least one meaningful (4+ char) token that also appears
    in the document. Helps catch LLM hallucinations where the model invents
    content not present in the source.
    """
    parts = [str(question.get("question", ""))]
    options = question.get("options", []) or []
    ca = str(question.get("correct_answer", "A")).upper()
    if ca in ("A", "B", "C", "D") and len(options) == 4:
        parts.append(str(options[ord(ca) - 65]))
    else:
        parts.extend(str(o) for o in options)

    candidate = " ".join(parts).lower()
    candidate_tokens = {
        t for t in re.findall(r"[a-z][a-z0-9]{3,}", candidate)
        if t not in {"which", "what", "where", "when", "the", "this", "that",
                     "with", "from", "into", "according", "document", "based",
                     "following", "statement", "correct", "describes", "best"}
    }

    return bool(candidate_tokens & doc_tokens)


def filter_grounded_questions(questions: List[Dict], doc_text: str) -> List[Dict]:
    """Drop questions that don't reference any vocabulary from the document."""
    doc_tokens = set(re.findall(r"[a-z][a-z0-9]{3,}", doc_text.lower()))
    if not doc_tokens:
        return questions  # Document too short to validate

    grounded: List[Dict] = []
    dropped = 0
    for q in questions:
        if _question_is_grounded(q, doc_tokens):
            grounded.append(q)
        else:
            dropped += 1
    if dropped:
        log.warning("Dropped %d ungrounded LLM question(s) — no document overlap", dropped)
    return grounded

def generate_cache_key(text: str, num_questions: int, difficulty: str) -> str:
    """Generate a stable cache key based on text content, quantity, and difficulty."""
    hasher = hashlib.md5()
    hasher.update(text.encode('utf-8', errors='ignore'))
    text_hash = hasher.hexdigest()
    return f"quiz_{text_hash}_{num_questions}_{difficulty}"


def generate_quiz_with_langchain(text: str, num_questions: int = 10, difficulty: str = "MIXED") -> Any:
    """
    Generate quiz using a direct multi-step REST API Gemini pipeline (No LangChain/LangGraph).
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        log.warning("No Gemini API key found. Using text-based fallback.")
        fallback_questions = generate_text_based_questions(text, num_questions, difficulty)
        return fallback_questions, "Fallback Quiz"

    # Cleaning text
    cleaned_text = clean_text_for_quiz(text)
    
    # Check cache
    cache_key = generate_cache_key(cleaned_text, num_questions, difficulty)
    cached_result = quiz_cache.get(cache_key)
    if cached_result:
        log.info("✅ Cache hit! Returning cached quiz questions and title")
        return cached_result

    try:
        log.info("Starting direct multi-step Gemini quiz generation pipeline...")

        # STEP 1: CHUNKING & TOPIC EXTRACTION
        # Support large documents (up to 500 pages) by chunking.
        chunk_size = 150000
        overlap = 15000
        
        chunks = []
        if len(cleaned_text) <= chunk_size:
            chunks.append(cleaned_text)
        else:
            log.info(f"Large document detected ({len(cleaned_text)} chars). Chunking into pieces...")
            start = 0
            while start < len(cleaned_text):
                end = min(start + chunk_size, len(cleaned_text))
                chunks.append(cleaned_text[start:end])
                if end == len(cleaned_text):
                    break
                start += chunk_size - overlap
        
        all_topics = []
        subject_domain = "General Knowledge"
        
        for idx, chunk in enumerate(chunks):
            log.info(f"Processing chunk {idx + 1}/{len(chunks)} for Topic Extraction...")
            topic_prompt = prompt_builder.build_topic_prompt(chunk)
            raw_topics_json = gemini_client.generate_content(topic_prompt, temperature=0.2, response_json=True)
            parsed_topics = json_validator.validate_and_parse(raw_topics_json)
            
            if isinstance(parsed_topics, dict):
                subject_domain = parsed_topics.get("subjectDomain", subject_domain)
                chunk_topics = parsed_topics.get("topics", [])
                all_topics.extend(chunk_topics)
            elif isinstance(parsed_topics, list):
                all_topics.extend(parsed_topics)

        # Deduplicate topics by name
        seen_topics = set()
        deduped_topics = []
        for t in all_topics:
            if not isinstance(t, dict):
                continue
            t_name = str(t.get("name", "")).strip()
            if t_name and t_name.lower() not in seen_topics:
                seen_topics.add(t_name.lower())
                deduped_topics.append(t)

        if not deduped_topics:
            raise ValueError("Failed to extract any technical topics from the text.")

        log.info(f"Step 1 complete: Extracted {len(deduped_topics)} unique topics.")

        # STEP 2: CONCEPT EXTRACTION
        topics_json_str = json.dumps(deduped_topics, indent=2)
        concept_prompt = prompt_builder.build_concept_prompt(topics_json_str)
        raw_concepts_json = gemini_client.generate_content(concept_prompt, temperature=0.2, response_json=True)
        parsed_concepts = json_validator.validate_and_parse(raw_concepts_json)
        
        concepts_list = []
        if isinstance(parsed_concepts, dict):
            concepts_list = parsed_concepts.get("concepts", [])
        elif isinstance(parsed_concepts, list):
            concepts_list = parsed_concepts

        # Filter out invalid concepts
        concepts_list = [c for c in concepts_list if isinstance(c, dict) and c.get("concept")]

        if not concepts_list:
            raise ValueError("Failed to extract any core concepts from topics.")

        log.info(f"Step 2 complete: Extracted {len(concepts_list)} concepts.")

        # STEP 3: DEFINITION GENERATION
        concepts_json_str = json.dumps(concepts_list, indent=2)
        definition_prompt = prompt_builder.build_definition_prompt(concepts_json_str)
        raw_definitions_json = gemini_client.generate_content(definition_prompt, temperature=0.1, response_json=True)
        parsed_definitions = json_validator.validate_and_parse(raw_definitions_json)
        
        definitions_list = []
        if isinstance(parsed_definitions, dict):
            definitions_list = parsed_definitions.get("definitions", [])
        elif isinstance(parsed_definitions, list):
            definitions_list = parsed_definitions

        # Merge definitions back into concepts list
        def_map = {str(d.get("concept", "")).strip().lower(): str(d.get("definition", "")).strip() 
                   for d in definitions_list if isinstance(d, dict) and d.get("concept")}
                   
        for c in concepts_list:
            c_name = str(c.get("concept", "")).strip().lower()
            c["definition"] = def_map.get(c_name, "")

        log.info("Step 3 complete: Generated definitions for concepts.")

        # STEP 4: GENERATE MCQS
        def_count = max(1, round(num_questions * 0.20))
        app_count = max(1, round(num_questions * 0.20))
        scen_count = max(1, round(num_questions * 0.20))
        prac_count = max(1, round(num_questions * 0.20))
        concept_count = max(1, num_questions - def_count - app_count - scen_count - prac_count)
        
        counts = {
            "Concept": concept_count,
            "Definition": def_count,
            "Application": app_count,
            "Scenario": scen_count,
            "Practical": prac_count
        }

        concepts_defs_json_str = json.dumps(concepts_list, indent=2)
        quiz_prompt = prompt_builder.build_quiz_prompt(
            concepts_and_definitions_json=concepts_defs_json_str,
            num_questions=num_questions,
            difficulty=difficulty,
            counts=counts
        )
        
        raw_quiz_json = gemini_client.generate_content(quiz_prompt, temperature=0.3, response_json=True)
        parsed_quiz = json_validator.validate_and_parse(raw_quiz_json)
        
        raw_questions = []
        quiz_title = f"{subject_domain} Quiz"
        
        if isinstance(parsed_quiz, dict):
            raw_questions = parsed_quiz.get("questions", [])
            quiz_title = parsed_quiz.get("quizTitle", quiz_title)
        elif isinstance(parsed_quiz, list):
            raw_questions = parsed_quiz

        if not raw_questions:
            raise ValueError("Gemini returned no questions in response.")

        log.info(f"Step 4 complete: Generated {len(raw_questions)} raw questions.")

        # POST-PROCESSING PIPELINE
        # Deduplicate questions
        deduped_qs = duplicate_remover.remove_duplicate_questions(raw_questions)
        
        # Clean duplicate options
        cleaned_qs = duplicate_remover.remove_duplicate_options(deduped_qs)
        
        # Shuffle/Randomize MCQ option position
        shuffled_qs = option_randomizer.randomize_options(cleaned_qs)
        
        # Ensure explanations
        final_qs = explanation_generator.ensure_explanations(shuffled_qs)

        # Standardise the schema structure to return to caller:
        formatted_questions = []
        for i, q in enumerate(final_qs[:num_questions]):
            category = q.get("category", "Concept")
            q_difficulty = q.get("difficulty", difficulty)
            
            # Map categories to bloom levels for compatibility
            bloom_map = {
                "Definition": "Remember",
                "Concept": "Understand",
                "Application": "Apply",
                "Scenario": "Analyze",
                "Practical": "Evaluate"
            }
            bloom_level = bloom_map.get(category, "Understand")
            
            formatted_questions.append({
                "question": q.get("question", f"Question {i+1}"),
                "questionType": "MCQ",
                "options": q.get("options", []),
                "correctAnswer": q.get("correctAnswer", ""),
                "correct_answer": q.get("correct_letter") or q.get("correct_answer") or "",
                "explanation": q.get("explanation", "Based on technical concepts."),
                "difficulty": q_difficulty.upper() if q_difficulty else "MEDIUM",
                "bloom_level": bloom_level
            })

        if not formatted_questions:
            raise ValueError("All generated questions were filtered out or invalid.")

        cache_val = (formatted_questions, quiz_title)
        quiz_cache.set(cache_key, cache_val)
        
        log.info(f"✅ Generated {len(formatted_questions)} questions successfully via direct REST pipeline")
        return formatted_questions, quiz_title

    except Exception as e:
        log.error(f"Direct REST quiz generation failed: {e}. Falling back to text-based generator.", exc_info=True)
        fallback_questions = generate_text_based_questions(text, num_questions, difficulty)
        return fallback_questions, "Fallback Quiz"

def _split_into_sentences(text: str) -> List[str]:
    """Split document text into clean, usable sentences."""
    raw = re.split(r'(?<=[.!?])\s+', text)
    seen = set()
    out = []
    for s in raw:
        s = s.strip()
        # Keep sentences that are reasonably sized AND contain enough words
        if 30 <= len(s) <= 280 and len(s.split()) >= 6 and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _extract_key_terms(text: str) -> List[str]:
    """Extract candidate key terms from the document for question seeding."""
    # Multi-word capitalized phrases (likely concepts, e.g., "REST Assured")
    phrases = re.findall(r'\b[A-Z][A-Za-z\-]+(?:\s+[A-Z][A-Za-z\-]+){1,4}\b', text)
    # Long lowercase technical words (e.g., "photosynthesis")
    long_words = re.findall(r'\b[a-z]{8,}\b', text)
    candidates = phrases + long_words

    # Deduplicate while preserving order, drop common stopwords
    stop = {
        "however", "therefore", "additionally", "furthermore", "moreover",
        "according", "regarding", "concerning", "throughout", "altogether"
    }
    seen = set()
    out = []
    for c in candidates:
        cl = c.lower()
        if cl in stop or cl in seen:
            continue
        seen.add(cl)
        out.append(c)
    return out


def make_question_from_sentence(sentence: str, keyword: str) -> str:
    s_clean = sentence.strip()
    
    # 1. Try to extract a clause starting with the keyword and followed by a copula
    # e.g., "REST Assured, which is a Java library..." -> "REST Assured is a Java library..."
    pattern = re.escape(keyword) + r"\s*(?:,\s*which\s+)?(is|are)\s+(?:a|an|the|used|refers|represents|key)\b"
    match = re.search(pattern, s_clean, re.IGNORECASE)
    
    clause = None
    if match:
        start_idx = match.start()
        # Reconstruct clause to start with keyword and replace ", which is" with "is"
        raw_clause = s_clean[start_idx:].strip()
        # Remove ", which" if present
        clause = re.sub(r"^" + re.escape(keyword) + r"\s*,\s*which\s+", keyword + " ", raw_clause, flags=re.IGNORECASE)
    
    target = clause if clause else s_clean
    keyword_len = len(keyword)
    
    if target[:keyword_len].lower() == keyword.lower():
        rest = target[keyword_len:].strip()
        
        # Check for various copulas
        copulas = [
            ("is used to", "What is used to"),
            ("are used to", "What are used to"),
            ("is a", "Which of the following is defined as a"),
            ("is an", "Which of the following is defined as an"),
            ("is the", "Which of the following is defined as the"),
            ("are a", "Which of the following are defined as"),
            ("are an", "Which of the following are defined as"),
            ("are the", "Which of the following are defined as the"),
            ("refers to", "What refers to"),
            ("represents", "What represents"),
            ("is key to", "Which of the following is key to"),
            ("are key to", "Which of the following are key to"),
            ("is", "Which of the following is"),
            ("are", "Which of the following are")
        ]
        for copula, question_prefix in copulas:
            copula_pattern = r"^" + re.escape(copula) + r"\b"
            if re.match(copula_pattern, rest, re.IGNORECASE):
                pred = rest[len(copula):].strip()
                if pred:
                    if pred.endswith("."):
                        pred = pred[:-1]
                    return f"{question_prefix} {pred}?"

    # Fallback to a cleanly formatted sentence completion question
    blanked = re.sub(re.escape(keyword), "____", sentence, count=1, flags=re.IGNORECASE)
    if "____" not in blanked:
        blanked = sentence.replace(keyword, "____", 1)
    if blanked.endswith("."):
        blanked = blanked[:-1]
    return f"Which option correctly completes the statement: '{blanked}'?"


BANNED_PHRASES = [
    "according to the document", "according to the text", "as mentioned in the",
    "refer to the document", "in the text", "as per the document", "the author",
    "referred to in the", "as described in", "in the document", "the document states"
]


def generate_text_based_questions(text: str, num_questions: int, difficulty: str) -> List[Dict]:
    """
    Last-resort, no-LLM fallback. Produces a mix of MCQ and FILL_BLANK questions.
    """
    import random
    log.info("Generating knowledge-based fallback (MCQ & FILL_BLANK) questions from document...")

    text = clean_text_for_quiz(text)
    sentences = _split_into_sentences(text)
    
    # Filter candidates by length and diary/personal keywords
    candidates = []
    for s in sentences:
        s_lower = s.lower()
        # Filter out personal diary style sentences
        if any(w in s_lower for w in ["yesterday", "today", "tomorrow", " learned", " practicing", " plan to", " afternoon"]):
            continue
        if any(p in s_lower for p in [" i ", " my ", " me ", " we ", " our "]) or s_lower.startswith("i ") or s_lower.startswith("my "):
            continue
        if any(phrase in s_lower for phrase in BANNED_PHRASES):
            continue
        if not (8 <= len(s.split()) <= 25):
            continue
        candidates.append(s)

    # Fallback to general length-filtered sentences if strict candidates are too sparse
    if len(candidates) < num_questions:
        candidates = [s for s in sentences if 8 <= len(s.split()) <= 25]
        
    random.shuffle(candidates)

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail=(
                "Document text is too sparse or unstructured to generate fallback questions. "
                "Please upload a richer document or check that the AI service (LLM) is configured."
            )
        )

    all_key_terms = _extract_key_terms(text)
    default_distractors = ["development", "testing", "framework", "automation", "concept", "system", "database", "method"]

    def pick_keyword(sentence: str) -> Optional[str]:
        words = sentence.split()
        stopwords = {
            "the", "this", "that", "with", "from", "into", "according", "document", "based",
            "following", "statement", "correct", "describes", "best", "which", "what", "where",
            "when", "then", "there", "their", "they", "them", "these", "those", "have", "been",
            "were", "will", "would", "could", "should", "your", "only", "about", "above", "below",
            "specifically", "yesterday", "tomorrow", "today", "afternoon", "morning", "evening",
            "learning", "practicing", "practice", "started", "planning", "plans", "wants", "want",
            "using", "automated", "automation", "testing", "development", "developer", "another",
            "through", "because", "between", "without", "against", "during", "before", "after",
            "under", "first", "second", "third", "about", "could", "would", "should", "might",
            "shall", "cannot", "really", "actually", "specially", "mainly", "mostly", "usually",
            "commonly", "finally", "originally", "initially", "primarily", "secondly", "specifically"
        }
        
        candidates = []
        for w in words:
            clean_w = re.sub(r"[^\w\-\']", "", w)
            if len(clean_w) >= 4 and clean_w.lower() not in stopwords:
                candidates.append(clean_w)
                
        if not candidates:
            return None
            
        candidates.sort(key=len, reverse=True)
        return candidates[0]

    questions: List[Dict] = []
    for i, sentence in enumerate(candidates):
        if len(questions) >= num_questions:
            break
            
        # 1. Try to find a matching multi-word key term first
        keyword = None
        matching_terms = [t for t in all_key_terms if re.search(r"\b" + re.escape(t) + r"\b", sentence, re.IGNORECASE)]
        if matching_terms:
            # Sort by length descending to get the most specific/representative term
            matching_terms.sort(key=len, reverse=True)
            keyword = matching_terms[0]
        else:
            # Fall back to picking the longest single word
            keyword = pick_keyword(sentence)
            
        if not keyword:
            continue
            
        blanked = re.sub(re.escape(keyword), "____", sentence, count=1, flags=re.IGNORECASE)
        if "____" not in blanked:
            blanked = sentence.replace(keyword, "____", 1)
            
        q_type = "MCQ" if len(questions) % 2 == 0 else "FILL_BLANK"

        if q_type == "MCQ":
            possible_distractors = [t for t in all_key_terms if t.lower() != keyword.lower()]
            if len(possible_distractors) < 3:
                possible_distractors += [d for d in default_distractors if d.lower() != keyword.lower()]
            
            unique_distractors = []
            for d in possible_distractors:
                if d.lower() not in [ud.lower() for ud in unique_distractors]:
                    unique_distractors.append(d)
                    if len(unique_distractors) >= 3:
                        break
            
            while len(unique_distractors) < 3:
                unique_distractors.append("Option_" + str(len(unique_distractors)))

            options = [keyword] + unique_distractors[:3]
            random.shuffle(options)
            
            correct_idx = options.index(keyword)
            correct_letter = chr(65 + correct_idx)

            # Generate proper question text without the "____" if possible
            question_text = make_question_from_sentence(sentence, keyword)

            questions.append({
                "question": question_text,
                "questionType": "MCQ",
                "options": options,
                "correct_answer": correct_letter,
                "correctAnswer": keyword,
                "explanation": f"Based on the document context: '{sentence}'",
                "difficulty": difficulty if difficulty != "MIXED" else "MEDIUM",
                "bloom_level": "Remember"
            })
        else:
            questions.append({
                "question": blanked,
                "questionType": "FILL_BLANK",
                "options": [],
                "correctAnswer": keyword,
                "acceptableAnswers": [keyword],
                "explanation": f"The original sentence used '{keyword}' here.",
                "difficulty": difficulty if difficulty != "MIXED" else "MEDIUM",
                "bloom_level": "Remember"
            })

    if not questions:
        raise HTTPException(
            status_code=422,
            detail="Could not generate any fallback questions from the document content."
        )

    log.info("✅ Generated %d fallback questions (MCQ & FILL_BLANK mix)", len(questions))
    return questions


def generate_sample_questions(num_questions: int, difficulty: str) -> List[Dict]:
    """
    DEPRECATED placeholder generator.

    Previously this returned questions like "Sample MCQ 1: What is the main
    concept discussed?" with options ["Option A", "Option B", ...]. Those are
    NOT knowledge-based — they were saved to the DB and shown to participants,
    making the quiz feature look broken.

    We now always raise so the API surface returns a clear error rather than
    silently storing meaningless placeholder questions.
    """
    raise HTTPException(
        status_code=500,
        detail=(
            "Quiz generation failed and no usable knowledge-based fallback was possible. "
            "Please ensure the LLM service is reachable and the document contains enough "
            "structured text."
        )
    )

def evaluate_short_answer(question_text: str, model_answer: str, user_answer: str) -> Dict:
    """Evaluate short answer using AI."""
    if llm is None:
        user_words = set(user_answer.lower().split())
        model_words = set(model_answer.lower().split())
        match_ratio = len(user_words.intersection(model_words)) / max(len(model_words), 1)
        score = min(100.0, match_ratio * 100)
        return {
            "score": score,
            "feedback": "Partial credit based on keyword matching" if score > 0 else "Answer needs improvement",
            "isCorrect": score >= 60
        }
    
    eval_prompt = f"""
You are an expert evaluator. Evaluate the user's answer against the model answer, based ONLY on accuracy.

QUESTION: {question_text}
MODEL ANSWER: {model_answer}
USER ANSWER: {user_answer}

Evaluate and return ONLY valid JSON:
{{
  "score": 75.0,
  "feedback": "Brief feedback here (max 100 chars)",
  "isCorrect": false
}}

Return ONLY the JSON:
"""
    
    try:
        from langchain_core.prompts import PromptTemplate
        
        prompt = PromptTemplate(template=eval_prompt, input_variables=["question_text", "model_answer", "user_answer"])
        chain = prompt | llm
        response = chain.invoke({
            "question_text": question_text,
            "model_answer": model_answer,
            "user_answer": user_answer
        })
        result = response.content
        
        cleaned = result.strip()
        if "{" in cleaned:
            start = cleaned.find('{')
            end = cleaned.rfind('}') + 1
            if start != -1 and end != 0:
                cleaned = cleaned[start:end]
            result_dict = json.loads(cleaned)
            return {
                "score": float(result_dict.get("score", 0)),
                "feedback": result_dict.get("feedback", "Answer evaluated"),
                "isCorrect": result_dict.get("isCorrect", False)
            }
    except Exception as e:
        log.warning("Evaluation error: %s", e)
    
    # Fallback
    user_words = set(user_answer.lower().split())
    model_words = set(model_answer.lower().split())
    match_ratio = len(user_words.intersection(model_words)) / max(len(model_words), 1)
    score = min(100.0, match_ratio * 100)
    return {
        "score": score,
        "feedback": "Partial credit based on keyword matching" if score > 0 else "Answer needs improvement",
        "isCorrect": score >= 60
    }

# ── API Endpoints ─────────────────────────────────────
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    provider = "None"
    model = "None"
    if llm is not None:
        provider = "Gemini"
        model = GEMINI_MODEL

    return {
        "status": "UP" if llm is not None else "DEGRADED",
        "provider": provider,
        "model": model,
        "port": current_port,
        "service": "ai-quiz-generator",
        "llm": llm_type,
        "gemini_key_set": bool(GEMINI_API_KEY and GEMINI_API_KEY != "your-gemini-api-key-here"),
        "rag": {
            "enabled": True,
            "embedding_model": rag_quiz_generator.embeddings.model_name,
            "retrieval_top_k": rag_quiz_generator.config.retrieval_top_k,
            "chunk_size_tokens": rag_quiz_generator.config.chunk_size_tokens,
            "chunk_overlap_tokens": rag_quiz_generator.config.chunk_overlap_tokens,
        },
    }

@app.post("/rag/generate-quiz")
async def generate_rag_quiz(request: RAGGenerateRequest):
    """
    Generate a quiz with the enterprise RAG pipeline.
    Accepts exactly one source: file_path, source_url, or text.
    """
    try:
        return rag_quiz_generator.generate(
            RAGQuizRequest(
                training_id=request.training_id,
                course_id=request.course_id,
                difficulty=request.difficulty,
                number_of_questions=request.numberOfQuestions,
                question_type=request.questionType,
                file_path=request.file_path,
                mime_type=request.mime_type,
                source_url=request.source_url,
                text=request.text,
                source_title=request.source_title,
            )
        )
    except (UnsupportedSourceError, FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except QuizGenerationError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except GeminiTemporaryError as e:
        log.warning("Gemini temporary error after %d retries: %s", e.retries, e.api_message)
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "status": 503,
                "message": "Gemini AI is currently experiencing high demand. Please try again in a few moments.",
            }
        )
    except Exception as e:
        log.error("RAG quiz generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-quiz")
async def generate_quiz(request: QuizRequest):
    """
    Backward-compatible text endpoint, now backed by the RAG pipeline.
    """
    try:
        if not request.text or len(request.text.strip()) < 50:
            raise HTTPException(
                status_code=422,
                detail="Document contains insufficient text."
            )

        if request.num_questions < 1 or request.num_questions > 50:
            raise HTTPException(
                status_code=422,
                detail="Number of questions must be between 1 and 50."
            )

        result = rag_quiz_generator.generate(
            RAGQuizRequest(
                training_id=request.training_id,
                course_id=request.course_id,
                difficulty=request.difficulty,
                number_of_questions=request.num_questions,
                question_type=request.question_type,
                text=request.text,
                source_title=request.source_title or "Provided learning material",
            )
        )
        return {
            "questions": result["questions"],
            "quiz_title": result["title"],
            "metadata": result.get("metadata", {}),
        }
    except HTTPException:
        raise
    except (UnsupportedSourceError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except QuizGenerationError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except GeminiTemporaryError as e:
        log.warning("Quiz generation: Gemini temporary error after %d retries: %s", e.retries, e.api_message)
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "status": 503,
                "message": "Gemini AI is currently experiencing high demand. Please try again in a few moments.",
            }
        )
    except Exception as e:
        log.error("Quiz generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-quiz-legacy")
async def generate_quiz_legacy(request: QuizRequest):
    """
    Legacy whole-text prompt generator kept as an explicit fallback endpoint.
    """
    try:
        res = generate_quiz_with_langchain(
            text=request.text,
            num_questions=request.num_questions,
            difficulty=request.difficulty
        )
        if isinstance(res, tuple):
            questions, quiz_title = res
        else:
            questions = res
            quiz_title = "AI Generated Quiz"
            
        return {
            "questions": questions,
            "quiz_title": quiz_title
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error("Quiz generation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

def generate_mock_prompt_quiz(prompt: str, count: int, difficulty: str) -> List[Dict[str, str]]:
    """Generate mock/fallback MCQ questions when the LLM is unavailable or fails."""
    log.warning("⚠️ Using mock prompt-to-quiz generator fallback for: '%s'", prompt)
    mock_questions = []
    templates = [
        {
            "question": "What is the primary purpose or concept of {prompt}?",
            "optionA": "To streamline and organize core structures in {prompt}.",
            "optionB": "To bypass traditional database models entirely.",
            "optionC": "To compile hardware register values.",
            "optionD": "To host web applications on a local development server.",
            "correctAnswer": "To streamline and organize core structures in {prompt}.",
            "explanation": "The primary objective of {prompt} is to define and streamline its core structures and logical components."
        },
        {
            "question": "Which of the following represents a key benefit of using {prompt}?",
            "optionA": "It increases system latency and memory consumption.",
            "optionB": "It reduces development complexity and enhances modularity.",
            "optionC": "It removes all compiler optimization settings.",
            "optionD": "It mandates the use of proprietary hardware interfaces.",
            "correctAnswer": "It reduces development complexity and enhances modularity.",
            "explanation": "A key advantage of {prompt} is that it modularizes code or systems, leading to lower complexity and better maintainability."
        },
        {
            "question": "When implementing {prompt}, which practice is highly recommended?",
            "optionA": "Writing monolithic routines without error validation.",
            "optionB": "Applying consistent conventions and documenting design patterns.",
            "optionC": "Storing credentials directly in public source code.",
            "optionD": "Hardcoding all runtime parameters and values.",
            "correctAnswer": "Applying consistent conventions and documenting design patterns.",
            "explanation": "For any project involving {prompt}, maintaining code documentation and using clear naming conventions is a best practice."
        },
        {
            "question": "In the context of {prompt}, how is error handling typically managed?",
            "optionA": "By ignoring errors and letting the runtime environment crash.",
            "optionB": "Using standard exception handling mechanisms to catch and log failures.",
            "optionC": "By delegating all exception catching to operating system utilities.",
            "optionD": "By deleting logs to free up local disk space.",
            "correctAnswer": "Using standard exception handling mechanisms to catch and log failures.",
            "explanation": "Robust implementation of {prompt} utilizes try-catch or equivalent conditional error handling blocks to catch and recover from failures."
        },
        {
            "question": "Which of the following is a common pitfall when working with {prompt}?",
            "optionA": "Failing to validate inputs, leading to potential security vulnerabilities or unexpected behavior.",
            "optionB": "Writing clean, commented, and self-documenting code.",
            "optionC": "Optimizing database queries and system queries.",
            "optionD": "Using modern source control systems to track changes.",
            "correctAnswer": "Failing to validate inputs, leading to potential security vulnerabilities or unexpected behavior.",
            "explanation": "Neglecting input validation or proper bounds checking when handling {prompt} can introduce bugs, crashes, or security risks."
        }
    ]
    for i in range(count):
        tpl = templates[i % len(templates)]
        mock_questions.append({
            "question": tpl["question"].format(prompt=prompt),
            "optionA": tpl["optionA"].format(prompt=prompt),
            "optionB": tpl["optionB"].format(prompt=prompt),
            "optionC": tpl["optionC"].format(prompt=prompt),
            "optionD": tpl["optionD"].format(prompt=prompt),
            "correctAnswer": tpl["correctAnswer"].format(prompt=prompt),
            "explanation": tpl["explanation"].format(prompt=prompt)
        })
    return mock_questions

@app.post("/generate-quiz-from-prompt")
async def generate_quiz_from_prompt(request: PromptQuizRequest):
    """
    Generate quiz from a user prompt/topic using Gemini AI.
    Falls back to a mock quiz generator if Gemini is unavailable or fails.
    """
    if llm is None:
        log.warning("No LLM configured. Falling back to mock generator.")
        questions = generate_mock_prompt_quiz(request.prompt, request.questionCount, request.difficulty)
        return {
            "success": True,
            "questions": questions
        }

    try:
        user_prompt = f"""You are a world-class certification exam developer (like AWS, Coursera, Microsoft, and NPTEL). Your goal is to write high-quality, concept-based multiple choice questions that test deep understanding rather than simple recall.

Generate exactly {request.questionCount} high-quality, unique multiple-choice questions on the topic:
"{request.prompt}"

Difficulty level: {request.difficulty}

## TARGET QUESTION MIX
Target this distribution across the quiz:
- 40% Concept Questions (understanding how mechanisms or ideas work)
- 20% Definition Questions (fundamental terminology, rephrased naturally)
- 20% Application Questions (how to use the knowledge practically)
- 20% Scenario Questions (applying concepts in real-world contexts)

## GENERATION RULES
1. **No Referral Openings**: Never start a question with "According to the document", "Based on the document", "Which statement correctly describes", "What does the document say", or similar phrasing.
2. **Rephrase Naturally**: Do not copy sentences or standard definitions directly from textbooks. Understand the underlying concept and explain/question it in your own words.
3. **Standalone Clarity**: Every question must be fully understandable on its own.
4. **Length Constraints**:
   - Question length: Maximum 20 words.
   - Option length: Maximum 8 words. Keep options short, concise, and clean.
5. **Plausible Distractors**:
   - Every question must have exactly 4 options: optionA, optionB, optionC, and optionD.
   - Distractors (wrong answers) must be highly plausible and grammatically aligned, but clearly incorrect.
   - Only one option must be correct.
6. **No Duplicates**: Ensure no duplicate questions or options are generated.
7. **Clean Text**: Do not include markdown formatting (like **, ##, ` backticks, or bullet points) in questions, options, or explanations. Keep them plain text.
8. **One-Line Explanation**: Every question must have a concise, one-line explanation explaining why the correct option is right.
9. **Topic Adaptation**:
   - If the topic contains programming (e.g., Python conditional statements), ensure the questions cover different constructs (like if, if-else, elif, nested if, logical/comparison operators, ternary operator, etc.), syntax, output, debugging, and practical coding concepts. Generate output-based questions, code-analysis, or practical usage questions.
   - If the topic is theoretical, focus on concept verification, real-world application, or scenario solving.
10. **Difficulty Alignment**:
   - Easy: Focus on definitions and basic mechanics.
   - Medium: Focus on concepts and practical application.
   - Hard: Focus on scenario-based problem solving and analytical thinking.
11. **JSON Output Only**: Return ONLY a valid JSON array of objects. Do NOT wrap the JSON in markdown code blocks (such as ```json ... ```). Do NOT include any intro, outro, headings, or notes.

Response Format:
[
  {{
    "question": "Concise standalone question text (max 20 words)?",
    "optionA": "Short option 1 (max 8 words)",
    "optionB": "Short option 2 (max 8 words)",
    "optionC": "Short option 3 (max 8 words)",
    "optionD": "Short option 4 (max 8 words)",
    "correctAnswer": "Exact string of the correct option",
    "explanation": "One-line clear explanation."
  }}
]
"""

        log.info("Generating quiz from prompt: '%s', count=%d, difficulty=%s", 
                 request.prompt, request.questionCount, request.difficulty)
        
        last_error = None
        for attempt in range(1, Config.MAX_RETRIES + 1):
            try:
                log.info("Prompt generation attempt %d/%d...", attempt, Config.MAX_RETRIES)
                response = llm.invoke(user_prompt)
                result = response.content
                
                # Let's clean markdown fences if any
                cleaned = result.strip()
                fence_match = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
                if fence_match:
                    cleaned = fence_match.group(1).strip()
                
                # Check for brackets
                array_start = cleaned.find('[')
                array_end = cleaned.rfind(']')
                if array_start != -1 and array_end > array_start:
                    cleaned = cleaned[array_start:array_end + 1]
                
                # Safe parse
                try:
                    parsed_data = json.loads(cleaned)
                except json.JSONDecodeError:
                    parsed_data, repair_err = _try_json_repair(cleaned)
                
                # Validate and filter prompt questions
                validated_questions = validate_and_filter_prompt_questions(parsed_data, request.questionCount)
                
                log.info("Successfully generated %d questions from prompt", len(validated_questions))
                return {
                    "success": True,
                    "questions": validated_questions
                }
                
            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                # Gemini rate limit (429 RESOURCE_EXHAUSTED) — sleep long enough
                if "429" in error_str or "resource_exhausted" in error_str or "quota" in error_str or "rate" in error_str:
                    retry_delay = _parse_retry_delay(str(e))
                    delay = max(30 * attempt, (retry_delay or 0) + 5)
                    delay = min(delay, 180)
                    log.warning("Gemini rate limit hit on attempt %d — backing off %ds", attempt, delay)
                    await asyncio.sleep(delay)
                    continue
                log.warning("Attempt %d failed: %s", attempt, e)
                if attempt < Config.MAX_RETRIES:
                    await asyncio.sleep(Config.RETRY_DELAY * attempt)
        
        log.warning("Prompt quiz generation via LLM failed. Falling back to mock generator.")
        questions = generate_mock_prompt_quiz(request.prompt, request.questionCount, request.difficulty)
        return {
            "success": True,
            "questions": questions
        }
    except Exception as e:
        log.error("Prompt quiz generation failed: %s. Falling back to mock generator.", e)
        questions = generate_mock_prompt_quiz(request.prompt, request.questionCount, request.difficulty)
        return {
            "success": True,
            "questions": questions
        }


@app.post("/upload-and-generate")
async def upload_and_generate(
    file: UploadFile = File(...),
    num_questions: int = Form(10),
    difficulty: str = Form("MIXED"),
):
    """
    Upload document (PDF, DOCX, PPTX, TXT only) and generate quiz.
    Accepts multipart/form-data.
    """
    try:
        # LAYER 1: STRICT MIME TYPE CHECK
        if file.content_type:
            if file.content_type.startswith("image/"):
                raise HTTPException(
                    status_code=415, 
                    detail="Images are not supported. Please upload PDF, DOCX, or TXT files only."
                )
            
            allowed_mimes = [
                "application/pdf",
                "text/plain",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ]
            if file.content_type not in allowed_mimes:
                raise HTTPException(
                    status_code=415,
                    detail=f"Unsupported file type: {file.content_type}. Only PDF, DOCX, PPTX, and TXT files are allowed."
                )
        
        # LAYER 2: FILE EXTENSION CHECK
        suffix = file.filename.split('.')[-1].lower() if '.' in file.filename else ""
        allowed_extensions = ["pdf", "docx", "pptx", "txt"]
        image_extensions = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif"]
        
        if suffix in image_extensions:
            raise HTTPException(
                status_code=415,
                detail=f"Images (.{suffix}) are not supported. Please upload PDF, DOCX, or TXT files only."
            )
        
        if suffix not in allowed_extensions:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file extension: .{suffix}. Only .pdf, .docx, .pptx, and .txt files are allowed."
            )
        
        # LAYER 3: MAGIC BYTES CHECK
        file_content = await file.read()
        
        if len(file_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
        if len(file_content) > 0:
            if file_content[:8].startswith(b'\x89PNG\r\n\x1a\n'):
                raise HTTPException(status_code=415, detail="PNG images are not supported.")
            if file_content[:3] == b'\xff\xd8\xff':
                raise HTTPException(status_code=415, detail="JPEG images are not supported.")
            if file_content[:6].startswith(b'GIF87a') or file_content[:6].startswith(b'GIF89a'):
                raise HTTPException(status_code=415, detail="GIF images are not supported.")
            if file_content[:2] == b'BM':
                raise HTTPException(status_code=415, detail="BMP images are not supported.")
            if len(file_content) >= 12 and file_content[:4] == b'RIFF' and file_content[8:12] == b'WEBP':
                raise HTTPException(status_code=415, detail="WebP images are not supported.")
        
        # Save as temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{suffix}") as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name
        
        # Generate quiz through RAG. Extraction, cleaning, chunking, embeddings,
        # FAISS retrieval, LLM JSON validation, and retries happen in the RAG layer.
        try:
            result = rag_quiz_generator.generate(
                RAGQuizRequest(
                    difficulty=difficulty,
                    number_of_questions=num_questions,
                    question_type="MIXED",
                    file_path=tmp_path,
                    mime_type=file.content_type,
                    source_title=file.filename,
                )
            )
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        return {
            "success": True,
            "questions": result["questions"],
            "quiz_title": result["title"],
            "metadata": result.get("metadata", {}),
            "message": f"Generated {len(result['questions'])} questions from uploaded document using RAG"
        }
        
    except HTTPException:
        raise
    except (UnsupportedSourceError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except QuizGenerationError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except GeminiTemporaryError as e:
        log.warning("Upload-and-generate: Gemini temporary error after %d retries: %s", e.retries, e.api_message)
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "status": 503,
                "message": "Gemini AI is currently experiencing high demand. Please try again in a few moments.",
            }
        )
    except Exception as e:
        log.error("Upload-and-generate failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/api/trainer/generate-ai-quiz")
async def trainer_generate_ai_quiz(
    training_id: Optional[str] = Form(None),
    difficulty: str = Form("MIXED"),
    numberOfQuestions: int = Form(10),
    questionType: str = Form("MIXED"),
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
):
    """
    FastAPI-native RAG endpoint matching the LMS trainer contract.
    The Node backend exposes the authenticated public route and persists results.
    """
    tmp_path = None
    try:
        if file and url:
            raise HTTPException(status_code=422, detail="Provide either file or url, not both.")
        if not file and not url:
            raise HTTPException(status_code=422, detail="A file or URL is required.")

        request_kwargs = {
            "training_id": training_id,
            "difficulty": difficulty,
            "number_of_questions": numberOfQuestions,
            "question_type": questionType,
        }

        if file:
            suffix = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else ""
            file_content = await file.read()
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{suffix}") as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name
            request_kwargs.update(
                {
                    "file_path": tmp_path,
                    "mime_type": file.content_type,
                    "source_title": file.filename,
                }
            )
        else:
            request_kwargs.update({"source_url": url, "source_title": url})

        return rag_quiz_generator.generate(RAGQuizRequest(**request_kwargs))

    except HTTPException:
        raise
    except (UnsupportedSourceError, FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except QuizGenerationError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except GeminiTemporaryError as e:
        log.warning("Trainer RAG quiz: Gemini temporary error after %d retries: %s", e.retries, e.api_message)
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "status": 503,
                "message": "Gemini AI is currently experiencing high demand. Please try again in a few moments.",
            }
        )
    except Exception as e:
        log.error("Trainer RAG quiz generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.post("/generate-course-structure")
async def generate_course_structure(request: dict):
    """
    Generate a course structure (modules, submodules, topics, subtopics) from
    extracted document text and a trainer prompt.
    """
    try:
        prompt_text = request.get("prompt", "")
        extracted_text = request.get("text", "")
        file_path = request.get("file_path")
        mime_type = request.get("mime_type")

        if not prompt_text.strip():
            raise HTTPException(status_code=422, detail="Prompt is required.")

        # If file_path is provided, extract text using existing TextExtractor
        if file_path and not extracted_text.strip():
            try:
                from rag.config import RAGConfig
                from rag.extraction import TextExtractor
                config = RAGConfig()
                extractor = TextExtractor(config)
                extracted_text = extractor.extract_from_file(file_path, mime_type)
                log.info("Extracted %d chars from file: %s", len(extracted_text), file_path)
            except Exception as e:
                log.warning("Document extraction failed: %s — continuing with prompt only", e)
                extracted_text = ""

        system_prompt = (
            "You are an LMS curriculum expert.\n"
            "Using the following course material and the trainer instructions, "
            "generate a complete enterprise-level course structure.\n\n"
            "Trainer Instructions:\n"
            f"{prompt_text}\n\n"
        )
        if extracted_text.strip():
            # Truncate to fit within Gemini context safely
            truncated = extracted_text[:80000]
            system_prompt += f"Course Material:\n{truncated}\n\n"
        system_prompt += (
            "Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "courseTitle": "string",\n'
            '  "modules": [\n'
            "    {\n"
            '      "title": "string",\n'
            '      "duration": "string (e.g. 4 Hours)",\n'
            '      "description": "string",\n'
            '      "subModules": [\n'
            "        {\n"
            '          "title": "string",\n'
            '          "topics": [\n'
            "            {\n"
            '              "title": "string",\n'
            '              "duration": "string (e.g. 20 mins)"\n'
            "            }\n"
            "          ]\n"
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Create logical Modules.\n"
            "Create Sub Modules within each module.\n"
            "Create Topics within each sub module.\n"
            "Create learning progression.\n"
            "Estimate durations for each module, sub module, and topic.\n"
            "Avoid duplicate topics.\n"
            "Include a courseTitle.\n"
            "Each module MUST have at least one subModule.\n"
            "Each subModule MUST have at least one topic."
        )

        raw_json = gemini_client.generate_content(
            system_prompt,
            temperature=0.3,
            response_json=True,
            doc_name="course-structure",
            file_size="N/A",
            extracted_text_len=len(extracted_text),
            first_500_chars=extracted_text[:500] if extracted_text else "N/A",
        )

        # Parse and validate the JSON
        try:
            structure = json.loads(raw_json)
        except json.JSONDecodeError:
            # Try to extract JSON from the response if wrapped in markdown
            json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
            if json_match:
                structure = json.loads(json_match.group())
            else:
                raise HTTPException(status_code=502, detail="AI returned invalid JSON. Please retry.")

        # Validate basic structure
        if "modules" not in structure or not isinstance(structure["modules"], list):
            raise HTTPException(status_code=502, detail="AI response missing 'modules' array. Please retry.")

        return {"success": True, "structure": structure}

    except HTTPException:
        raise
    except GeminiTemporaryError as e:
        log.error("Gemini temporary error during structure generation: %s", e)
        return JSONResponse(
            status_code=503,
            content={"success": False, "error": f"AI service temporarily unavailable: {e.api_message}", "retryable": True}
        )
    except Exception as e:
        log.error("Course structure generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/normalize-data")
async def normalize_data(request: dict):
    """
    Normalize names and department names using AI.
    Fixes capitalization, spelling, and formatting.
    """
    try:
        names = request.get("names", [])
        departments = request.get("departments", [])

        if not names and not departments:
            return {"success": True, "normalized_names": [], "normalized_departments": []}

        prompt_parts = [
            "You are a data normalization assistant. Normalize the following names and department names.",
            "",
            "RULES:",
            "1. Fix capitalization (title case for names, title case for departments)",
            "2. Fix common misspellings",
            "3. Normalize formatting (remove extra spaces, fix hyphens)",
            "4. Do NOT change the meaning or intent of names",
            "5. Return the original and normalized version for each entry",
            "",
        ]

        if names:
            prompt_parts.append("NAMES TO NORMALIZE:")
            for i, name in enumerate(names, 1):
                prompt_parts.append(f"  {i}. \"{name}\"")
            prompt_parts.append("")

        if departments:
            prompt_parts.append("DEPARTMENTS TO NORMALIZE:")
            for i, dept in enumerate(departments, 1):
                prompt_parts.append(f"  {i}. \"{dept}\"")
            prompt_parts.append("")

        prompt_parts.append(
            "Return ONLY valid JSON:\n"
            "{\n"
            '  "names": [\n'
            '    {"original": "...", "normalized": "..."}\n'
            "  ],\n"
            '  "departments": [\n'
            '    {"original": "...", "normalized": "..."}\n'
            "  ]\n"
            "}"
        )

        raw_json = gemini_client.generate_content(
            "\n".join(prompt_parts),
            temperature=0.1,
            response_json=True,
            doc_name="normalize-data",
        )

        try:
            result = json.loads(raw_json)
        except json.JSONDecodeError:
            json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = {"names": [], "departments": []}

        return {
            "success": True,
            "normalized_names": result.get("names", []),
            "normalized_departments": result.get("departments", []),
        }

    except GeminiTemporaryError as e:
        log.error("Gemini temporary error during normalization: %s", e)
        # Fallback: return original values without normalization
        return {
            "success": True,
            "normalized_names": [{"original": n, "normalized": n.strip().title()} for n in request.get("names", [])],
            "normalized_departments": [{"original": d, "normalized": d.strip().title()} for d in request.get("departments", [])],
        }
    except Exception as e:
        log.error("Data normalization failed: %s", e, exc_info=True)
        # Fallback: return original values with title-case
        return {
            "success": True,
            "normalized_names": [{"original": n, "normalized": n.strip().title()} for n in request.get("names", [])],
            "normalized_departments": [{"original": d, "normalized": d.strip().title()} for d in request.get("departments", [])],
        }


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_answer(request: EvaluateRequest):
    """Evaluate a short answer using AI."""
    try:
        result = evaluate_short_answer(
            question_text=request.questionText,
            model_answer=request.modelAnswer,
            user_answer=request.userAnswer
        )
        return result
    except Exception as e:
        log.error("Evaluation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@app.get("/cache/status")
async def cache_status():
    """Get cache statistics and status."""
    now = datetime.now()
    active_entries = 0
    expired_entries = 0
    
    for key, timestamp in quiz_cache._timestamps.items():
        if now - timestamp < timedelta(seconds=quiz_cache.default_ttl):
            active_entries += 1
        else:
            expired_entries += 1
    
    return {
        "cache_enabled": True,
        "ttl_seconds": quiz_cache.default_ttl,
        "total_entries": len(quiz_cache._cache),
        "active_entries": active_entries,
        "expired_entries": expired_entries,
        "llm_type": llm_type,
        "service_version": "3.0.0"
    }

@app.delete("/cache/clear")
async def clear_cache():
    """Clear all cached quiz generations."""
    quiz_cache.clear()
    log.info("Cache cleared by admin request")
    return {"message": "Cache cleared successfully", "status": "ok"}


# ── Coding Assessment AI endpoints (Modules A & B) ─────
class CodingQuestionRequest(BaseModel):
    topic: str
    difficulty: str = "medium"
    language: str = "any"

class CodeReviewRequest(BaseModel):
    title: str
    language: str = "python"
    code: str
    passed: int = 0
    total: int = 0

CODING_QUESTION_SYSTEM = (
    "You are an expert competitive programming question author. "
    "Generate a coding problem in strict JSON. Return ONLY valid JSON, no markdown.\n"
    "Schema:\n"
    "{\n"
    '  "title": string,\n'
    '  "problem_description": string,\n'
    '  "input_format": string,\n'
    '  "output_format": string,\n'
    '  "constraints": string,\n'
    '  "sample_input": string,\n'
    '  "sample_output": string,\n'
    '  "explanation": string,\n'
    '  "test_cases": [ { "input": string, "expected_output": string, "is_hidden": boolean } ],\n'
    '  "difficulty": "easy"|"medium"|"hard",\n'
    '  "marks": number,\n'
    '  "tags": string[]\n'
    "}\n"
    "Generate exactly 2 visible (is_hidden=false) and 5 hidden (is_hidden=true) test cases. "
    "Suggest marks by difficulty: easy=10, medium=20, hard=30."
)

CODE_REVIEW_SYSTEM = (
    "You are a senior software engineer doing a code review for a student. "
    "Be constructive, educational, and specific. Return ONLY valid JSON, no markdown.\n"
    "Schema:\n"
    "{\n"
    '  "summary": string,\n'
    '  "strengths": string[],\n'
    '  "weaknesses": string[],\n'
    '  "time_complexity": string,\n'
    '  "space_complexity": string,\n'
    '  "suggestions": string[],\n'
    '  "optimized_snippet": string\n'
    "}"
)


def _invoke_json(prompt: str):
    """Invoke the LLM and parse its JSON response (with repair). Returns dict/list or None."""
    response = llm.invoke(prompt)
    text = response.content if hasattr(response, "content") else str(response)
    try:
        return json.loads(text)
    except Exception:
        parsed, _ = _try_json_repair(text)
        return parsed


class CodingProblemsRequest(BaseModel):
    prompt: str
    numProblems: int = 5
    difficulty: str = "MEDIUM"
    languages: str = "javascript,python"

    @field_validator('numProblems')
    @classmethod
    def validate_count(cls, v):
        if v < 1 or v > 20:
            raise ValueError('Number of problems must be between 1 and 20.')
        return v

    @field_validator('difficulty')
    @classmethod
    def validate_difficulty(cls, v):
        v = v.upper()
        if v not in ('EASY', 'MEDIUM', 'HARD', 'MIXED'):
            raise ValueError('Difficulty must be EASY, MEDIUM, HARD, or MIXED.')
        return v


CODING_PROBLEMS_SYSTEM = (
    "You are an expert competitive programming question author. "
    "Generate a set of coding problems in strict JSON. Return ONLY valid JSON, no markdown.\n"
    "Schema:\n"
    "{\n"
    '  "title": string (overall assessment title),\n'
    '  "problems": [\n'
    "    {\n"
    '      "title": string,\n'
    '      "description": string (detailed problem statement),\n'
    '      "constraints": string,\n'
    '      "inputFormat": string,\n'
    '      "outputFormat": string,\n'
    '      "sampleInput": string,\n'
    '      "sampleOutput": string,\n'
    '      "explanation": string,\n'
    '      "difficulty": "EASY"|"MEDIUM"|"HARD",\n'
    '      "programmingLanguage": string,\n'
    '      "starterCode": string (boilerplate code template),\n'
    '      "expectedSolution": string (reference solution),\n'
    '      "timeLimit": number (seconds, default 5),\n'
    '      "memoryLimit": number (MB, default 256),\n'
    '      "marks": number,\n'
    '      "tags": string[],\n'
    '      "testCases": [\n'
    "        {\n"
    '          "input": string,\n'
    '          "expectedOutput": string,\n'
    '          "isHidden": boolean,\n'
    '          "description": string|null\n'
    "        }\n"
    "      ]\n"
    "    }\n"
    "  ]\n"
    "}\n"
    "For each problem, generate exactly 2 visible (isHidden=false) and 5 hidden (isHidden=true) test cases. "
    "Suggest marks by difficulty: EASY=10, MEDIUM=20, HARD=30. "
    "Distribute problems across the requested languages."
)


@app.post("/generate-coding-problems")
async def generate_coding_problems(req: CodingProblemsRequest):
    if llm is None:
        raise HTTPException(status_code=503, detail="LLM not configured")
    prompt = (
        CODING_PROBLEMS_SYSTEM
        + f"\n\nTopic: {req.prompt}. Number of problems: {req.numProblems}. "
        + f"Difficulty: {req.difficulty}. Languages: {req.languages}."
    )
    last_error = None
    for attempt in range(1, Config.MAX_RETRIES + 1):
        try:
            log.info("Generating %d coding problems (attempt %d/%d)...", req.numProblems, attempt, Config.MAX_RETRIES)
            parsed = _invoke_json(prompt)
            if not isinstance(parsed, dict) or "problems" not in parsed:
                raise ValueError("response missing 'problems' array")
            if not isinstance(parsed["problems"], list) or len(parsed["problems"]) == 0:
                raise ValueError("problems array is empty")
            title = parsed.get("title") or f"Coding Assessment: {req.prompt[:60]}"
            return {
                "title": title,
                "problems": parsed["problems"],
                "languages": req.languages.split(","),
            }
        except Exception as e:
            last_error = e
            log.warning("Coding problems generation attempt %d failed: %s", attempt, e)
            if "429" in str(e).lower() or "resource_exhausted" in str(e) or "quota" in str(e):
                retry_delay = _parse_retry_delay(str(e))
                delay = max(30 * attempt, (retry_delay or 0) + 5)
                delay = min(delay, 180)
                log.warning("Rate limit hit on attempt %d — backing off %ds", attempt, delay)
                await asyncio.sleep(delay)
                continue
            if attempt < Config.MAX_RETRIES:
                await asyncio.sleep(Config.RETRY_DELAY * attempt)
    log.error("Coding problems generation failed after %d attempts", Config.MAX_RETRIES)
    raise HTTPException(status_code=422, detail=f"AI failed to generate coding problems: {last_error}")


@app.post("/generate-coding-question")
async def generate_coding_question(req: CodingQuestionRequest):
    if llm is None:
        raise HTTPException(status_code=503, detail="LLM not configured")
    prompt = (
        CODING_QUESTION_SYSTEM
        + f"\n\nTopic: {req.topic}. Difficulty: {req.difficulty}. Language hint: {req.language}."
    )
    try:
        parsed = _invoke_json(prompt)
        if not isinstance(parsed, dict) or "title" not in parsed:
            raise ValueError("malformed question JSON")
        parsed.setdefault("test_cases", [])
        return {"question": parsed}
    except Exception as e:
        log.error("Coding question generation failed: %s", e)
        raise HTTPException(status_code=422, detail="AI returned malformed response. Try again.")


@app.post("/review-code")
async def review_code(req: CodeReviewRequest):
    if llm is None:
        raise HTTPException(status_code=503, detail="LLM not configured")
    prompt = (
        CODE_REVIEW_SYSTEM
        + f"\n\nProblem: {req.title}\nLanguage: {req.language}\n"
        + f"Test results: {req.passed}/{req.total} test cases passed\nCode:\n{req.code}"
    )
    try:
        parsed = _invoke_json(prompt)
        if not isinstance(parsed, dict) or "summary" not in parsed:
            raise ValueError("malformed review JSON")
        return {"review": parsed}
    except Exception as e:
        log.error("Code review failed: %s", e)
        raise HTTPException(status_code=422, detail="AI returned malformed response. Try again.")


def check_and_resolve_port(port: int) -> int:
    """Check if the port is in use; try to terminate any previous instance, else fallback to next available ports."""
    import socket
    import subprocess
    import sys
    
    def is_port_in_use(p: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', p))
                return False
            except socket.error:
                return True

    if not is_port_in_use(port):
        return port

    log.warning(f"Port {port} is occupied. Attempting to terminate previous instance of AI service on this port...")
    try:
        if sys.platform == "win32":
            cmd = f'netstat -ano | findstr LISTENING | findstr :{port}'
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            lines = proc.stdout.strip().split("\n")
            for line in lines:
                parts = line.strip().split()
                if len(parts) >= 5 and f":{port}" in parts[1]:
                    pid = parts[-1]
                    log.warning(f"Found process with PID {pid} occupying port {port}. Terminating...")
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
        else:
            subprocess.run(f"fuser -k -n tcp {port}", shell=True, capture_output=True)
    except Exception as e:
        log.error(f"Error while attempting to terminate process on port {port}: {e}")

    time.sleep(1.5)

    if not is_port_in_use(port):
        log.info(f"Port {port} successfully released.")
        return port

    resolved = port
    while is_port_in_use(resolved):
        log.warning(f"Port {resolved} is still occupied. Scanning next port...")
        resolved += 1
    
    log.info(f"Port resolved to available port: {resolved}")
    return resolved

def validate_startup_config():
    """Validates configuration parameters and environment variables on startup."""
    log.info("🔍 Validating environment and configuration...")
    
    if Config.DEFAULT_CHUNK_SIZE <= 0:
        log.critical("❌ Invalid configuration: DEFAULT_CHUNK_SIZE must be positive.")
        sys.exit(1)
    if Config.DEFAULT_CHUNK_OVERLAP < 0 or Config.DEFAULT_CHUNK_OVERLAP >= Config.DEFAULT_CHUNK_SIZE:
        log.critical("❌ Invalid configuration: DEFAULT_CHUNK_OVERLAP must be non-negative and less than DEFAULT_CHUNK_SIZE.")
        sys.exit(1)
    if Config.MAX_RETRIES < 1:
        log.critical("❌ Invalid configuration: MAX_RETRIES must be at least 1.")
        sys.exit(1)
    if Config.RETRY_DELAY < 0:
        log.critical("❌ Invalid configuration: RETRY_DELAY must be non-negative.")
        sys.exit(1)

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    
    if gemini_key == "your-gemini-api-key-here":
        log.critical("❌ Invalid environment: GEMINI_API_KEY is configured with a placeholder value.")
        sys.exit(1)

    port_str = os.getenv("AI_SERVICE_PORT", "8000")
    try:
        port = int(port_str)
        if port < 1 or port > 65535:
            raise ValueError()
    except ValueError:
        log.critical(f"❌ Invalid environment: AI_SERVICE_PORT '{port_str}' is not a valid port number.")
        sys.exit(1)
        
    log.info("✅ Configuration and environment are valid.")

def log_startup_banner(provider: str, model: str, port: int, health_status: str):
    """Log a colored startup banner with AI service status details."""
    startup_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    banner = f"""
======================================================================
                  LMS AI QUIZ GENERATOR SERVICE
======================================================================
   Startup Time:  {startup_time}
   AI Provider:   {provider}
   Model Name:    {model}
   Server Port:   {port}
   Health Status: {health_status}
======================================================================
"""
    green_start = "\x1b[32;1m"
    ansi_reset = "\x1b[0m"
    for line in banner.strip().split("\n"):
        log.info(f"{green_start}{line}{ansi_reset}")

if __name__ == "__main__":
    import uvicorn
    
    validate_startup_config()
    
    configured_port = int(os.getenv("AI_SERVICE_PORT", 8000))
    resolved_port = check_and_resolve_port(configured_port)
    
    current_port = resolved_port
    
    provider = "None"
    model = "None"
    health_status = "WARNING (GEMINI_API_KEY not set)"
    
    if llm is not None:
        provider = "Gemini"
        model = GEMINI_MODEL
        health_status = "UP"
        
    log_startup_banner(provider, model, resolved_port, health_status)
    
    uvicorn.run(app, host="0.0.0.0", port=resolved_port)
