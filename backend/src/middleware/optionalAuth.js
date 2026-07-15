// Optional auth middleware - attaches user if token present but doesn't block if absent
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token invalid - proceed without user context
      req.user = null;
    }
  } else {
    req.user = null;
  }
  
  next();
};
