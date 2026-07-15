const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
require('dotenv').config();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    // Normalize role to uppercase for internal compatibility (e.g., 'participant' -> 'PARTICIPANT')
    if (req.user && typeof req.user.role === 'string') {
      const lowerRole = req.user.role.toLowerCase();
      if (lowerRole === 'participant') {
        req.user.role = 'PARTICIPANT';
      } else if (lowerRole === 'trainer') {
        req.user.role = 'TRAINER';
      } else if (lowerRole === 'admin') {
        req.user.role = 'ADMIN';
      }
    }
    
    next();
  } catch (error) {
    logger.error(`[authMiddleware] Token verification failed: ${error.message}`);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authenticateToken;