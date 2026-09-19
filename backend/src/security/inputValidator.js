/**
 * Input Validator — Centralized request validation using express-validator.
 *
 * Prevents: XSS, SQL injection, NoSQL injection, mass assignment,
 * buffer overflow, type confusion, out-of-range bounds.
 *
 * All validators enforce strict sanitization and boundary checks.
 */

const { body, param, query, validationResult } = require('express-validator');
const { EMAIL_REGEX, PASSWORD_REGEX, PHONE_REGEX } = require('../utils/validators');

// ── Handle validation results ──────────────────────────────────────────────
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array().map(e => ({
      field: e.path || e.param || 'unknown',
      message: e.msg,
      value: e.value,
    }));
    const firstMsg = errorList[0]?.message || 'Validation failed';
    return res.status(400).json({
      success: false,
      message: firstMsg,
      error: firstMsg,
      errors: errorList,
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
    .replace(/\0/g, '')
    .trim();
};

const sanitizeHtmlOptional = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/\0/g, '')
    .trim();
};

// ── Shared Helpers ─────────────────────────────────────────────────────────
const ALLOWED_LANGUAGES = [
  'javascript', 'python', 'py', 'js', 'cpp', 'c++', 'c',
  'java', 'go', 'golang', 'typescript', 'ts', 'csharp', 'cs', 'ruby', 'rust'
];

// ── Auth Validators ────────────────────────────────────────────────────────
const validateLogin = [
  body().custom((val, { req }) => {
    const cred = req.body.email || req.body.username;
    if (!cred || (typeof cred === 'string' && !cred.trim())) {
      throw new Error('Email or Username is required');
    }
    return true;
  }),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ max: 128 }).withMessage('Password too long'),
  body('email')
    .optional({ checkFalsy: true })
    .isLength({ max: 255 }).withMessage('Email too long')
    .customSanitizer(sanitizeString),
  body('username')
    .optional({ checkFalsy: true })
    .isLength({ min: 2, max: 50 }).withMessage('Username must be 2-50 characters')
    .customSanitizer(sanitizeString),
  body('role')
    .optional()
    .isIn(['ADMIN', 'TRAINER', 'PARTICIPANT', 'admin', 'trainer', 'participant'])
    .withMessage('Invalid role'),
  handleValidation,
];

const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[a-zA-Z\s'.-]+$/).withMessage('Name contains invalid characters')
    .customSanitizer(sanitizeString),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .matches(EMAIL_REGEX).withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 }),
  body('password')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters long')
    .matches(PASSWORD_REGEX).withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[\d\s+\-().]{7,20}$/).withMessage('Invalid phone format'),
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
    .isLength({ min: 8, max: 128 }).withMessage('New password must be 8-128 characters')
    .matches(PASSWORD_REGEX).withMessage('New password must contain uppercase, lowercase, number, and special character'),
  handleValidation,
];

const validateOtp = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  handleValidation,
];

const validateOtpVerify = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only digits'),
  handleValidation,
];

const validateResetPassword = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only digits'),
  body('newPassword')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(PASSWORD_REGEX).withMessage('Password must contain uppercase, lowercase, number, and special character'),
  handleValidation,
];

// ── Admin User Management Validators ──────────────────────────────────────
const validateAdminCreateUser = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[a-zA-Z\s'.-]+$/).withMessage('Name contains invalid characters')
    .customSanitizer(sanitizeString),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail()
    .isLength({ max: 255 }),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters long'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[\d\s+\-().]{7,20}$/).withMessage('Invalid phone format'),
  body('employeeId')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Employee ID too long')
    .customSanitizer(sanitizeString),
  body('department')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 }).withMessage('Department too long')
    .customSanitizer(sanitizeString),
  body('designation')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 }).withMessage('Designation too long')
    .customSanitizer(sanitizeString),
  body('experience')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 }).withMessage('Experience string too long')
    .customSanitizer(sanitizeString),
  handleValidation,
];

