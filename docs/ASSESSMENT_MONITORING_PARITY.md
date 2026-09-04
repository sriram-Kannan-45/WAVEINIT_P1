# Quiz and Coding monitoring parity

Quiz's unified monitoring service is the policy source. Coding now uses the
same configuration, browser detection, warning handling, audit score and report
pipeline. Coding-only gaze/head/grace configuration overrides were removed;
persisted `QUIZ` configuration is inherited by Coding. Configuration updates
through either type update this shared policy.

## Shared rules

- Browser tab hiding, window focus loss and fullscreen exits use the existing
  two-second confirmation. One departure/return episode produces one incident,
  even when blur, visibility, fullscreen and vendor events fire together. Short
  departures are ignored; confirmed separate departures are never swallowed by
  the camera detector's cooldown. Background-timer throttling is handled on return.
- Fullscreen warnings ask the participant to return and continue. Repeated
  browser incidents do not submit or terminate either assessment.
- The latest requirement makes the browser boundary explicit: the first three
  confirmed switches receive warnings; the fourth adds the existing ten audit
  points, capped at ten for that category. Counting only non-grace events applied
  the threshold twice, delaying the penalty until switch seven. Reports now count
  all confirmed browser incidents. Other categories retain their existing grace
  and scoring logic. Browser warnings are not consumed by unrelated AI events.
- Existing eye/head union-duration scoring (maximum 60), face absence (10),
  multiple persons (10), phone detection (10), browser incidents (10), and risk
  boundaries remain in `monitoringService.getReport`.
- These are malpractice audit points, not deductions from the academic grade.
  Timed assessment submission and unrelated security/session-ending rules remain.

## Integration corrections

- Quiz's floating camera was behind the quiz's fixed z-index 9999 surface. The
  shared widget now lives inside the quiz sidebar. Parent stream-prop cleanup
  also destroyed monitoring as the first stream arrived; camera ownership now
  lives in `useAssessmentCamera`, with disconnection recovery and permission retry.
- QuizTaking, Coding and the older ExamShell use `UnifiedMonitoringWidget` and
  `MonitoringEngineClient`. ExamShell's separate camera, tab/fullscreen listeners
  and mouse-leave counter were removed. New dashboard quizzes use the same consent
  callback contract and QuizTaking instead of launching the older monitoring flow.
  Unused legacy ProctorProvider/fingerprint hooks were removed from the current
  Quiz and Coding pages to avoid starting a second background session flow.
- `useAssessmentFullscreen` only displays shared engine notifications; it no
  longer emits its own duplicate events. Warning text leaves scoring to the server.
- Browser incidents have stable IDs, a sessionStorage retry queue, acknowledgment
  checks and a flush before submission. Server ingestion uses transactions and a
  session row lock so concurrent requests/retries cannot overwrite counts. Duration
  updates use the same lock, and late lifecycle requests cannot reopen a finished test.
- The real `monitoring_sessions` database and Sequelize model both lacked
  `metadata`, although the service already wrote timing into it. The additive,
  idempotent `20260904b-monitoring-session-metadata.js` migration adds JSON metadata
  and runs at startup. It was applied and verified on the configured database.
- Finalization persists the computed score, browser count and final audit summary.
  Delayed events from before submission update that summary under the same lock.
- The individual Excel export now includes the unscored warning history and
  warning/incident totals; a warning-only attempt is no longer labelled clean.
- Quiz's separate copy-protection browser listener is disabled. Clipboard/content
  protection remains separate; tab events cannot consume its disqualification
  budget. The legacy proctor endpoint also excludes browser incidents from its
  termination budget for both assessment types.
- Coding no longer pauses monitoring on window blur, which previously suppressed
  switch detection and changed the active-duration denominator. Final submission
  flushes pending detection intervals as Quiz does.
- Session starts, grace counts, report events, duration lookup and recording
  fallback are scoped to the correct assessment/session. Numeric Quiz and Coding
  attempt IDs may overlap without mixing their reports.
- Trainer report requests carry `contextType`; UI and both Excel formats consume
  backend scores and preserve explicit zero values. Report lists use the same final
  score. Failed export calculations surface an error instead of a clean zero row.
- Coding results include a Monitoring Excel download using the shared endpoint.
  Its academic percentage comes from `CodingResult`, separately from the audit.
- Browser testing exposed an existing undefined `outOfHelp` variable in Quiz's
  mentor; it is now derived from that component's existing remaining-help value.

## Verification

- `backend/test/monitoring-assessment-parity.test.js`: actual service ingestion and
  report methods with an isolated persistence fixture, configuration inheritance,
  colliding attempt IDs, grace/penalty boundaries, report-list filtering, Excel
  values, and non-terminating legacy browser events for both types.
- `backend/test/monitoring-eye-head-scoring.test.js`: existing duration, union,
  audit scoring, cooldown, recording/export and active-time regression checks.
- `frontend/scripts/verify-quiz-monitoring.mjs`: actual Quiz page in React
  StrictMode, visible camera, stable navigation, four combined browser departures,
  failed-request retry, camera recovery, minimize/expand and finalization.
- `frontend/scripts/verify-monitoring-parity.mjs`: real QuizTaking, Coding shell, older ExamShell,
  monitoring engine and trainer report in Chromium; five exits, transient exits,
  tab/focus events, duplicate event suppression, matching payloads and zero scores.
- `frontend/scripts/verify-coding-mentor.mjs`: real Coding page with four fullscreen
  exits, active monitoring on blur, writable mentor/editor, API failure recovery,
  camera preview, Run/Submit Code and final assessment submission.
- Frontend production build.
- `backend/scripts/verify-monitoring-database.js`: real PostgreSQL ingestion for
  both assessment types, concurrent requests, retry deduplication, both event
  stores, saved counters, final report and Excel. All fixture writes roll back;
  existing attempts are only read to satisfy foreign keys.

Browser HTTP/camera/fullscreen inputs are deterministic fixtures. These checks do
not modify a participant's live assessment or claim a live-device validation.
