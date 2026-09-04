# AI Quiz difficulty audit — 2026-09-04

## Root cause and schema

Read-only inspection of the configured PostgreSQL database confirmed:

| Column | Enum values | Default |
| --- | --- | --- |
| `ai_questions.difficulty` | `EASY`, `MEDIUM`, `HARD` | `MEDIUM` |
| `ai_quizzes.difficulty` | `EASY`, `MEDIUM`, `HARD`, `MIXED` | `MIXED` |

The ORM already declared these uppercase values. The trainer generator sent title-case option values, the prompt API converted difficulty to title case, and the Gemini prompt explicitly requested title-case question difficulty. The save loop inserted the AI response unchanged. PostgreSQL correctly rejected `Easy` and `Medium`.

The document adapter also returned its fallback unchanged for unsupported question difficulty, allowing quiz-level `MIXED` to reach an individual question. The prompt save loop separately discarded array-based answer choices. A later insert failure could leave a partial quiz because saves were not transactional.

No enum migration is needed: the existing database and intended ORM contract agree.

## Changes

- `backend/src/utils/quizDifficulty.js` owns canonical values and normalization. Case variants and surrounding whitespace normalize consistently. Invalid request values return 422 before generation or database writes.
- Quiz-level `MIXED` is accepted; individual questions only store `EASY`, `MEDIUM`, or `HARD`. Missing generated difficulty uses the requested specific level, or the existing `MEDIUM` default for mixed quizzes.
- Prompt, Python-service, fallback, and document/URL adapters normalize AI responses. Python accepts difficulty as a string; the backend adapter supplies the canonical value and normalizes its response.
- Both ORM models use the canonical enum lists and setters, covering direct create/update and bulk model construction too.
- Both trainer generator tabs use one options list with readable labels and uppercase wire values. A contract test checks these values against the backend list.
- Prompt and document generation share question/choice persistence. Each quiz header, question batch, and answer choices commit together. Document generation also commits its READY status in that transaction. Draft quizzes remain unpublished.
- Removed the unreachable duplicate document-upload handler; both document URLs use the same controller.

## Verification

- `cd backend; npm test -- --runInBand test/quiz-difficulty.test.js`: 13 passing tests covering all levels, case variants, invalid values, MIXED handling, ORM/frontend agreement, Gemini/Python/fallback/RAG responses, and answer choices.
- `cd backend; node scripts/audit-quiz-difficulty.js`: reads actual enum labels and defaults.
- `cd backend; node scripts/verify-quiz-difficulty-database.js`: authenticated prompt and multipart document requests for all three levels, deterministic AI-provider responses with title-case difficulty, actual PostgreSQL inserts/readback, four answer choices and one correct answer per question. Invalid input returns 422. Injected choice persistence failure rolls back the quiz. All verification records are rolled back and test uploads removed.
- `cd backend; node scripts/verify-quiz-difficulty-database.js --live`: all three prompt levels saved successfully against the configured database. Gemini returned HTTP 429 and the Python service timed out, so these runs exercised the existing fallback generator. Successful live LLM generation could not be verified under those provider conditions.
- `cd frontend; node scripts/verify-quiz-difficulty.mjs` (Playwright available through NODE_PATH): actual trainer modal in Chromium, all three levels through both tabs, uppercase JSON/multipart request values, successful completion, and recovery/retry after a server error. Browser API responses are controlled; real persistence is verified separately above.
- Frontend production build: `cd frontend; npm run build` passed.
- Restarted the local backend to load the fix; `/api/health` returned `healthy`, `backend: ready`, and `database: connected`.

The fix does not change AI provider quotas or timeouts. Other deployments running plain `node src/app.js` need a restart to load the changed modules; Vite/nodemon development processes reload normally.
