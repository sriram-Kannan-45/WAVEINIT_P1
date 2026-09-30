/** Authenticated quiz/coding transport, backed by the canonical monitor. */
const verification = require('../services/assessmentVerificationService');
const monitoring = require('../services/monitoringService');
const relay = require('./crossInstance');
const hireProctoring = require('../services/hireProctoringService');
const hirePolicy = require('../services/hireProctoringPolicy');
const logger = require('../utils/logger');
const crypto = require('crypto');

const activeRoomCaptures = new Set();
const laptopRoomEvidence = new Map();
const activeMobileSockets = new Map();
const phoneScanSamples = new Map();
const activeScanRecordings = new Map();
const SCAN_SAMPLE_TTL_MS = 120000;
const CAPTURE_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;
const ROOM_CAPTURE_MAX_AGE_MS = Number(process.env.ROOM_CAPTURE_MAX_AGE_MS) || 15000;

module.exports = (io, socket) => {
  let binding = null;
  let busy = false;
  const emit = (event, payload) => relay.relayEmit(io, 'room', `assessment_verif_${binding.session.session_id}`, event, payload);
  const bound = data => binding && (!data?.sessionId || [binding.session.session_id, binding.monitor.sessionId].includes(data.sessionId));
  socket.on('assessment_verif:join', async (data, ack) => {
    try {
      const mobile = data?.role === 'mobile_camera';
      if (mobile !== !!socket.assessmentMobileClaims) throw new Error('Invalid camera role');
      binding = await verification.authorizeSocket({ sessionId: data.sessionId, participantId: socket.userId,
        token: socket.assessmentMobileClaims?.token, mobile });
      socket.data.assessmentVerification = { sessionId: binding.session.session_id, role: mobile ? 'mobile_camera' : 'laptop' };
      socket.verifRole = socket.data.assessmentVerification.role;
      const room = `assessment_verif_${binding.session.session_id}`;
      if (mobile) {
        const existingPeers = await io.in(room).fetchSockets();
        for (const peer of existingPeers) {
          if (peer.id !== socket.id && peer.data?.assessmentVerification?.role === 'mobile_camera') {
            logger.warn('MOBILE_PAIR_REPLACED', { sessionId: binding.session.session_id,
              oldSocketId: peer.id, newSocketId: socket.id });
            await peer.disconnect(true);
          }
        }
        activeMobileSockets.set(binding.session.session_id, socket.id);
        phoneScanSamples.delete(binding.session.session_id);
        activeScanRecordings.delete(binding.session.session_id);
      }
      await socket.join(room);
      ack?.({ ok: true, sessionId: binding.session.session_id,
        workspaceReady: mobile && hirePolicy.roomScanApproved(binding.monitor.metadata?.hireProctoring) });
      const peers = await io.in(room).fetchSockets();
      relay.relayEmit(io, 'room', room, mobile ? 'assessment_verif:mobile_joined' : 'assessment_verif:laptop_joined',
        { socketId: socket.id, sessionId: binding.session.session_id }, { excludingSocket: socket });
      for (const peer of peers) {
        if (peer.id !== socket.id && peer.data?.assessmentVerification?.role !== socket.verifRole) {
          socket.emit(mobile ? 'assessment_verif:laptop_joined' : 'assessment_verif:mobile_joined', { socketId: peer.id, sessionId: binding.session.session_id });
        }
      }
    } catch (error) { binding = null; ack?.({ ok: false, error: error.message }); }
  });
  for (const [name, field] of [['offer', 'offer'], ['answer', 'answer'], ['ice-candidate', 'candidate']]) {
    socket.on(`assessment_verif:${name}`, async data => {
      if (!bound(data) || !data[field]) return;
      const peers = await io.in(`assessment_verif_${binding.session.session_id}`).fetchSockets();
      const targets = peers.filter(p => p.id !== socket.id && (!data.targetSocketId || p.id === data.targetSocketId) && p.data?.assessmentVerification?.role !== socket.verifRole);
      for (const target of targets) relay.relayEmit(io, 'socket', target.id, `assessment_verif:${name}`, {
        sessionId: binding.session.session_id, fromSocketId: socket.id, [field]: data[field],
      });
    });
  }
  // The HTTP sweep may only analyze exact JPEGs delivered by the active phone
  // socket. A short-lived ledger binds each sample and sensor reading to that
  // stream, while the relay supplies the desktop's progress loop.
  socket.on('assessment_verif:scan_recording_control', (data, ack) => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera' ||
        activeMobileSockets.get(binding.session.session_id) !== socket.id ||
        socket.data?.assessmentVerification?.mobileStreamId !== data?.mobileStreamId) {
      return ack?.({ ok: false, error: 'The paired phone camera is unavailable.' });
    }
    const sessionId = binding.session.session_id;
    if (data.action === 'start') {
      phoneScanSamples.delete(sessionId);
      activeScanRecordings.set(sessionId, socket.id);
    } else if (data.action === 'finish') {
      if (activeScanRecordings.get(sessionId) !== socket.id)
        return ack?.({ ok: false, error: 'Start a new room recording first.' });
      activeScanRecordings.delete(sessionId);
    } else return ack?.({ ok: false, error: 'Invalid recording action.' });
    socket.to(`assessment_verif_${sessionId}`).emit('assessment_verif:scan_recording_control',
      { action: data.action, sessionId, at: Date.now() });
    ack?.({ ok: true });
  });
  socket.on('assessment_verif:scan_sample', (data, ack) => {
    const frame = data?.frame;
    const capturedAt = Number(data?.capturedAt);
    if (!bound(data) || socket.verifRole !== 'mobile_camera' ||
        activeMobileSockets.get(binding.session.session_id) !== socket.id ||
        activeScanRecordings.get(binding.session.session_id) !== socket.id ||
        socket.data?.assessmentVerification?.mobileStreamId !== data?.mobileStreamId ||
        !Number.isFinite(capturedAt) || Date.now() - capturedAt > 5000 || capturedAt - Date.now() > 1000 ||
        typeof frame !== 'string' || frame.length > 900000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame)) {
      return ack?.({ ok: false, error: 'The active phone camera sample is invalid.' });
    }
    const bytes = Buffer.from(frame.slice('data:image/jpeg;base64,'.length), 'base64');
    if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      return ack?.({ ok: false, error: 'Capture a fresh camera frame.' });
    }
    const rawYaw = data?.orientation?.yaw;
    const yaw = rawYaw == null ? null : Number(rawYaw);
    const rawPitch = data?.orientation?.pitch;
    const pitch = rawPitch == null ? null : Number(rawPitch);
    if ((yaw !== null && !Number.isFinite(yaw)) || (pitch !== null && !Number.isFinite(pitch)))
      return ack?.({ ok: false, error: 'Invalid orientation reading.' });
    const orientation = yaw === null ? null : { yaw: ((yaw % 360) + 360) % 360, pitch };
    const sessionId = binding.session.session_id;
    const ledger = phoneScanSamples.get(sessionId) || new Map();
    const now = Date.now();
    for (const [hash, samples] of ledger) {
      const fresh = samples.filter(sample => now - sample.at <= SCAN_SAMPLE_TTL_MS);
      if (fresh.length) ledger.set(hash, fresh);
      else ledger.delete(hash);
    }
    const hash = crypto.createHash('sha256').update(frame).digest('hex');
    ledger.set(hash, [...(ledger.get(hash) || []), { at: now, socketId: socket.id, orientation }].slice(-12));
    while (ledger.size > 128) ledger.delete(ledger.keys().next().value);
    phoneScanSamples.set(sessionId, ledger);
    socket.to(`assessment_verif_${sessionId}`).emit('assessment_verif:scan_sample',
      { frame, orientation, capturedAt });
    ack?.({ ok: true });
  });
  socket.on('assessment_verif:frame', async (data, ack) => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera' || typeof data.frame !== 'string' || data.frame.length > 900000) return ack?.({ ok: false, error: 'Mobile camera is not joined to this session.' });
    if (Date.now() - (socket.lastMobileSampleAt || 0) < 500) return ack?.({ ok: true, coalesced: true });
    socket.lastMobileSampleAt = Date.now();
    let acknowledged = false;
    let ownsInference = false;
    try {
      const current = await verification.authorizeSocket({ sessionId: binding.session.session_id,
        participantId: socket.userId, token: socket.assessmentMobileClaims?.token, mobile: true });
      binding = current;
      // Video stays on the socket adapter. Never store JPEGs in the DB outbox,
      // and never make delivery wait for the (potentially cold) AI model.
      socket.to(`assessment_verif_${current.session.session_id}`).emit('assessment_verif:frame', { frame: data.frame, timestamp: Date.now() });
      ack?.({ ok: true });
      acknowledged = true;
      const hire = current.monitor.metadata?.hireProctoring;
      const roomVerificationPending = hire?.policy?.enabled && (hire.policy.mobileRoomScan || hire.policy.roomScan360Enabled) &&
        !hirePolicy.roomScanApproved(hire);
      if (roomVerificationPending) {
        // Pairing frames remain live preview transport. Workspace inference
        // starts only after all five photos and the 360 sweep are complete.
        return;
      }
      if (busy) return;
      busy = true;
      ownsInference = true;
      const result = await monitoring.validateMobile({ sessionId: current.monitor.sessionId,
        participantId: socket.userId, frame: data.frame, verificationSession: current.session });
      if (!result.busy) emit('assessment_verif:yolo_detection', {
        success: result.success, compositionState: result.composition_state,
        userMessage: result.user_message, event: result.proctoring_event,
        detections: result.detections, mobileEvidence: result.mobile_evidence,
      });
    } catch (error) {
      if (!acknowledged) ack?.({ ok: false, error: error.message });
      else emit('assessment_verif:yolo_detection', { success: false, userMessage: 'Camera connected; detection is temporarily unavailable.' });
    } finally { if (ownsInference) busy = false; }
  });
  socket.on('assessment_verif:frame_received', data => {
    if (!bound(data) || socket.verifRole !== 'laptop') return;
    if (Date.now() - (socket.lastViewerReceiptAt || 0) < 2000) return;
    socket.lastViewerReceiptAt = Date.now();
    // Sent only after a desktop viewer has received a mobile frame.
    socket.to(`assessment_verif_${binding.session.session_id}`).emit('assessment_verif:desktop_receiving', { timestamp: Date.now() });
  });
  // Camera samples are requested only for an explicit room photo. Relay them
  // between the paired devices; no video is retained in session metadata.
  socket.on('assessment_verif:laptop_evidence_request', data => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera' ||
        !/^[a-z0-9-]{8,64}$/i.test(String(data?.captureId || ''))) return;
    socket.to(`assessment_verif_${binding.session.session_id}`).emit('assessment_verif:laptop_evidence_request',
      { captureId: data.captureId });
  });
  socket.on('assessment_verif:laptop_evidence', data => {
    if (!bound(data) || socket.verifRole !== 'laptop' ||
        !/^[a-z0-9-]{8,64}$/i.test(String(data?.captureId || '')) ||
        !Array.isArray(data.frames) || data.frames.length > 6 ||
        data.frames.some(frame => typeof frame !== 'string' || frame.length > 180000)) return;
    // Keep only a short sample in process memory until the matching phone photo
    // arrives. Send readiness to the phone, never the laptop camera pixels.
    const now = Date.now();
    for (const [key, value] of laptopRoomEvidence) if (now - value.at > 10000) laptopRoomEvidence.delete(key);
    const key = `${binding.session.session_id}:${data.captureId}`;
    const sample = { at: now, frames: data.frames };
    laptopRoomEvidence.set(key, sample);
    setTimeout(() => { if (laptopRoomEvidence.get(key) === sample) laptopRoomEvidence.delete(key); }, 10000).unref?.();
    socket.to(`assessment_verif_${binding.session.session_id}`).emit('assessment_verif:laptop_evidence',
      { captureId: data.captureId, ready: data.frames.length >= 3 });
  });
  // One explicit phone photo per guided step. Video frames never enter this path.
  socket.on('assessment_verif:room_capture', async (data, ack) => {
    const photo = Buffer.isBuffer(data?.photo) ? data.photo
      : data?.photo instanceof ArrayBuffer ? Buffer.from(data.photo)
        : ArrayBuffer.isView(data?.photo) ? Buffer.from(data.photo.buffer, data.photo.byteOffset, data.photo.byteLength) : null;
    if (!bound(data) || socket.verifRole !== 'mobile_camera' ||
        activeMobileSockets.get(binding?.session?.session_id) !== socket.id) {
      return ack?.({ ok: false, errorCode: 'QR_NOT_PAIRED', error: 'This phone is not the active device for the assessment session.' });
    }
    const capturedAt = Number(data?.capturedAt);
    const captureAgeMs = Date.now() - capturedAt;
    if (!Number.isFinite(capturedAt) || captureAgeMs > ROOM_CAPTURE_MAX_AGE_MS || captureAgeMs < -5000) {
      return ack?.({ ok: false, errorCode: 'STALE_CAPTURE', error: 'That camera frame is no longer fresh. Capture a new photo.' });
    }
    if (!photo || photo.length < 100 || photo.length > 1400000 ||
        !CAPTURE_ID_PATTERN.test(String(data.captureId || '')) ||
        !CAPTURE_ID_PATTERN.test(String(data.mobileStreamId || ''))) {
      return ack?.({ ok: false, errorCode: 'INVALID_IMAGE', error: 'Please capture a clearer photo.' });
    }
    if (!socket.data?.assessmentVerification?.mobileStreamId ||
        socket.data.assessmentVerification.mobileStreamId !== String(data.mobileStreamId)) {
      return ack?.({ ok: false, errorCode: 'CAMERA_NOT_READY', error: 'The active mobile camera stream could not be verified.' });
    }
    const key = String(binding.monitor.sessionId);
    if (activeRoomCaptures.has(key)) return ack?.({ ok: false, errorCode: 'ALREADY_ANALYZING', error: 'This photo is already being analyzed.' });
    activeRoomCaptures.add(key);
    logger.info('PHOTO_SIZE', { captureId: data.captureId, step: data.step, bytes: photo.length });
    try {
      const current = await verification.authorizeSocket({ sessionId: binding.session.session_id,
        participantId: socket.userId, token: socket.assessmentMobileClaims?.token, mobile: true });
      // Decode before inference so arbitrary binary cannot reach evidence storage.
      if (photo[0] !== 0xff || photo[1] !== 0xd8 || photo[photo.length - 2] !== 0xff || photo[photo.length - 1] !== 0xd9) {
        const invalid = new Error('Please capture a clearer photo.');
        invalid.code = 'INVALID_IMAGE';
        throw invalid;
      }
      const step = String(data.step || '').toLowerCase();
      // Only a small preview crosses instances. The full binary photo goes to AI once.
      const preview = typeof data.preview === 'string' && data.preview.length < 150000 &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.preview) ? data.preview : null;
      logger.info('UPLOAD_COMPLETE', { captureId: data.captureId, step, bytes: photo.length });
      emit('assessment_verif:room_capture_state', { captureId: data.captureId, step, status: 'ANALYZING', preview });
      const evidenceKey = `${binding.session.session_id}:${data.captureId}`;
      const laptopEvidence = laptopRoomEvidence.get(evidenceKey);
      laptopRoomEvidence.delete(evidenceKey);
      const result = await hireProctoring.analyzeRoomStep({ sessionId: current.monitor.sessionId,
        user: { id: socket.userId, role: 'PARTICIPANT' }, step, frame: photo,
        orientation: data.orientation,
        laptopFrames: laptopEvidence && Date.now() - laptopEvidence.at <= 10000 ? laptopEvidence.frames : [],
        captureId: data.captureId, capturedAt, mobileStreamId: data.mobileStreamId,
        transportSessionId: socket.id });
      emit('assessment_verif:room_capture_state', { captureId: data.captureId, step,
        status: result.valid ? 'VERIFIED' : 'RETAKE', result });
      ack?.({ ok: true, result });
    } catch (error) {
      const errorCode = ['AI_TIMEOUT', 'INVALID_IMAGE', 'UPLOAD_FAILED', 'ALREADY_ANALYZING',
        'CAPTURE_REPLAY', 'STALE_CAPTURE', 'CAMERA_NOT_READY', 'QR_NOT_PAIRED', 'INVALID_CAPTURE_ID',
        'STEP_OUT_OF_ORDER', 'ROOM_PHASE_INVALID', 'UNSUPPORTED_STEP', 'INVALID_LAPTOP_SAMPLE'].includes(error.code)
        ? error.code : 'SERVER_ERROR';
      const messages = {
        AI_TIMEOUT: ['Photo analysis is taking too long. Please try again.', 'புகைப்பட ஆய்வு அதிக நேரம் எடுக்கிறது. மீண்டும் முயற்சிக்கவும்.'],
        INVALID_IMAGE: ['Please capture a clearer photo.', 'தெளிவான புகைப்படத்தை மீண்டும் எடுக்கவும்.'],
        UPLOAD_FAILED: ['Photo could not be uploaded. Please try again.', 'புகைப்படத்தை பதிவேற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'],
        ALREADY_ANALYZING: ['This photo is already being analyzed.', 'இந்தப் புகைப்படம் ஏற்கனவே ஆய்வு செய்யப்படுகிறது.'],
        CAPTURE_REPLAY: ['This capture was already submitted. Take a new photo.', 'இந்தப் படம் ஏற்கனவே சமர்ப்பிக்கப்பட்டது. புதிய புகைப்படம் எடுக்கவும்.'],
        STALE_CAPTURE: ['That camera frame is no longer fresh. Capture a new photo.', 'அந்தப் படம் புதியதாக இல்லை. புதிய புகைப்படம் எடுக்கவும்.'],
        CAMERA_NOT_READY: ['The active mobile camera stream could not be verified.', 'செயலில் உள்ள மொபைல் கேமரா இணைப்பை உறுதிப்படுத்த முடியவில்லை.'],
        QR_NOT_PAIRED: ['This phone is not paired to the active assessment session.', 'இந்தக் கைப்பேசி செயலில் உள்ள மதிப்பீட்டு அமர்வுடன் இணைக்கப்படவில்லை.'],
        INVALID_CAPTURE_ID: ['The camera capture could not be verified. Take a new photo.', 'கேமரா படத்தை உறுதிப்படுத்த முடியவில்லை. புதிய புகைப்படம் எடுக்கவும்.'],
        STEP_OUT_OF_ORDER: ['Room verification is out of sync. Reloading the current step.', 'அறை சரிபார்ப்பு வரிசை மாறியுள்ளது. தற்போதைய படி மீண்டும் ஏற்றப்படுகிறது.'],
        ROOM_PHASE_INVALID: ['Room scanning must finish before the assessment can start.', 'மதிப்பீட்டைத் தொடங்குவதற்கு முன் அறை ஸ்கேனிங் முடிய வேண்டும்.'],
        UNSUPPORTED_STEP: ['This room verification step is not part of the current flow.', 'இந்த அறை சரிபார்ப்புப் படி தற்போதைய வரிசையில் இல்லை.'],
        INVALID_LAPTOP_SAMPLE: ['The laptop camera could not be sampled. Keep it open and try again.', 'லேப்டாப் கேமராவை சரி பதிவேற்ற முடியவில்லை. அதைத் திறந்து வைத்து மீண்டும் முயற்சிக்கவும்.'],
        SERVER_ERROR: ['Verification service is temporarily unavailable. Please try again.', 'சரிபார்ப்பு சேவை தற்காலிகமாக கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.'],
      };
      const [message, taError] = messages[errorCode];
      // A step desync is a state problem, not an outage. Push the authoritative
      // capture map on a dedicated event so both clients re-derive the real
      // pending step. `room_state` stays laptop-owned: it carries UI fields
      // (step/aiStatus) this server-side snapshot does not include.
      if (errorCode === 'STEP_OUT_OF_ORDER') {
        try {
          const state = await hireProctoring.getRoomVerificationState({
            sessionId: binding.monitor.sessionId,
            user: { id: socket.userId, role: 'PARTICIPANT' },
          });
          emit('assessment_verif:room_state_sync', {
            sessionId: binding.session.session_id,
            roomSteps: state.roomSteps,
            sixCaptureStatus: state.sixCaptureStatus || {},
            pendingStep: hireProctoring.HIRE_ROOM_STEPS.find(name => !state.sixCaptureStatus?.[name]?.verifiedAt) || null,
            verificationState: state.verificationState,
            reason: 'STEP_OUT_OF_ORDER',
            broadcastAt: Date.now(),
          });
        } catch (syncError) {
          logger.warn('ROOM_PHOTO_RESYNC_FAILED', { captureId: data.captureId, detail: syncError.message });
        }
      }
      logger.warn('ROOM_PHOTO_ANALYSIS_ERROR', { captureId: data.captureId, step: data.step, errorCode, detail: error.message });
      emit('assessment_verif:room_capture_state', { captureId: data.captureId, step: data.step, status: 'ERROR',
        errorCode, expectedStep: error.expectedStep || null, error: message, taError });
      ack?.({ ok: false, errorCode, expectedStep: error.expectedStep || null, error: message, taError });
    } finally {
      activeRoomCaptures.delete(key);
    }
  });
  socket.on('assessment_verif:mobile_ready', async data => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera') return;
    const streamId = String(data?.mobileStreamId || '');
    if (!CAPTURE_ID_PATTERN.test(streamId)) return;
    socket.data.assessmentVerification.mobileStreamId = streamId;
    phoneScanSamples.delete(binding.session.session_id);
    emit('assessment_verif:mobile_status', { mobileCameraReady: true, status: 'PAIRED' });
  });
  socket.on('assessment_verif:stream_status', data => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera') return;
    const streamId = String(data?.mobileStreamId || '');
    if (data.streaming && (!CAPTURE_ID_PATTERN.test(streamId) ||
        socket.data?.assessmentVerification?.mobileStreamId !== streamId)) return;
    emit('assessment_verif:stream_status', { streaming: !!data.streaming });
  });
  // Laptop drives the AI-guided room-verification overlay on the phone screen.
  socket.on('assessment_verif:room_state', data => {
    if (!bound(data) || socket.verifRole !== 'laptop') return;
    const state = data && typeof data.state === 'object' ? data.state : data;
    emit('assessment_verif:room_state', { sessionId: binding.session.session_id, state, broadcastAt: Date.now() });
  });
  socket.on('disconnect', () => {
    if (binding && socket.verifRole === 'mobile_camera') {
      if (activeMobileSockets.get(binding.session.session_id) === socket.id) {
        activeMobileSockets.delete(binding.session.session_id);
        phoneScanSamples.delete(binding.session.session_id);
        activeScanRecordings.delete(binding.session.session_id);
        emit('assessment_verif:mobile_status', { connected: false });
      }
    }
  });
  // Unlock/start/end are server lifecycle decisions, never client socket commands.
};

module.exports.consumeScanSamples = (sessionId, socketId, frames) => {
  if (!Array.isArray(frames) || !frames.length || frames.length > 24) return null;
  const ledger = phoneScanSamples.get(sessionId);
  if (!ledger) return null;
  const now = Date.now();
  const hashes = frames.map(frame => typeof frame === 'string'
    ? crypto.createHash('sha256').update(frame).digest('hex') : null);
  const used = new Map();
  const entries = hashes.map(hash => {
    const index = used.get(hash) || 0;
    used.set(hash, index + 1);
    return ledger.get(hash)?.[index];
  });
  if (entries.some(entry => !entry || entry.socketId !== socketId || now - entry.at > SCAN_SAMPLE_TTL_MS)) return null;
  for (const [hash, count] of used) {
    const remaining = ledger.get(hash).slice(count);
    if (remaining.length) ledger.set(hash, remaining);
    else ledger.delete(hash);
  }
  return entries.map(entry => entry.orientation);
};
