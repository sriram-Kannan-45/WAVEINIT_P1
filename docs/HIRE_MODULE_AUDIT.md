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
