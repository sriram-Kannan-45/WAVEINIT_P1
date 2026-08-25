/**
 * Comprehensive Trainer Authentication Verification Script
 * Tests:
 * 1. 20 consecutive login attempts with SAME valid Trainer credentials (20/20 successful)
 * 2. Wrong password -> 401 Invalid email or password
 * 3. Wrong email -> 401 Invalid email or password
 * 4. Email with leading/trailing spaces and uppercase -> 200 OK + JWT
 * 5. Empty email -> 422
 * 6. Empty password -> 422
 * 7. Passwords with complex punctuation/SQL markers (';', '--', '/*') -> 200 OK
 * 8. Role mismatch rejection -> 403
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const request = require('supertest');
const { User, sequelize } = require('../src/models');
const bcrypt = require('bcryptjs');
const { app } = require('../src/app');

async function runVerification() {
  console.log('\n======================================================');
  console.log('  STARTING TRAINER AUTHENTICATION VERIFICATION SUITE');
  console.log('======================================================\n');

  // Find or pick a trainer for test
  let trainer = await User.findOne({ where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' } });
  if (!trainer) {
    console.error('❌ No approved trainer found in database.');
    process.exit(1);
  }

  const origTrainerPw = trainer.password;
  const trainerEmail = trainer.email;
  const validPassword = 'TrainerAuthPass@2026!';
  const hashedPassword = await bcrypt.hash(validPassword, 12);
  await trainer.update({ password: hashedPassword });

  const { unlockAll } = require('../src/middleware/loginRateLimiter');
  unlockAll();

  console.log(`Verified Trainer Target: ${trainerEmail} (ID: ${trainer.id}, Role: ${trainer.role}, Status: ${trainer.status})\n`);

  const testResults = {
    consecutive20Passed: 0,
    wrongPasswordPassed: false,
    wrongEmailPassed: false,
    emailWithSpacesPassed: false,
    emptyEmailPassed: false,
    emptyPasswordPassed: false,
    complexPasswordPassed: false,
    roleMismatchPassed: false,
  };

  try {
    // ── TEST 1: 20 Consecutive Login Attempts with SAME Valid Credentials ──
    console.log('>>> TEST 1: Running 20 consecutive login attempts with SAME valid credentials...');
    for (let i = 1; i <= 20; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: trainerEmail, password: validPassword, role: 'TRAINER' });

      if (res.status === 200 && res.body.token && res.body.role === 'TRAINER') {
        testResults.consecutive20Passed++;
        console.log(`  Attempt ${i.toString().padStart(2, ' ')}/20:  ✓ HTTP 200 OK - Token Issued (ID: ${res.body.id})`);
      } else {
        console.log(`  Attempt ${i.toString().padStart(2, ' ')}/20:  ✗ FAILED (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
      }
    }
    console.log(`Test 1 Summary: ${testResults.consecutive20Passed}/20 successful\n`);

    // ── TEST 2: Wrong Password ──
    console.log('>>> TEST 2: Wrong Password...');
    {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: trainerEmail, password: 'WrongPassword999!', role: 'TRAINER' });

      console.log(`  Response HTTP ${res.status}:`, res.body);
      testResults.wrongPasswordPassed = res.status === 401 && res.body.error === 'Invalid email or password';
      console.log(`  Result: ${testResults.wrongPasswordPassed ? '✓ PASSED (HTTP 401)' : '✗ FAILED'}\n`);
    }

    // ── TEST 3: Wrong Email ──
    console.log('>>> TEST 3: Nonexistent Email...');
    {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent.trainer.999@testdomain.com', password: validPassword, role: 'TRAINER' });

      console.log(`  Response HTTP ${res.status}:`, res.body);
      testResults.wrongEmailPassed = res.status === 401 && res.body.error === 'Invalid email or password';
      console.log(`  Result: ${testResults.wrongEmailPassed ? '✓ PASSED (HTTP 401)' : '✗ FAILED'}\n`);
    }

    // ── TEST 4: Email with Leading/Trailing Spaces & Mixed Case ──
    console.log('>>> TEST 4: Email with Spaces and Mixed Casing...');
    {
      const messyEmail = `   ${trainerEmail.toUpperCase()}   `;
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: messyEmail, password: validPassword, role: 'TRAINER' });

      console.log(`  Testing with email: "${messyEmail}"`);
      console.log(`  Response HTTP ${res.status}: User ID ${res.body.id}, Role ${res.body.role}`);
      testResults.emailWithSpacesPassed = res.status === 200 && !!res.body.token;
      console.log(`  Result: ${testResults.emailWithSpacesPassed ? '✓ PASSED (HTTP 200)' : '✗ FAILED'}\n`);
    }

    // ── TEST 5: Empty Email Validation ──
    console.log('>>> TEST 5: Empty Email Validation...');
    {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '', password: validPassword, role: 'TRAINER' });

      console.log(`  Response HTTP ${res.status}:`, res.body);
      testResults.emptyEmailPassed = res.status === 422;
      console.log(`  Result: ${testResults.emptyEmailPassed ? '✓ PASSED (HTTP 422)' : '✗ FAILED'}\n`);
    }

    // ── TEST 6: Empty Password Validation ──
    console.log('>>> TEST 6: Empty Password Validation...');
    {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: trainerEmail, password: '', role: 'TRAINER' });

      console.log(`  Response HTTP ${res.status}:`, res.body);
      testResults.emptyPasswordPassed = res.status === 422;
      console.log(`  Result: ${testResults.emptyPasswordPassed ? '✓ PASSED (HTTP 422)' : '✗ FAILED'}\n`);
    }

    // ── TEST 7: Password with Complex Symbols (SQL / XSS Characters) ──
    console.log('>>> TEST 7: Complex Password with Symbols (;, --, /*, <script>)...');
    {
      const complexPass = 'Tr@iner;Pass--/*safe*/<ok>123!';
      const complexHashed = await bcrypt.hash(complexPass, 12);
      await trainer.update({ password: complexHashed });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: trainerEmail, password: complexPass, role: 'TRAINER' });

      console.log(`  Response HTTP ${res.status}: User ID ${res.body.id}`);
      testResults.complexPasswordPassed = res.status === 200 && !!res.body.token;
      console.log(`  Result: ${testResults.complexPasswordPassed ? '✓ PASSED (HTTP 200)' : '✗ FAILED'}\n`);

      // Restore standard test password
      await trainer.update({ password: hashedPassword });
    }

    // ── TEST 8: Role Mismatch Rejection ──
    console.log('>>> TEST 8: Role Mismatch Rejection (Trainer logging in with PARTICIPANT role)...');
    {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: trainerEmail, password: validPassword, role: 'PARTICIPANT' });

      console.log(`  Response HTTP ${res.status}:`, res.body);
      testResults.roleMismatchPassed = res.status === 403 && (res.body.error || '').includes('Role mismatch');
      console.log(`  Result: ${testResults.roleMismatchPassed ? '✓ PASSED (HTTP 403)' : '✗ FAILED'}\n`);
    }
  } finally {
    await trainer.update({ password: origTrainerPw });
    unlockAll();
    console.log('✓ Restored original trainer password.');
  }

  console.log('======================================================');
  console.log('                 FINAL TEST REPORT                    ');
  console.log('======================================================');
  console.log(`  1. 20 Consecutive Logins (200 OK)    : ${testResults.consecutive20Passed}/20 (${testResults.consecutive20Passed === 20 ? 'PASSED' : 'FAILED'})`);
  console.log(`  2. Wrong Password (401)              : ${testResults.wrongPasswordPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  3. Nonexistent Email (401)           : ${testResults.wrongEmailPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  4. Email with Spaces/Casing (200 OK) : ${testResults.emailWithSpacesPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  5. Empty Email Validation (422)      : ${testResults.emptyEmailPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  6. Empty Password Validation (422)   : ${testResults.emptyPasswordPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  7. Complex Password Symbols (200 OK) : ${testResults.complexPasswordPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  8. Role Mismatch (403)               : ${testResults.roleMismatchPassed ? 'PASSED' : 'FAILED'}`);
  console.log('======================================================\n');

  const allPassed =
    testResults.consecutive20Passed === 20 &&
    testResults.wrongPasswordPassed &&
    testResults.wrongEmailPassed &&
    testResults.emailWithSpacesPassed &&
    testResults.emptyEmailPassed &&
    testResults.emptyPasswordPassed &&
    testResults.complexPasswordPassed &&
    testResults.roleMismatchPassed;

  await sequelize.close();
  process.exit(allPassed ? 0 : 1);
}

runVerification().catch(err => {
  console.error('Fatal error during verification execution:', err);
  process.exit(1);
});
