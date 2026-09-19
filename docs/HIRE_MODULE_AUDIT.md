# Hire module reuse audit

## Decision

Hire is a workflow layer. It owns only recruitment metadata, the pending-email
candidate queue, and links to canonical assignments. It does not own a second
assessment, interview, meeting, monitoring, evaluation, or reporting engine.

## Capability map

| Feature | Existing implementation | Reuse decision | Minimal extension |
|---|---|---|---|
| Quiz authoring and AI generation | `AIQuiz`, `AIQuestion`, `aiQuizRoutes`, `aiQuizService`, trainer quiz editor | Reuse | `AIQuiz.context = TRAINING/HIRE`; Hire workflow references `quiz_id` |
| Quiz attempts, timer, scoring and results | `QuizAssignment`, `QuizAttempt`, `QuizAnswer`, `QuizResult`, `/api/quizzes` | Reuse | Hire assignment creates the canonical `QuizAssignment` |
| Coding authoring and AI generation | `CodingAssessment`, `CodingProblem`, language/test-case models, coding controller/editor | Reuse | `CodingAssessment.context = TRAINING/HIRE`; Hire workflow references `coding_assessment_id` |
| Coding execution, attempts and results | Judge engine, `CodingAttempt`, `CodingSubmission`, `CodingResult` | Reuse | Coding access accepts an assigned Hire workflow as an alternative to training enrollment |
| Assessment monitoring and webcam | `AssessmentSession`, `MonitoringSession`, `UnifiedMonitoringWidget`, proctoring services | Reuse unchanged | None |
| Assessment QR/mobile camera | assessment verification service, QR generator, pairing modal/mobile join | Reuse unchanged | None |
| Interview scheduling and meetings | `Interview`, interview controller/routes, lifecycle service, WebRTC room | Reuse | Persist `Interview.context = TRAINING/HIRE`; Hire sidebar filters context and mode |
| Group Discussion | `Interview.mode = GROUP_DISCUSSION`, `InterviewParticipant`, shared room | Reuse | Hire requires exactly six distinct approved participants and one approved trainer; ordinary GD retains 2–6 |
| GD monitoring, recording and QR | interview device/token/recording services and existing room hooks | Reuse unchanged | All six rostered candidates are monitored independently; the existing reconnect-compatible start quorum is preserved |
| Interview feedback and GD evaluation | Interview feedback/result plus per-participant evaluation in `InterviewParticipant` | Reuse | Hire GD becomes `EVALUATED` after all six individual evaluations; evaluations remain editable/publishable afterward |
| Reports and exports | Quiz/coding reports, monitoring reports, interview lifecycle report | Reuse | Hire summary aggregates canonical results; GD export uses the shared interview report |
| CSV candidate import/export | Existing upload middleware pattern and export utilities | Extend | Hire-specific pending email queue; no user/account duplication |
| Notifications | Existing notification service and canonical publish flows | Reuse | Canonical assignment/publish events remain the source of truth |
| Roles and permissions | Existing authentication and role middleware | Reuse | Admin manages Hire; participant sees only own assignment; trainer sees assigned interviews/GDs |

## Removed duplication

The draft `HiringQuestion` and `HiringAttempt` execution paths were removed from
the active application. Legacy database tables are not dropped; startup performs
an additive migration of orphaned draft workflows into the canonical Quiz or
Coding store, preserving the old rows for recovery.

The dedicated GD creation modal was also removed. Both Hire interview entries now
use `InterviewDashboard` and `ScheduleInterview`, with a mode query selecting the
normal-interview or Group Discussion workflow.

## Compatibility guarantees

- Training quizzes and coding assessments default to `context=TRAINING`.
- Hire-created content is course-less and uses `context=HIRE`.
- Existing interview URLs and records remain valid.
- Existing interviews default to Training; no ambiguous old sessions are silently reclassified as Hire.
- Existing training enrollment checks remain unchanged; the Hire assignment gate
  applies only when the coding assessment context is `HIRE`.
- Schema changes are additive. No existing records or legacy tables are deleted.

## Loading failure and fixes

`useToast()` returned a new object on every render. Assessment fetch callbacks
depended on that object, so each loading/data update recreated the callback and
retriggered the fetch effect. Memoizing the shared toast API fixes the cause in
Hire and the reused quiz/coding detail screens. Hire list/detail requests also
ignore stale responses, invalidate closed detail requests, and show retryable
errors instead of indefinite loading.

Hire publishing/closing delegates to the existing quiz/coding handlers, including
their validation and notifications. Hiring quizzes never infer an unrelated
training, and an empty hiring quiz cannot be published. Candidate metadata does
not expose quiz authoring answers. Candidate interview responses expose only
their own published evaluation.