const validateBulkDeleteIds = [
  body('ids')
    .isArray({ min: 1 }).withMessage('ids array must not be empty')
    .custom((arr) => arr.every(id => Number.isInteger(Number(id)) && Number(id) > 0))
    .withMessage('All IDs must be positive integers'),
  handleValidation,
];

// ── Training Validators ───────────────────────────────────────────────────
const validateTrainingCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .optional({ checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('startDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Start date must be a valid ISO date'),
  body('endDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('End date must be a valid ISO date')
    .custom((endDate, { req }) => {
      if (endDate && req.body.startDate && new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error('End date cannot precede start date');
      }
      return true;
    }),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'ARCHIVED', 'draft', 'upcoming', 'ongoing', 'completed', 'archived'])
    .withMessage('Invalid training status'),
  handleValidation,
];

const validateTrainingUpdate = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid training ID'),
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .optional({ checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('startDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Start date must be a valid ISO date'),
  body('endDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('End date must be a valid ISO date')
    .custom((endDate, { req }) => {
      if (endDate && req.body.startDate && new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error('End date cannot precede start date');
      }
      return true;
    }),
  handleValidation,
];

// ── Course Validators ─────────────────────────────────────────────────────
const validateCourseCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .optional({ checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('category')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 }).withMessage('Category must be under 100 characters')
    .customSanitizer(sanitizeString),
  body('level')
    .optional({ checkFalsy: true })
    .isIn(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS', 'beginner', 'intermediate', 'advanced', 'all_levels'])
    .withMessage('Invalid course level'),
  body('trainingProgramId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid trainingProgramId'),
  handleValidation,
];

const validateCourseUpdate = [
  param('courseId')
    .optional()
    .isInt({ min: 1 }).withMessage('Invalid course ID'),
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .optional({ checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('level')
    .optional({ checkFalsy: true })
    .isIn(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS', 'beginner', 'intermediate', 'advanced', 'all_levels'])
    .withMessage('Invalid course level'),
  handleValidation,
];

// ── Lesson Validators ─────────────────────────────────────────────────────
const validateLessonCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .optional({ checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Description must be under 5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('orderIndex')
    .optional()
    .isInt({ min: 0 }).withMessage('orderIndex must be a non-negative integer'),
  body('durationMinutes')
    .optional()
    .isInt({ min: 0, max: 1440 }).withMessage('durationMinutes must be between 0 and 1440'),
  body('videoUrl')
    .optional({ checkFalsy: true })
    .isLength({ max: 1000 }).withMessage('videoUrl too long')
    .customSanitizer(sanitizeString),
  handleValidation,
];

const validateLessonUpdate = [
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('orderIndex')
    .optional()
    .isInt({ min: 0 }).withMessage('orderIndex must be a non-negative integer'),
  body('durationMinutes')
    .optional()
    .isInt({ min: 0, max: 1440 }).withMessage('durationMinutes must be between 0 and 1440'),
  handleValidation,
];

// ── Quiz & Question Validators ────────────────────────────────────────────
const validateQuizCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Quiz title is required')
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('timeLimit')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 600 }).withMessage('Time limit must be 1-600 minutes'),
  body('passingPercentage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Passing percentage must be 0-100'),
  body('passingScore')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Passing score must be 0-100'),
  body('maxAttempts')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 20 }).withMessage('Max attempts must be 1-20'),
  body('context')
    .optional()
    .isIn(['TRAINING', 'HIRE', 'training', 'hire']).withMessage('Invalid quiz context'),
  handleValidation,
];

const validateQuizUpdate = [
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('timeLimit')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 600 }).withMessage('Time limit must be 1-600 minutes'),
  body('passingPercentage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Passing percentage must be 0-100'),
  body('maxAttempts')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 20 }).withMessage('Max attempts must be 1-20'),
  handleValidation,
];

