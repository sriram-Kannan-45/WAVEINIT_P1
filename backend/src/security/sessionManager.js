/**
 * Session Manager — Enterprise session lifecycle management.
 *
 * Features:
 *   - Track all active sessions per user (device, IP, browser, location)
 *   - Suspicious login detection (new device, new IP, impossible travel)
 *   - IP change detection during session
 *   - Browser change detection during session
 *   - Session expiry for inactive sessions
 *   - View active sessions, logout current/all
 */

const crypto = require('crypto');
const { UserSession } = require('../models');
const { sequelize } = require('../config/db');
const logger = require('../utils/logger');

const SESSION_EXPIRY_DAYS = 7;
const INACTIVE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days inactive max

// ── Parse User-Agent string ────────────────────────────────────────────────
function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', deviceType: 'unknown' };

  let browser = 'Other';
  let os = 'Other';
  let deviceType = 'desktop';

  // Browser detection
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/edg/i.test(ua)) browser = 'Edge';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  // OS detection
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';

  // Device detection
  if (/mobile|android|iphone/i.test(ua)) deviceType = 'mobile';
  else if (/ipad|tablet/i.test(ua)) deviceType = 'tablet';

  return { browser, os, deviceType };
}

// ── Generate device ID from fingerprint ────────────────────────────────────
function generateDeviceId(userAgent, ip) {
  const raw = `${userAgent || ''}|${ip || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ── Calculate suspicious score ─────────────────────────────────────────────
function calculateSuspiciousScore(session, existingSessions) {
  let score = 0;
  const reasons = [];

  if (existingSessions.length === 0) {
    // First session ever — not suspicious
    return { score: 0, reasons: [] };
  }

  // New device
  const knownDeviceIds = new Set(existingSessions.map(s => s.deviceId));
  if (session.deviceId && !knownDeviceIds.has(session.deviceId)) {
    score += 30;
    reasons.push('NEW_DEVICE');
  }

  // New IP
  const knownIps = new Set(existingSessions.map(s => s.ipAddress));
  if (!knownIps.has(session.ipAddress)) {
    score += 20;
    reasons.push('NEW_IP');
  }

  // New browser
  const knownBrowsers = new Set(existingSessions.map(s => s.browser));
  if (session.browser && !knownBrowsers.has(session.browser)) {
    score += 15;
    reasons.push('NEW_BROWSER');
  }

  // New OS
  const knownOs = new Set(existingSessions.map(s => s.os));
  if (session.os && !knownOs.has(session.os)) {
    score += 15;
    reasons.push('NEW_OS');
  }

  // Too many concurrent sessions (>5)
  const activeCount = existingSessions.filter(s => s.isActive).length;
  if (activeCount >= 5) {
    score += 25;
    reasons.push('MULTIPLE_SESSIONS');
  }

  // Impossible travel (sessions from different IPs within short time)
  const recentSessions = existingSessions
    .filter(s => s.isActive)
    .filter(s => {
      const diff = Math.abs(Date.now() - new Date(s.loginAt).getTime());
      return diff < 30 * 60 * 1000; // Last 30 minutes
    });

  if (recentSessions.length > 0) {
    const differentIpSessions = recentSessions.filter(s => s.ipAddress !== session.ipAddress);
    if (differentIpSessions.length > 0) {
      score += 40;
      reasons.push('IMPOSSIBLE_TRAVEL');
    }
  }

  return { score: Math.min(score, 100), reasons };
}

// ── Create session on login ────────────────────────────────────────────────
async function createSession(user, req, tokenFamily) {
  const sessionId = crypto.randomUUID();
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection?.remoteAddress || '';
  const { browser, os, deviceType } = parseUserAgent(userAgent);
  const deviceId = generateDeviceId(userAgent, ip);

  // Get existing active sessions
  const existingSessions = await UserSession.findAll({
    where: { userId: user.id, isActive: true },
  });

  const { score, reasons } = calculateSuspiciousScore(
    { deviceId, ipAddress: ip, browser, os },
    existingSessions
  );

  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const session = await UserSession.create({
    userId: user.id,
    sessionId,
    family: tokenFamily,
    deviceId,
    ipAddress: ip,
    userAgent: userAgent.slice(0, 512),
    browser,
    os,
    deviceType,
    loginAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt,
    isActive: true,
    suspiciousScore: score,
    suspiciousReasons: reasons.length > 0 ? reasons : null,
  });

  if (score > 30) {
    logger.warn('[SECURITY] Suspicious login detected', {
      userId: user.id,
      score,
      reasons,
      ip,
      browser,
      os,
    });
  }

  return session;
}

// ── Update last activity timestamp ─────────────────────────────────────────
async function touchSession(sessionId) {
  try {
    await UserSession.update(
      { lastActivityAt: new Date() },
      { where: { sessionId, isActive: true } }
    );
  } catch (e) {
    // Non-critical — don't fail requests
  }
}

// ── Detect IP/browser change during session ────────────────────────────────
async function detectSessionDrift(sessionId, req) {
  const session = await UserSession.findOne({ where: { sessionId } });
  if (!session || !session.isActive) return { drifted: false };

  const currentIp = req.ip || req.connection?.remoteAddress || '';
  const currentUA = req.headers['user-agent'] || '';
  const { browser } = parseUserAgent(currentUA);

  const drifts = [];
  if (session.ipAddress !== currentIp) {
    drifts.push({ type: 'IP_CHANGE', from: session.ipAddress, to: currentIp });
  }
  if (session.browser !== browser) {
    drifts.push({ type: 'BROWSER_CHANGE', from: session.browser, to: browser });
  }

  if (drifts.length > 0) {
    logger.warn('[SECURITY] Session drift detected', {
      sessionId,
      userId: session.userId,
      drifts,
    });
    return { drifted: true, drifts, session };
  }

  return { drifted: false, session };
}

// ── Logout current session ─────────────────────────────────────────────────
async function logoutSession(sessionId) {
  await UserSession.update(
    { isActive: false, logoutAt: new Date() },
    { where: { sessionId } }
  );
}

// ── Logout all sessions for user ───────────────────────────────────────────
async function logoutAllSessions(userId) {
  await UserSession.update(
    { isActive: false, logoutAt: new Date() },
    { where: { userId, isActive: true } }
  );
}

// ── Get active sessions for user ───────────────────────────────────────────
async function getActiveSessions(userId) {
  return UserSession.findAll({
    where: { userId, isActive: true },
    attributes: [
      'sessionId', 'browser', 'os', 'deviceType', 'ipAddress',
      'location', 'loginAt', 'lastActivityAt', 'suspiciousScore',
      'suspiciousReasons', 'userAgent',
    ],
    order: [['loginAt', 'DESC']],
  });
}

// ── Expire inactive sessions (background job) ──────────────────────────────
async function expireStaleSessions() {
  const count = await UserSession.update(
    { isActive: false, logoutAt: new Date() },
    {
      where: {
        isActive: true,
        expiresAt: { [sequelize.Sequelize.Op.lt]: new Date() },
      },
    }
  );
  if (count[0] > 0) {
    logger.info(`[SessionManager] Expired ${count[0]} stale sessions`);
  }
}

// ── Cleanup old inactive sessions (background job) ─────────────────────────
async function cleanupOldSessions() {
  const cutoff = new Date(Date.now() - INACTIVE_EXPIRY_MS);
  const count = await UserSession.destroy({
    where: {
      isActive: false,
      logoutAt: { [sequelize.Sequelize.Op.lt]: cutoff },
    },
  });
  if (count > 0) {
    logger.info(`[SessionManager] Cleaned up ${count} old sessions`);
  }
}

module.exports = {
  createSession,
  touchSession,
  detectSessionDrift,
  logoutSession,
  logoutAllSessions,
  getActiveSessions,
  expireStaleSessions,
  cleanupOldSessions,
  parseUserAgent,
  generateDeviceId,
};
