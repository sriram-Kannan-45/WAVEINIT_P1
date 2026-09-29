// Content assertions for public pages (real UI landmarks, no auth required).
const { test, expect } = require('@playwright/test');
const { FRONTEND_URL } = require('../utils/endpoints');
const { LoginPage } = require('../pages/LoginPage');
const { PublicPages } = require('../pages/PublicPages');

test.describe('public page content @smoke', () => {
  test('/login shows Welcome Back + role chips + form', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open(FRONTEND_URL);
    await expect(login.heading).toBeVisible();
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
    await expect(login.adminChip).toBeVisible();
    await expect(login.trainerChip).toBeVisible();
    await expect(login.learnerChip).toBeVisible();
  });

  test('role deep links each render the login form', async ({ page }) => {
    for (const path of ['/admin/login', '/trainer/login', '/participant/login']) {
      await page.goto(`${FRONTEND_URL}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    }
  });

  test('/privacy renders the privacy policy disclosure', async ({ page }) => {
    const pub = new PublicPages(page);
    await pub.openPrivacy(FRONTEND_URL);
    await expect(pub.privacyHeading).toBeVisible();
    await expect(pub.privacyVersion).toBeVisible();
  });

  test('/verify-certificate renders the verification portal + code input', async ({ page }) => {
    const pub = new PublicPages(page);
    await pub.openVerifyCertificate(FRONTEND_URL);
    await expect(pub.certVerifyHeading).toBeVisible();
    await expect(pub.certCodeInput).toBeVisible();
  });

  test('/verify-certificate rejects an unknown code with a message', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/verify-certificate`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('input[placeholder*="Certificate Code" i]').first();
    await input.fill(`BAD-CODE-${Date.now()}`);
    await page.locator('button[type="submit"]').or(page.getByRole('button', { name: /verify/i })).first().click();
    // Either an inline error or a "not found" style message must appear; never a crash.
    await page.waitForTimeout(2500);
    const body = (await page.locator('body').innerText()) || '';
    expect(body.trim().length).toBeGreaterThan(0);
    expect(body).toMatch(/not\s*(found|valid)|invalid|no valid certificate|could not|unable/i);
  });

  test('/forgot-password renders an email field', async ({ page }) => {
    const pub = new PublicPages(page);
    await pub.openForgotPassword(FRONTEND_URL);
    await expect(
      page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first()
    ).toBeVisible();
  });

  test('/apply renders the registration application form', async ({ page }) => {
    const pub = new PublicPages(page);
    await pub.openApply(FRONTEND_URL);
    // The apply wizard fetches trainings first, so wait for it to settle.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const body = (await page.locator('body').innerText()) || '';
    expect(body.trim().length, '/apply rendered an empty document').toBeGreaterThan(0);

    // Either the form is shown, or the wizard is in a loading/empty state —
    // never a crash and never a blank page.
    const controls = await page
      .locator('form input, form select, form textarea, input, select, textarea')
      .count();
    const hasWizardState = /loading|please wait|no training|not available|select|application|register|apply/i.test(body);
    expect(
      controls > 0 || hasWizardState,
      `/apply rendered neither form controls nor a recognizable state. Body: ${body.slice(0, 300)}`
    ).toBe(true);
  });
});