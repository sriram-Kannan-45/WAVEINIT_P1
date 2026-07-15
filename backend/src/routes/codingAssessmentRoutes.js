const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const ctrl = require('../controllers/codingAssessmentController');
const validateAssessmentSession = require('../middleware/validateAssessmentSession');

const optionalAssessmentSession = (req, res, next) => {
  if (req.headers['x-assessment-session'] || req.headers['X-Assessment-Session']) {
    return validateAssessmentSession(req, res, next);
  }
  return next();
};

router.use(authenticateToken);

// ── TRAINER: CRUD Assessments ──
router.get('/assessments', roleMiddleware('TRAINER', 'ADMIN'), ctrl.list);
router.get('/assessments/:id', roleMiddleware('PARTICIPANT', 'TRAINER', 'ADMIN'), ctrl.getOne);
router.post('/assessments', roleMiddleware('TRAINER', 'ADMIN'), ctrl.create);
router.put('/assessments/:id', roleMiddleware('TRAINER', 'ADMIN'), ctrl.update);
router.delete('/assessments/:id', roleMiddleware('TRAINER', 'ADMIN'), ctrl.destroy);

// ── TRAINER: Problems ──
router.post('/assessments/:id/problems', roleMiddleware('TRAINER', 'ADMIN'), ctrl.createProblem);
router.put('/problems/:problemId', roleMiddleware('TRAINER', 'ADMIN'), ctrl.updateProblem);
router.delete('/problems/:problemId', roleMiddleware('TRAINER', 'ADMIN'), ctrl.deleteProblem);

// ── AI Generation ──
router.post('/generate-from-prompt', roleMiddleware('TRAINER', 'ADMIN'), ctrl.generateFromPrompt);

// ── Publishing ──
router.post('/assessments/:id/publish', roleMiddleware('TRAINER', 'ADMIN'), ctrl.publish);
router.post('/assessments/:id/close', roleMiddleware('TRAINER', 'ADMIN'), ctrl.close);
router.post('/assessments/:id/publish-result', roleMiddleware('TRAINER', 'ADMIN'), ctrl.publishResults);
router.post('/assessments/:id/hide-result', roleMiddleware('TRAINER', 'ADMIN'), ctrl.hideResults);

// ── Results & Participants ──
router.get('/assessments/:id/results', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getResults);
router.get('/assessments/:id/participants', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getParticipants);
router.get('/assessments/:id/results-summary', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getResultsSummary);
router.get('/assessments/:id/analytics', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getAnalytics);
router.get('/assessments/:id/leaderboard', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getLeaderboard);
router.get('/assessments/:id/recordings', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getRecordings);

// ── PARTICIPANT ──
router.post('/participant/start/:assessmentId', roleMiddleware('PARTICIPANT'), ctrl.start);
router.post('/participant/run', roleMiddleware('PARTICIPANT'), optionalAssessmentSession, ctrl.runCode);
router.post('/participant/save', roleMiddleware('PARTICIPANT'), optionalAssessmentSession, ctrl.saveCode);
router.post('/participant/submit-code', roleMiddleware('PARTICIPANT'), optionalAssessmentSession, ctrl.submitCode);
router.get('/participant/submission/:id', roleMiddleware('PARTICIPANT', 'TRAINER', 'ADMIN'), ctrl.getSubmission);
router.post('/participant/submit/:attemptId', roleMiddleware('PARTICIPANT'), optionalAssessmentSession, ctrl.submitAssessment);
router.get('/participant/assessments/:id/result', roleMiddleware('PARTICIPANT'), ctrl.getParticipantResult);

module.exports = router;
