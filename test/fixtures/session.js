// Shared authenticated session for functional specs.
// Logs in once per worker and reuses the access token for API calls.
const { BACKEND_URL, FRONTEND_URL } = require('../utils/endpoints');

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

let cachedToken = null;
let cachedUser = null;

async function loginAdmin() {
  if (cachedToken) return { token: cachedToken, user: cachedUser };
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`admin login failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  cachedToken = body.token || body.accessToken;
  cachedUser = body.user || body;
  if (!cachedToken) throw new Error('login response contained no token');
  return { token: cachedToken, user: cachedUser };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function apiGet(path, token) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function apiPost(path, payload, token) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

/** Pull the first array found in a list-shaped response. */
function listOf(body, keys = ['data', 'results', 'rows', 'items', 'trainings', 'trainers', 'participants', 'quizzes', 'assessments', 'interviews']) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  for (const k of keys) if (Array.isArray(body[k])) return body[k];
  return [];
}

module.exports = { loginAdmin, apiGet, apiPost, listOf, authHeaders, BACKEND_URL, FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD };