"""
Wave Init LMS — AI Coding Assessment LangGraph Workflow
========================================================================
Replaces the legacy static/fallback question-bank generation with a
LangGraph-driven, prompt-first pipeline. The ADMIN/TRAINER prompt is the
ONLY source of truth. Nothing is ever pulled from a hardcoded bank.

Workflow nodes (as required by the refactor spec):
  1. validatePromptNode        — sanity-check the trainer prompt.
  2. analyzeIntentNode         — LLM-dynamic intent analysis (no keyword/subtopic banks).
  3. generateQuestionNode      — draft the problem statement(s) from the prompt.
  4. generateRequirementsNode  — input/output format, constraints, marks, starter code,
                                 and complete per-language reference solutions.
  5. generateTestCasesNode     — dynamic public + hidden test cases.
  6. validateQuestionNode      — structural/semantic self-check against the prompt.
  7. validateTestCasesNode     — sandbox-execute reference solutions against test cases.
  8. promptAlignmentCheckNode  — final relevance/alignment review versus the original prompt.
  9. structuredOutputNode      — schema-validated structured JSON output.

Validation loop:
  validateQuestion / validateTestCases / promptAlignmentCheck return
  (isValid, reasons). If invalid it routes back to generateQuestionNode and
  regenerates, up to `max_retries`. On exhausting retries the workflow
  raises/returns an explicit error — it NEVER falls back to a static bank.
"""

from __future__ import annotations

import json
import re
import logging
from typing import Any, Dict, Optional, Callable, List

from langgraph.graph import StateGraph, END
from services.ai_provider import AIProviderError

log = logging.getLogger("coding-workflow")

# ── Defaults ──────────────────────────────────────────────────────────────────
SUPPORTED_LANGUAGE_IDS = {
    "javascript", "python", "java", "cpp", "c", "csharp",
    "typescript", "go", "rust", "php", "kotlin", "swift",
}
DEFAULT_MAX_RETRIES = 3

# A "placeholder" reference solution is never acceptable and triggers regen.
_BANNED_LITERALS = [
    'print("result")', "print('result')",
    'print("output")', "print('output')",
    'print("answer")', "print('answer')",
    'print("done")',   "print('done')",
    'console.log("result")', "console.log('result')",
    'console.log("output")', "console.log('output')",
    'console.log("done")',   "console.log('done')",
]
_BANNED_FRAGMENTS = [
    "solution for generate", "solution for create", "solution for write",
    "# todo", "todo:", "not implemented", "notimplementederror",
    "raise notimplementederror", "pass  # write",
]


def contains_placeholder_solution(code: str) -> bool:
    """True if the reference solution looks like a placeholder / broken stub."""
    if not code or len(str(code).strip()) < 20:
        return True
    lowered = str(code).lower()
    if any(b in lowered for b in _BANNED_LITERALS):
        return True
    if any(b in lowered for b in _BANNED_FRAGMENTS):
        return True
    reads_input = any(tok in lowered for tok in [
        "sys.stdin", "input(", "readfilesync", "scanner", "cin >>", "cin>>",
    ])
    if not reads_input:
        return True
    return False


def _normalise(s: Any) -> str:
    return str(s or "").strip()


def _problem_matches_prompt(problem: Dict[str, Any], prompt: str) -> bool:
    """Keyword-overlap relevance check between a problem and the original prompt."""
    prompt = _normalise(prompt).lower()
    keywords = [
        w for w in re.split(r"[^a-z0-9]+", prompt)
        if len(w) > 2 and w not in {
            "generate", "create", "write", "give", "make", "problem", "problems",
            "questions", "question", "easy", "medium", "hard", "simple", "basic",
            "with", "for", "the", "and", "that", "using", "you", "your", "this",
        }
    ]
    if not keywords:
        return True
    haystack = " ".join([
        _normalise(problem.get("title")),
        _normalise(problem.get("description")),
        " ".join(_normalise(t) for t in problem.get("tags", [])),
    ]).lower()
    return any(k in haystack for k in keywords)


