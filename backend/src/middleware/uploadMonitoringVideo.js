const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getUploadsPath } = require('../config/paths');

const UPLOADS_DIR = getUploadsPath('monitoring-videos');

// Webcam monitoring videos are recorded only for post-test human review. They
// are NOT consumed by the MediaPipe/YOLO inference pipeline, which operates on
// individual in-memory frames. Storage is therefore disabled by default to
// avoid unbounded disk growth. Opt back in with MONITORING_VIDEO_STORAGE=true.
const VIDEO_STORAGE_ENABLED = process.env.MONITORING_VIDEO_STORAGE === 'true';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const sessionId = (req.params.id || 'session').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(file.originalname) || '.webm';
    const timestamp = Date.now();
    cb(null, `monitoring_${sessionId}_${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.webm', '.mp4', '.mkv', '.avi', '.mov'];
    const ext = path.extname(file.originalname).toLowerCase() || '.webm';
    if (allowedExtensions.includes(ext) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files (WebM, MP4, MKV) are allowed'));
    }
  },
});

function disabledMiddleware(req, res, next) {
  return res.status(403).json({
    error: 'Monitoring video storage is disabled (set MONITORING_VIDEO_STORAGE=true to enable). ' +
      'MediaPipe/YOLO inference runs on in-memory frames and does not require the video file.',
  });
}

module.exports = {
  enabled: VIDEO_STORAGE_ENABLED,
  single(fieldName) {
    return VIDEO_STORAGE_ENABLED ? upload.single(fieldName) : disabledMiddleware;
  },
};