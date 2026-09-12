/**
 * Assessment Verification Routes
 * Routes for Quiz and Coding assessment QR pairing and verification.
 */
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const ctrl = require('../controllers/assessmentVerificationController');

// ── Public Mobile Endpoints (scanned from phone) ──
router.post('/mobile-validate', ctrl.validateMobileToken);
router.post('/mobile-connected', ctrl.mobileCameraConnected);
router.get('/mobile-status/:token', ctrl.getMobileStatus);

// ── Authenticated Participant Endpoints (Laptop browser) ──
router.post('/initiate', authenticateToken, ctrl.initiateVerification);
router.post('/refresh', authenticateToken, ctrl.refreshQr);
router.post('/reconnect', authenticateToken, async (req, res) => {
  const sessionId = req.body.sessionId || req.body.monitoringSessionId || null;
  const attemptId = req.body.attemptId ? Number(req.body.attemptId) : null;
  const assessmentType = (req.body.assessmentType || req.body.contextType || 'QUIZ').toUpperCase();
  const assessmentId = req.body.assessmentId || req.body.contextId ? Number(req.body.assessmentId || req.body.contextId) : null;

  if (!sessionId && !attemptId) {
    return res.status(400).json({ success: false, error: 'sessionId or attemptId is required' });
  }

  try {
    const result = await require('../services/assessmentVerificationService').getReconnectQr({
      sessionId,
      participantId: req.user.id,
      attemptId,
      assessmentType,
      assessmentId,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    const isClientSafe = error.message && !error.message.includes('Sequelize') && !error.message.includes('database');
    res.status(403).json({ success: false, error: isClientSafe ? error.message : 'Verification access denied' });
  }
});
router.get('/status/:sessionId', authenticateToken, ctrl.getStatus);
router.post('/laptop-connected', authenticateToken, ctrl.laptopCameraConnected);
router.post('/verify-start', authenticateToken, ctrl.verifyAndStart);
router.get('/admission/:assessmentType/:attemptId', authenticateToken, async (req, res) => {
  try {
    await require('../services/assessmentVerificationService').assertAttemptAdmitted({
      participantId: req.user.id, assessmentType: req.params.assessmentType.toUpperCase(), attemptId: Number(req.params.attemptId),
    });
    res.json({ success: true });
  } catch (error) {
    const isClientSafe = error.message && !error.message.includes('Sequelize') && !error.message.includes('database');
    res.status(403).json({ success: false, error: isClientSafe ? error.message : 'Assessment admission denied' });
  }
});
router.post('/end', authenticateToken, ctrl.endVerificationSession);

module.exports = router;
