const express = require('express');
const authenticateToken = require('../middleware/auth');
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
router.get('/trainer/sessions', authenticateToken, getTrainerSessions);
router.get('/trainer/sessions/:sessionId/participants', authenticateToken, getSessionParticipants);
router.get('/trainer/participants/:attemptId/screenshots', authenticateToken, getParticipantScreenshots);
router.get('/trainer/participants/:attemptId/violations', authenticateToken, getParticipantViolations);
router.post('/trainer/participants/:attemptId/flag', authenticateToken, flagParticipant);
router.post('/trainer/participants/:attemptId/disqualify', authenticateToken, disqualifyParticipant);
router.post('/trainer/participants/:attemptId/warn', authenticateToken, warnParticipant);
router.post('/trainer/participants/:attemptId/force-submit', authenticateToken, forceSubmitParticipant);

module.exports = router;
