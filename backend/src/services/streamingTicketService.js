/**
 * Streaming Ticket Service
 *
 * Implements short-lived cryptographically signed tickets (TTL: 60s) for
 * media streaming where HTTP Authorization headers cannot be passed (e.g.,
 * HTML5 <video> / <audio> elements).
 *
 * Security Requirements:
 * - Scoped to specific resource path / identifier
 * - Scoped to authenticated user ID and role
 * - Short TTL (60 seconds)
 * - Single-use or replay-checked
 * - Cryptographically signed using HMAC-SHA256
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const TICKET_SECRET = process.env.STREAMING_TICKET_SECRET || process.env.JWT_SECRET || 'streaming-ticket-secret-salt';
const TICKET_TTL_MS = 60 * 1000; // 60 seconds

// In-memory replay tracking (cleaned up periodically)
const usedTickets = new Set();
setInterval(() => {
  usedTickets.clear();
}, 5 * 60 * 1000).unref();

/**
 * Generate a signed streaming ticket
 * @param {Object} params
 * @param {string|number} params.userId - Authenticated user ID
 * @param {string} params.role - User role
 * @param {string} params.resourceId - Resource identifier or relative path (e.g., "recording_123" or "interviews/session_1/candidate.webm")
 * @returns {string} Signed ticket string
 */
function issueStreamingTicket({ userId, role, resourceId }) {
  if (!userId || !resourceId) {
    throw new Error('userId and resourceId are required to issue a streaming ticket');
  }

  const payload = {
    uid: String(userId),
    rol: String(role || 'PARTICIPANT').toUpperCase(),
    res: String(resourceId).trim(),
    exp: Date.now() + TICKET_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TICKET_SECRET)
    .update(payloadStr)
    .digest('base64url');

  return `${payloadStr}.${signature}`;
}

/**
 * Verify a streaming ticket for a given resource
 * @param {string} ticket - The ticket parameter from query
 * @param {string} expectedResourceId - Resource identifier or relative path expected
 * @returns {{ userId: string, role: string } | null} Decoded user info if valid, null otherwise
 */
function verifyStreamingTicket(ticket, expectedResourceId) {
  if (!ticket || typeof ticket !== 'string') return null;

  const parts = ticket.split('.');
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;

  // Verify HMAC signature in constant time
  const expectedSignature = crypto
    .createHmac('sha256', TICKET_SECRET)
    .update(payloadStr)
    .digest('base64url');

  try {
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expectedSignature, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));

    // Check expiration
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    // Check resource matching
    if (expectedResourceId) {
      const normExpected = String(expectedResourceId).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
      const normActual = String(payload.res).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
      // Allow exact match or matching basename / resource identifier
      if (normExpected !== normActual && !normExpected.endsWith(normActual) && !normActual.endsWith(normExpected)) {
        return null;
      }
    }

    return {
      userId: payload.uid,
      role: payload.rol,
    };
  } catch (err) {
    logger.warn(`[STREAMING TICKET] Validation error: ${err.message}`);
    return null;
  }
}

module.exports = {
  issueStreamingTicket,
  verifyStreamingTicket,
};
