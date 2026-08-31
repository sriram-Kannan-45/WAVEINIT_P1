const { LiveSession, Attendance, ChatMessage, User } = require('../../models');
const relay = require('../crossInstance');
const logger = require('../../utils/logger');

// Store active users per room for analytics
const activeRooms = new Map();

module.exports = (io, socket) => {
  // === 1. LIVE SESSION & WEBRTC EVENTS ===

  socket.on('join-session', async ({ roomId, userId }) => {
    try {
      socket.join(`room_${roomId}`);
      
      // Keep track of active users in memory
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, new Set());
      }
      activeRooms.get(roomId).add(userId);

      // Record attendance in DB
      const session = await LiveSession.findOne({ where: { roomId } });
      if (session) {
        await Attendance.create({
          userId,
          sessionId: session.id,
          joinTime: new Date()
        });
      }

      // Notify others
      relay.relayEmit(io, 'room', `room_${roomId}`, 'user-joined', { userId, socketId: socket.id }, { excludingSocket: socket });
      
      // Send current participants to the new user
      const participants = Array.from(activeRooms.get(roomId));
      socket.emit('room-participants', { participants });

      logger.info(`User ${userId} joined room ${roomId}`);
      
      // Trigger dashboard update
      updateDashboardStats(io);
    } catch (error) {
      logger.error('Error joining session', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  });

  socket.on('leave-session', async ({ roomId, userId }) => {
    handleUserLeave(io, socket, roomId, userId);
  });

  // WebRTC Signaling
  socket.on('offer', (payload) => {
    relay.relayEmit(io, 'socket', payload.target, 'offer', payload);
  });

  socket.on('answer', (payload) => {
    relay.relayEmit(io, 'socket', payload.target, 'answer', payload);
  });

  socket.on('ice-candidate', (payload) => {
    relay.relayEmit(io, 'socket', payload.target, 'ice-candidate', payload);
  });

  // === 2. REAL-TIME CHAT EVENTS ===

  socket.on('send-message', async (data) => {
    try {
      const { roomId, senderId, content } = data;
      
      // Save to DB
      const message = await ChatMessage.create({
        roomId,
        senderId,
        content
      });

      // Fetch with user info
      const fullMessage = await ChatMessage.findByPk(message.id, {
        include: [{ model: User, as: 'sender', attributes: ['id', 'name'] }]
      });

      // Broadcast to room
      relay.relayEmit(io, 'room', `room_${roomId}`, 'receive-message', fullMessage);
    } catch (error) {
      logger.error('Error sending message', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('typing', ({ roomId, userId, userName }) => {
    relay.relayEmit(io, 'room', `room_${roomId}`, 'user-typing', { userId, userName }, { excludingSocket: socket });
  });

  socket.on('stop-typing', ({ roomId, userId }) => {
    relay.relayEmit(io, 'room', `room_${roomId}`, 'user-stop-typing', { userId }, { excludingSocket: socket });
  });

  // Handle sudden disconnects
  socket.on('disconnect', () => {
    // Find rooms this socket was in and clean up
    // In a full implementation, you'd map socket.id to userId/roomId
    logger.info(`Socket disconnected: ${socket.id}`);
  });
};

async function handleUserLeave(io, socket, roomId, userId) {
  try {
    socket.leave(`room_${roomId}`);
    
    if (activeRooms.has(roomId)) {
      activeRooms.get(roomId).delete(userId);
    }

    // Update attendance DB
    const session = await LiveSession.findOne({ where: { roomId } });
    if (session) {
      const attendance = await Attendance.findOne({
        where: { userId, sessionId: session.id, leaveTime: null },
        order: [['joinTime', 'DESC']]
      });

      if (attendance) {
        const leaveTime = new Date();
        const durationSeconds = Math.round((leaveTime - attendance.joinTime) / 1000);
        await attendance.update({ leaveTime, durationSeconds });
      }
    }

    relay.relayEmit(io, 'room', `room_${roomId}`, 'user-left', { userId, socketId: socket.id });
    logger.info(`User ${userId} left room ${roomId}`);
    
    updateDashboardStats(io);
  } catch (error) {
    logger.error('Error handling user leave', error);
  }
}

// === 3. LIVE DASHBOARD ANALYTICS ===

async function updateDashboardStats(io) {
  try {
    // Calculate total active users across all live rooms
    let totalActiveUsers = 0;
    for (const users of activeRooms.values()) {
      totalActiveUsers += users.size;
    }

    // You could calculate other stats here (completion %, etc)
    const activeSessionsCount = activeRooms.size;

    // Broadcast to admins
    relay.relayEmit(io, 'room', 'role_ADMIN', 'dashboard-update', {
      totalActiveUsers,
      activeSessionsCount,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error updating dashboard stats', error);
  }
}
