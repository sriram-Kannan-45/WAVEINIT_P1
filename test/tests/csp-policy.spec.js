// Static guards over the deployed security policy.
// Reads frontend/vercel.json + frontend/security/policy.js. Read-only.
// Prevents the split-brain regression where the static CDN policy silently
// allows weaker scripts than the nonce middleware.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const vercelJson = JSON.parse(fs.readFileSync(path.join(FRONTEND_DIR, 'vercel.json'), 'utf8'));
const policyJs = fs.readFileSync(path.join(FRONTEND_DIR, 'security', 'policy.js'), 'utf8');
const middlewareJs = fs.readFileSync(path.join(FRONTEND_DIR, 'middleware.js'), 'utf8');

function staticHeaders() {
  return vercelJson.headers.flatMap((rule) => rule.headers);
}

function staticCsp() {
  const header = staticHeaders().find((h) => h.key.toLowerCase() === 'content-security-policy');
  return header ? header.value : '';
}

test.describe('frontend CSP policy guards', () => {
  test('static CSP never allows unsafe or eval scripts', () => {
    const csp = staticCsp();
    expect(csp, 'vercel.json must define a Content-Security-Policy').toBeTruthy();

    const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
    expect(scriptSrc, `script-src must not allow unsafe-inline: ${scriptSrc}`).not.toContain('unsafe-inline');
    expect(scriptSrc, `script-src must not allow unsafe-eval: ${scriptSrc}`).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-eval');
  });

  test('static CSP locks down object-src, base-uri and frame-ancestors', () => {
    const csp = staticCsp();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toMatch(/frame-ancestors 'none'|frame-ancestors 'self'/);
  });

  test('static CSP keeps HSTS + nosniff + frame denial headers', () => {
    const keys = staticHeaders().map((h) => h.key.toLowerCase());
    expect(keys).toContain('strict-transport-security');
    expect(keys).toContain('x-content-type-options');
    expect(keys).toContain('x-frame-options');
    expect(keys).toContain('referrer-policy');
    expect(keys).toContain('permissions-policy');
  });

  test('nonce middleware generates a per-response nonce policy', () => {
    expect(policyJs).toMatch(/generateNonce/);
    expect(policyJs).toMatch(/nonce-\$\{nonce\}/);
    expect(policyJs).toMatch(/strict-dynamic/);
    // The middleware must overwrite the static policy for HTML documents.
    expect(middlewareJs).toMatch(/getSecurityHeaders\(nonce\)/);
    expect(middlewareJs).toMatch(/isHtmlDocumentRequest/);
  });

  test('API origins referenced by CSP are https/wss only', () => {
    const origins = [...policyJs.matchAll(/'(https:\/\/[^']+)'/g)].map((m) => m[1]);
    expect(origins.length, 'expected https API origins in policy.js').toBeGreaterThan(0);
    for (const origin of origins) {
      expect(origin.startsWith('https://'), `non-https origin: ${origin}`).toBe(true);
    }
    const wsOrigins = [...policyJs.matchAll(/wss:/g)];
    expect(wsOrigins.length).toBeGreaterThan(0);
  });
});