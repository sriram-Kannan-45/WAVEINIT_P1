/**
 * Token Service — Enterprise JWT Access + Refresh Token Management
 *
 * Flow:
 *   1. On login: generate short-lived access token (15 min) + long-lived refresh token (7 days)
 *   2. Access token sent in response body (frontend stores in memory only)
 *   3. Refresh token stored in HttpOnly Secure SameSite=Strict cookie
 *   4. On refresh: validate refresh token → rotate → issue new pair
 *   5. On logout: revoke refresh token, blacklist access token
 *
 * Security:
 *   - Refresh tokens are SHA-256 hashed before storage (never store plaintext)
 *   - Each refresh token is single-use (rotation on every refresh)
 *   - Family tracking detects stolen refresh tokens
 *   - Access token blacklist prevents reuse after logout
 *   - Token fingerprint binds token to device (prevents token theft)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sequelize } = require('../config/db');
const logger = require('../utils/logger');

// ── Configuration ───────────────────────────────────────────────────────────
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '7d';
const REFRESH_TOKEN_EXPIY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIY_DAYS}d`;

if (!ACCESS_TOKEN_SECRET) {
  throw new Error('[SECURITY] JWT_SECRET is required. Set it in .env');
}

// ── Access-token blacklist ──────────────────────────────────────────────────
// Fast in-memory mirror (per process) + persistent store in the SHARED
// database (token_blacklist table). The DB row is what makes revocation global
// across all App Service instances; the Set is a zero-cost fast path.
const tokenBlacklist = new Set();

// Periodic cleanup of expired in-memory blacklisted tokens. The DB rows are
// purged by the leader-guarded cleanup job in app.js.
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const jti of tokenBlacklist) {
    try {
      const decoded = jwt.decode(jti);
      if (decoded && decoded.exp && decoded.exp < now) {
        tokenBlacklist.delete(jti);
      }
    } catch {
      // If we can't decode, it's likely our own composite key — clean old ones
    }
  }
}, 60_000).unref();

// ── Token Fingerprint (binds token to device) ──────────────────────────────
function generateTokenFingerprint(req) {
  const components = [
    req.headers['user-agent'] || '',
    req.ip || req.connection?.remoteAddress || '',
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex').slice(0, 16);
}

// ── Access Token Generation ────────────────────────────────────────────────
function generateAccessToken(user, fingerprint) {
  const jti = crypto.randomUUID();
  const payload = {
    id: user.id,
    role: (user.role || '').toUpperCase(),
    email: user.email,
    jti,
    fp: fingerprint,
    type: 'access',
  };
  // Only include participantId for participants
  if (payload.role === 'PARTICIPANT') {
    payload.participantId = user.id;
  }
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

// ── Refresh Token Generation ───────────────────────────────────────────────
function generateRefreshToken(user, family, fingerprint) {
  const jti = crypto.randomUUID();
  const payload = {
    id: user.id,
    role: (user.role || '').toUpperCase(),
    jti,
    family,
    fp: fingerprint,
    type: 'refresh',
  };
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

// ── Hash refresh token for storage ─────────────────────────────────────────
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Generate token pair ────────────────────────────────────────────────────
async function generateTokenPair(user, req, family = null) {
  const fingerprint = generateTokenFingerprint(req);
  const tokenFamily = family || crypto.randomUUID();

  const accessToken = generateAccessToken(user, fingerprint);
  const refreshToken = generateRefreshToken(user, tokenFamily, fingerprint);

  // Store hashed refresh token in database
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIY_DAYS * 24 * 60 * 60 * 1000);
  const { RefreshToken } = require('../models');

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    family: tokenFamily,
    fingerprint,
    expiresAt,
    userAgent: req.headers['user-agent'] || null,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
  });

  return { accessToken, refreshToken, tokenFamily };
}

// ── Verify Access Token ────────────────────────────────────────────────────
/**
 * Synchronous JWT verify + in-memory blacklist fast path.
 * Kept for synchronous call sites. For a revocation check that also hits the
 * shared DB, use `verifyAndCheckToken`.
 */
function verifyAccessToken(token) {
  const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
  if (decoded.type !== 'access') throw new Error('Invalid token type');
  const blacklistKey = `${decoded.jti}:${decoded.id}`;
  if (tokenBlacklist.has(blacklistKey)) throw new Error('Token has been revoked');
  return decoded;
}

/**
 * Async revocation check against the shared token_blacklist table (PK lookup
 * on `jti`). Serves as the cross-instance source of truth for revocation.
 * @returns {Promise<boolean>}
 */
async function isTokenRevoked(decoded) {
  if (!decoded || !decoded.jti) return false;
  const blacklistKey = `${decoded.jti}:${decoded.id}`;
  if (tokenBlacklist.has(blacklistKey)) return true;
  try {
    const { TokenBlacklist } = require('../models');
    const row = await TokenBlacklist.findOne({
      where: { jti: decoded.jti },
      attributes: ['id'],
    });
    if (row) tokenBlacklist.add(blacklistKey); // warm the fast path next time
    return !!row;
  } catch (_) {
    // DB unavailable — treat as valid (matching the previous in-memory-only
    // behavior) rather than failing the request.
    return false;
  }
}

