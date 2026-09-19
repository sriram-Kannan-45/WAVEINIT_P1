const express = require('express');
const authController = require('../controllers/authController');
const { sendOtp, verifyOtp, resetPassword, getEmailStatus, testMail, getSmtpStatus, rebuildSmtp } = require('../controllers/forgotPasswordController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const { ipLimiter, accountLock, trackOutcome } = require('../middleware/loginRateLimiter');
const { detectSqlInjection, detectXss } = require('../security/threatDetector');
const {
  validateLogin,
  validateRegister,
  validateChangePassword,
  validateOtp,
  validateOtpVerify,
  validateResetPassword
} = require('../security/inputValidator');

const router = express.Router();

// Login — rate limited + brute force locked + input validated
router.post('/login',
  ipLimiter,
  accountLock,
  detectSqlInjection,
  detectXss,
  validateLogin,
  trackOutcome,
  (req, res) => authController.login(req, res)
);

// Register — brute force rate limited + input validated
router.post('/register',
  detectSqlInjection,
  detectXss,
  validateRegister,
  (req, res) => authController.register(req, res)
);

// Token refresh — no auth required (uses HttpOnly cookie or body)
router.post('/refresh', (req, res) => authController.refreshToken(req, res));

// Logout — requires valid access token
router.post('/logout', authenticateToken, (req, res) => authController.logout(req, res));

// Logout all sessions — requires valid access token
router.post('/logout-all', authenticateToken, (req, res) => authController.logoutAll(req, res));

// Active sessions — requires valid access token
router.get('/sessions', authenticateToken, (req, res) => authController.getSessions(req, res));

// Change password — requires valid access token + input validated
router.post('/change-password',
  authenticateToken,
  detectSqlInjection,
  validateChangePassword,
  (req, res) => authController.changePassword(req, res)
);

// Forgot password flow + input validated
router.post('/forgot-password/send-otp', ipLimiter, detectSqlInjection, validateOtp, sendOtp);
router.post('/forgot-password/verify-otp', detectSqlInjection, validateOtpVerify, verifyOtp);
router.post('/forgot-password/reset', detectSqlInjection, validateResetPassword, resetPassword);
router.get('/forgot-password/email-status', getEmailStatus);
// Diagnostic — sends a real test email. Dev-only unless EMAIL_TEST_ENABLED=true
router.get('/forgot-password/test-mail', authenticateToken, roleMiddleware('ADMIN'), testMail);

// SMTP health — check config status + rebuild transporter without restart (ADMIN only)
router.get('/smtp-status', authenticateToken, roleMiddleware('ADMIN'), getSmtpStatus);
router.post('/smtp-rebuild', authenticateToken, roleMiddleware('ADMIN'), rebuildSmtp);

module.exports = router;
