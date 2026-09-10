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
const roleMiddleware = require('../middleware/roles');
const ctrl = require('../controllers/proctoringController');

// Objective monitoring events are participant-originated and must be tied to
// the authenticated owner's attempt. Internal services should use a dedicated
// service-authenticated endpoint rather than trusting identifiers in a body.
router.post('/events', auth, requireUserId, roleMiddleware('PARTICIPANT'), ctrl.recordMonitoringEvent);

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

// Proctoring Reports (Strictly TRAINER & ADMIN)
router.get('/reports/:attemptId', roleMiddleware('TRAINER', 'ADMIN'), ctrl.getAttemptProctoringReport);
router.post('/reports/:attemptId/regenerate', roleMiddleware('TRAINER', 'ADMIN'), ctrl.regenerateAttemptProctoringReport);
router.get('/admin/reports', roleMiddleware('ADMIN'), ctrl.getAdminProctoringReports);

// Read + Trainer ops
router.get('/sessions/:sessionId',                   roleMiddleware('TRAINER', 'ADMIN', 'PARTICIPANT'), ctrl.getSession);
router.get('/sessions/:sessionId/result',            roleMiddleware('TRAINER', 'ADMIN', 'PARTICIPANT'), ctrl.getResult);
router.get('/sessions/:sessionId/violations',        roleMiddleware('TRAINER', 'ADMIN', 'PARTICIPANT'), ctrl.getViolations);
router.get('/sessions/:sessionId/screenshots',       roleMiddleware('TRAINER', 'ADMIN'), ctrl.getScreenshots);
router.get('/sessions/:sessionId/export.json',       roleMiddleware('TRAINER', 'ADMIN'), ctrl.exportLogs);
router.post('/sessions/:sessionId/force-terminate',  roleMiddleware('TRAINER', 'ADMIN'), ctrl.forceTerminate);
router.get('/quiz/:quizId/monitor',                  roleMiddleware('TRAINER', 'ADMIN'), ctrl.getQuizMonitor);
router.get('/quiz/:quizId/report',                    roleMiddleware('TRAINER', 'ADMIN'), ctrl.getQuizReport);
router.get('/quiz/:quizId/report/csv',                roleMiddleware('TRAINER', 'ADMIN'), ctrl.exportReportCSV);

module.exports = router;
