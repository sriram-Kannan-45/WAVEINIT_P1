/**
 * Analytics Controller
 * Handles analytics and metrics API endpoints
 */

const AnalyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

/**
 * GET /api/admin/analytics - Get comprehensive dashboard analytics
 * Only accessible by admins
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { period = 'daily', days = 30, startDate, endDate } = req.query;

    const options = {
      period,
      ...(startDate && endDate
        ? {
            dateRange: {
              start: new Date(startDate),
              end: new Date(endDate),
            },
          }
        : {
            dateRange: AnalyticsService.getDefaultDateRange(parseInt(days)),
          }),
    };

    const analytics = await AnalyticsService.getDashboardAnalytics(options);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Error fetching dashboard analytics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
    });
  }
};

/**
 * GET /api/admin/analytics/enrollment-trend - Get enrollment trend
 */
const getEnrollmentTrend = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { period = 'daily', days = 30 } = req.query;

    const options = {
      period,
      dateRange: AnalyticsService.getDefaultDateRange(parseInt(days)),
    };

    const trend = await AnalyticsService.getEnrollmentTrend(options);

    res.json({
      success: true,
      data: trend,
      period,
    });
  } catch (error) {
    logger.error('Error fetching enrollment trend', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enrollment trend',
    });
  }
};

/**
 * GET /api/admin/analytics/trainer-performance - Get trainer performance
 */
const getTrainerPerformance = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { days = 90, limit = 10 } = req.query;

    const options = {
      dateRange: AnalyticsService.getDefaultDateRange(parseInt(days)),
      limit: parseInt(limit),
    };

    const performance = await AnalyticsService.getTrainerPerformance(options);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    logger.error('Error fetching trainer performance', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trainer performance',
    });
  }
};

/**
 * GET /api/admin/analytics/users - Get user metrics
 */
const getUserMetrics = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { days = 30, inactiveThresholdDays = 7 } = req.query;

    const options = {
      dateRange: AnalyticsService.getDefaultDateRange(parseInt(days)),
      inactiveThresholdDays: parseInt(inactiveThresholdDays),
    };

    const metrics = await AnalyticsService.getUserMetrics(options);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error fetching user metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user metrics',
    });
  }
};

/**
 * GET /api/admin/analytics/enrollments - Get enrollment metrics
 */
const getEnrollmentMetrics = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { days = 90 } = req.query;

    const options = {
      dateRange: AnalyticsService.getDefaultDateRange(parseInt(days)),
    };

    const metrics = await AnalyticsService.getEnrollmentMetrics(options);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error fetching enrollment metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enrollment metrics',
    });
  }
};

/**
 * GET /api/admin/analytics/active-users - Get active user count
 */
const getActiveUsers = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { inactiveThresholdDays = 7 } = req.query;

    const activeUsers = await AnalyticsService.getActiveUserCount(
      parseInt(inactiveThresholdDays)
    );

    res.json({
      success: true,
      data: { activeUsers, threshold: `${inactiveThresholdDays} days` },
    });
  } catch (error) {
    logger.error('Error fetching active users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active users',
    });
  }
};

/**
 * GET /api/admin/analytics/training-stats - Get training statistics
 */
const getTrainingStats = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { trainingId } = req.query;

    const stats = await AnalyticsService.getTrainingStats(
      trainingId ? parseInt(trainingId) : null
    );

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error fetching training statistics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch training statistics',
    });
  }
};

/**
 * GET /api/admin/analytics/recent-activities - Get recent activities
 */
const getRecentActivities = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { limit = 10 } = req.query;

    const activities = await AnalyticsService.getRecentActivities(parseInt(limit));

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    logger.error('Error fetching recent activities', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent activities',
    });
  }
};

module.exports = {
  getDashboardAnalytics,
  getEnrollmentTrend,
  getTrainerPerformance,
  getUserMetrics,
  getEnrollmentMetrics,
  getActiveUsers,
  getTrainingStats,
  getRecentActivities,
};
