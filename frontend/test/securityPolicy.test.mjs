import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  addNonceToDocument,
  buildContentSecurityPolicy,
  isHtmlDocumentRequest,
} from '../security/policy.js';

test('nonce CSP does not permit unsafe scripts and protects style elements', () => {
  const csp = buildContentSecurityPolicy('nonce-value');
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /script-src 'nonce-nonce-value' 'strict-dynamic'/);
  assert.match(csp, /style-src 'self' 'nonce-nonce-value'/);
});

test('HTML transform gives every initial script and style the same nonce', () => {
  const html = addNonceToDocument(
    '<html><head></head><body><style>body{}</style><script src="/app.js"></script></body></html>',
    'nonce-value',
  );
  assert.match(html, /meta name="csp-nonce" content="nonce-value"/);
  assert.match(html, /<style nonce="nonce-value">/);
  assert.match(html, /<script nonce="nonce-value" src="\/app.js">/);
});

test('only browser HTML document requests enter the nonce transformer', () => {
  assert.equal(isHtmlDocumentRequest(new Request('https://example.test/', {
    headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
  })), true);
  assert.equal(isHtmlDocumentRequest(new Request('https://example.test/assets/app.js', {
    headers: { accept: '*/*', 'sec-fetch-dest': 'script' },
  })), false);
});

test('Vercel frontend policy restricts CORS to specific origin and keeps public assets cacheable', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const allHeaders = config.headers.flatMap((rule) => rule.headers);
  const corsHeaders = allHeaders.filter((header) => header.key.toLowerCase() === 'access-control-allow-origin');
  
  // Ensure CORS headers are set to specific origin, not wildcard
  assert.ok(corsHeaders.length > 0, 'CORS headers should be present');
  corsHeaders.forEach(header => {
    assert.equal(header.value, 'https://www.waveinitlms.online', 'CORS should be restricted to specific origin');
  });

  const catchAllIndex = config.headers.findIndex((rule) => rule.source === '/(.*)');
  const assetsIndex = config.headers.findIndex((rule) => rule.source === '/assets/(.*)');
  assert.ok(catchAllIndex >= 0 && assetsIndex > catchAllIndex);
  assert.equal(
    config.headers[assetsIndex].headers.find((header) => header.key === 'Cache-Control')?.value,
    'public, max-age=31536000, immutable',
  );
  
  // Ensure assets also have specific CORS header
  assert.equal(
    config.headers[assetsIndex].headers.find((header) => header.key === 'Access-Control-Allow-Origin')?.value,
    'https://www.waveinitlms.online',
    'Assets should have specific CORS origin'
  );
});
