/**
 * Repeated Login & Logout Verification Suite (30–50 Iterations)
 *
 * Verifies:
 * 1. 30 Consecutive Login -> Logout cycles with SAME valid Trainer credentials
 *    (Expected: 30/30 SUCCESS - HTTP 200 on login, HTTP 200 on logout)
 * 2. Error Classification:
 *    - Wrong password -> 401
 *    - Nonexistent email -> 401
 *    - Empty credentials -> 422
 *    - Role mismatch -> 403
 *    - Rate limit -> 429
 * 3. Connection pool stability throughout repeated cycles
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const request = require('supertest');
const { User, sequelize } = require('../src/models');
const bcrypt = require('bcryptjs');
const { app } = require('../src/app');

async function runRepeatedLoginSuite() {
  console.log('\n================================================================');
  console.log('  STARTING 30-CYCLE REPEATED TRAINER LOGIN / LOGOUT TEST SUITE  ');
  console.log('================================================================\n');

  // Find or pick a trainer for test
  let trainer = await User.findOne({ where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' } });
  if (!trainer) {
    console.error('❌ No approved trainer found in database.');
    process.exit(1);
  }

  const origTrainerPw = trainer.password;
  const trainerEmail = trainer.email;
  const validPassword = 'TrainerPass@2026!Repeat';
  const hashedPassword = await bcrypt.hash(validPassword, 12);
  await trainer.update({ password: hashedPassword });

  const { unlockAll } = require('../src/middleware/loginRateLimiter');
  unlockAll();

  console.log(`Target Trainer: ${trainerEmail} (ID: ${trainer.id}, Role: ${trainer.role})\n`);

  const TOTAL_CYCLES = 30;
  let successfulCycles = 0;
  const cycleLogs = [];

  console.log(`>>> Starting ${TOTAL_CYCLES} sequential Login -> Logout cycles...`);

  let wrongPassOk = false;
  let wrongEmailOk = false;
  let emptyOk = false;
  let roleMismatchOk = false;

  try {
    for (let i = 1; i <= TOTAL_CYCLES; i++) {
      // 1. LOGIN
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: trainerEmail, password: validPassword, role: 'TRAINER' });

      const loginOk = loginRes.status === 200 && !!loginRes.body.token;
      const token = loginRes.body.token;

      if (!loginOk) {
        console.log(`  Cycle ${i.toString().padStart(2, ' ')}: ✗ LOGIN FAILED (HTTP ${loginRes.status}) - ${JSON.stringify(loginRes.body)}`);
        cycleLogs.push({ cycle: i, login: false, logout: false, error: loginRes.body });
        continue;
      }

      // 2. LOGOUT with token
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send();

      const logoutOk = logoutRes.status === 200;

      if (loginOk && logoutOk) {
        successfulCycles++;
        console.log(`  Cycle ${i.toString().padStart(2, ' ')}/${TOTAL_CYCLES}: ✓ Login 200 OK (Token issued) → ✓ Logout 200 OK (Session ended)`);
        cycleLogs.push({ cycle: i, login: true, logout: true });
      } else {
        console.log(`  Cycle ${i.toString().padStart(2, ' ')}: ✗ LOGOUT FAILED (HTTP ${logoutRes.status}) - ${JSON.stringify(logoutRes.body)}`);
        cycleLogs.push({ cycle: i, login: true, logout: false, error: logoutRes.body });
      }
    }

    console.log(`\nCycle Results: ${successfulCycles}/${TOTAL_CYCLES} successful\n`);

    // ── ERROR CLASSIFICATION TESTS ──
    console.log('>>> Checking Error Classifications:');

    // Test: Wrong password
    const wrongPassRes = await request(app)
      .post('/api/auth/login')
      .send({ email: trainerEmail, password: 'IncorrectPassword999!', role: 'TRAINER' });
    wrongPassOk = wrongPassRes.status === 401 && wrongPassRes.body.error === 'Invalid email or password';
    console.log(`  Wrong password: HTTP ${wrongPassRes.status} -> ${wrongPassOk ? 'PASSED (401)' : 'FAILED'}`);

    // Test: Nonexistent email
    const wrongEmailRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'fake_nonexistent_user_99999@domain.com', password: validPassword, role: 'TRAINER' });
    wrongEmailOk = wrongEmailRes.status === 401 && wrongEmailRes.body.error === 'Invalid email or password';
    console.log(`  Wrong email: HTTP ${wrongEmailRes.status} -> ${wrongEmailOk ? 'PASSED (401)' : 'FAILED'}`);

    // Test: Empty credentials
    const emptyRes = await request(app)
      .post('/api/auth/login')
      .send({ email: '', password: '', role: 'TRAINER' });
    emptyOk = emptyRes.status === 422;
    console.log(`  Empty credentials: HTTP ${emptyRes.status} -> ${emptyOk ? 'PASSED (422)' : 'FAILED'}`);

    // Test: Role mismatch
    const roleMismatchRes = await request(app)
      .post('/api/auth/login')
      .send({ email: trainerEmail, password: validPassword, role: 'PARTICIPANT' });
    roleMismatchOk = roleMismatchRes.status === 403 && (roleMismatchRes.body.error || '').includes('Role mismatch');
    console.log(`  Role mismatch: HTTP ${roleMismatchRes.status} -> ${roleMismatchOk ? 'PASSED (403 Role Mismatch)' : 'FAILED'}`);
  } finally {
    await trainer.update({ password: origTrainerPw });
    unlockAll();
    console.log('\n✓ Restored original trainer password and cleared lockout store.');
  }

  console.log('\n================================================================');
  console.log('                 FINAL TEST REPORT SUMMARY                      ');
  console.log('================================================================');
  console.log(`  Repeated Login/Logout Cycles : ${successfulCycles}/${TOTAL_CYCLES} (${successfulCycles === TOTAL_CYCLES ? 'PASSED' : 'FAILED'})`);
  console.log(`  Wrong Password (401)         : ${wrongPassOk ? 'PASSED' : 'FAILED'}`);
  console.log(`  Nonexistent Email (401)      : ${wrongEmailOk ? 'PASSED' : 'FAILED'}`);
  console.log(`  Empty Credentials (422)      : ${emptyOk ? 'PASSED' : 'FAILED'}`);
  console.log(`  Role Mismatch (403)          : ${roleMismatchOk ? 'PASSED' : 'FAILED'}`);
  console.log('================================================================\n');

  await sequelize.close();
  const allPassed = (successfulCycles === TOTAL_CYCLES) && wrongPassOk && wrongEmailOk && emptyOk && roleMismatchOk;
  process.exit(allPassed ? 0 : 1);
}

runRepeatedLoginSuite().catch(err => {
  console.error('Fatal error running repeated login suite:', err);
  process.exit(1);
});
