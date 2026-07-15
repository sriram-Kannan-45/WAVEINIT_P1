# Mandatory Screen Share in Existing Quiz Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate mandatory browser screen sharing into the existing `Participant → My Trainings → Training → Quiz → Start → Security Notice → Accept Terms → Fullscreen → Quiz Starts` flow, without moving the quiz to another page or redesigning navigation. The trainer dashboard must receive the live screen stream automatically.

**Architecture:** Reuse the existing backend proctoring infrastructure (`ExamSession`, `proctorEvents`, `proctoringService`, `TrainerProctoringDashboard`) and the existing `useScreenShare` / WebRTC hooks. Insert a screen-share gate between the Security Notice/Accept Terms step and the Fullscreen step inside `AssessmentConsentGate`. Start an `ExamSession` as soon as screen sharing succeeds, and keep the screen stream alive inside `QuizTaking` for stop-detection, reconnect, and auto-submit.

**Tech Stack:** React + Vite, Tailwind, Socket.IO client, WebRTC `RTCPeerConnection`, Node/Express, Socket.IO server, Sequelize/MySQL, JWT.

---

## File map

| File | Responsibility | Change |
|------|----------------|--------|
| `frontend/src/components/ai-quizzes/AssessmentConsentGate.jsx` | Pre-quiz gate | Add `STEP_SCREEN_SHARE` between consent and fullscreen |
| `frontend/src/proctoring/hooks/useScreenShare.js` | Screen share hook | Allow `monitor` or `window` surface; keep stop/denied callbacks |
| `frontend/src/pages/ParticipantQuizAttemptPage.jsx` | Quiz attempt orchestrator | Start `ExamSession` after screen share; pass session + stream to `QuizTaking` |
| `frontend/src/components/QuizTaking.jsx` | Quiz taking UI | Accept screen stream + session; monitor `track.onended`; reconnect / pause / auto-submit |
| `frontend/src/hooks/useScreenShare.js` | Legacy screen share hook | Delete duplicate (use proctoring version) |
| `frontend/src/pages/TestPage.jsx` | Legacy test page | Update import path to proctoring `useScreenShare` or delete if unused |
| `frontend/src/proctoring/ProctorContext.jsx` | Proctor state/WebRTC | Keep for `/participant/exam/:quizId` flow; ensure it also supports auto-offer on stream ready |
| `frontend/src/proctoring/components/TrainerProctoringDashboard.jsx` | Trainer live view | Auto-observe active screen-sharing sessions; show required status fields |
| `frontend/src/proctoring/hooks/useProctorMonitor.js` | Trainer monitor hook | Ensure auto-observe works with new sessions |
| `frontend/src/proctoring/api.js` | Proctor REST client | Verify endpoints used by new flow |
| `backend/src/socket/events/proctorEvents.js` | WebRTC signaling relay | Already complete; verify `stream-available`/`stream-ended` are used |
| `backend/src/services/proctoringService.js` | Proctor business logic | Add `autoSubmitSession` helper callable from socket/REST |
| `backend/src/controllers/proctoringController.js` | HTTP wrappers | Add `autoSubmit` endpoint if needed |
| `backend/src/models/examSession.js` | Session model | Already has required fields; no schema change expected |

---

## Task 1: Allow window + monitor screen shares

**Files:**
- Modify: `frontend/src/proctoring/hooks/useScreenShare.js`

Current code rejects any share that is not `displaySurface === 'monitor'`. The spec says the participant may select **Entire Screen OR Window**. Update validation to accept `monitor` and `window`, reject only `browser` (tab).

- [ ] **Step 1: Open `frontend/src/proctoring/hooks/useScreenShare.js`**
- [ ] **Step 2: Replace surface validation block**

```javascript
// After getDisplayMedia succeeds
const track = s.getVideoTracks()[0];
let surface = track?.getSettings?.().displaySurface;
if (surface && !['monitor', 'window'].includes(surface)) {
  s.getTracks().forEach(t => t.stop());
  const e = new Error('Please share your entire screen or an application window, not a browser tab.');
  setError(e);
  onInvalidShareRef.current?.(e);
  return null;
}
```

- [ ] **Step 3: Add debug log inside `request`**

