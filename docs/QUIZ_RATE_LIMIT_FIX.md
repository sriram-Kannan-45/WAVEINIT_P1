# Quiz generation rate-limit repair

The backend logs showed that eight questions had already passed validation when Groq returned HTTP 429 with a 27-second retry delay. The adapter refused delays longer than 20 seconds, aborting the quiz. A subsequent request received a 42-second delay. Coding generation used fewer calls and could succeed within the same account limits.

## Changes

- `backend/src/services/groqProvider.js`: honor a valid Retry-After within the remaining request deadline, with a small safety margin and at most two retries. Retry the same payload. Quota resets beyond the deadline still return a real error.
- `backend/src/services/promptQuizGenerator.js`: use separate output budgets for intent, question generation and review, with a 90-second per-call deadline. Keep accepted questions while regenerating rejected slots. Withhold proposed answer keys from the reviewer, require independent calculations before verdicts, and reject missing exact answers, incidental topic references and unsupported facts.
- `backend/src/routes/aiQuizRoutes.js`: normalize database and token trainer IDs when comparing course ownership; PostgreSQL can return BIGINT IDs as strings.
- `frontend/src/components/trainer/CourseQuizzesTab.jsx`: explain that generation may pause automatically while the AI rate limit resets.
- Added rate-limit and continuation regressions, answer-review checks, and an authenticated live route verification script.

The provider sequence remains Gemini, then Groq. No question fixtures or static responses are used by production generation. Credentials stay on the backend.

## Verification

- 68 focused backend tests passed across five suites.
- Frontend production build passed.
- Live authenticated route returned HTTP 201 with ten questions and forty persisted options. Each question had exactly one marked answer. The final live run took 162 seconds including validation repairs and actual provider waits; all database test records were rolled back.
- Independently inspected the final saved public test questions and calculations. This is sample verification, not a guarantee of model accuracy for every future request.

Run the focused backend suite with `npx jest test/groq-rate-limits.test.js test/ai-provider.test.js test/ai-generation-quality.test.js test/quiz-generation-persistence.test.js test/quiz-rate-limit-resume.test.js --runInBand --silent`.

`backend/scripts/verify-live-quiz-route.js` exercises authentication, live providers, validation and persistence using an isolated temporary course. It rolls back all test database writes and records public generated content in `docs/quiz-rate-limit-live-verification.json`. Gemini currently returns an actual 429, allowing verification of live Groq failover and rate-limit recovery.
