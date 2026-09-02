# Coding Assessment AI Generation — Prompt-First Conversion & LangGraph Audit Report

**Date:** 2026-09-02
**Scope:** LMS Coding Assessment AI generation pipeline (trainer-prompt → dynamic problems).
**Outcome:** The Admin/Trainer prompt is now the **only** source of truth. All static/predefined/fallback question banks have been removed from the active generation flow, and generation is orchestrated by a **9-node LangGraph workflow** in the Python `ai-service`.

---

## 1. The Starting Point (defects being addressed)

The live generation flow was:
`codingAssessmentController.generateFromPrompt` / `generateProblemsForAssessment`
→ `aiService.generateCodingProblemsFromPrompt` (Gemini direct first, then Python microservice)
→ Python `/generate-coding-problems`

The Python handler still contained **static fallback banks** that engaged whenever Gemini output was partial or missing:
- `main.py` top-up that "padded partial Gemini output".
- `main.py` resilient fallback, both calling `generate_fallback_coding_problems`
  → `generate_algorithmic_problems` from a hard-coded `ALGORITHMIC_CATALOG` (loops/arrays/sorting templates).

Anyone generating an off-bank/novel topic would silently receive unrelated canned questions. In addition, `/generate-coding-question` shipped a hard-coded placeholder `sample_result` fallback problem.

## 2. Target Design

- **LangGraph workflow** in the Python `ai-service` (`coding_workflow.py`) with these exact nodes:
  `validatePromptNode`, `analyzeIntentNode`, `generateQuestionNode`, `generateRequirementsNode`, `generateTestCasesNode`, `validateQuestionNode`, `validateTestCasesNode`, `promptAlignmentCheckNode`, `structuredOutputNode` (plus a `failNode`).
- **Regeneration loop:** any validation failure routes back to `generateQuestionNode` up to `max_retries`. On exhaustion the workflow **fails honestly** (RuntimeError → HTTP 502) — it never falls back to a static bank.
- **Count enforcement:** a draft that yields fewer than the requested problem count is treated as a failed attempt (LLM incomplete/empty) and triggers regenerate → honest failure, so zero-problem successes can no longer slip out.
- **Hidden test cases:** guaranteed ≥1 per problem and only used by the server-side judge; never exposed to participants (verified — see §6).

## 3. Changes Made

### ai-service (Python)
| File | Change |
|---|---|
| `coding_workflow.py` | **New.** 9-node LangGraph `StateGraph(dict)`; dynamic per-node LLM prompt templates; sandboxed reference-solution validation (`execute_code_sandbox`); `contains_placeholder_solution` rejections; `_sanitise_title`; `run_coding_workflow(...)` returns `{title, languages, problems, allPassed, trace, attempts}`; `RuntimeError` on failure (no static fallback). |
| `main.py` | Rewrote `/generate-coding-problems` to call `run_coding_workflow(...)`; removed the entire dead static-bank cluster (`ALGORITHMIC_CATALOG`, `generate_fallback_coding_problems`, `classify_topic_category`, `sanitize_problem_title_py`, `contains_placeholder_solution`, `is_description_echoing_prompt`, `language_config_is_complete`, `problem_matches_category`, `validate_problem_all_languages`, `self_correct_problem_language`, `is_problem_topic_relevant_py`) and unused `CODING_PROBLEMS_SYSTEM`. Rewrote `/generate-coding-question` to drop the hard-coded `sample_result` fallback and raise an honest HTTP 502 instead. |
| `requirements.txt` | Added `langgraph>=0.2.0` (resolved 1.2.11). |
| `coding_synthesizer.py` | **Deleted.** Contained the static `ALGORITHMIC_CATALOG` / `generate_algorithmic_problems`. |
| `coding_service.py` | **Deleted.** No longer part of the active flow. |
| `tests/test_coding_generation_bugfix.py` | **Deleted.** Exercised the removed static catalog. |
| `tests/test_coding_workflow_harness.py` | **Kept/updated.** Offline LangGraph harness — now 4 scenarios: clean 9-node run, regeneration on validation failure, persistent-failure honest error, empty-LLM-result honest error. **All pass.** |