```javascript
console.log('[useScreenShare] Requesting display media...');
```

and after success:

```javascript
console.log('[useScreenShare] Stream acquired, surface:', surface);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/proctoring/hooks/useScreenShare.js
git commit -m "feat: allow monitor or window screen share; add debug logs"
```

---

## Task 2: Add screen-share step to AssessmentConsentGate

**Files:**
- Modify: `frontend/src/components/ai-quizzes/AssessmentConsentGate.jsx`

Introduce a third step between consent and fullscreen. The step requests screen sharing, shows blocking error dialogs on denial/cancel, and only advances to fullscreen once the stream is active.

- [ ] **Step 1: Add imports**

```javascript
import { useCallback, useEffect, useRef, useState } from 'react';
import useScreenShare from '../../proctoring/hooks/useScreenShare';
import { MonitorPlay, AlertCircle } from 'lucide-react';
```

- [ ] **Step 2: Add step constant**

```javascript
const STEP_CONSENT = 1;
const STEP_SCREEN_SHARE = 2;
const STEP_FULLSCREEN = 3;
```

- [ ] **Step 3: Add screen-share state, refs, and hook inside component**

```javascript
export default function AssessmentConsentGate({ quiz, attemptId, onConsented, onCancel, onScreenShareReady }) {
  const [step, setStep] = useState(STEP_CONSENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protectionConsentChecked, setProtectionConsentChecked] = useState(false);
  const screenStreamRef = useRef(null);

  const screenShare = useScreenShare({
    onStop: () => {
      console.log('[AssessmentConsentGate] Screen share stopped by user');
      if (step === STEP_SCREEN_SHARE || step === STEP_FULLSCREEN) {
        setError('Screen sharing was stopped. You must share your screen to continue.');
      }
      onScreenShareReady?.(null);
    },
    onDenied: (err) => {
      console.log('[AssessmentConsentGate] Screen share denied:', err?.message);
      setError('Screen sharing is mandatory to attend this assessment.');
    },
    onInvalidShare: (err) => {
      console.log('[AssessmentConsentGate] Invalid share:', err?.message);
      setError(err?.message || 'Please share your entire screen or a window.');
    },
  });

  useEffect(() => {
    screenStreamRef.current = screenShare.stream;
  }, [screenShare.stream]);
```

- [ ] **Step 4: Add screen-share request handler**

```javascript
const handleRequestScreenShare = useCallback(async () => {
  if (busy) return;
  setError('');
  setBusy(true);
  console.log('[AssessmentConsentGate] Requesting screen share...');
  try {
    const stream = await screenShare.request();
    if (!stream) {
      throw screenShare.error || new Error('Screen sharing was denied');
    }
    console.log('[AssessmentConsentGate] Screen share active');
    onScreenShareReady?.(stream);
    setStep(STEP_FULLSCREEN);
  } catch (e) {
    console.error('[AssessmentConsentGate] Screen share failed:', e);
    setError(e?.message || 'Screen sharing is mandatory to attend this assessment.');
  } finally {
    setBusy(false);
  }
}, [busy, screenShare, onScreenShareReady]);
```

- [ ] **Step 5: Add retry / cancel handlers for screen-share failure**

```javascript
const handleRetryScreenShare = useCallback(() => {
  setError('');
  handleRequestScreenShare();
}, [handleRequestScreenShare]);

const handleCancelFromScreenShare = useCallback(() => {
  screenShare.stop?.();
  onCancel?.();
}, [screenShare, onCancel]);
```

- [ ] **Step 6: Render new step in the AnimatePresence block**

Add a third conditional block for `step === STEP_SCREEN_SHARE`. It shows:
- Icon `<MonitorPlay size={26} />`
- Title "Share Your Screen"
- Lead text explaining that screen sharing is mandatory and the trainer will monitor live.
- A "Share Screen" button that calls `handleRequestScreenShare`.
- If `error`, show a blocking alert with Retry and Cancel Assessment buttons.
- Disabled/busy state with spinner.

Use the same `ac-step` classes as the other steps.

- [ ] **Step 7: Update rail dots**

