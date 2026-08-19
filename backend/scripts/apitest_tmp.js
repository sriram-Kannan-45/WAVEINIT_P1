const axios = require('axios');
const BASE = 'http://localhost:3001';
(async () => {
  const login = await axios.post(BASE + '/api/auth/login', { email: 'admin@test.com', password: 'admin123' });
  const tok = login.data.accessToken;
  const H = { Authorization: 'Bearer ' + tok };
  const get = async (url) => {
    try {
      const r = await axios.get(BASE + url, { headers: H });
      return { status: r.status, data: r.data };
    } catch (e) {
      return { status: e.response?.status, data: e.response?.data, err: e.message };
    }
  };
  console.log('LIST', JSON.stringify(await get('/api/interviews'), null, 2).slice(0, 2500));
  console.log('STATS', JSON.stringify(await get('/api/interviews/stats')));
  const cands = await get('/api/interviews/candidates');
  console.log('CANDIDATES', JSON.stringify(cands).slice(0, 1500));
  const ints = await get('/api/interviews/interviewers');
  console.log('INTERVIEWERS', JSON.stringify(ints).slice(0, 1500));
  console.log('GET 7', JSON.stringify(await get('/api/interviews/7'), null, 2).slice(0, 1500));
})().catch(e => { console.error('ERR', e.message); if (e.response) console.error(JSON.stringify(e.response.data)); });
