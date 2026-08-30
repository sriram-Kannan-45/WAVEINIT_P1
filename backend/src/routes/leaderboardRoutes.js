const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/overall', leaderboardController.getOverallLeaderboard);
router.get('/course/:courseId', leaderboardController.getCourseLeaderboard);
router.get('/training/:trainingId', leaderboardController.getTrainingLeaderboard);

module.exports = router;