```javascript
<div className="ac-rail__dot ...">1</div>
<div className={`ac-rail__line ${step >= STEP_SCREEN_SHARE ? 'ac-rail__line--done' : ''}`} />
<div className={`ac-rail__dot ${step === STEP_SCREEN_SHARE ? 'ac-rail__dot--current' : step > STEP_SCREEN_SHARE ? 'ac-rail__dot--done' : 'ac-rail__dot--todo'}`}>2</div>
<div className={`ac-rail__line ${step >= STEP_FULLSCREEN ? 'ac-rail__line--done' : ''}`} />
<div className={`ac-rail__dot ${step === STEP_FULLSCREEN ? 'ac-rail__dot--current' : 'ac-rail__dot--todo'}`}>3</div>
```

- [ ] **Step 8: Update `handleAgree` to advance to screen share**

```javascript
const handleAgree = () => {
  if (!protectionConsentChecked) return;
  setError('');
  setStep(STEP_SCREEN_SHARE);
};
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ai-quizzes/AssessmentConsentGate.jsx
git commit -m "feat: add mandatory screen-share step between consent and fullscreen"
```

---

## Task 3: Start ExamSession after screen share succeeds

**Files:**
- Modify: `frontend/src/pages/ParticipantQuizAttemptPage.jsx`

After the consent gate returns a screen stream, call the proctor REST API to start an `ExamSession`. Store session id/token so `QuizTaking` can heartbeat and report violations.

- [ ] **Step 1: Import proctor API and helpers**

```javascript
import { proctorApi } from '../proctoring/api';
import { getDeviceFingerprint } from '../utils/deviceFingerprint';
```

(If `getDeviceFingerprint` path differs, reuse `useDeviceFingerprint` hook from `proctoring/hooks`.)

- [ ] **Step 2: Add state for screen stream and exam session**

```javascript
const [screenStream, setScreenStream] = useState(null);
const [examSession, setExamSession] = useState(null);
const [sessionError, setSessionError] = useState(null);
```

- [ ] **Step 3: Add screen-share ready callback**

```javascript
const handleScreenShareReady = useCallback(async (stream) => {
  if (!stream) return;
  setScreenStream(stream);
  setSessionError(null);
  console.log('[ParticipantQuizAttemptPage] Screen share ready, starting exam session...');
  try {
    const fp = await getDeviceFingerprint();
    const session = await proctorApi.startSession({
      quizId: parseInt(quizId, 10),
      attemptId: parseInt(attemptId, 10),
      fingerprintHash: fp,
      screenSharing: true,
    });
    console.log('[ParticipantQuizAttemptPage] Exam session started:', session.sessionId);
    setExamSession(session);
    // Activate immediately so trainer sees ACTIVE status
    const activated = await proctorApi.activate(session.sessionId, session.sessionToken);
    console.log('[ParticipantQuizAttemptPage] Exam session activated:', activated.sessionId);
    setExamSession(activated);
  } catch (err) {
    console.error('[ParticipantQuizAttemptPage] Failed to start exam session:', err);
    setSessionError(err?.message || 'Failed to start proctoring session.');
    // Stop screen share so the user can retry from the gate
    stream.getTracks().forEach(t => t.stop());
    setScreenStream(null);
  }
}, [quizId, attemptId]);
```

- [ ] **Step 4: Wire `onScreenShareReady` prop to `AssessmentConsentGate`**

```javascript
<AssessmentConsentGate
  quiz={quizData}
  attemptId={parseInt(attemptId, 10)}
  onConsented={handleConsented}
  onCancel={handleCancel}
  onScreenShareReady={handleScreenShareReady}
/>
```

- [ ] **Step 5: Pass screen stream and session to `QuizTaking`**

```javascript
<QuizTaking
  quizId={parseInt(quizId, 10)}
  attemptId={parseInt(attemptId, 10)}
  quizData={quizData}
  sessionToken={sessionToken}
  isStandardQuiz={true}
  screenStream={screenStream}
  examSession={examSession}
  onSubmit={...}
/>
```

- [ ] **Step 6: Show session error fallback**

