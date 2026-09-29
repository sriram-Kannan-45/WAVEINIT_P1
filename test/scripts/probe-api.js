// Functional API discovery probe.
// Logs in as the seeded admin and walks the main read endpoints so we know
// which product flows actually have data to exercise.
// Run: node test/scripts/probe-api.js
const BASE = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/+$/, '');

const ENDPOINTS = [
  ['health', '/api/health'],
  ['admin summary', '/api/admin/dashboard/summary'],
  ['admin trainings', '/api/admin/trainings'],
  ['admin trainers', '/api/admin/trainers'],
  ['admin participants', '/api/admin/participants'],
  ['admin pending', '/api/admin/pending-participants'],
  ['trainings', '/api/trainings'],
  ['quizzes', '/api/quizzes'],
  ['coding assessments', '/api/coding/assessments'],
  ['interviews', '/api/interviews'],
  ['lessons (participant)', '/api/lessons/participant'],
  ['notifications', '/api/notifications'],
  ['profile', '/api/profile/me'],
  ['analytics', '/api/analytics/overview'],
  ['recordings', '/api/recordings'],
  ['leaderboard', '/api/leaderboard'],
  ['hire assessments', '/api/hire/assessments'],
  ['monitoring sessions', '/api/monitoring/sessions'],
];

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
    }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.token || body.accessToken;
}

function countOf(body) {
  if (Array.isArray(body)) return body.length;
  if (body && typeof body === 'object') {
    for (const k of ['count', 'total', 'totalItems', 'results', 'data', 'items', 'rows']) {
      if (Array.isArray(body[k])) return `${k}=${body[k].length}`;
      if (typeof body[k] === 'number') return `${k}=${body[k]}`;
    }
    return `{${Object.keys(body).slice(0, 6).join(',')}}`;
  }
  return String(body).slice(0, 40);
}

(async () => {
  const token = await login();
  console.log(`login OK (token ${token.length} chars)\n`);
  console.log('ENDPOINT'.padEnd(26), 'STATUS  SHAPE');
  console.log('-'.repeat(72));
  for (const [label, path] of ENDPOINTS) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      let shape = '';
      if (res.ok) {
        const text = await res.text();
        try { shape = countOf(JSON.parse(text)); } catch { shape = text.slice(0, 40); }
      } else {
        shape = (await res.text()).slice(0, 60).replace(/\s+/g, ' ');
      }
      console.log(label.padEnd(26), String(res.status).padEnd(7), shape);
    } catch (e) {
      console.log(label.padEnd(26), 'ERR    ', e.message.slice(0, 60));
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });