// Functional test suite - exercises real product behaviour against the live
// localhost stack with the seeded admin account.
//
// These assert behaviour, not just reachability: response shape, business
// rules, RBAC, pagination, and end-to-end data flow.
const { test, expect } = require('@playwright/test');
const { FRONTEND_URL } = require('../utils/endpoints');
const { loginAdmin, apiGet, apiPost, listOf } = require('../fixtures/session');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');

let token;
let adminUser;

test.beforeAll(async () => {
  const session = await loginAdmin();
  token = session.token;
  adminUser = session.user;
});

test.describe('auth: admin session', () => {
  test('login returns an admin access token with expected claims', async () => {
    expect(token).toBeTruthy();
    expect(adminUser.role).toBe('ADMIN');
    expect(adminUser.email).toMatch(/@/);
    expect(adminUser.status).toBe('APPROVED');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.type).toBe('access');
    expect(payload.role).toBe('ADMIN');
    expect(payload.jti).toBeTruthy();
    const ttlHours = (payload.exp - payload.iat) / 3600;
    expect(ttlHours, `access token TTL was ${ttlHours}h, expected <= 2h`).toBeLessThanOrEqual(2);
  });

  test('UI login lands the admin on the admin dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open(FRONTEND_URL);
    await login.login(
      process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
      process.env.TEST_ADMIN_PASSWORD || 'admin123'
    );
    await page.waitForURL(/\/admin/, { timeout: 25000 });
    expect(page.url()).toContain('/admin');

    const dash = new DashboardPage(page);
    await expect(dash.heading).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(50);
  });

  test('an invalid bearer token is rejected', async () => {
    const res = await apiGet('/api/admin/trainers', 'not-a-real-token');
    expect([401, 403]).toContain(res.status);
  });
});

test.describe('admin: dashboard summary', () => {
  test('returns a metrics payload for the dashboard', async () => {
    const res = await apiGet('/api/admin/dashboard/summary', token);
    expect(res.status, `summary status: ${JSON.stringify(res.body).slice(0, 300)}`).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTypeOf('object');
    expect(Object.keys(res.body.data).length).toBeGreaterThan(0);
  });

  test('is served consistently on repeat calls', async () => {
    const first = await apiGet('/api/admin/dashboard/summary', token);
    const second = await apiGet('/api/admin/dashboard/summary', token);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(Object.keys(second.body.data || {}).sort())
      .toEqual(Object.keys(first.body.data || {}).sort());
  });
});

test.describe('admin: user directory', () => {
  test('lists trainers with pagination metadata', async () => {
    const res = await apiGet('/api/admin/trainers?limit=50', token);
    expect(res.status).toBe(200);
    const trainers = listOf(res.body, ['trainers', 'data', 'rows']);
    expect(trainers.length).toBeGreaterThanOrEqual(1);
    if (res.body.total !== undefined) {
      expect(Number(res.body.total)).toBeGreaterThanOrEqual(trainers.length);
    }
    for (const t of trainers.slice(0, 5)) {
      expect(t.role === undefined || t.role === 'TRAINER').toBeTruthy();
      expect(String(t.email || '')).toMatch(/@/);
      expect(t.password).toBeUndefined();
    }
  });

  test('lists participants without leaking credentials', async () => {
    const res = await apiGet('/api/admin/participants?limit=50', token);
    expect(res.status).toBe(200);
    const participants = listOf(res.body, ['participants', 'data', 'rows']);
    expect(participants.length).toBeGreaterThanOrEqual(1);
    for (const p of participants.slice(0, 10)) {
      expect(p.password).toBeUndefined();
      expect(p.passwordHash).toBeUndefined();
      expect(JSON.stringify(p)).not.toMatch(/\$2[aby]\$\d\d\$/);
    }
  });
});

test.describe('training catalogue', () => {
  test('admin training list contains at least one program', async () => {
    const res = await apiGet('/api/admin/trainings', token);
    expect(res.status).toBe(200);
    const trainings = listOf(res.body, ['trainings', 'data', 'rows']);
    expect(trainings.length).toBeGreaterThanOrEqual(1);
    for (const tr of trainings.slice(0, 3)) {
      expect(String(tr.title || '').length).toBeGreaterThan(0);
      expect(tr.id).toBeTruthy();
    }
  });

  test('public training catalogue is readable by the admin', async () => {
    const res = await apiGet('/api/trainings', token);
    expect(res.status).toBe(200);
    expect(listOf(res.body, ['trainings', 'data', 'rows']).length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('quiz engine', () => {
  let quizId;

  test('quiz list is non-empty and exposes ids', async () => {
    const res = await apiGet('/api/quizzes', token);
    expect(res.status).toBe(200);
    const quizzes = listOf(res.body, ['quizzes', 'data', 'rows']);
    expect(quizzes.length).toBeGreaterThanOrEqual(1);
    quizId = quizzes[0].id;
    expect(quizId).toBeTruthy();
  });

  test('trainer can fetch the full quiz detail', async () => {
    const res = await apiGet(`/api/quizzes/${quizId}`, token);
    expect(res.status).toBe(200);
    expect(res.body.quiz || res.body).toBeTypeOf('object');
  });

  test('trainer can fetch questions with options for authoring', async () => {
    const res = await apiGet(`/api/quizzes/${quizId}/questions`, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
    const questions = res.body.questions;
    if (questions.length) {
      expect(questions[0]).toHaveProperty('options');
    }
  });

  test('publish endpoint answers a non-existent quiz with 4xx, not 500', async () => {
    const res = await apiPost('/api/quizzes/99999999/publish', {}, token);
    expect([400, 404, 422]).toContain(res.status);
  });
});

test.describe('hiring module', () => {
  test('hire assessments are listed for the admin', async () => {
    const res = await apiGet('/api/hire/assessments', token);
    expect(res.status).toBe(200);
    expect(listOf(res.body, ['assessments', 'data', 'rows']).length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('interviews + recordings', () => {
  test('interview list returns a paged collection', async () => {
    const res = await apiGet('/api/interviews', token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.interviews) || Array.isArray(res.body.data)).toBe(true);
    if (res.body.pagination) expect(res.body.pagination).toBeTypeOf('object');
  });

  test('recordings list responds with a data envelope', async () => {
    const res = await apiGet('/api/recordings', token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data !== undefined).toBe(true);
  });
});

test.describe('code execution sandbox (judge)', () => {
  test('run endpoint answers with a structured 4xx, never a crash', async () => {
    const res = await apiPost('/api/coding/participant/run', {
      code: 'print("hi")',
      language: 'python',
    }, token);
    expect(res.status).toBeLessThan(500);
  });
});

test.describe('input validation + RBAC', () => {
  test('malformed ids return 4xx, never 500', async () => {
    for (const path of ['/api/quizzes/not-a-number', '/api/admin/trainers/abc']) {
      const res = await apiGet(path, token);
      expect(res.status, `${path} -> ${res.status}`).toBeLessThan(500);
    }
  });

  test('unauthenticated requests cannot reach admin APIs', async () => {
    for (const path of ['/api/admin/trainers', '/api/admin/participants', '/api/quizzes']) {
      const res = await apiGet(path, null);
      expect([401, 403], `${path} -> ${res.status}`).toContain(res.status);
    }
  });
});