If `sessionError` is set after the gate, render a blocking dialog with Retry/Cancel Assessment buttons that return the user to the screen-share step.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ParticipantQuizAttemptPage.jsx
git commit -m "feat: start and activate ExamSession after screen share succeeds"
```

---

## Task 4: Monitor screen share inside QuizTaking

**Files:**
- Modify: `frontend/src/components/QuizTaking.jsx`

Accept `screenStream` and `examSession` props. Detect when the user stops sharing via `track.onended`, pause the quiz, notify the trainer, attempt reconnect, and auto-submit if not restored within a configurable timeout.

- [ ] **Step 1: Accept new props**

```javascript
function QuizTaking({ quizId, attemptId, quizData, sessionToken, onSubmit, isStandardQuiz = false, screenStream, examSession }) {
```

- [ ] **Step 2: Add state for screen-share health and pause**

```javascript
const [isScreenSharing, setIsScreenSharing] = useState(!!screenStream);
const [screenShareError, setScreenShareError] = useState(null);
const [isPaused, setIsPaused] = useState(false);
const reconnectTimeoutRef = useRef(null);
const screenShareRetryCountRef = useRef(0);
```

- [ ] **Step 3: Track screen stream lifecycle**

```javascript
useEffect(() => {
  if (!screenStream) {
    setIsScreenSharing(false);
    return;
  }
  setIsScreenSharing(true);
  setScreenShareError(null);
  console.log('[QuizTaking] Screen stream attached');

  const track = screenStream.getVideoTracks()[0];
  if (!track) return;

  const onEnded = () => {
    console.log('[QuizTaking] Screen share track ended');
    setIsScreenSharing(false);
    setIsPaused(true);
    setScreenShareError('Screen sharing stopped. Please resume sharing to continue.');
    reportViolation?.('SCREEN_SHARE_STOPPED', 'Participant stopped screen sharing');
    startReconnectTimer();
  };

  track.addEventListener('ended', onEnded);

  return () => {
    track.removeEventListener('ended', onEnded);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
  };
}, [screenStream]);
```

- [ ] **Step 4: Implement reconnect / auto-submit logic**

```javascript
const SCREEN_SHARE_RECONNECT_TIMEOUT_MS = 30000;

const startReconnectTimer = useCallback(() => {
  if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
  reconnectTimeoutRef.current = setTimeout(() => {
    console.log('[QuizTaking] Screen share not restored; auto-submitting quiz');
    reportViolation?.('SCREEN_SHARE_STOPPED', 'Auto-submitted: screen share not restored in time');
    handleSubmit({ silent: true }).finally(() => {
      onSubmit?.(null);
    });
  }, SCREEN_SHARE_RECONNECT_TIMEOUT_MS);
}, [handleSubmit, onSubmit]);

const resumeScreenShare = useCallback(async () => {
  console.log('[QuizTaking] Attempting to resume screen share...');
  try {
    const newStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false,
    });
    const track = newStream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      setIsScreenSharing(false);
      setIsPaused(true);
      setScreenShareError('Screen sharing stopped again. Please resume.');
      reportViolation?.('SCREEN_SHARE_STOPPED', 'Participant stopped screen sharing again');
      startReconnectTimer();
    });
    setIsScreenSharing(true);
    setIsPaused(false);
    setScreenShareError(null);
    screenShareRetryCountRef.current = 0;
    console.log('[QuizTaking] Screen share resumed');
    // Notify any upstream context to replace the stream for WebRTC
    onScreenShareResumed?.(newStream);
  } catch (err) {
    console.error('[QuizTaking] Resume screen share failed:', err);
    setScreenShareError('Screen share required. Retry or the quiz will auto-submit.');
  }
}, []);
```

- [ ] **Step 5: Add helper to report violations via REST/socket**

```javascript
const reportViolation = useCallback(async (type, message) => {
  if (!examSession?.sessionId || !examSession?.sessionToken) return;
  console.log('[QuizTaking] Reporting violation:', type);
  try {
    await fetch(`${API_BASE}/proctor/sessions/${examSession.sessionId}/violation`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'X-Proctor-Session-Token': examSession.sessionToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message }),
    });
  } catch (e) {
    console.warn('[QuizTaking] Violation report failed:', e);
  }
}, [examSession]);
```

- [ ] **Step 6: Render pause overlay when screen share stops**

When `isPaused` is true, render a full-screen overlay with:
- Title: "Screen sharing paused"
- Message: `screenShareError`
- Button: "Resume Screen Sharing" calling `resumeScreenShare`
- Button: "Cancel Assessment" calling `handleCancel` (or `onSubmit?.(null)`)

- [ ] **Step 7: Pause timer while paused**

Modify the countdown `useEffect` so it does not decrement `timeLeft` while `isPaused` is true.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/QuizTaking.jsx
git commit -m "feat: detect screen share stop, pause quiz, reconnect, auto-submit"
```

