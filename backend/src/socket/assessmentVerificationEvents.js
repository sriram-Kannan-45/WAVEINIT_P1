/** Authenticated quiz/coding transport, backed by the canonical monitor. */
const verification = require('../services/assessmentVerificationService');
const monitoring = require('../services/monitoringService');
const relay = require('./crossInstance');
const hireProctoring = require('../services/hireProctoringService');
const logger = require('../utils/logger');

const activeRoomCaptures = new Set();
const laptopRoomEvidence = new Map();

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
      await socket.join(room);
      ack?.({ ok: true, sessionId: binding.session.session_id });
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
      const roomVerificationPending = hire?.policy?.enabled && (hire.policy.mobileRoomScan || hire.policy.roomScan360Enabled) && hire.roomScanClear !== true;
      if (roomVerificationPending) {
        // Pairing frames remain live preview transport. Workspace inference
        // starts only after all six photos and the 360 sweep are complete.
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
    if (!bound(data) || socket.verifRole !== 'mobile_camera') return ack?.({ ok: false, errorCode: 'UPLOAD_FAILED', error: 'Photo could not be uploaded. Please try again.' });
    if (!photo || photo.length < 100 || photo.length > 1400000 ||
        !/^[a-z0-9-]{8,64}$/i.test(String(data.captureId || ''))) {
      return ack?.({ ok: false, errorCode: 'INVALID_IMAGE', error: 'Please capture a clearer photo.' });
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
        laptopFrames: laptopEvidence && Date.now() - laptopEvidence.at <= 10000 ? laptopEvidence.frames : [] });
      emit('assessment_verif:room_capture_state', { captureId: data.captureId, step,
        status: result.valid ? 'VERIFIED' : 'RETAKE', result });
      ack?.({ ok: true, result });
    } catch (error) {
      const errorCode = ['AI_TIMEOUT', 'INVALID_IMAGE', 'UPLOAD_FAILED', 'ALREADY_ANALYZING'].includes(error.code)
        ? error.code : 'SERVER_ERROR';
      const messages = {
        AI_TIMEOUT: ['Photo analysis is taking too long. Please try again.', 'புகைப்பட ஆய்வு அதிக நேரம் எடுக்கிறது. மீண்டும் முயற்சிக்கவும்.'],
        INVALID_IMAGE: ['Please capture a clearer photo.', 'தெளிவான புகைப்படத்தை மீண்டும் எடுக்கவும்.'],
        UPLOAD_FAILED: ['Photo could not be uploaded. Please try again.', 'புகைப்படத்தை பதிவேற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'],
        ALREADY_ANALYZING: ['This photo is already being analyzed.', 'இந்தப் புகைப்படம் ஏற்கனவே ஆய்வு செய்யப்படுகிறது.'],
        SERVER_ERROR: ['Verification service is temporarily unavailable. Please try again.', 'சரிபார்ப்பு சேவை தற்காலிகமாக கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.'],
      };
      const [message, taError] = messages[errorCode];
      logger.warn('ROOM_PHOTO_ANALYSIS_ERROR', { captureId: data.captureId, step: data.step, errorCode, detail: error.message });
      emit('assessment_verif:room_capture_state', { captureId: data.captureId, step: data.step, status: 'ERROR', errorCode, error: message, taError });
      ack?.({ ok: false, errorCode, error: message, taError });
    } finally {
      activeRoomCaptures.delete(key);
    }
  });
  socket.on('assessment_verif:mobile_ready', async data => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera') return;
    emit('assessment_verif:mobile_status', { mobileCameraReady: true, status: 'PAIRED' });
  });
  socket.on('assessment_verif:stream_status', data => {
    if (bound(data) && socket.verifRole === 'mobile_camera') emit('assessment_verif:stream_status', { streaming: !!data.streaming });
  });
  socket.on('assessment_verif:orientation', data => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera' || !Number.isFinite(data?.yaw)) return;
    emit('assessment_verif:orientation', {
      yaw: ((data.yaw % 360) + 360) % 360,
      pitch: Number.isFinite(data.pitch) ? data.pitch : null,
      at: Date.now(),
    });
  });
  // Laptop drives the AI-guided room-verification overlay on the phone screen.
  socket.on('assessment_verif:room_state', data => {
    if (!bound(data) || socket.verifRole !== 'laptop') return;
    const state = data && typeof data.state === 'object' ? data.state : data;
    emit('assessment_verif:room_state', { sessionId: binding.session.session_id, state, broadcastAt: Date.now() });
  });
  socket.on('disconnect', () => {
    if (binding && socket.verifRole === 'mobile_camera') emit('assessment_verif:mobile_status', { connected: false });
  });
  // Unlock/start/end are server lifecycle decisions, never client socket commands.
};
