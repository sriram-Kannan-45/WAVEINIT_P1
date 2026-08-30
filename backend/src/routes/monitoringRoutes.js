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
router.post('/sessions/:id/pause-test', ctrl.pauseTestTimer);
router.post('/sessions/:id/resume-test', ctrl.resumeTestTimer);
router.post('/sessions/:id/sync-duration', ctrl.syncTestDuration);
router.post('/sessions/:id/calibrate', ctrl.recordCalibration);
router.post('/sessions/:id/laptop/validate', ctrl.validateLaptop);
router.post('/sessions/:id/mobile/pair', ctrl.getMobilePairingQR);
router.post('/sessions/:id/video', uploadMonitoringVideo.single('video'), ctrl.uploadVideo);
router.post('/sessions/:id/events', ctrl.recordEvent);
router.post('/sessions/:id/end', ctrl.endSession);

// Recorded-video async segment pipeline
router.post('/sessions/:id/segments/register', ctrl.registerSegment);
router.post('/sessions/:id/segments/:segmentKey/finalize', ctrl.finalizeSegment);
router.post('/sessions/:id/segments/:segmentKey/video', uploadMonitoringVideo.single('video'), ctrl.uploadSegment);
router.get('/sessions/:id/segments', ctrl.listSegments);
router.get('/sessions/:id/pipeline', ctrl.getPipelineStatus);

module.exports = router;
