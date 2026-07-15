# Coding Assessment Module — Final Code Review

**Verdict:** NEEDS_FIXES

The branch lands a large vertical slice of the coding assessment module, and the new `/api/coding-assessments`, `/api/coding-attempts`, `/api/code` and `/api/recordings` routes are covered by passing unit/integration tests. However, there are several correctness, security and wiring issues that must be addressed before this can be approved. The most serious problems are: (1) hidden test cases and trainer-only assessment details are exposed to participants, (2) the participant result and attempt pages call trainer-only endpoints, (3) the old `/api/coding` router is still mounted but references a non-existent service function, and (4) the screen-recording/proctoring flow passes functions through React Router state and mis-wires the proctoring session to quiz semantics.

---

## Critical Issues

### 1. Participant endpoints fetch trainer-only assessment data and expose hidden test cases
**Files:**
- `frontend/src/pages/participant/CodingAssessmentAttempt.jsx:90` — calls `codingAssessmentApi.get(assessmentId)`
- `frontend/src/pages/participant/CodingExamShell.jsx:77` — loads attempt via `codingAttemptApi.get(attemptId)`
- `backend/src/routes/codingAttemptsRoutes.js:70-115` — `GET /api/coding-attempts/:id` returns the full assessment including all `TestCase` rows (hidden and visible)
- `backend/src/routes/codingAssessmentsRoutes.js:91-136` — all `codingAssessmentsRoutes` require `TRAINER`/`ADMIN`

**Problem:** There is no participant-safe read endpoint for a coding assessment. The readiness page and the exam shell therefore reuse the trainer-only `GET /api/coding-assessments/:id`, which returns hidden test cases. The attempt GET also eagerly includes every test case with no filtering. Participants can see hidden inputs/expected outputs before and during the exam.

**Suggested fix:** Add a participant-scoped endpoint such as `GET /api/coding-assessments/:id/participant` (or reuse `/api/coding/participant/assessments/:id` from the legacy router after fixing it) that returns only the published assessment metadata and visible test cases. Update `CodingAssessmentAttempt.jsx` and `CodingExamShell.jsx` to call this endpoint instead of the trainer endpoint.

---

### 2. Code submission returns hidden test case details
**Files:**
- `backend/src/routes/codeExecutionRoutes.js:95-169` — `POST /api/code/submit`

**Problem:** The endpoint runs all test cases including hidden ones and returns the full `results` array with `stdin`, `expectedOutput` and `actualOutput` for every test case. `hiddenTestsPassed`/`hiddenTestsTotal` are computed but never used as the response shape. Participants can reconstruct hidden test data from the response.

**Suggested fix:** Before returning the response, redact hidden test case details. Return only `status` and `isHidden: true` for hidden test cases; keep input/output only for visible test cases. The current `hiddenTestsPassed`/`hiddenTestsTotal` fields are already computed and should become the only hidden-test information in the response.

---

### 3. Participant result page calls protected start endpoint and will fail for submitted attempts
**Files:**
- `frontend/src/pages/participant/CodingAssessmentResultPage.jsx:39-77`
- `backend/src/routes/codingAttemptsRoutes.js:42-68` — `POST /api/coding-attempts/start`

**Problem:** The result page calls `codingAssessmentApi.get(assessmentId)` (trainer-only) and then `codingAttemptApi.start(assessmentId)`. The start endpoint returns `409 Already submitted` if the participant has already submitted, so a participant trying to view their published result will receive an error instead of the result page.

**Suggested fix:** The result page should use a dedicated participant result endpoint such as `GET /api/coding-assessments/:id/my-result` that returns the assessment (with visible test cases only), the participant's final attempt, and the published result status in a single call. Do not call `start` from the result page.

---

### 4. Test result panel never renders run/submit output
**Files:**
- `frontend/src/components/TestResultsPanel.jsx:18-128`
- `frontend/src/hooks/useCodeExecution.js:15-39`

