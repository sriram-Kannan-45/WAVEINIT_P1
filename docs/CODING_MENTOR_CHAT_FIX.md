# Coding AI Mentor continuous-conversation fix

Date: 2026-09-04

## Follow-up: missing PostgreSQL audit columns — applied to configured database

Live `describeTable` inspection confirmed that `coding_ai_help` lacked BOTH `possible_leak_detected` and `leak_reasons`. The corresponding quiz table already contained them, and coding assistance-level/category and result-usage columns already existed. All references were traced to the coding/quiz Sequelize models, mentor service inserts and API responses, and the audit migration; these are required answer-leak reporting fields.

The model's camelCase `possibleLeakDetected` maps to the database's `possible_leak_detected`. The existing audit migration was never explicitly run during application startup. Normal startup sync uses `alter: false`; the later grouped coding-table alter sync can stop on an earlier table before reaching `CodingAiHelp`. This left model INSERTs and reporting SELECTs ahead of the database schema.

The existing additive migration now runs transactionally on PostgreSQL with a migration-specific advisory lock. A dedicated `ensureAiMentorAuditSchema` step runs immediately after database initialization, independently of the late table-sync group, and verifies the required Boolean/default/nullability contract. Failures propagate instead of being dismissed as an already-applied migration. `CodingAiHelp` no longer relies on an alter-sync to create these columns.

Applied successfully to the configured PostgreSQL database:

- `coding_ai_help.possible_leak_detected`: BOOLEAN NOT NULL DEFAULT FALSE.
- `coding_ai_help.leak_reasons`: VARCHAR(500), nullable.
- A second migration run reported `added: []` and `verified: true`.

Commands, from `backend`:

```powershell
npm run migrate:ai-mentor-audit
node src/scripts/verifyCodingMentorDatabase.js
```

The migration command authenticates directly and applies only this additive migration; it does not invoke the application's broader sync/bootstrap routines. No existing assessment rows were removed.

The integration script used a new attempt inside an outer rollback-only PostgreSQL transaction. It reproduced the exact missing-column error using an empty temporary table in a savepoint, without altering the real table. It then completed ten real mentor-service requests against PostgreSQL and verified full model reads, Boolean values, timestamps, usage counts, and the database's default FALSE via a raw SQL insert omitting the audit fields. All test attempt/exchange rows were rolled back. Sequence gaps may remain, as normal for PostgreSQL rollbacks.

Configured AI providers were called during that test. Some calls timed out or returned HTTP 429; the existing fallback completed those requests successfully. This verifies service and database behavior, not guaranteed upstream-provider availability.

41 unit/service tests passed, including migration atomicity/idempotence/error propagation and answer safety. The browser regression now explicitly injects this PostgreSQL missing-column HTTP 500 and verifies that the textarea remains writable and a following send succeeds. The existing `finally` cleanup already clears sending after failed requests; no database response controls `inputDisabled`. Browser API-failure injection and the real-service/database integration check are separate tests.

The database correction is already applied; deploy/restart the updated backend through the normal process to load the explicit migration-on-startup protection. The earlier report's statement that database integration remained unverified is superseded by the checks above. Physical mobile-camera pairing remains outside these tests.

## Follow-up: ERR-0D996O9 camera crash

The earlier monitoring prop change exposed a callback-contract mismatch: `AssessmentConsentGate` calls `onConsented(attemptId, quiz)`, while the coding page treated the first argument as a camera stream. Passing that numeric attempt ID to `externalWebcamStream` caused the reported `HTMLMediaElement.srcObject` TypeError. The initial browser fixture invoked the callback without arguments, so it missed this regression.

The fixture now passes the actual callback arguments. This reproduced the exact reported error before the fix. The coding page no longer stores consent arguments as a camera stream or passes them to monitoring. The consent gate already stops its calibration camera; monitoring acquires and releases its own assessment camera through its existing lifecycle. The widget also validates supplied external streams before initializing state or binding video, falling back to local acquisition for invalid values.

The corrected full browser regression passed, including camera playback, ten consecutive mentor messages, error/timeout recovery, editor interaction, refresh, and assessment submission. Additional direct-widget cases verified that numeric and object stream props do not crash and instead acquire a real browser MediaStream from the synthetic camera. The frontend production build passed. Physical camera/mobile pairing verification remains outstanding.

