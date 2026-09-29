// Full-project smoke through the UI on localhost. No data writes except optional login.
const { test, expect } = require('@playwright/test');
const { FRONTEND_URL, UI } = require('../utils/endpoints');
const { PublicPages } = require('../pages/PublicPages');
const { LoginPage } = require('../pages/LoginPage');

test.describe('feedWeb localhost smoke @smoke', () => {
  test('frontend root loads without blank page', async ({ page }) => {
    const pub = new PublicPages(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await pub.openRoot(FRONTEND_URL);
    await expect(page.locator('body')).not.toBeEmpty();
    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('/login renders email + password + submit', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open(FRONTEND_URL);
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
  });

  test('/register renders form', async ({ page }) => {
    await page.goto(UI.register, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('/verify-certificate + /privacy are reachable', async ({ page }) => {
    const pub = new PublicPages(page);
    await pub.openVerifyCertificate(FRONTEND_URL);
    expect(page.url()).toContain('/verify-certificate');
    await pub.openPrivacy(FRONTEND_URL);
    expect(page.url()).toContain('/privacy');
  });

  test('unknown route redirects by auth state (no 500)', async ({ page }) => {
    const res = await page.goto(`${FRONTEND_URL}/__no_such_route_${Date.now()}`, { waitUntil: 'domcontentloaded' });
    expect(res && res.status() < 500, `unexpected status ${res && res.status()}`).toBeTruthy();
  });
});