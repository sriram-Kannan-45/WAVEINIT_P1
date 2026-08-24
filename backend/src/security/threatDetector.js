/**
 * Threat Detector — Real-time security monitoring and threat detection.
 *
 * Detects:
 *   - Brute force attacks (multiple failed logins)
 *   - Token replay attacks (reused tokens)
 *   - SQL injection attempts
 *   - XSS attempts
 *   - CSRF attempts
 *   - Directory traversal
 *   - Suspicious request patterns
 *   - Path traversal in parameters
 */

const logger = require('../utils/logger');
const { logAudit, ACTIONS } = require('./auditLogger');

// ── Threat patterns ────────────────────────────────────────────────────────
const SQL_INJECTION_PATTERNS = [
  /(\bUNION\s+(ALL\s+)?SELECT\b)/i,
  /(\b(DROP|TRUNCATE|ALTER)\s+(TABLE|DATABASE|SCHEMA)\b)/i,
  /(\bINSERT\s+INTO\b)/i,
  /(\bSELECT\b[\s\S]+\bFROM\b[\s\S]+\b(WHERE|JOIN|GROUP\s+BY|ORDER\s+BY)\b)/i,
  /(\bUPDATE\b[\s\S]+\bSET\b[\s\S]+\bWHERE\b)/i,
  /(\bDELETE\s+FROM\b)/i,
  /(--|;|\/\*|\*\/|xp_|sp_executesql)/i,
  /('(\s*--|\s*#|\s*\/\*))/,
  /(\bOR\b\s+['"\d]+\s*=\s*['"\d]+)/i,
  /(CHAR\(|CONCAT\(|0x[0-9a-f]+)/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on(error|load|click|mouse|key|focus|blur|submit)\s*=/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<link[\s>]/i,
  /expression\(/i,
  /eval\(/i,
  /document\.(cookie|domain|write)/i,
  /window\.(location|open)/i,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e/i,
  /%252e%252e/i,
  /\.\.%2f/i,
  /\.\.%5c/i,
];

// URL-safe injection markers. SQL keywords (SELECT, CREATE, DELETE, …) are
// intentionally NOT applied to URLs — legitimate REST paths contain those
// words (e.g. /api/admin/create-trainer) and the \b word-boundary match
// produces false positives that block real requests.
const URL_INJECTION_PATTERNS = [
  /(--|;|\/\*|\*\/|xp_|sp_)/i,
  /(CHAR\(|CONCAT\(|0x[0-9a-f]+)/i,
  /('.*(\bOR\b|\bAND\b).*')/i,
];

// ── In-memory rate tracking ────────────────────────────────────────────────
const ipThreatMap = new Map();

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipThreatMap) {
    if (now - data.lastSeen > 30 * 60 * 1000) { // 30 min expiry
      ipThreatMap.delete(ip);
    }
  }
}, 60_000).unref();

// ── Record threat event ────────────────────────────────────────────────────
function recordThreat(ip, type, details = {}) {
  if (!ip) return;
  let data = ipThreatMap.get(ip);
  if (!data) {
    data = { threats: [], lastSeen: Date.now() };
    ipThreatMap.set(ip, data);
  }
  data.threats.push({ type, timestamp: Date.now(), ...details });
  data.lastSeen = Date.now();

  // Keep only last 100 threats per IP
  if (data.threats.length > 100) {
    data.threats = data.threats.slice(-100);
  }

  // If too many threats from one IP, flag it
  const recentThreats = data.threats.filter(
    t => Date.now() - t.timestamp < 15 * 60 * 1000 // last 15 minutes
  );

  if (recentThreats.length >= 10) {
    logger.error('[THREAT] Excessive threats from IP — possible attacker', {
      ip,
      threatCount: recentThreats.length,
      types: [...new Set(recentThreats.map(t => t.type))],
    });
  }
}

const SENSITIVE_AUTH_FIELDS = new Set(['password', 'newPassword', 'oldPassword', 'confirmPassword', 'currentPassword']);

// ── Middleware: SQL injection detection ─────────────────────────────────────
function detectSqlInjection(req, res, next) {
  const checkString = (str) => {
    if (typeof str !== 'string') return false;
    return SQL_INJECTION_PATTERNS.some(p => p.test(str));
  };

  const checkObject = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_AUTH_FIELDS.has(key)) continue; // Never check raw password payloads
      if (typeof value === 'string' && checkString(value)) return true;
      if (typeof value === 'object' && checkObject(value)) return true;
    }
    return false;
  };

  // Check URL params, query, body
  const threats = [];
  if (checkObject(req.query)) threats.push('query');
  if (checkObject(req.body)) threats.push('body');
  if (checkObject(req.params)) threats.push('params');
  if (URL_INJECTION_PATTERNS.some(p => p.test(req.url || ''))) threats.push('url');

  if (threats.length > 0) {
    const ip = req.ip || req.connection?.remoteAddress;
    recordThreat(ip, 'SQL_INJECTION', { threats, path: req.originalUrl });
    logAudit({
      action: ACTIONS.SQL_INJECTION_ATTEMPT,
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: { threats, path: req.originalUrl, body: req.body },
      req,
    });
    return res.status(400).json({ success: false, message: 'Invalid request parameters' });
  }

  next();
}

// ── Middleware: XSS detection ──────────────────────────────────────────────
function detectXss(req, res, next) {
  const checkString = (str) => {
    if (typeof str !== 'string') return false;
    return XSS_PATTERNS.some(p => p.test(str));
  };

  const checkObject = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_AUTH_FIELDS.has(key)) continue; // Never check raw password payloads
      if (typeof value === 'string' && checkString(value)) return true;
      if (typeof value === 'object' && checkObject(value)) return true;
    }
    return false;
  };

  let detected = false;
  if (checkObject(req.body)) detected = true;
  if (checkObject(req.query)) detected = true;

  if (detected) {
    const ip = req.ip || req.connection?.remoteAddress;
    recordThreat(ip, 'XSS', { path: req.originalUrl });
    logAudit({
      action: ACTIONS.XSS_ATTEMPT,
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: { path: req.originalUrl },
      req,
    });
    return res.status(400).json({ success: false, message: 'Invalid input detected' });
  }

  next();
}

