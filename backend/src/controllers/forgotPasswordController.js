const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;
const { Op } = require('sequelize');
const { User, PasswordResetOtp } = require('../models');
const {
  sendOtpEmail,
  sendTestEmail,
  isEmailConfigured,
  getMailerStatus,
  explainSmtpError,
} = require('../config/mailer');

// ── Rate limit + cooldown state (in-memory; per-process) ──────────
const rateEmailMap = new Map(); // email -> { count, windowStart }
const rateIpMap    = new Map(); // ip    -> { count, windowStart }
const lastSendMap  = new Map(); // email -> ts of last successful OTP send

const RATE_LIMIT_EMAIL = 3;             // 3 sends per email per window  (spec)
const RATE_LIMIT_IP    = 10;            // 10 sends per IP per window
const RATE_WINDOW_MS   = 5 * 60 * 1000; // 5 minutes
const OTP_TTL_MS       = 5 * 60 * 1000; // 5-minute OTP validity
const RESEND_COOLDOWN_MS = 60 * 1000;   // 60s between OTP requests for same email
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min to complete the reset after verifying

function bumpAndCheck(map, key, limit) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    const retryAfterSec = Math.ceil((RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { ok: false, retryAfterSec };
  }
  entry.count++;
  return { ok: true, remaining: limit - entry.count };
}

// Cryptographically secure 6-digit OTP (no Math.random)
function generateOtp() {
  return String(crypto.randomInt(100000, 1_000_000));
}

// Background email dispatcher — never blocks the HTTP response
function dispatchOtpEmail(email, otp) {
  if (!isEmailConfigured()) {
    console.warn('⚠️  GMAIL_USER/GMAIL_APP_PASS not configured (placeholder values).');
    console.warn('   Set a real Gmail App Password in backend/.env to enable email delivery.');
    return;
  }
  setImmediate(() => {
    sendOtpEmail(email, otp, { expiresInMinutes: Math.round(OTP_TTL_MS / 60000) })
      .catch(mailErr => {
        console.error(`[MAIL ERROR] Failed to send OTP to ${email}:`, mailErr.message);
        if (mailErr.code) console.error('   error code:', mailErr.code);
        if (mailErr.response) console.error('   smtp response:', mailErr.response);
        explainSmtpError(mailErr);
      });
  });
}

// POST /api/auth/forgot-password/send-otp
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(422).json({ error: 'Valid email is required' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    // Per-IP first — broad protection, applied before DB lookup
    const ipCheck = bumpAndCheck(rateIpMap, ip || 'unknown', RATE_LIMIT_IP);
    if (!ipCheck.ok) {
      return res.status(429).json({
        error: `Too many requests from your network. Try again in ${Math.ceil(ipCheck.retryAfterSec / 60)} minute(s).`,
      });
    }

    // Look up user FIRST — unknown emails should not burn the per-email quota
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Project requirement: be explicit when the email isn't registered so
      // students don't sit waiting for an OTP that will never arrive.
      // (Anti-enumeration is intentionally relaxed here for an internal LMS.)
      return res.status(404).json({
        error: 'Email not registered. Please check the address or register first.',
      });
    }

    // Per-email 60-second cooldown (matches frontend resend timer)
    const lastSent = lastSendMap.get(email);
    if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another OTP.` });
    }

    // Per-email window: 3 sends per 5 minutes (spec)
    const emailCheck = bumpAndCheck(rateEmailMap, email, RATE_LIMIT_EMAIL);
    if (!emailCheck.ok) {
      return res.status(429).json({
        error: `Too many OTP requests for this email. Try again in ${Math.ceil(emailCheck.retryAfterSec / 60)} minute(s).`,
      });
    }

    // Invalidate previous unused OTPs for this email
    await PasswordResetOtp.update({ used: true }, { where: { email, used: false } });

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, BCRYPT_COST);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await PasswordResetOtp.create({ email, otpHash, expiresAt, used: false, ip });
    lastSendMap.set(email, Date.now());

    // Fire-and-forget the email — respond to the client immediately
    dispatchOtpEmail(email, otp);

    return res.status(200).json({ message: 'OTP sent successfully. Please check your inbox.' });
  } catch (err) {
    console.error('[FORGOT PASSWORD ERROR]', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
};

// POST /api/auth/forgot-password/verify-otp
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(422).json({ error: 'Email and OTP are required' });
    }

    const record = await PasswordResetOtp.findOne({
      where: { email, used: false, expiresAt: { [Op.gt]: new Date() } },
      order: [['created_at', 'DESC']],
    });

    if (!record) {
      return res.status(400).json({ error: 'OTP expired or not found. Please request a new one.' });
    }

    const valid = await bcrypt.compare(String(otp), record.otpHash);
    if (!valid) {
      // Track failed attempts to thwart brute-force
      const newAttempts = (record.attempts || 0) + 1;
      const MAX_ATTEMPTS = 5;
      if (newAttempts >= MAX_ATTEMPTS) {
        await record.update({ attempts: newAttempts, used: true });
        return res.status(429).json({
          error: 'Too many incorrect attempts. Please request a new OTP.',
        });
      }
      await record.update({ attempts: newAttempts });
      const remaining = MAX_ATTEMPTS - newAttempts;
      return res.status(400).json({
        error: `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      });
    }

    // Consume the OTP so it can't be replayed
    await record.update({ used: true });

    // Issue a short-lived random reset token (no JWT needed — store hash in DB)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, BCRYPT_COST);
    const tokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await PasswordResetOtp.create({
      email,
      otpHash: resetTokenHash,
      expiresAt: tokenExpiry,
      used: false,
    });

    // Also clear the per-email cooldown so the user can immediately retry if needed
    lastSendMap.delete(email);

    return res.json({ message: 'OTP verified successfully.', resetToken });
  } catch (err) {
    console.error('[VERIFY OTP ERROR]', err);
    return res.status(500).json({ error: 'OTP verification failed' });
  }
};

