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

test('Vercel frontend policy omits CORS and keeps public assets cacheable', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const allHeaders = config.headers.flatMap((rule) => rule.headers);
  assert.equal(
    allHeaders.some((header) => header.key.toLowerCase() === 'access-control-allow-origin'),
    false,
  );

  const catchAllIndex = config.headers.findIndex((rule) => rule.source === '/(.*)');
  const assetsIndex = config.headers.findIndex((rule) => rule.source === '/assets/(.*)');
  assert.ok(catchAllIndex >= 0 && assetsIndex > catchAllIndex);
  assert.equal(
    config.headers[assetsIndex].headers.find((header) => header.key === 'Cache-Control')?.value,
    'public, max-age=31536000, immutable',
  );
});
