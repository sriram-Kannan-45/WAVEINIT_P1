/**
 * Proctoring REST routes.
 *
 * All routes:
 *   - Require JWT (auth)
 *   - Require a valid req.user.id (requireUserId) — prevents the
 *     "WHERE participant_id has invalid undefined value" bug
 *
 * Locked endpoints additionally require X-Proctor-Session-Token
 * (sessionLock) and load `req.examSession`.
 */
const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const requireUserId = require('../middleware/requireUserId');
const sessionLock = require('../middleware/sessionLock');
const ctrl = require('../controllers/proctoringController');

router.use(auth);
router.use(requireUserId);

// Participant-facing
router.post('/sessions/start', ctrl.startSession);
router.get('/sessions/active', ctrl.getActiveSession);

// Locked to active session
router.post('/sessions/:sessionId/activate',  sessionLock, ctrl.activateSession);
router.post('/sessions/:sessionId/heartbeat', sessionLock, ctrl.heartbeat);
router.post('/sessions/:sessionId/violation', sessionLock, ctrl.recordViolation);
router.post('/sessions/:sessionId/activity',  sessionLock, ctrl.recordActivity);
router.post('/sessions/:sessionId/submit',    sessionLock, ctrl.submit);
router.post('/sessions/:sessionId/terminate', sessionLock, ctrl.terminate);

// Exam page server-side hydration + autosave + idempotent finalize
router.get('/sessions/:sessionId/exam',     sessionLock, ctrl.getExamData);
router.post('/sessions/:sessionId/answers', sessionLock, ctrl.saveAnswers);
router.post('/sessions/:sessionId/finalize', sessionLock, ctrl.finalize);

// Read + Trainer ops
router.get('/sessions/:sessionId',                   ctrl.getSession);
router.get('/sessions/:sessionId/result',            ctrl.getResult);
router.get('/sessions/:sessionId/violations',        ctrl.getViolations);
router.get('/sessions/:sessionId/screenshots',       ctrl.getScreenshots);
router.get('/sessions/:sessionId/export.json',       ctrl.exportLogs);
router.post('/sessions/:sessionId/force-terminate',  ctrl.forceTerminate);
router.get('/quiz/:quizId/monitor',                  ctrl.getQuizMonitor);
router.get('/quiz/:quizId/report',                    ctrl.getQuizReport);
router.get('/quiz/:quizId/report/csv',                ctrl.exportReportCSV);

module.exports = router;
