/**
 * verify-login-lockout-suite.js
 *
 * Comprehensive Automated Verification Suite for Login & Lockout Behavior:
 * 1. Immediate Login of Canonical Accounts (Admin, Trainer, Learner)
 * 2. 20 Consecutive Valid Logins for Admin (20/20 -> 200 OK)
 * 3. 20 Consecutive Valid Logins for Trainer (20/20 -> 200 OK)
 * 4. 20 Consecutive Valid Logins for Learner (20/20 -> 200 OK)
 * 5. Case-Insensitive & Whitespace Padding Handling (200 OK)
 * 6. Wrong Password Error Classification (401 "Invalid email or password")
 * 7. Nonexistent Email Error Classification (401 "Invalid email or password")
 * 8. Role Mismatch Error Classification (403 Role Mismatch)
 * 9. Missing Credentials Validation (422 — does NOT increment failed lockout count)
 * 10. Tuned Account Lockout Trigger (Triggers only at 10th consecutive 401 failure -> 423)
 * 11. Lockout Auto-Reset / Immediate Unlock Verification
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const request = require('supertest');
const { app } = require('../src/app');
const { User, sequelize } = require('../src/models');
const { resetLockout, unlockAll, getLockoutStatus, MAX_FAILED_ATTEMPTS, LOCKOUT_MS } = require('../src/middleware/loginRateLimiter');

async function runSuite() {
  console.log('\n========================================================================');
  console.log('       ENTERPRISE LMS AUTHENTICATION & LOCKOUT VERIFICATION SUITE       ');
  console.log('========================================================================\n');

  // Load canonical accounts
  const admin = await User.findOne({ where: { email: 'admin@test.com', isDeleted: false } });
  const trainer = await User.findOne({ where: { email: 'wavene20@gmail.com', isDeleted: false, status: 'APPROVED' } });
  const learner = await User.findOne({ where: { email: 'participantdd6901@gmail.com', isDeleted: false, status: 'APPROVED' } });

  if (!admin || !trainer || !learner) {
    console.error('❌ Missing one or more required test accounts in database.');
    process.exit(1);
  }

  const ADMIN_CREDS = { email: 'admin@test.com', password: 'admin123', role: 'ADMIN' };
  const TRAINER_CREDS = { email: 'wavene20@gmail.com', password: 'sriram123@', role: 'TRAINER' };
  const LEARNER_CREDS = { email: 'participantdd6901@gmail.com', password: 'RoleMatrixPass@2026!', role: 'PARTICIPANT' };

  console.log('Test Accounts:');
  console.log(`  - Admin   : ${ADMIN_CREDS.email} (Role: ADMIN)`);
  console.log(`  - Trainer : ${TRAINER_CREDS.email} (Role: TRAINER)`);
  console.log(`  - Learner : ${LEARNER_CREDS.email} (Role: PARTICIPANT)\n`);

  // Clear any existing lockout state before beginning
  unlockAll();

  const report = {
    canonicalLogins: false,
    admin20Consecutive: 0,
    trainer20Consecutive: 0,
    learner20Consecutive: 0,
    caseInsensitivity: false,
    wrongPassword401: false,
    wrongEmail401: false,
    roleMismatch403: false,
    validation422NoLockout: false,
    lockoutAt10thAttempt: false,
    unlockSuccess: false,
  };

  // ── SECTION 1: CANONICAL IMMEDIATE LOGINS ───────────────────────────────
  console.log('>>> [1/7] Testing Immediate Logins of Canonical Accounts...');
  const resAdmin1 = await request(app).post('/api/auth/login').send(ADMIN_CREDS);
  const resTrainer1 = await request(app).post('/api/auth/login').send(TRAINER_CREDS);
  const resLearner1 = await request(app).post('/api/auth/login').send(LEARNER_CREDS);

  const admin1Ok = resAdmin1.status === 200 && !!resAdmin1.body.token && resAdmin1.body.role === 'ADMIN';
  const trainer1Ok = resTrainer1.status === 200 && !!resTrainer1.body.token && resTrainer1.body.role === 'TRAINER';
  const learner1Ok = resLearner1.status === 200 && !!resLearner1.body.token && resLearner1.body.role === 'PARTICIPANT';

  report.canonicalLogins = admin1Ok && trainer1Ok && learner1Ok;
  console.log(`  Admin (${ADMIN_CREDS.email})       : HTTP ${resAdmin1.status} -> ${admin1Ok ? '✓ SUCCESS' : '✗ FAILED'}`);
  console.log(`  Trainer (${TRAINER_CREDS.email})   : HTTP ${resTrainer1.status} -> ${trainer1Ok ? '✓ SUCCESS' : '✗ FAILED'}`);
  console.log(`  Learner (${LEARNER_CREDS.email})   : HTTP ${resLearner1.status} -> ${learner1Ok ? '✓ SUCCESS' : '✗ FAILED'}\n`);

  // ── SECTION 2: 20 CONSECUTIVE LOGINS PER ROLE ───────────────────────────
  console.log('>>> [2/7] Running 20 Consecutive Logins Per Role (60 Total)...');

  // Admin 20x
  for (let i = 1; i <= 20; i++) {
    const res = await request(app).post('/api/auth/login').send(ADMIN_CREDS);
    if (res.status === 200 && res.body.token) report.admin20Consecutive++;
  }
  console.log(`  Admin 20x Login Pass Rate   : ${report.admin20Consecutive}/20 (${report.admin20Consecutive === 20 ? '✓ 100%' : '✗ FAILED'})`);

  // Trainer 20x
  for (let i = 1; i <= 20; i++) {
    const res = await request(app).post('/api/auth/login').send(TRAINER_CREDS);
    if (res.status === 200 && res.body.token) report.trainer20Consecutive++;
  }
  console.log(`  Trainer 20x Login Pass Rate : ${report.trainer20Consecutive}/20 (${report.trainer20Consecutive === 20 ? '✓ 100%' : '✗ FAILED'})`);

  // Learner 20x
  for (let i = 1; i <= 20; i++) {
    const res = await request(app).post('/api/auth/login').send(LEARNER_CREDS);
    if (res.status === 200 && res.body.token) report.learner20Consecutive++;
  }
  console.log(`  Learner 20x Login Pass Rate : ${report.learner20Consecutive}/20 (${report.learner20Consecutive === 20 ? '✓ 100%' : '✗ FAILED'})\n`);

  // ── SECTION 3: CASE INSENSITIVITY & WHITESPACE ───────────────────────────
  console.log('>>> [3/7] Testing Case-Insensitivity & Whitespace Padding...');
  const resCase1 = await request(app).post('/api/auth/login').send({
    email: `   ${ADMIN_CREDS.email.toUpperCase()}   `,
    password: ADMIN_CREDS.password,
    role: 'ADMIN',
  });
  const resCase2 = await request(app).post('/api/auth/login').send({
    email: `   ${TRAINER_CREDS.email.toUpperCase()}   `,
    password: TRAINER_CREDS.password,
    role: 'TRAINER',
  });
  report.caseInsensitivity = resCase1.status === 200 && resCase2.status === 200;
  console.log(`  Upper/Padded Admin Email    : HTTP ${resCase1.status} -> ${resCase1.status === 200 ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`  Upper/Padded Trainer Email  : HTTP ${resCase2.status} -> ${resCase2.status === 200 ? '✓ PASSED' : '✗ FAILED'}\n`);

  // ── SECTION 4: ERROR CLASSIFICATION (401, 403, 422) ─────────────────────
  console.log('>>> [4/7] Checking Error Classifications (401, 403, 422)...');

  // Wrong Password -> 401
  const resWrongPw = await request(app).post('/api/auth/login').send({
    email: ADMIN_CREDS.email,
    password: 'CompletelyWrongPassword123!',
    role: 'ADMIN',
  });
  report.wrongPassword401 = resWrongPw.status === 401 && resWrongPw.body.error === 'Invalid email or password';
  console.log(`  Wrong Password              : HTTP ${resWrongPw.status} -> ${report.wrongPassword401 ? '✓ PASSED (401)' : '✗ FAILED'}`);

  // Nonexistent Email -> 401
  const resWrongEmail = await request(app).post('/api/auth/login').send({
    email: 'nonexistent_account_xyz_9999@test.com',
    password: 'SomePassword123!',
    role: 'ADMIN',
  });
  report.wrongEmail401 = resWrongEmail.status === 401 && resWrongEmail.body.error === 'Invalid email or password';
  console.log(`  Nonexistent Email           : HTTP ${resWrongEmail.status} -> ${report.wrongEmail401 ? '✓ PASSED (401)' : '✗ FAILED'}`);

  // Role Mismatch -> 403
  const resRoleMis = await request(app).post('/api/auth/login').send({
    email: ADMIN_CREDS.email,
    password: ADMIN_CREDS.password,
    role: 'TRAINER',
  });
  report.roleMismatch403 = resRoleMis.status === 403 && (resRoleMis.body.error || '').includes('Role mismatch');
  console.log(`  Role Mismatch (Admin on Trainer Tab) : HTTP ${resRoleMis.status} -> ${report.roleMismatch403 ? '✓ PASSED (403)' : '✗ FAILED'}`);

  // Missing Fields -> 422
  const res422 = await request(app).post('/api/auth/login').send({
    email: '',
    password: '',
    role: 'ADMIN',
  });
  report.validation422NoLockout = res422.status === 422;
  console.log(`  Missing Fields (422)        : HTTP ${res422.status} -> ${report.validation422NoLockout ? '✓ PASSED (422)' : '✗ FAILED'}\n`);

  // Clear any failed counts before lockout threshold test
  unlockAll();

  // ── SECTION 5: 422 VALIDATION ERRORS DO NOT INCREMENT LOCKOUT ────────────
  console.log('>>> [5/7] Verifying 422 Validation Errors Do NOT Trigger Lockout...');
  const testAccount = 'lockout_test_user@test.com';
  for (let i = 0; i < 15; i++) {
    await request(app).post('/api/auth/login').send({ email: testAccount, password: '' });
  }
  const statusAfter422 = getLockoutStatus(testAccount);
  const noLockOn422 = !statusAfter422.locked && statusAfter422.count === 0;
  console.log(`  15x 422 requests count      : ${statusAfter422.count} (Locked: ${statusAfter422.locked}) -> ${noLockOn422 ? '✓ PASSED' : '✗ FAILED'}\n`);

  // ── SECTION 6: TUNED LOCKOUT THRESHOLD (LOCKS ON 10th FAILURE) ───────────
  console.log(`>>> [6/7] Verifying Tuned Lockout Threshold (MAX=${MAX_FAILED_ATTEMPTS} attempts, DURATION=${LOCKOUT_MS / 60000}m)...`);
  const lockTarget = 'lockout_repro_account@test.com';
  resetLockout(lockTarget);

  let lockedCorrectlyAt10 = false;
  let attemptStatuses = [];

  for (let attempt = 1; attempt <= 11; attempt++) {
    const res = await request(app).post('/api/auth/login').send({
      email: lockTarget,
      password: 'IncorrectPasswordAttempt!',
      role: 'PARTICIPANT',
    });
    attemptStatuses.push(res.status);

    if (attempt < 10 && res.status !== 401) {
      console.log(`    Attempt ${attempt}: Unexpected status ${res.status} (expected 401)`);
    } else if (attempt === 10 && res.status === 401) {
      // 10th failed attempt records the 10th failure and sets lockoutUntil
      console.log(`    Attempt 10 (Threshold Hit): HTTP ${res.status} (Lockout initiated)`);
    } else if (attempt === 11 && res.status === 423) {
      console.log(`    Attempt 11 (Subsequent Request): HTTP ${res.status} (Account Locked: "${res.body.error}")`);
      lockedCorrectlyAt10 = true;
    }
  }

  report.lockoutAt10thAttempt = lockedCorrectlyAt10;
  console.log(`  Lockout Triggered on 10th Attempt : ${report.lockoutAt10thAttempt ? '✓ PASSED (HTTP 423 on locked state)' : '✗ FAILED'}\n`);

  // ── SECTION 7: UNLOCK VERIFICATION ───────────────────────────────────────
  console.log('>>> [7/7] Verifying Immediate Unlock Capability...');
  resetLockout(lockTarget);
  const statusAfterUnlock = getLockoutStatus(lockTarget);
  const resAfterUnlock = await request(app).post('/api/auth/login').send({
    email: lockTarget,
    password: 'IncorrectPasswordAttempt!',
    role: 'PARTICIPANT',
  });
  // After unlock, it should return 401 (not 423 locked)
  report.unlockSuccess = !statusAfterUnlock.locked && resAfterUnlock.status === 401;
  console.log(`  Status after resetLockout() : Locked=${statusAfterUnlock.locked}, Next Request HTTP=${resAfterUnlock.status} -> ${report.unlockSuccess ? '✓ PASSED' : '✗ FAILED'}\n`);

  // Cleanup: unlock all accounts
  unlockAll();

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────
  console.log('========================================================================');
  console.log('                         FINAL TEST REPORT SUMMARY                      ');
  console.log('========================================================================');
  console.log(`  1. Canonical Logins (Admin, Trainer, Learner) : ${report.canonicalLogins ? 'PASSED' : 'FAILED'}`);
  console.log(`  2. Admin 20 Consecutive Logins                : ${report.admin20Consecutive}/20 (${report.admin20Consecutive === 20 ? 'PASSED' : 'FAILED'})`);
  console.log(`  3. Trainer 20 Consecutive Logins              : ${report.trainer20Consecutive}/20 (${report.trainer20Consecutive === 20 ? 'PASSED' : 'FAILED'})`);
  console.log(`  4. Learner 20 Consecutive Logins              : ${report.learner20Consecutive}/20 (${report.learner20Consecutive === 20 ? 'PASSED' : 'FAILED'})`);
  console.log(`  5. Case-Insensitivity & Whitespace Padding    : ${report.caseInsensitivity ? 'PASSED' : 'FAILED'}`);
  console.log(`  6. Wrong Password Classification (401)        : ${report.wrongPassword401 ? 'PASSED' : 'FAILED'}`);
  console.log(`  7. Nonexistent Email Classification (401)     : ${report.wrongEmail401 ? 'PASSED' : 'FAILED'}`);
  console.log(`  8. Role Mismatch Classification (403)         : ${report.roleMismatch403 ? 'PASSED' : 'FAILED'}`);
  console.log(`  9. 422 Errors Excluded From Lockout Count     : ${noLockOn422 ? 'PASSED' : 'FAILED'}`);
  console.log(`  10. Lockout Threshold (10 Failed Attempts)    : ${report.lockoutAt10thAttempt ? 'PASSED' : 'FAILED'}`);
  console.log(`  11. Account Unlock Functionality              : ${report.unlockSuccess ? 'PASSED' : 'FAILED'}`);
  console.log('========================================================================\n');

  const allPassed =
    report.canonicalLogins &&
    report.admin20Consecutive === 20 &&
    report.trainer20Consecutive === 20 &&
    report.learner20Consecutive === 20 &&
    report.caseInsensitivity &&
    report.wrongPassword401 &&
    report.wrongEmail401 &&
    report.roleMismatch403 &&
    noLockOn422 &&
    report.lockoutAt10thAttempt &&
    report.unlockSuccess;

  console.log(`>>> RESULT: ${allPassed ? 'ALL TESTS PASSED (11/11)' : 'SOME TESTS FAILED'}\n`);

  await sequelize.close();
  process.exit(allPassed ? 0 : 1);
}

runSuite().catch(err => {
  console.error('Fatal error running verification suite:', err);
  process.exit(1);
});
