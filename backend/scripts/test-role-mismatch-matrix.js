/**
 * Role-Mismatch Matrix & Anti-Enumeration Verification Test Suite
 *
 * Covers 3 Roles (Admin, Trainer, Learner) x 3 Scenarios = 9 Test Cases
 * 1. Correct Role + Valid Password -> 200 OK (Auth Success)
 * 2. Wrong Role Tab + Valid Password -> 403 Forbidden (Specific Role Mismatch Error)
 * 3. Any Tab + Wrong Password -> 401 Unauthorized (Generic Error, No Role Leak)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const request = require('supertest');
const { app } = require('../src/app');
const { User, sequelize } = require('../src/models');
const bcrypt = require('bcryptjs');

async function runRoleMatrixTests() {
  console.log('\n================================================================');
  console.log('       ROLE-MISMATCH MATRIX VERIFICATION TEST SUITE (9/9)       ');
  console.log('================================================================\n');

  const users = await User.findAll({ where: { isDeleted: false, status: 'APPROVED' } });
  const adminUser = users.find(u => u.role === 'ADMIN');
  const trainerUser = users.find(u => u.role === 'TRAINER');
  const learnerUser = users.find(u => u.role === 'PARTICIPANT');

  if (!adminUser || !trainerUser || !learnerUser) {
    console.error('❌ Missing one or more required test user roles in database.');
    process.exit(1);
  }

  const origAdminPw = adminUser.password;
  const origTrainerPw = trainerUser.password;
  const origLearnerPw = learnerUser.password;

  const VALID_PASSWORD = 'RoleMatrixPass@2026!';
  const WRONG_PASSWORD = 'CompletelyWrongPassword@999!';
  const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 12);

  await adminUser.update({ password: hashedPassword });
  await trainerUser.update({ password: hashedPassword });
  await learnerUser.update({ password: hashedPassword });

  const { unlockAll } = require('../src/middleware/loginRateLimiter');
  unlockAll();

  console.log(`Test Accounts Loaded:`);
  console.log(`  - Admin   : ${adminUser.email}`);
  console.log(`  - Trainer : ${trainerUser.email}`);
  console.log(`  - Learner : ${learnerUser.email}\n`);

  const results = [];

  // Helper tester
  async function runTestCase(caseNum, title, account, requestedRole, password, expectedStatus, expectedErrorSubstring) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: account.email, password, role: requestedRole });

    const statusMatches = res.status === expectedStatus;
    let messageMatches = true;

    if (expectedErrorSubstring) {
      const errorMsg = res.body?.error || '';
      messageMatches = errorMsg.includes(expectedErrorSubstring);
    } else if (expectedStatus === 200) {
      messageMatches = !!res.body.token && res.body.role === account.role;
    }

    const passed = statusMatches && messageMatches;
    results.push({ caseNum, title, passed, status: res.status, body: res.body });

    const mark = passed ? '✓' : '✗';
    console.log(`  Test ${caseNum}/9: ${mark} ${title}`);
    console.log(`           Status: ${res.status} (expected ${expectedStatus}) | Body: ${JSON.stringify(res.body)}`);
    return passed;
  }

  try {
    console.log('>>> SCENARIO 1: CORRECT ROLE TAB + VALID PASSWORD (Expected: 200 OK)');
    await runTestCase(1, 'Admin on Admin Tab (Valid Password)', adminUser, 'ADMIN', VALID_PASSWORD, 200);
    await runTestCase(2, 'Trainer on Trainer Tab (Valid Password)', trainerUser, 'TRAINER', VALID_PASSWORD, 200);
    await runTestCase(3, 'Learner on Learner Tab (Valid Password)', learnerUser, 'PARTICIPANT', VALID_PASSWORD, 200);

    console.log('\n>>> SCENARIO 2: WRONG ROLE TAB + VALID PASSWORD (Expected: 403 Role Mismatch)');
    await runTestCase(4, 'Admin on Trainer Tab (Valid Password)', adminUser, 'TRAINER', VALID_PASSWORD, 403, 'Role mismatch — this account is registered as Admin, not Trainer');
    await runTestCase(5, 'Trainer on Admin Tab (Valid Password)', trainerUser, 'ADMIN', VALID_PASSWORD, 403, 'Role mismatch — this account is registered as Trainer, not Admin');
    await runTestCase(6, 'Learner on Admin Tab (Valid Password)', learnerUser, 'ADMIN', VALID_PASSWORD, 403, 'Role mismatch — this account is registered as Learner, not Admin');

    console.log('\n>>> SCENARIO 3: WRONG PASSWORD (Expected: 401 Generic, No Role Leak)');
    await runTestCase(7, 'Admin on Admin Tab (Wrong Password)', adminUser, 'ADMIN', WRONG_PASSWORD, 401, 'Invalid email or password');
    await runTestCase(8, 'Trainer on Trainer Tab (Wrong Password)', trainerUser, 'TRAINER', WRONG_PASSWORD, 401, 'Invalid email or password');
    await runTestCase(9, 'Learner on Learner Tab (Wrong Password)', learnerUser, 'PARTICIPANT', WRONG_PASSWORD, 401, 'Invalid email or password');
  } finally {
    // Always restore original passwords
    await adminUser.update({ password: origAdminPw });
    await trainerUser.update({ password: origTrainerPw });
    await learnerUser.update({ password: origLearnerPw });
    unlockAll();
    console.log('\n✓ Restored original user passwords and cleared lockout store.');
  }

  const totalPassed = results.filter(r => r.passed).length;

  console.log('\n================================================================');
  console.log('                 FINAL TEST REPORT SUMMARY                      ');
  console.log('================================================================');
  console.log(`  Total Test Cases Passed: ${totalPassed}/9 (${totalPassed === 9 ? 'ALL PASSED' : 'SOME FAILED'})`);
  console.log('================================================================\n');

  await sequelize.close();
  process.exit(totalPassed === 9 ? 0 : 1);
}

runRoleMatrixTests().catch(err => {
  console.error('Fatal error running role matrix tests:', err);
  process.exit(1);
});
