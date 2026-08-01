/**
 * Role-Based Access Control Middleware.
 *
 * Security fixes:
 *   - REMOVED: Admin/Trainer auto-access to Participant endpoints (privilege escalation)
 *   - Roles must be explicitly granted per route
 *   - Supports permission-based access control
 */

const { hasPermission, canAccessRole } = require('../security/permissions');
const logger = require('../utils/logger');

/**
 * Verify user has one of the allowed roles.
 * No automatic privilege escalation — ADMIN must be explicitly listed.
 */
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = (req.user.role || '').toUpperCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toUpperCase());

    const hasAccess = normalizedAllowedRoles.includes(userRole);

    if (!hasAccess) {
      logger.warn(`[roleMiddleware] Access denied`, {
        userId: req.user.id,
        userRole,
        allowedRoles: normalizedAllowedRoles,
        path: req.originalUrl,
      });
      return res.status(403).json({ error: 'Access denied. Insufficient permissions' });
    }

    next();
  };
};

/**
 * Verify user has a specific permission.
 * Uses the permission matrix from security/permissions.js
 */
const verifyPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = (req.user.role || '').toUpperCase();

    if (!hasPermission(userRole, permission)) {
      logger.warn(`[verifyPermission] Permission denied`, {
        userId: req.user.id,
        userRole,
        required: permission,
        path: req.originalUrl,
      });
      return res.status(403).json({ error: `Permission denied: ${permission}` });
    }

    next();
  };
};

/**
 * Verify user can access resources of the target role.
 * Hierarchical: SUPER_ADMIN > ADMIN > TRAINER > HR > PARTICIPANT
 */
const authorizeRole = (...allowedRoles) => {
  return roleMiddleware(...allowedRoles);
};

module.exports = roleMiddleware;
module.exports.roleMiddleware = roleMiddleware;
module.exports.verifyPermission = verifyPermission;
module.exports.authorizeRole = authorizeRole;
