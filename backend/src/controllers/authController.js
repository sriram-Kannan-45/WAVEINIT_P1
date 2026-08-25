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
const os = require('os');
const { User, TrainerProfile } = require('../models');
const { sequelize } = require('../config/db');
const tokenService = require('../security/tokenService');
const sessionManager = require('../security/sessionManager');
const { logAudit, ACTIONS } = require('../security/auditLogger');
const { resetLockout } = require('../middleware/loginRateLimiter');
const logger = require('../utils/logger');
require('dotenv').config();

const BCRYPT_COST = 12;
const INSTANCE_ID = process.env.INSTANCE_ID || process.env.HOSTNAME || os.hostname() || `pid-${process.pid}`;

function maskCredential(cred) {
  if (!cred || typeof cred !== 'string') return '***';
  const trimmed = cred.trim();
  if (trimmed.includes('@')) {
    const [local, domain] = trimmed.split('@');
    const maskedLocal = local.length <= 2 ? local.charAt(0) + '***' : local.slice(0, 2) + '***' + local.slice(-1);
    return `${maskedLocal}@${domain}`;
  }
  return trimmed.length <= 3 ? '***' : trimmed.slice(0, 2) + '***' + trimmed.slice(-1);
}

function isWeakHash(hash) {
  return typeof hash === 'string' && (
    hash.startsWith('$2a$10$') ||
    hash.startsWith('$2b$10$') ||
    hash.startsWith('$2y$10$')
  );
}

