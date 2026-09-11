process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345678901234567890';

const { AIQuiz, Enrollment, QuizAttempt, QuizAssignment, Course } = require('../src/models');
const logger = require('../src/utils/logger');

describe('Quiz Start Regression & Error Handling Tests', () => {
  let originalDebug;
  let debugCalls = [];

  beforeAll(() => {
    originalDebug = logger.debug;
    logger.debug = (...args) => {
      debugCalls.push(args);
    };
  });

  afterAll(() => {
    logger.debug = originalDebug;
  });

  beforeEach(() => {
    debugCalls = [];
  });

  test('quizzesRoutes loads without throwing ReferenceError for logger or undeclared variables', () => {
    expect(() => {
      require('../src/routes/quizzesRoutes');
    }).not.toThrow();
  });

  test('startQuizAttempt handles non-existent quiz with 404 without ReferenceError', async () => {
    const router = require('../src/routes/quizzesRoutes');
    const startRoute = router.stack.find(
      layer => layer.route && layer.route.path === '/:quizId/start' && layer.route.methods.post
    );
    expect(startRoute).toBeDefined();
    const handler = startRoute.route.stack[0].handle;

    const req = {
      params: { quizId: 999999 },
      user: { id: 42, role: 'PARTICIPANT' },
      headers: {},
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(null);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Quiz not found' }));
    expect(debugCalls.length).toBeGreaterThan(0);
    expect(debugCalls[0][0]).toContain('attempt initiated by user #42');

    AIQuiz.findByPk.mockRestore();
  });

  test('startQuizAttempt returns 403 when quiz is not published', async () => {
    const router = require('../src/routes/quizzesRoutes');
    const startRoute = router.stack.find(
      layer => layer.route && layer.route.path === '/:quizId/start' && layer.route.methods.post
    );
    const handler = startRoute.route.stack[0].handle;

    const req = {
      params: { quizId: 101 },
      user: { id: 42, role: 'PARTICIPANT' },
      headers: {},
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockQuiz = {
      id: 101,
      status: 'DRAFT',
      toJSON: () => ({ id: 101, status: 'DRAFT' })
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(mockQuiz);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Quiz not published' }));

    AIQuiz.findByPk.mockRestore();
  });

  test('startQuizAttempt returns 400 with both error and message when quiz was already completed', async () => {
    const router = require('../src/routes/quizzesRoutes');
    const startRoute = router.stack.find(
      layer => layer.route && layer.route.path === '/:quizId/start' && layer.route.methods.post
    );
    const handler = startRoute.route.stack[0].handle;

    const req = {
      params: { quizId: 101 },
      user: { id: 42, role: 'PARTICIPANT' },
      headers: {},
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockQuiz = {
      id: 101,
      status: 'PUBLISHED',
      courseId: 5,
      toJSON: () => ({ id: 101, status: 'PUBLISHED' })
    };

    const mockAssignment = { id: 1, status: 'COMPLETED' };
    const mockAttempt = { id: 10, status: 'COMPLETED' };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(mockQuiz);
    jest.spyOn(QuizAssignment, 'findOne').mockResolvedValue(mockAssignment);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(mockAttempt);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You have already attempted this quiz.',
      message: 'You have already attempted this quiz.'
    });

    AIQuiz.findByPk.mockRestore();
    QuizAssignment.findOne.mockRestore();
    QuizAttempt.findOne.mockRestore();
  });

  test('startQuizAttempt resumes an in-progress attempt successfully', async () => {
    const { ProctoringSession, AssessmentSession } = require('../src/models');
    const monitoringService = require('../src/services/monitoringService');

    const router = require('../src/routes/quizzesRoutes');
    const startRoute = router.stack.find(
      layer => layer.route && layer.route.path === '/:quizId/start' && layer.route.methods.post
    );
    const handler = startRoute.route.stack[0].handle;

    const req = {
      params: { quizId: 101 },
      user: { id: 42, role: 'PARTICIPANT' },
      headers: {},
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockQuiz = {
      id: 101,
      title: 'JavaScript Fundamentals',
      status: 'PUBLISHED',
      timeLimit: 30,
      proctoringEnabled: true,
      toJSON: () => ({ id: 101, title: 'JavaScript Fundamentals', status: 'PUBLISHED' })
    };

    const mockAssignment = { id: 1, status: 'PENDING' };
    const mockAttempt = {
      id: 55,
      status: 'IN_PROGRESS',
      monitoringSessionId: 'psess_123',
      update: jest.fn().mockResolvedValue(true)
    };
    const mockSession = {
      id: 77,
      sessionToken: 'token_abc_123',
      status: 'ACTIVE',
      update: jest.fn().mockResolvedValue(true)
    };
    const mockProctorSession = {
      sessionId: 'psess_123',
      status: 'ACTIVE',
      update: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(mockQuiz);
    jest.spyOn(QuizAssignment, 'findOne').mockResolvedValue(mockAssignment);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(mockAttempt);
    jest.spyOn(AssessmentSession, 'findOne').mockResolvedValue(mockSession);
    jest.spyOn(ProctoringSession, 'findOrCreate').mockResolvedValue([mockProctorSession, false]);
    jest.spyOn(monitoringService, 'startSession').mockResolvedValue({
      session: { sessionId: 'ms_quiz_123' },
      isResumed: true
    });

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      attemptId: 55,
      sessionToken: expect.any(String),
      monitoringSessionId: 'ms_quiz_123',
      quiz: expect.objectContaining({ id: 101, title: 'JavaScript Fundamentals' })
    }));

    AIQuiz.findByPk.mockRestore();
    QuizAssignment.findOne.mockRestore();
    QuizAttempt.findOne.mockRestore();
    AssessmentSession.findOne.mockRestore();
    ProctoringSession.findOrCreate.mockRestore();
    monitoringService.startSession.mockRestore();
  });

  test('startQuizAttempt creates a new attempt when no previous attempt exists', async () => {
    const { ProctoringSession, AssessmentSession } = require('../src/models');
    const monitoringService = require('../src/services/monitoringService');

    const router = require('../src/routes/quizzesRoutes');
    const startRoute = router.stack.find(
      layer => layer.route && layer.route.path === '/:quizId/start' && layer.route.methods.post
    );
    const handler = startRoute.route.stack[0].handle;

    const req = {
      params: { quizId: 102 },
      user: { id: 43, role: 'PARTICIPANT' },
      headers: {},
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockQuiz = {
      id: 102,
      title: 'Python Essentials',
      status: 'PUBLISHED',
      timeLimit: 20,
      proctoringEnabled: false,
      toJSON: () => ({ id: 102, title: 'Python Essentials', status: 'PUBLISHED' })
    };

    const mockAssignment = { id: 2, status: 'PENDING' };
    const mockNewAttempt = {
      id: 99,
      status: 'IN_PROGRESS',
      monitoringSessionId: 'psess_102_43'
    };
    const mockCreatedSession = {
      id: 88,
      sessionToken: 'token_new_99'
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(mockQuiz);
    jest.spyOn(QuizAssignment, 'findOne').mockResolvedValue(mockAssignment);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(null);
    jest.spyOn(QuizAttempt, 'create').mockResolvedValue(mockNewAttempt);
    jest.spyOn(ProctoringSession, 'create').mockResolvedValue({ id: 1 });
    jest.spyOn(AssessmentSession, 'findOne').mockResolvedValue(null);
    jest.spyOn(AssessmentSession, 'create').mockResolvedValue(mockCreatedSession);
    jest.spyOn(monitoringService, 'startSession').mockResolvedValue({
      session: { sessionId: 'ms_new_quiz_99' },
      isResumed: false
    });

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      attemptId: 99,
      sessionToken: 'token_new_99',
      monitoringSessionId: 'ms_new_quiz_99',
      quiz: expect.objectContaining({ id: 102, title: 'Python Essentials' })
    }));

    AIQuiz.findByPk.mockRestore();
    QuizAssignment.findOne.mockRestore();
    QuizAttempt.findOne.mockRestore();
    QuizAttempt.create.mockRestore();
    ProctoringSession.create.mockRestore();
    AssessmentSession.findOne.mockRestore();
    AssessmentSession.create.mockRestore();
    monitoringService.startSession.mockRestore();
  });
});

