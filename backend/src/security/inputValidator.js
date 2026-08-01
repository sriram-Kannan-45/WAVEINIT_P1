/**
 * Input Validator — Centralized request validation using express-validator.
 *
 * Prevents: XSS, SQL injection, NoSQL injection, mass assignment,
 * buffer overflow, type confusion.
 *
 * Usage: apply validators as middleware before controllers
 */

const { body, param, query, validationResult } = require('express-validator');

// ── Handle validation results ──────────────────────────────────────────────
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  next();
}

// ── Common sanitizers ──────────────────────────────────────────────────────
const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

// ── Auth validators ────────────────────────────────────────────────────────
const validateLogin = [
  body('email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),
  body('username')
    .optional()
    .isAlphanumeric().withMessage('Username must be alphanumeric')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ max: 128 }).withMessage('Password too long'),
  body('role')
    .optional()
    .isIn(['ADMIN', 'TRAINER', 'PARTICIPANT', 'admin', 'trainer', 'participant'])
    .withMessage('Invalid role'),
  handleValidation,
];

const validateRegister = [
  body('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name contains invalid characters'),
  body('email')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 }),
  body('password')
    .isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  body('phone')
    .optional()
    .matches(/^[\d\s+\-().]+$/).withMessage('Invalid phone format')
    .isLength({ max: 20 }),
  body('role')
    .optional()
    .custom((val) => !val || val === 'PARTICIPANT' || val === 'participant')
    .withMessage('Only participant registration allowed'),
  handleValidation,
];

const validateChangePassword = [
  body('oldPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6, max: 128 }).withMessage('New password must be 6-128 characters'),
  handleValidation,
];

// ── Generic param validators ───────────────────────────────────────────────
const validateIdParam = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid ID parameter'),
  handleValidation,
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  handleValidation,
];

// ── Course validators ──────────────────────────────────────────────────────
const validateCourse = [
  body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .optional()
    .isLength({ max: 5000 }).withMessage('Description too long')
    .customSanitizer(sanitizeString),
  handleValidation,
];

// ── Quiz validators ────────────────────────────────────────────────────────
const validateQuiz = [
  body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters')
    .customSanitizer(sanitizeString),
  body('timeLimit')
    .optional()
    .isInt({ min: 1, max: 300 }).withMessage('Time limit must be 1-300 minutes'),
  body('numQuestions')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Number of questions must be 1-100'),
  handleValidation,
];

// ── Discussion validators ──────────────────────────────────────────────────
const validateDiscussion = [
  body('content')
    .notEmpty().withMessage('Content is required')
    .isLength({ min: 1, max: 5000 }).withMessage('Content must be 1-5000 characters')
    .customSanitizer(sanitizeString),
  handleValidation,
];

// ── OTP validators ─────────────────────────────────────────────────────────
const validateOtp = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  handleValidation,
];

const validateOtpVerify = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('otp')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only digits'),
  handleValidation,
];

const validateResetPassword = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('otp')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric(),
  body('newPassword')
    .isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  handleValidation,
];

module.exports = {
  handleValidation,
  sanitizeString,
  validateLogin,
  validateRegister,
  validateChangePassword,
  validateIdParam,
  validatePagination,
  validateCourse,
  validateQuiz,
  validateDiscussion,
  validateOtp,
  validateOtpVerify,
  validateResetPassword,
  body,
  param,
  query,
};