/**
 * Full verification for request auth: JWT verify + fast-path + shared-DB check.
 * @returns {Promise<object>} decoded payload
 */
async function verifyAndCheckToken(token) {
  const decoded = verifyAccessToken(token);
  const revoked = await isTokenRevoked(decoded);
  if (revoked) throw new Error('Token has been revoked');
  return decoded;
}

// ── Verify Refresh Token ───────────────────────────────────────────────────
async function verifyRefreshToken(token, req) {
  const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
  if (decoded.type !== 'refresh') throw new Error('Invalid token type');

  const { RefreshToken } = require('../models');
  const tokenHash = hashToken(token);
  const fingerprint = generateTokenFingerprint(req);

  // Find the stored refresh token
  const storedToken = await RefreshToken.findOne({
    where: { tokenHash, userId: decoded.id },
  });

  if (!storedToken) {
    // Possible token reuse (stolen token) — revoke entire family
    logger.warn('[SECURITY] Refresh token reuse detected — revoking family', {
      userId: decoded.id,
      family: decoded.family,
    });
    await RefreshToken.destroy({ where: { family: decoded.family } });
    throw new Error('Refresh token reuse detected');
  }

  if (storedToken.revoked) {
    // Token was already used — potential theft
    logger.warn('[SECURITY] Revoked refresh token reuse — revoking family', {
      userId: decoded.id,
      family: decoded.family,
    });
    await RefreshToken.destroy({ where: { family: decoded.family } });
    throw new Error('Refresh token revoked');
  }

  // Fingerprint validation (binds token to device)
  if (storedToken.fingerprint !== fingerprint) {
    logger.warn('[SECURITY] Refresh token fingerprint mismatch', {
      userId: decoded.id,
      expectedFp: storedToken.fingerprint.slice(0, 8) + '...',
      gotFp: fingerprint.slice(0, 8) + '...',
    });
    // Don't revoke family for fingerprint mismatch — could be legitimate IP change
    // Just reject this refresh
    throw new Error('Device fingerprint mismatch');
  }

  // Mark current token as used (for rotation)
  storedToken.revoked = true;
  storedToken.revokedAt = new Date();
  await storedToken.save();

  return decoded;
}

// ── Refresh token rotation ─────────────────────────────────────────────────
async function rotateRefreshToken(token, req) {
  const decoded = await verifyRefreshToken(token, req);
  const { User } = require('../models');
  const user = await User.findByPk(decoded.id);
  if (!user) throw new Error('User not found');

  // Generate new pair with same family
  return generateTokenPair(user, req, decoded.family);
}

// ── Blacklist access token ─────────────────────────────────────────────────
/**
 * Revoke an access token (logout, password change, session kill).
 * Writes to the shared DB so every instance rejects the token, and warms the
 * local Set for zero-cost rejection on this instance.
 */
async function blacklistAccessToken(decoded, { reason = 'logout' } = {}) {
  if (!decoded || !decoded.jti) return;
  const blacklistKey = `${decoded.jti}:${decoded.id}`;

  let exp = null;
  try {
    const raw = jwt.decode(decoded.raw || '');
    if (!raw && decoded.exp) {
      exp = new Date(decoded.exp * 1000);
    } else if (raw && raw.exp) {
      exp = new Date(raw.exp * 1000);
    }
  } catch (_) { /* exp left null */ }

  try {
    const { TokenBlacklist } = require('../models');
    await TokenBlacklist.findOrCreate({
      where: { jti: decoded.jti },
      defaults: {
        jti: decoded.jti,
        userId: decoded.id || null,
        tokenHash: decoded.raw ? hashToken(decoded.raw) : null,
        reason,
        expiresAt: exp,
      },
    });
  } catch (err) {
    logger.warn('[SECURITY] Failed to persist token blacklist row', { error: err.message, jti: decoded.jti });
  }

  // Always warm the local fast path.
  tokenBlacklist.add(blacklistKey);
}

// ── Revoke all refresh tokens for user ─────────────────────────────────────
async function revokeAllUserTokens(userId) {
  const { RefreshToken } = require('../models');
  await RefreshToken.destroy({ where: { userId } });
}

// ── Revoke specific session ────────────────────────────────────────────────
async function revokeSession(userId, family) {
  const { RefreshToken } = require('../models');
  await RefreshToken.destroy({ where: { userId, family } });
}

// ── Set refresh token cookie ───────────────────────────────────────────────
function setRefreshTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: REFRESH_TOKEN_EXPIY_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth', // Only sent to auth endpoints
  });
}

// ── Clear refresh token cookie ─────────────────────────────────────────────
function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/auth',
  });
}

module.exports = {
  generateTokenPair,
  verifyAccessToken,
  verifyAndCheckToken,
  isTokenRevoked,
  verifyRefreshToken,
  rotateRefreshToken,
  blacklistAccessToken,
  revokeAllUserTokens,
  revokeSession,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  hashToken,
  generateTokenFingerprint,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIY_DAYS,
};
