/**
 * File Validator — Secure file upload validation.
 *
 * Validates: MIME type, file extension, file size, filename safety.
 * Prevents: path traversal, double-extension, MIME sniffing, oversized uploads.
 */

const path = require('path');
const logger = require('../utils/logger');

// ── Allowed MIME types and extensions ──────────────────────────────────────
const ALLOWED_TYPES = {
  document: {
    mime: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
    extensions: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'],
    maxSize: 25 * 1024 * 1024, // 25 MB
  },
  image: {
    mime: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSize: 5 * 1024 * 1024, // 5 MB
  },
  video: {
    mime: [
      'video/webm',
      'video/mp4',
      'video/quicktime',
    ],
    extensions: ['.webm', '.mp4', '.mov'],
    maxSize: 500 * 1024 * 1024, // 500 MB
  },
  profile: {
    mime: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'],
    maxSize: 5 * 1024 * 1024, // 5 MB
  },
  recording: {
    mime: [
      'video/webm',
      'video/mp4',
    ],
    extensions: ['.webm', '.mp4'],
    maxSize: 500 * 1024 * 1024, // 500 MB
  },
};

// ── Dangerous patterns ────────────────────────────────────────────────────
const DANGEROUS_PATTERNS = [
  /\.\./,                    // Path traversal
  /^\.+$/,                   // Only dots
  /[<>"|?*]/,               // Windows special chars
  /[\x00-\x1f]/,            // Control characters
  /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i, // Windows reserved names
];

// ── Sanitize filename ──────────────────────────────────────────────────────
function sanitizeFilename(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext)
    .replace(/[^a-zA-Z0-9\-_.]/g, '')  // Keep only safe chars
    .replace(/-{2,}/g, '-')             // Collapse multiple dashes
    .slice(0, 100);                      // Limit length

  if (!base) return `upload_${Date.now()}${ext}`;
  return `${base}${ext}`;
}

// ── Validate a file upload ─────────────────────────────────────────────────
function validateFile(file, category = 'document') {
  const config = ALLOWED_TYPES[category];
  if (!config) {
    return { valid: false, error: `Unknown file category: ${category}` };
  }

  // Check file exists
  if (!file || !file.originalname) {
    return { valid: false, error: 'No file provided' };
  }

  const ext = path.extname(file.originalname).toLowerCase();

  // Check extension
  if (!config.extensions.includes(ext)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed: ${config.extensions.join(', ')}`,
    };
  }

  // Check MIME type (if provided)
  const mime = (file.mimetype || '').toLowerCase();
  if (mime && !config.mime.includes(mime)) {
    // Some systems don't provide accurate MIME types, so we check but don't always reject
    if (ext === '.pdf' && !mime.includes('pdf')) {
      return { valid: false, error: 'MIME type does not match file extension' };
    }
  }

  // Check file size
  const size = file.size || 0;
  if (size > config.maxSize) {
    const maxMB = Math.round(config.maxSize / (1024 * 1024));
    return { valid: false, error: `File too large. Maximum size: ${maxMB} MB` };
  }

  // Check for dangerous filename patterns
  const filename = file.originalname;
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(filename)) {
      return { valid: false, error: 'Filename contains dangerous characters' };
    }
  }

  // Check for double extensions (e.g., malware.pdf.exe)
  const parts = filename.split('.');
  if (parts.length > 3) {
    return { valid: false, error: 'Filename has too many extensions' };
  }

  // Return safe filename
  return {
    valid: true,
    safeName: sanitizeFilename(file.originalname),
  };
}

// ── Middleware factory for multer fileFilter ────────────────────────────────
function createFileFilter(category) {
  return (req, file, cb) => {
    const result = validateFile(file, category);
    if (result.valid) {
      file.sanitizedName = result.safeName;
      cb(null, true);
    } else {
      cb(new Error(result.error), false);
    }
  };
}

module.exports = {
  validateFile,
  sanitizeFilename,
  createFileFilter,
  ALLOWED_TYPES,
};
