const express = require('express');
const liveController = require('../controllers/liveController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();

router.post('/create', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), liveController.createSession);
router.get('/trainer-sessions', authenticateToken, roleMiddleware('TRAINER'), liveController.getTrainerSessions);
router.get('/available-sessions', authenticateToken, liveController.getParticipantSessions);
router.get('/session/:roomId', authenticateToken, liveController.getSessionDetails);

module.exports = router;
