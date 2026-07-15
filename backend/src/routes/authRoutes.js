const express = require('express');
const authController = require('../controllers/authController');
const { sendOtp, verifyOtp, resetPassword, getEmailStatus, testMail } = require('../controllers/forgotPasswordController');
const authenticateToken = require('../middleware/auth');
const { ipLimiter, accountLock, trackOutcome } = require('../middleware/loginRateLimiter');

const router = express.Router();

router.post('/login', ipLimiter, accountLock, trackOutcome, (req, res) => authController.login(req, res));
router.post('/logout', authenticateToken, (req, res) => authController.logout(req, res));
router.post('/register', (req, res) => authController.register(req, res));
router.post('/change-password', authenticateToken, (req, res) => authController.changePassword(req, res));

// Forgot password flow
router.post('/forgot-password/send-otp', sendOtp);
router.post('/forgot-password/verify-otp', verifyOtp);
router.post('/forgot-password/reset', resetPassword);
router.get('/forgot-password/email-status', getEmailStatus);
// Diagnostic — sends a real test email. Dev-only unless EMAIL_TEST_ENABLED=true
router.get('/forgot-password/test-mail', testMail);

module.exports = router;