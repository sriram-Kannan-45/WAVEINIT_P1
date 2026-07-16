// backend/src/config/mailer.js
//
// Singleton Nodemailer transporter for the whole app.
// - Built once at module load.
// - Verified at startup (non-blocking).
// - Reused across all requests (connection pool).
// - Supports both GMAIL_USER/GMAIL_APP_PASS and EMAIL_USER/EMAIL_PASS env names.
//
// Public API:
//   transporter            — the underlying nodemailer transport (or null if not configured)
//   sendOtpEmail(email, otp, opts) — sends the branded OTP email
//   isEmailConfigured()    — true if real (non-placeholder) credentials are set
//   getMailerStatus()      — { configured, ready, host, port, from }
//   explainSmtpError(err)  — logs actionable hints for common SMTP failures
//   sendTestEmail(to)      — fires a diagnostic email; resolves with { messageId } or rejects

const nodemailer = require('nodemailer');

const GMAIL_USER = (process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();
// Google shows App Passwords as `xxxx xxxx xxxx xxxx` — strip every whitespace
// character so a paste-as-shown still works. Nodemailer rejects pwds with spaces.
const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASS || process.env.EMAIL_PASS || '')
  .replace(/\s+/g, '');
const HOST = (process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
const PORT = parseInt(process.env.EMAIL_PORT || '465', 10);
const APP_NAME = process.env.APP_NAME || 'FeedWeb';

const PLACEHOLDER_PATTERN = /your-email|example\.com|your-gmail-app-password|change-me|yourgmail/i;

function isEmailConfigured() {
  if (!GMAIL_USER || !GMAIL_APP_PASS) return false;
  if (PLACEHOLDER_PATTERN.test(`${GMAIL_USER} ${GMAIL_APP_PASS}`)) return false;
  return true;
}

let transporter = null;
let ready = false;

function build() {
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

function explainSmtpError(err) {
  const msg = (err && err.message) || '';
  const code = (err && err.code) || '';
  if (code === 'EAUTH' || /535|BadCredentials|Username and Password not accepted/i.test(msg)) {
    console.error('   → Gmail rejected the credentials. Fix:');
    console.error('     1. Enable 2-Step Verification: https://myaccount.google.com/security');
    console.error('     2. Create an App Password:     https://myaccount.google.com/apppasswords');
    console.error('     3. Put the 16-char password (no spaces) in backend/.env as GMAIL_APP_PASS');
    console.error('     4. Restart the backend');
  } else if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || /timeout|ENOTFOUND/i.test(msg)) {
    console.error('   → Network/SMTP unreachable. Check firewall / outbound port 465 / try EMAIL_PORT=587');
  } else if (/self.signed|certificate/i.test(msg)) {
    console.error('   → TLS certificate issue. On corporate networks try EMAIL_PORT=587');
  }
}

if (isEmailConfigured()) {
  transporter = build();
  // Non-blocking startup verification with exponential-backoff retry.
  // Tries 3 times — handles transient network/Gmail blips on boot.
  (async function verifyWithRetry() {
    const delays = [0, 2_000, 8_000]; // attempt at 0s, 2s, 8s
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
      try {
        await transporter.verify();
        ready = true;
        console.log(`✅ SMTP Connected (${HOST}:${PORT}). Ready to send emails as ${GMAIL_USER}`);
        return;
      } catch (err) {
        const attempt = i + 1;
        console.error(`❌ SMTP verify attempt ${attempt}/${delays.length} failed: ${err.message}`);
        if (attempt === delays.length) {
          ready = false;
          explainSmtpError(err);
          console.error('   Will still attempt to send mail on demand — fix creds and restart for full health.');
        }
      }
    }
  })();
} else {
  const placeholderHint = GMAIL_USER && PLACEHOLDER_PATTERN.test(`${GMAIL_USER} ${GMAIL_APP_PASS}`)
    ? '(value matches placeholder pattern — replace with real credentials)'
    : '(env var unset)';
  console.warn('');
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn('⚠️  EMAIL DELIVERY DISABLED — Mailer not configured');
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn(`   GMAIL_USER     = ${GMAIL_USER || '(unset)'} ${placeholderHint}`);
  console.warn(`   GMAIL_APP_PASS = ${GMAIL_APP_PASS ? '(' + GMAIL_APP_PASS.length + ' chars)' : '(unset)'} ${placeholderHint}`);
  console.warn('');
  console.warn('   To enable real email delivery:');
  console.warn('     1. Enable 2-Step Verification:  https://myaccount.google.com/security');
  console.warn('     2. Create an App Password:      https://myaccount.google.com/apppasswords');
  console.warn('     3. Paste the 16-char password (NO spaces) as GMAIL_APP_PASS in backend/.env');
  console.warn('     4. Restart the backend');
  console.warn('');
  console.warn('   Until configured, OTPs are printed to THIS console.');
  console.warn('   The /forgot-password/send-otp API also returns devOtp in non-production mode.');
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn('');
}

function getMailerStatus() {
  return {
    configured: isEmailConfigured(),
    ready,
    host: HOST,
    port: PORT,
    from: GMAIL_USER || null,
  };
}

