# Mobile camera verification and monitoring fix

Date: 2026-09-05. Workspace: `D:\feedWeb (2)\feedWeb`.

Implemented locally. No production deployment or real student attempt was modified during testing. Application tests and real-model empty-frame inference passed; physical phone-camera acceptance remains to be performed.

## 1. Files inspected

Paths below are relative to the workspace. Relevant sections were inspected before implementation; supporting call sites were checked again during integration.

| Area | Files |
|---|---|
| Verification, QR, permission and streaming | `frontend/src/pages/ParticipantQuizVerificationPage.jsx`, `frontend/src/pages/assessment/AssessmentMobileJoin.jsx`, `frontend/src/utils/mobilePairingUrl.js`, `frontend/src/components/assessment/DualCameraProctorWidget.jsx`, `frontend/src/components/monitoring/MobilePairingQRModal.jsx` |
| Attempt entry and active monitoring | `frontend/src/pages/ParticipantCodingAttemptPage.jsx`, `frontend/src/pages/ParticipantQuizAttemptPage.jsx`, `frontend/src/components/monitoring/UnifiedMonitoringWidget.jsx`, `frontend/src/proctoring/engine/MonitoringEngineClient.js`, `frontend/src/proctoring/hooks/useProctorMonitor.js`, `frontend/src/proctoring/hooks/useYOLOProctoring.js`, `frontend/src/proctoring/hooks/useFaceDetection.js`, `frontend/src/proctoring/constants.js` |
| Backend verification and transport | `backend/src/services/assessmentVerificationService.js`, `backend/src/controllers/assessmentVerificationController.js`, `backend/src/routes/assessmentVerificationRoutes.js`, `backend/src/socket/assessmentVerificationEvents.js`, `backend/src/socket/events/monitoringEvents.js`, `backend/src/config/socket.js` |
| Inference and dependencies | `ai-service/inference/yolo_detector.py`, `ai-service/inference/proctoring_detector.py`, `ai-service/main.py`, `ai-service/requirements.txt`; local Python package/model introspection |
| Monitoring, persistence and scoring | `backend/src/services/monitoringService.js`, `backend/src/services/yoloProctoringService.js`, `backend/src/services/proctoringService.js`, `backend/src/controllers/monitoringController.js`, `backend/src/models/monitoringSession.js`, `backend/src/models/monitoringEvent.js`, `backend/src/models/AssessmentVerificationSession.js`, `backend/src/config/bootstrapMonitoringSchema.js`, `backend/src/config/monitoringConfig.js` |
| Reports and recorded video | `backend/src/services/proctoringReportService.js`, `backend/src/services/monitoringVideoService.js`, `backend/src/services/monitoringExcelService.js`, `frontend/src/proctoring/components/TrainerMonitoringReport.jsx` |
| Assessment ownership and completion | `backend/src/controllers/codingAssessmentController.js`, `backend/src/controllers/participantCourseController.js`, `backend/src/routes/codingAssessmentRoutes.js`, `backend/src/routes/quizzesRoutes.js`, `backend/src/routes/aiQuizRoutes.js`, `backend/src/middleware/validateAssessmentSession.js`, `backend/src/models/QuizAttempt.js`, `backend/src/models/CodingAssessment.js`, `backend/src/models/AIQuiz.js` |
| Attendance and diagnostics | References in `backend/src/services/attendanceAutomationService.js`, `backend/src/controllers/attendanceController.js`, and a targeted detector/monitoring search in `backend/backend.log`; no useful current detection trace was found in that log |
| Existing regression coverage | `backend/test/monitoring-assessment-parity.test.js`, `backend/test/monitoring-eye-head-scoring.test.js`, `backend/test/ai-quiz-autosubmit-flow.test.js` |

Attendance has a separate implementation. No attendance file or desktop MediaPipe detector was changed. No new monitoring database or parallel event pipeline was introduced.

## 2. Existing architecture

The desktop creates/resumes an assessment attempt and a canonical `MonitoringSession`. A separate `AssessmentVerificationSession` supplies the expiring QR token and mobile socket JWT. The phone validates that token, requests its rear camera, negotiates WebRTC, and also sends sampled JPEG frames through Socket.IO.