**Problem:** `useCodeExecution` stores the API response as `{ type: 'run'|'submit', ...data }`. The API returns `results` (an array of `{ stdin, expectedOutput, actualOutput, status }`), but `TestResultsPanel` reads `results.tests` and expects properties named `passed`, `input`, `expected`, `output`, `isHidden`. Because the shape mismatch is total, the panel always shows "No test results available" even after a successful run/submit.

**Suggested fix:** Either normalise the result in `useCodeExecution` into the `tests` shape expected by `TestResultsPanel`, or update `TestResultsPanel` to read `results.results` and map `status === 'OK'` to passed, `stdin` to input, `expectedOutput` to expected, `actualOutput` to output, and include `isHidden` for submit results.

---

### 5. Legacy `/api/coding` router is mounted but broken
**Files:**
- `backend/src/app.js:1210` — `app.use('/api/coding', codingAssessmentRoutes)`
- `backend/src/routes/codingAssessmentRoutes.js:9` — `const { runTestCases } = require('../services/codeExecutionService')`
- `backend/src/routes/codingAssessmentRoutes.js:239` — `runTestCases(...)`

**Problem:** `codeExecutionService.js` exports `runTests`, `executeCode` and `calculateScore` but not `runTestCases`. Any call to the legacy `/api/coding/participant/attempts/:attemptId/run` or `/submit` endpoints will throw a TypeError at runtime. The legacy router also duplicates the new functionality and its URLs (`API.CODING.*` in the frontend) do not match the mounted routes.

**Suggested fix:** Remove the legacy router from `app.js` and delete `backend/src/routes/codingAssessmentRoutes.js` (or keep only unique AI/plagiarism endpoints after migrating them to the new router). Update or remove the stale `API.CODING` constants in `frontend/src/api/api.js`.

---

### 6. Recording controller cannot load proctor violations for coding assessments
**Files:**
- `backend/src/controllers/recordingController.js:108-124` — `list`
- `backend/src/controllers/recordingController.js:180-196` — `getOne`

**Problem:** Both methods query `ExamSession` using `where: { quizId: recording.quizId, participantId: ... }`. For coding recordings `quizId` is null and the session was created with `assessmentType='coding_assessment'` and `assessmentId=<coding_assessment_id>`. The violation lookup therefore returns zero violations for every coding recording.

**Suggested fix:** When `recording.assessmentType === 'coding_assessment'`, query `ExamSession` by `{ assessmentType: 'coding_assessment', assessmentId: recording.codingAttempt?.assessmentId, participantId: recording.participantId }` (or by `attemptId: recording.codingAttemptId` if the session stores it). For quiz recordings continue using `quizId`.

---

### 7. Recording stream endpoint blocks participants despite spec
**Files:**
- `backend/src/controllers/recordingController.js:207-263` — `stream`

**Problem:** The design spec states `GET /api/recordings/:id/stream` is authorised for `TRAINER`/`ADMIN`/`PARTICIPANT`. The current controller explicitly denies `PARTICIPANT` with `403 Access denied`. The viewer page also generates a stream URL containing the user's JWT, which only works for trainers.

**Suggested fix:** Allow participants to stream their own recording (i.e. `userRole === 'PARTICIPANT' && recording.participantId === userId`). Update the viewer to handle participant access if that route is ever exposed to participants.

---

### 8. Screen recording handlers are passed through React Router state
**Files:**
- `frontend/src/pages/participant/CodingAssessmentAttempt.jsx:147-163` — navigation to exam route
- `frontend/src/pages/participant/CodingExamShell.jsx:49-53` — reads `stopRecording`/`uploadRecording` from `location.state`

**Problem:** Functions cannot be serialised across route navigations. `stopRecording` and `uploadRecording` are passed inside `navigate(..., { state: ... })`; depending on the history implementation this either silently drops the functions or only works by accident. This breaks the recording finalisation path.

