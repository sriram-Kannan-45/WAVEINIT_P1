/** Authenticated quiz/coding transport, backed by the canonical monitor. */
const verification = require('../services/assessmentVerificationService');
const monitoring = require('../services/monitoringService');
const relay = require('./crossInstance');

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
  socket.on('assessment_verif:mobile_ready', async data => {
    if (!bound(data) || socket.verifRole !== 'mobile_camera') return;
    emit('assessment_verif:mobile_status', { mobileCameraReady: true, status: 'PAIRED' });
  });
  socket.on('assessment_verif:stream_status', data => {
    if (bound(data) && socket.verifRole === 'mobile_camera') emit('assessment_verif:stream_status', { streaming: !!data.streaming });
  });
  socket.on('disconnect', () => {
    if (binding && socket.verifRole === 'mobile_camera') emit('assessment_verif:mobile_status', { connected: false });
  });
  // Unlock/start/end are server lifecycle decisions, never client socket commands.
};
