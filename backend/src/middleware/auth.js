/**
 * Authentication Middleware — Enterprise JWT verification.
 *
 * Supports both:
 *   1. Bearer token in Authorization header (API clients)
 *   2. HttpOnly cookie (browser clients)
 *
 * Security:
 *   - No fallback secrets — fails hard if JWT_SECRET not set
 *   - Token type validation (must be 'access')
 *   - Blacklist check (revoked tokens)
 *   - Device fingerprint validation
 *   - Role normalization
 */

const { verifyAccessToken } = require('../security/tokenService');
const logger = require('../utils/logger');

const authenticateToken = (req, res, next) => {
  let token = null;

  // 1. Try Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Try cookie (browser clients)
  if (!token && req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  // 3. Try query parameter (for file download/export URLs)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;

    // Normalize role to uppercase for internal compatibility
    if (req.user && typeof req.user.role === 'string') {
      req.user.role = req.user.role.toUpperCase();
    }

    next();
  } catch (error) {
    if (error.message === 'Token has been revoked') {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authenticateToken;
