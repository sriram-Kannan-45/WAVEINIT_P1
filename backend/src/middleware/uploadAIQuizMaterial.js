const fs = require('fs');
const multer = require('multer');
const path = require('path');

const uploadsDir = path.join(process.cwd(), 'uploads', 'ai-docs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = (file.originalname || 'material').replace(/[^a-zA-Z0-9.\-_]/g, '').slice(-120);
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const allowedMimes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const allowedExtensions = /\.(pdf|docx|pptx|txt)$/i;

const uploadAIQuizMaterial = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      return cb(new Error('Images are not supported. Please upload PDF, DOCX, PPTX, or TXT files only.'));
    }
    if (allowedMimes.has(file.mimetype) || allowedExtensions.test(file.originalname || '')) {
      return cb(null, true);
    }
    return cb(new Error('Only PDF, DOCX, PPTX, and TXT files are allowed.'));
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

function isImageFile(buffer) {
  if (!buffer || buffer.length < 4) return false;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true;
  if (buffer.length >= 12 && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return true;
  return false;
}

module.exports = { uploadAIQuizMaterial, isImageFile };

