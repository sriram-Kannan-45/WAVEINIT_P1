import { next } from '@vercel/functions';
import {
  INTERNAL_RENDER_HEADER,
  addNonceToDocument,
  generateNonce,
  getSecurityHeaders,
  isHtmlDocumentRequest,
  isHtmlResponse,
} from './security/policy.js';

export const config = {
  matcher: ['/((?!assets/|favicon.svg$|robots.txt$|bootstrap\\.(css|js)$).*)'],
};

function stripInvalidBodyHeaders(headers) {
  for (const name of ['CDN-Cache-Control', 'Vercel-CDN-Cache-Control', 'Vercel-Cache-Tag', 'Content-Length', 'Content-Encoding', 'ETag', 'Content-Digest', 'Digest']) {
    headers.delete(name);
  }
}

async function withFreshNonce(raw) {
  const nonce = generateNonce();
  const html = addNonceToDocument(await raw.text(), nonce);
  const headers = new Headers(raw.headers);
  for (const [name, value] of Object.entries(getSecurityHeaders(nonce))) headers.set(name, value);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  stripInvalidBodyHeaders(headers);
  return new Response(html, { status: raw.status, statusText: raw.statusText, headers });
}

export default async function middleware(request) {
  const secret = process.env.INTERNAL_RENDER_SECRET;
  const marker = request.headers.get(INTERNAL_RENDER_HEADER);
  if (!secret) return new Response('Frontend security is not configured.', { status: 500 });
  if (marker !== null) return marker === secret ? next() : new Response('Forbidden', { status: 403 });
  if (!isHtmlDocumentRequest(request)) return next();

  const headers = new Headers(request.headers);
  headers.set(INTERNAL_RENDER_HEADER, secret);
  headers.delete('authorization');
  headers.delete('cookie');
  const raw = await fetch(request.url, { headers, redirect: 'manual' });
  return isHtmlResponse(raw) ? withFreshNonce(raw) : raw;
}
