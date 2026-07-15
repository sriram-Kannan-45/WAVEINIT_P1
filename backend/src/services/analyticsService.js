/**
 * AnalyticsService
 * Handles analytics calculations and metrics generation
 * Provides enrollment trends, trainer performance, and user metrics
 */

const { Enrollment, Training, Feedback, User, ActivityLog } = require('../models');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class AnalyticsService {
  /**
   * Get comprehensive analytics dashboard data
   * @param {Object} options - { dateRange, trainingId }
   * @returns {Promise<Object>} Analytics data
   */
  static async getDashboardAnalytics(options = {}) {
    try {
      const [
        enrollmentTrend,
        trainerPerformance,
        userMetrics,
        enrollmentMetrics,
        recentActivities,
      ] = await Promise.all([
        this.getEnrollmentTrend(options),
        this.getTrainerPerformance(options),
        this.getUserMetrics(options),
        this.getEnrollmentMetrics(options),
        this.getRecentActivities(),
      ]);

      return {
        enrollmentTrend,
        trainerPerformance,
        userMetrics,
        enrollmentMetrics,
        recentActivities,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error fetching dashboard analytics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get enrollment trend over time
   * @param {Object} options - { period: 'daily' | 'weekly' | 'monthly', dateRange: { start, end } }
   * @returns {Promise<Array>} Enrollment trend data
   */
  static async getEnrollmentTrend(options = {}) {
    try {
      const period = options.period || 'daily';
      const dateRange = options.dateRange || this.getDefaultDateRange(30);

      let dateFormat;
      let grouping;

      switch (period) {
        case 'weekly':
          dateFormat = '%Y-W%v';
          grouping = sequelize.literal(
            'DATE_FORMAT(created_at, "%Y-%m-%d")'
          );
          break;
        case 'monthly':
          dateFormat = '%Y-%m';
          grouping = sequelize.literal(
            'DATE_FORMAT(created_at, "%Y-%m-01")'
          );
          break;
        default: // daily
          dateFormat = '%Y-%m-%d';
          grouping = sequelize.literal(
            'DATE(created_at)'
          );
      }

      const trend = await Enrollment.findAll({
        attributes: [
          [grouping, 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        where: {
          createdAt: {
            [Op.between]: [dateRange.start, dateRange.end],
          },
        },
        group: ['date'],
        order: [['date', 'ASC']],
        raw: true,
        subQuery: false,
      });

      return trend.map((item) => ({
        date: item.date,
        count: parseInt(item.count, 10),
      }));
    } catch (error) {
      logger.error('Error fetching enrollment trend', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get trainer performance metrics
   * @param {Object} options - { dateRange, trainingId, limit }
   * @returns {Promise<Array>} Trainer performance data
   */
  static async getTrainerPerformance(options = {}) {
    try {
      const dateRange = options.dateRange || this.getDefaultDateRange(90);
      const limit = options.limit || 10;

      const performance = await sequelize.query(
        `
        SELECT
          u.id,
          u.name as trainerName,
          COUNT(DISTINCT e.id) as totalEnrollments,
          COUNT(DISTINCT f.id) as feedbackCount,
          ROUND(AVG(f.rating), 2) as avgRating,
          MAX(f.created_at) as lastFeedbackDate
        FROM users u
        LEFT JOIN training_programs t ON u.id = t.trainer_id
        LEFT JOIN enrollments e ON t.id = e.training_id
        LEFT JOIN feedbacks f ON t.id = f.training_id
        WHERE u.role = 'TRAINER'
          AND f.created_at BETWEEN ? AND ?
        GROUP BY u.id, u.name
        ORDER BY avgRating DESC, totalEnrollments DESC
        LIMIT ?
        `,
        {
          replacements: [dateRange.start, dateRange.end, limit],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      return performance.map((item) => ({
        id: item.id,
        trainerName: item.trainerName,
        totalEnrollments: parseInt(item.totalEnrollments, 10),
        feedbackCount: parseInt(item.feedbackCount, 10),
        avgRating: parseFloat(item.avgRating) || 0,
        lastFeedbackDate: item.lastFeedbackDate,
      }));
    } catch (error) {
      logger.error('Error fetching trainer performance', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get user metrics
   * @param {Object} options - { dateRange, inactiveThresholdDays }
   * @returns {Promise<Object>} User metrics
   */
  static async getUserMetrics(options = {}) {
    try {
      const dateRange = options.dateRange || this.getDefaultDateRange(30);
      const inactiveThreshold = options.inactiveThresholdDays || 7;

      const totalUsers = await User.count();
      const activeUsers = await this.getActiveUserCount(inactiveThreshold);

      const usersByRole = await User.findAll({
        attributes: [
          'role',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        group: ['role'],
        raw: true,
      });

      const recentSignups = await User.count({
        where: {
          createdAt: {
            [Op.between]: [dateRange.start, dateRange.end],
          },
        },
      });

      return {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        recentSignups,
        usersByRole: usersByRole.map((item) => ({
          role: item.role,
          count: parseInt(item.count, 10),
        })),
      };
    } catch (error) {
      logger.error('Error fetching user metrics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get enrollment metrics
   * @param {Object} options - { dateRange }
   * @returns {Promise<Object>} Enrollment metrics
   */
  static async getEnrollmentMetrics(options = {}) {
    try {
      const dateRange = options.dateRange || this.getDefaultDateRange(90);

      const totalEnrollments = await Enrollment.count();
      const completedEnrollments = await Enrollment.count({
        where: { status: 'COMPLETED' },
      });
      const cancelledEnrollments = await Enrollment.count({
        where: { status: 'CANCELLED' },
      });
      const activeEnrollments = await Enrollment.count({
        where: { status: 'ACTIVE' },
      });

      const dropRate =
        totalEnrollments > 0
          ? Math.round(
              (cancelledEnrollments / totalEnrollments) * 100 * 100
            ) / 100
          : 0;

      const completionRate =
        totalEnrollments > 0
          ? Math.round(
              (completedEnrollments / totalEnrollments) * 100 * 100
            ) / 100
          : 0;

      const newEnrollments = await Enrollment.count({
        where: {
          createdAt: {
            [Op.between]: [dateRange.start, dateRange.end],
          },
        },
      });

      return {
        totalEnrollments,
        activeEnrollments,
        completedEnrollments,
        cancelledEnrollments,
        dropRate,
        completionRate,
        newEnrollments,
      };
    } catch (error) {
      logger.error('Error fetching enrollment metrics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get count of active users
   * @param {number} inactiveThresholdDays - Consider user active if action within X days
   * @returns {Promise<number>} Active user count
   */
  static async getActiveUserCount(inactiveThresholdDays = 7) {
    try {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - inactiveThresholdDays);

      const count = await sequelize.query(
        `
        SELECT COUNT(DISTINCT u.id) as activeCount
        FROM users u
        WHERE u.updated_at >= ?
           OR EXISTS (
             SELECT 1 FROM activity_logs al
             WHERE al.user_id = u.id AND al.created_at >= ?
           )
           OR EXISTS (
             SELECT 1 FROM enrollments e
             WHERE e.user_id = u.id AND e.updated_at >= ?
           )
        `,
        {
          replacements: [threshold, threshold, threshold],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      return parseInt(count[0].activeCount, 10);
    } catch (error) {
      logger.error('Error calculating active users', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get recent activities for analytics
   * @param {number} limit - Result limit
   * @returns {Promise<Array>} Recent activities
   */
  static async getRecentActivities(limit = 10) {
    try {
      const activities = await ActivityLog.findAll({
        order: [['createdAt', 'DESC']],
        limit,
        raw: true,
      });

      return activities;
    } catch (error) {
      logger.error('Error fetching recent activities', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get training completion statistics
   * @param {number} trainingId - Optional training ID filter
   * @returns {Promise<Object>} Training statistics
   */
  static async getTrainingStats(trainingId = null) {
    try {
      const where = trainingId ? { trainingId } : {};

      const stats = await Enrollment.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        ],
        where,
        group: ['status'],
        raw: true,
      });

      const result = {};
      stats.forEach((stat) => {
        result[stat.status] = parseInt(stat.count, 10);
      });

      return result;
    } catch (error) {
      logger.error('Error fetching training statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get default date range
   * @param {number} days - Number of days back
   * @returns {Object} { start, end } dates
   */
  static getDefaultDateRange(days = 30) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }

  /**
   * Generate analytics for custom date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Custom range analytics
   */
  static async getCustomRangeAnalytics(startDate, endDate) {
    try {
      const options = { dateRange: { start: startDate, end: endDate } };
      return await this.getDashboardAnalytics(options);
    } catch (error) {
      logger.error('Error fetching custom range analytics', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = AnalyticsService;
