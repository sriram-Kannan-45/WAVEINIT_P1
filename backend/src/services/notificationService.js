/**
 * Centralized NotificationService
 * Single source of truth for creating, resolving, persisting, and delivering
 * real-time, role-aware notifications across the entire WAVE INIT LMS.
 */

const { Notification, User, Enrollment } = require('../models');
const logger = require('../utils/logger');
const relay = require('../socket/crossInstance');

function resolveIO(io) {
  if (io) return io;
  try {
    const { getIO } = require('../config/socket');
    return getIO ? getIO() : null;
  } catch (_) {
    return null;
  }
}

class NotificationService {
  /**
   * Notification Category and Type Constants
   */
  static CATEGORIES = {
    CHAT: 'CHAT',
    ASSESSMENT: 'ASSESSMENT',
    AI: 'AI',
    INTERVIEW: 'INTERVIEW',
    COURSE: 'COURSE',
    ATTENDANCE: 'ATTENDANCE',
    CERTIFICATE: 'CERTIFICATE',
    ANNOUNCEMENT: 'ANNOUNCEMENT',
    SYSTEM: 'SYSTEM',
  };

  static TYPES = {
    NEW_MESSAGE: 'NEW_MESSAGE',
    ASSESSMENT_CREATED: 'ASSESSMENT_CREATED',
    ASSESSMENT_ASSIGNED: 'ASSESSMENT_ASSIGNED',
    ASSESSMENT_DUE_REMINDER: 'ASSESSMENT_DUE_REMINDER',
    ASSESSMENT_SUBMITTED: 'ASSESSMENT_SUBMITTED',
    ASSESSMENT_GRADED: 'ASSESSMENT_GRADED',
    AI_GENERATION_COMPLETED: 'AI_GENERATION_COMPLETED',
    AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
    INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
    INTERVIEW_UPDATED: 'INTERVIEW_UPDATED',
    INTERVIEW_CANCELLED: 'INTERVIEW_CANCELLED',
    INTERVIEW_RESULT: 'INTERVIEW_RESULT',
    COURSE_ASSIGNED: 'COURSE_ASSIGNED',
    COURSE_UPDATED: 'COURSE_UPDATED',
    COURSE_COMPLETED: 'COURSE_COMPLETED',
    LESSON_ADDED: 'LESSON_ADDED',
    ATTENDANCE_MARKED: 'ATTENDANCE_MARKED',
    ATTENDANCE_WARNING: 'ATTENDANCE_WARNING',
    CERTIFICATE_EARNED: 'CERTIFICATE_EARNED',
    ANNOUNCEMENT: 'ANNOUNCEMENT',
    SYSTEM_NOTIFICATION: 'SYSTEM_NOTIFICATION',
  };

  /**
   * Create and deliver a single notification to a specific user
   * @param {Object} data
   * @param {Object} [io]
   * @returns {Promise<Object>} Created notification instance
   */
  static async createNotification(data, io = null) {
    try {
      const recipientId = data.userId || data.recipientUserId;
      if (!recipientId) {
        throw new Error('Notification recipient userId is required');
      }

      // Check if recipient exists and get role if not provided
      let role = data.recipientRole;
      if (!role) {
        const recipientUser = await User.findByPk(recipientId, { attributes: ['id', 'role'] });
        role = recipientUser ? recipientUser.role : null;
      }

      const payload = {
        userId: recipientId,
        actorUserId: data.actorUserId || null,
        recipientRole: role,
        type: data.type || 'SYSTEM_NOTIFICATION',
        title: data.title || 'New Notification',
        message: data.message || '',
        category: data.category || 'SYSTEM',
        relatedEntityType: data.relatedEntityType || null,
        relatedEntityId: data.relatedEntityId != null ? String(data.relatedEntityId) : null,
        actionUrl: data.actionUrl || null,
        isRead: false,
        readAt: null,
        priority: data.priority || 'NORMAL',
        metadata: data.metadata || {},
      };

      const notification = await Notification.create(payload);

      // Emit real-time notification via Socket.IO cross-instance relay
      const sock = resolveIO(io);
      if (sock) {
        const notifJSON = {
          id: notification.id,
          userId: notification.userId,
          actorUserId: notification.actorUserId,
          recipientRole: notification.recipientRole,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          category: notification.category,
          relatedEntityType: notification.relatedEntityType,
          relatedEntityId: notification.relatedEntityId,
          actionUrl: notification.actionUrl,
          isRead: notification.isRead,
          priority: notification.priority,
          metadata: notification.metadata,
          createdAt: notification.createdAt || notification.created_at,
        };

        // 1. Deliver to recipient user room
        relay.relayEmit(sock, 'user-room', recipientId, 'notification:new', notifJSON);

        // 2. Broadcast unread count update
        const unreadCount = await Notification.count({
          where: { userId: recipientId, isRead: false },
        });
        relay.relayEmit(sock, 'user-room', recipientId, 'notification:count', { unreadCount });

        // 3. If recipient is admin or high priority announcement, emit to role room
        if (role === 'ADMIN' || data.type === 'ANNOUNCEMENT') {
          relay.relayEmit(sock, 'room', `role_${role || 'ADMIN'}`, 'notification:roleUpdate', notifJSON);
        }
      }

      logger.info(`[NotificationService] Created notification #${notification.id} for user ${recipientId} (${notification.type})`);
      return notification;
    } catch (error) {
      logger.error('[NotificationService] Error creating notification:', { error: error.message, data });
      return null;
    }
  }

  /** Alias for createNotification */
  static async notifyUser(data, io = null) {
    return this.createNotification(data, io);
  }

