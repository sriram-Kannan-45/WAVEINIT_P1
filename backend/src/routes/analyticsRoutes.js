const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

router.use(authenticateToken);

// Student analytics
router.get('/student', roleMiddleware('PARTICIPANT', 'ADMIN'), analyticsController.getStudentAnalytics);

// Trainer analytics
router.get('/trainer', roleMiddleware('TRAINER', 'ADMIN'), analyticsController.getTrainerAnalytics);

// Admin analytics
router.get('/admin', roleMiddleware('ADMIN'), analyticsController.getDashboardAnalytics);
router.get('/dashboard', roleMiddleware('ADMIN'), analyticsController.getDashboardAnalytics);

module.exports = router;
