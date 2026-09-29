# Hire room verification audit and implementation (2026-09-28)

## Audited architecture and actual flow

- `AssessmentVerificationSession` owns the existing expiring QR token and pairing. `assessmentVerificationEvents.js` authorizes the phone socket, replaces a prior phone, relays WebRTC signaling and sampled frames, and accepts the five binary photos only from the active paired phone. The laptop receives that stream in `ParticipantQuizVerificationPage.jsx`.
- The actual configured five steps are **front, left, right, bottom, desk**. The phone captures JPEGs in `AssessmentMobileJoin.jsx`; the paired socket sends each photo to `hireProctoringService.analyzeRoomStep`. The service stores accepted evidence and features in `MonitoringSession.metadata.hireProctoring`. The Python `RoomScanEngine` checks image quality, scene duplication, available orientation, laptop camera corroboration, and YOLO observations.
- After five steps, the laptop samples its received mobile video and calls the existing `/api/hiring/proctoring/sessions/:sessionId/room-scan-360` endpoint. The Python engine tracks eight sectors, travel, visual continuity, and loop closure. The Hire admission gate checks `roomScanClear` before assessment entry; workspace, identity, and liveness still use their existing gates.
- Admin review comes from `monitoringService.getReport` through the existing hiring report API. Evidence URLs are served through the authenticated `hire-proctoring` upload category.

## Findings and root causes

1. **Coverage could admit a different room.** Five photos had signatures, but the 360 request did not receive them and `roomScanClear` depended on coverage alone. Fixed with a persisted multi-view baseline, directional sector comparison, and a server-side 60% default policy gate.
2. **Object removal could be confirmed elsewhere.** Two absent detections cleared a pending object even if the camera had moved away. Fixed with independent quality checks, same-area visual matching, three consecutive clear frames, and before/after evidence.
3. **An object detector outage could look like an empty room.** YOLO exceptions returned an empty detection list. The backend now refuses to accept a photo or pass a 360 scan when required object detection is unavailable. A 360 sweep with no visible working computer also remains unverified.
4. **The HTTP 360 route lacked a live pairing check.** It accepted an authenticated participant request without verifying the paired phone socket. It now checks the existing verification room for an active mobile socket with a ready stream.
5. **Phone orientation was not sent to the five-photo or 360 checks.** The flow used visual fallback only. The paired mobile socket now relays fresh sensor readings when available; visual motion remains the fallback.
6. **Sector names did not follow turn direction.** A positive/rightward turn could label its second sector Left. Labels and reference mapping now follow the observed rotation sign.
7. **Admin review omitted baseline and object evidence.** The report now includes the five photo metadata, capture attempts, sector comparison, match threshold, and before/after object events.
8. **Old completed photo maps may lack a usable baseline.** For pre-assessment sessions, the service rebuilds a reference from accepted evidence/features where possible, otherwise reopens the five-photo sequence.

## Implementation

The baseline stores five image IDs, timestamps, direction IDs, quality scores, pHash-like signatures, equalized scene descriptors, and ORB descriptors in existing monitoring metadata. No fake 3D geometry is created. Accepted photo evidence and eight sampled 360 sector JPEGs are retained; whole 360 video is not. The duplicate threshold defaults to `0.82`. The live comparison uses the same bounded visual score for the three yaw-corresponding baseline views (front, left, right), reports all eight sector scores, and defaults to a `0.60` threshold. Bottom and desk remain baseline evidence and supplementary matches; they are not treated as yaw sectors. These scores are heuristics, not calibrated probabilities.

Final room admission requires verified five-photo baseline, physical 360 completion, configured coverage, required reference matches, a passing post-scan review, eight saved sector samples, no pending object, no unresolved object event, and available object detection. Existing workspace, identity, liveness, and mobile admission checks still apply afterward. The phone shows camera and AI status, direction, a coverage ring, instructions, warnings, and retry states. Admin review exposes evidence buttons and the audit timeline. English and Tamil guidance uses the existing voice path.

## Files audited and changed

Audited without changing: `backend/src/services/assessmentVerificationService.js`, `backend/src/models/AssessmentVerificationSession.js`, `backend/src/routes/hiringRoutes.js`, `frontend/src/services/hiringService.js`, `frontend/src/utils/hireRoomVoice.js`, `backend/src/middleware/secureUploads.js`, `backend/src/controllers/fileController.js`, `frontend/src/components/assessment/AssessmentQRPairingModal.jsx`, and the Hire sections of `docs/HIRE_MODULE_AUDIT.md`.

