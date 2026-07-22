/**
 * Socket.IO Configuration with Redis Adapter
 * Enables real-time communication and multi-instance scaling
 */

const socketIO = require('socket.io');
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {Object} Socket.IO instance
 */
const initializeSocket = (server) => {
  const allowedSocketOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
  ].filter(Boolean);

  const io = socketIO(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedSocketOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Socket.IO CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  // Middleware: Authenticate connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
      const userId = decoded.id || decoded.userId;
      const user = await User.findByPk(userId);

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = userId;
      socket.userRole = user.role;
      socket.userName = user.name;

      logger.info('Socket connected', { userId: socket.userId, role: socket.userRole });
      next();
    } catch (error) {
      logger.error('Socket authentication failed', { error: error.message });
      next(new Error('Authentication error'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('New socket connection', {
      socketId: socket.id,
      userId: socket.userId,
      role: socket.userRole,
    });

    // Join user-specific room
    socket.join(`user_${socket.userId}`);
    logger.debug('Joined user room', { room: `user_${socket.userId}` });

    // Join role-specific room
    socket.join(`role_${socket.userRole}`);
    logger.debug('Joined role room', { room: `role_${socket.userRole}` });

    // Emit connection success
    console.log('[Socket] Connected:', { socketId: socket.id, userId: socket.userId, role: socket.userRole });
    socket.emit('connected', {
      socketId: socket.id,
      userId: socket.userId,
      message: 'Connected to real-time server',
    });

    // Notify others that user is online
    io.emit('user:online', {
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date(),
    });

    // Handle mark notification as read
    socket.on('notification:markRead', async (data, callback) => {
      try {
        const { notificationId } = data;
        // This will be handled by the notification controller
        socket.emit('notification:readAck', { notificationId });
        if (callback) callback({ success: true });
      } catch (error) {
        logger.error('Error handling notification:markRead', {
          error: error.message,
        });
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle activity filter subscription
    socket.on('activity:subscribe', (data) => {
      const { filter } = data;
      socket.join(`activity_${filter}`);
      logger.debug('Subscribed to activity filter', { userId: socket.userId, filter });
    });

    // Handle activity filter unsubscribe
    socket.on('activity:unsubscribe', (data) => {
      const { filter } = data;
      socket.leave(`activity_${filter}`);
      logger.debug('Unsubscribed from activity filter', {
        userId: socket.userId,
        filter,
      });
    });

    // Handle analytics dashboard subscription
    socket.on('analytics:subscribe', (data) => {
      // Only admins can subscribe to analytics
      if (socket.userRole === 'ADMIN') {
        socket.join('analytics_dashboard');
        logger.debug('Admin subscribed to analytics', { userId: socket.userId });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('Socket disconnected', {
        socketId: socket.id,
        userId: socket.userId,
      });

      // Notify others that user is offline
      io.emit('user:offline', {
        userId: socket.userId,
        timestamp: new Date(),
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', { socketId: socket.id, error: error.message });
    });

    // Register live session and chat events
    require('../socket/events/liveEvents')(io, socket);
    // Register leaderboard subscription events
    require('../socket/events/leaderboardEvents')(io, socket);
    // Register proctoring events
    require('../socket/events/proctorEvents')(io, socket);
    // Register parallel monitor system events
    require('../socket/events/monitorEvents')(io, socket);
    // Register coding assessment events
    require('../socket/codingEvents')(io, socket);
    // Register interview management events
    require('../socket/events/interviewEvents')(io, socket);
  });

  return io;
};

/**
 * Setup Redis adapter for Socket.IO (multi-instance scaling)
 * @param {Object} io - Socket.IO instance
 * @returns {Promise<void>}
 */
const setupRedisAdapter = async (io) => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Create Redis clients
    const pubClient = redis.createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    // Connect clients
    await Promise.all([pubClient.connect(), subClient.connect()]);

    // Attach Redis adapter to Socket.IO
    io.adapter(createAdapter(pubClient, subClient));

    logger.info('Redis adapter attached to Socket.IO', { redisUrl });

    // Store clients for later cleanup
    io.redisClients = { pubClient, subClient };

    return io;
  } catch (error) {
    logger.error('Failed to setup Redis adapter', { error: error.message });
    throw error;
  }
};

/**
 * Emit event to specific user
 * @param {Object} io - Socket.IO instance
 * @param {number} userId - Target user ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToUser = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, data);
};

/**
 * Emit event to role
 * @param {Object} io - Socket.IO instance
 * @param {string} role - Target role
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToRole = (io, role, event, data) => {
  io.to(`role_${role}`).emit(event, data);
};

/**
 * Broadcast event to all connected clients
 * @param {Object} io - Socket.IO instance
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const broadcastEvent = (io, event, data) => {
  io.emit(event, data);
};

/**
 * Cleanup Socket.IO resources
 * @param {Object} io - Socket.IO instance
 * @returns {Promise<void>}
 */
const cleanupSocket = async (io) => {
  try {
    if (io.redisClients) {
      await io.redisClients.pubClient.disconnect();
      await io.redisClients.subClient.disconnect();
      logger.info('Redis clients disconnected');
    }
    io.close();
    logger.info('Socket.IO server closed');
  } catch (error) {
    logger.error('Error during Socket.IO cleanup', { error: error.message });
  }
};

module.exports = {
  initializeSocket,
  setupRedisAdapter,
  emitToUser,
  emitToRole,
  broadcastEvent,
  cleanupSocket,
};