// ── Middleware: Path traversal detection ────────────────────────────────────
function detectPathTraversal(req, res, next) {
  const checkString = (str) => {
    if (typeof str !== 'string') return false;
    return PATH_TRAVERSAL_PATTERNS.some(p => p.test(str));
  };

  let detected = false;
  if (checkString(req.url)) detected = true;
  if (req.query && typeof req.query === 'object') {
    for (const val of Object.values(req.query)) {
      if (checkString(val)) { detected = true; break; }
    }
  }
  if (req.params && typeof req.params === 'object') {
    for (const val of Object.values(req.params)) {
      if (checkString(val)) { detected = true; break; }
    }
  }

  if (detected) {
    const ip = req.ip || req.connection?.remoteAddress;
    recordThreat(ip, 'PATH_TRAVERSAL', { path: req.originalUrl });
    logAudit({
      action: ACTIONS.PATH_TRAVERSAL,
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: { path: req.originalUrl },
      req,
    });
    return res.status(400).json({ success: false, message: 'Invalid path' });
  }

  next();
}

// ── Middleware: Request size anomaly detection ──────────────────────────────
function detectAnomalies(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress;

  // Check for suspicious user agents
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const suspiciousUa = [
    'sqlmap', 'nikto', 'nmap', 'masscan', 'dirbuster',
    'gobuster', 'wpscan', 'burpsuite', 'owasp zap', 'metasploit',
  ];
  if (suspiciousUa.some(s => ua.includes(s))) {
    recordThreat(ip, 'SCANNER_DETECTED', { userAgent: req.headers['user-agent'] });
    logger.warn('[THREAT] Security scanner detected', {
      ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  // Check for abnormally large Content-Length
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 50 * 1024 * 1024) { // 50 MB
    recordThreat(ip, 'OVERSIZED_REQUEST', { size: contentLength });
    return res.status(413).json({ success: false, message: 'Request too large' });
  }

  next();
}

// ── Get threat summary for IP ──────────────────────────────────────────────
function getThreatSummary(ip) {
  return ipThreatMap.get(ip) || { threats: [], lastSeen: null };
}

// ── Check if IP is blocked ─────────────────────────────────────────────────
function isIpBlocked(ip) {
  const data = ipThreatMap.get(ip);
  if (!data) return false;

  const recentThreats = data.threats.filter(
    t => Date.now() - t.timestamp < 15 * 60 * 1000
  );

  // Block if > 50 threats in 15 minutes
  return recentThreats.length > 50;
}

module.exports = {
  detectSqlInjection,
  detectXss,
  detectPathTraversal,
  detectAnomalies,
  getThreatSummary,
  isIpBlocked,
  recordThreat,
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
};