const validateQuestionCreate = [
  body('questionText')
    .trim()
    .notEmpty().withMessage('Question text is required')
    .isLength({ min: 2, max: 5000 }).withMessage('Question text must be 2-5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('questionType')
    .optional()
    .isIn(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER', 'MATCHING'])
    .withMessage('Invalid question type'),
  body('marks')
    .optional()
    .isFloat({ min: 0.5, max: 100 }).withMessage('Marks must be between 0.5 and 100'),
  body('order')
    .optional()
    .isInt({ min: 0 }).withMessage('Order must be a non-negative integer'),
  body('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'easy', 'medium', 'hard'])
    .withMessage('Invalid difficulty'),
  body('options')
    .optional()
    .custom((options, { req }) => {
      const type = req.body.questionType || 'MCQ';
      if (type === 'MCQ' && Array.isArray(options) && options.length < 2) {
        throw new Error('MCQ questions require at least 2 options');
      }
      return true;
    }),
  handleValidation,
];

const validateQuestionUpdate = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid question ID'),
  body('questionText')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 5000 }).withMessage('Question text must be 2-5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('questionType')
    .optional()
    .isIn(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER', 'MATCHING'])
    .withMessage('Invalid question type'),
  body('marks')
    .optional()
    .isFloat({ min: 0.5, max: 100 }).withMessage('Marks must be between 0.5 and 100'),
  handleValidation,
];

const validateQuizSubmitAnswers = [
  param('quizId')
    .isInt({ min: 1 }).withMessage('Invalid quiz ID'),
  param('attemptId')
    .isInt({ min: 1 }).withMessage('Invalid attempt ID'),
  body('answers')
    .isArray().withMessage('answers must be an array'),
  body('answers.*.questionId')
    .optional()
    .isInt({ min: 1 }).withMessage('Invalid questionId in answers'),
  body('timeSpent')
    .optional()
    .isNumeric().withMessage('timeSpent must be numeric'),
  handleValidation,
];

const validateAiGenerateQuiz = [
  body('prompt')
    .trim()
    .notEmpty().withMessage('Prompt/Topic is required')
    .isLength({ min: 3, max: 2000 }).withMessage('Prompt must be 3-2000 characters')
    .customSanitizer(sanitizeString),
  body('questionCount')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Number of questions must be 1-100'),
  body('difficulty')
    .optional()
    .custom((val) => {
      if (!val) return true;
      const u = String(val).toUpperCase();
      return ['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(u);
    }).withMessage('Difficulty must be EASY, MEDIUM, HARD, or MIXED'),
  handleValidation,
];

// ── Coding Assessment Validators ──────────────────────────────────────────
const validateCodingAssessmentCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('timeLimit')
    .optional({ checkFalsy: true })
    .isInt({ min: 5, max: 600 }).withMessage('Time limit must be 5-600 minutes'),
  body('totalMarks')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 1000 }).withMessage('Total marks must be 1-1000'),
  body('passingMarks')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 1000 }).withMessage('Passing marks must be 0-1000'),
  body('instructions')
    .optional({ checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Instructions must be under 5000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  handleValidation,
];

const validateCodingAssessmentUpdate = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid assessment ID'),
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('timeLimit')
    .optional({ checkFalsy: true })
    .isInt({ min: 5, max: 600 }).withMessage('Time limit must be 5-600 minutes'),
  handleValidation,
];

const validateCodingProblemCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Problem title is required')
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('description')
    .trim()
    .notEmpty().withMessage('Problem description is required')
    .isLength({ min: 5, max: 10000 }).withMessage('Description must be 5-10000 characters')
    .customSanitizer(sanitizeHtmlOptional),
  body('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'easy', 'medium', 'hard'])
    .withMessage('Difficulty must be EASY, MEDIUM, or HARD'),
  body('timeLimitSeconds')
    .optional()
    .isInt({ min: 1, max: 30 }).withMessage('Time limit must be 1-30 seconds'),
  body('memoryLimitMB')
    .optional()
    .isInt({ min: 16, max: 1024 }).withMessage('Memory limit must be 16-1024 MB'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  handleValidation,
];

const validateCodingProblemUpdate = [
  param('problemId')
    .isInt({ min: 1 }).withMessage('Invalid problem ID'),
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'easy', 'medium', 'hard'])
    .withMessage('Difficulty must be EASY, MEDIUM, or HARD'),
  handleValidation,
];

