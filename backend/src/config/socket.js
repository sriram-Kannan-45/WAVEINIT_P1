/**
 * Socket.IO Configuration with Redis Adapter
 * Enables real-time communication and multi-instance scaling
 */

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
let redis = null;
let createAdapter = null;
// The socket.io-redis-adapter is an OPTIONAL dependency. When it isn't
// installed (or Redis isn't configured) we fall back to the DB-outbox relay
// in crossInstance.js so the backend always starts and cross-instance emits work.
try {
  redis = require('redis');
  ({ createAdapter } = require('@socket.io/redis-adapter'));
} catch (e) {
  redis = null;
  createAdapter = null;
}
const { User } = require('../models');
const tokenService = require('../services/interviewTokenService');
const crossInstance = require('../socket/crossInstance');
const logger = require('../utils/logger');

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {Object} Socket.IO instance
 */
let ioInstance = null;

const initializeSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 15,
  });

  // Middleware: Authenticate connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Standard JWT auth
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('[Socket.IO] JWT_SECRET not set — rejecting connection');
        return next(new Error('Server configuration error'));
      }
      const decoded = jwt.verify(token, secret);
      const userId = decoded.id || decoded.userId;

      // Mobile pairing sockets authenticate with a short-lived socket token that
      // embeds the one-time pairing token. Re-validate the pairing token is still
      // PENDING + unexpired; it is consumed when the device joins its room.
      if (decoded.deviceType === 'MOBILE') {
        const result = await tokenService.validatePairingToken(decoded.pairingToken);
        if (!result.success) {
          logger.warn('Mobile socket pairing rejected', { userId, message: result.message });
          return next(new Error(`Pairing error: ${result.message}`));
        }
        socket.userId = userId;
        socket.userRole = 'PARTICIPANT';
        socket.userName = decoded.candidateName || 'Candidate Mobile';
        socket.deviceType = 'MOBILE';
        socket.pairingToken = decoded.pairingToken;
        socket.sessionId = decoded.sessionId || result.device.session_id;
        socket.currentInterviewId = decoded.interviewId || null;
        logger.info('Mobile socket connected', { userId, sessionId: socket.sessionId });
        return next();
      }

      // Assessment verification mobile camera socket (Quiz / Coding)
      if (decoded.role === 'mobile_camera' && decoded.sessionId) {
        await require('../services/assessmentVerificationService').authorizeSocket({
          sessionId: decoded.sessionId, participantId: decoded.participantId, token: decoded.token, mobile: true,
        });
        socket.assessmentMobileClaims = decoded;
        socket.userId = decoded.participantId || 0;
        socket.userRole = 'PARTICIPANT';
        socket.userName = 'Assessment Mobile Camera';
        socket.sessionId = decoded.sessionId;
        socket.verifRole = 'mobile_camera';
        logger.info('Assessment verification mobile camera connected', { sessionId: socket.sessionId });
        return next();
      }

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
    if (socket.assessmentMobileClaims) {
      // A QR camera credential grants only its assessment camera transport.
      require('../socket/assessmentVerificationEvents')(io, socket);
      return;
    }
    if (socket.deviceType === 'MOBILE' && socket.pairingToken) {
      require('../socket/interviewEvents').registerInterviewEvents(io,socket);
      return;
    }
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
    // Register unified monitoring engine events
    require('../socket/events/monitoringEvents')(io, socket);
    // Register legacy proctoring events
    require('../socket/events/proctorEvents')(io, socket);
    // Register parallel monitor system events
    require('../socket/events/monitorEvents')(io, socket);
    // Register coding assessment events
    require('../socket/codingEvents')(io, socket);
    // Register assessment verification events (Quiz & Coding QR pairing)
    require('../socket/assessmentVerificationEvents')(io, socket);
    // Register interview module events (WebRTC signalling, room management)
    const { registerInterviewEvents } = require('../socket/interviewEvents');
    registerInterviewEvents(io, socket);
  });

  ioInstance = io;
  return io;
};

/**
 * Setup Redis adapter for Socket.IO (multi-instance scaling)
 * @param {Object} io - Socket.IO instance
 * @returns {Promise<void>}
 */
const setupRedisAdapter = async (io) => {
  const redisUrl = process.env.REDIS_URL;
  // Without the optional package AND a configured Redis URL, the DB-outbox
  // relay (crossInstance) handles cross-instance emits.
  if (!redis || !createAdapter) {
    crossInstance.setAdapterMode('relay');
    logger.info('[Socket.IO] redis-adapter not available; using DB-outbox relay for cross-instance emits');
    return;
  }
  if (!redisUrl || !redisUrl.trim()) {
    crossInstance.setAdapterMode('relay');
    logger.info('[Socket.IO] No REDIS_URL configured; using DB-outbox relay for cross-instance emits');
    return;
  }
  try {
    const pubClient = redis.createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => logger.warn('[Socket.IO Redis Adapter Pub Error]', { error: err.message }));
    subClient.on('error', (err) => logger.warn('[Socket.IO Redis Adapter Sub Error]', { error: err.message }));

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    io.redisClients = { pubClient, subClient };
    crossInstance.setAdapterMode('redis');
    logger.info('🚀 Socket.IO Redis adapter connected — cluster real-time synchronization active');
  } catch (error) {
    crossInstance.setAdapterMode('relay');
    logger.warn('Failed to setup Redis adapter for Socket.IO, falling back to DB-outbox relay', { error: error.message });
  }
};

/**
 * Emit event to specific user (works cross-instance through relay when no Redis)
 * @param {Object} io - Socket.IO instance
 * @param {string|number} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToUser = (io, userId, event, data) => {
  return crossInstance.relayEmit(io, 'user-room', userId, event, data);
};

/**
 * Emit event to users with specific role
 * @param {Object} io - Socket.IO instance
 * @param {string} role - User role (ADMIN, TRAINER, PARTICIPANT)
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToRole = (io, role, event, data) => {
  return crossInstance.relayEmit(io, 'room', `role_${role}`, event, data);
};

/**
 * Broadcast event to all connected clients
 * @param {Object} io - Socket.IO instance
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const broadcastEvent = (io, event, data) => {
  return crossInstance.relayEmit(io, 'broadcast', '*', event, data);
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
  getIO: () => ioInstance,
  setupRedisAdapter,
  emitToUser,
  emitToRole,
  broadcastEvent,
  cleanupSocket,
};
