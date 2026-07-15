const logger = require('../utils/logger');

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = (req.user.role || '').toUpperCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toUpperCase());

    let hasAccess = normalizedAllowedRoles.includes(userRole);

    // ADMINs and TRAINERs are permitted to access PARTICIPANT endpoints to test/preview workflows
    if (!hasAccess && (userRole === 'ADMIN' || userRole === 'TRAINER')) {
      if (normalizedAllowedRoles.includes('PARTICIPANT')) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      logger.warn(`[roleMiddleware] Access denied. userRole "${userRole}" not in allowedRoles`, { allowedRoles: normalizedAllowedRoles });
      return res.status(403).json({ error: 'Access denied. Insufficient permissions' });
    }

    next();
  };
};

module.exports = roleMiddleware;