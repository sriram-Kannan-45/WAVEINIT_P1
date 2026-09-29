// API + AI health on localhost. Tagged @smoke. Read-only GETs only.
const { test, expect } = require('@playwright/test');
const { BACKEND_URL, AI_SERVICE_URL, API, AI } = require('../utils/endpoints');

test.describe('backend + ai-service health (localhost) @smoke', () => {
  test('backend /api/health responds', async ({ request }) => {
    const res = await request.get(API.health);
    expect(res.ok(), `GET ${API.health} -> ${res.status()}`).toBeTruthy();
  });

  test('backend proxied AI health responds', async ({ request }) => {
    // The backend forwards this probe to the AI service (5s axios timeout).
    // Give it a generous client-side budget so a cold AI service is not flaky.
    const res = await request.get(API.aiHealth, { timeout: 45000 });
    // Backend may return 503 when providers are unconfigured; endpoint must still answer.
    expect([200, 503].includes(res.status()), `GET ${API.aiHealth} -> ${res.status()}`).toBeTruthy();
  });

  test('ai-service /health responds directly', async ({ request }) => {
    test.skip(!AI_SERVICE_URL.includes('localhost') && !AI_SERVICE_URL.includes('127.0.0.1'), 'direct AI check is localhost-only');
    const res = await request.get(AI.health);
    expect(res.ok(), `GET ${AI.health} -> ${res.status()}`).toBeTruthy();
  });

  test('backend URL is localhost', async () => {
    expect(BACKEND_URL).toMatch(/localhost|127\.0\.0\.1/);
  });
});