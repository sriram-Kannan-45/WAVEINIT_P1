const multer = require('multer');
const path = require('path');
const fs = require('fs');

const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TMP_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `recording_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const uploadRecording = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.webm', '.mp4'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only WebM and MP4 files are allowed'));
    }
  }
});

module.exports = uploadRecording;
