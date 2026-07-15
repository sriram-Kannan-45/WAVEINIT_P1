const { LiveSession, Attendance, ChatMessage, User } = require('../../models');
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
      socket.to(`room_${roomId}`).emit('user-joined', { userId, socketId: socket.id });
      
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
    io.to(payload.target).emit('offer', payload);
  });

  socket.on('answer', (payload) => {
    io.to(payload.target).emit('answer', payload);
  });

  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', payload);
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
      io.to(`room_${roomId}`).emit('receive-message', fullMessage);
    } catch (error) {
      logger.error('Error sending message', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('typing', ({ roomId, userId, userName }) => {
    socket.to(`room_${roomId}`).emit('user-typing', { userId, userName });
  });

  socket.on('stop-typing', ({ roomId, userId }) => {
    socket.to(`room_${roomId}`).emit('user-stop-typing', { userId });
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

    socket.to(`room_${roomId}`).emit('user-left', { userId, socketId: socket.id });
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
    io.to('role_ADMIN').emit('dashboard-update', {
      totalActiveUsers,
      activeSessionsCount,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error updating dashboard stats', error);
  }
}
