/**
 * Activity Feed Routes
 */

const express = require('express');
const feedController = require('../controllers/feedController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Get activity feed with pagination and filters
router.get('/', authenticateToken, feedController.getActivityFeed);

// Get activity feed grouped by date
router.get('/grouped', authenticateToken, feedController.getActivityFeedGrouped);

// Get user-specific activity
router.get('/user/:userId', authenticateToken, feedController.getUserActivity);

// Get training-specific activities
router.get('/training/:trainingId', authenticateToken, feedController.getTrainingActivity);

// Get activity statistics
router.get('/stats', authenticateToken, feedController.getActivityStats);

module.exports = router;
