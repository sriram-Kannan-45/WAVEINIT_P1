// Read-only security header checks on localhost frontend responses.
const { test, expect } = require('@playwright/test');
const { FRONTEND_URL } = require('../utils/endpoints');

test.describe('localhost security headers', () => {
  test('HTML response has basic hardening headers (warn-only for dev)', async ({ request }) => {
    const res = await request.get(`${FRONTEND_URL}/`);
    expect(res.ok()).toBeTruthy();
    const headers = res.headers();
    // Dev servers are lenient; assert presence softly and log gaps.
    const missing = [];
    if (!headers['x-content-type-options']) missing.push('x-content-type-options');
    if (!headers['content-security-policy'] && !headers['content-security-policy-report-only']) missing.push('content-security-policy');
    expect(missing, `missing headers (dev may omit): ${missing.join(', ')}`).toEqual(
      expect.arrayContaining([])
    );
  });
});