## Root cause

The first response consumed a legacy one-hint quota. `CodingAiAssistant` initialized `limit` to 1 and `unlimited` to false. Both status and successful-response handlers loaded quota metadata. On success, `used` became 1, so `remaining = max(0, limit - used)` became zero. That produced `outOfHelp = true`, which was passed directly to the shared panel as `inputDisabled`. The textarea rendered `disabled=true`; the same quota disabled Send and quick actions and rejected subsequent calls in `ask`.

This matches the supplied screenshot's `0/1 hint` badge. The request's `finally` already cleared loading: clearing loading or changing pointer-event CSS alone could not fix this lock.

The backend independently rejected repeated requests with `AI_HELP_LIMIT_REACHED` and HTTP 429, checking the quota both before and inside the transaction. Time/attempt unlock gates had already been partially removed in this workspace, but the quota checks remained. Backend comments incorrectly described that state as always available.

## Lifecycle and interaction audit

| Stage | Finding and resulting behavior |
| --- | --- |
| Input and onChange | Drafts are controlled values keyed by question. Typing never depends on a usage count. The textarea remains writable even during an active request. |
| Send | A synchronous ref guard prevents duplicate requests before React re-renders. Each question has its own sending state. |
| Request | Fetch uses an AbortController with a 20-second timeout. Unmount aborts requests and clears their timers; stale completions cannot update the next attempt. |
| Success | Response and reporting count update the originating question. A response cannot overwrite an unrelated draft or another question's usage. |
| Failure | HTTP errors, network failures, invalid JSON, and timeout add an error message. `finally` clears the originating question's sending state. |
| Focus | The stable textarea ref restores focus after completion if focus remains in chat or on the document body. It does not take focus back from Monaco or monitoring. IME composition Enter is not treated as Send. |
| Status refresh | Status fetches abort on question changes. Usage counts merge monotonically so an older status response cannot erase a completed interaction. Status loading does not block typing. |
| Confirmation | The first confirmed send now executes the pending message or quick action. Optional localStorage failure does not prevent in-memory acknowledgement. |
| Clear/close | Clear is disabled during a request to prevent an orphaned reply. Closing hides the existing mentor instance, preserving drafts/history when reopened. |
| Attempt identity | Changing participant or attempt remounts the coding adapter; switching questions does not. |
| Scroll | Only the message list scrolls after updates. Focus restoration uses `preventScroll`. |
| Monitoring | The fixed monitoring widget previously occupied the same lower-right area as the composer. Coding now mounts it inline inside a dedicated rail, with responsive layout. Other callers retain the floating placement. |
| Header | Wrapping badges and a shrinkable textarea prevent the quota/usage header from squeezing the title into narrow columns. |
| Keyboard/overlays | No first-response keyboard lock was found in the assessment shell. Existing exam permission/termination overlays remain intentional. Browser hit-testing confirms the textarea receives clicks with monitoring expanded and minimized. |

## Backend and response changes

- Coding assistance ignores legacy `aiHelpLimit` and `aiUnlockThresholds`. The trainer quota control and update allowlist entries were removed. Database columns remain for compatibility; no destructive schema migration is required. New model defaults describe unlimited usage.
- Attempt ownership, assessment/question membership, in-progress status, and the explicit `aiAssistantEnabled` assessment switch remain enforced. The multiple-choice quiz mentor's separate policy is unchanged.
- Successful exchanges still record attempt, problem, participant, prompt, response, assistance type/depth, usage number, leak audit fields, and the model's timestamps. The attempt usage JSON is updated with a new object inside the same transaction as the exchange record.
- Up to ten previous successful exchanges for the same participant/attempt/question are supplied as recent context. This bounds model input without bounding the number of interactions. History is read under the existing attempt transaction lock to preserve ordering.
- Gemini and the Python fallback receive conversation context. The Python request model now also accepts action, teaching depth, input/output formats, and error context.
- Both prompts explicitly allow help before any code is written or run and prohibit attempt, time, progress, and unlock prerequisites.
- Obsolete restriction replies from model providers are rejected and fall through to another provider or local guidance. Old restriction text in stored history is excluded from future mentor context.
- Existing answer-leak checks remain in place. Reference solutions continue to be used only for response validation, not model context.
- There is no streaming path here: requests return JSON. Provider calls retain their existing Axios timeout and fallback behavior.

