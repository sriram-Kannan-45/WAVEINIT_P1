/**
 * Unified Monitoring Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * Route definitions for the unified LMS Monitoring Engine.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireUserId = require('../middleware/requireUserId');
const ctrl = require('../controllers/monitoringController');
const uploadMonitoringVideo = require('../middleware/uploadMonitoringVideo');

// ── Public Mobile Pairing Validation (scanned by phone camera) ──
router.post('/sessions/:id/mobile/validate-pair', ctrl.pairMobileToken);
router.post('/sessions/:id/mobile/validate', ctrl.validateMobile);

// ── Authenticated Endpoints ──
router.use(auth);

// Config endpoints (Admins/Trainers)
router.get('/config', ctrl.getConfig);
router.put('/config', requireUserId, ctrl.updateConfig);

// Reports & Analytics
router.get('/reports', ctrl.getReportsList);
router.get('/reports/attempt/:attemptId', ctrl.getAttemptReport);
router.get('/reports/assessment/:contextId/excel', ctrl.downloadAssessmentExcelReport);
router.get('/sessions/:id/report', ctrl.getReport);
router.get('/sessions/:id/excel', ctrl.downloadExcelReport);
router.get('/sessions/:id/status', ctrl.getStatus);

// Participant & Session Endpoints
router.use(requireUserId);
router.post('/sessions/start', ctrl.startSession);
router.post('/sessions/:id/start-test', ctrl.startTestTimer);
router.post('/sessions/:id/calibrate', ctrl.recordCalibration);
router.post('/sessions/:id/laptop/validate', ctrl.validateLaptop);
router.post('/sessions/:id/mobile/pair', ctrl.getMobilePairingQR);
router.post('/sessions/:id/video', uploadMonitoringVideo.single('video'), ctrl.uploadVideo);
router.post('/sessions/:id/events', ctrl.recordEvent);
router.post('/sessions/:id/end', ctrl.endSession);

module.exports = router;
