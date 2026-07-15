/**
 * Proctoring socket events.
 *
 * Rooms:
 *   user_<id>              — already joined by the auth middleware
 *   proctor_quiz_<quizId>   — trainer monitoring a specific quiz
 *   proctor_session_<id>    — both participant + trainers monitoring a session
 *
 * Participant emits:
 *   proctor:join            { sessionId }
 *   proctor:heartbeat       { sessionId }
 *   proctor:violation       { sessionId, type, message?, metadata? }
 *   proctor:state           { sessionId, isFullscreen?, isScreenSharing?, isOnline? }
 *   proctor:webrtc-offer    { sessionId, viewerId, sdp }  — screen share offer
 *   proctor:ice-candidate   { sessionId, viewerId, candidate }
 *   proctor:stream-available { sessionId }
 *   proctor:stream-ended    { sessionId }
 *
 * Trainer emits:
 *   proctor:trainerJoin     { quizId }
 *   proctor:trainerLeave    { quizId }
 *   proctor:webrtc-answer   { sessionId, viewerId, sdp }  — answer to participant offer
 *   proctor:ice-candidate   { sessionId, viewerId, candidate }
 *   proctor:forceTerminate  { sessionId, reason? }
 *   proctor:observe         { sessionId }  — request to observe a participant
 *   proctor:unobserve       { sessionId }
 *   proctor:trainerMessage  { sessionId, message }  — send warning to participant
 *
 * Server broadcasts to trainers:
 *   proctor:update          { type, session, ... }
 *   proctor:violation       individual violation row
 *   proctor:webrtc-offer    { sessionId, viewerId, sdp, participantName }
 *   proctor:stream-available { sessionId }
 *   proctor:stream-ended    { sessionId }
 *
 * Server pushes to participant:
 *   proctor:terminated      { sessionId, reason }
 *   proctor:warning         { type, message }
 *   proctor:multipleLogin
 *   proctor:webrtc-answer   { sessionId, viewerId, sdp }
 *   proctor:ice-candidate   { sessionId, viewerId, candidate }
 *   proctor:trainerMessage  { message }
 *   proctor:reconnected     { session }
 */
const fs = require('fs');
const path = require('path');
const proctoring = require('../../services/proctoringService');
const { ExamSession, Screenshot } = require('../../models');
const logger = require('../../utils/logger');

