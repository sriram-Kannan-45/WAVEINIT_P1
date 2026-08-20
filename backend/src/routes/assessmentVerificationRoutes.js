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
router.get('/status/:sessionId', authenticateToken, ctrl.getStatus);
router.post('/laptop-connected', authenticateToken, ctrl.laptopCameraConnected);
router.post('/verify-start', authenticateToken, ctrl.verifyAndStart);
router.post('/end', authenticateToken, ctrl.endVerificationSession);

module.exports = router;
