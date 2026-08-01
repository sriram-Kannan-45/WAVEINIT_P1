const express = require('express');
const authController = require('../controllers/authController');
const { sendOtp, verifyOtp, resetPassword, getEmailStatus, testMail, getSmtpStatus, rebuildSmtp } = require('../controllers/forgotPasswordController');
const authenticateToken = require('../middleware/auth');
const { ipLimiter, accountLock, trackOutcome } = require('../middleware/loginRateLimiter');
const { detectSqlInjection, detectXss } = require('../security/threatDetector');

const router = express.Router();

// Login — rate limited + brute force locked
router.post('/login',
  ipLimiter,
  accountLock,
  detectSqlInjection,
  detectXss,
  trackOutcome,
  (req, res) => authController.login(req, res)
);

// Register — brute force rate limited
router.post('/register', detectSqlInjection, detectXss, (req, res) => authController.register(req, res));

// Token refresh — no auth required (uses HttpOnly cookie or body)
router.post('/refresh', (req, res) => authController.refreshToken(req, res));

// Logout — requires valid access token
router.post('/logout', authenticateToken, (req, res) => authController.logout(req, res));

// Logout all sessions — requires valid access token
router.post('/logout-all', authenticateToken, (req, res) => authController.logoutAll(req, res));

// Active sessions — requires valid access token
router.get('/sessions', authenticateToken, (req, res) => authController.getSessions(req, res));

// Change password — requires valid access token
router.post('/change-password', authenticateToken, detectSqlInjection, (req, res) => authController.changePassword(req, res));

// Forgot password flow
router.post('/forgot-password/send-otp', ipLimiter, detectSqlInjection, sendOtp);
router.post('/forgot-password/verify-otp', detectSqlInjection, verifyOtp);
router.post('/forgot-password/reset', detectSqlInjection, resetPassword);
router.get('/forgot-password/email-status', getEmailStatus);
// Diagnostic — sends a real test email. Dev-only unless EMAIL_TEST_ENABLED=true
router.get('/forgot-password/test-mail', testMail);

// SMTP health — check config status + rebuild transporter without restart
router.get('/smtp-status', getSmtpStatus);
router.post('/smtp-rebuild', rebuildSmtp);

module.exports = router;
