import test from 'node:test';
import assert from 'node:assert/strict';
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
