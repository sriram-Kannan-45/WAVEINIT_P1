const interviewService = require('../../services/interviewService');
const { InterviewChatMessage } = require('../../models');
const logger = require('../../utils/logger');

module.exports = function registerInterviewEvents(io, socket) {
  const activeInterviewRooms = new Map();

  // Join interview room
  socket.on('interview:join', async ({ interviewId, userId, userName, role }) => {
    try {
      const roomName = `interview_${interviewId}`;
      socket.join(roomName);
      socket.join(`interview_user_${userId}`);
      socket.data.interviewId = interviewId;
      socket.data.userId = userId;
      socket.data.role = role;

      if (!activeInterviewRooms.has(interviewId)) {
        activeInterviewRooms.set(interviewId, new Map());
      }
      activeInterviewRooms.get(interviewId).set(userId, {
        socketId: socket.id,
        userId,
        userName,
        role,
        joinedAt: new Date(),
        isMicOn: true,
        isCamOn: true,
        isScreenSharing: false,
        isMobileConnected: false,
      });

      const participants = Array.from(activeInterviewRooms.get(interviewId).values());
      
      // Notify others
      socket.to(roomName).emit('interview:user-joined', {
        userId, userName, role, socketId: socket.id,
      });

      // Send current participants to the joiner
      socket.emit('interview:room-state', { participants, interviewId });

      logger.info(`User ${userId} joined interview room ${interviewId}`);
    } catch (error) {
      logger.error('interview:join error', { error: error.message });
      socket.emit('interview:error', { message: 'Failed to join interview room' });
    }
  });

  // Leave interview room
  socket.on('interview:leave', async ({ interviewId, userId }) => {
    try {
      const roomName = `interview_${interviewId}`;
      socket.leave(roomName);
      socket.leave(`interview_user_${userId}`);

      if (activeInterviewRooms.has(interviewId)) {
        activeInterviewRooms.get(interviewId).delete(userId);
      }

      socket.to(roomName).emit('interview:user-left', { userId, socketId: socket.id });
      logger.info(`User ${userId} left interview room ${interviewId}`);
    } catch (error) {
      logger.error('interview:leave error', { error: error.message });
    }
  });

  // WebRTC SDP offer
  socket.on('interview:offer', ({ interviewId, target, sdp, from }) => {
    io.to(`interview_user_${target}`).emit('interview:offer', {
      interviewId, sdp, from, socketId: socket.id,
    });
  });

  // WebRTC SDP answer
  socket.on('interview:answer', ({ interviewId, target, sdp, from }) => {
    io.to(`interview_user_${target}`).emit('interview:answer', {
      interviewId, sdp, from, socketId: socket.id,
    });
  });

  // ICE candidate relay
  socket.on('interview:ice-candidate', ({ interviewId, target, candidate, from }) => {
    io.to(`interview_user_${target}`).emit('interview:ice-candidate', {
      interviewId, candidate, from, socketId: socket.id,
    });
  });

  // Screen share status
  socket.on('interview:screen-share', ({ interviewId, userId, isSharing }) => {
    if (activeInterviewRooms.has(interviewId)) {
      const participant = activeInterviewRooms.get(interviewId).get(userId);
      if (participant) participant.isScreenSharing = isSharing;
    }
    socket.to(`interview_${interviewId}`).emit('interview:screen-share-status', {
      userId, isSharing,
    });
    interviewService.logActivity(interviewId, userId, isSharing ? 'SCREEN_SHARE_STARTED' : 'SCREEN_SHARE_STOPPED', {});
  });

  // Mobile camera connect/disconnect
  socket.on('interview:mobile-camera', ({ interviewId, userId, action, deviceToken }) => {
    if (activeInterviewRooms.has(interviewId)) {
      const participant = activeInterviewRooms.get(interviewId).get(userId);
      if (participant) participant.isMobileConnected = action === 'connect';
    }
    socket.to(`interview_${interviewId}`).emit('interview:mobile-status', {
      userId, action, deviceToken,
    });
    interviewService.logActivity(interviewId, userId,
      action === 'connect' ? 'MOBILE_CAMERA_CONNECTED' : 'MOBILE_CAMERA_DISCONNECTED',
      { deviceToken }
    );
  });

  // Chat message
  socket.on('interview:chat-send', async ({ interviewId, senderId, content }) => {
    try {
      const message = await InterviewChatMessage.create({
        interviewId, senderId, content,
      });
      io.to(`interview_${interviewId}`).emit('interview:chat-message', {
        id: message.id,
        interviewId,
        senderId,
        content,
        createdAt: message.createdAt,
      });
    } catch (error) {
      logger.error('interview:chat-send error', { error: error.message });
    }
  });

  // Chat typing indicator
  socket.on('interview:chat-typing', ({ interviewId, userId, userName }) => {
    socket.to(`interview_${interviewId}`).emit('interview:chat-typing', {
      userId, userName,
    });
  });

  // Whiteboard sync
  socket.on('interview:whiteboard', ({ interviewId, userId, action, data }) => {
    socket.to(`interview_${interviewId}`).emit('interview:whiteboard-data', {
      userId, action, data,
    });
  });

  // Raise hand
  socket.on('interview:raise-hand', ({ interviewId, userId, userName }) => {
    io.to(`interview_${interviewId}`).emit('interview:hand-raised', {
      userId, userName,
    });
  });

  // Violation report
  socket.on('interview:violation', ({ interviewId, userId, type, message, metadata }) => {
    socket.to(`interview_${interviewId}`).emit('interview:violation-alert', {
      userId, type, message, metadata, timestamp: new Date(),
    });
    interviewService.logActivity(interviewId, userId, 'VIOLATION_DETECTED', { type, message, ...metadata });
  });

  // Heartbeat
  socket.on('interview:heartbeat', ({ interviewId, userId }) => {
    if (activeInterviewRooms.has(interviewId)) {
      const participant = activeInterviewRooms.get(interviewId).get(userId);
      if (participant) participant.lastHeartbeat = new Date();
    }
  });

  // Force terminate (trainer only)
  socket.on('interview:force-terminate', ({ interviewId, targetUserId, reason }) => {
    if (socket.data.role === 'TRAINER' || socket.data.role === 'ADMIN') {
      io.to(`interview_user_${targetUserId}`).emit('interview:terminated', {
        interviewId, reason,
      });
      interviewService.logActivity(interviewId, socket.data.userId, 'FORCE_TERMINATED', {
        targetUserId, reason,
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const interviewId = socket.data.interviewId;
    const userId = socket.data.userId;
    if (interviewId && userId && activeInterviewRooms.has(interviewId)) {
      activeInterviewRooms.get(interviewId).delete(userId);
      socket.to(`interview_${interviewId}`).emit('interview:user-left', {
        userId, socketId: socket.id,
      });
    }
  });
};
