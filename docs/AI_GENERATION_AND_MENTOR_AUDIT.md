# AI generation and assessment mentor audit

> Historical audit. The quiz generation behavior described below has been superseded by [the dynamic generation audit](DYNAMIC_AI_QUIZ_AUDIT.md). The fixed maths fallback has been removed; current generation always requires live AI and repairs individual rejected questions. Mentor findings remain separate.

## Root causes

1. The Node prompt generator used the complete instruction as a topic. After a five-second Gemini timeout and a two-second Python timeout, it selected generic software templates for unrecognized topics. It repeated templates with `Part 2` suffixes. The Python prompt endpoint had a second generic mock generator and cached its output as successful generation.
2. Parsers replaced missing choices with `Option A` through `Option D`, invented missing stems, and selected the first answer when the key was missing. Neither relevance nor answer correctness was checked before saving.
3. Calls hardcoded Gemini Flash. The configured key returned 429 for that model. A live Flash Lite probe succeeded; Python's model-name coercion would nevertheless rewrite Flash Lite to Flash.
4. Quiz mentor history queried `createdAt`, but the model/database timestamp is `created_at`. The integration test reproduced PostgreSQL error 42703 for the original query. History now orders by ID and loads the most recent exchanges.
5. The Quiz answer guard received the stored MCQ index, not the corresponding answer text. The Quiz UI also shared messages, input, and loading across questions, allowing a delayed reply for one question to appear under another.
6. Both mentors duplicated provider transports and held attempt locks while waiting on AI. Current mentor tables were audited against ORM attributes: no missing columns were found.

## Corrected flow

The authenticated LMS prompt endpoint owns quiz generation. It extracts the subject while retaining the original coverage instructions separately. Generation uses a constrained JSON schema. Application validation requires the exact question count, four meaningful distinct choices per MCQ, a valid consistent answer key, supporting explanation, and unique stems. Placeholders, missing answers, and Part-number repetitions are rejected rather than repaired into fabricated questions.

A separate AI review must approve every question's relevance, uniqueness, answer, explanation, and lack of ambiguity before saving. It receives the original request and explicitly treats it as data. Failed batches regenerate within a bounded retry count; exhausted retries fail without saving. Document/URL generation also checks structure, duplicate/count consistency and relevance against extracted source text. The final question persistence boundary validates MCQs again, and quiz/choice writes remain transactional.

The JSON schema mode is based on Google's [structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en); application checks remain necessary for semantic correctness.

When AI is unavailable, a bounded elementary Speed/Distance/Time source can supply up to ten distinct questions with computed arithmetic and reviewed formula keys. It is explicitly returned as `generationSource: verified-math`, and the UI labels it as verified maths rather than claiming AI generation. It does not handle arbitrary subjects, more than ten questions, or advanced/Hard requests. Those requests return a retryable 503 if no verified AI batch is available. There is no generic software fallback.

Both assessment mentors use the shared Gemini client and provider deadline. Quiz context is loaded by authorized attempt/question IDs. Coding context includes the current problem, participant code, language, error, visible sample inputs and recent history. Answer keys and reference solutions are loaded separately for output checking and never sent to the model. Provider replies are guarded; unavailable or rejected replies use local conceptual coaching. Final usage/exchange writes use short transactions with ownership/status rechecks. Failed writes roll back usage.

The browser adapters share response parsing and deadlines. Both preserve separate conversations/drafts/loading per question, reject empty/malformed responses, and recover after failures. Explicit assessment enablement and the existing Quiz help limit remain enforced.

## Verification

- 64 targeted tests passed across generation quality, all difficulty levels, conversation isolation and answer guarding.
- Authenticated APIs against PostgreSQL saved ten Speed/Distance/Time questions and forty choices; checked all keys/options, history, code/error context, and saved mentor exchanges. Simulated write failures rolled back usage and later requests succeeded. Test records were rolled back.
- A second run included actual assessment-session headers and configured live providers. Quiz and Coding mentors completed successfully; some provider replies were live and others used guarded local guidance as quotas were reached.
- The ten-question live-service generation used the explicitly labelled verified maths source. Genuine AI batch generation/review was exercised with controlled provider responses; an unrestricted live AI batch could not be confirmed because the provider rejected further requests with HTTP 429. A review response with incomplete coverage was correctly rejected before saving.
- Both actual mentor components passed Chromium tests under StrictMode: question changes, delayed response isolation, session headers, returning to earlier history, API failure, empty response and retry. Coding payloads carried the current editor code and error.
- All Easy/Medium/Hard prompt and document paths passed the PostgreSQL regression check with controlled provider responses.
- Frontend production build and syntax checks of modified Python files passed.
- Restarted the local backend and Python AI service after the changes. Both health endpoints returned `healthy`; the backend reported `database: connected`. The local Python configuration now selects Flash Lite without coercion.

The readable question/answer artifact is `docs/speed-distance-time-verification.json`. It contains no participant data. These tests verify the local application and configured database; no remote production deployment was performed.

## Configuration and compatibility

`GEMINI_MODELS` can specify a comma-separated failover list. `GEMINI_MODEL` remains supported; `QUIZ_GENERATION_MODEL` and `AI_MENTOR_MODEL` are optional overrides. Defaults use Flash Lite then Flash, with a shared deadline rather than an unbounded retry queue. Python preserves configured model IDs instead of silently coercing them.

The obsolete Python `/generate-quiz-from-prompt` and `/prompt-quiz/generate` handlers now return 410 and direct callers to the authenticated LMS endpoint. Current frontend callers already use that endpoint. This removes the duplicate mock generation path.

The account's provider response reported a free-tier request limit of 20 for Flash Lite. Code cannot grant provider quota. General-topic generation will safely report temporary unavailability until usable quota is available; it will not save irrelevant substitutes.
