/**
 * NotificationService
 * Handles all notification-related operations
 * Integrates with Socket.IO for real-time delivery
 */

const { Notification, User } = require('../models');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create and send a notification
   * @param {Object} notificationData - { userId, message, type, actionUrl, relatedEntityId, relatedEntityType }
   * @param {Object} io - Socket.IO instance for real-time emission
   * @returns {Promise<Object>} Created notification
   */
  static async createNotification(notificationData, io = null) {
    try {
      const notification = await Notification.create({
        userId: notificationData.userId,
        message: notificationData.message,
        type: notificationData.type || 'OTHER',
        actionUrl: notificationData.actionUrl || null,
        relatedEntityId: notificationData.relatedEntityId || null,
        relatedEntityType: notificationData.relatedEntityType || null,
        isRead: false,
      });

      // Emit real-time notification via Socket.IO
      if (io) {
        io.to(`user_${notificationData.userId}`).emit('notification:new', {
          id: notification.id,
          userId: notification.userId,
          message: notification.message,
          type: notification.type,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          actionUrl: notification.actionUrl,
        });

        // Also emit to admin room for certain notification types
        if (['APPROVAL', 'FEEDBACK_REPLY'].includes(notification.type)) {
          io.to('role_ADMIN').emit('notification:new', {
            id: notification.id,
            message: notification.message,
            type: notification.type,
            createdAt: notification.createdAt,
          });
        }
      }

      logger.info(`Notification created for user ${notificationData.userId}`, { notification });
      return notification;
    } catch (error) {
      logger.error('Error creating notification', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark notification as read
   * @param {number} notificationId - Notification ID
   * @param {Object} io - Socket.IO instance
   * @returns {Promise<Object>} Updated notification
   */
  static async markAsRead(notificationId, io = null) {
    try {
      const notification = await Notification.findByPk(notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }

      notification.isRead = true;
      await notification.save();

      // Emit update via Socket.IO
      if (io) {
        io.to(`user_${notification.userId}`).emit('notification:read', {
          notificationId: notification.id,
          isRead: true,
        });
      }

      return notification;
    } catch (error) {
      logger.error('Error marking notification as read', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all unread notifications for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of unread notifications
   */
  static async getUnreadNotifications(userId) {
    try {
      const notifications = await Notification.findAll({
        where: { userId, isRead: false },
        order: [['createdAt', 'DESC']],
        limit: 20,
      });
      return notifications;
    } catch (error) {
      logger.error('Error fetching unread notifications', { error: error.message });
      throw error;
    }
  }

  /**
   * Get paginated notifications for a user
   * @param {number} userId - User ID
   * @param {number} limit - Limit per page
   * @param {number} offset - Pagination offset
   * @returns {Promise<Object>} { rows, count, total }
   */
  static async getNotifications(userId, limit = 10, offset = 0) {
    try {
      const { rows, count } = await Notification.findAndCountAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      const unreadCount = await Notification.count({
        where: { userId, isRead: false },
      });

      return { notifications: rows, count, unreadCount };
    } catch (error) {
      logger.error('Error fetching notifications', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {number} userId - User ID
   * @param {Object} io - Socket.IO instance
   * @returns {Promise<number>} Number of updated notifications
   */
  static async markAllAsRead(userId, io = null) {
    try {
      const [count] = await Notification.update(
        { isRead: true },
        { where: { userId, isRead: false } }
      );

      if (io) {
        io.to(`user_${userId}`).emit('notification:markAllRead', {
          timestamp: new Date(),
        });
      }

      return count;
    } catch (error) {
      logger.error('Error marking all notifications as read', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {number} notificationId - Notification ID
   * @returns {Promise<number>} Number of deleted notifications
   */
  static async deleteNotification(notificationId) {
    try {
      const count = await Notification.destroy({
        where: { id: notificationId },
      });
      return count;
    } catch (error) {
      logger.error('Error deleting notification', { error: error.message });
      throw error;
    }
  }

  /**
   * Broadcast notification to role-based audience
   * @param {string} role - User role (ADMIN, TRAINER, PARTICIPANT)
   * @param {Object} notificationData - Notification data
   * @param {Object} io - Socket.IO instance
   */
  static async broadcastToRole(role, notificationData, io) {
    try {
      if (io) {
        io.to(`role_${role}`).emit('notification:new', notificationData);
      }
      logger.info(`Broadcast notification to role ${role}`, { notificationData });
    } catch (error) {
      logger.error('Error broadcasting to role', { error: error.message });
      throw error;
    }
  }
}

module.exports = NotificationService;
