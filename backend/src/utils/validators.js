/**
 * Backend Validation Utilities & Regex Patterns
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{}|;:,.<>~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{}|;:,.<>~`]{8,}$/;

const PHONE_REGEX = /^[\d\s+\-().]{7,20}$/;

/**
 * Validates whether an email string strictly conforms to email format.
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validates whether a password satisfies the complexity requirements.
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return PASSWORD_REGEX.test(password);
}

module.exports = {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  PHONE_REGEX,
  validateEmail,
  validatePassword,
};
