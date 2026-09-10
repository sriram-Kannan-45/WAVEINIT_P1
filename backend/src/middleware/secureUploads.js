/**
 * Secure Uploads Interceptor Middleware
 *
 * Intercepts requests mounted on `/uploads`:
 * - Genuinely public assets ('avatars', 'banner', 'profile', 'trainer') pass through
 *   to static serving.
 * - Sensitive categories ('resume', 'certificates', 'screenshots', 'monitor-screenshots',
 *   'monitoring-videos', 'interviews', 'bulk-import', 'registrations', 'ai-docs', 'notes', 'materials')
 *   are diverted to `serveSecureFile` in fileController.js for authentication, object-level
 *   authorization, and anti-cache headers.
 */

const { serveSecureFile, PUBLIC_CATEGORIES } = require('../controllers/fileController');

function secureUploadsMiddleware(req, res, next) {
  // Normalize path relative to /uploads
  // req.path here is e.g. /screenshots/1/snap.jpg or /avatars/avatar.png
  const cleanPath = (req.path || '').replace(/^\/+/, '');
  const parts = cleanPath.split('/');
  const category = (parts[0] || '').toLowerCase();
  const subpath = parts.slice(1).join('/');

  if (!category) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Public categories can proceed to static server
  if (PUBLIC_CATEGORIES.has(category)) {
    return next();
  }

  // Sensitive private files MUST be authorized
  return serveSecureFile(req, res, category, subpath);
}

module.exports = secureUploadsMiddleware;
