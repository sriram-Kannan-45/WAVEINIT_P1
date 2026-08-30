/**
 * storageService
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified shared file & object storage abstraction.
 * Ensures video recordings, uploads, and assets are accessible across all
 * App Server instances in a multi-instance auto-scaling pool.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Shared storage root folder — in Docker / cluster mode, points to mounted shared volume
const SHARED_STORAGE_ROOT = process.env.SHARED_STORAGE_PATH
  ? path.resolve(process.env.SHARED_STORAGE_PATH)
  : path.join(__dirname, '..', '..', 'storage');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Save uploaded file to shared storage
 */
async function saveRecordingFile({ subDir = 'recordings', fileName, sourcePath }) {
  const targetDir = ensureDir(path.join(SHARED_STORAGE_ROOT, subDir));
  const targetPath = path.join(targetDir, fileName);

  if (sourcePath && fs.existsSync(sourcePath)) {
    try {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
    } catch (e) {
      // Fallback copy if cross-device rename fails
      fs.writeFileSync(targetPath, fs.readFileSync(sourcePath));
      try { fs.unlinkSync(sourcePath); } catch (_) {}
    }
  }

  const stat = fs.statSync(targetPath);
  const sizeMb = Math.round((stat.size / (1024 * 1024)) * 100) / 100;

  return {
    relativePath: path.join(subDir, fileName).replace(/\\/g, '/'),
    fullPath: targetPath,
    sizeMb,
    sizeBytes: stat.size,
  };
}

/**
 * Resolve full path of a shared file
 */
function getStoragePath(subDir, fileName) {
  return path.join(SHARED_STORAGE_ROOT, subDir, fileName);
}

/**
 * Stream a video file with HTTP 206 partial content range support
 */
function streamVideoFile(fullPath, req, res) {
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Recording file not found' });
  }

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(fullPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/webm',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/webm',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(fullPath).pipe(res);
  }
}

module.exports = {
  SHARED_STORAGE_ROOT,
  saveRecordingFile,
  getStoragePath,
  streamVideoFile,
};
