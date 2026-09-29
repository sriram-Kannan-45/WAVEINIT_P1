// Backend auth API on localhost. Only negative + optional positive login; no user creation.
const { test, expect } = require('@playwright/test');
const { API } = require('../utils/endpoints');

test.describe('backend auth api (localhost)', () => {
  test('POST /api/auth/login rejects bad credentials without 500', async ({ request }) => {
    const res = await request.post(API.authLogin, {
      data: { email: `ghost-${Date.now()}@example.com`, password: 'WrongPass123!' },
    });
    expect([400, 401, 403, 422, 429].includes(res.status()), `login status ${res.status()}`).toBeTruthy();
  });

  test('POST /api/auth/login validates shape (missing password -> 4xx)', async ({ request }) => {
    const res = await request.post(API.authLogin, { data: { email: 'x@example.com' } });
    expect(res.status() >= 400 && res.status() < 500, `status ${res.status()}`).toBeTruthy();
  });

  test('seeded admin login returns token (env-gated)', async ({ request }) => {
    const email = process.env.TEST_ADMIN_EMAIL || '';
    const password = process.env.TEST_ADMIN_PASSWORD || '';
    test.skip(!email || !password, 'set TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD to enable');
    const res = await request.post(API.authLogin, { data: { email, password } });
    expect(res.ok(), `login ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    expect(body.token || body.accessToken || body.user, 'expected token/user in response').toBeTruthy();
  });
});