// POST /api/auth/forgot-password/reset
const resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(422).json({ error: 'Email, reset token, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }

    const record = await PasswordResetOtp.findOne({
      where: { email, used: false, expiresAt: { [Op.gt]: new Date() } },
      order: [['created_at', 'DESC']],
    });

    if (!record) {
      return res.status(400).json({ error: 'Reset session expired. Please start over.' });
    }

    const valid = await bcrypt.compare(resetToken, record.otpHash);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);
    await user.update({ password: hashedPassword, passwordVersion: 2 });

    // Invalidate the reset token + any leftover OTPs for this email
    await record.update({ used: true });
    await PasswordResetOtp.update({ used: true }, { where: { email, used: false } });

    // Reset rate-limit counters for this email so user can sign in cleanly
    rateEmailMap.delete(email);
    lastSendMap.delete(email);

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[RESET PASSWORD ERROR]', err);
    return res.status(500).json({ error: 'Password reset failed' });
  }
};

// GET /api/auth/forgot-password/email-status — diagnostic
const getEmailStatus = async (_req, res) => {
  return res.json(getMailerStatus());
};

// GET /api/auth/forgot-password/test-mail?to=foo@bar.com — DEV-ONLY
// Sends a real test email so you can confirm SMTP delivery end-to-end.
// Disabled in production unless EMAIL_TEST_ENABLED=true is set.
const testMail = async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.EMAIL_TEST_ENABLED !== 'true') {
    return res.status(403).json({ error: 'Test mail endpoint is disabled in production' });
  }
  const to = (req.query.to || '').toString().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(422).json({ error: 'Provide ?to=<email>' });
  }
  if (!isEmailConfigured()) {
    return res.status(503).json({
      error: 'Mailer not configured',
      hint: 'Set GMAIL_USER and GMAIL_APP_PASS in backend/.env, then restart the backend',
      status: getMailerStatus(),
    });
  }
  try {
    const info = await sendTestEmail(to);
    return res.json({
      ok: true,
      to,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
  } catch (err) {
    console.error('[TEST MAIL ERROR]', err.message);
    explainSmtpError(err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      code: err.code || null,
      hint: 'Check the backend console for actionable details',
    });
  }
};

// Background OTP cleanup — call periodically to delete expired/used rows
// (replaces MongoDB TTL index since we use Sequelize/MySQL).
async function cleanupExpiredOtps() {
  try {
    const { count } = await PasswordResetOtp.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: new Date() } },
          { used: true, created_at: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }).then(rows => ({ count: rows }));
    if (count > 0) console.log(`[OTP CLEANUP] removed ${count} expired/used OTP rows`);
  } catch (err) {
    console.error('[OTP CLEANUP ERROR]', err.message);
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  resetPassword,
  getEmailStatus,
  testMail,
  cleanupExpiredOtps,
};