Modified: `ai-service/inference/room_scanner.py`, `ai-service/main.py`, `ai-service/tests/test_hire_room_coverage.py`, `backend/src/controllers/hireProctoringController.js`, `backend/src/services/hireProctoringPolicy.js`, `backend/src/services/hireProctoringService.js`, `backend/src/services/monitoringService.js`, `backend/src/socket/assessmentVerificationEvents.js`, `backend/test/hire-proctoring-layer.test.js`, `frontend/src/components/admin/hire/HireAssessmentsTab.jsx`, `frontend/src/pages/ParticipantQuizVerificationPage.jsx`, `frontend/src/pages/assessment/AssessmentMobileJoin.jsx`, `frontend/src/styles/admin-sessions.css`, and `frontend/src/styles/assessment-verification.css`.

Created: this audit report. No new QR mechanism, proctoring service, database table, or migration.

## API, storage, and configuration

- Existing endpoints and QR mechanism are reused. The 360 endpoint now rejects requests without a live paired mobile socket (`409 QR_NOT_PAIRED`). The Python room-step request accepts `duplicateThreshold`; the 360 request accepts baseline descriptors and policy thresholds. The 360 response adds `similarityReport`, `rescanRequired`, detector availability, and object transitions.
- No relational migration. New `hireProctoring` JSON metadata: `roomReference`, `roomSimilarityReport`, `roomObjectEvents`, plus capture attempt verdicts and quality fields. Before/after JPEG evidence uses the existing private uploads directory.
- `hireProctoringPolicy.js` centralizes duplicate, reference, detection frame, clear frame, and same-area thresholds. The admin can edit duplicate and reference match thresholds. `ROOM_YOLO_CONFIDENCE_THRESHOLD` is configurable in the AI service environment.

## Verification performed

- Backend: 9 related suites, 120 tests passed (Hire, QR reconnect, mobile transport, monitoring parity). Additional tests cover low similarity, detector outage, paired-phone route, same-view defense, and before/after evidence.
- AI service: 79 tests passed, 3 optional MediaPipe laptop pose tests skipped because that tracker is unavailable in this local Python environment. Tests cover quality, duplicate views, 360 coverage, same-area removal, and directional matching.
- Frontend production build passed. JavaScript syntax and `git diff --check` passed.

## Limits and follow-up acceptance

- No physical phone/laptop end-to-end run was possible here. Validate QR scan, camera permissions (including iOS orientation permission), WebRTC reconnect, voice playback, room retake, and admin evidence on supported devices before production rollout.
- 360 progress is currently held in the Python process, and the phone-sample hash ledger is held in the backend process. A multi-worker deployment needs session affinity or shared scan state and a shared sample ledger. The HTTP paired-socket check needs a cross-instance Socket.IO adapter if HTTP and phone sockets can land on different backend instances.
- The 360 HTTP request now accepts only short-lived JPEG hashes recorded by the active paired phone socket, and takes orientation from that same socket record. This binds submitted samples to the active phone transport. It does not provide hardware camera attestation against a compromised phone client.
- The baseline has three horizontal reference directions. Back and diagonal sectors have diagnostic similarity only; a room with identical front/left/right views but changed unseen areas may pass the visual match. Stronger coverage requires additional initial views or a calibrated embedding model.
- The 60% value is a configurable heuristic score. It needs a real-device dataset of matched and mismatched rooms to calibrate false acceptance and false rejection rates.

## Follow-up end-to-end 360 audit and fix

The remaining admission bug was that `analyze_360` used `closed && eight sectors && laptop motion` as `complete`; the backend accepted that alongside an aggregate reference score. Neither side required a saved sweep, a person in the laptop camera, or a working computer visible in the room. The old `/room-scan` route was another way to set `roomScanClear` without a continuous sweep. After room approval, the laptop waited for the debounced `room_state` broadcast before the phone started sending workspace inference frames.

