/**
 * Interview Socket Events
 * WebRTC signalling, room management, chat, code sync, and AI monitoring alerts.
 *
 * Events contract:
 *   Client → Server: join-room, leave-room, offer, answer, ice-candidate,
 *     screen-share, chat-message, device-status, interview-alert, code-sync,
 *     recording-status
 *   Server → Client: peer-joined, peer-left, offer, answer, ice-candidate,
 *     screen-share, chat-message, device-status, interview-alert, code-sync,
 *     recording-status
 */

const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const {
  Interview, InterviewSession, InterviewDevice, InterviewLog,
} = require('../models');
const tokenService = require('../services/interviewTokenService');
const aiMonitorService = require('../services/interviewAiMonitorService');
const logger = require('../utils/logger');

// In-memory room state: interviewId → { peers: Map<socketId, {userId, role, devices}> }
const rooms = new Map();

function getRoom(interviewId) {
  if (!rooms.has(interviewId)) {
    rooms.set(interviewId, { peers: new Map() });
  }
  return rooms.get(interviewId);
}

/**
 * Validate socket has permission to join this interview room.
 */
async function validateRoomAccess(socket, interviewId) {
  const userId = socket.userId;
  const role = socket.userRole;

  const interview = await Interview.findByPk(interviewId);
  if (!interview) return { allowed: false, error: 'Interview not found' };

  if (role === 'ADMIN') return { allowed: true, interview };
  if (interview.candidate_id === userId) return { allowed: true, interview };
  if (interview.interviewer_id === userId) return { allowed: true, interview };

  return { allowed: false, error: 'Not authorized for this interview' };
}

/**
 * Register interview socket events on a socket instance.
 */
function registerInterviewEvents(io, socket) {
  /**
   * join-room: Join an interview room for WebRTC signalling.
   */
  socket.on('join-room', async (data, callback) => {
    try {
      const { interviewId } = data;
      if (!interviewId) {
        if (callback) callback({ success: false, error: 'interviewId required' });
        return;
      }

      const { allowed, interview, error } = await validateRoomAccess(socket, interviewId);
      if (!allowed) {
        if (callback) callback({ success: false, error });
        return;
      }

      // Find or create session
      let session = await InterviewSession.findOne({
        where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (!session) {
        session = await InterviewSession.create({
          interview_id: interviewId,
          status: 'WAITING',
        });
      }

      const room = getRoom(interviewId);

      // Notify existing peers before adding new one
      for (const [peerSocketId, peerInfo] of room.peers) {
        if (peerSocketId !== socket.id) {
          io.to(peerSocketId).emit('peer-joined', {
            socketId: socket.id,
            userId: socket.userId,
            role: socket.userRole,
            userName: socket.userName,
          });
        }
      }

      // Add this socket to the room
      socket.join(`interview_${interviewId}`);
      room.peers.set(socket.id, {
        userId: socket.userId,
        role: socket.userRole,
        userName: socket.userName,
      });

      // Store interviewId on socket for cleanup
      socket.currentInterviewId = interviewId;

      // Send existing peers to the new joiner
      const existingPeers = [];
      for (const [peerSocketId, peerInfo] of room.peers) {
        if (peerSocketId !== socket.id) {
          existingPeers.push({
            socketId: peerSocketId,
            userId: peerInfo.userId,
            role: peerInfo.role,
            userName: peerInfo.userName,
          });
        }
      }

      // Log join event
      await InterviewLog.create({
        session_id: session.id,
        actor_id: socket.userId,
        event_type: 'SOCKET_JOINED',
        payload_json: { socketId: socket.id, role: socket.userRole },
      }).catch(() => {});

      if (callback) callback({
        success: true,
        sessionId: session.id,
        peers: existingPeers,
        interview: {
          id: interview.id,
          type: interview.type,
          scheduledAt: interview.scheduled_at,
          durationMinutes: interview.duration_minutes,
        },
      });
    } catch (error) {
      logger.error('Error in join-room', { error: error.message });
      if (callback) callback({ success: false, error: 'Server error' });
    }
  });

  /**
   * leave-room: Leave an interview room.
   */
  socket.on('leave-room', async (data) => {
    const { interviewId } = data || {};
    if (!interviewId) return;

    await handleLeaveRoom(io, socket, interviewId);
  });

  /**
   * WebRTC signalling: offer, answer, ice-candidate
   */
  socket.on('offer', (data) => {
    const { interviewId, targetSocketId, offer } = data;
    if (targetSocketId) {
      io.to(targetSocketId).emit('offer', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        offer,
      });
    }
  });

  socket.on('answer', (data) => {
    const { targetSocketId, answer } = data;
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        answer,
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetSocketId, candidate } = data;
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    }
  });

  /**
   * screen-share: Broadcast screen share start/stop to room.
   */
  socket.on('screen-share', (data) => {
    const { interviewId, sharing, metadata } = data;
    if (interviewId) {
      socket.to(`interview_${interviewId}`).emit('screen-share', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        sharing,
        metadata,
      });
    }
  });

  /**
   * chat-message: Broadcast chat to room.
   */
  socket.on('chat-message', async (data) => {
    const { interviewId, message, sessionId } = data;
    if (!interviewId || !message) return;

    // Persist to interview_logs
    if (sessionId) {
      await InterviewLog.create({
        session_id: sessionId,
        actor_id: socket.userId,
        event_type: 'CHAT_MESSAGE',
        payload_json: { message: message.substring(0, 500) },
      }).catch(() => {});
    }

    io.to(`interview_${interviewId}`).emit('chat-message', {
      fromSocketId: socket.id,
      fromUserId: socket.userId,
      fromUserName: socket.userName,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * device-status: Client reports device connection status change.
   */
  socket.on('device-status', async (data) => {
    const { interviewId, sessionId, deviceType, connected } = data;
    if (!interviewId) return;

    // Broadcast to room
    io.to(`interview_${interviewId}`).emit('device-status', {
      fromUserId: socket.userId,
      deviceType,
      connected,
      timestamp: new Date().toISOString(),
    });

    // Persist event
    if (sessionId) {
      await InterviewLog.create({
        session_id: sessionId,
        actor_id: socket.userId,
        event_type: connected ? 'DEVICE_CONNECTED' : 'DEVICE_DISCONNECTED',
        payload_json: { deviceType },
      }).catch(() => {});
    }
  });

  /**
   * interview-alert: Client-side AI monitoring alert.
   */
  socket.on('interview-alert', async (data) => {
    const { sessionId, alertType, severity, sourceDevice, message, metadata } = data;
    if (!sessionId || !alertType) return;

    const alert = await aiMonitorService.processAlert(sessionId, {
      alertType, severity, sourceDevice, message, metadata,
    }).catch(() => null);

    if (alert) {
      // Broadcast alert to interviewer (and admin if present)
      const room = getRoom(data.interviewId || socket.currentInterviewId);
      if (room) {
        for (const [peerSocketId, peerInfo] of room.peers) {
          if (peerInfo.role === 'TRAINER' || peerInfo.role === 'ADMIN') {
            io.to(peerSocketId).emit('interview-alert', {
              alertId: alert.id,
              alertType: alert.alert_type,
              severity: alert.severity,
              sourceDevice: alert.source_device,
              message: alert.message,
              ts: alert.ts,
            });
          }
        }
      }
    }
  });

  /**
   * code-sync: Shared code editor content broadcast.
   */
  socket.on('code-sync', (data) => {
    const { interviewId, content, language, cursor } = data;
    if (!interviewId) return;

    // Broadcast to all peers except sender (last-write-wins for MVP)
    socket.to(`interview_${interviewId}`).emit('code-sync', {
      fromUserId: socket.userId,
      content,
      language,
      cursor,
      timestamp: Date.now(),
    });
  });

  /**
   * recording-status: Broadcast recording state changes.
   */
  socket.on('recording-status', (data) => {
    const { interviewId, recording, deviceType } = data;
    if (!interviewId) return;

    io.to(`interview_${interviewId}`).emit('recording-status', {
      fromUserId: socket.userId,
      recording,
      deviceType,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * ICE restart request.
   */
  socket.on('ice-restart', (data) => {
    const { targetSocketId } = data;
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-restart', {
        fromSocketId: socket.id,
      });
    }
  });

  /**
   * Disconnect: clean up room state.
   */
  socket.on('disconnect', async () => {
    if (socket.currentInterviewId) {
      await handleLeaveRoom(io, socket, socket.currentInterviewId);
    }
    logger.info('Interview socket disconnected', { socketId: socket.id, userId: socket.userId });
  });
}

/**
 * Handle socket leaving a room (disconnect or explicit leave-room).
 */
async function handleLeaveRoom(io, socket, interviewId) {
  const room = rooms.get(interviewId);
  if (!room) return;

  room.peers.delete(socket.id);
  socket.leave(`interview_${interviewId}`);

  // Notify remaining peers
  for (const [peerSocketId] of room.peers) {
    io.to(peerSocketId).emit('peer-left', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
    });
  }

  // Mark device as disconnected
  try {
    const session = await InterviewSession.findOne({
      where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
    });
    if (session) {
      await InterviewDevice.update(
        { status: 'DISCONNECTED', disconnected_at: new Date() },
        {
          where: {
            session_id: session.id,
            user_id: socket.userId,
            status: 'CONNECTED',
          },
        }
      );

      await InterviewLog.create({
        session_id: session.id,
        actor_id: socket.userId,
        event_type: 'SOCKET_LEFT',
        payload_json: { socketId: socket.id },
      }).catch(() => {});
    }
  } catch (err) {
    logger.error('Error handling leave room cleanup', { error: err.message });
  }

  // Clean up empty rooms
  if (room.peers.size === 0) {
    rooms.delete(interviewId);
  }
}

module.exports = { registerInterviewEvents, rooms, getRoom };
