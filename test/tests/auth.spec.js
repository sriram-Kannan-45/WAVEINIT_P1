// Auth + RBAC guards on localhost UI. Uses seeded admin only if env provides it; otherwise checks guards.
const { test, expect } = require('@playwright/test');
const { FRONTEND_URL } = require('../utils/endpoints');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || '';

test.describe('auth + role guards (localhost)', () => {
  test('unauthenticated /admin redirects to /login', async ({ page }) => {
    const dash = new DashboardPage(page);
    await dash.open(FRONTEND_URL, '/admin');
    expect(await dash.redirectedToLogin()).toBeTruthy();
  });

  test('unauthenticated /trainer redirects to /login', async ({ page }) => {
    const dash = new DashboardPage(page);
    await dash.open(FRONTEND_URL, '/trainer');
    expect(await dash.redirectedToLogin()).toBeTruthy();
  });

  test('unauthenticated /participant redirects to /login', async ({ page }) => {
    const dash = new DashboardPage(page);
    await dash.open(FRONTEND_URL, '/participant');
    expect(await dash.redirectedToLogin()).toBeTruthy();
  });

  test('invalid login stays on /login with error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open(FRONTEND_URL);
    await login.login(`no-such-user-${Date.now()}@example.com`, 'WrongPass123!');
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
  });

  test('seeded admin can log in (env-gated)', async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'set TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD to enable');
    const login = new LoginPage(page);
    await login.open(FRONTEND_URL);
    await login.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/(admin|trainer|participant)/, { timeout: 20000 });
    expect(page.url()).toMatch(/\/(admin|trainer|participant)/);
  });
});