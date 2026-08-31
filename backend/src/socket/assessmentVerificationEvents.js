/**
 * Assessment Verification Socket Events
 * Real-time fast-path synchronization between laptop and mobile device for Quiz/Coding verification.
 * Includes WebRTC signaling (offer, answer, ICE candidates) and stream state tracking.
 */
const logger = require('../utils/logger');
const relay = require('./crossInstance');

module.exports = (io, socket) => {
  // Join verification session room
  socket.on('assessment_verif:join', async (data) => {
    const { sessionId, role } = data || {};
    if (!sessionId) return;

    socket.sessionId = sessionId;
    socket.verifRole = role || 'laptop';

    const roomName = `assessment_verif_${sessionId}`;
    socket.join(roomName);
    socket.join(`monitoring_room_${sessionId}`);
    logger.info(`[SocketIO] Socket ${socket.id} (${socket.verifRole}) joined ${roomName} and monitoring_room_${sessionId}`);

    try {
      if (socket.verifRole === 'mobile_camera') {
        // 1. Notify laptop peer that mobile joined
        relay.relayEmit(io, 'room', roomName, 'assessment_verif:mobile_joined', {
          sessionId,
          socketId: socket.id,
          timestamp: Date.now(),
        }, { excludingSocket: socket });
        relay.relayEmit(io, 'room', `monitoring_room_${sessionId}`, 'monitoring:mobile_joined', {
          sessionId,
          socketId: socket.id,
          timestamp: Date.now(),
        }, { excludingSocket: socket });

        // 2. Also notify the newly joined mobile about any existing laptop in the room
        const socketsInRoom = await io.in(roomName).fetchSockets();
        for (const s of socketsInRoom) {
          if (s.id !== socket.id && (s.verifRole === 'laptop' || s.monitoringRole === 'laptop')) {
            logger.info(`[SocketIO] Informing new mobile ${socket.id} of existing laptop ${s.id}`);
            socket.emit('assessment_verif:laptop_joined', {
              sessionId,
              socketId: s.id,
              timestamp: Date.now(),
            });
            socket.emit('monitoring:laptop_joined', {
              sessionId,
              socketId: s.id,
              timestamp: Date.now(),
            });
          }
        }
      } else if (socket.verifRole === 'laptop') {
        // 1. Notify mobile if already in the room
        relay.relayEmit(io, 'room', roomName, 'assessment_verif:laptop_joined', {
          sessionId,
          socketId: socket.id,
          timestamp: Date.now(),
        }, { excludingSocket: socket });
        relay.relayEmit(io, 'room', `monitoring_room_${sessionId}`, 'monitoring:laptop_joined', {
          sessionId,
          socketId: socket.id,
          timestamp: Date.now(),
        }, { excludingSocket: socket });

        // 2. Also notify the newly joined laptop about any existing mobile in the room
        const socketsInRoom = await io.in(roomName).fetchSockets();
        for (const s of socketsInRoom) {
          if (s.id !== socket.id && (s.verifRole === 'mobile_camera' || s.monitoringRole === 'mobile_camera')) {
            logger.info(`[SocketIO] Informing new laptop ${socket.id} of existing mobile ${s.id}`);
            socket.emit('assessment_verif:mobile_joined', {
              sessionId,
              socketId: s.id,
              timestamp: Date.now(),
            });
            socket.emit('monitoring:mobile_joined', {
              sessionId,
              socketId: s.id,
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (err) {
      logger.error('[SocketIO] Error in assessment_verif:join peer discovery:', { error: err.message });
    }
  });

  // WebRTC Signaling: SDP Offer
  socket.on('assessment_verif:offer', (data) => {
    const { sessionId, offer, targetSocketId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !offer) return;

    logger.info(`[SocketIO WebRTC] Forwarding OFFER from ${socket.id} to ${targetSocketId || `assessment_verif_${targetSessionId}`}`);
    if (targetSocketId) {
      relay.relayEmit(io, 'socket', targetSocketId, 'assessment_verif:offer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        offer,
      });
      relay.relayEmit(io, 'socket', targetSocketId, 'monitoring:offer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        offer,
      });
    } else {
      relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:offer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        offer,
      }, { excludingSocket: socket });
      relay.relayEmit(io, 'room', `monitoring_room_${targetSessionId}`, 'monitoring:offer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        offer,
      }, { excludingSocket: socket });
    }
  });

  // WebRTC Signaling: SDP Answer
  socket.on('assessment_verif:answer', (data) => {
    const { sessionId, answer, targetSocketId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !answer) return;

    logger.info(`[SocketIO WebRTC] Forwarding ANSWER from ${socket.id} to ${targetSocketId || `assessment_verif_${targetSessionId}`}`);
    if (targetSocketId) {
      relay.relayEmit(io, 'socket', targetSocketId, 'assessment_verif:answer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        answer,
      });
      relay.relayEmit(io, 'socket', targetSocketId, 'monitoring:answer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        answer,
      });
    } else {
      relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:answer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        answer,
      }, { excludingSocket: socket });
      relay.relayEmit(io, 'room', `monitoring_room_${targetSessionId}`, 'monitoring:answer', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        answer,
      }, { excludingSocket: socket });
    }
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('assessment_verif:ice-candidate', (data) => {
    const { sessionId, candidate, targetSocketId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !candidate) return;

    if (targetSocketId) {
      relay.relayEmit(io, 'socket', targetSocketId, 'assessment_verif:ice-candidate', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        candidate,
      });
      relay.relayEmit(io, 'socket', targetSocketId, 'monitoring:ice-candidate', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        candidate,
      });
    } else {
      relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:ice-candidate', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        candidate,
      }, { excludingSocket: socket });
      relay.relayEmit(io, 'room', `monitoring_room_${targetSessionId}`, 'monitoring:ice-candidate', {
        sessionId: targetSessionId,
        fromSocketId: socket.id,
        candidate,
      }, { excludingSocket: socket });
    }
  });

  // Fallback real-time video frame relay + YOLO Mobile Monitoring
  socket.on('assessment_verif:frame', async (data) => {
    const { sessionId, frame, participantId, moduleType = 'QUIZ' } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId || !frame) return;

    // Coalesce the legacy fallback relay (~2fps) to keep dashboards calm.
    const now = Date.now();
    if (now - (socket._lastAssessmentVerifFrameRelayAt || 0) < 500) return;
    socket._lastAssessmentVerifFrameRelayAt = now;

    socket.to(`assessment_verif_${targetSessionId}`).emit('assessment_verif:frame', {
      sessionId: targetSessionId,
      frame,
      timestamp: Date.now(),
    });
    socket.to(`monitoring_room_${targetSessionId}`).emit('monitoring:mobile_frame', {
      sessionId: targetSessionId,
      frame,
      timestamp: Date.now(),
    });

    // Run YOLO inference asynchronously on mobile camera frame
    try {
      const yoloService = require('../services/yoloProctoringService');
      const resolvedParticipantId = participantId || socket.userId || 1;
      const res = await yoloService.analyzeFrame({
        frame,
        sessionId: targetSessionId,
        participantId: resolvedParticipantId,
        moduleType,
        cameraSource: 'MOBILE_CAMERA',
      });

      if (res?.success && res.proctoring_event?.shouldBroadcast) {
        yoloService.broadcastEvent(io, res.proctoring_event);
        relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:yolo_detection', {
          event: res.proctoring_event,
          detections: res.detections,
        });
        relay.relayEmit(io, 'room', `monitoring_room_${targetSessionId}`, 'monitoring:mobile_composition', {
          sessionId: targetSessionId,
          compositionState: res.composition_state,
          userMessage: res.user_message,
          event: res.proctoring_event,
          detections: res.detections,
        });
      }
    } catch (e) {
      logger.debug('[assessment_verif:frame] YOLO error:', e.message);
    }
  });

  // Mobile camera stream status update
  socket.on('assessment_verif:stream_status', (data) => {
    const { sessionId, streaming, quality } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId) return;

    relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:stream_status', {
      sessionId: targetSessionId,
      streaming: !!streaming,
      quality: quality || 'good',
      timestamp: Date.now(),
    }, { excludingSocket: socket });
    relay.relayEmit(io, 'room', `monitoring_room_${targetSessionId}`, 'monitoring:stream_status', {
      sessionId: targetSessionId,
      streaming: !!streaming,
      quality: quality || 'good',
      timestamp: Date.now(),
    }, { excludingSocket: socket });
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

    relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:mobile_status', {
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

    relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:laptop_status', {
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

    relay.relayEmit(io, 'room', `assessment_verif_${sessionId}`, 'assessment_verif:unlocked', {
      sessionId,
      status: 'VERIFIED',
      timestamp: Date.now(),
    });
  });

  // Assessment started on laptop -> notify mobile to transition to in-progress
  socket.on('assessment_verif:start_assessment', (data) => {
    const { sessionId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId) return;

    relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:assessment_started', {
      sessionId: targetSessionId,
      status: 'IN_PROGRESS',
      timestamp: Date.now(),
    });
  });

  // Assessment session ended / submitted trigger -> close mobile camera
  socket.on('assessment_verif:end', (data) => {
    const { sessionId } = data || {};
    const targetSessionId = sessionId || socket.sessionId;
    if (!targetSessionId) return;

    logger.info(`[SocketIO] Assessment session ended for ${targetSessionId}`);
    relay.relayEmit(io, 'room', `assessment_verif_${targetSessionId}`, 'assessment_verif:session_ended', {
      sessionId: targetSessionId,
      status: 'COMPLETED',
      reason: 'ASSESSMENT_COMPLETED',
      timestamp: Date.now(),
    });
    relay.relayEmit(io, 'room', `monitoring_room_${targetSessionId}`, 'monitoring:session_ended', {
      sessionId: targetSessionId,
      status: 'COMPLETED',
      reason: 'ASSESSMENT_COMPLETED',
      timestamp: Date.now(),
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (socket.sessionId && socket.verifRole === 'mobile_camera') {
      relay.relayEmit(io, 'room', `assessment_verif_${socket.sessionId}`, 'assessment_verif:mobile_status', {
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

