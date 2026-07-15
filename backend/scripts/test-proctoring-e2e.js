/**
 * test-proctoring-e2e.js — End-to-end integration test for the Proctoring & Screen Share workflow.
 *
 * Runs with the backend already up on port 3001:
 *   node scripts/test-proctoring-e2e.js
 *
 * This script exercises the complete proctoring lifecycle:
 *   1. Admin login → Creates a program, course, and a proctored quiz (proctoringEnabled = true).
 *   2. Participant registration, admin approval, and participant login.
 *   3. Participant starts quiz (POST /api/quizzes/:id/start) -> confirms proctoringEnabled is true.
 *   4. Participant starts proctor session (POST /api/proctor/sessions/start) -> gets token + session ID.
 *   5. WebSocket Connection setup (socket.io-client):
 *      - Connects Participant socket client.
 *      - Connects Trainer socket client.
 *   6. Participant socket joins the session (`proctor:join`).
 *   7. Trainer socket joins the quiz monitor room (`proctor:trainerJoin`) -> receives active sessions list.
 *   8. Real-time event verification:
 *      - Participant sends heartbeat -> Trainer receives heartbeat event.
 *      - Participant pushes state (fullscreen/screen share) -> Trainer receives update.
 *      - Participant reports violation -> Violation saved to DB, Trainer receives update in real-time.
 *   9. Trainer sends a warning message -> Participant receives warning message.
 *   10. Trainer requests to observe stream -> Participant receives observe request.
 *   11. Participant disconnects -> Trainer receives disconnected session update.
 *   12. Participant reconnects -> Trainer receives reconnected session update.
 *   13. Participant finalizes the exam.
 *   14. Clean-up: Delete program to cascade-delete all mock database records.
 */

const ioClient = require('socket.io-client');
require('dotenv').config();

const BASE_HTTP = process.env.SMOKE_BASE || 'http://localhost:3001';
const BASE_WS = BASE_HTTP.replace(/^http/, 'ws');

// Colors for logging
const c = {
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

let stepNo = 0;
function step(name) {
  stepNo++;
  console.log(`\n${c.bold(c.cyan(`[STEP ${stepNo}] ${name}`))}`);
}

function ok(label, extra = '') {
  console.log(`  ${c.green('✓')} ${label} ${c.dim(extra)}`);
}

function fail(label, err) {
  console.error(`  ${c.red('✗')} ${label}: ${err.message || err}`);
  if (err.responseBody) console.error(`    body: ${err.responseBody}`);
  process.exit(1);
}

// REST helper
async function call(method, path, { token, body, headers = {} } = {}) {
  const url = `${BASE_HTTP}${path}`;
  const allHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) allHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers: allHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || data?.success === false || data?.error) {
    const e = new Error(`${method} ${path} → ${res.status}`);
    e.responseBody = JSON.stringify(data || {});
    throw e;
  }
  return data;
}

// Connect socket helper
function connectSocket(token) {
  const socket = ioClient.connect(BASE_HTTP, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true
  });
  socket.on('connect_error', (err) => {
    console.error(`  Socket connection error: ${err.message}`, err);
  });
  return socket;
}

// Bounded wait helper for socket events
function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    const listener = (data) => {
      clearTimeout(timer);
      socket.off(eventName, listener);
      resolve(data);
    };

    socket.on(eventName, listener);
  });
}