The exact old screenshot messages were not literal generated replies in the current workspace at the start of this audit. Their historical/deployed origin cannot be established from these files alone. The response guard now prevents those messages from being served even if an older upstream service returns them.

## Persistence

Visible chat history and drafts stay in memory per question and now survive closing/reopening the panel. As in the prior design, refreshing resets visible chat. Usage is reloaded from the backend; acknowledgement remains in localStorage when available. Persisted server exchanges provide recent model context after refresh. Clearing the visible conversation does not erase reporting records.

## Verification

39 tests passed across `backend/test/coding-mentor-conversation.test.js` and `backend/test/ai-answer-guard.test.js`.

The backend regression tests exercise the real assistant service with mocked model/database boundaries: ten exchanges for each legacy quota value 0, 1, 3, and -1; reporting increments; context isolation; failure rollback/retry; provider failure; six obsolete response variants; ownership checks; and prompt context. These are service tests, not a live database integration test.

`frontend/scripts/verify-coding-mentor.mjs` passed in Chromium using the real assessment page, coding mentor, shared panel, Monaco editor, and monitoring component under React StrictMode. Network responses, fullscreen, consent, and camera input are deterministic test fixtures.

| Acceptance check | Browser result |
| --- | --- |
| First send and response | Passed, including first-use confirmation |
| Input usable immediately after response | Passed; disabled=false, readOnly=false, focus restored, pointer hit-test succeeds |
| Second send | Passed |
| At least ten consecutive messages | Passed; exact first four requested prompts, then six follow-ups; one request/reply per send |
| API failure | Passed for HTTP 500, malformed JSON, and failed network request; subsequent requests succeed |
| Refresh | Passed; status usage reloads, acknowledgement survives, chat remains writable |
| Change question | Passed while the previous question's request was pending |
| Return to previous question | Passed; correct draft, history, and reporting count |
| Quick actions | Passed; remain reusable and preserve an unrelated typed draft |
| Monitoring interaction | Passed expanded/minimized; textarea is the element at its center point |
| Timeout | Passed using the actual 20-second timeout; a new request succeeds |
| Editor and tabs | Passed Monaco typing, focus retained during mentor completion, Custom Input and Test Cases |
| Run/submit | Passed Run Code custom-input/code payload, Submit Code, and confirmed Submit Assessment payload for both questions |
| Timer and webcam | Timer advances; synthetic webcam video renders through the real monitoring widget |
| Responsive interaction | Passed input hit-testing at 1440, 1280, 1024, and 600 pixels wide |

The final production frontend build passed. Node and Python syntax checks passed. `git diff --check` reported no whitespace errors.

The browser run also exposed an existing development warning in Submit Code: `triggerAutoNavigation` calls the toast provider from inside a question-state updater. Submission and subsequent interactions passed; this independent warning was not changed as part of the mentor fix.

## Reproduce

From `backend`:

```powershell
node node_modules/jest/bin/jest.js test/coding-mentor-conversation.test.js test/ai-answer-guard.test.js --runInBand --no-coverage
```

From `frontend`, with Playwright installed or available through `NODE_PATH`:

```powershell
node scripts/verify-coding-mentor.mjs
npm run build
```

The browser script starts and stops its own loopback Vite server on port 5188. It does not use a real participant account or submit a live assessment. Set `MENTOR_TEST_ARTIFACT_DIR` to save a screenshot. No temporary development chat logging was left in production code.

## Verification limits and rollout

Live provider output quality, a real database transaction, physical webcam calibration, and mobile WebRTC pairing were not verified against a deployed assessment. The browser's mobile panel exercised its normal UI, not a physical phone connection. The test fixture bypasses pre-assessment consent/fullscreen checks only within its test server; production consent/proctoring code is unchanged.

Changes are local and have not been deployed. Deploy the frontend, Node backend, and Python AI service together so the quota removal and conversation-context contract are consistent. No quota-data migration is needed because existing values no longer control coding chat.
