/**
 * Analytics Controller
 * Handles analytics and metrics API endpoints
 */

const AnalyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

/**
 * GET /api/analytics/student
 * Get current student learning & performance analytics
 */
const getStudentAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const analytics = await AnalyticsService.getStudentAnalytics(userId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    logger.error('Error fetching student analytics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch student analytics' });
  }
};

/**
 * GET /api/analytics/trainer
 * Get trainer performance, course analytics, and attendance rates
 */
const getTrainerAnalytics = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const analytics = await AnalyticsService.getTrainerAnalytics(trainerId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    logger.error('Error fetching trainer analytics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch trainer analytics' });
  }
};

/**
 * GET /api/admin/analytics or /api/analytics/admin - Get comprehensive dashboard analytics
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
    }

    const { period = 'daily', days = 30, startDate, endDate } = req.query;

    const options = {
      period,
      ...(startDate && endDate
        ? { dateRange: { start: new Date(startDate), end: new Date(endDate) } }
        : { dateRange: AnalyticsService.getDefaultDateRange(parseInt(days, 10) || 30) }),
    };

    const analytics = await AnalyticsService.getDashboardAnalytics(options);
    res.json({ success: true, data: analytics });
  } catch (error) {
    logger.error('Error fetching dashboard analytics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
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
      dateRange: AnalyticsService.getDefaultDateRange(parseInt(days, 10)),
    };

    const trend = await AnalyticsService.getEnrollmentTrend(options);
    res.json({ success: true, data: trend, period });
  } catch (error) {
    logger.error('Error fetching enrollment trend', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch enrollment trend' });
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

    const performance = await AnalyticsService.getTrainerPerformance();
    res.json({ success: true, data: performance });
  } catch (error) {
    logger.error('Error fetching trainer performance', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch trainer performance' });
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

    const metrics = await AnalyticsService.getUserMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    logger.error('Error fetching user metrics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch user metrics' });
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
    const activities = await AnalyticsService.getRecentActivities(parseInt(limit, 10));
    res.json({ success: true, data: activities });
  } catch (error) {
    logger.error('Error fetching recent activities', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch recent activities' });
  }
};

module.exports = {
  getStudentAnalytics,
  getTrainerAnalytics,
  getDashboardAnalytics,
  getEnrollmentTrend,
  getTrainerPerformance,
  getUserMetrics,
  getRecentActivities,
};