**Suggested fix:** Either (a) lift `useScreenRecorder` to the exam shell and restart the recording there after consent, or (b) keep the recorder state in a module-level singleton (the hook already uses `globalScreenStream` for the stream) and add a way to retrieve the current recorder controls by `sessionId`. The cleanest fix is to render the exam shell as a child route or conditional UI of the same component so the hook is never unmounted.

---

### 9. Proctoring session is started as a quiz session
**Files:**
- `frontend/src/pages/participant/CodingAssessmentAttempt.jsx:147` — `proctor.start({ quizId: Number(assessmentId), attemptId: Number(attempt.id), ... })`
- `frontend/src/proctoring/ProctorContext.jsx:360` — `start` forwards `quizId` as-is
- `frontend/src/proctoring/api.js:48` — `startSession` posts to `/api/proctor/sessions/start`

**Problem:** The spec requires the proctoring session to be tagged with `assessmentType: 'coding_assessment'` and `assessmentId`. The current code passes `quizId: assessmentId`, so the backend creates an `ExamSession` with `assessmentType='quiz'` (the default) and `quizId=<coding assessment id>`. This pollutes quiz proctoring data and breaks violation lookups for coding assessments (see issue 6).

**Suggested fix:** Extend `ProctorContext.start` to accept `assessmentType` and `assessmentId` and pass them to `proctorApi.startSession`. If the backend proctoring controller does not yet accept these fields, update it to create `ExamSession` rows with the correct `assessmentType`/`assessmentId` and a null `quizId` for coding sessions.

---

### 10. Exam shell exposes hidden test cases and all submission history
**Files:**
- `backend/src/routes/codingAttemptsRoutes.js:70-115`

**Problem:** `GET /api/coding-attempts/:id` includes `CodingAssessment` with all `CodingQuestion`s and all `TestCase`s, plus all `CodingSubmission`s for the attempt. Even if a participant is the owner, they receive hidden test cases and the full submission trail in one response.

**Suggested fix:** For participant-owned attempts, filter the included questions to expose only visible test cases and filter submissions to final submissions only (or omit them if the exam shell fetches them separately). Consider splitting the response: trainers get full data; participants get a sanitised view.

---

## Medium / Minor Issues

### 11. Duplicate/conflicting API constants in frontend
**File:** `frontend/src/api/api.js:210-250`

`API.CODING` lists endpoints such as `/api/coding/assessments` and `/api/coding/participant/assessments/:id`, but the mounted backend routes are at `/api/coding-assessments` and `/api/coding-attempts`. The actual helper used by the UI (`codingAssessmentApi`) uses the correct paths, so these `API.CODING` constants are misleading dead code.

**Suggested fix:** Remove the stale `API.CODING` block or point every entry at the real route (`/api/coding-assessments`, `/api/code`, `/api/coding-attempts`, etc.).

---

### 12. `CodingAssessmentBuilder` supports create but not edit
**File:** `frontend/src/pages/trainer/CodingAssessmentBuilder.jsx`

The spec lists the builder page for both creating and editing assessments (`/trainer/trainings/:trainingId/assessments/create`). The current component only creates. There is no route handler for an `:assessmentId/edit` path, and the form never loads existing data.

**Suggested fix:** Add an edit route and load the existing assessment into the form when an `assessmentId` param is present; call `codingAssessmentApi.update` on submit.

---

### 13. `CodingAttempt.start` does not return a session token
**File:** `backend/src/routes/codingAttemptsRoutes.js:42-68`

The spec says the start endpoint "returns attemptId + sessionToken". The route currently returns only `attemptId` and `status`. The frontend then creates its own `sessionId` (`coding_${assessmentId}_${Date.now()}`) for the screen recorder and proctoring, which is not the server's session token.

**Suggested fix:** Integrate `ExamSession` creation into the start endpoint (or call the proctoring service) and return the server-generated `sessionToken`. Store it on the `CodingAttempt.sessionId` column.

---

### 14. Code execution route lacks ownership checks on `/api/code/run`
**File:** `backend/src/routes/codeExecutionRoutes.js:52-79`

