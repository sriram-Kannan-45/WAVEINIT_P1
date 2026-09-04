# Quiz and Coding monitoring parity

Quiz's unified monitoring service is the policy source. Coding now uses the
same configuration, browser detection, warning handling, audit score and report
pipeline. Coding-only gaze/head/grace configuration overrides were removed;
persisted `QUIZ` configuration is inherited by Coding. Configuration updates
through either type update this shared policy.

## Preserved Quiz rules

- Browser tab hiding, window focus loss and fullscreen exits use the existing
  two-second confirmation and monitoring-engine cooldown/idempotency gates.
- Fullscreen warnings ask the participant to return and continue. Repeated
  browser incidents do not submit or terminate either assessment.
- The first three ingested monitoring events receive the existing grace marker.
  The browser audit component counts **scored** `TAB_SWITCH`, `FULLSCREEN_EXIT`,
  `WINDOW_BLUR` and `PAGE_VISIBILITY_HIDDEN` incidents. More than three scored
  browser incidents add ten points to the audit score. Thus three initial grace
  events plus three scored browser events still produce zero browser penalty;
  the next scored browser event produces ten. The user's example was not used
  to replace these existing boundaries.
- Existing eye/head union-duration scoring (maximum 60), face absence (10),
  multiple persons (10), phone detection (10), browser incidents (10), and risk
  boundaries remain in `monitoringService.getReport`.
- These are malpractice audit points, not deductions from the academic grade.
  Timed assessment submission and unrelated security/session-ending rules remain.

## Integration corrections

- `useAssessmentFullscreen` and shared warning content replace separate Quiz and
  Coding fullscreen implementations. Warning text does not assert a score based
  on a local counter; the backend determines the audit penalty.
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
- `frontend/scripts/verify-monitoring-parity.mjs`: real QuizTaking, Coding shell,
  monitoring engine and trainer report in Chromium; five exits, transient exits,
  tab/focus events, duplicate event suppression, matching payloads and zero scores.
- `frontend/scripts/verify-coding-mentor.mjs`: real Coding page with four fullscreen
  exits, active monitoring on blur, writable mentor/editor, API failure recovery,
  camera preview, Run/Submit Code and final assessment submission.
- Frontend production build.

Browser HTTP/camera/fullscreen inputs are deterministic fixtures. These checks do
not modify a participant's live assessment or claim a live-device validation.
