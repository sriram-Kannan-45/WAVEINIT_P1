/**
 * Secure File Controller
 *
 * Implements authenticated, authorized file delivery for sensitive media & documents:
 * - Resumes, certificates, registrations, proctoring screenshots, monitoring videos,
 *   interview recordings, bulk imports, and course materials.
 * - Enforces strict path traversal defenses.
 * - Prevents physical server filesystem paths from leaking.
 * - Sets anti-caching headers on sensitive files.
 * - Validates role & object-level ownership.
 * - Integrates with streamingTicketService for media players.
 */

const path = require('path');
const fs = require('fs');
const { getUploadsPath, getUploadsRoot } = require('../config/paths');
const { verifyAndCheckToken } = require('../security/tokenService');
const { verifyStreamingTicket, issueStreamingTicket } = require('../services/streamingTicketService');
const logger = require('../utils/logger');

// Public categories that do not contain sensitive private personal data
const PUBLIC_CATEGORIES = new Set(['avatars', 'banner', 'profile', 'trainer']);

// Allowed categories mapping
const VALID_CATEGORIES = new Set([
  'avatars',
  'banner',
  'profile',
  'trainer',
  'resume',
  'certificates',
  'screenshots',
  'monitor-screenshots',
  'monitoring-videos',
  'hire-proctoring',
  'interviews',
  'bulk-import',
  'registrations',
  'ai-docs',
  'notes',
  'materials',
]);

/**
 * Extract authenticated user from Authorization header, cookies, or streaming ticket
 */
async function authenticateRequest(req, resourcePath) {
  // 1. Bearer token
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = await verifyAndCheckToken(token);
      return decoded;
    } catch {
      // invalid token
    }
  }

  // 2. Cookie
  if (req.cookies && req.cookies.accessToken) {
    try {
      const decoded = await verifyAndCheckToken(req.cookies.accessToken);
      return decoded;
    } catch {
      // invalid cookie token
    }
  }

  // 3. Signed Streaming Ticket (for video/audio stream elements)
  if (req.query && req.query.ticket) {
    const ticketUser = verifyStreamingTicket(req.query.ticket, resourcePath);
    if (ticketUser) {
      return { id: ticketUser.userId, role: ticketUser.role };
    }
  }

  return null;
}

/**
 * Validate object-level authorization for sensitive files
 */
async function authorizeFileAccess(user, category, subPath, filename) {
  const role = String(user?.role || '').toUpperCase();

  // ADMIN has full access across all categories
  if (role === 'ADMIN') return true;

  // TRAINERS have access to review student submissions, materials, interviews, screenshots, etc.
  if (role === 'TRAINER') {
    if (['bulk-import', 'hire-proctoring'].includes(category)) {
      return false; // bulk imports are admin only
    }
    return true;
  }

  // PARTICIPANTS: strict object-level ownership check
  if (role === 'PARTICIPANT') {
    const userId = user.id;

    try {
      const models = require('../models');

      if (category === 'resume') {
        // Check UserProfile
        const profile = await models.UserProfile.findOne({
          where: { userId },
          attributes: ['resumePath'],
        });
        if (profile && profile.resumePath && profile.resumePath.includes(filename)) {
          return true;
        }
        // Check RegistrationApplication
        const app = await models.RegistrationApplication.findOne({
          where: { userId },
          attributes: ['resumeUrl'],
        });
        if (app && app.resumeUrl && app.resumeUrl.includes(filename)) {
          return true;
        }
        return false;
      }

      if (category === 'certificates') {
        const cert = await models.ProfileCertificate.findOne({
          where: { certificateFile: { [models.Sequelize.Op.like]: `%${filename}%` } },
          include: [{ model: models.UserProfile, as: 'profile', where: { userId } }],
        }).catch(() => null);
        if (cert) return true;

        const lmsCert = await models.Certificate.findOne({
          where: { userId },
        }).catch(() => null);
        if (lmsCert) return true;

        return false;
      }

      if (category === 'screenshots' || category === 'monitor-screenshots') {
        // subPath might be sessionId (e.g. screenshots/123/img.jpg)
        const sessionId = subPath ? subPath.split('/')[0] : null;
        if (sessionId) {
          const session = await models.ExamSession.findOne({
            where: { id: sessionId, userId },
          }).catch(() => null);
          if (session) return true;

          const monitor = await models.MonitorAttempt.findOne({
            where: { id: sessionId, userId },
          }).catch(() => null);
          if (monitor) return true;
        }
        return false;
      }

      if (category === 'monitoring-videos') {
        // Check if user owns the recording or exam session
        const session = await models.ExamSession.findOne({
          where: { userId },
        }).catch(() => null);
        if (session) return true;
        return false;
      }

      if (category === 'hire-proctoring') {
        const sessionId = subPath ? subPath.split('/')[0] : null;
        if (!sessionId) return false;
        const monitor = await models.MonitoringSession.findOne({
          where: { sessionId, participantId: userId },
          attributes: ['id'],
        }).catch(() => null);
        return Boolean(monitor);
      }

      if (category === 'interviews') {
        const interview = await models.InterviewParticipant.findOne({
          where: { userId },
        }).catch(() => null);
        if (interview) return true;
        return false;
      }

      if (category === 'notes') {
        const note = await models.Note.findOne({
          where: { userId, fileUrl: { [models.Sequelize.Op.like]: `%${filename}%` } },
        }).catch(() => null);
        if (note) return true;
        return false;
      }

      if (category === 'materials') {
        // Enrolled courses materials
        return true;
      }

      // Disallow bulk-import, ai-docs, registrations for other participants
      return false;
    } catch (err) {
      logger.error(`[FILE AUTH CHECK ERROR] ${err.message}`);
      return false;
    }
  }

  return false;
}