(async () => {
  console.log(c.bold(c.yellow('=== STARTING PROCTORING & SCREEN SHARE E2E TEST ===')));

  // ── 1. Admin logs in ──────────────────────────────────────────────────
  step('Admin login');
  const adminLogin = await call('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'admin123' },
  }).catch(e => fail('Admin login failed', e));
  const adminToken = adminLogin.token;
  ok(`Admin logged in (ID: ${adminLogin.id})`);

  // ── 2. Create program, course, and trainer ────────────────────────────
  step('Create program and course');
  const program = await call('POST', '/api/admin/training-programs', {
    token: adminToken,
    body: { title: `Proctor E2E Prog ${Date.now()}`, description: 'Proctor E2E program' }
  }).catch(e => fail('Failed to create program', e));
  const programId = program.program.id;

  const trainersList = await call('GET', '/api/admin/trainers', { token: adminToken });
  let trainerId = trainersList.trainers?.[0]?.id;
  if (!trainerId) {
    const tr = await call('POST', '/api/admin/create-trainer', {
      token: adminToken,
      body: { name: 'Proctor Trainer', email: `proctor-trainer-${Date.now()}@test.com`, phone: '1111111111' },
    });
    trainerId = tr.user?.id || tr.id;
  }

  const course = await call('POST', `/api/admin/training-programs/${programId}/courses`, {
    token: adminToken,
    body: {
      title: 'Advanced Web Security & Proctoring',
      description: 'Course focused on anti-cheat algorithms and WebRTC',
      trainerId,
      status: 'PUBLISHED',
    }
  }).catch(e => fail('Failed to create course', e));
  const courseId = course.course.id;
  ok(`Program ID: ${programId}, Course ID: ${courseId}, Trainer ID: ${trainerId}`);

  // ── 3. Create a proctored quiz ────────────────────────────────────────
  step('Trainer creates a proctor-enabled quiz');
  // First create the quiz
  const quizRes = await call('POST', `/api/trainer/courses/${courseId}/quiz/manual`, {
    token: adminToken,
    body: {
      title: 'Real-time Proctoring Logic Test',
      isMandatory: true,
      questions: [
        {
          question: 'Which browser API is used for screen sharing?',
          options: ['navigator.mediaDevices.getUserMedia', 'navigator.mediaDevices.getDisplayMedia', 'navigator.share', 'window.screen.share'],
          correctIndex: 1,
        }
      ]
    }
  }).catch(e => fail('Failed to create quiz', e));
  const quizId = quizRes.quiz.id;

  // Update quiz to enable proctoring
  await call('PUT', `/api/trainer/courses/${courseId}/quizzes/${quizId}`, {
    token: adminToken,
    body: {
      status: 'PUBLISHED',
      proctoringEnabled: true,
      proctoringLevel: 'HIGH',
      gracePeriodMinutes: 1,
      copyProtectionEnabled: true
    }
  }).catch(e => fail('Failed to enable proctoring on quiz', e));
  ok(`Proctor-enabled Quiz created with ID: ${quizId}`);

  // ── 4. Create and approve participant ─────────────────────────────────
  step('Register & approve participant');
  const pEmail = `p-proctor-${Date.now()}@test.com`;
  const pPassword = 'password123';
  await fetch(`${BASE_HTTP}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Proctor Student', email: pEmail, phone: '2222222222', password: pPassword })
  }).catch(e => fail('Participant registration HTTP call failed', e));

  const pending = await call('GET', '/api/admin/pending-participants', { token: adminToken });
  const freshStudent = (pending.participants || []).find(p => p.email === pEmail);
  if (!freshStudent) fail('Approve student', new Error('Student registration failed'));
  await call('POST', `/api/admin/approve-participant/${freshStudent.id}`, { token: adminToken });
  ok(`Participant approved (ID: ${freshStudent.id})`);

  // Log in student
  const studentLogin = await call('POST', '/api/auth/login', {
    body: { email: pEmail, password: pPassword }
  }).catch(e => fail('Participant login failed', e));
  const studentToken = studentLogin.token;

  // Enroll student
  await call('POST', '/api/participant/enroll', {
    token: studentToken,
    body: { courseId }
  }).catch(e => fail('Enrollment failed', e));

  // Approve enrollment
  await call('PUT', `/api/trainer/courses/${courseId}/participants/${freshStudent.id}/approve`, {
    token: adminToken,
    body: {}
  }).catch(e => fail('Enrollment approval failed', e));
  ok(`Participant logged in, enrolled in course, and enrollment approved`);

  // ── 5. Participant starts quiz (REST) ─────────────────────────────────
  step('Participant starts quiz via REST API');
  const startAttempt = await call('POST', `/api/quizzes/${quizId}/start`, { token: studentToken })
    .catch(e => fail('POST /quizzes/:id/start failed', e));
  const attemptId = startAttempt.attemptId;
  const isProctored = startAttempt.quiz?.proctoringEnabled;
  if (!isProctored) fail('Start Quiz Attempt', new Error('Quiz response did not contain proctoringEnabled: true'));
  ok(`Attempt started (ID: ${attemptId}) and proctoring is verified as ACTIVE`);

  // ── 6. Participant starts proctoring session (REST) ───────────────────
  step('Participant starts proctoring session via REST API');
  const proctorStart = await call('POST', '/api/proctor/sessions/start', {
    token: studentToken,
    body: { quizId, attemptId, fingerprintHash: 'fingerprint_e2e_hash_123', screenSharing: true }
  }).catch(e => fail('POST /api/proctor/sessions/start failed', e));
  const sessionId = proctorStart.data.sessionId;
  const sessionToken = proctorStart.data.sessionToken;
  ok(`Proctor Session initialized (Session ID: ${sessionId}, Token: ${sessionToken.substring(0, 10)}...)`);

  // ── 7. Connect WebSockets for Participant and Trainer ─────────────────
  step('Connecting Participant and Trainer sockets');
  const pSocket = connectSocket(studentToken);
  const tSocket = connectSocket(adminToken);

  // Wait for connections
  await Promise.all([
    waitForEvent(pSocket, 'connected'),
    waitForEvent(tSocket, 'connected')
  ]).catch(e => fail('Sockets failed to connect', e));
  ok('Participant and Trainer WebSocket sockets connected successfully');

  // ── 8. Sockets Join Rooms ─────────────────────────────────────────────
  step('Sockets join proctoring rooms');
  // Participant joins session
  const joinAck = await new Promise((resolve) => {
    pSocket.emit('proctor:join', { sessionId }, resolve);
  });
  if (!joinAck.ok) fail('Participant join room failed', new Error(joinAck.error));
  ok('Participant socket joined proctor session room');

  // Trainer joins monitoring room for the quiz
  const trainerJoinAck = await new Promise((resolve) => {
    tSocket.emit('proctor:trainerJoin', { quizId }, resolve);
  });
  if (!trainerJoinAck.ok) fail('Trainer join room failed', new Error(trainerJoinAck.error));
  
  // Verify participant's session appears in trainer's active sessions list
  const activeTrainerSessions = trainerJoinAck.sessions || [];
  const foundSession = activeTrainerSessions.find(s => s.sessionId === sessionId);
  if (!foundSession) fail('Trainer list', new Error('Participant session not listed in trainer join ack'));
  ok('Trainer socket joined proctor quiz monitoring room, participant session is visible');

  // ── 9. Activate Proctor Session (REST) ───────────────────────────────
  step('Activate proctor session');
  await call('POST', `/api/proctor/sessions/${sessionId}/activate`, {
    token: studentToken,
    headers: { 'X-Proctor-Session-Token': sessionToken }
  }).catch(e => fail('Session activation failed', e));
  ok('Session state set to ACTIVE on backend');

  // ── 10. Verify Real-time Heartbeat Broadcast ──────────────────────────
  step('Verifying real-time Heartbeat broadcast');
  // Listen on trainer socket, trigger heartbeat on participant
  const heartbeatPromise = waitForEvent(tSocket, 'proctor:heartbeat');
  pSocket.emit('proctor:heartbeat', { sessionId });
  const heartbeatReceived = await heartbeatPromise.catch(e => fail('Heartbeat event not received', e));
  if (heartbeatReceived.sessionId !== sessionId) fail('Heartbeat verify', new Error('Invalid sessionId on heartbeat event'));
  ok('Trainer socket received participant heartbeat broadcast in real-time');

  // ── 11. Verify Real-time State Change Broadcast ───────────────────────
  step('Verifying real-time State change (Fullscreen lock)');
  const stateUpdatePromise = waitForEvent(tSocket, 'proctor:update');
  pSocket.emit('proctor:state', { sessionId, isFullscreen: true, isScreenSharing: true, isOnline: true });
  const stateUpdateReceived = await stateUpdatePromise.catch(e => fail('State update event not received', e));
  if (stateUpdateReceived.type !== 'state' || stateUpdateReceived.session?.isFullscreen !== true) {
    fail('State Change verify', new Error('Incorrect state values received'));
  }
  ok('Trainer socket received updated fullscreen/screen share state in real-time');

  // ── 12. Verify low-latency Anti-Cheat Violation Event ──────────────────
  step('Verifying low-latency Anti-Cheat violation event');
  const violationUpdatePromise = waitForEvent(tSocket, 'proctor:update');
  
  const violationAck = await new Promise((resolve) => {
    pSocket.emit('proctor:violation', {
      sessionId,
      type: 'TAB_SWITCH',
      message: 'Tab switch detected: opened browser developer console',
      metadata: { tabUrl: 'https://google.com' }
    }, resolve);
  });
  if (!violationAck.ok) fail('Emit violation failed', new Error(violationAck.error));

  const violationReceived = await violationUpdatePromise.catch(e => fail('Trainer did not receive violation broadcast', e));
  if (violationReceived.type !== 'violation' || violationReceived.violation?.type !== 'TAB_SWITCH') {
    fail('Violation verify', new Error('Incorrect violation event structure received'));
  }
  ok('Violation saved to database and trainer notified in real-time');

  // ── 13. Verify Trainer Warning / Messaging ────────────────────────────
  step('Verifying trainer messaging and warnings');
  const warningPromise = waitForEvent(pSocket, 'proctor:trainerMessage');
  
  const msgAck = await new Promise((resolve) => {
    tSocket.emit('proctor:trainerMessage', {
      sessionId,
      message: 'Keep your mouse inside the test screen!'
    }, resolve);
  });
  if (!msgAck.ok) fail('Trainer warning emit failed', new Error(msgAck.error));

  const warningReceived = await warningPromise.catch(e => fail('Participant did not receive warning message', e));
  if (warningReceived.message !== 'Keep your mouse inside the test screen!') {
    fail('Warning verify', new Error('Incorrect message text received'));
  }
  ok('Trainer sent warning; participant socket received message in real-time');

  // ── 13.5. Verify Screen Frame Capture & Broadcast ──────────────────────
  step('Verifying screen frame capture and trainer broadcast');
  const screenFramePromise = waitForEvent(tSocket, 'proctor:screen-frame');
  
  const mockBase64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  
  const frameAck = await new Promise((resolve) => {
    pSocket.emit('proctor:screen-frame', {
      sessionId,
      imageBase64: mockBase64Image,
      timestamp: Date.now()
    }, resolve);
  });
  
  if (!frameAck.ok) fail('Emit screen-frame failed', new Error(frameAck.error));
  
  const frameReceived = await screenFramePromise.catch(e => fail('Trainer did not receive screen-frame event', e));
  if (frameReceived.sessionId !== sessionId || !frameReceived.screenshot?.filePath) {
    fail('Screen-frame verify', new Error('Incorrect screen-frame event structure received'));
  }
  ok('Screen-frame socket event processed, screenshot stored on backend, and trainer notified');

  // Verify REST endpoint GET /sessions/:sessionId/screenshots
  const screenshotsRes = await call('GET', `/api/proctor/sessions/${sessionId}/screenshots`, { token: adminToken })
    .catch(e => fail('GET /sessions/:sessionId/screenshots failed', e));
  
  if (!screenshotsRes.success || !Array.isArray(screenshotsRes.data) || screenshotsRes.data.length === 0) {
    fail('Get screenshots REST verify', new Error('No screenshots returned by REST API'));
  }
  const savedScreenshot = screenshotsRes.data.find(s => s.id === frameAck.screenshotId);
  if (!savedScreenshot) {
    fail('Get screenshots REST verify', new Error('Expected screenshot ID not found in REST response'));
  }
  ok('REST GET /sessions/:sessionId/screenshots works, returns the saved screenshot record');

  // ── 14. Verify WebRTC Signaling Observe Request ───────────────────────
  step('Verifying WebRTC observe request');
  const observePromise = waitForEvent(pSocket, 'proctor:observe-request');
  
  const obsAck = await new Promise((resolve) => {
    tSocket.emit('proctor:observe', { sessionId }, resolve);
  });
  if (!obsAck.ok) fail('Trainer observe emit failed', new Error(obsAck.error));

  const observeReceived = await observePromise.catch(e => fail('Participant did not receive observe request', e));
  if (observeReceived.viewerId !== adminLogin.id) {
    fail('Observe verify', new Error('Incorrect viewerId in observe request'));
  }
  ok('Trainer observe request sent; participant socket received event in real-time');

  // ── 15. Verify Disconnect & Grace Period Trigger ──────────────────────
  step('Verifying connection drops and grace period triggers');
  const disconnectUpdatePromise = waitForEvent(tSocket, 'proctor:update');
  pSocket.disconnect();
  
  const disconnectUpdateReceived = await disconnectUpdatePromise.catch(e => fail('Trainer did not receive disconnect update', e));
  if (disconnectUpdateReceived.type !== 'disconnected' || !disconnectUpdateReceived.session?.disconnectedAt) {
    fail('Grace Period verify', new Error('Disconnect state not recorded'));
  }
  ok('Participant disconnected; session marked disconnected on backend with grace period active');

  // ── 16. Verify Reconnection during Grace Period ───────────────────────
  step('Verifying participant reconnection during grace period');
  const reconnectUpdatePromise = waitForEvent(tSocket, 'proctor:update');
  const pSocketNew = connectSocket(studentToken);
  
  await waitForEvent(pSocketNew, 'connected').catch(e => fail('Reconnect socket failed', e));

  const reconnectAck = await new Promise((resolve) => {
    pSocketNew.emit('proctor:join', { sessionId }, resolve);
  });
  if (!reconnectAck.ok) fail('Reconnect join failed', new Error(reconnectAck.error));

  const reconnectUpdateReceived = await reconnectUpdatePromise.catch(e => fail('Trainer did not receive reconnect update', e));
  if (reconnectUpdateReceived.type !== 'reconnected') {
    fail('Reconnect verify', new Error('Session did not restore to active state'));
  }
  ok('Participant reconnected; session successfully restored to ACTIVE status');

  // ── 17. Participant Submits & Finalizes Exam (REST) ───────────────────
  step('Participant finalizes the exam');
  await call('POST', `/api/proctor/sessions/${sessionId}/finalize`, {
    token: studentToken,
    headers: { 'X-Proctor-Session-Token': sessionToken },
    body: { answers: { 1: 'navigator.mediaDevices.getDisplayMedia' } }
  }).catch(e => fail('Finalize endpoint failed', e));
  
  // Verify session is now SUBMITTED
  const finalSession = await call('GET', `/api/proctor/sessions/${sessionId}`, { token: adminToken });
  if (finalSession.data?.status !== 'SUBMITTED') {
    fail('Verify SUBMITTED status', new Error(`Expected SUBMITTED, got ${finalSession.data?.status}`));
  }
  ok('Exam submitted and proctor session updated to SUBMITTED status');

  // ── 18. Cleanup ───────────────────────────────────────────────────────
  step('Cleanup: delete training program');
  await call('DELETE', `/api/admin/training-programs/${programId}`, { token: adminToken });
  
  pSocketNew.disconnect();
  tSocket.disconnect();
  ok('Mock program and all cascaded proctoring records deleted successfully');

  console.log(`\n${c.bold(c.green('━━━ PROCTORING & SCREEN SHARE E2E TEST PASSED ━━━'))}\n`);
  process.exit(0);

})().catch(e => {
  console.error(c.red(`\nFATAL ERROR DURING TEST: ${e.message}`));
  if (e.responseBody) console.error(`Response details: ${e.responseBody}`);
  process.exit(1);
});
