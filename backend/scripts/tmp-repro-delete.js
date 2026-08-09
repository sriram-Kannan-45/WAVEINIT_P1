/* TEMP debug script — reproduce interview DELETE via the real API */
const BASE = 'http://localhost:3001';

async function main() {
  // 1. Login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.com', password: 'admin123' }),
  });
  const login = await loginRes.json();
  console.log('login status:', loginRes.status);
  const token = login.token || (login.data && login.data.token) || login.accessToken;
  console.log('token present:', !!token);
  if (!token) { console.log(JSON.stringify(login, null, 2)); return; }
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 2. List before
  let res = await fetch(`${BASE}/api/interviews?page=1&limit=100`, { headers: auth });
  let data = await res.json();
  const iv8 = (data.interviews || []).find(i => i.id === 8);
  console.log('\nBEFORE delete: interview #8 present?', !!iv8);
  console.log('total interviews:', data.pagination && data.pagination.total);

  // 3. Delete #8
  console.log('\nDELETE /api/interviews/8 ...');
  res = await fetch(`${BASE}/api/interviews/8`, { method: 'DELETE', headers: auth });
  const bodyText = await res.text();
  console.log('delete status:', res.status);
  console.log('delete body:', bodyText);

  // 4. List after
  res = await fetch(`${BASE}/api/interviews?page=1&limit=100`, { headers: auth });
  data = await res.json();
  const iv8After = (data.interviews || []).find(i => i.id === 8);
  console.log('\nAFTER delete: interview #8 still in API list?', !!iv8After);
  console.log('total interviews after:', data.pagination && data.pagination.total);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