---

## Task 5: Stream screen to trainer via WebRTC

**Files:**
- Modify: `frontend/src/pages/ParticipantQuizAttemptPage.jsx`
- Create (or reuse): lightweight WebRTC signaling hook inside `proctoring/hooks/` or inline

The existing `ProctorContext` already handles `proctor:observe-request` by creating an offer and sending tracks. We can reuse it by wrapping `ParticipantQuizAttemptPage` in `ProctorProvider` and feeding the session/stream into it. However, `ProctorContext` also manages heartbeats, violations, etc. A lighter approach is to reuse its logic but let the new flow own the session lifecycle.

Recommended: wrap `ParticipantQuizAttemptPage` in `ProctorProvider`, pass `screenStream` to `proctor.setScreenStream`, and call `proctor.start`/`activate` only after screen share succeeds.

- [ ] **Step 1: Import `ProctorProvider`**

```javascript
import { ProctorProvider } from '../proctoring/ProctorContext';
```

- [ ] **Step 2: Wrap exported component**

```javascript
export default function ParticipantQuizAttemptPageWrapper(props) {
  return (
    <ProctorProvider>
      <ParticipantQuizAttemptPage {...props} />
    </ProctorProvider>
  );
}

function ParticipantQuizAttemptPage({ user }) {
  // existing implementation
}
```

- [ ] **Step 3: Use `useProctor` inside the page**

```javascript
import { useProctor } from '../proctoring/ProctorContext';

function ParticipantQuizAttemptPage({ user }) {
  const proctor = useProctor();
  // ... rest
}
```

- [ ] **Step 4: Sync screen stream and start proctor session through context**

Replace the direct `proctorApi.startSession` call with `proctor.start` and `proctor.activate`. Set `proctor.setScreenStream(stream)` so the context can create WebRTC offers.

```javascript
const handleScreenShareReady = useCallback(async (stream) => {
  if (!stream) return;
  setScreenStream(stream);
  proctor.setScreenStream(stream);
  try {
    const fp = await getDeviceFingerprint();
    await proctor.start({ quizId: Number(quizId), attemptId: Number(attemptId), fingerprintHash: fp, screenSharing: true });
    await proctor.activate();
    console.log('[ParticipantQuizAttemptPage] Proctor session active:', proctor.session?.sessionId);
  } catch (err) {
    console.error('[ParticipantQuizAttemptPage] Proctor session failed:', err);
    setSessionError(err?.message || 'Failed to start proctoring session.');
    stream.getTracks().forEach(t => t.stop());
    setScreenStream(null);
  }
}, [quizId, attemptId, proctor]);
```

- [ ] **Step 5: On screen share resume, update context stream**

```javascript
const handleScreenShareResumed = useCallback((newStream) => {
  setScreenStream(newStream);
  proctor.setScreenStream(newStream);
  proctor.pushState?.({ isScreenSharing: true });
}, [proctor]);
```

- [ ] **Step 6: Pass resume callback to `QuizTaking`**

```javascript
<QuizTaking
  ...
  onScreenShareResumed={handleScreenShareResumed}
/>
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ParticipantQuizAttemptPage.jsx
git commit -m "feat: wire screen stream into ProctorContext for trainer WebRTC"
```

---

## Task 6: Auto-observe active sessions on trainer dashboard

**Files:**
- Modify: `frontend/src/proctoring/components/TrainerProctoringDashboard.jsx`

When a session becomes `ACTIVE` and `isScreenSharing`, automatically call `observe(sessionId)` so the trainer sees the live stream without clicking "Observe".

- [ ] **Step 1: Add auto-observe effect**