Any authenticated user can run code against any `problemId`. There is no check that the user is enrolled in the assessment or that the assessment is published.

**Suggested fix:** Verify the problem belongs to a published assessment and that the participant has a valid `CodingAttempt` for it (or is a trainer/admin).

---

### 15. `codeExecutionService` timeout wrapper can exceed Piston timeout
**File:** `backend/src/services/codeExecutionService.js:53-72`

The service sets the Axios timeout to `timeout + 2000` and relies on Piston to kill long runs. If Piston does not honour the timeout, the backend can wait longer than intended. Also, `mapStatus` only detects `SIGKILL` as TLE; Piston may also report TLE via `run.signal === 'SIGTERM'` or `run.code === 124` depending on runtime.

**Suggested fix:** Wrap the Axios call in `Promise.race` with a hard local timeout slightly above the requested limit and map additional Piston TLE signals.

---

### 16. `CodingAssessment` model retains legacy `timeLimit` column alongside `durationMinutes`
**File:** `backend/src/models/codingAssessment.js`

The model defines both `timeLimit` (mapped to `time_limit`) and `durationMinutes` (mapped to `duration_minutes`). The spec only calls for `duration_minutes`. This is confusing and the legacy column is used by the old router.

**Suggested fix:** Remove `timeLimit` from the model and migrate any legacy data to `durationMinutes`.

---

### 17. `CodingQuestion` model has duplicate ordering columns
**File:** `backend/src/models/codingQuestion.js`

The model has both `order` and `orderIndex` (mapped to `order_index`). The spec only requires `order_index`.

**Suggested fix:** Remove the legacy `order` column and use `orderIndex` consistently.

---

### 18. `ExamSession` index still only covers `quiz_id`
**File:** `backend/src/models/examSession.js`

The model indexes are `[participant_id, quiz_id, status]`. Coding sessions use `assessment_id` and `assessment_type`; there is no index for them.

**Suggested fix:** Add indexes for `assessment_type` + `assessment_id` and `assessment_type` + `participant_id`.

---

## Tests

- `cd backend && npm test -- --testPathPattern='coding|codeExecution|recording' --runInBand` passes (7 suites, 86 tests).
- No lint script is configured for either workspace.
- Integration tests do not cover the participant end-to-end flow, hidden-test redaction, or the recording violation lookup for coding assessments.

---

## Routes Registration Check

- Backend `app.js` correctly mounts the new routers:
  - `/api/coding-assessments` → `codingAssessmentsRoutes`
  - `/api/coding-attempts` → `codingAttemptsRoutes`
  - `/api/code` → `codeExecutionRoutes`
  - `/api/coding-submissions` → `codingSubmissionsRoutes`
  - `/api/recordings` → `recordingRoutes`
- It also still mounts the legacy `/api/coding` router, which should be removed.
- Frontend `App.jsx` registers the required routes from the spec:
  - `/trainer/trainings/:trainingId/assessments/create`
  - `/trainings/:trainingId/assessments/:assessmentId/attempt`
  - `/trainings/:trainingId/assessments/:assessmentId/exam`
  - `/trainings/:trainingId/assessments/:assessmentId/result`
  - `/trainer/assessments/recordings`
  - `/trainer/assessments/recordings/:id`
  - `/trainer/coding`
  - `/trainer/coding/:assessmentId/results`
  - `/participant/coding/:assessmentId`
- Note that the spec route `/trainer/coding/:assessmentId/results` is rendered with `<TrainerCodingResultsPage />`, which wraps `CodingAssessmentResults` rather than the separate `CodingAssessmentResults.jsx` trainer page. This is functionally acceptable but naming is inconsistent.

---

## Summary

The implementation covers most of the spec's surface area, but the participant-facing security boundaries are not enforced: hidden test cases leak through the attempt and code-submit endpoints, and the participant UI calls trainer-only assessment endpoints. The proctoring/recording wiring is also fragile because it serialises recorder functions in route state and tags coding sessions as quiz sessions. These issues must be fixed before the module is safe to merge.