Previously, verification frames entered the older `yoloProctoringService`, while the assessment widget used the unified monitoring service and sometimes uploaded its received mobile stream again. Verification IDs and canonical monitoring IDs were not consistently resolved to the same attempt/room. The older service dropped composition fields from its response.

Now authenticated verification frames resolve the exact participant, assessment type, assessment ID and attempt, then use `monitoringService.validateMobile`. The assessment widget's canonical ID resolves to the same verification room. The phone is the single uploader for this quiz/coding mobile path.

Desktop monitoring still uses MediaPipe for face, gaze and head pose, with the existing YOLO person-presence fallback. Recorded-video processing remains a separate existing pipeline whose final aggregation calls the monitoring report service.

## 3. Actual model and environment

Runtime introspection confirmed **YOLO11s**, not merely a filename mentioned in a comment. The local loader selected:

`D:\New folder (8)\AI-Based-online-exam-proctoring-System\futurproctor\proctoring\ml_models\yolo11s.pt`

Local runtime: Ultralytics **8.4.135**, PyTorch **2.13.0**, OpenCV **4.11.0.86**, NumPy **1.26.4**. CUDA is unavailable; the model runs on **CPU**. Model health now includes the actual Ultralytics version and device as well as model path/classes.

The loaded weights expose all 80 COCO classes. Relevant class IDs are **0 person, 63 laptop, 67 cell phone, 73 book**. A TV is class 62 and no longer qualifies as a laptop for quiz/coding entry. Detection confidence remains **0.35**. Inference dimensions remain at most 640 pixels.

The project requirements specify broad minimum versions; the deployed Azure package/model/device state was not inspected. The loader also supports `YOLO_MODEL_PATH`, local YOLO11s candidates, and a YOLOv8n fallback. Model weights are not tracked in this repository. Do not assume an Azure deployment uses the local external Windows weights: verify its model health output and provision the intended existing YOLO11s weights there.

## 4. YOLO11s versus YOLO26s

| Published comparison at 640 pixels | YOLO11s | YOLO26s |
|---|---:|---:|
| COCO mAP 50–95 | 47.0 | 48.6 |
| CPU ONNX latency | 90.0 ms | 87.2 ms |
| T4 TensorRT latency | 2.5 ms | 2.5 ms |
| Parameters | 9.4 million | 9.5 million |

