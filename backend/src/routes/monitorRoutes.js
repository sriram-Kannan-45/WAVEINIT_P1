const express = require('express');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const {
  startTest,
  saveAnswers,
  submitTest,
  getTimeRemaining,
  flagTest,
  getTrainerSessions,
  getSessionParticipants,
  getParticipantScreenshots,
  getParticipantViolations,
  flagParticipant,
  disqualifyParticipant,
  warnParticipant,
  forceSubmitParticipant,
} = require('../controllers/monitorController');

const router = express.Router();

// Participant test flow
router.post('/tests/:testId/start', authenticateToken, startTest);
router.post('/tests/:testId/attempts/:attemptId/save', authenticateToken, saveAnswers);
router.post('/tests/:testId/attempts/:attemptId/submit', authenticateToken, submitTest);
router.get('/tests/:testId/attempts/:attemptId/time-remaining', authenticateToken, getTimeRemaining);
router.post('/tests/:testId/flag', authenticateToken, flagTest);

// Trainer monitoring
router.get('/trainer/sessions', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), getTrainerSessions);
router.get('/trainer/sessions/:sessionId/participants', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), getSessionParticipants);
router.get('/trainer/participants/:attemptId/screenshots', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), getParticipantScreenshots);
router.get('/trainer/participants/:attemptId/violations', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), getParticipantViolations);
router.post('/trainer/participants/:attemptId/flag', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), flagParticipant);
router.post('/trainer/participants/:attemptId/disqualify', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), disqualifyParticipant);
router.post('/trainer/participants/:attemptId/warn', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), warnParticipant);
router.post('/trainer/participants/:attemptId/force-submit', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), forceSubmitParticipant);

module.exports = router;