```javascript
useEffect(() => {
  sessions.forEach(s => {
    if (s.status === 'ACTIVE' && s.isScreenSharing && !observedSessions.includes(s.sessionId)) {
      console.log('[TrainerProctoringDashboard] Auto-observing session', s.sessionId);
      observe(s.sessionId);
    }
  });
}, [sessions, observedSessions, observe]);
```

- [ ] **Step 2: Add required status fields to participant card**

Ensure `ParticipantMonitorCard` displays:
- Participant Name
- Training / Quiz Name
- Connection Status (`isOnline`)
- Screen Sharing Status (`isScreenSharing`)
- Live Screen indicator
- Warning Count (`warningsCount`)
- Fullscreen Status (`isFullscreen`)
- Tab Switch Count (from `tabSwitchViolations`)
- Copy Attempts (from `copyPasteCount` if available)
- Network Status (`disconnectedAt` / `gracePeriodEndsAt`)
- Remaining Time (`endsAt` - now)

If `ParticipantMonitorCard` already shows some of these, add the missing ones.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/proctoring/components/TrainerProctoringDashboard.jsx
git commit -m "feat: auto-observe active screen-sharing sessions; show status fields"
```

---

## Task 7: Remove duplicate screen share implementations

**Files:**
- Delete or deprecate: `frontend/src/hooks/useScreenShare.js`
- Update: `frontend/src/pages/TestPage.jsx`

There must be only one screen sharing workflow. The proctoring `useScreenShare` is the canonical implementation.

- [ ] **Step 1: Update `TestPage.jsx` import**

```javascript
import useScreenShare from '../proctoring/hooks/useScreenShare';
```

- [ ] **Step 2: Delete `frontend/src/hooks/useScreenShare.js`**

```bash
rm frontend/src/hooks/useScreenShare.js
```

- [ ] **Step 3: Search for other duplicates**

```bash
grep -r "requestScreenShare" frontend/src --include="*.js" --include="*.jsx"
grep -r "getDisplayMedia" frontend/src --include="*.js" --include="*.jsx"
```

If other components have inline `getDisplayMedia`, refactor them to use `proctoring/hooks/useScreenShare` or delete if they are dead code.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TestPage.jsx
git rm frontend/src/hooks/useScreenShare.js
git commit -m "refactor: remove duplicate useScreenShare hook; use proctoring version"
```

---

## Task 8: Debug logging

**Files:**
- Modify: `frontend/src/components/ai-quizzes/AssessmentConsentGate.jsx`
- Modify: `frontend/src/pages/ParticipantQuizAttemptPage.jsx`
- Modify: `frontend/src/components/QuizTaking.jsx`
- Modify: `frontend/src/proctoring/ProctorContext.jsx`
- Modify: `frontend/src/proctoring/hooks/useProctorMonitor.js`
- Modify: `backend/src/socket/events/proctorEvents.js`

Add `console.log` at every step requested by the spec:

Frontend:
- Quiz Started
- Security Accepted
- Requesting Screen Share
- Permission Granted
- Permission Denied
- MediaStream Created
- Socket Connected
- Offer Sent
- Offer Received
- Answer Sent
- ICE Candidate
- Trainer Connected
- Stream Received
- Video Attached
- Fullscreen Entered
- Quiz Started
- Screen Share Stopped
- Auto Submit Triggered

Backend:
- Socket Connected
- Offer Received
- Answer Sent
- ICE Candidate
- Stream Available
- Stream Ended
- Violation Recorded
- Session Activated

Most of these are already partially logged. Add any missing ones.