function otpEmailHtml({ otp, expiresInMinutes, brand = APP_NAME }) {
  const year = new Date().getFullYear();
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.06);overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:28px 32px;color:#fff">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85">${brand}</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.02em">Password Reset Code</h1>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;color:#334155;font-size:14.5px;line-height:1.55">
          <p style="margin:0 0 8px">Hi there,</p>
          <p style="margin:0 0 18px">Use the verification code below to reset your password. This code is valid for <strong>${expiresInMinutes} minutes</strong>.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 8px">
          <div style="display:inline-block;background:#eff6ff;border:1px solid #dbeafe;border-radius:14px;padding:18px 28px">
            <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:14px;color:#1d4ed8">${otp}</div>
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px 8px;color:#334155;font-size:13.5px;line-height:1.6">
          <p style="margin:0 0 6px"><strong>Security tips:</strong></p>
          <ul style="margin:0 0 8px;padding-left:18px;color:#475569">
            <li>Never share this code with anyone — not even ${brand} staff.</li>
            <li>If you didn't request a password reset, ignore this email and consider changing your password.</li>
          </ul>
        </td></tr>
        <tr><td style="padding:14px 32px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.55">
          This is an automated message — please do not reply.<br>
          © ${year} ${brand}. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendOtpEmail(email, otp, { expiresInMinutes = 5 } = {}) {
  if (!transporter) throw new Error('Mailer not configured');
  const info = await transporter.sendMail({
    from: `"${APP_NAME} Support" <${GMAIL_USER}>`,
    to: email,
    subject: `Your password reset code: ${otp}`,
    text: `Your ${APP_NAME} password reset code is ${otp}. It expires in ${expiresInMinutes} minutes. If you didn't request this, ignore this email.`,
    html: otpEmailHtml({ otp, expiresInMinutes }),
  });
  console.log(`[MAIL SUCCESS] OTP email sent to ${email} | MessageID: ${info.messageId}`);
  return info;
}

function credentialsEmailHtml({ participantName, trainingName, participantId, temporaryPassword, loginUrl, brand = APP_NAME }) {
  const year = new Date().getFullYear();
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.06);overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#0D9488,#0f766e);padding:28px 32px;color:#fff">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85">${brand}</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.02em">Welcome to ${brand}!</h1>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;color:#334155;font-size:14.5px;line-height:1.6">
          <p style="margin:0 0 12px">Hello <strong>${participantName}</strong>,</p>
          <p style="margin:0 0 12px">Your registration has been approved! Below are your login credentials.</p>
        </td></tr>
        <tr><td style="padding:8px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0">
              <span style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Training Program</span>
              <div style="font-size:15px;font-weight:600;color:#0f172a;margin-top:4px">${trainingName}</div>
            </td></tr>
            <tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0">
              <span style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Participant ID</span>
              <div style="font-size:18px;font-weight:800;color:#0D9488;margin-top:4px;font-family:'SF Mono',Menlo,Consolas,monospace">${participantId}</div>
            </td></tr>
            <tr><td style="padding:14px 20px">
              <span style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Temporary Password</span>
              <div style="font-size:18px;font-weight:800;color:#0D9488;margin-top:4px;font-family:'SF Mono',Menlo,Consolas,monospace">${temporaryPassword}</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 8px" align="center">
          <a href="${loginUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#0D9488,#0f766e);color:#fff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;box-shadow:0 2px 8px rgba(13,148,136,0.3)">Login to ${brand}</a>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;color:#334155;font-size:13px;line-height:1.6">
          <p style="margin:0 0 8px;color:#dc2626;font-weight:600">Important: Please change your password after your first login for security.</p>
          <p style="margin:0;color:#64748b;font-size:12px">Do not share these credentials with anyone.</p>
        </td></tr>
        <tr><td style="padding:14px 32px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.55">
          This is an automated message — please do not reply.<br>
          &copy; ${year} ${brand}. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendCredentialsEmail({ to, participantName, trainingName, participantId, temporaryPassword, loginUrl }) {
  if (!transporter) throw new Error('Mailer not configured');
  const info = await transporter.sendMail({
    from: `"${APP_NAME} Support" <${GMAIL_USER}>`,
    to,
    subject: `Welcome to ${APP_NAME} — Your Login Credentials`,
    text: `Hello ${participantName},\n\nYour registration has been approved!\n\nTraining: ${trainingName}\nParticipant ID: ${participantId}\nTemporary Password: ${temporaryPassword}\n\nLogin: ${loginUrl}\n\nPlease change your password after your first login.\n\nRegards,\n${APP_NAME} LMS`,
    html: credentialsEmailHtml({ participantName, trainingName, participantId, temporaryPassword, loginUrl }),
  });
  console.log(`[MAIL SUCCESS] Credentials email sent to ${to} | MessageID: ${info.messageId}`);
  return info;
}

async function sendTestEmail(to) {
  if (!transporter) throw new Error('Mailer not configured (set GMAIL_USER + GMAIL_APP_PASS in backend/.env)');
  const info = await transporter.sendMail({
    from: `"${APP_NAME} Diagnostic" <${GMAIL_USER}>`,
    to,
    subject: `${APP_NAME} SMTP test`,
    text: `Hello! This is a test email from ${APP_NAME}. If you can read this, SMTP is working.`,
    html: `<div style="font-family:sans-serif;padding:24px"><h2>SMTP test ✅</h2><p>If you can read this, your ${APP_NAME} mailer is correctly configured.</p><p style="color:#94a3b8;font-size:12px">Sent at ${new Date().toISOString()}</p></div>`,
  });
  console.log(`[MAIL TEST] sent to ${to} | MessageID: ${info.messageId}`);
  return info;
}

module.exports = {
  transporter,
  sendOtpEmail,
  sendCredentialsEmail,
  sendTestEmail,
  isEmailConfigured,
  getMailerStatus,
  explainSmtpError,
};