function formatRoleLabel(role) {
  if (!role) return 'User';
  const r = role.toString().toUpperCase();
  if (r === 'PARTICIPANT') return 'Learner';
  if (r === 'TRAINER') return 'Trainer';
  if (r === 'ADMIN') return 'Admin';
  return r.charAt(0) + r.slice(1).toLowerCase();
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
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  let internalReason = 'UNKNOWN';
  let userId = null;
  let userRole = null;
  let userStatus = null;

  try {
    const { email, username, password, role: requestedRole } = req.body;
    const rawCredential = (email || username || '').toString();
    const normalizedEmail = rawCredential.trim().toLowerCase();
    const normalizedUsername = rawCredential.trim();
    const masked = maskCredential(rawCredential);

    if (!rawCredential.trim() || !password) {
      internalReason = 'MISSING_CREDENTIALS';
      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (422) - Reason: ${internalReason} | Credential: "${masked}" | Role: ${requestedRole || 'none'} | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);
      return res.status(422).json({ error: 'Email/Username and password are required' });
    }

    const { Op } = require('sequelize');
    // Case-insensitive and trimmed lookup for both email and username across database dialects
    const user = await User.findOne({
      where: {
        [Op.or]: [
          sequelize.where(sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('User.email'))), normalizedEmail),
          sequelize.where(sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('User.username'))), normalizedEmail),
          { email: normalizedEmail },
          { email: rawCredential.trim() },
          { username: normalizedUsername },
          { username: rawCredential.trim() }
        ],
        isDeleted: false
      }
    });

    if (user) {
      userId = user.id;
      userRole = user.role;
      userStatus = user.status;
    }

    if (!user) {
      internalReason = 'USER_NOT_FOUND';
      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (401) - Reason: ${internalReason} | Credential: "${masked}" | Role: ${requestedRole || 'none'} | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);
      
      await logAudit({
        action: ACTIONS.LOGIN_FAILED,
        category: 'AUTH',
        severity: 'WARNING',
        details: { reason: 'User not found', credential: masked, instance: INSTANCE_ID },
        req,
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      internalReason = 'PASSWORD_MISMATCH';
      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (401) - Reason: ${internalReason} | User ID: ${userId} | Role: ${userRole} | Credential: "${masked}" | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);

      await logAudit({
        userId: user.id,
        action: ACTIONS.LOGIN_FAILED,
        category: 'AUTH',
        severity: 'WARNING',
        details: { reason: 'Invalid password', instance: INSTANCE_ID },
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
      internalReason = 'ACCOUNT_PENDING';
      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (403) - Reason: ${internalReason} | User ID: ${userId} | Role: ${userRole} | Credential: "${masked}" | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);
      return res.status(403).json({ error: 'Your account is pending admin approval. You will be able to log in once an administrator approves your account.' });
    }

    if (user.status === 'REJECTED') {
      internalReason = 'ACCOUNT_REJECTED';
      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (403) - Reason: ${internalReason} | User ID: ${userId} | Role: ${userRole} | Credential: "${masked}" | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);
      return res.status(403).json({ error: 'Your registration was rejected. Please contact support if you believe this is an error.' });
    }

    if (user.status === 'INACTIVE') {
      internalReason = 'ACCOUNT_INACTIVE';
      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (403) - Reason: ${internalReason} | User ID: ${userId} | Role: ${userRole} | Credential: "${masked}" | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);
      return res.status(403).json({ error: 'Your account has been deactivated.' });
    }

    if (requestedRole && requestedRole.toLowerCase() !== user.role.toLowerCase()) {
      internalReason = 'ROLE_MISMATCH';
      const actualRoleLabel = formatRoleLabel(user.role);
      const requestedRoleLabel = formatRoleLabel(requestedRole);
      const errorMsg = `Role mismatch — this account is registered as ${actualRoleLabel}, not ${requestedRoleLabel}. Please use the ${actualRoleLabel} login tab.`;

      logger.warn(`[AUTH LOGIN ATTEMPT] REJECTED (403) - Reason: ${internalReason} | Actual: ${user.role} | Requested: ${requestedRole} | User ID: ${userId} | Credential: "${masked}" | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);

      await logAudit({
        userId: user.id,
        action: ACTIONS.LOGIN_FAILED,
        category: 'AUTH',
        severity: 'WARNING',
        details: { reason: 'Role mismatch', actualRole: user.role, requestedRole, instance: INSTANCE_ID },
        req,
      });

      return res.status(403).json({
        error: errorMsg,
        actualRole: user.role,
        requestedRole,
      });
    }

    // Force password change on first login (disabled to prevent redirect loops to forgot-password)
    const forcePasswordChange = false;

    // Generate token pair
    const { accessToken, refreshToken, tokenFamily } = await tokenService.generateTokenPair(user, req);

    // Create session
    const session = await sessionManager.createSession(user, req, tokenFamily);

    // Set refresh token in HttpOnly cookie
    tokenService.setRefreshTokenCookie(res, refreshToken);

    // Clear lockout history across all user aliases upon successful login
    resetLockout(user.email);
    if (user.username) resetLockout(user.username);
    if (normalizedEmail !== (user.email || '').toLowerCase()) resetLockout(normalizedEmail);

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
        instance: INSTANCE_ID,
      },
      req,
    });

    // If suspicious, add warning to response
    const warnings = [];
    if (session.suspiciousScore > 30) {
      warnings.push('Unusual login detected — new device or location.');
    }

    internalReason = 'LOGIN_SUCCESS';
    logger.info(`[AUTH LOGIN ATTEMPT] SUCCESS (200) - Reason: ${internalReason} | User ID: ${userId} | Role: ${userRole} | Credential: "${masked}" | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);

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
    internalReason = 'SERVER_ERROR';
    logger.error(`[AUTH LOGIN ATTEMPT] ERROR (500) - Reason: ${internalReason} | Credential: "${maskCredential(req.body?.email || req.body?.username)}" | Error: ${error.message} | Stack: ${error.stack} | IP: ${clientIp} | Instance: ${INSTANCE_ID} | Duration: ${Date.now() - startTime}ms`);
    
    await logAudit({
      action: ACTIONS.LOGIN_FAILED,
      category: 'AUTH',
      severity: 'ERROR',
      details: { error: error.message, instance: INSTANCE_ID },
      req,
    }).catch(() => {});
    return res.status(500).json({ error: 'Server error during login' });
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
      return res.status(422).json({ error: 'Name, email, password, and phone number are required' });
    }

    if (password.length < 6) {
      return res.status(422).json({ error: 'Password must be at least 6 characters' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ where: { email: trimmedEmail, isDeleted: false } });
    if (existingUser) {
      if (existingUser.status === 'PENDING') {
        return res.status(409).json({ error: 'An account with this email is already registered and pending admin approval.' });
      }
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const legacyDeleted = await User.findOne({ where: { email: trimmedEmail, isDeleted: true } });
    if (legacyDeleted) {
      const timestamp = Date.now();
      await legacyDeleted.update({
        email: `${trimmedEmail}__deleted_${timestamp}`,
        username: legacyDeleted.username ? `${legacyDeleted.username}__deleted_${timestamp}` : null,
      });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
    const username = await generateUsername(name);

    const user = await User.create({
      name: name.trim(),
      email: trimmedEmail,
      username,
      password: hashedPassword,
      phone: phone.trim(),
      role: 'PARTICIPANT',
      status: 'PENDING',
      passwordVersion: 2,
      isDeleted: false,
      deletedAt: null
    });

    // Create a linked registration application so the admin
    // Applications page reflects self-registered participants too.
    try {
      const { RegistrationApplication } = require('../models');
      const nameParts = (name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || name || 'Participant';
      const lastName = nameParts.slice(1).join(' ') || '-';
      const appCount = await RegistrationApplication.count();
      await RegistrationApplication.create({
        applicationNumber: `APP${new Date().getFullYear()}${String(appCount + 1).padStart(4, '0')}`,
        firstName,
        lastName,
        email: trimmedEmail,
        phone: phone.trim() || null,
        trainingId: null,
        status: 'PENDING',
        userId: user.id,
        createdAt: new Date(),
      });
    } catch (appErr) {
      logger.warn('Could not create registration application for self-registration:', { error: appErr.message });
    }

    // Notify all admins of the new pending participant registration
    try {
      const { Notification } = require('../models');
      const admins = await User.findAll({ where: { role: 'ADMIN', isDeleted: false }, attributes: ['id'] });
      if (admins.length > 0) {
        await Notification.bulkCreate(admins.map(a => ({
          userId: a.id,
          message: `New participant registration pending approval: ${user.name} (${user.email}).`,
          type: 'OTHER',
          isRead: false,
        })));
      }
    } catch (notifErr) {
      logger.warn('Could not notify admins of new registration:', { error: notifErr.message });
    }

    await logAudit({
      userId: user.id,
      action: ACTIONS.REGISTER,
      category: 'AUTH',
      severity: 'INFO',
      req,
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      message: 'Registration submitted successfully! Your account is pending admin approval. You will be able to log in once an administrator approves your account.'
    });
  } catch (error) {
    logger.error('Registration error:', { error: error.message });
    res.status(500).json({ error: 'Server error during registration. Please try again.' });
  }
};

// ── CREATE TRAINER ─────────────────────────────────────────────────────────
const createTrainer = async (req, res) => {
  const { sequelize } = require('../config/db');
  let t;
  try {
    t = await sequelize.transaction();
  } catch (err) {
    return res.status(500).json({ error: 'Server error creating trainer' });
  }

  try {
    const {
      name, email, password, phone, employeeId, department, designation,
      experience, status, profilePic
    } = req.body;

    if (!name || !email || !password) {
      await t.rollback();
      return res.status(422).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
      await t.rollback();
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Check if an active user exists with this email
    const activeUser = await User.findOne({ 
      where: { email: trimmedEmail, isDeleted: false },
      transaction: t 
    });
    if (activeUser) {
      await t.rollback();
      return res.status(400).json({ error: 'Email already exists' });
    }

    // 2. Clean up any legacy soft-deleted user occupying this email
    const legacyDeleted = await User.findOne({ 
      where: { email: trimmedEmail, isDeleted: true },
      transaction: t 
    });
    if (legacyDeleted) {
      const timestamp = Date.now();
      await legacyDeleted.update({
        email: `${trimmedEmail}__deleted_${timestamp}`,
        username: legacyDeleted.username ? `${legacyDeleted.username}__deleted_${timestamp}` : null,
      }, { transaction: t });
    }

    const username = await generateUsername(name);
    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    const validStatus = ['APPROVED', 'INACTIVE'].includes(status) ? status : 'APPROVED';

    const trainer = await User.create({
      name: name.trim(),
      email: trimmedEmail,
      username,
      password: hashedPassword,
      phone: phone?.trim() || null,
      employeeId: employeeId?.trim() || null,
      department: department?.trim() || null,
      designation: designation?.trim() || null,
      role: 'TRAINER',
      status: validStatus,
      passwordVersion: 2,
      isDeleted: false,
      deletedAt: null,
    }, { transaction: t });

    if (experience || profilePic) {
      await TrainerProfile.create({
        userId: trainer.id,
        experience: experience || null,
        imagePath: profilePic || null
      }, { transaction: t });
    }

    await t.commit();

    await logAudit({
      userId: req.user.id,
      action: ACTIONS.USER_CREATE,
      category: 'DATA',
      severity: 'INFO',
      resourceId: trainer.id,
      resourceType: 'User',
      details: { role: 'TRAINER', email: trimmedEmail, status: validStatus },
      req,
    }).catch(() => {});

    res.status(201).json({
      id: trainer.id,
      name: trainer.name,
      email: trainer.email,
      username: trainer.username,
      role: trainer.role,
      message: 'Trainer created successfully'
    });
  } catch (error) {
    if (t) await t.rollback().catch(() => {});
    logger.error('createTrainer error:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || 'Server error creating trainer' });
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
      where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' },
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