- [ ] **Step 1: Add logs to `AssessmentConsentGate` at consent agree and screen share result**
- [ ] **Step 2: Add logs to `ParticipantQuizAttemptPage` at session start/activate**
- [ ] **Step 3: Add logs to `QuizTaking` at mount, fullscreen, submit, auto-submit**
- [ ] **Step 4: Add logs to `ProctorContext` WebRTC callbacks**
- [ ] **Step 5: Add logs to `useProctorMonitor` offer/answer/ICE/track attachment**
- [ ] **Step 6: Add logs to `proctorEvents.js` signaling handlers**
- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add debug logging throughout screen-share workflow"
```

---

## Task 9: Backend audit / small fixes

**Files:**
- Modify: `backend/src/services/proctoringService.js`
- Modify: `backend/src/controllers/proctoringController.js` (if needed)

Ensure the backend can auto-submit a standard `QuizAttempt` from an `ExamSession` for the new flow. Currently `terminateSession` only marks the attempt `SUBMITTED` but does not grade it. For the new flow, auto-submit due to screen-share timeout should grade the attempt like `/api/quizzes/:quizId/attempts/:attemptId/submit` does.

- [ ] **Step 1: Create reusable auto-submit grading function**

Extract the grading/submission logic from `quizzesRoutes.js` `submit` handler into a service function `submitAndGradeAttempt(attempt, answers = [])` in `backend/src/services/aiQuizService.js` or a new `backend/src/services/quizSubmissionService.js`.

- [ ] **Step 2: Use the service in `proctoringService.terminateSession` when auto-submitting**

When `terminateSession` is called for `SCREEN_SHARE_STOPPED` or `NETWORK_TIMEOUT`, if the session has an `attemptId`, call `submitAndGradeAttempt` with the current answers (or empty array) before marking the attempt `EVALUATED`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/*.js
git commit -m "feat: support auto-submit grading from ExamSession"
```

---

## Task 10: Verification

- [ ] **Step 1: Start backend**

```bash
cd backend && npm run dev
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Seed test data**

Ensure there is a published quiz attached to a training with an enrolled participant and a trainer assigned to that training.

- [ ] **Step 4: Trainer login**

Open browser A at `http://localhost:5173/trainer/login`, log in as trainer, navigate to the quiz, open `/trainer/proctor/:quizId`.

- [ ] **Step 5: Participant login**

Open browser B at `http://localhost:5173/participant/login`, log in as participant, go to My Trainings, select the training, open Quiz tab, click Start.

- [ ] **Step 6: Confirm screen share gate**

- Security notice appears.
- Accept terms.
- Screen share step appears.
- Click Share Screen; browser picker opens.
- Select Entire Screen or Window.
- Stream starts; trainer dashboard auto-observes and shows live video.
- Fullscreen step appears; enable fullscreen.
- Quiz starts.

- [ ] **Step 7: Confirm stop detection**

- Participant stops sharing.
- Quiz pauses; overlay appears.
- Trainer receives violation notification.
- Resume sharing; quiz resumes.

- [ ] **Step 8: Confirm auto-submit**

- Stop sharing and do not resume for 30 seconds.
- Quiz auto-submits.
- Trainer sees session status change to `SUBMITTED`/`TERMINATED`.

- [ ] **Step 9: Run lint / build**

```bash
cd frontend && npm run build
cd backend && npm run lint || true
```

- [ ] **Step 10: Commit any final fixes**

```bash
git add -A
git commit -m "fix: verification fixes"
```

---

## Spec coverage self-review

| Requirement | Task(s) |
|-------------|---------|
| Screen share mandatory before quiz | Task 2, 3 |
| Works like Teams/Meet/Zoom (browser picker) | Task 2 |
| Trainer receives live stream | Task 5, 6 |
| Cannot start quiz without screen share | Task 2 |
| Screen share fails → blocking dialog with Retry/Cancel | Task 2 |
| Browser popup canceled → stay on page, show message | Task 2 |
| Screen share stopped during quiz → pause, notify, reconnect, auto-submit | Task 4, 5 |
| Trainer dashboard auto-receives stream + status fields | Task 6 |
| Backend audit: Socket.IO, WebRTC signaling, auth, JWT, ICE, session mgmt | Task 3, 5, 9 |
| Single screen share workflow, delete duplicates | Task 7 |
| Debug logs | Task 8 |
| End-to-end browser verification | Task 10 |

---

## Notes / risks

1. **HTTPS requirement:** `getDisplayMedia` requires `localhost` or HTTPS. Local dev via Vite on `localhost:5173` is acceptable.
2. **User gesture:** Screen share must be triggered by a click. Do NOT auto-request on mount.
3. **Fullscreen timing:** The spec wants screen share before fullscreen. The `AssessmentConsentGate` now enforces that order.
4. **Mobile:** `getDisplayMedia` is not supported on most mobile browsers; this feature targets desktop.
5. **WebRTC reliability:** STUN-only may fail on strict corporate networks. TURN is not configured in the current constants; document this as a future improvement.
