/**
 * uploadMaterial.js
 * ─────────────────
 * Multer config for lesson materials (PDF, PPT, VIDEO, IMAGE).
 *
 * Files land under backend/uploads/materials/ (served via the existing
 * /uploads static mount). One combined multer instance is used so that
 * material_type can be read from the multipart body after parsing — the
 * controller then validates the type and applies the per-type size limit.
 *
 * Per-type size limits ENFORCED BY THE CONTROLLER (after upload):
 *   PDF   →  50 MB
 *   PPT   → 100 MB
 *   VIDEO → 500 MB
 *   IMAGE →  10 MB
 *
 * The hard multer limit is 500 MB (largest valid upload). The controller
 * deletes the uploaded file and returns 413 if the per-type limit is
 * exceeded.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(process.cwd(), 'uploads', 'materials');
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ROOT),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9.\-_]/g, '').slice(-100);
    cb(null, `${Date.now()}-${safe}`);
  },
});

const ALLOWED = [
  /^application\/pdf$/, /\.pdf$/i,
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/,
  /^application\/vnd\.ms-powerpoint$/,
  /\.(pptx?|ppt)$/i,
  /^video\//, /\.(mp4|webm|mov|avi)$/i,
  /^image\//, /\.(jpe?g|png|gif|webp|bmp)$/i,
];

const uploadAny = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED.some(rx => rx.test(file.mimetype) || rx.test(file.originalname));
    if (ok) cb(null, true);
    else    cb(new Error(`Unsupported file type: ${file.mimetype || file.originalname}`));
  },
});

// Per-type byte caps used by the controller after the file is on disk.
const TYPE_LIMITS = {
  PDF:   50  * 1024 * 1024,
  PPT:   100 * 1024 * 1024,
  VIDEO: 500 * 1024 * 1024,
  IMAGE: 10  * 1024 * 1024,
};

module.exports = {
  uploadAny,            // multer instance — use .single('file') or .array('files', 10)
  TYPE_LIMITS,
  ROOT,
};
