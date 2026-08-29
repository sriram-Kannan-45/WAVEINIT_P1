# WAVE INIT LMS — Proctoring/Monitoring Validation Report (A–L)

**Date:** 2026-08-29
**Environment:** Windows 11 · Node v24.14.0 · Python 3.12.6 · Supabase PostgreSQL
**Components under test:** ai-service (MediaPipe + YOLO11s + Gemini), Backend API (:3001), Frontend Vite (:5174, HTTPS via proxy), Monitoring Engine (frontend client + backend scoring), Excel report generator.

---

## A. Assessment Scope & Inputs

| Item | Detail |
|---|---|
| Test participant | id=3 "sriram" (APPROVED) |
| Auth | JWT (HS256, `type=access`, participant role) |
| Real media input | `monitoring_ms_quiz...webm` — 45s, camera-on test-taker |
| Synthetic regressions | solid-color videos (blue / green / red) for deterministic mediapipe/gemini checks |
| Replay input for scoring cross-check | ai-service episode JSON `real_1787977412_result.json` (24 eye/head episodes + no-person) |
| Governance constraint | Mobile QR / YOLO live flow untouched (contractor scope) — report-only |

## B. Build & Boot

| Check | Result |
|---|---|
| ai-service uvicorn boot (mai… :8000) | PASS |
| Backend node boot (:3001) | PASS |
| Frontend Vite dev (:5174 HTTPS, self-signed) | PASS |
| `GET /api/proctoring/status` | 200 — `mediapipe=UP`, `yolo=UP` |
| `GET /api/health` | 200 |

## C. Config & Risk Model

Verified via `GET /api/monitoring/config` (Bearer auth; 401 without token):

- Risk boundaries: `LOW 0–14 · MEDIUM 15–34 · HIGH 35–69 · CRITICAL 70–100`
- Per-event debounce cooldowns (ms): `gaze 4000 · head_pose 4000 · face_absence 5000 · browser 3000 · default 5000`
- Scoring: **5-part 100-mark audit** — Eye+Head tracking (max 60), Mobile phone (max 10), Multi-face (max 10), Face absence / no-person (max 10), Tab-switch/fullscreen (max 10)
- Live grace window: first 3 events/session are warning-only `isGraceWarning=true`, `scoreDelta=0`

## D. Defects Found & Fixed (D1–D7)

| ID | Severity | Root cause | Fix | Verified |
|---|---|---|---|---|
| D1 | Critical | ai-service `GeminiGazeInference` referenced in `__main__` import path | Restored `inspect_b64_with_gemini` | RUN PASS (real + color frames) |
| D2 | High | Duplicate `build_cli_parser()` in CLI entry | Single consolidated parser | `--help` → 200/clean |
| D3 | High | `main.py` calib service path passed bare `duration` param → NaN/timeout | `duration=None` guard (video default) | hypoxia-safe on real webm |
| D4 | High | Backend SQL-injection scanner 400'd real base64 JPEG frames (`/laptop/validate`) | `isBinaryPayload()` skip (len≥512, `data:.*;base64,`, `/9j/` etc.) before pattern scan; short text probes still 400 | Real frame → 200 AI analysis; `0x...concat()` probe still blocked |
| D5 | High | `GET /sessions/:id/status` returned `undefined` timestamps (`sessionStartedAt`) | `startedAt = startedAt \|\| createdAt`, `endedAt = endedAt \|\| null` | 200, populated |
| D6 | High | `getReport` scored **merged** events → the first-3 grace events inflated score (37.43 HIGH on a clean session) | All 9 scoring inputs switched to `scoredEvents` (grace filtered) | Clean session → 0 LOW; new session 3 grace + 1 scored → 10 |
| D7 | Critical | Backend `validateLaptop`/calib sent no `configuredDuration` → ai-service `float(None)` crash (`proctoring_detector.py:1043`) | ai-service coerces `None → 60.0`; backend sends `configuredDuration=600` | laptop/validate → 200, `face_detected=true`, violations=1 |

**Not a bug (documented):** 4 posted events → 2 persisted + 2 debounced (cooldown + idempotency by-design); 0x probe correctly rejected; `/api/proctoring/yolo/analyze-frame` (mobile path) validated separately — no duration coercion needed.

## E. Endpoint E2E Matrix (live)