const validateTestCase = [
  body('expectedOutput')
    .notEmpty().withMessage('Expected output is required')
    .isLength({ max: 50000 }).withMessage('Expected output too large'),
  body('input')
    .optional()
    .isLength({ max: 50000 }).withMessage('Input too large'),
  body('isHidden')
    .optional()
    .isBoolean().withMessage('isHidden must be boolean'),
  body('points')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Points must be 0-100'),
  handleValidation,
];

const validateRunCode = [
  body('code')
    .notEmpty().withMessage('Code is required')
    .isLength({ max: 65536 }).withMessage('Code payload exceeds maximum size (64 KB)'),
  body('language')
    .notEmpty().withMessage('Language is required')
    .custom((val) => {
      if (!val || typeof val !== 'string') return false;
      return ALLOWED_LANGUAGES.includes(val.trim().toLowerCase());
    })
    .withMessage(`Unsupported language runtime. Allowed: ${ALLOWED_LANGUAGES.join(', ')}`),
  body('customInput')
    .optional()
    .isLength({ max: 32768 }).withMessage('Input exceeds maximum size (32 KB)'),
  handleValidation,
];

const validateSubmitCode = [
  body('code')
    .notEmpty().withMessage('Code is required')
    .isLength({ max: 65536 }).withMessage('Code payload exceeds maximum size (64 KB)'),
  body('language')
    .notEmpty().withMessage('Language is required')
    .custom((val) => {
      if (!val || typeof val !== 'string') return false;
      return ALLOWED_LANGUAGES.includes(val.trim().toLowerCase());
    })
    .withMessage('Unsupported language runtime'),
  body('problemId')
    .isInt({ min: 1 }).withMessage('Valid problemId is required'),
  body('attemptId')
    .isInt({ min: 1 }).withMessage('Valid attemptId is required'),
  handleValidation,
];

// ── Hiring Validators ─────────────────────────────────────────────────────
const validateHireAssessmentCreate = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('jobRole')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('Job role must be 2-150 characters')
    .customSanitizer(sanitizeString),
  body().custom((b) => {
    const rawType = b.assessmentType || b.type;
    if (!rawType) {
      throw new Error('Assessment type is required');
    }
    const type = String(rawType).toUpperCase();
    if (!['QUIZ', 'CODING', 'COMBINED'].includes(type)) {
      throw new Error('Type must be QUIZ, CODING, or COMBINED');
    }
    return true;
  }),
  body('durationMinutes')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1 and 480 minutes'),
  body('passingScore')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Passing score must be 0-100'),
  body('cutOffPercentage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Cut-off percentage must be 0-100'),
  handleValidation,
];

const validateHireAssessmentUpdate = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid assessment ID'),
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('jobRole')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('Job role must be 2-150 characters')
    .customSanitizer(sanitizeString),
  body('durationMinutes')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1 and 480 minutes'),
  body('passingScore')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Passing score must be 0-100'),
  body('cutOffPercentage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Cut-off percentage must be 0-100'),
  handleValidation,
];

const validateAssignCandidates = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid assessment ID'),
  body('candidateIds')
    .optional()
    .isArray({ min: 1 }).withMessage('candidateIds must be a non-empty array')
    .custom((arr) => arr.every(id => Number.isInteger(Number(id)) && Number(id) > 0))
    .withMessage('All candidateIds must be positive integers'),
  handleValidation,
];

