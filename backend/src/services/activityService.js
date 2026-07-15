/**
 * ActivityService
 * Handles activity logging and feed generation
 * Creates human-readable activity messages
 */

const { ActivityLog } = require('../models');
const logger = require('../utils/logger');

class ActivityService {
  /**
   * Activity type mapping to human-readable messages
   */
  static ACTIVITY_MESSAGES = {
    TRAINING_CREATED: (data) =>
      `${data.userName} created a new training "${data.trainingName}"`,
    TRAINING_UPDATED: (data) =>
      `${data.userName} updated training "${data.trainingName}"`,
    TRAINING_DELETED: (data) =>
      `${data.userName} deleted training "${data.trainingName}"`,
    NOTE_UPLOADED: (data) =>
      `${data.userName} uploaded a new note for "${data.trainingName}"`,
    USER_APPROVED: (data) =>
      `Admin approved user ${data.targetUserName}`,
    USER_REJECTED: (data) =>
      `Admin rejected user ${data.targetUserName}`,
    ENROLLMENT_DONE: (data) =>
      `${data.userName} enrolled in "${data.trainingName}"`,
    ENROLLMENT_CANCELLED: (data) =>
      `${data.userName} cancelled enrollment in "${data.trainingName}"`,
    FEEDBACK_SUBMITTED: (data) =>
      `${data.userName} submitted feedback for "${data.trainingName}"`,
    FEEDBACK_REPLIED: (data) =>
      `${data.userName} replied to feedback`,
    COMPLETION_MARKED: (data) =>
      `${data.userName} completed "${data.trainingName}"`,
    ASSIGNMENT_SUBMITTED: (data) =>
      `${data.userName} submitted an assignment`,
  };

  /**
   * Log an activity
   * @param {Object} activityData - { userId, userName, action, entityType, entityId, details, role }
   * @param {Object} io - Socket.IO instance for real-time emission
   * @returns {Promise<Object>} Created activity log
   */
  static async logActivity(activityData, io = null) {
    try {
      const activity = await ActivityLog.create({
        userId: activityData.userId,
        userName: activityData.userName,
        action: activityData.action,
        entityType: activityData.entityType,
        entityId: activityData.entityId,
        details: activityData.details ? JSON.stringify(activityData.details) : null,
        status: 'SUCCESS',
      });

      // Emit real-time activity via Socket.IO
      if (io) {
        const formattedActivity = this.formatActivityForFeed(activity, activityData);
        io.emit('activity:new', formattedActivity);
      }

      logger.info(`Activity logged: ${activityData.action}`, { activity });
      return activity;
    } catch (error) {
      logger.error('Error logging activity', { error: error.message });
      throw error;
    }
  }

  /**
   * Format activity for feed display
   * @param {Object} activity - Activity log record
   * @param {Object} additionalData - Additional data for message formatting
   * @returns {Object} Formatted activity
   */
  static formatActivityForFeed(activity, additionalData = {}) {
    const messageBuilder = this.ACTIVITY_MESSAGES[activity.action];
    const message = messageBuilder
      ? messageBuilder({ userName: activity.userName, ...additionalData })
      : activity.action;

    const dateObj = activity.createdAt || activity.created_at || new Date();
    const finalDate = dateObj instanceof Date ? dateObj : new Date(dateObj);

    return {
      id: activity.id,
      userId: activity.userId,
      userName: activity.userName,
      role: additionalData.role || 'PARTICIPANT',
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      message,
      createdAt: finalDate,
      timestamp: finalDate.getTime(),
    };
  }

  /**
   * Get activity feed with pagination and filtering
   * @param {Object} options - { limit, offset, type, userId, entityType }
   * @returns {Promise<Object>} { activities, count }
   */
  static async getActivityFeed(options = {}) {
    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const where = {};

      // Add filters
      if (options.type) {
        where.action = options.type;
      }
      if (options.userId) {
        where.userId = options.userId;
      }
      if (options.entityType) {
        where.entityType = options.entityType;
      }

      const { rows, count } = await ActivityLog.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      // Format activities for feed
      const formattedActivities = rows.map((activity) =>
        this.formatActivityForFeed(activity)
      );

      return { activities: formattedActivities, count, limit, offset };
    } catch (error) {
      logger.error('Error fetching activity feed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get activities grouped by date
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} Activities grouped by date
   */
  static async getActivityFeedGrouped(options = {}) {
    try {
      const { activities } = await this.getActivityFeed(options);

      const grouped = {
        today: [],
        yesterday: [],
        thisWeek: [],
        older: [],
      };

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      activities.forEach((activity) => {
        const actDate = new Date(activity.createdAt);
        const actDateOnly = new Date(
          actDate.getFullYear(),
          actDate.getMonth(),
          actDate.getDate()
        );

        if (actDateOnly.getTime() === today.getTime()) {
          grouped.today.push(activity);
        } else if (actDateOnly.getTime() === yesterday.getTime()) {
          grouped.yesterday.push(activity);
        } else if (actDate > weekAgo) {
          grouped.thisWeek.push(activity);
        } else {
          grouped.older.push(activity);
        }
      });

      return grouped;
    } catch (error) {
      logger.error('Error grouping activities by date', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user-specific activity feed
   * @param {number} userId - User ID
   * @param {number} limit - Results limit
   * @param {number} offset - Pagination offset
   * @returns {Promise<Object>} User activities
   */
  static async getUserActivity(userId, limit = 20, offset = 0) {
    try {
      const { rows, count } = await ActivityLog.findAndCountAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      const formattedActivities = rows.map((activity) =>
        this.formatActivityForFeed(activity)
      );

      return { activities: formattedActivities, count };
    } catch (error) {
      logger.error('Error fetching user activity', { error: error.message });
      throw error;
    }
  }

  /**
   * Get training-specific activities
   * @param {number} trainingId - Training ID
   * @param {number} limit - Results limit
   * @returns {Promise<Array>} Training activities
   */
  static async getTrainingActivity(trainingId, limit = 20) {
    try {
      const activities = await ActivityLog.findAll({
        where: { entityId: trainingId, entityType: 'Training' },
        order: [['createdAt', 'DESC']],
        limit,
      });

      return activities.map((activity) =>
        this.formatActivityForFeed(activity)
      );
    } catch (error) {
      logger.error('Error fetching training activity', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete old activities (cleanup routine)
   * @param {number} daysOld - Delete activities older than X days
   * @returns {Promise<number>} Number of deleted records
   */
  static async cleanupOldActivities(daysOld = 90) {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - daysOld);

      const count = await ActivityLog.destroy({
        where: {
          createdAt: { [require('sequelize').Op.lt]: dateLimit },
        },
      });

      logger.info(`Cleaned up ${count} old activity logs`);
      return count;
    } catch (error) {
      logger.error('Error cleaning up old activities', { error: error.message });
      throw error;
    }
  }

  /**
   * Get activity statistics
   * @param {number} days - Statistics for last X days
   * @returns {Promise<Object>} Activity statistics
   */
  static async getActivityStats(days = 7) {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);

      const [sequelize, { Op }] = [
        require('../config/db').sequelize,
        require('sequelize'),
      ];

      const stats = await ActivityLog.findAll({
        attributes: [
          'action',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        where: {
          createdAt: { [Op.gte]: dateLimit },
        },
        group: ['action'],
        raw: true,
      });

      return stats.reduce(
        (acc, stat) => {
          acc[stat.action] = parseInt(stat.count, 10);
          return acc;
        },
        {}
      );
    } catch (error) {
      logger.error('Error calculating activity statistics', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = ActivityService;
