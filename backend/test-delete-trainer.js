const { app } = require('./src/app');
const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  try {
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'admin123' }),
    });
    const { token } = await loginRes.json();
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Create trainer
    console.log('--- CREATE TRAINER ---');
    const createRes = await fetch(`${base}/api/admin/create-trainer`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'tr', email: 'tr1@gmail.com', password: 'admin123' }),
    });
    const createData = await createRes.json();
    console.log('Status:', createRes.status);
    console.log('Response:', JSON.stringify(createData, null, 2));

    // List trainers
    console.log('\n--- LIST TRAINERS ---');
    const listRes = await fetch(`${base}/api/admin/trainers`, { headers: auth });
    const listData = await listRes.json();
    console.log('Trainers:', JSON.stringify(listData, null, 2));

    // Delete the first trainer
    if (listData.trainers && listData.trainers.length > 0) {
      const tid = listData.trainers[0].id;
      console.log(`\n--- DELETE TRAINER ${tid} ---`);
      const delRes = await fetch(`${base}/api/admin/trainers/${tid}`, { method: 'DELETE', headers: auth });
      const delData = await delRes.json();
      console.log('Status:', delRes.status);
      console.log('Response:', JSON.stringify(delData));
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});