The scanner now retains one sampled JPEG per verified direction. After actual loop closure, it runs YOLO again on all eight recorded images and reviews all five reference descriptors (front/left/right are required yaw matches; bottom/desk contribute context), person presence from the laptop camera, a laptop or desktop monitor with peripherals, and prohibited objects or extra people. A post-scan report describes every check. Missing person evidence keeps the scan pending until the candidate returns to the laptop camera. A baseline mismatch, missing computer, or prohibited object requires a new sweep. The backend saves the eight sector JPEGs and report, fails closed on missing evidence, and rejects a completed sweep without every required check. The legacy free-scan endpoint returns `410 GUIDED_SCAN_REQUIRED`.

The mobile workspace inference now requires one visible person and one face/head landmark set along with hands, laptop, and workspace; eligibility is revoked as soon as a required signal disappears. On room approval the laptop emits the completion state immediately, and the phone submits its first workspace frame immediately while retaining its single in-flight frame guard. Repeated successful 360 requests return the saved verdict without another AI call. Admin review displays the post-scan checks and sector images.

The follow-up verification passed 97 tests across seven related backend suites and 84 Hire AI tests (three optional MediaPipe pose tests skipped). The frontend production build and JSX syntax check passed. Tests cover physical coverage without a verdict, baseline matching, missing person/computer, backend fail-closed admission, legacy-route closure, phone sample provenance, and idempotent completion. A real phone/laptop run remains necessary to measure camera framing and model accuracy. The process-local scan state and phone sample ledger still need shared state or session affinity for a multi-instance deployment.

## Phone transition and voice follow-up

The supplied screenshots exposed a lost-state deadlock: the laptop showed `roomScanComplete`, but the phone still displayed the room-scan message. With WebRTC connected, the phone uploaded inference frames only after receiving an ephemeral laptop `room_state` completion event. If that event was missed, the backend never received a workspace frame and the laptop's Workspace Verified row remained Checking indefinitely. The phone also suppressed Hire framing speech whenever laptop room voice was enabled, and had no mapped prompts for missing person or face/head.

After a persisted 360 PASS, the backend now emits `assessment_verif:workspace_ready` to the paired phone. Socket join returns the same authoritative readiness for reconnects; the phone's existing status poll recovers any event missed during the join race. The phone starts its single-in-flight frame upload as soon as readiness is known, even if WebRTC is connected, and stops unnecessary scan-sample uploads. The room scan and workspace approval gates remain server-side. The phone and laptop now display the required face/head, hands, laptop, and desk framing, with manual voice replay; the phone speaks missing-person, head, hands, laptop, and workspace prompts. Mobile status presents the exact missing signal and never labels an ineligible frame ready.

The new socket reconnect, status recovery, and 360 completion emission tests passed along with the mobile framing status tests. A production frontend build passed before the final replay/reset copy edits; both changed JSX files parsed after those edits. Real phone audio playback and camera framing remain device acceptance checks.

## Final mobile framing requirement

The participant clarified that the phone camera after the 360° scan needs **a hand and the laptop**, without requiring the face, head, person, or desk in that phone frame. The Hire AI framing evaluator and backend admission policy now use this requirement. Two consecutive valid frames are still required, and missing hand or laptop visibility revokes eligibility. The five room photos, reviewed 360° scan, and its person/computer/object checks remain separate prerequisites. Extra people, secondary devices, notes, and phone detections still prevent a valid mobile framing result. The Hire path no longer runs the face landmark model, so lack of that model cannot stall this step. The phone and laptop instructions, voice prompts, and tests match the new requirement.

## 180° redesign, 29 September 2026

This section supersedes the 360° scan and threshold descriptions above for new sessions. The user showed a front photo accepted again as the left photo after a small downward camera move, and a scan stuck at 87% while laptop and phone reported different sectors. The root causes were a duplicate score that underweighted local features after cropping, an AI API clamp silently raising the configured 60% duplicate limit to 65%, and the old scan's eight sectors plus return-to-start closure requirement.

The five photo sequence remains front, left, right, bottom, desk. Each new capture is compared with prior accepted photo features; at 60% or greater similarity it is rejected with direction-specific move guidance, even when phone orientation changes. Strong ORB overlap now catches shifted or tilted copies whose global thumbnail differs. The score is a visual heuristic, not a calibrated probability.

