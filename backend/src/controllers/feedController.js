/**
 * Activity Feed Controller
 * Handles activity feed API endpoints
 */

const ActivityService = require('../services/activityService');
const logger = require('../utils/logger');

/**
 * GET /api/feed - Get activity feed with pagination and filters
 */
const getActivityFeed = async (req, res) => {
  try {
    const { limit = 20, offset = 0, type, userId, entityType } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      ...(type && { type }),
      ...(userId && { userId: parseInt(userId) }),
      ...(entityType && { entityType }),
    };

    const result = await ActivityService.getActivityFeed(options);

    res.json({
      success: true,
      data: result.activities,
      total: result.count,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    logger.error('Error fetching activity feed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch activity feed' });
  }
};

/**
 * GET /api/feed/grouped - Get activity feed grouped by date
 */
const getActivityFeedGrouped = async (req, res) => {
  try {
    const { type, userId, entityType, limit = 50 } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: 0,
      ...(type && { type }),
      ...(userId && { userId: parseInt(userId) }),
      ...(entityType && { entityType }),
    };

    const grouped = await ActivityService.getActivityFeedGrouped(options);

    res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    logger.error('Error fetching grouped activity feed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grouped activity feed',
    });
  }
};

/**
 * GET /api/feed/user/:userId - Get user-specific activity
 */
const getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const result = await ActivityService.getUserActivity(
      parseInt(userId),
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      data: result.activities,
      total: result.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error('Error fetching user activity', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch user activity' });
  }
};

/**
 * GET /api/feed/training/:trainingId - Get training-specific activities
 */
const getTrainingActivity = async (req, res) => {
  try {
    const { trainingId } = req.params;
    const { limit = 20 } = req.query;

    const activities = await ActivityService.getTrainingActivity(
      parseInt(trainingId),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    logger.error('Error fetching training activity', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch training activity',
    });
  }
};

/**
 * GET /api/feed/stats - Get activity statistics
 */
const getActivityStats = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const stats = await ActivityService.getActivityStats(parseInt(days));

    res.json({
      success: true,
      data: stats,
      period: `Last ${days} days`,
    });
  } catch (error) {
    logger.error('Error fetching activity statistics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity statistics',
    });
  }
};

module.exports = {
  getActivityFeed,
  getActivityFeedGrouped,
  getUserActivity,
  getTrainingActivity,
  getActivityStats,
};