# ── Prompt Templates (each node uses the LIVE trainer prompt, never a bank) ──
def _validate_prompt_prompt(prompt: str) -> str:
    empty_flag = "The prompt is EMPTY." if len(prompt.strip()) == 0 else ""
    return f"""You are a coding-assessment prompt guard.
A trainer supplied the following prompt. Determine whether it is usable for
generating a coding assessment.

{empty_flag}
Rules:
- Require at least ~2 non-trivial words describing a topic/skill.
- Reject as "invalid" only if it is empty, pure gibberish, or contains no
  meaningful programming/topic content. Otherwise treat as valid.
- Prefer extracting a concise normalized topic statement when possible.

Respond with ONLY JSON:
{{"isValid": true|false, "reasons": ["..."], "normalizedPrompt": "..."}}

TRAINER PROMPT:
"\"{prompt}\"
"""


def _analyze_intent_prompt(prompt: str) -> str:
    return f"""You are an expert coding-assessment intent analyzer.
Derive the coding intent from the trainer's prompt. This is an OPEN-ENDED
analysis — do NOT map to a fixed keyword list. Identify the concrete concept(s),
expected constructs, difficulty style, and any forbidden/scope constraints.

Respond with ONLY JSON:
{{
  "primaryConcept": "short high-level concept label",
  "concepts": ["..."],
  "constructs": ["..."],
  "forbiddenConcepts": ["..."],
  "ioNotes": "...",
  "difficultyHint": "...",
  "problemIntent": "one-sentence restatement of what must be tested"
}}

TRAINER PROMPT:
"\"{prompt}\"
"""


def _generate_question_prompt(prompt: str, analysis: Dict[str, Any], count: int,
                              difficulty: str, languages: List[str]) -> str:
    lang_list = ", ".join(languages)
    analysis_json = json.dumps(analysis, indent=2) if analysis else "{}"
    return f"""You are a senior competitive-programming problem author.
A trainer supplied the prompt below. Generate EXACTLY {count} DISTINCT coding
problems STRICTLY derived from this prompt. The prompt is the ONLY source of
truth — never substitute a preset topic.

TRAINER PROMPT: "{prompt}"
INTENT ANALYSIS: {analysis_json}
DIFFICULTY: {difficulty}
TARGET LANGUAGES: [{lang_list}]

For each problem provide (in the JSON below):
- title: unique, self-contained title (do NOT echo the raw prompt verbatim).
- description: complete independent problem statement.
- difficulty: {difficulty}.
- inputFormat / outputFormat / sampleInput / sampleOutput / explanation /
  constraints / marks / timeLimit / memoryLimit.
- tags: relevant topic tags derived ONLY from this prompt.
- starterCode: a minimal template with a single "# Write your solution here"
  placeholder (no working logic).
- expectedSolution: the COMPLETE correct Python reference solution that reads
  stdin, implements the requested construct, and computes a real result.
- languages: for EVERY one of [{lang_list}], an entry
  {{"language": "...", "starterCode": "...", "referenceSolution": "..."}}
  with a complete, correct, runnable reference solution in that language.
- testCases: at least 4 test cases per problem:
    {{"input": "...", "expectedOutput": "...", "isHidden": false|true,
      "description": "..."}}
  with >= 2 visible (incl. the sample) and >= 2 hidden edge cases. EVERY
  expectedOutput must be genuinely computed from its input (never placeholder).

RULES:
- Every problem MUST actually implement the concept(s) from the trainer prompt.
- Never output placeholders; never echo the prompt into title/description.
- Return ONLY valid JSON, no markdown fences.

JSON SCHEMA:
{{
  "problems": [
    {{
      "title": "...", "description": "...", "difficulty": "{difficulty}",
      "inputFormat": "...", "outputFormat": "...", "sampleInput": "...",
      "sampleOutput": "...", "explanation": "...", "constraints": "...",
      "marks": 10, "timeLimit": 5, "memoryLimit": 256, "tags": ["..."],
      "starterCode": "...", "expectedSolution": "...",
      "languages": [
        {{"language": "python", "starterCode": "...", "referenceSolution": "..."}}
      ],
      "testCases": [
        {{"input": "...", "expectedOutput": "...", "isHidden": false, "description": "..."}}
      ]
    }}
  ]
}}
"""


