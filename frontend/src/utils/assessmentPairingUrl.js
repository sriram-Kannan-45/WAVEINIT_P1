/**
 * Assessment Mobile Pairing URL helper
 * Builds the HTTPS mobile URL a phone opens after scanning a Quiz/Coding assessment QR code.
 */

function normalizeHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h.replace(/^\[|\]$/g, '');
}

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === ''
  );
}

export function getAssessmentMobileBaseUrl() {
  if (typeof window === 'undefined') return '';

  // 1. Explicit full URL override (e.g. VITE_PUBLIC_URL=https://einitlms.online)
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

  // 2. Production / Staging / Public Domain (e.g. einitlms.online, *.onrender.com)
  // When running on a public domain, ALWAYS use window.location.origin directly.
  // NEVER append local dev ports (5174) to production hostnames!
  if (!isLocalHostname(hostname)) {
    return location.origin;
  }

  // 3. Localhost Development only:
  // Use VITE_PUBLIC_HOST (LAN IP like 192.168.1.100) if provided, so a phone on the same LAN can reach the dev server.
  const host = import.meta.env.VITE_PUBLIC_HOST || hostname;
  const protocol = location.protocol === 'https:' ? 'https' : (import.meta.env.VITE_PUBLIC_PROTOCOL || 'http');
  const port = location.port || import.meta.env.VITE_PUBLIC_PORT || '5174';
  const defaultPort = (protocol === 'https' && port === '443') || (protocol === 'http' && port === '80');

  return `${protocol}://${host}${defaultPort ? '' : `:${port}`}`;
}

export function buildAssessmentMobileUrl(shortUrl) {
  if (!shortUrl) return null;
  if (/^https?:\/\//i.test(shortUrl)) {
    return shortUrl;
  }
  const base = getAssessmentMobileBaseUrl();
  const path = shortUrl.startsWith('/') ? shortUrl : `/${shortUrl}`;
  return `${base}${path}`;
}

