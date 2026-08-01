/**
 * Audit Logger — Centralized security audit trail.
 *
 * Records every security-relevant action to the audit_logs table.
 * Non-blocking: audit failures never fail requests.
 * Supports both authenticated and unauthenticated action logging.
 */

const { AuditLog } = require('../models');
const logger = require('../utils/logger');

// ── Action Constants ───────────────────────────────────────────────────────
const ACTIONS = {
  // Auth
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  REGISTER: 'REGISTER',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  OTP_SEND: 'OTP_SEND',
  OTP_VERIFY: 'OTP_VERIFY',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // User management
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_ROLE_CHANGE: 'USER_ROLE_CHANGE',

  // Course
  COURSE_CREATE: 'COURSE_CREATE',
  COURSE_UPDATE: 'COURSE_UPDATE',
  COURSE_DELETE: 'COURSE_DELETE',
  COURSE_PUBLISH: 'COURSE_PUBLISH',

  // Quiz
  QUIZ_CREATE: 'QUIZ_CREATE',
  QUIZ_UPDATE: 'QUIZ_UPDATE',
  QUIZ_DELETE: 'QUIZ_DELETE',
  QUIZ_PUBLISH: 'QUIZ_PUBLISH',
  QUIZ_SUBMIT: 'QUIZ_SUBMIT',
  QUIZ_RESULT_PUBLISH: 'QUIZ_RESULT_PUBLISH',

  // File
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_DELETE: 'FILE_DELETE',

  // Security
  SUSPICIOUS_LOGIN: 'SUSPICIOUS_LOGIN',
  SESSION_HIJACK_ATTEMPT: 'SESSION_HIJACK_ATTEMPT',
  REFRESH_TOKEN_REUSE: 'REFRESH_TOKEN_REUSE',
  BRUTE_FORCE_DETECTED: 'BRUTE_FORCE_DETECTED',
  IP_CHANGE: 'IP_CHANGE',
  XSS_ATTEMPT: 'XSS_ATTEMPT',
  SQL_INJECTION_ATTEMPT: 'SQL_INJECTION_ATTEMPT',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',

  // System
  SYSTEM_START: 'SYSTEM_START',
  SCHEMA_CHANGE: 'SCHEMA_CHANGE',
};

// ── Log an audit event ─────────────────────────────────────────────────────
async function logAudit({
  userId = null,
  action,
  category = 'API',
  severity = 'INFO',
  ipAddress = null,
  userAgent = null,
  method = null,
  path = null,
  statusCode = null,
  resourceId = null,
  resourceType = null,
  details = null,
  errorMessage = null,
  duration = null,
  req = null,
}) {
  try {
    // Extract from req if provided
    if (req) {
      if (!ipAddress) ipAddress = req.ip || req.connection?.remoteAddress || null;
      if (!userAgent) userAgent = req.headers['user-agent'] || null;
      if (!method) method = req.method;
      if (!path) path = req.originalUrl || req.url;
      if (userId === null && req.user?.id) userId = req.user.id;
    }

    await AuditLog.create({
      userId,
      action,
      category,
      severity,
      ipAddress,
      userAgent,
      method,
      path,
      statusCode,
      resourceId: resourceId ? String(resourceId) : null,
      resourceType,
      details,
      errorMessage,
      duration,
    });
  } catch (error) {
    // Audit logging must never fail the request
    logger.error('[AuditLogger] Failed to write audit log', {
      action,
      error: error.message,
    });
  }
}

// ── Middleware: automatic request audit ─────────────────────────────────────
function auditMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Only log mutating operations (POST, PUT, DELETE, PATCH)
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const category = req.method === 'DELETE' ? 'DATA' : 'API';
      const severity = res.statusCode >= 400 ? 'WARNING' : 'INFO';

      logAudit({
        userId: req.user?.id || null,
        action: `${req.method} ${req.originalUrl.split('?')[0]}`,
        category,
        severity,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        duration,
        req,
      }).catch(() => {}); // Fire and forget
    }
  });

  next();
}

module.exports = { logAudit, auditMiddleware, ACTIONS };
