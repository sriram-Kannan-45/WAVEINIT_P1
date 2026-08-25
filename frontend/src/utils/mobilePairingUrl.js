/**
 * Mobile pairing URL helpers.
 * Builds the HTTPS URL a phone opens after scanning an interview QR code.
 *
 * Requirements:
 *  - Mobile camera access REQUIRES a secure context (HTTPS).
 *  - The QR URL generated MUST always start with https://.
 *  - In production, uses window.location.origin directly (e.g. "https://einitlms.online").
 *  - In local dev, uses LAN IP host / dev port when opened on localhost.
 *  - Can be overridden via VITE_PUBLIC_URL environment variable.
 */

function normalizeHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
}

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === ''
  );
}

/**
 * Resolve the base origin used for the mobile pairing QR.
 * e.g. "https://einitlms.online" in production or "http://192.168.1.100:5174" in local dev
 */
export function getMobilePairingBaseUrl() {
  if (typeof window === 'undefined') return '';

  // 1. Custom full URL override if explicitly defined (e.g., VITE_PUBLIC_URL=https://einitlms.online)
  const custom = import.meta.env.VITE_PUBLIC_URL;
  if (custom && typeof custom === 'string' && custom.trim()) {
    let clean = custom.trim().replace(/\/+$/, '');
    if (window.location.protocol === 'https:' && clean.startsWith('http://')) {
      clean = clean.replace(/^http:\/\//i, 'https://');
    }
    return clean;
  }

  const location = window.location;
  const hostname = normalizeHostname(location.hostname);

  // 2. Production / Staging / Non-local domain
  // Never append local dev ports (5174) to production hostnames!
  if (!isLocalHostname(hostname)) {
    return location.origin;
  }

  // 3. Localhost Development only
  const host = import.meta.env.VITE_PUBLIC_HOST || hostname;
  const protocol = location.protocol === 'https:' ? 'https' : (import.meta.env.VITE_PUBLIC_PROTOCOL || 'http');
  const port = location.port || import.meta.env.VITE_PUBLIC_PORT || '5174';
  const defaultPort = (protocol === 'https' && port === '443') || (protocol === 'http' && port === '80');

  return `${protocol}://${host}${defaultPort ? '' : `:${port}`}`;
}

/**
 * Build the full mobile pairing page URL from shortUrl or token.
 * Output format: "https://einitlms.online/interview/mobile/<token>"
 */
export function buildMobilePairingUrl(shortUrl) {
  if (!shortUrl) return null;
  if (/^https?:\/\//i.test(shortUrl)) {
    return shortUrl;
  }
  const base = getMobilePairingBaseUrl();
  const path = shortUrl.startsWith('/') ? shortUrl : `/${shortUrl}`;
  return `${base}${path}`;
}

/**
 * True when the current page is a browser secure context (HTTPS or localhost).
 */
export function isSecureContextForMedia() {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