### backend (Node)
| File | Change |
|---|---|
| `services/aiService.js` | `generateLanguageCode` now **throws an honest error** instead of invoking the undefined `_generateTopicLanguageCode` static-template fallback. Removed dead `_languageTemplates` / `_languageConfig` static placeholder-reference maps. |
| `controllers/codingAssessmentController.js` | Both AI handlers now capture `analyzePromptIntent(...)` and persist `originalPrompt`, `analyzedIntent`, `generationVersion='langgraph-workflow-v1'`, and per-problem `validationResult` on the assessment/problem records. |
| `models/codingAssessment.js`, `models/codingProblem.js` | Added `original_prompt`, `analyzed_intent`, `generation_version`, `validation_result` fields. |
| `config/bootstrapCodingSchema.js` | Added additive column migrations for the new fields (dialect-agnostic, non-destructive). |
| `utils/languageTemplates.js` | `getDefaultReferenceSolution` removed from use (no longer imported); `getDefaultStarterCode` retained (presentational starter scaffold only — no solution). |

### Frontend
No functional changes required. The trainer `CourseCodingTab` / `TrainerCodingAssessmentDetails` UI already passes the prompt through to the dynamic endpoint; no static banks existed to remove on the client.

## 4. How Static Content Was Eliminated vs. Retained

**Removed from the active flow / deleted:**
- `ALGORITHMIC_CATALOG`, `generate_algorithmic_problems`, `generate_fallback_coding_problems`, `classify_topic_category`, `coding_synthesizer.py`, `coding_service.py`.
- Hard-coded `/generate-coding-question` `sample_result` fallback.
- `generateLanguageCode` static reference-solution templates.
- Static **reference-solution** fallbacks in `languageTemplates.js` (removed from active imports).

**Retained (justified):**
- `getDefaultStarterCode` — emits a *structural skeleton with no solution logic* (a starter template, not an answer). This is participant-presentational, not a question bank. It is never used as a correct reference solution.
- `codingIntentAnalyzer.CATEGORIES` + `extractRequestedProblemCount` / `analyzePromptIntent` — lightweight prompt parsing for count & intent metadata; not a question bank. Note `SUBTOPIC_BANK` was already dead on the active generation path.
- `LangGraph StateGraph(dict)` — dynamic; cleared of static banks.

## 5. Validation Pipeline Behaviour

- On any `validateQuestionNode` / `validateTestCasesNode` / `promptAlignmentCheckNode` failure, or when `len(draft) < count`, the conditional edge routes back to `generateQuestionNode`.
- After `max_retries` exhausted → `failNode` → `RuntimeError("Coding assessment generation failed after N attempt(s). …")` → HTTP 502. **Never** a static-bank fallback.

## 6. Hidden Test-Case Security (audited)

An independent sweep of backend routes + worker + frontend found **no participant-reachable leak of hidden test content**:
- `getOne` (participant) filters test cases `where: { isHidden: false }` and strips `expectedSolution` / reference solutions.
- Submission/result/assist paths redact hidden cases to `[Hidden]`/`[Passed]`/`[Failed]` and expose only counts, never content.
- Frontend surfaces (`ProblemPanel`, `ParticipantCodingAttemptPage`, `TestResultsPanel`) mask/filter hidden cases.

## 7. Verification

- `import main` in `ai-service` → OK (module imports cleanly after rewrite).
- `main.py` syntax parse → OK.
- `node --check` on all edited backend files → OK.
- Offline LangGraph harness → **4/4 scenarios PASS**.
- Real LLM end-to-end attempt invoked all 9 nodes (trace confirmed) against Gemini before the API daily free-tier quota halted the run; the exposed empty-result path was then hardened (§2 count guard) and re-verified offline. Full multi-scenario live acceptance should be re-run after the Gemini quota resets.

## 8. Residual Risks / Notes

- **Gemini free-tier quota (429)** can stall live generation during heavy use; the workflow now fails honestly in that case rather than returning junk or zero problems. A paid key / higher quota removes this.
- `explanation` is participant-visible in problem details (trainer-authored content; reviewed as acceptable — not a hidden-test leak).
- The root design doc `CODING_ASSESSMENT_SYSTEM_WORKFLOW_AND_CODE.txt` still describes the *old* static-bank system and references deleted modules (`coding_service.py`, `coding_synthesizer.py`); it should be reconciled (see note in §9).

## 9. Recommended Follow-ups

1. Re-run the live acceptance suite (Java Classes, Python Arrays, JS Palindrome, Java Inheritance, plus a novel topic) once the Gemini quota resets.
2. Rewrite `CODING_ASSESSMENT_SYSTEM_WORKFLOW_AND_CODE.txt` to describe the LangGraph workflow and remove references to the deleted static-bank modules.
3. Optionally add an `attributes` whitelist to participant test-case includes for defense-in-depth (already safe today).