These are vendor benchmark results, not measurements of this application's PyTorch CPU service. YOLO26 introduces an NMS-free architecture and small-object improvements, but its headline CPU speed improvement is not the small-model result in this table. Neither benchmark establishes accuracy on this application's partially visible people, laptops or phones. Source: [Ultralytics comparison](https://docs.ultralytics.com/compare/yolo26-vs-yolo11).

## 5. Selected model

**Retain YOLO11s and the existing weight loader.** It already loads successfully, supplies the required classes, and fits the current inference contract. No new dependencies, model download, GPU requirement or weight migration was introduced. YOLO26s might merit a later benchmark using representative camera footage, but there is no project-specific evidence that a switch resolves the observed transport and validation bugs.

## 6. Connection delay: causes and changes

- The desktop initialization effect depended on attempt/session state it changed itself, repeating initialization. Dependencies now use the route inputs.
- Metadata/course requests delayed QR initialization. Pairing now starts before those requests finish.
- Mobile peer notifications could close and recreate an offer already negotiating. Offers are deduplicated for the same peer, with in-flight protection and explicit handling of a new desktop peer.
- The phone could send frames/offers before asynchronous room authorization finished. It now waits for the join acknowledgement.
- The backend bridged each offer/answer into multiple event namespaces, producing duplicate negotiation in a widget listening to both. Assessment signaling now uses one authorized namespace.
- The verification page's polling request omitted its required authorization header. It is now authenticated.
- Permission-denied/security errors retried camera acquisition through fallback constraints. Those errors now stop immediately and show the permission failure.
- Frame requests could overlap. Mobile capture and backend inference now apply backpressure rather than building a queue.
- Real YOLO11s inference on an empty 640×480 JPEG measured **7000.84 ms cold**, followed by **449.89, 396.04 and 488.34 ms**. The mobile inference timeout increased from four to ten seconds; its socket acknowledgement timeout is twelve seconds. This avoids discarding the cold result while maintaining one outstanding request. It does not eliminate the model's cold-start work.

WebRTC still uses the existing STUN configuration. The JPEG transport supplies preview/inference when direct WebRTC is unavailable. No TURN service was provisioned.

## 7. Entry-condition defects

Previously the button was enabled while every checklist item was waiting. The click handler stored a bypass marker and navigated without calling server verification. Permission/connection handlers wrote both camera flags as true. `verifySessionForStart` accepted a session without person/laptop evidence and could fall back to an unscoped session lookup.

Now the button requires fresh stable detection and a live received feed. It calls `verify-start` before navigation. The server independently checks exact ownership, current pairing generation, non-completed attempt monitoring, and fresh person/laptop evidence. A new attempt-page gate and server guards protect assessment entry and answer/run/submit routes. The monitor cannot start its test timer without mobile admission when mobile monitoring is enabled.

Socket camera credentials are restricted to their assessment transport; client socket messages cannot unlock, start or end an assessment. Completion cleanup is scoped by assessment type and participant so overlapping quiz/coding attempt IDs cannot close unrelated sessions.

## 8. Detection policy

The new `ai-service/inference/mobile_composition.py` evaluates actual model detections for **quiz/coding MOBILE_CAMERA only**. Other detector flows retain their existing behavior.

Person and laptop each need confidence ≥0.35. Their visible box areas must cover at least the existing 4% and 2% of the image, respectively. Border-touching/cropped boxes are permitted; the policy does not demand a complete body or complete laptop. Very small or low-confidence fragments fail verification.

Person and laptop presence determine entry independently of phone detection. Phone scoring requires a stable `cell phone` detection after entry while monitoring is ACTIVE. Separate pre-entry/active inference histories prevent pre-entry phone frames from satisfying the post-entry confirmation window. Existing mobile extra-person, extra-screen and book rules retain their event path with temporal confirmation.

## 9. Sampling and stability

| Mechanism | Inspected behavior / resulting behavior |
|---|---|
| Phone JPEG capture | Existing 600 ms cadence retained, with one outstanding request. Capture now preserves aspect ratio up to 640px instead of reducing to 320×240. |
| Backend mobile sampling | At least 500 ms between samples; one in-flight job per canonical monitoring session in each process. |
| Entry confirmation | Existing two consecutive valid sampled frames. |
| Temporary detection loss | Previously the UI failed immediately despite counters. Now retain eligibility for the first two missing samples and revoke on the third. |
| Disconnected/stale detector | Five-second freshness limit; temporal history resets after a gap longer than five seconds. Refresh rotates a pairing-generation hash, invalidating old evidence. |
| Phone confirmation | Two consecutive sampled detections, independent of entry composition. |
| Desktop live pipeline | Existing six FPS default; recorded-video mode uses a five-second occupancy heartbeat. No change. |
| MediaPipe person fallback | Existing one-second check interval. No change. |
| Separate face hook | Existing 2800 ms interval. No change. |
| Desktop event handling | Existing duration/incident aggregation, event-specific cooldowns and browser-event rules. No change. |
| Recorded-video analysis | Default 30-minute segments, three sampled FPS, subject to deployment settings. Not 30-second camera snapshots. |
| Coding autosave | Thirty-second server answer-save interval; unrelated to camera inference. |

## 10. Event storage

No JPEG is written to a monitoring table on every frame. A compact evidence lease is stored in existing `MonitoringSession.metadata`: changed eligibility/pairing generation writes immediately; unchanged evidence refreshes at most once every two seconds. This is tied to the existing two-second status polling rather than introducing an arbitrary 30-second delay before entry.

Phone detection creates one `MonitoringEvent`, with the existing compatibility mirror in `ProctoringEvent`. Reports deduplicate the mirror through the shared idempotency key. Existing other mobile violations use interval tracking. Evidence and score updates use transactions and row locks; no new table or schema field is required.

## 11. Exactly-once phone marks

The authoritative key includes assessment type, participant and attempt:

`mobile_phone_<QUIZ-or-CODING>_<participant>_<attempt>`

The existing unique `idempotency_key` constraint prevents duplicate awards across retries, refreshes and replacement monitoring sessions. Server-confirmed mobile phone detection adds **10** once, including when it is the first event; the general first-three-warning exemption does not suppress this requested rule. Other event scoring retains its prior rules.

Existing session metadata persists `mobile_phone_detected` and `mobile_phone_score_awarded`. Later frames do not award another ten. Permission, connected status, pre-entry observations, inactive monitoring, and client-supplied phone events cannot award these marks. Desktop phone events do not contribute to the new mobile category.

## 12. Reports

The monitoring report now returns `mobilePhoneDetected` and `mobilePhoneScore`, and the trainer UI and Excel summary explicitly show **Mobile Phone Detected: Yes/No** and **Mobile Phone Score: 10/0**. The five-part total includes the mobile category once.

The final proctoring summary carries these values. Report reads query the persisted attempt-scoped phone award even if a newer monitoring session was created for the same attempt. Reading a report does not create or re-award a phone event. Completion uses the same report aggregation.

## 13. Test results

**56 backend tests passed** across mobile monitoring, assessment parity, desktop eye/head scoring and quiz autosubmit. **Seven Python policy tests passed**. Frontend production build and changed JavaScript syntax/whitespace checks passed. The actual local YOLO11s model processed four empty JPEG frames successfully with zero detections and no eligibility/phone flag.

Policy tests intentionally use detection fixtures to exercise decision boundaries; they are not claims that the model recognized people/objects in real camera footage. Backend storage tests use model mocks, not a production database.

| Scenario | Result and evidence |
|---|---|
| A. QR and fast connection | Authorized room/ACK/peer-isolation test passed; build passed. No physical QR scan or measured phone-to-browser latency test was possible in this session. |
| B. Person + full laptop | Two-frame policy test passed; physical camera accuracy unverified. |
| C. Person + partial laptop | Border-cropped laptop policy test passed; physical accuracy unverified. |
| D. Partial person + laptop | Border-cropped person policy passed; weak/tiny evidence correctly rejected. Physical accuracy unverified. |
| E. Person only | Repeated policy samples denied. |
| F. Laptop only | Repeated policy samples denied. |
| G. Empty feed | Policy samples denied and actual model empty-frame smoke test passed. |
| H. Stable phone | Backend awarded exactly 10; first-event case included. Python single-frame versus two-frame phone checks passed. |
| I. Repeated phone | Repeated requests retained one award/event and ten marks. |
| J. No phone | Inference-response test created no phone event; report returned zero. |
| K. Desktop phone | Report's mobile category remained zero. Untrusted mobile event submission was also rejected. |
| L. Temporary loss | Two missing samples retained eligibility; third revoked it; reacquisition required two valid samples. |
| M. Controlled writes | Ten sampled requests produced one phone event and at most three lease updates plus its scoring update. Single in-flight inference verified. |
| N. Report | Backend report fields/total checked; existing Excel aggregation regression passed. Trainer UI compiled successfully. |
| O. Reload/reopen | Repeated report reads and a recreated monitoring session retained a single ten-mark award. |
| P. Completion | Repeated completion-state reporting retained ten; late detection did not add an event or reopen the monitor. |

Commands, run from the workspace unless noted:

```powershell
npm test --prefix backend -- --runInBand test/mobile-monitoring-flow.test.js test/monitoring-assessment-parity.test.js test/monitoring-eye-head-scoring.test.js test/ai-quiz-autosubmit-flow.test.js
# From ai-service:
.venv/Scripts/python.exe -m unittest discover -s tests -p test_mobile_composition.py -v
# From frontend:
npm run build
```

## 14. Remaining limitations and release verification

- No authenticated browser or physical phone session was available through the browser tooling. Real QR scanning, camera permissions, visual partial-object accuracy, network reconnection and full assessment submission need a controlled real-device acceptance run. No real student was scored for testing.
- Detection quality depends on lighting, angle, visible area, motion and the pretrained model. Temporal filtering reduces single-frame errors but does not establish an accuracy guarantee or detect replayed footage.
- A paired device is validated through the expiring session credential and scoped socket JWT, not hardware attestation.
- The local backend and Python service were restarted on September 5 after the connection follow-up below. No Azure deployment, database migration, TURN configuration or model download was performed. Deploy the backend, frontend and Python changes together; the backend requires the Python `mobile_evidence` response and correctly denies entry without it.
- Check the deployed model health and existing database unique index on `monitoring_events.idempotency_key`. Tests exercised idempotency logic with mocks; live cross-worker database contention was not load-tested.
- Temporal histories and in-flight limits are process-local. A reconnect restabilizes after an idle gap; multiple AI replicas should use session affinity if consistent per-session frame histories are required. Overall multi-user CPU capacity was not benchmarked.
- The measured first inference is still about seven seconds on this local CPU. The adjusted timeout accommodates it; transport fixes cannot remove model cold-start cost. Keep the AI service warm and assess production resource capacity during deployment.

## Connection follow-up: mobile preview with desktop still loading

Read-only database inspection found two verification sessions for coding attempt 56 created six milliseconds apart: one had recorded mobile permission and the other remained pending. Duplicate initialization could therefore split the phone and laptop across different rooms. Both local service processes also predated the code changes.

- Session initialization now takes a database update lock on the owned, active attempt inside a transaction. Concurrent requests reuse the same QR session. Restoring older duplicates prefers the already paired session.
- Both verification clients acknowledge room membership, display connection errors, retry joining, and support initial HTTP polling with WebSocket upgrade.
- Mobile JPEG delivery and its acknowledgement no longer wait for AI inference. Frames travel through the Socket.IO adapter, avoiding the database event outbox. Deployments with multiple backend workers need a shared Socket.IO adapter or session affinity; the database outbox does not transport video.
- The laptop acknowledges received frames. The phone labels an unconfirmed local preview accurately, and shows a connection warning with a retry action.
- The laptop tracks video freshness separately from detection freshness. A slow detector cannot erase a working preview; it still cannot grant assessment admission without fresh person-and-laptop evidence.

Validation: 59 backend tests across five suites passed, including simultaneous quiz/coding initialization and a real two-client Socket.IO polling test. That test received multiple frames and a desktop receipt while the AI response remained deliberately pending, rejected a wrong-room frame, and confirmed that JPEGs did not enter the relay outbox. Seven Python policy tests and the production frontend build also passed. These tests do not substitute for a physical phone and laptop acceptance run.

Post-restart runtime verification: backend health returned healthy. The running Python 3.12 service uses the system interpreter, Ultralytics 8.4.102, CPU, and the same YOLO11s weights (the earlier isolated `.venv` measurements used 8.4.135). Its detector status returned UP. A synthetic blank frame posted directly to the running AI service returned success with `mobile_evidence.eligible=false`, no person, no laptop, and no stable phone; cold inference took 9.69 seconds. This smoke check used a synthetic session and did not score or modify a student attempt.

## In-test preview and camera reconnection

The assessment widget now renders the received mobile video, with sampled JPEG frames as a fallback. Active quiz/coding monitoring cannot be minimized. The coding monitoring panel stays at the bottom of its scrolling sidebar. Decoded video frames and received JPEGs determine connectivity; signaling messages and detector results cannot keep a dead feed marked connected. Eight seconds without video clears the stale preview and offers reconnection.

While video is connected, missing person/laptop detections produce persistent repositioning messages on the desktop and phone. Adjusting the camera requires no QR scan and does not navigate out of the attempt. Delayed inference displays a detection-waiting message while preserving live video.

`POST /api/assessment-verification/reconnect` returns the same admitted room's QR URL after checking authenticated ownership, admission, monitoring status, and the underlying in-progress attempt. A `USED` QR can reconnect an active admitted attempt after the initial pairing expiry. Each scan issues a fresh socket JWT. It does not rotate the pairing token, reset admission, restart the attempt, modify timers/answers, or clear scores. Ended and mismatched attempts remain rejected. The reconnect QR disappears automatically when video returns.

Validation: 62 backend tests passed, including quiz/coding rescans after expiry, unchanged attempt monitoring metadata/timer/score, fresh socket credentials, rejection cases, and a real Socket.IO replacement-phone connection delivering video to the existing desktop room. Three frontend state tests cover missing objects, repositioning recovery, connection loss, and delayed detection. A server-render smoke check confirmed the mobile video element and reconnect control are rendered and the active widget has no minimize action. The production frontend build passed. Local backend restarted to activate the endpoint; physical-device acceptance is still required.
