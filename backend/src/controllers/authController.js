/**
 * Auth Controller — Enterprise JWT Access + Refresh Token Flow.
 *
 * Security:
 *   - Access token (15 min) + Refresh token (7 days) with rotation
 *   - Tokens sent via HttpOnly cookies (refresh) + response body (access)
 *   - Session tracking per device
 *   - Suspicious login detection
 *   - Brute force protection (via middleware)
 *   - Audit logging for all auth events
 *   - Generic error messages (no user enumeration)
 *   - bcrypt 12 rounds
 */

const bcrypt = require('bcryptjs');
const { User } = require('../models');
const tokenService = require('../security/tokenService');
const sessionManager = require('../security/sessionManager');
const { logAudit, ACTIONS } = require('../security/auditLogger');
require('dotenv').config();

const BCRYPT_COST = 12;

function isWeakHash(hash) {
  return typeof hash === 'string' && (
    hash.startsWith('$2a$10$') ||
    hash.startsWith('$2b$10$') ||
    hash.startsWith('$2y$10$')
  );
}

const generateUsername = async (name) => {
  const baseName = name.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 4);
  let username = baseName + Math.floor(1000 + Math.random() * 9000);
  let exists = await User.findOne({ where: { username } });
  while (exists) {
    username = baseName + Math.floor(1000 + Math.random() * 9000);
    exists = await User.findOne({ where: { username } });
  }
  return username;
};

