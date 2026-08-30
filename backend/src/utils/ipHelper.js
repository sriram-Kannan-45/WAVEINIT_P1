/**
 * IP Normalization Helper for Azure App Service, Reverse Proxies, and Local Dev.
 *
 * Handles:
 * - IPv4 with port (e.g. 103.215.171.1:62579 -> 103.215.171.1)
 * - Bracketed IPv6 with port (e.g. [2001:db8::1]:8080 -> 2001:db8::1)
 * - IPv4-mapped IPv6 (e.g. ::ffff:103.215.171.1:62579 -> 103.215.171.1)
 * - Comma-separated X-Forwarded-For headers (takes client IP)
 * - Standard IPv4 and IPv6 addresses
 */

const net = require('net');

/**
 * Normalizes any raw IP string into a valid, port-free IPv4 or IPv6 address.
 *
 * @param {string|undefined} rawIp
 * @returns {string} Clean valid IP address
 */
function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return '127.0.0.1';
  let ip = rawIp.trim();

  // If comma-separated (e.g. X-Forwarded-For: client, proxy1, proxy2)
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }

  // Bracketed IPv6 with port: [2001:db8::1]:8080 or [::1]
  const bracketMatch = ip.match(/^\[([a-fA-F0-9:]+)\](?::\d+)?$/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  // IPv4 with optional port: 103.215.171.1:62579 -> 103.215.171.1
  const ipv4Match = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4Match) {
    return ipv4Match[1];
  }

  // IPv4-mapped IPv6: ::ffff:103.215.171.1:62579 -> 103.215.171.1
  const ipv4MappedMatch = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/i);
  if (ipv4MappedMatch) {
    return ipv4MappedMatch[1];
  }

  // If already a valid IPv6 or IPv4
  if (net.isIP(ip)) {
    return ip;
  }

  // If trailing port on unbracketed IPv6-like string
  const cleanIp = ip.replace(/:\d+$/, '');
  if (net.isIP(cleanIp)) {
    return cleanIp;
  }

  return ip;
}

/**
 * Extracts and normalizes the client IP from an Express request object.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const raw =
    (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-client-ip'] || req.headers['x-real-ip'])) ||
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress;
  return normalizeIp(raw);
}

/**
 * Express middleware that normalizes req.ip on all incoming requests.
 */
function ipNormalizerMiddleware(req, res, next) {
  const cleanIp = getClientIp(req);
  Object.defineProperty(req, 'ip', {
    value: cleanIp,
    writable: true,
    configurable: true,
  });
  next();
}

module.exports = {
  normalizeIp,
  getClientIp,
  ipNormalizerMiddleware,
};
