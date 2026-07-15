const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ParticipantProfile, User } = require('../models');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();

// ─── Avatar upload (multipart) ───────────────────────────────────────────
// Files are written to backend/uploads/avatars/ so the existing
// `app.use('/uploads', express.static(path.join(__dirname, '../uploads')))`
// in app.js serves them automatically.
const avatarsDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const userId = req.user?.id || 'unknown';
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `avatar-${userId}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  // 8 MB raw cap. Frontend compresses to ~50-200 KB before sending, so this
  // is just a safety ceiling.
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`Unsupported image type "${ext}". Use JPG, PNG, GIF, or WEBP.`), false);
    }
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Uploaded file is not an image.'), false);
    }
    cb(null, true);
  },
});

// Helper: best-effort delete of an avatar file we previously stored.
// Only deletes files inside our avatars dir — never an arbitrary path
// or anything looking like an external URL.
function deletePreviousAvatar(avatarUrl) {
  if (!avatarUrl) return;
  if (/^(https?:|data:)/i.test(avatarUrl)) return;          // external / data URL
  if (!avatarUrl.startsWith('/uploads/avatars/')) return;   // not ours
  const filename = path.basename(avatarUrl);
  const filePath = path.join(avatarsDir, filename);
  // Constrain to avatarsDir; refuse path traversal.
  if (!filePath.startsWith(avatarsDir)) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('Failed to delete old avatar:', filePath, e.message);
  }
}

/**
 * Participant Profile Routes
 * ─────────────────────────────────────────────────────────────────────────
 * Mounted at /api/participant-profile in app.js.
 *
 *   GET    /me        — participant gets own profile (auto-creates if missing)
 *   PUT    /me        — participant updates own profile
 *   GET    /:userId   — admin / trainer fetches another participant's profile
 *
 * Trainers are allowed to view participant profiles so they can identify
 * who's enrolled in their trainings or who's submitted feedback.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────
// NOTE: the User model maps createdAt → 'created_at' DB column, so we MUST
// reference the actual column name here. Using 'createdAt' triggers
// "Unknown column 'user.createdAt' in 'field list'" on MySQL.
const PROFILE_USER_ATTRS = ['id', 'name', 'email', 'role', 'created_at'];

async function findOrCreateProfile(userId) {
  let profile = await ParticipantProfile.findOne({
    where: { userId },
    include: [{ model: User, as: 'user', attributes: PROFILE_USER_ATTRS }],
  });

  if (!profile) {
    await ParticipantProfile.create({ userId });
    profile = await ParticipantProfile.findOne({
      where: { userId },
      include: [{ model: User, as: 'user', attributes: PROFILE_USER_ATTRS }],
    });
  }

  return profile;
}

function shapeProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName || null,
    bio: p.bio || null,
    avatarUrl: p.avatarUrl || null,
    skills: p.skills || [],
    links: p.links || {},
    updatedAt: p.updated_at || p.updatedAt,
    createdAt: p.created_at || p.createdAt,
    user: p.user
      ? {
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          role: p.user.role,
          createdAt: p.user.created_at || p.user.createdAt || null,
        }
      : null,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────
function validatePayload(body) {
  const errors = [];
  if (body.displayName != null && typeof body.displayName !== 'string') {
    errors.push('displayName must be a string');
  }
  if (body.displayName && body.displayName.length > 80) {
    errors.push('displayName too long (max 80)');
  }
  if (body.bio != null && typeof body.bio !== 'string') {
    errors.push('bio must be a string');
  }
  if (body.bio && body.bio.length > 500) {
    errors.push('bio too long (max 500)');
  }
  if (body.skills != null && !Array.isArray(body.skills)) {
    errors.push('skills must be an array');
  }
  if (Array.isArray(body.skills) && body.skills.length > 30) {
    errors.push('too many skills (max 30)');
  }
  // avatarUrl is owned by the dedicated /me/avatar endpoint now and
  // intentionally not validated here.
  if (body.links != null && (typeof body.links !== 'object' || Array.isArray(body.links))) {
    errors.push('links must be an object');
  }
  return errors;
}

// ─── Routes ──────────────────────────────────────────────────────────────

// GET /me — own profile
router.get(
  '/me',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const profile = await findOrCreateProfile(req.user.id);
      res.json({ profile: shapeProfile(profile) });
    } catch (err) {
      console.error('GET /participant-profile/me error:', err.message);
      res.status(500).json({ error: 'Server error loading profile' });
    }
  }
);

// PUT /me — update own profile
router.put(
  '/me',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const errors = validatePayload(req.body || {});
      if (errors.length) {
        return res.status(422).json({ error: errors.join('; ') });
      }

      const profile = await findOrCreateProfile(req.user.id);

      const patch = {};
      if (req.body.displayName !== undefined)
        patch.displayName = req.body.displayName ? req.body.displayName.trim() : null;
      if (req.body.bio !== undefined)
        patch.bio = req.body.bio ? req.body.bio.trim() : null;
      // NOTE: avatarUrl is intentionally NOT accepted via this JSON
      // endpoint anymore — avatar uploads go through POST /me/avatar
      // (multipart) and DELETE /me/avatar so we never carry base-64 photos
      // in JSON bodies. Any avatarUrl included in this body is silently
      // ignored to keep older clients from corrupting the column.
      if (req.body.skills !== undefined)
        patch.skills = Array.isArray(req.body.skills) ? req.body.skills : [];
      if (req.body.links !== undefined)
        patch.links = req.body.links && typeof req.body.links === 'object' ? req.body.links : {};

      await profile.update(patch);
      const fresh = await findOrCreateProfile(req.user.id);

      res.json({ profile: shapeProfile(fresh) });
    } catch (err) {
      console.error('PUT /participant-profile/me error:', err);
      console.error('  payload:', JSON.stringify(req.body));
      console.error('  user:', req.user?.id, req.user?.role);
      if (err?.errors?.length) {
        console.error('  validation errors:', err.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
      }
      res.status(500).json({
        error: 'Server error saving profile',
        // Surface the underlying message in dev so the cause isn't hidden
        // behind the generic banner. Safe to expose — never contains user data.
        detail: err?.message || 'unknown',
      });
    }
  }
);

// POST /me/avatar — upload (multipart) and persist a new avatar
router.post(
  '/me/avatar',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Image too large. Max 8 MB.' });
        }
        return res.status(415).json({ error: err.message || 'Upload failed' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(422).json({ error: 'No image uploaded' });
      }

      const profile = await findOrCreateProfile(req.user.id);
      const previousUrl = profile.avatarUrl;
      const newUrl = `/uploads/avatars/${req.file.filename}`;

      await profile.update({ avatarUrl: newUrl });
      // Best-effort cleanup of the previous file (don't fail the request)
      deletePreviousAvatar(previousUrl);

      const fresh = await findOrCreateProfile(req.user.id);
      res.json({ profile: shapeProfile(fresh) });
    } catch (err) {
      console.error('POST /participant-profile/me/avatar error:', err.message);
      // If we already saved the file but failed downstream, try to remove it
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      }
      res.status(500).json({ error: 'Server error saving avatar' });
    }
  }
);

// DELETE /me/avatar — remove avatar and delete underlying file
router.delete(
  '/me/avatar',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  async (req, res) => {
    try {
      const profile = await findOrCreateProfile(req.user.id);
      const previousUrl = profile.avatarUrl;
      await profile.update({ avatarUrl: null });
      deletePreviousAvatar(previousUrl);
      const fresh = await findOrCreateProfile(req.user.id);
      res.json({ profile: shapeProfile(fresh) });
    } catch (err) {
      console.error('DELETE /participant-profile/me/avatar error:', err.message);
      res.status(500).json({ error: 'Server error removing avatar' });
    }
  }
);

// GET /:userId — admin or trainer can view a participant's profile
router.get(
  '/:userId',
  authenticateToken,
  roleMiddleware('ADMIN', 'TRAINER'),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(422).json({ error: 'Invalid userId' });
      }

      const targetUser = await User.findByPk(userId, {
        attributes: PROFILE_USER_ATTRS,
      });
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (targetUser.role !== 'PARTICIPANT') {
        return res
          .status(400)
          .json({ error: 'Target user is not a participant' });
      }

      const profile = await findOrCreateProfile(userId);
      res.json({ profile: shapeProfile(profile) });
    } catch (err) {
      console.error('GET /participant-profile/:userId error:', err.message);
      res.status(500).json({ error: 'Server error loading profile' });
    }
  }
);

module.exports = router;