// ── Interview Validators ──────────────────────────────────────────────────
const validateScheduleInterview = [
  body('title')
    .trim()
    .notEmpty().withMessage('Interview title is required')
    .isLength({ min: 2, max: 255 }).withMessage('Title must be 2-255 characters')
    .customSanitizer(sanitizeString),
  body('mode')
    .optional()
    .isIn(['ONE_ON_ONE', 'GROUP_DISCUSSION']).withMessage('Mode must be ONE_ON_ONE or GROUP_DISCUSSION'),
  body('scheduled_at')
    .notEmpty().withMessage('Scheduled date/time is required')
    .isISO8601().withMessage('scheduled_at must be a valid ISO date string'),
  body('durationMinutes')
    .optional()
    .isInt({ min: 5, max: 300 }).withMessage('Duration must be 5-300 minutes'),
  body('interviewer_id')
    .notEmpty().withMessage('Interviewer is required')
    .isInt({ min: 1 }).withMessage('interviewer_id must be a valid user ID'),
  body('candidate_id')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('candidate_id must be a valid user ID'),
  body('candidateIds')
    .optional()
    .isArray().withMessage('candidateIds must be an array'),
  handleValidation,
];

const validateInterviewEvaluation = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid interview ID'),
  param('candidateId')
    .isInt({ min: 1 }).withMessage('Invalid candidate ID'),
  body('scores')
    .optional()
    .isObject().withMessage('scores must be an object map of criteria'),
  body('comments')
    .optional()
    .isLength({ max: 5000 }).withMessage('Comments must be under 5000 characters')
    .customSanitizer(sanitizeString),
  handleValidation,
];

// ── Feedback & Survey Validators ──────────────────────────────────────────
const validateFeedbackSubmit = [
  body().custom((b) => {
    const rating = b.courseRating || b.trainerRating || b.subjectRating || b.rating;
    if (rating === undefined || rating === null || rating === '') {
      throw new Error('A rating between 1 and 5 is required');
    }
    const num = Number(rating);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
      throw new Error('A rating between 1 and 5 is required');
    }
    return true;
  }),
  body('comments')
    .optional({ checkFalsy: true })
    .isLength({ max: 2000 }).withMessage('Comments must be under 2000 characters')
    .customSanitizer(sanitizeString),
  body('courseId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid courseId'),
  body('trainingId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid trainingId'),
  handleValidation,
];

const validateDiscussionPost = [
  param('trainingId')
    .isInt({ min: 1 }).withMessage('Invalid training ID'),
  body('content')
    .trim()
    .notEmpty().withMessage('Content is required')
    .isLength({ min: 1, max: 5000 }).withMessage('Content must be 1-5000 characters')
    .customSanitizer(sanitizeString),
  handleValidation,
];

// ── Generic Param Validators ──────────────────────────────────────────────
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

module.exports = {
  handleValidation,
  sanitizeString,
  sanitizeHtmlOptional,
  ALLOWED_LANGUAGES,

  // Auth
  validateLogin,
  validateRegister,
  validateChangePassword,
  validateOtp,
  validateOtpVerify,
  validateResetPassword,

  // Admin
  validateAdminCreateUser,
  validateBulkDeleteIds,

  // Trainings
  validateTrainingCreate,
  validateTrainingUpdate,

  // Courses & Lessons
  validateCourseCreate,
  validateCourseUpdate,
  validateLessonCreate,
  validateLessonUpdate,

  // Quizzes & Questions
  validateQuizCreate,
  validateQuizUpdate,
  validateQuestionCreate,
  validateQuestionUpdate,
  validateQuizSubmitAnswers,
  validateAiGenerateQuiz,

  // Coding Assessments
  validateCodingAssessmentCreate,
  validateCodingAssessmentUpdate,
  validateCodingProblemCreate,
  validateCodingProblemUpdate,
  validateTestCase,
  validateRunCode,
  validateSubmitCode,

  // Hiring
  validateHireAssessmentCreate,
  validateHireAssessmentUpdate,
  validateAssignCandidates,

  // Interviews
  validateScheduleInterview,
  validateInterviewEvaluation,

  // Feedback & Discussions
  validateFeedbackSubmit,
  validateDiscussionPost,

  // Generic
  validateIdParam,
  validatePagination,

  body,
  param,
  query,
};