def _generate_requirements_prompt(prompt: str, draft: Dict[str, Any],
                                  languages: List[str]) -> str:
    lang_list = ", ".join(languages)
    draft_json = json.dumps(draft, indent=2)
    return f"""You are a coding-assessment template & requirements engineer.
For the problem(s) below, produce the final requirements: input/output format,
constraints, marks, per-language starter code AND a complete, correct,
runnable reference solution for EVERY language in [{lang_list}].

The reference solution for each language must read from stdin, implement the
exact problem logic, and produce exactly the expectedOutput for each test case.
Never leave placeholders; never omit a requested language.

TRAINER PROMPT: "{prompt}"
DRAFT: {draft_json}

Return ONLY valid JSON mirroring the same problem structure, with a fully
populated "languages" array, "starterCode", and "expectedSolution" for every
problem.
"""


def _generate_test_cases_prompt(prompt: str, problem: Dict[str, Any]) -> str:
    problem_json = json.dumps(problem, indent=2)
    return f"""You are a coding-assessment test-case author and a compiler that
mentally executes code before answering.

TRAINER PROMPT: "{prompt}"
PROBLEM: {problem_json}

Write at least 4 test cases (>=2 visible incl. the sample, >=2 hidden edge
cases such as smallest valid input, a boundary value, and a degenerate case).
For EVERY test case, mentally trace the reference solution against that exact
stdin and confirm expectedOutput matches EXACTLY (including formatting).

Return ONLY valid JSON:
{{
  "testCases": [
    {{"input": "...", "expectedOutput": "...", "isHidden": false, "description": "..."}}
  ]
}}
"""


def _validate_problem_prompt(prompt: str, problem: Dict[str, Any]) -> str:
    problem_json = json.dumps(problem, indent=2)
    return f"""You are a coding-assessment validator.
Review the following AI-generated problem against the original trainer prompt.

TRAINER PROMPT: "{prompt}"
PROBLEM: {problem_json}

Check:
1. STRUCTURE: title & description present & non-trivial; starter code + reference
   solution present for every requested language; reference solutions are not
   placeholders and read from stdin.
2. SEMANTICS: the problem genuinely tests the concept(s) from the trainer prompt
   and does not drift to an unrelated topic.

Return ONLY valid JSON:
{{"isValid": true|false, "reasons": ["..."]}}
"""


def _validate_test_cases_prompt(prompt: str, problem: Dict[str, Any]) -> str:
    problem_json = json.dumps(problem, indent=2)
    return f"""You are a coding-assessment test-case validator.
Review the test cases and reference solutions of the following problem against
the original trainer prompt.

TRAINER PROMPT: "{prompt}"
PROBLEM: {problem_json}

Check each test case: input is well-formed for the stated input format, and the
expectedOutput is plausible/correct for that input (no placeholders). Ensure
hidden test cases exist (`isHidden: true`) and are NOT derivable from the sample.

Return ONLY valid JSON:
{{"isValid": true|false, "reasons": ["..."]}}
"""


def _alignment_prompt(prompt: str, problems: List[Dict[str, Any]]) -> str:
    problems_json = json.dumps(problems, indent=2)
    return f"""You are a final prompt-alignment reviewer.
A trainer asked for a coding assessment with this prompt: "{prompt}"

ASSESSMENT:
{problems_json}

Determine whether EVERY problem is on-topic — i.e. strictly derived from and
aligned with the trainer prompt. Flag any problem that introduces unrelated
topics or drops the requested concept.

Return ONLY valid JSON:
{{"isAligned": true|false, "offTopicProblems": ["<titles>"], "reasons": ["..."]}}
"""


# ── Node implementations ─────────────────────────────────────────────────────
class CodingWorkflowState(dict):
    """Mutable dict used as the LangGraph state."""


def _safe_invoke_json(invoke_json: Callable, prompt: str) -> Optional[Any]:
    try:
        raw = invoke_json(prompt)
    except AIProviderError:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning("LLM invoke failed in workflow: %s", e)
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw


def validate_prompt_node(state: Dict[str, Any]) -> Dict[str, Any]:
    prompt = _normalise(state.get("prompt"))
    state["_trace"].append("validatePromptNode")
    if len(prompt) < 3:
        state["error"] = "Prompt is too short to generate a coding assessment."
        return state

    parsed = _safe_invoke_json(state["invoke_json"], _validate_prompt_prompt(prompt))
    if isinstance(parsed, dict) and parsed.get("isValid") is False:
        state["error"] = "; ".join(str(r) for r in parsed.get("reasons", [])) or "Prompt rejected."
        return state
    if isinstance(parsed, dict) and parsed.get("normalizedPrompt"):
        state["normalizedPrompt"] = _normalise(parsed["normalizedPrompt"])
    elif not state.get("normalizedPrompt"):
        state["normalizedPrompt"] = prompt

    state["validation"] = {
        "stage": "prompt",
        "isValid": True,
        "reasons": [],
    }
    return state


def analyze_intent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("analyzeIntentNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    parsed = _safe_invoke_json(state["invoke_json"], _analyze_intent_prompt(prompt))
    analysis = parsed if isinstance(parsed, dict) else {}
    analysis["rawPrompt"] = prompt
    state["analysis"] = analysis
    return state


def generate_question_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("generateQuestionNode")
    state["_attempts"] = int(state.get("_attempts", 0)) + 1
    attempts = state["_attempts"]
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    analysis = state.get("analysis") or {}
    count = int(state.get("count", 1))
    difficulty = state.get("difficulty", "MEDIUM")
    languages = state.get("languages", ["javascript", "python"])

    log.info("[coding-workflow] generateQuestionNode attempt %s/%s for prompt '%s'",
             attempts, state.get("max_retries", DEFAULT_MAX_RETRIES), prompt)

    parsed = _safe_invoke_json(
        state["invoke_json"],
        _generate_question_prompt(prompt, analysis, count, difficulty, languages),
    )
    problems = []
    if isinstance(parsed, dict) and isinstance(parsed.get("problems"), list):
        problems = parsed["problems"]
    elif isinstance(parsed, list):
        problems = parsed

    state["draft"] = []
    state["draft_issues"] = []
    for p in problems:
        if isinstance(p, dict):
            p.setdefault("languages", [])
            p.setdefault("testCases", [])
            state["draft"].append(p)
    return state


def generate_requirements_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("generateRequirementsNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    languages = state.get("languages", ["javascript", "python"])
    draft = state.get("draft") or []

    for i, problem in enumerate(draft):
        parsed = _safe_invoke_json(
            state["invoke_json"], _generate_requirements_prompt(prompt, problem, languages)
        )
        if isinstance(parsed, dict):
            for key in ("inputFormat", "outputFormat", "constraints", "marks",
                        "timeLimit", "memoryLimit", "starterCode", "expectedSolution"):
                if key in parsed and parsed[key] is not None:
                    problem[key] = parsed[key]
            if isinstance(parsed.get("languages"), list) and parsed["languages"]:
                problem["languages"] = parsed["languages"]
        draft[i] = problem
    state["draft"] = draft
    return state


def generate_test_cases_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("generateTestCasesNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    draft = state.get("draft") or []

    for i, problem in enumerate(draft):
        parsed = _safe_invoke_json(state["invoke_json"], _generate_test_cases_prompt(prompt, problem))
        if isinstance(parsed, dict) and isinstance(parsed.get("testCases"), list):
            problem["testCases"] = parsed["testCases"]
            # Guarantee at least one hidden case for a dynamic-but-secure set.
            if not any(tc.get("isHidden") for tc in problem["testCases"]):
                for tc in problem["testCases"]:
                    if tc.get("isHidden") is not None:
                        tc["isHidden"] = True
                        break
        if not problem.get("testCases"):
            problem["testCases"] = []
        draft[i] = problem
    state["draft"] = draft
    return state


def validate_question_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("validateQuestionNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    draft = state.get("draft") or []
    count = int(state.get("count", 1))
    issues = []

    if len(draft) < count:
        issues.append(
            f"generated {len(draft)} of {count} requested problem(s) — LLM produced an incomplete result"
        )

    for i, p in enumerate(draft):
        if not _normalise(p.get("title")):
            issues.append(f"problem {i + 1}: missing title")
        if len(_normalise(p.get("description"))) < 10:
            issues.append(f"problem {i + 1}: missing/short description")
        for lc in p.get("languages", []):
            lang = _normalise(lc.get("language"))
            if contains_placeholder_solution(lc.get("referenceSolution")):
                issues.append(f"problem {i + 1} ({lang}): placeholder reference solution")
        if not p.get("testCases"):
            issues.append(f"problem {i + 1}: no test cases")

        parsed = _safe_invoke_json(state["invoke_json"], _validate_problem_prompt(prompt, p))
        if not isinstance(parsed, dict) or parsed.get("isValid") is not True:
            parsed = parsed if isinstance(parsed, dict) else {}
            issues.append(f"problem {i + 1}: " + "; ".join(
                str(r) for r in parsed.get("reasons", [])))

    state["validation"] = {"stage": "question", "isValid": len(issues) == 0, "reasons": issues}
    state["draft_issues"] = issues
    return state


def _sandbox_validate(problem: Dict[str, Any], languages: List[str],
                      execute_fn: Callable) -> List[str]:
    issues = []
    langs_map = {str(lc.get("language", "")).lower(): lc for lc in problem.get("languages", [])}
    test_cases = problem.get("testCases", []) or []
    if not test_cases:
        return ["no test cases to execute"]
    for lang in languages:
        lang = str(lang).strip().lower()
        entry = langs_map.get(lang)
        ref = (entry or {}).get("referenceSolution", "")
        if not ref:
            ref = problem.get("expectedSolution", "") if lang == "python" else ""
        if not ref or contains_placeholder_solution(ref):
            issues.append(f"{lang}: missing/placeholder reference solution")
            continue
        for idx, tc in enumerate(test_cases):
            res = execute_fn(
                code=ref,
                language=lang,
                stdin_input=str(tc.get("input", "")),
                expected_output=str(tc.get("expectedOutput", "")),
                time_limit=float(problem.get("timeLimit", 5) or 5),
            )
            if not res.get("passed", False):
                issues.append(
                    f"{lang} failed test case {idx + 1}: expected "
                    f"'{tc.get('expectedOutput')}', got '{res.get('actualOutput', '')}'"
                )
    return issues


def validate_test_cases_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("validateTestCasesNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    draft = state.get("draft") or []
    languages = state.get("languages", ["javascript", "python"])
    execute_fn = state.get("execute_fn")
    issues = []

    for i, p in enumerate(draft):
        if execute_fn is not None:
            issues.extend(f"problem {i + 1}: {x}" for x in _sandbox_validate(p, languages, execute_fn))
        parsed = _safe_invoke_json(state["invoke_json"], _validate_test_cases_prompt(prompt, p))
        if not isinstance(parsed, dict) or parsed.get("isValid") is not True:
            parsed = parsed if isinstance(parsed, dict) else {}
            issues.append(f"problem {i + 1}: " + "; ".join(
                str(r) for r in parsed.get("reasons", [])))

    state["validation"] = {"stage": "test_cases", "isValid": len(issues) == 0, "reasons": issues}
    if issues:
        state["draft_issues"] = (state.get("draft_issues") or []) + issues
    return state


def prompt_alignment_check_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("promptAlignmentCheckNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    draft = state.get("draft") or []

    off_topic = [p.get("title", "") for p in draft if not _problem_matches_prompt(p, prompt)]
    if off_topic:
        state["validation"] = {
            "stage": "alignment",
            "isValid": False,
            "reasons": [f"Off-topic problems: {off_topic}"],
        }
        state["draft_issues"] = (state.get("draft_issues") or []) + [f"Off-topic: {off_topic}"]
        return state

    parsed = _safe_invoke_json(state["invoke_json"], _alignment_prompt(prompt, draft))
    if not isinstance(parsed, dict) or parsed.get("isAligned") is not True:
        parsed = parsed if isinstance(parsed, dict) else {}
        titles = parsed.get("offTopicProblems") or []
        reasons = parsed.get("reasons") or []
        state["validation"] = {
            "stage": "alignment",
            "isValid": False,
            "reasons": [f"Off-topic: {titles}", *reasons],
        }
        state["draft_issues"] = (state.get("draft_issues") or []) + \
            [f"Off-topic: {titles}"] + list(reasons)
        return state

    state["validation"] = {"stage": "alignment", "isValid": True, "reasons": []}
    return state


def _sanitise_title(raw: str, idx: int, prompt: str) -> str:
    t = _normalise(raw).strip("\"'`")
    if prompt:
        t = re.sub(r"^{}".format(re.escape(prompt)), "", t, flags=re.IGNORECASE).strip(" :-")
    t = re.sub(r"^(?:generate|create|write|give\s+me)\s+\d*\s*(?:problems?|questions?)(?:\s+on\s+[^:]+)?[:\s-]*", "", t, flags=re.IGNORECASE).strip()
    t = re.sub(r"\s*\(Part\s*\d+\)$", "", t, flags=re.IGNORECASE).strip()
    if not t or len(t) < 3:
        t = f"Coding Challenge {idx + 1}"
    return t


def structured_output_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("structuredOutputNode")
    prompt = state.get("normalizedPrompt") or state.get("prompt") or ""
    draft = state.get("draft") or []
    languages = state.get("languages", ["javascript", "python"])

    final_problems = []
    for idx, p in enumerate(draft):
        title = _sanitise_title(p.get("title", ""), idx, prompt)
        test_cases = p.get("testCases", [])

        lang_configs = []
        for lc in p.get("languages", []):
            lang = _normalise(lc.get("language"))
            if lang and lang in [str(x).strip().lower() for x in languages]:
                lang_configs.append({
                    "language": lang,
                    "starterCode": _normalise(lc.get("starterCode")),
                    "referenceSolution": _normalise(lc.get("referenceSolution")),
                })

        final_problems.append({
            "title": title,
            "description": _normalise(p.get("description")),
            "constraints": _normalise(p.get("constraints")) or "Time Limit: 5.0s, Memory Limit: 256MB",
            "inputFormat": _normalise(p.get("inputFormat")) or "Standard input format",
            "outputFormat": _normalise(p.get("outputFormat")) or "Standard output format",
            "sampleInput": _normalise(p.get("sampleInput")) or (test_cases[0]["input"] if test_cases else ""),
            "sampleOutput": _normalise(p.get("sampleOutput")) or (test_cases[0]["expectedOutput"] if test_cases else ""),
            "explanation": _normalise(p.get("explanation")),
            "difficulty": _normalise(p.get("difficulty")) or state.get("difficulty", "MEDIUM"),
            "programmingLanguage": languages[0] if languages else "javascript",
            "starterCode": _normalise(p.get("starterCode")),
            "expectedSolution": _normalise(p.get("expectedSolution")),
            "languages": lang_configs,
            "timeLimit": p.get("timeLimit", 5),
            "memoryLimit": p.get("memoryLimit", 256),
            "marks": p.get("marks", 20),
            "tags": p.get("tags", ["coding"]),
            "testCases": test_cases,
            "validationStatus": "VALIDATED",
            "validationDetail": None,
            "allPassed": True,
        })

    state["output"] = {
        "title": f"Coding Assessment: {_normalise(prompt).capitalize()}",
        "languages": languages,
        "problems": final_problems,
        "allPassed": True,
        "trace": list(state["_trace"]),
        "attempts": state["_attempts"],
    }
    return state


# ── Graph construction & routing ─────────────────────────────────────────────
def fail_node(state: Dict[str, Any]) -> Dict[str, Any]:
    state["_trace"].append("failNode")
    reasons = "; ".join(str(i) for i in (state.get("draft_issues") or []))
    state["error"] = (
        "Coding assessment generation failed after {} attempt(s). {}".format(
            state.get("_attempts", 0), reasons
        ).strip()
    )
    return state


def _needs_regenerate(state: Dict[str, Any]) -> bool:
    validation = state.get("validation") or {}
    if validation.get("isValid") is not False:
        return False
    attempts = state.get("_attempts", 0)
    max_retries = int(state.get("max_retries", DEFAULT_MAX_RETRIES))
    return attempts < max_retries


def _regenerate_route(state: Dict[str, Any]) -> str:
    if _needs_regenerate(state):
        return "generate"
    return "fail"


def _post_validate_route(state: Dict[str, Any]) -> str:
    validation = state.get("validation") or {}
    if validation.get("isValid") is False:
        return _regenerate_route(state)  # "generate" or "fail"
    return "continue"


def _build_graph() -> Any:
    g = StateGraph(dict)

    g.add_node("validatePrompt", validate_prompt_node)
    g.add_node("analyzeIntent", analyze_intent_node)
    g.add_node("generateQuestion", generate_question_node)
    g.add_node("generateRequirements", generate_requirements_node)
    g.add_node("generateTestCases", generate_test_cases_node)
    g.add_node("validateQuestion", validate_question_node)
    g.add_node("validateTestCases", validate_test_cases_node)
    g.add_node("promptAlignment", prompt_alignment_check_node)
    g.add_node("structuredOutput", structured_output_node)
    g.add_node("fail", fail_node)

    g.set_entry_point("validatePrompt")
    g.add_edge("validatePrompt", "analyzeIntent")
    g.add_edge("analyzeIntent", "generateQuestion")
    g.add_edge("generateQuestion", "generateRequirements")
    g.add_edge("generateRequirements", "generateTestCases")
    g.add_edge("generateTestCases", "validateQuestion")
    g.add_conditional_edges(
        "validateQuestion",
        _post_validate_route,
        {"continue": "validateTestCases", "generate": "generateQuestion", "fail": "fail"},
    )
    g.add_conditional_edges(
        "validateTestCases",
        _post_validate_route,
        {"continue": "promptAlignment", "generate": "generateQuestion", "fail": "fail"},
    )
    g.add_conditional_edges(
        "promptAlignment",
        _post_validate_route,
        {"continue": "structuredOutput", "generate": "generateQuestion", "fail": "fail"},
    )
    g.add_edge("structuredOutput", END)
    g.add_edge("fail", END)
    return g


# Compiled graph (lazy)
_COMPILED = None


def get_compiled_graph():
    global _COMPILED
    if _COMPILED is None:
        _COMPILED = _build_graph().compile()
    return _COMPILED


# ── Public orchestrator ──────────────────────────────────────────────────────
def run_coding_workflow(
    prompt: str,
    invoke_json: Callable,
    execute_fn: Optional[Callable] = None,
    count: int = 1,
    difficulty: str = "MEDIUM",
    languages: Optional[List[str]] = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Runs the full LangGraph workflow. Returns the structured result from
    structuredOutputNode, or raises a RuntimeError on failure (never a
    static-bank fallback).
    """
    sanitised_lang = [str(l).strip().lower() for l in (languages or ["javascript", "python"]) if str(l).strip().lower() in SUPPORTED_LANGUAGE_IDS]
    if not sanitised_lang:
        sanitised_lang = ["javascript", "python"]

    initial = {
        "prompt": _normalise(prompt),
        "normalizedPrompt": "",
        "count": int(count),
        "difficulty": str(difficulty).upper(),
        "languages": sanitised_lang,
        "max_retries": int(max_retries),
        "invoke_json": invoke_json,
        "execute_fn": execute_fn,
        "draft": [],
        "analysis": {},
        "validation": {},
        "draft_issues": [],
        "error": None,
        "output": None,
        "debug": bool(debug),
        "_trace": [],
        "_attempts": 0,
    }

    graph = get_compiled_graph()
    result = graph.invoke(initial)

    if result.get("error"):
        raise RuntimeError(result["error"])
    if result.get("output") is None:
        if result.get("draft_issues"):
            raise RuntimeError(
                "Coding assessment generation failed after {} attempt(s): {}".format(
                    result.get("_attempts", 0),
                    "; ".join(str(i) for i in result["draft_issues"]),
                )
            )
        raise RuntimeError("Coding assessment generation failed after {} attempt(s).".format(result.get("_attempts", 0)))

    return result["output"]
