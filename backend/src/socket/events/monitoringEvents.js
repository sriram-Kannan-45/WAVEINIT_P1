/**
 * Unified Monitoring Socket Events
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time telemetry, WebRTC signaling (laptop <-> mobile feed),
 * and live updates for Trainer and Admin monitoring views.
 */

const monitoringService = require('../../services/monitoringService');
const logger = require('../../utils/logger');

module.exports = function registerMonitoringEvents(io, socket) {
  // Join session monitoring room
  socket.on('monitoring:join', async (data, ack) => {
    const { sessionId, role = 'laptop' } = data || {};
    if (!sessionId) {
      if (ack) ack({ ok: false, error: 'sessionId is required' });
      return;
    }

    socket.monitoringSessionId = sessionId;
    socket.monitoringRole = role;

    const roomName = `monitoring_room_${sessionId}`;
    socket.join(roomName);
    socket.join(`proctor_session_${sessionId}`);

    logger.info(`[MonitoringSocket] Socket ${socket.id} (${role}) joined ${roomName}`);

    try {
      if (role === 'mobile_camera') {
        socket.to(roomName).emit('monitoring:mobile_joined', {
          sessionId,
          socketId: socket.id,
          timestamp: Date.now(),
        });

        // Inform mobile if laptop is already present
        const socketsInRoom = await io.in(roomName).fetchSockets();
        for (const s of socketsInRoom) {
          if (s.id !== socket.id && s.monitoringRole === 'laptop') {
            socket.emit('monitoring:laptop_joined', {
              sessionId,
              socketId: s.id,
              timestamp: Date.now(),
            });
          }
        }
      } else if (role === 'laptop') {
        socket.to(roomName).emit('monitoring:laptop_joined', {
          sessionId,
          socketId: socket.id,
          timestamp: Date.now(),
        });

        const socketsInRoom = await io.in(roomName).fetchSockets();
        for (const s of socketsInRoom) {
          if (s.id !== socket.id && s.monitoringRole === 'mobile_camera') {
            socket.emit('monitoring:mobile_joined', {
              sessionId,
              socketId: s.id,
              timestamp: Date.now(),
            });
          }
        }
      }

      if (ack) ack({ ok: true, sessionId, role });
    } catch (err) {
      logger.error(`[MonitoringSocket] Error in join: ${err.message}`);
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // WebRTC Signaling: SDP Offer
  socket.on('monitoring:offer', (data) => {
    const { sessionId, offer, targetSocketId } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession || !offer) return;

    const roomName = `monitoring_room_${targetSession}`;
    if (targetSocketId) {
      io.to(targetSocketId).emit('monitoring:offer', {
        sessionId: targetSession,
        fromSocketId: socket.id,
        offer,
      });
    } else {
      socket.to(roomName).emit('monitoring:offer', {
        sessionId: targetSession,
        fromSocketId: socket.id,
        offer,
      });
    }
  });

  // WebRTC Signaling: SDP Answer
  socket.on('monitoring:answer', (data) => {
    const { sessionId, answer, targetSocketId } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession || !answer) return;

    const roomName = `monitoring_room_${targetSession}`;
    if (targetSocketId) {
      io.to(targetSocketId).emit('monitoring:answer', {
        sessionId: targetSession,
        fromSocketId: socket.id,
        answer,
      });
    } else {
      socket.to(roomName).emit('monitoring:answer', {
        sessionId: targetSession,
        fromSocketId: socket.id,
        answer,
      });
    }
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('monitoring:ice-candidate', (data) => {
    const { sessionId, candidate, targetSocketId } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession || !candidate) return;

    const roomName = `monitoring_room_${targetSession}`;
    if (targetSocketId) {
      io.to(targetSocketId).emit('monitoring:ice-candidate', {
        sessionId: targetSession,
        fromSocketId: socket.id,
        candidate,
      });
    } else {
      socket.to(roomName).emit('monitoring:ice-candidate', {
        sessionId: targetSession,
        fromSocketId: socket.id,
        candidate,
      });
    }
  });

  // Live Mobile Frame Relay & Asynchronous YOLO Evaluation
  socket.on('monitoring:mobile_frame', async (data, ack) => {
    const { sessionId, frame, participantId, confidenceThreshold } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession || !frame) return;

    // Relay frame to laptop client for live preview
    socket.to(`monitoring_room_${targetSession}`).emit('monitoring:mobile_frame', {
      sessionId: targetSession,
      frame,
      timestamp: Date.now(),
    });

    // Run YOLO inference asynchronously
    try {
      const result = await monitoringService.validateMobile({
        sessionId: targetSession,
        participantId: participantId || socket.userId,
        frame,
        confidenceThreshold: confidenceThreshold || 0.35,
      });

      // Emit composition update to laptop and mobile
      io.to(`monitoring_room_${targetSession}`).emit('monitoring:mobile_composition', {
        sessionId: targetSession,
        compositionState: result.composition_state,
        userMessage: result.user_message,
        event: result.proctoring_event,
        detections: result.detections,
      });

      if (ack) ack({ ok: true, result });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // Heartbeat watchdog
  socket.on('monitoring:heartbeat', async ({ sessionId, source = 'LAPTOP' }) => {
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession) return;
    try {
      await monitoringService.heartbeat({ sessionId: targetSession, source });
    } catch (err) {}
  });

  // Real-time Event Reporting & Database Persistence
  socket.on('monitoring:event', async (data, ack) => {
    const { sessionId, eventType, severity, source, durationMs, confidence, metadata } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession || !eventType) return;

    try {
      const result = await monitoringService.reportEvent({
        sessionId: targetSession,
        participantId: socket.userId,
        source: source || 'LAPTOP',
        eventType,
        severity: severity || 'INFO',
        durationMs: durationMs || 0,
        confidence: confidence || 1.0,
        metadata: metadata || {},
      });

      // Broadcast to room for live viewers
      io.to(`monitoring_room_${targetSession}`).emit('proctoring_event', {
        sessionId: targetSession,
        eventType,
        severity,
        source: source || 'LAPTOP',
        confidence,
        timestamp: Date.now(),
        metadata,
      });

      if (ack) ack({ ok: true, result });
    } catch (err) {
      logger.warn(`[MonitoringSocket] monitoring:event error: ${err.message}`);
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  socket.on('monitoring_event', async (data, ack) => {
    const { sessionId, event } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    const ev = event || data;
    if (!targetSession || !ev || !ev.eventType) return;

    try {
      const result = await monitoringService.reportEvent({
        sessionId: targetSession,
        participantId: socket.userId,
        source: ev.source || 'LAPTOP',
        eventType: ev.eventType,
        severity: ev.severity || 'INFO',
        durationMs: ev.durationMs || 0,
        confidence: ev.confidence || 1.0,
        metadata: ev.metadata || {},
      });

      io.to(`monitoring_room_${targetSession}`).emit('proctoring_event', {
        sessionId: targetSession,
        ...ev,
        timestamp: Date.now(),
      });

      if (ack) ack({ ok: true, result });
    } catch (err) {
      logger.warn(`[MonitoringSocket] monitoring_event error: ${err.message}`);
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // End Monitoring Session
  socket.on('monitoring:end_session', (data) => {
    const { sessionId } = data || {};
    const targetSession = sessionId || socket.monitoringSessionId;
    if (!targetSession) return;

    io.to(`monitoring_room_${targetSession}`).emit('monitoring:session_ended', {
      sessionId: targetSession,
      status: 'COMPLETED',
      reason: 'ASSESSMENT_COMPLETED',
      timestamp: Date.now(),
    });
    io.to(`assessment_verif_${targetSession}`).emit('assessment_verif:session_ended', {
      sessionId: targetSession,
      status: 'COMPLETED',
      reason: 'ASSESSMENT_COMPLETED',
      timestamp: Date.now(),
    });
  });
};
