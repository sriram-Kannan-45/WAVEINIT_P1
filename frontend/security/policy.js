const API_ORIGINS = [
  'https://waveinint-ahhsevgvcqaeesh2.centralindia-01.azurewebsites.net',
  'https://waveinint.azurewebsites.net',
  'https://waveinit-init-a9bfbeh3fgh0f0ca.centralindia-01.azurewebsites.net',
  'https://waveinit-init.azurewebsites.net',
];

const SOCKET_ORIGINS = API_ORIGINS.map((origin) => origin.replace(/^https:/, 'wss:'));

export const INTERNAL_RENDER_HEADER = 'x-waveinit-internal-render';

export function buildContentSecurityPolicy(nonce) {
  const scriptSource = nonce ? `'nonce-${nonce}' 'strict-dynamic'` : "'self'";
  const styleSource = nonce ? `'self' 'nonce-${nonce}'` : "'self'";
  return [
    "default-src 'self'",
    `script-src ${scriptSource}`,
    "script-src-attr 'none'",
    `style-src ${styleSource}`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${[...API_ORIGINS, 'https://res.cloudinary.com'].join(' ')}`,
    `connect-src 'self' ${[...API_ORIGINS, ...SOCKET_ORIGINS, 'https://res.cloudinary.com'].join(' ')}`,
    `media-src 'self' data: blob: ${[...API_ORIGINS, 'https://res.cloudinary.com'].join(' ')}`,
    `frame-src 'self' blob: data: ${[...API_ORIGINS, 'https://res.cloudinary.com'].join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function getSecurityHeaders(nonce) {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(nonce),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

export function isHtmlDocumentRequest(request) {
  const destination = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET'
    && ['', 'document', 'frame', 'iframe'].includes(destination)
    && !/prefetch|prerender/i.test(purpose)
    && /text\/html|application\/xhtml\+xml/i.test(accept);
}

export function isHtmlResponse(response) {
  return response.status >= 200
    && response.status < 400
    && (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

export function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

export function addNonceToDocument(html, nonce) {
  const withNonce = html
    .replace(/<script\b([^>]*)>/gi, (_tag, attributes) => {
      const withoutNonce = attributes.replace(/\s+nonce=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `<script nonce="${nonce}"${withoutNonce}>`;
    })
    .replace(/<style\b([^>]*)>/gi, (_tag, attributes) => {
      const withoutNonce = attributes.replace(/\s+nonce=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `<style nonce="${nonce}"${withoutNonce}>`;
    });
  return withNonce.replace(/<head(\s[^>]*)?>/i, (tag) => `${tag}<meta name="csp-nonce" content="${nonce}">`);
}
