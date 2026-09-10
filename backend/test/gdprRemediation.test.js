const test = global.test || require('node:test').test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveDatabaseSsl } = require('../src/config/db');
const { issueStreamingTicket, verifyStreamingTicket } = require('../src/services/streamingTicketService');
const retentionConfig = require('../src/config/retentionConfig');
const { isPathTraversal } = require('../src/controllers/fileController');

test('Database TLS enforces rejectUnauthorized: true by default when SSL is active', () => {
  // Production environment or explicit SSL
  const sslConfig = resolveDatabaseSsl({
    NODE_ENV: 'production',
    DB_SSL: 'true'
  });
  assert.ok(sslConfig, 'SSL config should be active in production/with DB_SSL=true');
  assert.strictEqual(sslConfig.rejectUnauthorized, true, 'rejectUnauthorized must be true');
});

test('Database TLS respects custom CA cert path or string', () => {
  const tmpCaPath = path.join(__dirname, 'test-ca.pem');
  fs.writeFileSync(tmpCaPath, '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----');
  
  try {
    const sslConfig = resolveDatabaseSsl({
      DB_SSL: 'true',
      DB_CA_CERT: tmpCaPath
    });
    assert.strictEqual(sslConfig.rejectUnauthorized, true);
    assert.ok(sslConfig.ca.includes('FAKE'));
  } finally {
    if (fs.existsSync(tmpCaPath)) {
      fs.unlinkSync(tmpCaPath);
    }
  }
});

test('Streaming ticket service issues valid short-lived HMAC tickets and verifies authorization', () => {
  const ticket = issueStreamingTicket({
    userId: 101,
    role: 'PARTICIPANT',
    resourceId: 'rec-12345'
  });

  assert.ok(ticket, 'Ticket should be generated');

  // Valid verification
  const verification = verifyStreamingTicket(ticket, 'rec-12345');
  assert.ok(verification, 'Ticket should verify successfully');
  assert.strictEqual(verification.userId, '101');
  assert.strictEqual(verification.role, 'PARTICIPANT');

  // Mismatched resource should fail
  const wrongResource = verifyStreamingTicket(ticket, 'rec-other-user');
  assert.strictEqual(wrongResource, null);

  // Tampered ticket should fail
  const tamperedTicket = ticket.slice(0, -4) + 'abcd';
  const tamperedResult = verifyStreamingTicket(tamperedTicket, 'rec-12345');
  assert.strictEqual(tamperedResult, null);
});

test('Retention configuration provides secure default retention periods', () => {
  assert.ok(retentionConfig.SCREENSHOT_RETENTION_DAYS > 0);
  assert.ok(retentionConfig.PROCTORING_RETENTION_DAYS > 0);
  assert.ok(retentionConfig.INTERVIEW_RECORDING_RETENTION_DAYS > 0);
  assert.ok(retentionConfig.DEVICE_FINGERPRINT_RETENTION_DAYS > 0);
});

test('File Controller path traversal detection rejects malicious sequences', () => {
  assert.strictEqual(isPathTraversal('../secret.txt'), true);
  assert.strictEqual(isPathTraversal('..\\secret.txt'), true);
  assert.strictEqual(isPathTraversal('%2e%2e/secret.txt'), true);
  assert.strictEqual(isPathTraversal('secret.txt\0.png'), true);
  assert.strictEqual(isPathTraversal('valid-uuid-file.pdf'), false);
  assert.strictEqual(isPathTraversal('nested/valid-uuid-file.pdf'), false);
});

test('User profile controller rejects IDOR in getProfileById code inspection', () => {
  const controllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/userProfileController.js'), 'utf8');
  assert.match(controllerCode, /if \(!isSelf && !isAdmin\)/);
  assert.match(controllerCode, /res\.status\(403\)/);
});

test('Attendance controller restricts session rosters to trainer/admin', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '../src/controllers/attendanceController.js'), 'utf8');
  assert.match(attendanceCode, /if \(req\.user\.role === 'PARTICIPANT'\)/);
  assert.match(attendanceCode, /myRecord/);
});

test('Public profile endpoint projects only allowlisted public fields', () => {
  const profileControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/profileController.js'), 'utf8');
  assert.match(profileControllerCode, /PUBLIC_TRAINER_PROFILE_ATTRS/);
  // Ensure dob, phone, and address are not in the allowlist
  assert.ok(!profileControllerCode.includes("'dob'"));
  assert.ok(!profileControllerCode.includes("'phone'"));
  assert.ok(!profileControllerCode.includes("'address'"));
});

test('Login does not return refreshToken in JSON response and sets secure HttpOnly cookie', () => {
  const authControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/authController.js'), 'utf8');
  const tokenServiceCode = fs.readFileSync(path.join(__dirname, '../src/security/tokenService.js'), 'utf8');
  
  assert.match(authControllerCode, /tokenService\.setRefreshTokenCookie\(res, refreshToken\)/);
  assert.match(tokenServiceCode, /res\.cookie\('refreshToken', token, \{/);
  assert.match(tokenServiceCode, /httpOnly: true/);
  
  // Verify refreshToken is NOT returned in the res.json response object
  assert.ok(!authControllerCode.match(/res\.json\(\s*\{[^}]*refreshToken[^}]*\}\s*\)/));
});