  /**
   * Send notification to multiple users simultaneously
   * @param {Array<number|string>} userIds
   * @param {Object} data
   * @param {Object} [io]
   */
  static async notifyUsers(userIds, data, io = null) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const results = await Promise.allSettled(
      uniqueIds.map((uid) => this.createNotification({ ...data, userId: uid }, io))
    );
    return results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value);
  }

  /**
   * Broadcast notification to all active users with a specific role
   * @param {string} role - 'ADMIN' | 'TRAINER' | 'PARTICIPANT'
   * @param {Object} data
   * @param {Object} [io]
   */
  static async notifyRole(role, data, io = null) {
    try {
      const users = await User.findAll({
        where: { role: role.toUpperCase() },
        attributes: ['id', 'role'],
      });
      if (users.length === 0) return [];
      return await this.notifyUsers(users.map((u) => u.id), { ...data, recipientRole: role }, io);
    } catch (err) {
      logger.error(`[NotificationService] Failed to notify role ${role}:`, { error: err.message });
      return [];
    }
  }

  /**
   * Notify all enrolled participants in a course
   * @param {number|string} courseId
   * @param {Object} data
   * @param {Object} [io]
   */
  static async notifyCourseParticipants(courseId, data, io = null) {
    try {
      const enrollments = await Enrollment.findAll({
        where: { courseId, status: 'ENROLLED' },
        attributes: ['participantId'],
      });
      const participantIds = enrollments.map((e) => e.participantId).filter(Boolean);
      return await this.notifyUsers(participantIds, data, io);
    } catch (err) {
      logger.error(`[NotificationService] Failed to notify course participants (${courseId}):`, { error: err.message });
      return [];
    }
  }

  /**
   * Notify all enrolled participants in a training
   * @param {number|string} trainingId
   * @param {Object} data
   * @param {Object} [io]
   */
  static async notifyTrainingParticipants(trainingId, data, io = null) {
    try {
      const enrollments = await Enrollment.findAll({
        where: { trainingId, status: 'ENROLLED' },
        attributes: ['participantId'],
      });
      const participantIds = enrollments.map((e) => e.participantId).filter(Boolean);
      return await this.notifyUsers(participantIds, data, io);
    } catch (err) {
      logger.error(`[NotificationService] Failed to notify training participants (${trainingId}):`, { error: err.message });
      return [];
    }
  }

  /**
   * Notify all platform administrators
   * @param {Object} data
   * @param {Object} [io]
   */
  static async notifyAdmins(data, io = null) {
    return this.notifyRole('ADMIN', { ...data, priority: data.priority || 'HIGH' }, io);
  }

  /**
   * Get paginated notifications for a user
   * @param {number|string} userId
   * @param {Object} options
   */
  static async getNotifications(userId, options = {}) {
    try {
      const limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 15, 100));
      const offset = Math.max(0, parseInt(options.offset, 10) || 0);
      const where = { userId };

      if (options.unreadOnly === true || options.unreadOnly === 'true') {
        where.isRead = false;
      }
      if (options.category && options.category !== 'ALL') {
        where.category = options.category;
      }
      if (options.type) {
        where.type = options.type;
      }

      const { rows, count } = await Notification.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      const unreadCount = await Notification.count({
        where: { userId, isRead: false },
      });

      return {
        notifications: rows,
        count,
        unreadCount,
      };
    } catch (error) {
      logger.error('[NotificationService] Error fetching notifications:', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get unread notification count
   * @param {number|string} userId
   */
  static async getUnreadCount(userId) {
    try {
      return await Notification.count({
        where: { userId, isRead: false },
      });
    } catch (error) {
      logger.error('[NotificationService] Error counting unread notifications:', { error: error.message, userId });
      return 0;
    }
  }

  /**
   * Mark a single notification as read
   * @param {number|string} notificationId
   * @param {number|string} userId
   * @param {Object} [io]
   */
  static async markAsRead(notificationId, userId, io = null) {
    try {
      const notification = await Notification.findOne({
        where: { id: notificationId, userId },
      });
      if (!notification) {
        throw new Error('Notification not found or access denied');
      }

      if (!notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        const sock = resolveIO(io);
        if (sock) {
          relay.relayEmit(sock, 'user-room', userId, 'notification:read', {
            notificationId: notification.id,
            isRead: true,
          });

          const unreadCount = await Notification.count({
            where: { userId, isRead: false },
          });
          relay.relayEmit(sock, 'user-room', userId, 'notification:count', { unreadCount });
        }
      }

      return notification;
    } catch (error) {
      logger.error('[NotificationService] Error marking notification as read:', { error: error.message, notificationId });
      throw error;
    }
  }

  /**
   * Mark all unread notifications for a user as read
   * @param {number|string} userId
   * @param {Object} [io]
   */
  static async markAllAsRead(userId, io = null) {
    try {
      const [count] = await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { userId, isRead: false } }
      );

      const sock = resolveIO(io);
      if (sock) {
        relay.relayEmit(sock, 'user-room', userId, 'notification:markAllRead', {
          timestamp: new Date(),
        });
        relay.relayEmit(sock, 'user-room', userId, 'notification:count', { unreadCount: 0 });
      }

      return count;
    } catch (error) {
      logger.error('[NotificationService] Error marking all notifications as read:', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {number|string} notificationId
   * @param {number|string} userId
   */
  static async deleteNotification(notificationId, userId) {
    try {
      const count = await Notification.destroy({
        where: { id: notificationId, userId },
      });
      return count > 0;
    } catch (error) {
      logger.error('[NotificationService] Error deleting notification:', { error: error.message, notificationId });
      throw error;
    }
  }
}

module.exports = NotificationService;