// ── LOGIN ──────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  const startTime = Date.now();
  try {
    const { email, username, password, role: requestedRole } = req.body;
    const credential = email || username;

    if (!credential || !password) {
      return res.status(422).json({ error: 'Email/Username and password are required' });
    }

    const user = await User.findOne({
      where: { email: credential, isDeleted: false }
    }) || await User.findOne({
      where: { username: credential, isDeleted: false }
    });

    if (!user) {
      await logAudit({
        action: ACTIONS.LOGIN_FAILED,
        category: 'AUTH',
        severity: 'WARNING',
        details: { reason: 'User not found', credential: credential.slice(0, 3) + '***' },
        req,
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      await logAudit({
        userId: user.id,
        action: ACTIONS.LOGIN_FAILED,
        category: 'AUTH',
        severity: 'WARNING',
        details: { reason: 'Invalid password' },
        req,
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Rehash weak bcrypt hashes
    if (isWeakHash(user.password)) {
      const rehashed = await bcrypt.hash(password, BCRYPT_COST);
      await User.update({ password: rehashed, passwordVersion: 2 }, { where: { id: user.id } });
    }

    if (user.role === 'PARTICIPANT' && user.status === 'PENDING') {
      return res.status(403).json({ error: 'Your account is pending approval.' });
    }

    if (user.status === 'INACTIVE') {
      return res.status(403).json({ error: 'Your account has been deactivated.' });
    }

    if (requestedRole && requestedRole.toLowerCase() !== user.role.toLowerCase()) {
      return res.status(403).json({ error: 'Incorrect role selected.' });
    }

    // Force password change on first login
    const forcePasswordChange = user.passwordVersion < 2;

    // Generate token pair
    const { accessToken, refreshToken, tokenFamily } = await tokenService.generateTokenPair(user, req);

    // Create session
    const session = await sessionManager.createSession(user, req, tokenFamily);

    // Set refresh token in HttpOnly cookie
    tokenService.setRefreshTokenCookie(res, refreshToken);

    // Track login activity
    try {
      const { ParticipantTracking } = require('../models');
      if (user.role === 'PARTICIPANT') {
        await ParticipantTracking.create({
          userId: user.id,
          loginTime: new Date(),
          lastActivity: new Date()
        });
      }
    } catch (e) {
      // Non-critical
    }

    // Audit log
    await logAudit({
      userId: user.id,
      action: ACTIONS.LOGIN_SUCCESS,
      category: 'AUTH',
      severity: 'INFO',
      details: {
        sessionId: session.sessionId,
        suspiciousScore: session.suspiciousScore,
        suspiciousReasons: session.suspiciousReasons,
      },
      req,
    });

    // If suspicious, add warning to response
    const warnings = [];
    if (session.suspiciousScore > 30) {
      warnings.push('Unusual login detected — new device or location.');
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      forcePasswordChange,
      token: accessToken,
      accessToken,
      refreshToken,
      sessionId: session.sessionId,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    await logAudit({
      action: ACTIONS.LOGIN_FAILED,
      category: 'AUTH',
      severity: 'ERROR',
      details: { error: error.message },
      req,
    });
    res.status(500).json({ error: 'Server error during login' });
  }
};

// ── REFRESH TOKEN ──────────────────────────────────────────────────────────
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = await tokenService.rotateRefreshToken(token, req);
    const { User: UserModel } = require('../models');
    const user = await UserModel.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { accessToken, refreshToken: newRefreshToken, tokenFamily } =
      await tokenService.generateTokenPair(user, req, decoded.family);

    // Update session activity
    await sessionManager.touchSession(decoded.sessionId);

    // Set new refresh token cookie
    tokenService.setRefreshTokenCookie(res, newRefreshToken);

    await logAudit({
      userId: user.id,
      action: ACTIONS.TOKEN_REFRESH,
      category: 'AUTH',
      severity: 'INFO',
      req,
    });

    res.json({ accessToken });
  } catch (error) {
    if (error.message === 'Refresh token reuse detected' || error.message === 'Refresh token revoked') {
      await logAudit({
        action: ACTIONS.REFRESH_TOKEN_REUSE,
        category: 'SECURITY',
        severity: 'CRITICAL',
        details: { error: error.message },
        req,
      });
      tokenService.clearRefreshTokenCookie(res);
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    tokenService.clearRefreshTokenCookie(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// ── LOGOUT ─────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const userId = req.user?.id;
    const sessionId = req.query?.sessionId || req.user?.sessionId;

    if (userId) {
      // Blacklist the current access token
      if (req.user?.jti) {
        tokenService.blacklistAccessToken(req.user);
      }

      // Revoke refresh token for this session
      if (req.user?.family) {
        await tokenService.revokeSession(userId, req.user.family);
      }

      // End session
      if (sessionId) {
        await sessionManager.logoutSession(sessionId);
      }

      // Track participant logout
      try {
        const { ParticipantTracking } = require('../models');
        const lastRecord = await ParticipantTracking.findOne({
          where: { userId, logoutTime: null },
          order: [['created_at', 'DESC']]
        });
        if (lastRecord) {
          await lastRecord.update({ logoutTime: new Date(), lastActivity: new Date() });
        }
      } catch (e) { /* non-critical */ }

      await logAudit({
        userId,
        action: ACTIONS.LOGOUT,
        category: 'AUTH',
        severity: 'INFO',
        req,
      });
    }

    tokenService.clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error during logout' });
  }
};

// ── LOGOUT ALL SESSIONS ────────────────────────────────────────────────────
const logoutAll = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      await tokenService.revokeAllUserTokens(userId);
      await sessionManager.logoutAllSessions(userId);

      await logAudit({
        userId,
        action: ACTIONS.LOGOUT_ALL,
        category: 'AUTH',
        severity: 'WARNING',
        req,
      });
    }

    tokenService.clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'All sessions terminated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET ACTIVE SESSIONS ────────────────────────────────────────────────────
const getSessions = async (req, res) => {
  try {
    const userId = req.user?.id;
    const sessions = await sessionManager.getActiveSessions(userId);
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ── REGISTER ───────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (role && role.toUpperCase() !== 'PARTICIPANT') {
      return res.status(403).json({ error: 'Only participants are allowed to register' });
    }

    if (!name || !email || !password || !phone) {
      return res.status(422).json({ error: 'Name, email, password, and phone are required' });
    }

    if (password.length < 6) {
      return res.status(422).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      // Don't reveal if email already exists
      return res.status(422).json({ error: 'Registration could not be completed' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: 'PARTICIPANT',
      status: 'APPROVED',
      passwordVersion: 2
    });

    await logAudit({
      userId: user.id,
      action: ACTIONS.REGISTER,
      category: 'AUTH',
      severity: 'INFO',
      req,
    });

    const { accessToken, refreshToken, tokenFamily } = await tokenService.generateTokenPair(user, req);
    const session = await sessionManager.createSession(user, req, tokenFamily);
    tokenService.setRefreshTokenCookie(res, refreshToken);

    await logAudit({
      userId: user.id,
      action: ACTIONS.LOGIN_SUCCESS,
      category: 'AUTH',
      severity: 'INFO',
      details: { sessionId: session.sessionId, autoLogin: true },
      req,
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      token: accessToken,
      accessToken,
      refreshToken,
      sessionId: session.sessionId,
      message: 'Registration successful'
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// ── CREATE TRAINER ─────────────────────────────────────────────────────────
const createTrainer = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(422).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const username = await generateUsername(name);
    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    const trainer = await User.create({
      name,
      email,
      username,
      password: hashedPassword,
      phone: null,
      role: 'TRAINER',
      status: 'APPROVED',
      passwordVersion: 2
    });

    await logAudit({
      userId: req.user.id,
      action: ACTIONS.USER_CREATE,
      category: 'DATA',
      severity: 'INFO',
      resourceId: trainer.id,
      resourceType: 'User',
      details: { role: 'TRAINER', email },
      req,
    });

    res.status(201).json({
      id: trainer.id,
      name: trainer.name,
      email: trainer.email,
      username: trainer.username,
      role: trainer.role,
      message: 'Trainer created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error creating trainer' });
  }
};

// ── CHANGE PASSWORD ────────────────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.status(422).json({ error: 'Old and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }

    // Prevent password reuse
    if (oldPassword === newPassword) {
      return res.status(422).json({ error: 'New password must be different from current password' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);
    await User.update(
      { password: hashedPassword, passwordVersion: 2 },
      { where: { id: userId } }
    );

    // Revoke all other sessions (force re-login on other devices)
    await tokenService.revokeAllUserTokens(userId);

    await logAudit({
      userId,
      action: ACTIONS.PASSWORD_CHANGE,
      category: 'AUTH',
      severity: 'WARNING',
      details: { allSessionsRevoked: true },
      req,
    });

    tokenService.clearRefreshTokenCookie(res);
    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error changing password' });
  }
};

// ── GET TRAINERS ───────────────────────────────────────────────────────────
const getTrainers = async (req, res) => {
  try {
    const trainers = await User.findAll({
      where: { role: 'TRAINER' },
      attributes: ['id', 'name', 'email', 'username']
    });
    res.json({ trainers });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching trainers' });
  }
};

module.exports = {
  login,
  register,
  createTrainer,
  changePassword,
  getTrainers,
  logout,
  logoutAll,
  refreshToken,
  getSessions,
};
