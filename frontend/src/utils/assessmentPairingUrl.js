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

  const custom = import.meta.env.VITE_PUBLIC_URL;
  if (custom) return custom.replace(/\/+$/, '');

  const location = window.location;
  const hostname = normalizeHostname(location.hostname);

  let protocol = import.meta.env.VITE_PUBLIC_PROTOCOL || 'https';
  if (location.protocol === 'https:') {
    protocol = 'https';
  }

  let host = hostname;
  if (isLocalHostname(hostname)) {
    host = import.meta.env.VITE_PUBLIC_HOST || hostname;
  }

  const port = import.meta.env.VITE_PUBLIC_PORT || location.port || '5174';
  const defaultPort = (protocol === 'https' && port === '443') || (protocol === 'http' && port === '80');
  return `${protocol}://${host}${defaultPort ? '' : `:${port}`}`;
}

export function buildAssessmentMobileUrl(shortUrl) {
  if (!shortUrl) return null;
  if (/^https?:\/\//i.test(shortUrl)) {
    return shortUrl.replace(/^http:\/\//i, 'https://');
  }
  const base = getAssessmentMobileBaseUrl();
  const path = shortUrl.startsWith('/') ? shortUrl : `/${shortUrl}`;
  return `${base}${path}`;
}