| Endpoint | Result |
|---|---|
| POST `/monitoring/sessions/start` | 200 |
| POST `/monitoring/sessions/:id/start-test` | 200 |
| POST `/monitoring/sessions/:id/calibrate` | 200 ×16 (full baseline rounds) |
| POST `/monitoring/sessions/:id/laptop/validate` | 200 ×41 frames → real analysis |
| POST `/monitoring/sessions/:id/events` | 200 (idempotent dedupe) |
| POST `/monitoring/sessions/:id/end` | 200 COMPLETED |
| GET `/monitoring/sessions/:id/report` | 200 (score/risk populated) |
| GET `/monitoring/sessions/:id/status` | 200 |
| GET `/api/monitoring/config` | 200 (401 unauth) |
| GET `/api/proctoring/status` | 200 |

## F. Frontend Integration

- **Static wiring:** `useSocket` singleton joins `monitoring:join {sessionId, role:'laptop'}`; engine subscribes `monitoring:event` (MonitoringEngineClient.js:140); frame loop drops non-OK responses silently (`if (!res.ok) return;`).
- **Browser E2E (headless Edge, real MonitoringEngineClient, live servers):** socket connected (user 3), room joined, received `connected`, `monitoring:grace_warning`, `monitoring:event`; ran 16-round calibration baseline; 41 laptop frames; 1 FACE_ABSENT reported (idempotent); end COMPLETED; report 200. Calibration returns `ready=false` with a fake webcam (no detectable face) — correct mechanical behavior.

## G. AI-Service Engine

| Subsystem | Status |
|---|---|
| MediaPipe face/gaze/head pose | PASS — deterministic on real video |
| YOLO object/multiple-face | PASS — `yolo=UP`, classify path clean |
| Gemini inference hook | PASS after D1 (real + synthetic frames) |
| Deterministic scorer (`/analyze-frame` + session) | PASS — reproduces episode boundaries |

## H. Health & Stability

- No unhandled exceptions across the full replay (previously `float(None)` on :1043 — resolved by D7).
- Event ingestion pipeline: cooldown + idempotency + grace windows verified end-to-end (4 → 2 persisted, later 3 grace + 1 scored).
- Backend and ai-service restarted cleanly after each fix; no leaked processes.

## I. Integration & Data Path (DB persistence)

- `monitoring_sessions`, `monitoring_events`, `proctoring_events` rows verified post-flow (`check_db.js`).
- Events persist on both tables; `occurred_at` ordering + idempotency keys intact.
- Excel report generated and inspected (openpyxl): **2 sheets** — "Monitoring Report" (FACE_ABSENT 3.0s, LOOKING_AWAY 3.2s) + "Summary".

## J. Scoring Cross-Check — Backend `getReport` vs ai-service Engine

Same input (24 eye/head episodes from the real video + equivalent face-absence) replayed into a fresh monitoring session.

| Metric | Backend `getReport` | ai-service engine | Δ |
|---|---|---|---|
| Actual test duration (s) | 44 | 44.08 | ~0.08 |
| Eye+Head violation seconds | 27.83 | 26.83 | +1.00 |
| Eye+Head score (max 60) | 37.95 | 36.53 | +1.42 |
| No-person score (max 10) | 10 | 10 | 0 |
| Mobile score | 0 | 0 | 0 |
| **Final score (max 100)** | **47.95** | **46.53** | **+1.42** |
| **Risk level** | **HIGH** | **HIGH** | **MATCH** |

Component totals agreed per type (Eye seconds 10.0 both, Head sum 16.8 both). The +1.42-mark delta is a documented architectural difference: the backend unions same-detector/direction episodes across gaps ≤750 ms (brief interruptions treated as continued looking-away) whereas the engine sums only the exact violating frames. Both use the same 100-mark scale and classify the same risk band (HIGH).

## K. Key Findings & Known Limitations

1. **Real-face camera accuracy** was validated via the ai-service chain on the real webm; browser E2E used a fake webcam (mechanical path proven, UI/UX with a live camera not covered).
2. **Mobile QR / YOLO live flow** remains contractor-owned — verified only that its endpoint classification path is intact (untouched).
3. Backend and engine risk scales are aligned (LOW/MEDIUM/HIGH/CRITICAL at 0/15/35/70) but are not numerically identical by design; the divergence is bounded (≤ ~1.5 marks on real data).
4. Server-side grace scoring (D6) means sessions with only 0–3 events correctly score 0 LOW.

## L. Logs & Artifacts

## M. Follow-up Workstream — No-Person False Positive + Video Storage Audit (2026-08-29)

**Problem reported:** laptop monitoring repeatedly raised "No Person" (`FACE_ABSENT` / `noPerson`) while the test-taker's full body was clearly visible.

**Root cause (verified):** laptop presence detection was derived 100% from MediaPipe FaceLandmarker (`num_faces=1`, min detection confidence 0.5, `POSE_MODEL_PATH=None` → `pose_landmarker=false`). Any frame where the face was small / turned / blurred produced `face_count=0` → FACE_ABSENT, even with a visible body. The mobile/YOLO path was unaffected and was left untouched.