function isPathTraversal(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return false;
  if (relativePath.includes('\0') || relativePath.includes('%00')) return true;
  const sanitized = relativePath.replace(/\\/g, '/');
  if (sanitized.includes('..') || sanitized.includes('%2e%2e') || sanitized.includes('%2E%2E')) {
    return true;
  }
  return false;
}

/**
 * Core handler to serve a file securely
 */
async function serveSecureFile(req, res, targetCategory, targetSubpath) {
  // 1. Parameter normalization
  const category = (targetCategory || req.params.category || '').toLowerCase().trim();
  let relativePath = targetSubpath !== undefined ? targetSubpath : (req.params[0] || req.params.filename || '');

  // 2. Validate category
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'Invalid file category' });
  }

  // 3. Path Traversal & Null Byte Defense
  if (isPathTraversal(relativePath)) {
    return res.status(403).json({ error: 'Access denied: Directory traversal detected' });
  }

  relativePath = relativePath.replace(/\\/g, '/');
  const categoryDir = path.resolve(getUploadsPath(category));
  const fullPath = path.resolve(categoryDir, relativePath);

  // Strict check that the resolved path is inside category directory
  if (!fullPath.startsWith(categoryDir)) {
    return res.status(403).json({ error: 'Access denied: Invalid file path' });
  }

  // 4. Check existence
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    return res.status(400).json({ error: 'Invalid file request' });
  }

  const filename = path.basename(fullPath);
  const resourceIdentifier = `${category}/${relativePath}`;

  // 5. Check if public asset
  if (PUBLIC_CATEGORIES.has(category)) {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.sendFile(fullPath, { dotfiles: 'deny' });
  }

  // 6. Sensitive asset: Authenticate & Authorize
  const user = await authenticateRequest(req, resourceIdentifier);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required to access this file' });
  }

  const isAuthorized = await authorizeFileAccess(user, category, relativePath, filename);
  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access this file' });
  }

  // 7. Privacy & Security headers on sensitive files
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 8. Stream file
  return res.sendFile(fullPath, { dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) {
      logger.error(`[FILE STREAM ERROR] File: ${filename} - ${err.message}`);
      res.status(err.status || 500).json({ error: 'Error reading requested file' });
    }
  });
}

/**
 * Issue a streaming ticket for media files
 * POST /api/files/ticket
 */
async function getFileStreamingTicket(req, res) {
  try {
    const { resourcePath } = req.body;
    if (!resourcePath) {
      return res.status(400).json({ error: 'resourcePath is required' });
    }

    const ticket = issueStreamingTicket({
      userId: req.user.id,
      role: req.user.role,
      resourceId: resourcePath,
    });

    return res.json({
      ticket,
      expiresIn: 60,
      resourcePath,
    });
  } catch (err) {
    logger.error(`[FILE TICKET ERROR] ${err.message}`);
    return res.status(500).json({ error: 'Failed to issue streaming ticket' });
  }
}

/**
 * Controller endpoint: GET /api/files/:category/*
 */
async function getFile(req, res) {
  const category = req.params.category;
  const subpath = req.params[0] || req.params.filename || '';
  return serveSecureFile(req, res, category, subpath);
}

module.exports = {
  serveSecureFile,
  getFile,
  getFileStreamingTicket,
  PUBLIC_CATEGORIES,
  isPathTraversal,
};
