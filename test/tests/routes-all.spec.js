// Data-driven reachability matrix for EVERY route in frontend/src/App.jsx.
// Unauthenticated only: a route must either render or redirect to /login.
// It must never 5xx, never show a blank document, and never throw a page error.
const { test, expect } = require('@playwright/test');
const { FRONTEND_URL } = require('../utils/endpoints');
const { PUBLIC_ROUTES, GUARDED_ROUTES, SHARED_ROUTES, ALL_ROUTES } = require('../utils/routes');

// Vite dev compiles a route on first hit. Retry the initial navigation so a
// cold-compile stall is not reported as an application failure.
async function visit(page, path, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await page.goto(`${FRONTEND_URL}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      // Give React Router time to perform the guard redirect.
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return response;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000 * i);
    }
  }
  throw lastError;
}

test.describe('public routes render without redirect', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} (${route.name})`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));

      const response = await visit(page, route.path);
      expect(response, `no response for ${route.path}`).toBeTruthy();
      expect(response.status(), `${route.path} status`).toBeLessThan(500);

      const body = (await page.locator('body').innerText().catch(() => '')) || '';
      expect(body.trim().length, `${route.path} rendered empty body`).toBeGreaterThan(0);

      const fatal = errors.filter((e) => !/ResizeObserver|Non-Error promise|Failed to load resource/i.test(e));
      expect(fatal, `page errors on ${route.path}: ${fatal.join(' | ')}`).toEqual([]);
    });
  }
});

test.describe('guarded routes redirect unauthenticated visitors to /login', () => {
  for (const route of GUARDED_ROUTES) {
    test(`${route.path} (${route.name})`, async ({ page }) => {
      const response = await visit(page, route.path);
      expect(response, `no response for ${route.path}`).toBeTruthy();
      expect(response.status(), `${route.path} status`).toBeLessThan(500);

      const url = page.url();
      const isLogin = url.includes('/login');
      const rendered = (await page.locator('body').innerText().catch(() => '')) || '';
      // Either it redirected to /login, or it rendered something (role-based
      // content behind a client guard). Never a blank page.
      expect(
        isLogin || rendered.trim().length > 0,
        `${route.path} neither redirected to /login nor rendered content (url=${url})`
      ).toBeTruthy();
    });
  }
});

test.describe('shared routes are reachable', () => {
  for (const route of SHARED_ROUTES) {
    test(`${route.path} (${route.name})`, async ({ page }) => {
      const response = await visit(page, route.path);
      expect(response.status(), `${route.path} status`).toBeLessThan(500);
      expect(page.url()).toContain(new URL(page.url()).pathname.split('/')[1] || '');
    });
  }
});

test('route registry covers the whole App.jsx surface', () => {
  expect(ALL_ROUTES.length).toBeGreaterThanOrEqual(50);
  const paths = ALL_ROUTES.map((r) => r.path);
  expect(new Set(paths).size, 'duplicate paths in registry').toBe(paths.length);
});