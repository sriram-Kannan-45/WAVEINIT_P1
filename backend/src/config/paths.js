/**
 * Shared storage / uploads path resolution.
 *
 * Multi-instance (scale-out) requirement: files written by one App Service
 * instance MUST be readable by every other instance. This module is the single
 * source of truth for where all uploads and runtime files are stored.
 *
 * Resolution order for the storage ROOT:
 *   1. SHARED_STORAGE_PATH — point this at the platform's shared filesystem.
 *      - Azure App Service: every instance of the SAME web app mounts the same
 *        Azure-Files-backed home directory. Use e.g. D:\home\data (Windows) or
 *        /home/data (Linux).
 *      - Docker compose: a shared named volume (see docker-compose.production.yml).
 *   2. UPLOADS_PATH — legacy single-folder override (kept for compatibility).
 *   3. Default: <backend>/storage (relative to the app directory, which on
 *      Azure App Service is itself shared across instances via D:/home).
 *
 * Uploads are always stored under <root>/uploads/<category>/ so the existing
 * `/uploads` static mount keeps working without URL changes.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function resolveStorageRoot() {
  const shared = process.env.SHARED_STORAGE_PATH;
  if (shared && String(shared).trim()) {
    return path.resolve(String(shared).trim());
  }
  return path.join(BACKEND_ROOT, 'storage');
}

const STORAGE_ROOT = resolveStorageRoot();

/**
 * Absolute path to the uploads root (shared across instances).
 * Default: <storage>/uploads — the same default storageService.js already used
 * for recordings, so nothing moves in a single-instance deployment.
 */
function getUploadsRoot() {
  return path.join(STORAGE_ROOT, 'uploads');
}

/**
 * Absolute path to a categorized uploads folder (e.g. 'materials').
 * Creates the folder if it does not exist.
 */
function getUploadsPath(category = '') {
  const dir = category ? path.join(getUploadsRoot(), category) : getUploadsRoot();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Absolute path within the shared storage root (e.g. 'recordings').
 */
function getStoragePath(category = '') {
  const dir = category ? path.join(STORAGE_ROOT, category) : STORAGE_ROOT;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Scratch / temp folder shared across instances so uploads that need an
 * intermediate location (interview recordings, monitoring uploads) can be
 * completed on a different instance than the one that received the chunk.
 */
function getTmpRoot() {
  const dir = path.join(STORAGE_ROOT, 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve a stored file reference to an absolute path under the SHARED uploads
 * root. Accepts `/uploads/...` URLs (as persisted in DB fileUrl columns),
 * uploads-relative paths, or absolute paths (returned unchanged).
 * Used by controllers that read/delete uploaded files.
 */
function resolveUploadsPath(p) {
  if (!p) return p;
  if (path.isAbsolute(p)) return p;
  const normalized = String(p).replace(/\\/g, '/').replace(/^\/uploads\//, '');
  return path.join(getUploadsRoot(), normalized);
}

module.exports = {
  BACKEND_ROOT,
  STORAGE_ROOT,
  getUploadsRoot,
  getUploadsPath,
  getStoragePath,
  getStorageRoot: () => STORAGE_ROOT,
  getTmpRoot,
  resolveUploadsPath,
  resolveStorageRoot,
};