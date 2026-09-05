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
  if (!req.body.sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });
  try {
    const result = await require('../services/assessmentVerificationService').getReconnectQr({
      sessionId: req.body.sessionId, participantId: req.user.id,
    });
    res.json({ success: true, ...result });
  } catch (error) { res.status(403).json({ success: false, error: error.message }); }
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
  } catch (error) { res.status(403).json({ success: false, error: error.message }); }
});
router.post('/end', authenticateToken, ctrl.endVerificationSession);

module.exports = router;