**Fix (YOLO person-class fallback):**
- `ai-service/inference/proctoring_detector.py` — `set_person_detector()`, `_check_person_present()` (per-session cache, throttled `PERSON_CHECK_INTERVAL_SECONDS=1.0`, only probed when `face_count==0`); `_process_detection(..., person_present)` now flags no-person only when `face_count==0 AND NOT person_present`; response/metrics add `person_detected`, `person_count`, `person_presence_source` (`FACE` / `BODY` / `NONE`).
- `ai-service/main.py` — `_yolo_person_presence()` (YOLO11s person boxes, conf 0.35, ≤640 resize) wired into the MediaPipe proctor engine at boot (`YOLO person-presence fallback wired into MediaPipe proctoring engine`).
- `backend/src/services/monitoringService.js` (`validateLaptop`) — FACE_ABSENT only when `(!face_detected && !person_detected)`; response echoes `person_detected`.
- `frontend/src/proctoring/engine/MonitoringEngineClient.js` — `noPerson` mirrors the same gate; `personDetected` forwarded to backend.

**Video storage audit result:** webcam upload (`MediaRecorder` → POST `/monitoring/sessions/:id/video` → multer diskStorage `backend/uploads/monitoring-videos/`) is for post-test human review only. MediaPipe/YOLO inference consumes in-memory frames; the ai-service `VideoWriter` exists only in the CLI/streaming-demo path and was kept. Storage **disabled by default**:
- `frontend/.env` — `VITE_RECORD_MONITORING_VIDEO=false` (webcam recording opt-in via `true`).
- `backend/.env` — `MONITORING_VIDEO_STORAGE=false`.
- `backend/src/middleware/uploadMonitoringVideo.js` — refactored to export `{ enabled, single(fieldName) }`; when disabled, `.single()` returns a 403 middleware (no multer, no disk write).

**Verification (all live against restarted services):**

| Probe | Result |
|---|---|
| Face-occluded frame, body visible → engine session | `face_detected=false`, `person_detected=true`, `source=BODY`; final no-person `detected=false`, score 0 |
| Truly empty frame → engine session | `person_detected=false`, `source=NONE`; no-person `detected=true`, score 10 |
| Live `POST /api/proctoring/analyze-frame` (occluded) | `face_detected=false`, `person_detected=true`, `source=BODY` — PASS |
| `POST /laptop/validate` (occluded, body visible) | **no FACE_ABSENT violation** — PASS |
| `POST /laptop/validate` (empty frame, fresh session) | `person=false`, violations=`FACE_ABSENT` — no regression |
| `POST /laptop/validate` (empty same-session after 1.2s) | cache expired → re-probed → `FACE_ABSENT` — throttle correct |
| `POST /laptop/validate` (real face frame) | `face=true`, `person=true`, `source=FACE`, only legit `HEAD_LOOKING_RIGHT` — no regression |
| `POST /monitoring/sessions/:id/video` | **403** "Monitoring video storage is disabled..." — no file written to `uploads/monitoring-videos/` |
| Vite-served engine module | `VITE_RECORD_MONITORING_VIDEO:"false"` → recorder not started |
| Syntax | `python -m py_compile` (ai-service) + `node --check` (backend) PASS |

**Notes:** the 1-second person-presence cache is intentional (avoids YOLO cost on frames where no face was seen in the last second); a person leaving the frame is registered no later than ~1s after the last face frame. 22 historical `.webm` files remain in `backend/uploads/monitoring-videos/` (pre-disable) and can be removed manually if desired; no new files are written while storage is disabled.

---

- `backend/src/security/threatDetector.js`, `backend/src/services/monitoringService.js`, `ai-service/inference/proctoring_detector.py` — fixed files (D4–D7).
- Reports: `report_full.json`, `e2e_report.xlsx`, `real_1787977412_result.json` (+ blue/green/red regressions).
- Repro harness: `C:\Users\user\AppData\Local\Temp\opencode\pw\e2e.cjs` (Playwright browser E2E), `crosscheck.cjs` (Phase-8 scoring replay).
- Server logs: `be_stdout.log`, `be_stderr.log`, `ai_stdout.log`, `ai_stderr.log`, `vite_stdout.log`, `vite_stderr.log`.
- Services (all running): ai-service :8000 · backend :3001 · frontend :5174.

---

**Result: ALL PHASES 1–10 PASS.** Proctoring pipeline fully operational after D1–D7 fixes; scoring consistent between backend and ai-service (same risk band); data persists; Excel report generation verified; frontend integrated end-to-end in a real browser session.