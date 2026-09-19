/**
 * Input Validation & Sanitization Test Suite
 * Validates enterprise input guardrails across all LMS modules:
 * Auth, Admin, Trainings, Courses, Quizzes, Coding, Hiring, Interviews, Feedback, Discussions.
 */

const express = require('express');
const request = require('supertest');
const {
  handleValidation,
  sanitizeString,
  validateLogin,
  validateRegister,
  validateAdminCreateUser,
  validateBulkDeleteIds,
  validateTrainingCreate,
  validateCourseCreate,
  validateQuizCreate,
  validateQuestionCreate,
  validateCodingAssessmentCreate,
  validateCodingProblemCreate,
  validateTestCase,
  validateRunCode,
  validateHireAssessmentCreate,
  validateAssignCandidates,
  validateScheduleInterview,
  validateFeedbackSubmit,
  validateDiscussionPost,
} = require('../src/security/inputValidator');

// Helper to create an isolated test app with given middleware
function createTestApp(validators, handler = (req, res) => res.json({ success: true, body: req.body, params: req.params, query: req.query })) {
  const app = express();
  app.use(express.json());
  app.post('/test', validators, handler);
  app.post('/test/:trainingId', validators, handler);
  app.post('/test/:id/candidates/assign', validators, handler);
  return app;
}

describe('Input Sanitization Guardrails', () => {
  test('strips <script> tags and javascript: URIs', () => {
    const malicious = '<script>alert("pwned")</script>Hello World';
    expect(sanitizeString(malicious)).toBe('Hello World');

    const jsUri = 'javascript:alert(1)';
    expect(sanitizeString(jsUri)).toBe('alert(1)');

    const inlineHandler = '<div onload="evil()">Content</div>';
    expect(sanitizeString(inlineHandler)).toBe('<div "evil()">Content</div>');
  });

  test('removes null bytes from strings', () => {
    const nullByte = 'safe\0string';
    expect(sanitizeString(nullByte)).toBe('safestring');
  });
});

