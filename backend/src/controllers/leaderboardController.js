const LeaderboardService = require('../services/leaderboardService');
const logger = require('../utils/logger');

/**
 * GET /api/leaderboard/overall
 */
const getOverallLeaderboard = async (req, res) => {
  try {
    const { timeframe = 'all_time' } = req.query;
    const data = await LeaderboardService.getLeaderboard({
      scope: 'overall',
      timeframe,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Overall leaderboard controller error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
};

/**
 * GET /api/leaderboard/course/:courseId
 */
const getCourseLeaderboard = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { timeframe = 'all_time' } = req.query;
    const data = await LeaderboardService.getLeaderboard({
      scope: 'course',
      id: courseId,
      timeframe,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Course leaderboard controller error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch course leaderboard' });
  }
};

/**
 * GET /api/leaderboard/training/:trainingId
 */
const getTrainingLeaderboard = async (req, res) => {
  try {
    const { trainingId } = req.params;
    const { timeframe = 'all_time' } = req.query;
    const data = await LeaderboardService.getLeaderboard({
      scope: 'training',
      id: trainingId,
      timeframe,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Training leaderboard controller error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch training leaderboard' });
  }
};

module.exports = {
  getOverallLeaderboard,
  getCourseLeaderboard,
  getTrainingLeaderboard,
};
