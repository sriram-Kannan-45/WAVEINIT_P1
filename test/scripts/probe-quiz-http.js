// Probe GET /api/quizzes/:id over HTTP for every quiz to isolate the 500.
// Run: node test/scripts/probe-quiz-http.js
const BASE = process.env.BACKEND_URL || 'http://localhost:3001';

(async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.com', password: 'admin123' }),
  });
  if (!r.ok) { console.log('RESULT login failed', r.status); return; }
  const { token } = await r.json();

  const list = await (await fetch(`${BASE}/api/quizzes`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const ids = (list.quizzes || list.data || []).map((q) => q.id);
  console.log('RESULT ids:', ids.join(','));

  for (const id of [...ids, 'not-a-number', '99999999']) {
    const res = await fetch(`${BASE}/api/quizzes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    console.log(`RESULT GET /api/quizzes/${id} -> ${res.status} ${text.slice(0, 120)}`);
  }
})().catch((e) => console.log('RESULT fatal:', e.message));