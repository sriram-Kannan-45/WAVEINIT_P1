/**
 * Centralized Validation Utilities & Regex Patterns
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{}|;:,.<>~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{}|;:,.<>~`]{8,}$/;

export const PHONE_REGEX = /^[\d\s+\-().]{7,20}$/;

/**
 * Validates whether an email string strictly conforms to email format.
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validates whether a password satisfies the complexity requirements.
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return PASSWORD_REGEX.test(password);
}

/**
 * Breaks down password criteria for real-time requirement checklists.
 */
export function getPasswordValidationDetails(password = '') {
  const pw = String(password || '');
  return {
    minLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasLower: /[a-z]/.test(pw),
    hasNumber: /\d/.test(pw),
    hasSpecial: /[@$!%*?&#^()_+\-=[\]{}|;:,.<>~`]/.test(pw),
    isValid: PASSWORD_REGEX.test(pw),
  };
}

/**
 * Generates a secure random password guaranteed to satisfy all regex rules.
 */
export function generateCompliantPassword(length = 10) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  const len = Math.max(8, length);
  const chars = [
    upper.charAt(Math.floor(Math.random() * upper.length)),
    lower.charAt(Math.floor(Math.random() * lower.length)),
    digits.charAt(Math.floor(Math.random() * digits.length)),
    special.charAt(Math.floor(Math.random() * special.length)),
  ];

  for (let i = chars.length; i < len; i++) {
    chars.push(all.charAt(Math.floor(Math.random() * all.length)));
  }

  // Shuffle array using Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
