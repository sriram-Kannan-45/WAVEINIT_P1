const { validateEmail, validatePassword, EMAIL_REGEX, PASSWORD_REGEX } = require('../src/utils/validators');

console.log('--- Testing Email Regex ---');
const testEmails = [
  { email: 'user@example.com', valid: true },
  { email: 'first.last@domain.co.in', valid: true },
  { email: 'user+tag@domain.org', valid: true },
  { email: 'admin123@sub.domain.edu', valid: true },
  { email: 'plainaddress', valid: false },
  { email: '@missingusername.com', valid: false },
  { email: 'missingdomain@.com', valid: false },
  { email: 'user@domain.c', valid: false }, // TLD too short (<2 chars)
  { email: 'user @domain.com', valid: false },
  { email: 'user@domain..com', valid: false },
];

let emailPass = 0;
testEmails.forEach(({ email, valid }) => {
  const result = validateEmail(email);
  const ok = result === valid;
  if (ok) emailPass++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Email: "${email}" -> Expected: ${valid}, Got: ${result}`);
});

console.log(`\nEmail Tests: ${emailPass}/${testEmails.length} passed.`);

console.log('\n--- Testing Password Regex ---');
const testPasswords = [
  { pw: 'Pass1234!', valid: true },
  { pw: 'Secure#2026', valid: true },
  { pw: 'WaveInit$123', valid: true },
  { pw: 'Complex_pw9', valid: true },
  { pw: 'Short1!', valid: false }, // < 8 chars
  { pw: 'alllowercase123!', valid: false }, // No uppercase
  { pw: 'ALLUPPERCASE123!', valid: false }, // No lowercase
  { pw: 'NoSpecial123', valid: false }, // No special char
  { pw: 'NoNumber!@#$', valid: false }, // No number
  { pw: '', valid: false },
];

let pwPass = 0;
testPasswords.forEach(({ pw, valid }) => {
  const result = validatePassword(pw);
  const ok = result === valid;
  if (ok) pwPass++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Password: "${pw}" -> Expected: ${valid}, Got: ${result}`);
});

console.log(`\nPassword Tests: ${pwPass}/${testPasswords.length} passed.`);

if (emailPass === testEmails.length && pwPass === testPasswords.length) {
  console.log('\nALL TESTS PASSED SUCCESSFULLY! ✅');
  process.exit(0);
} else {
  console.error('\nSOME TESTS FAILED! ❌');
  process.exit(1);
}
