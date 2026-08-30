const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

router.use(authenticateToken);

// Student endpoints
router.get('/student/summary', attendanceController.getStudentSummary);

// Trainer & Admin endpoints
router.post('/sessions', roleMiddleware('TRAINER', 'ADMIN'), attendanceController.createSession);
router.get('/sessions', attendanceController.getSessions);
router.get('/sessions/:sessionId', attendanceController.getSessionDetail);
router.post('/sessions/:sessionId/mark', roleMiddleware('TRAINER', 'ADMIN'), attendanceController.markAttendance);
router.put('/sessions/:sessionId/records/:recordId', roleMiddleware('TRAINER', 'ADMIN'), attendanceController.updateRecord);

router.get('/trainer/summary', roleMiddleware('TRAINER', 'ADMIN'), attendanceController.getTrainerSummary);

// Admin-only analytics
router.get('/admin/analytics', roleMiddleware('ADMIN'), attendanceController.getAdminAnalytics);

module.exports = router;
