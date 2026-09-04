# AI service recovery audit — 4 September 2026

## Findings

The source tree did not contain unresolved JavaScript file imports: the initial scan covered 624 backend/frontend source files. The main damage was missing API wiring and reverted implementations. No claim is made about unknown, unreferenced files that were deleted without any surviving history.

| Finding | Affected behavior | Repair |
| --- | --- | --- |
| Python `/rag/prepare-source` was absent although Node still called it | URL, PPTX and large-document extraction for quizzes and curricula | Restored the route against the existing `RAGQuizGenerator.prepare_source`, preserving instructions and source metadata |
| Python `/generate-coding-problems` was absent despite its request model and workflow being present | Coding generation compatibility API | Reconnected the existing LangGraph workflow; explicitly reports that reference execution is not verified by this Python endpoint |
| Legacy mock quiz generation and source-to-question templates had returned in `main.py` | Legacy and prompt quiz routes could bypass real generation | Removed these generators; all surviving quiz entry points use live generation and question validation |
| Course generation swallowed provider failures and used domain blueprints | Apparent success with hardcoded or unrelated curricula | Added live curriculum generation, independent review, duration arithmetic checks and canonical hours for database compatibility; replaced the synthesizer with an asynchronous live compatibility wrapper |
| Coding authoring and language-code generation used separate Gemini-only calls | Groq could not rescue those features | Connected both to the existing centralized Node provider |
| Coding normalization rewrote expected outputs to match generated code and marked results validated | Incorrect code could pass authoring checks | Require complete generated language solutions, distinct public/hidden tests, and actual passing results for every language; never rewrite expected answers |
| Python text provider only used Gemini, exposed raw provider errors in logs and forced Gemini-only RAG configuration | Python routes failed despite a valid Groq key | Added a shared Python Gemini → Groq transport and preserved the existing `GeminiClient` interface |
| Participant informational chatbot bypassed Groq and its frontend swallowed failures | Generic navigation reply replaced a failed educational answer | Shared provider integration and real error propagation; deterministic navigation actions remain normal application actions |
| Python code review/coaching and answer grading had canned or keyword-based success paths | Unverified reviews, hints or marks on provider failure | Replaced with live responses, schema checks and coaching review, or explicit errors |
| Two course-controller functions were declared twice | Jest/Babel could not parse that controller | Removed the shadowed first definitions and retained the final definitions already used by Node |
| Course replacement deleted lessons outside a transaction | A failed insert could leave an incomplete course | All deletion/insertion operations now share one transaction |

Python imports were also checked across the original 27 source files. The apparent `resource` dependency is deliberately conditional on non-Windows platforms. The proctoring verification script resolves `proctoring_detector` through its existing explicit `inference` path. Both are present/intentional, not missing AI modules. The existing prompt instruction files, RAG modules, model schema files, Groq SDK and installed Python dependencies were present.

## Architecture and files

Public authenticated LMS routes remain in Node. Quiz generation and assessment mentors retain the existing validation, authorization and persistence architecture. Node `aiProvider.js` always attempts Gemini first and then Groq; the accidental process-global cooldown that reordered providers was removed. Python compatibility APIs use the same provider order through `services/ai_provider.py`. There is no cross-service recursion and no new unauthenticated Node AI gateway.

Primary restored or changed files:

- `ai-service/main.py`: reconstructed extraction/coding endpoints and repaired quiz, course, review, coaching and evaluation entry points.
- `ai-service/services/ai_provider.py`, `gemini_client.py`, `course_structure.py`: live Python transport, compatible client and curriculum service.
- `ai-service/rag/config.py`, `rag/generation.py`, `coding_workflow.py`: Groq-aware configuration, validated prompt compatibility and fail-closed workflow reviews.
- `backend/src/services/courseStructureService.js`, `curriculumSynthesizer.js`: live curricula, independent review, duration validation and compatibility wrapper.
- `backend/src/services/codingGenerationValidation.js`, `aiService.js`: restored shared generation connections and real executable-answer validation.
- `backend/src/services/aiProvider.js`, `participantChatbotService.js`: consistent failover and live participant answers.
- `backend/src/controllers/trainerCourseController.js`, `routes/participantCourseRoutes.js`: transactional curriculum persistence and safe error propagation.
- `frontend/src/services/participantChatbotService.js`, `components/chatbot/ParticipantAIChatbot.jsx`: provider errors remain visible; request timeout allows backend failover.
- New recovery, provider, API and coding-validation tests and `backend/scripts/verify-ai-restoration-live.js`.

Existing environment files and secrets were preserved. A scan of 797 source, documentation and frontend build files found no actual configured Gemini or Groq keys. No new credential was needed.

## Verification

- Final frontend production build passed: 3,606 modules transformed, no build errors.
- Final JavaScript/React import and syntax scan covered 626 files with zero unresolved imports. Backend startup and Python application import succeeded.
- 121 focused backend tests passed across 11 suites, including provider failures, document quiz validation, assessment coaching, coding validation and transactional course persistence.
- Python: seven quiz tests, three provider tests and five restored-API tests passed; all four coding workflow harness scenarios passed.
- Live curriculum generation and independent review passed for a two-hour biology lesson. Duration sums also passed deterministic verification. Evidence: `ai-restoration-live-course.json`.
- Live document quiz generation passed for a newly authored lesson file: two questions derived from that lesson. Evidence: `ai-restoration-live-document.json`.
- Live coding generation passed for a beginner Python problem, and its reference solution passed all three tests. Evidence: `ai-restoration-live-coding.json`. The existing judge used its configured local execution path because Docker was unavailable.
- Both assessment mentors returned live Groq hints and passed their response reviews. Evidence: `groq-live-chatbots.json`.
- The running Python `/review-code` API returned a live review of a public sample program; logs recorded Gemini quota failure followed by Groq success.
- Restored extraction and coding routes were confirmed in the application route table. Extraction returned actual supplied source text without calling AI.
- Backend and Python service health checks returned healthy after activation. Both API keys are reported configured without exposing their values.

Gemini currently returns HTTP 429, so successful live Gemini generation remains unverified under the current quota. Its success branch is covered by isolated tests. Recorded successful live content was produced by Groq. Test fixtures exist only in tests; no sample quiz or curriculum was saved into the LMS during live verification.

The audit and tests establish recovery of the referenced paths, not universal factual accuracy for every possible subject. Large-source retrieval, every supported coding language, and a full browser walkthrough were not exhaustively live-tested in this recovery run.
