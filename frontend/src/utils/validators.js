/**
 * Centralized Validation Utilities & Regex Patterns
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{}|;:,.<>~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{}|;:,.<>~`]{8,}$/;

export const PHONE_REGEX = /^[\d\s+\-().]{7,20}$/;

export const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/;

/**
 * Validates whether an email string strictly conforms to email format.
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validates whether a phone number strictly conforms to phone format.
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return PHONE_REGEX.test(phone.trim());
}

/**
 * Validates whether a person's name contains only letters, spaces, hyphens, and apostrophes.
 */
export function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[a-zA-Z\s'.-]+$/.test(trimmed);
}

/**
 * Validates whether a URL is a valid http/https web address.
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return URL_REGEX.test(url.trim());
}

/**
 * Validates whether a required field has a non-empty value.
 */
export function validateRequired(value, label = 'This field') {
  if (value === undefined || value === null) return `${label} is required`;
  if (typeof value === 'string' && !value.trim()) return `${label} is required`;
  if (Array.isArray(value) && value.length === 0) return `${label} cannot be empty`;
  return null;
}

/**
 * Validates string length bounds.
 */
export function validateLength(value, min = 0, max = Infinity, label = 'Field') {
  if (!value && min === 0) return null;
  const str = String(value || '').trim();
  if (str.length < min) return `${label} must be at least ${min} characters`;
  if (str.length > max) return `${label} cannot exceed ${max} characters`;
  return null;
}

/**
 * Validates numeric range bounds.
 */
export function validateNumber(value, min = -Infinity, max = Infinity, label = 'Field') {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return `${label} must be a valid number`;
  if (num < min) return `${label} must be at least ${min}`;
  if (num > max) return `${label} cannot exceed ${max}`;
  return null;
}

/**
 * Validates start and end date ordering.
 */
export function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime())) return 'Start date is invalid';
  if (isNaN(end.getTime())) return 'End date is invalid';
  if (end < start) return 'End date cannot be earlier than start date';
  return null;
}

/**
 * Sanitizes input to prevent basic script injection.
 */
export function sanitizeInput(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Parses and formats backend validation error responses into a field-mapped object.
 */
export function parseApiValidationErrors(errResponse) {
  const map = {};
  if (!errResponse) return map;
  if (Array.isArray(errResponse.errors)) {
    errResponse.errors.forEach(e => {
      if (e.field && !map[e.field]) {
        map[e.field] = e.message;
      }
    });
  }
  return map;
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