The existing Reports & Analytics page and `/reports/admin` endpoint now accept
a Training/Hire filter with links to the existing detailed reports. Scheduling,
editing, room exits, and evaluation links preserve the Hire return destination.

## Verification (2026-09-12)

- Seven React component regression tests cover stable loading, retries, stale
  responses, closing pending details, both Hire entry points, and legacy scheduling.
- Backend regression tests exercise canonical publish delegation, registration
  rechecks/idempotent assignment, Hire-only roster rules, legacy GD/interview
  scheduling, evaluation publication, privacy, and the existing report filter.
- Final targeted backend run: 30 tests passed across three suites.
- Read-only checks against the configured database returned successful assessment,
  interview, and Hire-report responses using the updated controllers.
- Production frontend build passed; final navigation changes also pass component
  tests and lint parsing.
- The additive Interview context migration was applied and its presence verified.
- Full backend suite: 365 passed, two unrelated existing trainer search/bulk-delete
  tests failed before the last two additional Hire regressions were added.
- Frontend lint has no errors (64 existing hook warnings).
- Browser verification at the supplied LAN URL is blocked by
  `ERR_CERT_COMMON_NAME_INVALID`. Live multi-device webcam, QR, and recording
  verification remains pending; automated coverage is not a substitute for it.
- The existing backend process uses `node src/app.js` (no hot reload); restart it
  to activate the server-side changes. The running service was not interrupted.

## Bug-fix pass (2026-09-13)

Five surgical backend fixes, verified by `backend/test/hire-audit-fixes.test.js`.
No new modules, tables, APIs, or components; no data changes; all fixes reuse the
existing engines and validation paths.

1. **Interview deletion hardening** — `interviewController.deleteInterview` now
   rejects hard deletion of `COMPLETED`, `EVALUATED`, or `IN_PROGRESS` interviews
   (400). Previously only `COMPLETED` blocks existed, so evaluated Hire GDs could
   be permanently destroyed. `SCHEDULED`/`CANCELLED` deletion is unchanged.
2. **Unconditional GD auto-evaluation** — `interviewLifecycleService.saveEvaluation`
   flips any group discussion to `EVALUATED` once every member (any count/context,
   not only 6-member Hire GDs) has a scored evaluation. This matches the manual
   status-guard in `updateInterviewStatus` and keeps evaluations editable
   afterward. Fixes the stale `InterviewDashboard COMPLETED: []` gap.
3. **`runCode` attempt ownership** — `codingAssessmentController.runCode` rejects
   attempts whose `participantId` does not match the caller with 403 instead of
   leaking another participant's run results and mutating their attempt data.
4. **Hire quiz start gate** — `startQuizAttempt` enforces the Hire assignment via
   `hireProctoringPolicy.resolvePolicy('QUIZ', ...)`; an unassigned candidate gets
   a clean 403 (`Hiring assessment assignment required.`) instead of a 500.
5. **Quiz retakes** — `startQuizAttempt` now honors `allowMultipleAttempts` and
   `maxAttempts`: a completed attempt starts a fresh attempt when retakes are
   allowed and the count is under the limit; otherwise the existing 400
   (`You have already attempted this quiz.`) is preserved. The latest attempt
   (`id DESC`) is selected, so resume targets the most recent session.

### Verification (2026-09-13)

- New suite `test/hire-audit-fixes.test.js`: 13 tests — deletion guard for all
  three terminal/live statuses plus the allowed path; 3-member TRAINING GD
  unlocks `EVALUATED` (partial scoring stays `COMPLETED`) and an already
  `EVALUATED` GD remains editable/publishable; `runCode` 403 on foreign attempts
  and 200 on owned attempts; Hire start 403 for unassigned and 200 for assigned;
  retake-on (new attempt), retake-at-limit (400), and resume-latest (no create).
- Targeted backend regression run: 60 passed across `hire-audit-fixes`,
  `hire-workflow-regression`, `hiringArchitecture`, `interview-group-lifecycle`,
  `hire-proctoring-layer`, and `quiz-start-regression`.
- Frontend hire suite (`npm run test:hire`): 8 passed — Hire admin controls,
  list/detail stability, retry behavior, scheduler mode locking unchanged.
- No database or schema changes; restart `node src/app.js` to activate these
  server-side fixes.

## Hire AI proctoring audit (2026-09-13)

Audit of the complete existing proctoring flow
(Admin config → policy → participant verification → liveness → room scan →
continuous monitoring → events/evidence → risk report → admin review).
No rebuilds, no removals, no duplicate modules. Course/Training proctoring is
unchanged (verified by `mobile-monitoring-flow`, `monitoring-eye-head-scoring`,
`monitoring-assessment-parity`, `quiz-qr-reconnect-flow`, `mobile-camera-transport`,
`interview-mobile-monitoring` staying green).

### Issues found