module.exports = function registerProctorEvents(io, socket) {
  /**
   * Determine whether the connected user is allowed to view or signal on
   * behalf of a proctoring session. Only the participant owner or an
   * authorized trainer/admin may interact.
   */
  function canViewSession(session) {
    if (session.participantId === socket.userId) return true;
    return ['TRAINER', 'ADMIN'].includes(socket.userRole);
  }

  // ── Participant joins their own session room ────────────────────────────
  socket.on('proctor:join', async ({ sessionId }, ack) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session) return ack?.({ ok: false, error: 'not_found' });

      const isOwner = session.participantId === socket.userId;
      const isTrainer = ['TRAINER', 'ADMIN'].includes(socket.userRole);
      if (!isOwner && !isTrainer) return ack?.({ ok: false, error: 'forbidden' });

      socket.join(`proctor_session_${sessionId}`);

      // Single-device enforcement: kick prior socket connections of same user
      // that are inside a different session.
      if (isOwner) {
        const sockets = await io.in(`user_${socket.userId}`).fetchSockets();
        for (const s of sockets) {
          if (s.id !== socket.id && s.data?.activeSessionId && s.data.activeSessionId !== sessionId) {
            s.emit('proctor:multipleLogin');
            s.disconnect(true);
          }
        }
        socket.data.activeSessionId = sessionId;

        // Reconnection within grace period — restore session
        const wasDisconnected = !!session.disconnectedAt;
        if (wasDisconnected && session.status === 'ACTIVE') {
          await proctoring.reconnectSession(session);
          socket.emit('proctor:reconnected', { session: proctoring.buildClientView(session) });
          io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
            type: 'reconnected',
            session: proctoring.buildClientView(session),
          });
        } else {
          session.isOnline = true;
          await session.save();
          io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
            type: 'online',
            session: proctoring.buildClientView(session),
          });
        }

        // Record proctor activity for join
        await proctoring.recordActivity({
          session,
          eventType: 'JOIN',
          payload: { socketId: socket.id, ipAddress: socket.handshake.address },
        });
      }

      ack?.({ ok: true, session: proctoring.buildClientView(session) });
    } catch (err) {
      logger.error('proctor:join failed', { err: err.message });
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── Heartbeat (cheap, no DB read) ───────────────────────────────────────
  socket.on('proctor:heartbeat', async ({ sessionId }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || session.participantId !== socket.userId) return;
      await proctoring.heartbeat(session);
      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:heartbeat', {
        sessionId,
        at: session.lastHeartbeatAt,
      });
    } catch (err) {
      logger.warn('heartbeat error', { err: err.message });
    }
  });

  // ── Participant uploads a screen capture frame ──────────────────────────
  socket.on('proctor:screen-frame', async ({ sessionId, imageBase64, timestamp }, ack) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || session.participantId !== socket.userId) {
        return ack?.({ ok: false, error: 'forbidden' });
      }

      if (!imageBase64) {
        return ack?.({ ok: false, error: 'imageBase64 required' });
      }

      const screenshotsDir = path.join(__dirname, '../../../uploads/screenshots', String(sessionId));
      fs.mkdirSync(screenshotsDir, { recursive: true });
      
      let base64Data = imageBase64;
      if (imageBase64.includes(',')) {
        base64Data = imageBase64.split(',')[1];
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `frame_${Date.now()}.jpg`;
      const fullPath = path.join(screenshotsDir, filename);
      
      fs.writeFileSync(fullPath, buffer);
      
      const dbPath = `/uploads/screenshots/${sessionId}/${filename}`;
      const screenshot = await Screenshot.create({
        sessionId,
        participantId: socket.userId,
        filePath: dbPath,
        capturedAt: timestamp ? new Date(timestamp) : new Date(),
      });

      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:screen-frame', {
        sessionId,
        screenshot: {
          id: screenshot.id,
          filePath: dbPath,
          capturedAt: screenshot.capturedAt,
        },
      });

      ack?.({ ok: true, screenshotId: screenshot.id });
    } catch (err) {
      logger.error('proctor:screen-frame error', { err: err.message });
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── State change pushed by client (fullscreen/screen-share/online) ──────
  socket.on('proctor:state', async ({ sessionId, ...flags }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || session.participantId !== socket.userId) return;
      let mutated = false;
      if (typeof flags.isFullscreen === 'boolean') {
        session.isFullscreen = flags.isFullscreen; mutated = true;
      }
      if (typeof flags.isScreenSharing === 'boolean') {
        session.isScreenSharing = flags.isScreenSharing; mutated = true;
      }
      if (typeof flags.isOnline === 'boolean') {
        session.isOnline = flags.isOnline; mutated = true;
      }
      if (mutated) await session.save();
      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
        type: 'state',
        session: proctoring.buildClientView(session),
      });
    } catch (err) {
      logger.warn('state error', { err: err.message });
    }
  });

  // ── Violation reported via socket (low-latency path) ───────────────────
  socket.on('proctor:violation', async (data, ack) => {
    try {
      const { sessionId, type, message, metadata } = data || {};
      console.log(`[proctorEvents] Violation reported by user ${socket.userId}, session ${sessionId}, type ${type}`);
      const session = await ExamSession.findByPk(sessionId);
      if (!session || session.participantId !== socket.userId) {
        return ack?.({ ok: false, error: 'forbidden' });
      }
      const result = await proctoring.recordViolation({ session, type, message, metadata });

      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
        type: 'violation',
        session: proctoring.buildClientView(session),
        violation: result.violation,
      });

      if (result.terminated) {
        socket.emit('proctor:terminated', {
          sessionId,
          reason: session.terminationReason,
        });
      } else {
        socket.emit('proctor:warning', { type, message });
      }
      ack?.({ ok: true, terminated: result.terminated });
    } catch (err) {
      logger.error('proctor:violation error', { err: err.message });
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── Trainer joins/leaves a quiz monitoring room ─────────────────────────
  socket.on('proctor:trainerJoin', async ({ quizId }, ack) => {
    if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) return ack?.({ ok: false });
    socket.join(`proctor_quiz_${quizId}`);
    try {
      const monitor = await proctoring.getQuizMonitor(quizId);
      ack?.({ ok: true, sessions: monitor });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on('proctor:trainerLeave', ({ quizId }) => {
    socket.leave(`proctor_quiz_${quizId}`);
  });

  // ── Trainer force-terminate (in addition to REST) ──────────────────────
  socket.on('proctor:forceTerminate', async ({ sessionId, reason }, ack) => {
    try {
      if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) {
        return ack?.({ ok: false, error: 'forbidden' });
      }
      const session = await ExamSession.findByPk(sessionId);
      if (!session) return ack?.({ ok: false, error: 'not_found' });
      await proctoring.terminateSession({ session, reason: reason || 'Trainer terminated' });

      io.to(`user_${session.participantId}`).emit('proctor:terminated', {
        sessionId, reason: session.terminationReason,
      });
      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
        type: 'terminated',
        session: proctoring.buildClientView(session),
      });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── WebRTC signaling: participant sends screen-share offer ──────────────
  socket.on('proctor:webrtc-offer', async ({ sessionId, viewerId, sdp }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || !canViewSession(session)) return;
      if (session.participantId !== socket.userId) return; // only owner can offer

      console.log(`[proctorEvents] Offer received from participant ${socket.userId} for viewer ${viewerId}, session ${sessionId}`);
      // Relay offer to the requesting trainer only
      io.to(`user_${viewerId}`).emit('proctor:webrtc-offer', {
        sessionId, viewerId, sdp, participantName: socket.userName || 'Participant',
      });
      console.log(`[proctorEvents] Offer relayed to trainer ${viewerId}`);
    } catch (err) {
      logger.warn('webrtc-offer relay error', { err: err.message });
    }
  });

  // ── WebRTC signaling: trainer sends answer back to participant ──────────
  socket.on('proctor:webrtc-answer', async ({ sessionId, viewerId, sdp }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || !canViewSession(session)) return;
      if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) return; // only trainers answer
      console.log(`[proctorEvents] Answer received from trainer ${socket.userId} for participant ${session.participantId}, session ${sessionId}`);
      // Relay answer to the participant
      io.to(`user_${session.participantId}`).emit('proctor:webrtc-answer', {
        sessionId, viewerId, sdp,
      });
      console.log(`[proctorEvents] Answer relayed to participant ${session.participantId}`);
    } catch (err) {
      logger.warn('webrtc-answer relay error', { err: err.message });
    }
  });

  // ── WebRTC signaling: ICE candidate relay (bidirectional) ──────────────
  socket.on('proctor:ice-candidate', async ({ sessionId, viewerId, candidate }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || !canViewSession(session)) return;
      const isOwner = session.participantId === socket.userId;
      // Trainers may only relay ICE candidates toward the participant;
      // participants may only relay toward a trainer.
      if (!isOwner && !['TRAINER', 'ADMIN'].includes(socket.userRole)) return;
      const targetUserId = isOwner ? viewerId : session.participantId;
      console.log(`[proctorEvents] ICE candidate relay from ${isOwner ? 'participant' : 'trainer'} ${socket.userId} to ${targetUserId}, session ${sessionId}`);
      io.to(`user_${targetUserId}`).emit('proctor:ice-candidate', {
        sessionId, viewerId, candidate,
      });
    } catch (err) {
      logger.warn('ice-candidate relay error', { err: err.message });
    }
  });

  // ── Stream available notification (participant → trainers) ─────────────
  socket.on('proctor:stream-available', async ({ sessionId }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || session.participantId !== socket.userId) return;
      if (session.status !== 'ACTIVE') return;

      console.log(`[proctorEvents] Stream available from participant ${socket.userId}, session ${sessionId}`);
      session.isScreenSharing = true;
      await session.save();

      // Record activity for screen sharing start
      await proctoring.recordActivity({
        session,
        eventType: 'SCREEN_SHARE_START',
        payload: { timestamp: new Date() }
      });

      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:stream-available', {
        sessionId,
      });
      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
        type: 'state',
        session: proctoring.buildClientView(session),
      });
    } catch (err) {
      logger.warn('stream-available error', { err: err.message });
    }
  });

  // ── Stream ended notification (participant → trainers) ─────────────────
  socket.on('proctor:stream-ended', async ({ sessionId }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session || session.participantId !== socket.userId) return;

      console.log(`[proctorEvents] Stream ended by participant ${socket.userId}, session ${sessionId}`);
      session.isScreenSharing = false;
      await session.save();

      // Record activity for screen sharing stop
      await proctoring.recordActivity({
        session,
        eventType: 'SCREEN_SHARE_STOP',
        payload: { timestamp: new Date() }
      });

      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:stream-ended', {
        sessionId,
      });
      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
        type: 'state',
        session: proctoring.buildClientView(session),
      });
    } catch (err) {
      logger.warn('stream-ended error', { err: err.message });
    }
  });

  // ── Trainer requests to observe a participant's stream ─────────────────
  socket.on('proctor:observe', async ({ sessionId }, ack) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session) return ack?.({ ok: false, error: 'not_found' });
      if (!canViewSession(session) || !['TRAINER', 'ADMIN'].includes(socket.userRole)) {
        return ack?.({ ok: false, error: 'forbidden' });
      }
      console.log(`[proctorEvents] Trainer ${socket.userId} observing session ${sessionId}`);
      // Tell the participant to create a WebRTC offer for this trainer
      io.to(`user_${session.participantId}`).emit('proctor:observe-request', {
        sessionId, viewerId: socket.userId,
      });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on('proctor:unobserve', async ({ sessionId }) => {
    try {
      const session = await ExamSession.findByPk(sessionId);
      if (!session) return;
      if (!canViewSession(session) || !['TRAINER', 'ADMIN'].includes(socket.userRole)) return;
      // Tell the participant to close the peer connection for this trainer
      io.to(`user_${session.participantId}`).emit('proctor:unobserve-request', {
        sessionId, viewerId: socket.userId,
      });
    } catch (err) {
      logger.warn('unobserve error', { err: err.message });
    }
  });

  // ── Trainer sends a warning message to participant ─────────────────────
  socket.on('proctor:trainerMessage', async ({ sessionId, message }, ack) => {
    try {
      if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) {
        return ack?.({ ok: false, error: 'forbidden' });
      }
      if (!message || !message.trim()) {
        return ack?.({ ok: false, error: 'message required' });
      }
      const session = await ExamSession.findByPk(sessionId);
      if (!session) return ack?.({ ok: false, error: 'not_found' });

      // Push warning to participant
      io.to(`user_${session.participantId}`).emit('proctor:trainerMessage', {
        message: message.trim(),
        from: socket.userName || 'Trainer',
        at: new Date(),
      });

      // Log as violation so it appears in the feed
      await proctoring.recordViolation({
        session,
        type: 'TRAINER_WARNING',
        message: message.trim(),
        metadata: { from: socket.userName || 'Trainer' },
      });

      // Notify trainers
      io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
        type: 'trainerMessage',
        session: proctoring.buildClientView(session),
      });

      ack?.({ ok: true });
    } catch (err) {
      logger.error('trainerMessage error', { err: err.message });
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── Disconnect: enter grace period instead of immediate offline ─────────
  socket.on('disconnect', async () => {
    const sid = socket.data?.activeSessionId;
    if (!sid) return;
    try {
      const session = await ExamSession.findByPk(sid);
      if (session && session.participantId === socket.userId && session.status === 'ACTIVE') {
        await proctoring.enterGracePeriod(session);

        // Notify trainers that an active screen share has dropped.
        if (session.isScreenSharing) {
          session.isScreenSharing = false;
          await session.save();
          // Record activity for screen sharing stop
          await proctoring.recordActivity({
            session,
            eventType: 'SCREEN_SHARE_STOP',
            payload: { reason: 'socket disconnected', timestamp: new Date() }
          });
          io.to(`proctor_quiz_${session.quizId}`).emit('proctor:stream-ended', {
            sessionId: session.id,
          });
        }

        // Record proctor activity for leave
        await proctoring.recordActivity({
          session,
          eventType: 'LEAVE',
          payload: { reason: 'socket disconnected' }
        });

        io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
          type: 'disconnected',
          session: proctoring.buildClientView(session),
        });
      }
    } catch (err) {
      logger.warn('proctor disconnect cleanup failed', { err: err.message });
    }
  });
};
