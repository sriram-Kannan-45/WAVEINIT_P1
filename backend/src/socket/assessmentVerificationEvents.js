/**
 * Assessment Verification Socket Events
 * Real-time fast-path synchronization between laptop and mobile device for Quiz/Coding verification.
 * Includes WebRTC signaling (offer, answer, ICE candidates) and stream state tracking.
 */
const logger = require('../utils/logger');

module.exports = (io, socket) => {
  // Join verification session room
  socket.on('assessment_verif:join', (data) => {
    const { sessionId, role } = data || {};
    if (!sessionId) return;

    socket.sessionId = sessionId;
    socket.verifRole = role || 'laptop';

    socket.join(`assessment_verif_${sessionId}`);
    logger.info(`Socket ${socket.id} (${socket.verifRole}) joined assessment_verif_${sessionId}`);

    // If mobile joined, notify laptop peer
    if (socket.verifRole === 'mobile_camera') {
      socket.to(`assessment_verif_${sessionId}`).emit('assessment_verif:mobile_joined', {
        sessionId,
        socketId: socket.id,
        timestamp: Date.now(),
      });
    } else if (socket.verifRole === 'laptop') {
      socket.to(`assessment_verif_${sessionId}`).emit('assessment_verif:laptop_joined', {
        sessionId,
        socketId: socket.id,
        timestamp: Date.now(),
      });
    }
  });

  // WebRTC Signaling: SDP Offer
  socket.on('assessment_verif:offer', (data) => {
    const { sessionId, offer, targetSocketId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !offer) return;

    if (targetSocketId) {
      io.to(targetSocketId).emit('assessment_verif:offer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        offer,
      });
    } else {
      socket.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:offer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        offer,
      });
    }
  });

  // WebRTC Signaling: SDP Answer
  socket.on('assessment_verif:answer', (data) => {
    const { sessionId, answer, targetSocketId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !answer) return;

    if (targetSocketId) {
      io.to(targetSocketId).emit('assessment_verif:answer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        answer,
      });
    } else {
      socket.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:answer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        answer,
      });
    }
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('assessment_verif:ice-candidate', (data) => {
    const { sessionId, candidate, targetSocketId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !candidate) return;

    if (targetSocketId) {
      io.to(targetSocketId).emit('assessment_verif:ice-candidate', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        candidate,
      });
    } else {
      socket.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:ice-candidate', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        candidate,
      });
    }
  });

  // Fallback real-time video frame relay
  socket.on('assessment_verif:frame', (data) => {
    const { sessionId, frame } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !frame) return;

    socket.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:frame', {
      sessionId: targetSessionId,
      frame,
      timestamp: Date.now(),
    });
  });

  // Mobile camera stream status update
  socket.on('assessment_verif:stream_status', (data) => {
    const { sessionId, streaming, quality } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId) return;

    socket.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:stream_status', {
      sessionId: targetSessionId,
      streaming: !!streaming,
      quality: quality || 'good',
      timestamp: Date.now(),
    });
  });

  // Mobile camera is live and streaming/ready
  socket.on('assessment_verif:mobile_ready', async (data) => {
    const { sessionId, token } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId && !token) return;

    try {
      const { AssessmentVerificationSession } = require('../models');
      const where = token ? { token } : { session_id: targetSessionId };
      const session = await AssessmentVerificationSession.findOne({ where });
      if (session) {
        await session.update({
          mobile_verified: true,
          status: 'VERIFIED',
        });
      }
    } catch (e) {
      logger.error('Error updating mobile_verified on socket ready', { error: e.message });
    }

    io.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:mobile_status', {
      sessionId: targetSessionId,
      connected: false,
      mobileReady: true,
      timestamp: Date.now(),
    });
    logger.info(`Assessment verification mobile ready for session ${targetSessionId}`);
  });

  // Laptop camera is live and verified
  socket.on('assessment_verif:laptop_ready', async (data) => {
    const { sessionId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId) return;

    try {
      const { AssessmentVerificationSession } = require('../models');
      const session = await AssessmentVerificationSession.findOne({ where: { session_id: targetSessionId } });
      if (session) {
        await session.update({
          laptop_verified: true,
          ...(session.mobile_verified ? { status: 'VERIFIED' } : {}),
        });
      }
    } catch (e) {
      logger.error('Error updating laptop_verified on socket ready', { error: e.message });
    }

    io.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:laptop_status', {
      sessionId: targetSessionId,
      connected: true,
      laptopVerified: true,
      timestamp: Date.now(),
    });
  });

  // Complete verification trigger
  socket.on('assessment_verif:complete', (data) => {
    const { sessionId } = data || {};
    if (!sessionId) return;

    io.to(`assessment_verif_${sessionId}`).emit('assessment_verif:unlocked', {
      sessionId,
      status: 'VERIFIED',
      timestamp: Date.now(),
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (socket.sessionId && socket.verifRole === 'mobile_camera') {
      io.to(`assessment_verif_${socket.sessionId}`).emit('assessment_verif:mobile_status', {
        sessionId: socket.sessionId,
        connected: false,
        mobileVerified: false,
        isFullyVerified: false,
        timestamp: Date.now(),
      });
      logger.warn(`Assessment verification mobile camera disconnected for session ${socket.sessionId}`);
    }
  });
};

