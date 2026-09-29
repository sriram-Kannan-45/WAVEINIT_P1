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

// ── Magic-byte (file signature) detection ──────────────────────────────────
// multer's `mimetype` comes from the client and is trivially spoofed, so the
// real content signature must be checked once the bytes are available.
const SIGNATURES = [
  { type: 'pdf', test: (b) => b.length >= 5 && b.slice(0, 5).toString('latin1') === '%PDF-' },
  { type: 'zip', test: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
  { type: 'png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'gif', test: (b) => b.length >= 4 && b.slice(0, 4).toString('latin1') === 'GIF8' },
  { type: 'bmp', test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
  { type: 'webp', test: (b) => b.length >= 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  { type: 'tiff', test: (b) => b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) },
  { type: 'svg', test: (b) => b.length >= 5 && /^<(\?xml|svg)/i.test(b.slice(0, 64).toString('latin1').trim()) },
  // Executables / linkables — never acceptable for a document upload.
  { type: 'mz', test: (b) => b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a },
  { type: 'elf', test: (b) => b.length >= 4 && b[0] === 0x7f && b.slice(1, 4).toString('latin1') === 'ELF' },
  { type: 'macho', test: (b) => b.length >= 4 && [0xfeedface, 0xfeedfacf, 0xcafebabe].includes(b.readUInt32BE(0)) },
  { type: 'class', test: (b) => b.length >= 4 && b.readUInt32BE(0) === 0xcafebabe },
  { type: 'gzip', test: (b) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b },
];

const IMAGE_SIGNATURES = new Set(['png', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'svg']);
const EXECUTABLE_SIGNATURES = new Set(['mz', 'elf', 'macho', 'class']);

/**
 * Identify a buffer by its magic bytes.
 * @returns {string} one of the SIGNATURES types, 'text', or 'unknown'
 */
function detectFileSignature(buffer) {
  if (!buffer || buffer.length < 2) return 'unknown';
  for (const sig of SIGNATURES) {
    try {
      if (sig.test(buffer)) return sig.type;
    } catch (_) {
      // Malformed/short buffer for this signature — try the next one.
    }
  }
  // A NUL byte in the first 8 KiB means binary, not text.
  const head = buffer.slice(0, Math.min(buffer.length, 8192));
  if (!head.includes(0x00)) return 'text';
  return 'unknown';
}

/**
 * Confirm the bytes on disk match the claimed extension.
 * Rejects executables outright and requires pdf/docx/pptx/zip to carry the
 * correct container signature.
 */
function validateFileSignature(buffer, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  const type = detectFileSignature(buffer);

  if (EXECUTABLE_SIGNATURES.has(type)) {
    return { valid: false, error: 'Executable content is not allowed' };
  }
  if (type === 'unknown') {
    return { valid: false, error: 'File content could not be recognized' };
  }
  if (IMAGE_SIGNATURES.has(type)) {
    return { valid: false, error: 'Images are not supported' };
  }

  const containerExts = new Set(['.docx', '.pptx', '.xlsx']);
  if (containerExts.has(ext) && type !== 'zip') {
    return { valid: false, error: `File content does not match the ${ext} extension` };
  }
  if (ext === '.pdf' && type !== 'pdf') {
    return { valid: false, error: 'File content does not match the .pdf extension' };
  }
  if (ext === '.txt' && type !== 'text') {
    return { valid: false, error: 'File content does not match the .txt extension' };
  }

  return { valid: true, signature: type };
}

module.exports = {
  validateFile,
  validateFileSignature,
  detectFileSignature,
  sanitizeFilename,
  createFileFilter,
  ALLOWED_TYPES,
};