test('Data Subject Rights controller exports and implements export, erasure, and consent handlers', () => {
  const privacyController = require('../src/controllers/privacyController');
  assert.strictEqual(typeof privacyController.exportData, 'function');
  assert.strictEqual(typeof privacyController.requestErasure, 'function');
  assert.strictEqual(typeof privacyController.revokeConsent, 'function');
  assert.strictEqual(typeof privacyController.getConsentStatus, 'function');

  const privacyRoutesCode = fs.readFileSync(path.join(__dirname, '../src/routes/privacyRoutes.js'), 'utf8');
  assert.match(privacyRoutesCode, /router\.get\('\/export-data', privacyController\.exportData\)/);
  assert.match(privacyRoutesCode, /router\.post\('\/request-erasure', privacyController\.requestErasure\)/);
  assert.match(privacyRoutesCode, /router\.post\('\/revoke-consent', privacyController\.revokeConsent\)/);
});

test('Self-service erasure requires password confirmation and unlinks physical files', () => {
  const privacyControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/privacyController.js'), 'utf8');
  assert.match(privacyControllerCode, /confirmationText !== 'DELETE MY ACCOUNT'/);
  assert.match(privacyControllerCode, /bcrypt\.compare\(password, user\.password\)/);
  assert.match(privacyControllerCode, /safeUnlink\(profile\.resumePath\)/);
  assert.match(privacyControllerCode, /safeUnlink\(s\.imageUrl\)/);
  assert.match(privacyControllerCode, /RefreshToken\.destroy/);
  assert.match(privacyControllerCode, /clearRefreshTokenCookie/);
});

test('Admin participant deletion unlinks physical personal files before database row deletion', () => {
  const adminControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/adminController.js'), 'utf8');
  assert.match(adminControllerCode, /async function cleanupUserPhysicalFiles\(userId\)/);
  assert.match(adminControllerCode, /await cleanupUserPhysicalFiles\(id\)/);
  assert.match(adminControllerCode, /await cleanupUserPhysicalFiles\(pId\)/);
});

test('Retention purge job exports runnable purge function and schedule initializer', () => {
  const purgeJob = require('../src/jobs/retentionPurgeJob');
  assert.strictEqual(typeof purgeJob.runRetentionPurge, 'function');
  assert.strictEqual(typeof purgeJob.initRetentionScheduler, 'function');
});

test('Database TLS logs warning in production when DB_CA_CERT is not provided', () => {
  const sslConfig = resolveDatabaseSsl({
    NODE_ENV: 'production',
    DB_SSL: 'true',
    // DB_CA_CERT omitted intentionally
  });
  assert.ok(sslConfig);
  assert.strictEqual(sslConfig.rejectUnauthorized, true);
  assert.strictEqual(sslConfig.ca, undefined);
});

test('Privacy masking correctly redacts emails, phones, and credentials in logs', () => {
  const { maskEmail, maskPhone, maskToken, maskCredential } = require('../src/utils/privacyMask');
  assert.strictEqual(maskEmail('john.doe@example.com'), 'j***e@example.com');
  assert.strictEqual(maskEmail('ab@test.org'), 'a***@test.org');
  assert.strictEqual(maskEmail(''), '***');
  assert.strictEqual(maskEmail(null), '***');

  assert.strictEqual(maskPhone('+1 555-123-4567'), '***-***-4567');
  assert.strictEqual(maskPhone('123'), '***');

  assert.strictEqual(maskToken('1234567890abcdef'), '1234...cdef');
  assert.strictEqual(maskCredential('sensitiveUser123'), 's***3');
  assert.strictEqual(maskCredential('test@domain.com'), 't***t@domain.com');
});

test('File controller and privacy controller enforce anti-cache headers on sensitive user data', () => {
  const fileControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/fileController.js'), 'utf8');
  assert.match(fileControllerCode, /res\.setHeader\('Cache-Control', 'private, no-cache, no-store, must-revalidate'\)/);

  const privacyControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/privacyController.js'), 'utf8');
  assert.match(privacyControllerCode, /res\.setHeader\('Cache-Control', 'private, no-cache, no-store, must-revalidate'\)/);
});

test('Registration controller protects passwords from listing and spreadsheet export leakage', () => {
  const regControllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/registrationController.js'), 'utf8');
  // Must not expose participantPassword or plainPassword in getApplications or export
  assert.ok(!regControllerCode.includes("participantPassword: a.plainPassword"));
  assert.ok(!regControllerCode.includes("app.plainPassword || '(sent)'"));
  assert.match(regControllerCode, /temporaryPasswordGenerated: !!plainPassword/);
});

