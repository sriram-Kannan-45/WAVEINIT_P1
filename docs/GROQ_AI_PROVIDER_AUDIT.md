# Shared Gemini / Groq AI integration

Verified 4 September 2026. Applies to AI Quiz Generation, Quiz Assessment Chatbot, and Coding Assessment Chatbot.

## Final flow

Each generation, verification, or coaching request enters the shared backend provider. Gemini is attempted first. Missing credentials, rejected credentials, quota/rate limits, connection failures, timeouts, API errors, and malformed responses trigger Groq. A successful, validated provider response is returned. If both providers fail, the caller receives a sanitized `AI_PROVIDERS_UNAVAILABLE` error; no canned questions or mentor replies are substituted.

The provider logs the provider name, request ID, safe failure category, fallback decision, successful model and response ID. It does not log keys, authorization headers, raw provider errors, or prompt bodies. Groq uses the official `groq-sdk` package. The default model is `openai/gpt-oss-120b`; feature-specific overrides remain configurable. A short Groq Retry-After can be honored once within the request deadline; long or exhausted limits return a real error.

## Configuration audit

The existing Gemini key is in `backend/.env`; the existing Groq key was found in `ai-service/.env`. No secret was copied or hardcoded. Deployment environment variables take precedence, followed by backend `.env`. For local compatibility, only missing Groq settings are read from `ai-service/.env`. Both providers are now configured in the running backend.

Frontend code never imports the provider configuration. A content scan of 757 backend source, frontend source/build, and documentation files found neither configured key. The health endpoint exposes configuration booleans and explicitly distinguishes them from verified connectivity.

## Quiz pipeline

The original user request is analyzed into a concise topic, domain, concepts, requirements and marks. Relevant supplied learning materials take priority. Without those materials, the model uses subject knowledge; requests needing external evidence use grounded retrieval. Gemini Google Search and Groq Compound search evidence are normalized into source context. Retrieval without usable source evidence fails closed.

Questions are generated for explicit difficulty/count slots, structurally checked, and independently reviewed for topic relevance, uniqueness, ambiguity, explanation correctness, source support when applicable, difficulty, and the independently solved answer. MCQs require four distinct meaningful options and one correct answer. Generated answers use exact option text before conversion to the stored zero-based key, avoiding ambiguity with numeric choices. Only rejected slots are regenerated; previously accepted questions are retained. Attempts are bounded, and exhausting them returns a real error without saving an incomplete quiz. Persistence requires the unchanged verification receipt and uses a transaction.

## Assessment coaching

Both mentors share the provider and receive the current visible question/problem, language, relevant history, and submitted code/errors. Stored quiz answer keys and coding reference solutions remain in local response checks and are excluded from generation and review prompts. Local answer checks and a separate live semantic review reject direct answers and complete solutions, including complete algorithms expressed in prose. Unsafe replies trigger a fresh live hint, with bounded attempts. Provider failures do not save an exchange or consume help usage.

## Files changed for this integration

| Files | Purpose |
| --- | --- |
| `backend/src/config/aiProviders.js` | Server-only environment loading and configuration status |
| `backend/src/services/aiProvider.js`, `groqProvider.js`, `geminiClient.js` | Shared provider, Groq SDK adapter, backwards-compatible import |
| `backend/src/services/promptQuizGenerator.js` | Shared provider, source evidence, independent review and answer normalization |
| `backend/src/services/mentorProvider.js` | Shared live coaching and semantic review |
| `backend/src/services/quizAiAssistantService.js`, `codingAiAssistantService.js` | Contextual live hints, removal of offline response generators, bounded rejection/regeneration |
| `backend/src/services/aiService.js` | Shared-provider health status; document quiz generation already uses the validated pipeline |
| `backend/src/controllers/codingAssessmentController.js` | Preserve safe error codes returned by AI service |
| `backend/.env.example`, `package.json`, `package-lock.json` | Configuration documentation and official SDK dependency |
| Provider, mentor, quiz quality/difficulty/persistence tests and verification scripts | Regression and live verification |

The workspace also contains earlier quiz, assessment, and monitoring changes. They were preserved. Separate curriculum generation, coding problem authoring, and the general participant chatbot still have their older integrations; they are not the three assessment features covered here.

## Verification results

- 111 automated checks passed across eight focused suites. These use isolated test fixtures to exercise both provider branches, errors, safety, validation, and persistence requirements; production code does not import those fixtures.
- Live Gemini connectivity was attempted and returned HTTP 429. A successful live Gemini generation could not be verified under the account's current quota. Its success branch and authenticated quiz pipeline were verified with test fixtures.
- Simulated Gemini quota failure followed by a real Groq request passed. Evidence: `groq-live-probe.json`.
- Live topic extraction, generation, and independent review produced three Speed, Distance, and Time questions with four options and correct calculations. Evidence: `groq-live-quiz.json`. No sample quiz was persisted.
- Both live assessment chatbots returned Groq guidance and passed the local and live semantic safety checks. Evidence: `groq-live-chatbots.json`.
- Authenticated route/database checks passed with ten quiz questions, forty options, contextual mentor history and saved exchanges. Injected save failures rolled back usage; subsequent retries succeeded. All verification records were rolled back.
- Difficulty/database checks passed for Easy, Medium and Hard through prompt and uploaded-text flows, including rollback after an injected question-save failure.
- Running backend was restarted. Backend health and AI configuration health passed; source extraction service is available.

Live external retrieval through Groq Compound was not part of the recorded live test run. Actual account limits still apply, and the application reports them when neither provider can serve a request.
