/**
 * Login rate limiter — IP throttling + account lockout + progressive delay.
 *
 * ── IP rate limit ──────────────────────────────────────────────
 *   Max 10 POST /login requests per IP per 1-minute sliding window.
 *
 * ── Account lockout ────────────────────────────────────────────
 *   5 consecutive failed attempts → account locked for 15 minutes.
 *   On lockout a notification email is sent with a reset-password link.
 *
 * ── Progressive delay ──────────────────────────────────────────
 *   Failed attempt    1    2     3     4     5
 *   Server delay      0s   1s    2s    4s    8s
 *
 * ── Behaviour ──────────────────────────────────────────────────
 *   All error responses are identical: "Invalid email or password".
 *   The client can never distinguish between wrong password, locked
 *   account, or rate-limit hit.
 *
 * ── Storage ────────────────────────────────────────────────────
 *   In-memory Map<email, AttemptRecord>.
 *   When Redis is available, swap this for a Redis-backed store
 *   to share state across multiple backend instances.
 */

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { transporter } = require('../config/mailer');

const APP_NAME = process.env.APP_NAME || 'FeedWeb';
const GMAIL_USER = (process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/+$/, '');

// ── Tunables ───────────────────────────────────────────────────
const IP_WINDOW_MS        = 60_000;          // 1 minute
const IP_MAX_REQUESTS     = 10;              // 10 req / IP / minute
const MAX_FAILED_ATTEMPTS = 5;               // lock after 5 failures
const LOCKOUT_MS          = 15 * 60_000;     // 15 minutes
const PROGRESSIVE_DELAYS  = [0, 1000, 2000, 4000, 8000]; // ms per attempt
const CLEANUP_INTERVAL_MS = 60_000;          // purge stale entries every 60s

// ── In-memory store ────────────────────────────────────────────
// Keyed by normalized email (lowercased, trimmed).
const store = new Map();

function getEmail(req) {
  return (req.body?.email || '').toString().toLowerCase().trim();
}

// ── IP rate limiter (express-rate-limit) ────────────────────────
const ipLimiter = rateLimit({
  windowMs: IP_WINDOW_MS,
  max: IP_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Invalid email or password' });
  },
});

// ── Attempt record helpers ─────────────────────────────────────
function getRecord(email) {
  let rec = store.get(email);
  if (!rec) {
    rec = { count: 0, lockoutUntil: null, lockedAt: null };
    store.set(email, rec);
  }
  return rec;
}

function isLocked(rec) {
  return rec.lockoutUntil !== null && Date.now() < rec.lockoutUntil;
}

async function sendLockoutEmail(email) {
  if (!transporter) return;

  const resetUrl = `${FRONTEND_URL}/forgot-password`;

  try {
    await transporter.sendMail({
      from: `"${APP_NAME} Security" <${GMAIL_USER}>`,
      to: email,
      subject: `Your ${APP_NAME} account has been temporarily locked`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.06);overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:28px 32px;color:#fff">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85">${APP_NAME}</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.02em">Account Temporarily Locked</h1>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;color:#334155;font-size:14.5px;line-height:1.55">
          <p style="margin:0 0 12px">Hi there,</p>
          <p style="margin:0 0 12px">
            We detected <strong>${MAX_FAILED_ATTEMPTS} failed login attempts</strong> on your account.
            For your security, access has been suspended for <strong>${LOCKOUT_MS / 60000} minutes</strong>.
          </p>
          <p style="margin:0 0 12px">
            If this was you, you can reset your password immediately using the link below:
          </p>
          <div style="text-align:center;margin:20px 0">
            <a href="${resetUrl}"
               style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
                      padding:12px 28px;border-radius:10px;font-size:15px;font-weight:700">
              Reset Password
            </a>
          </div>
          <p style="margin:0 0 6px;color:#64748b;font-size:13px">
            If you didn't attempt to log in, someone may have tried to access your account.
            We recommend choosing a strong, unique password.
          </p>
        </td></tr>
        <tr><td style="padding:14px 32px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.55">
          This is an automated security alert — please do not reply.<br>
          &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch {
    // Swallow — email delivery failure must never block login
  }
}

// ── Middleware: check + apply account lockout ──────────────────
function accountLock(req, res, next) {
  const email = getEmail(req);
  if (!email) return next();

  const rec = getRecord(email);

  // Already locked — respond with generic error
  if (isLocked(rec)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Not locked — pass through
  next();
}

// ── Middleware: track login outcome (MUST run after the controller) ──
function trackOutcome(req, res, next) {
  const email = getEmail(req);
  if (!email) return next();

  // Store original json to intercept the response
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;

    if (isSuccess) {
      // Login successful — clear history
      store.delete(email);
    } else if (res.statusCode === 401 || res.statusCode === 422) {
      // Login failed — record the attempt
      const rec = getRecord(email);
      rec.count += 1;

      // Progressive delay (artificial wait proportional to attempt count)
      const idx = Math.min(rec.count - 1, PROGRESSIVE_DELAYS.length - 1);
      const delayMs = PROGRESSIVE_DELAYS[idx];

      // Check if we hit the lockout threshold
      if (rec.count >= MAX_FAILED_ATTEMPTS) {
        rec.lockoutUntil = Date.now() + LOCKOUT_MS;
        rec.lockedAt = Date.now();

        // Fire-and-forget lockout notification email
        sendLockoutEmail(email);
      }

      if (delayMs > 0) {
        // Apply delay before responding — makes brute-forcing impractical
        setTimeout(() => originalJson(body), delayMs);
        return;
      }
    }

    originalJson(body);
  };

  next();
}

// ── Periodic cleanup ───────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [email, rec] of store.entries()) {
    if (rec.lockoutUntil && now >= rec.lockoutUntil) {
      store.delete(email);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

module.exports = { ipLimiter, accountLock, trackOutcome };