- **IDOR on the unified monitoring REST API (security).** `POST/GET
  /api/monitoring/sessions/:id/{start-test,pause-test,resume-test,sync-duration,
  laptop/validate,mobile/pair,video,end,segments/*}`, `GET /status` and the
  segment listings never verified the caller owned the target session. Any
  authenticated participant could start/pause/resume/end, upload evidence/video
  onto, or read the segments of another participant's Quiz/Coding session (guessable
  `ms_*` ids). Only `recordCalibration` and `recordEvent` had internal ownership
  checks.
- **Cross-participant report listing.** `GET /api/monitoring/reports` let any
  participant list every course/assessment monitoring session when the Hire guard
  (`assertReportAccess`) did not apply.

### Issues fixed

- Added `guardSessionOwner` object-level ownership check (controller-level) to
  every unguarded monitoring mutation + participant-facing status/segment reads.
  Enforced for `PARTICIPANT` (must own the session; 403 otherwise, 404 for
  unknown ids); `ADMIN`/`TRAINER` keep their existing access. Does not apply to
  the public mobile pairing/validation routes (token + service-level checks).
- `getReportsList` now forces `participantId = req.user.id` for `PARTICIPANT`
  requests, so a candidate only ever sees their own proctoring summaries.

### Verified OK (no change needed)

- Evidence serving is authorized: `/uploads/hire-proctoring/*` is intercepted by
  `secureUploads` → `serveSecureFile` (participant must own the exact
  `MonitoringSession`; trainer denied; admin allowed; path-traversal + anti-cache
  headers). QR/session/participant binding, single-use tokens, reconnect
  idempotency, and mobile-camera isolation are already enforced and tested.
- AI proctoring ON/OFF is enforced at the backend, not just the UI:
  `monitoringService._startSession` sets `laptopStatus: DISABLED` and disables
  mobile for hire policies with `enabled=false`, and `hireWithoutMobile` skips
  `verify-start`. Liveness/identity/room-scan are server-verified; a client
  "success" state is never trusted.
- Cost controls already present: recorded video off by default, YOLO relay
  throttled (≥500 ms server coalescing + client fps), identity check ≥15 s
  interval, two-consecutive-mismatch rule before evidence, room scan limited to
  6–12 unique frames (duplicate-hash rejected), stable-phone → single +10 event
  with sampled leases, idempotency keys dedupe duplicate writes.
- Risk scoring uses the shared 5-part engine (`getReport`); escalation Low→
  Medium→High→Critical consistent for both Quiz and Coding.

### Files modified

- `backend/src/controllers/monitoringController.js` — ownership guard +
  participant report scoping.
- `backend/test/monitoring-session-ownership.test.js` — new regression suite.

### API changes

None (no endpoints added/removed, no response shapes changed). Behaviour:
foreign-session mutations now return `403`; unknown sessions `404`;
participant report lists are self-scoped.

### Database changes

None.

### Reused existing modules

Everything (no duplication): unified `monitoringService`,
`hireProctoringPolicy`/`hireProctoringService`, `assessmentVerificationService`,
`monitoringVideoService`, secure evidence pipeline, `secureUploads`, socket
`monitoringEvents`/`interviewEvents`, and the shared risk report/Excel engine.

### Security fixes

- Monitoring session IDOR closed (see above).
- Participant report-list leak closed.

### Performance/cost

No new AI/TTS/DB costs; mitigates abuse only (a participant can no longer
forcibly start/stop/end others' sessions, upload spurious evidence onto them,
or scrape their segments).

### Testing

- New `monitoring-session-ownership.test.js`: 17 tests (per-endpoint 403 for
  foreign sessions, own-session pass-through, admin/trainer access, unknown-id
  404, participant reports self-scoping, existing service-level guards intact).
- Targeted proctoring/hire run: 141 tests in 13 suites — all passing.
- Full backend suite: 408 passed; only the two pre-existing DB-dependent
  failures remain (`tests/trainerSearch.test.js`, `tests/trainerCourseBulkDelete.test.js`).
- Frontend `npm run test:hire`: 8/8 passing.

### Remaining issues

- Quiz and Coding start separate monitoring sessions per attempt (one per
  attempt, because each attempt owns its own score/timer keyed by
  `attemptId`). Evidence continuity across the Quiz→Coding transition is
  therefore via the shared `hireProctoring` metadata and the hire assessment
  report rather than one shared session id; rework only if a single coalesced
  session is a hard business requirement.
- `monitoring-videos` participant authorization (`fileController`) currently
  grants access to a video if the participant has *any* exam session. This
  predates the Hire flow and lives in the Course proctoring module; left
  untouched per the preservation rule.
- Homepage/UI-level voice-cooldown is in-app (interval-based); an explicit
  server-side TTS cooldown is unnecessary because warnings are client-generated
  (no server TTS cost).
- Restart `node src/app.js` on the running service to activate the guard.