describe('Auth & User Validation', () => {
  const appLogin = createTestApp(validateLogin);
  const appRegister = createTestApp(validateRegister);
  const appAdminCreate = createTestApp(validateAdminCreateUser);
  const appBulkDelete = createTestApp(validateBulkDeleteIds);

  test('rejects login with missing email and username', async () => {
    const res = await request(appLogin).post('/test').send({ password: 'Password123!' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Email or Username is required/);
  });

  test('rejects login with missing password', async () => {
    const res = await request(appLogin).post('/test').send({ email: 'user@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Password is required/);
  });

  test('accepts valid login credentials', async () => {
    const res = await request(appLogin).post('/test').send({ email: 'user@example.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects registration with invalid email format', async () => {
    const res = await request(appRegister).post('/test').send({
      name: 'Jane Doe',
      email: 'invalid-email',
      password: 'StrongPassword123!',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some(e => e.field === 'email')).toBe(true);
  });

  test('rejects registration with weak password', async () => {
    const res = await request(appRegister).post('/test').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'weak',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Password must be at least 8 characters/);
  });

  test('rejects registration with unauthorized role elevation', async () => {
    const res = await request(appRegister).post('/test').send({
      name: 'Admin Attacker',
      email: 'attacker@example.com',
      password: 'StrongPassword123!',
      role: 'ADMIN',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only participant registration allowed/);
  });

  test('admin create user enforces valid email and name length', async () => {
    const res = await request(appAdminCreate).post('/test').send({
      name: 'A',
      email: 'bad',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
  });

  test('bulk delete rejects empty or non-integer IDs', async () => {
    const resEmpty = await request(appBulkDelete).post('/test').send({ ids: [] });
    expect(resEmpty.status).toBe(400);

    const resInvalid = await request(appBulkDelete).post('/test').send({ ids: ['abc', -5] });
    expect(resInvalid.status).toBe(400);

    const resValid = await request(appBulkDelete).post('/test').send({ ids: [1, 2, 3] });
    expect(resValid.status).toBe(200);
  });
});

describe('Training & Course Validation', () => {
  const appTraining = createTestApp(validateTrainingCreate);
  const appCourse = createTestApp(validateCourseCreate);

  test('rejects training create with empty title or inverted date range', async () => {
    const resEmpty = await request(appTraining).post('/test').send({ title: ' ' });
    expect(resEmpty.status).toBe(400);

    const resDates = await request(appTraining).post('/test').send({
      title: 'Valid Training Title',
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-05-01T00:00:00Z',
    });
    expect(resDates.status).toBe(400);
    expect(resDates.body.error).toMatch(/End date cannot precede start date/);
  });

  test('rejects course create with invalid level enum', async () => {
    const res = await request(appCourse).post('/test').send({
      title: 'Full Stack Web Dev',
      level: 'IMPOSSIBLE_LEVEL',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid course level/);
  });

  test('accepts valid course create', async () => {
    const res = await request(appCourse).post('/test').send({
      title: 'Full Stack Web Dev',
      level: 'INTERMEDIATE',
    });
    expect(res.status).toBe(200);
  });
});

describe('Quiz & Question Validation', () => {
  const appQuiz = createTestApp(validateQuizCreate);
  const appQuestion = createTestApp(validateQuestionCreate);

  test('rejects quiz with invalid timeLimit or passingScore', async () => {
    const res = await request(appQuiz).post('/test').send({
      title: 'React Basics',
      timeLimit: 9999, // Max is 600
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Time limit must be 1-600 minutes/);
  });

  test('rejects MCQ question with fewer than 2 options', async () => {
    const res = await request(appQuestion).post('/test').send({
      questionText: 'What is JSX?',
      questionType: 'MCQ',
      options: ['Only one option'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MCQ questions require at least 2 options/);
  });

  test('rejects question with negative marks', async () => {
    const res = await request(appQuestion).post('/test').send({
      questionText: 'Explain hooks',
      marks: -5,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Marks must be between 0.5 and 100/);
  });
});

describe('Coding Assessment Validation', () => {
  const appAssessment = createTestApp(validateCodingAssessmentCreate);
  const appProblem = createTestApp(validateCodingProblemCreate);
  const appTestCase = createTestApp(validateTestCase);
  const appRunCode = createTestApp(validateRunCode);

  test('rejects coding assessment with invalid duration', async () => {
    const res = await request(appAssessment).post('/test').send({
      title: 'Algorithms Midterm',
      timeLimit: 2, // Min is 5 minutes
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Time limit must be 5-600 minutes/);
  });

  test('rejects problem with description under 5 characters', async () => {
    const res = await request(appProblem).post('/test').send({
      title: 'Two Sum',
      description: 'hi',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Description must be 5-10000 characters/);
  });

  test('rejects test case without expectedOutput', async () => {
    const res = await request(appTestCase).post('/test').send({ input: '1 2' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Expected output is required/);
  });

  test('rejects code execution with unsupported runtime or oversized payload', async () => {
    const resLang = await request(appRunCode).post('/test').send({
      code: 'print("hello")',
      language: 'unsupported_brainfuck_runtime',
    });
    expect(resLang.status).toBe(400);
    expect(resLang.body.error).toMatch(/Unsupported language runtime/);

    const hugeCode = 'a'.repeat(70000); // Exceeds 64 KB
    const resSize = await request(appRunCode).post('/test').send({
      code: hugeCode,
      language: 'python',
    });
    expect(resSize.status).toBe(400);
    expect(resSize.body.error).toMatch(/Code payload exceeds maximum size/);
  });
});

describe('Hiring, Interviews, Feedback & Discussion Validation', () => {
  const appHire = createTestApp(validateHireAssessmentCreate);
  const appAssign = createTestApp(validateAssignCandidates);
  const appInterview = createTestApp(validateScheduleInterview);
  const appFeedback = createTestApp(validateFeedbackSubmit);
  const appDiscussion = createTestApp(validateDiscussionPost);

  test('rejects hiring assessment with invalid type', async () => {
    const res = await request(appHire).post('/test').send({
      title: 'Frontend Engineer',
      jobRole: 'SWE',
      type: 'INVALID_TYPE',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Type must be QUIZ, CODING, or COMBINED/);
  });

  test('rejects candidate assignment with empty list', async () => {
    const res = await request(appAssign).post('/test/1/candidates/assign').send({
      candidateIds: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/candidateIds must be a non-empty array/);
  });

  test('rejects interview scheduling with missing interviewer or invalid date', async () => {
    const res = await request(appInterview).post('/test').send({
      title: 'Technical Round 1',
      scheduled_at: 'not-a-date',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some(e => e.field === 'scheduled_at')).toBe(true);
  });

  test('rejects feedback without any rating 1-5', async () => {
    const res = await request(appFeedback).post('/test').send({
      comments: 'Great course',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/A rating between 1 and 5 is required/);

    const resOutOfRange = await request(appFeedback).post('/test').send({
      rating: 10,
    });
    expect(resOutOfRange.status).toBe(400);
    expect(resOutOfRange.body.error).toMatch(/A rating between 1 and 5 is required/);
  });

  test('rejects empty discussion post', async () => {
    const res = await request(appDiscussion).post('/test/1').send({
      content: '   ',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Content is required/);
  });
});