The active scan endpoint retains its existing URL for compatibility but now runs `analyze_180`: start at the saved left view, cover front-left, front, front-right, and right in order, with 150° or more measured phone yaw travel. Distinct image evidence and left/front/right baseline matches at 60% are required; a timer or sensor movement alone cannot finish it. The saved bottom and desk photos remain comparison context because a horizontal half-turn cannot guarantee either vertical view. The five sampled scan JPEGs are saved and reviewed again with YOLO for a working laptop/desktop and prohibited objects. The laptop webcam uses MediaPipe pose for participant and arm movement corroboration, with YOLO for person presence and extra people. Missing evidence leaves the scan pending or requires a new sweep. Object removal resets the sweep and its visible progress.

The backend requires the 180° report, all five saved samples, all post-scan checks, baseline PASS, and complete coverage before setting `roomScanClear`. Once it passes, it immediately signals the phone to send the next hand-and-laptop frame. That next phone check still requires hand and laptop only, as clarified above. The interface and English/Tamil voice guidance describe the half-turn, including the new starting side.

Automated checks include shifted/cropped photo rejection with a changed yaw, ordered half-turn coverage, static-image and missing-sensor rejection, post-scan review, backend admission, mobile transition, and frontend production build. These tests use synthetic frames and mocks where noted. A real paired phone/laptop pass is still needed to validate the orientation sensor, MediaPipe/YOLO framing, sound playback, and the observed transition on the target devices.

## Live 180° follow-up, 29 September 2026

The supplied 27.95-second screen recording and phone screenshot showed the new 180° title paired with stale 360° analysis: the laptop displayed five of five above a list of eight directions, while the phone displayed six of five, Back-left, 75%, and the old `rotation_unconfirmed` message. The phone feed visibly changed room areas and the laptop webcam showed the participant lifting/moving the phone. A direct call to the running AI process returned `step=scan360`, eight sectors, and no `arcDegrees`; the on-disk API route returned `analyze_180`. The process had been started before the change. This was a live deployment/version mismatch, not evidence that the participant failed to move.

The backend now rejects all non-180 AI responses before writing progress. Pending eight-direction metadata is cleared when room state is loaded, and both screens refuse to display an eight-direction sector list as five. The AI service was restarted, and the same direct endpoint probe then returned `step=scan180`, `arcDegrees=180`, and exactly Left, Front-left, Front, Front-right, Right. Older completed 360 reports no longer satisfy the new admission gate.

The 180 model now uses phone yaw when available. If the browser omits motion readings, it uses ordered left/front/right photo anchors, visual continuity between successive camera frames, distinct intermediate views, and MediaPipe movement evidence from the laptop camera. The laptop tracker now combines body pose wrist motion on both axes with MediaPipe Hands landmarks; it does not infer room direction from hand movement alone. Phone yaw or the ordered room images establish direction. A short test with laptop webcam crops from the supplied recording detected a person, a hand, and substantial arm movement, though those screen crops are lower quality than the original webcam samples and are not a complete device acceptance test. The first scan request has more inference time to initialize MediaPipe without an avoidable timeout.

Final checks: the four affected backend suites passed (67 tests), the two focused AI suites passed (55 tests), Python compilation and diff whitespace checks passed, and the restarted live AI process answered HTTP 200 with `step=scan180`, `arcDegrees=180`, and the exact five expected labels. A real paired phone/laptop acceptance run remains necessary; the supplied recording predates the restarted AI process.

Both room screens now expose a **Play instructions** button that invokes browser speech directly from a user tap. This provides a practical way to hear the current English or Tamil guidance when automatic browser speech is suppressed; the actual speaker output still requires a device check.

## Local phone QR connectivity follow-up, 29 September 2026

A later phone screenshot showed `ERR_CONNECTION_TIMED_OUT` for `192.168.1.100:5174`. The laptop's active Wi-Fi address was `192.168.0.100`, and Vite answered HTTPS 200 at that address but did not answer plain HTTP. The ignored local frontend `.env` still specified `VITE_PUBLIC_HOST=192.168.1.100` and `VITE_PUBLIC_PROTOCOL=http`. Those values were corrected locally. For assessment QR pages opened on localhost, the Vite development server now serves its current LAN HTTPS origin from `/__local-lan-origin`, and the frontend uses that live value to create the QR. It refreshes the origin periodically and does not display a placeholder or stale QR while resolving the address. The endpoint was directly checked and returned `https://192.168.0.100:5174`. Phone reachability from its own Wi-Fi network still needs a device check.
