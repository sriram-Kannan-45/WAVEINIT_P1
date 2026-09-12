process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345678901234567890';

const {
  AIQuiz,
  Course,
  Training,
  Enrollment,
  QuizAttempt,
  QuizResult,
  QuizAnswer,
  AIQuestion,
  User,
  ProctoringReport
} = require('../src/models');

const participantCourseController = require('../src/controllers/participantCourseController');

describe('Participant Quiz Result Flow & Visibility Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('1. listCourseQuizzes includes attemptId for completed/submitted quizzes', async () => {
    const fakeCourse = { id: 10, title: 'Web Development Bootcamp' };
    const fakeQuizzes = [
      {
        id: 101,
        courseId: 10,
        title: 'JavaScript Fundamentals',
        lessonId: null,
        isPublished: true,
        resultStatus: 'PUBLISHED',
        isResultPublished: true,
        isMandatory: true,
        proctoringEnabled: true,
        questions: [{ id: 1 }, { id: 2 }],
        startTime: null,
        endTime: null,
        timezone: 'Asia/Kolkata',
      }
    ];

    const fakeAttempts = [
      { id: 501, quizId: 101, status: 'EVALUATED' }
    ];

    const fakeResults = [
      { quizId: 101, percentage: 85 }
    ];

    jest.spyOn(Course, 'findByPk').mockResolvedValue(fakeCourse);
    jest.spyOn(Enrollment, 'findOne').mockResolvedValue({ id: 1, participantId: 42, courseId: 10, status: 'ENROLLED' });
    jest.spyOn(AIQuiz, 'findAll').mockResolvedValue(fakeQuizzes);
    jest.spyOn(QuizAttempt, 'findAll').mockResolvedValue(fakeAttempts);
    jest.spyOn(QuizResult, 'findAll').mockResolvedValue(fakeResults);

    const req = {
      params: { courseId: 10 },
      user: { id: 42, role: 'PARTICIPANT' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await participantCourseController.listCourseQuizzes(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.completedQuizzes).toHaveLength(1);
    expect(response.completedQuizzes[0].quizId).toBe(101);
    expect(response.completedQuizzes[0].attemptId).toBe(501);
    expect(response.completedQuizzes[0].myScore).toBe(85);
    expect(response.completedQuizzes[0].resultStatus).toBe('PUBLISHED');
  });

  test('2. getQuizResult returns all required stored fields when result is published', async () => {
    const fakeQuiz = {
      id: 101,
      courseId: 10,
      trainingId: 20,
      title: 'JavaScript Fundamentals',
      status: 'RESULTS_PUBLISHED',
      resultStatus: 'PUBLISHED',
      isResultPublished: true,
      totalMarks: 20,
      passingPercentage: 60,
    };

    const fakeAttempt = {
      id: 501,
      quizId: 101,
      participantId: 42,
      status: 'EVALUATED',
      startedAt: new Date('2026-09-11T10:00:00Z'),
      submittedAt: new Date('2026-09-11T10:25:00Z'),
      timeTaken: 1500,
      submissionType: 'MANUAL',
      autoSubmitted: false,
      timeExpired: false,
    };

    const fakeUser = {
      id: 42,
      name: 'Alice Learner',
      email: 'alice@example.com'
    };

    const fakeResult = {
      id: 901,
      attemptId: 501,
      quizId: 101,
      participantId: 42,
      totalScore: 18,
      maxScore: 20,
      percentage: 90,
      resultPublished: true,
    };

    const fakeQuestions = [
      { id: 1, questionText: 'What is closure?', questionType: 'MCQ', options: ['A function with lexical scope', 'An object'], correctAnswer: 'A function with lexical scope', explanation: 'Closures preserve scope' },
      { id: 2, questionText: 'Is JS single-threaded?', questionType: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'True', explanation: 'JS uses a single-threaded event loop' }
    ];

    const fakeAnswers = [
      { questionId: 1, attemptId: 501, answerText: 'A function with lexical scope', isCorrect: true },
      { questionId: 2, attemptId: 501, answerText: 'True', isCorrect: true }
    ];

    const fakeProctorReport = {
      attemptId: 501,
      riskScore: 5.0,
      riskLevel: 'LOW'
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(fakeQuiz);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(fakeAttempt);
    jest.spyOn(QuizAttempt, 'count').mockResolvedValue(1);
    jest.spyOn(Enrollment, 'findOne').mockResolvedValue({ id: 1, participantId: 42, courseId: 10, status: 'ENROLLED' });
    jest.spyOn(User, 'findByPk').mockResolvedValue(fakeUser);
    jest.spyOn(QuizResult, 'findOne').mockResolvedValue(fakeResult);
    jest.spyOn(AIQuestion, 'findAll').mockResolvedValue(fakeQuestions);
    jest.spyOn(QuizAnswer, 'findAll').mockResolvedValue(fakeAnswers);
    jest.spyOn(ProctoringReport, 'findOne').mockResolvedValue(fakeProctorReport);

    const req = {
      params: { quizId: 101 },
      query: { attemptId: '501' },
      user: { id: 42, role: 'PARTICIPANT', email: 'alice@example.com' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await participantCourseController.getQuizResult(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];

    // Validate all required fields
    expect(data.success).toBe(true);
    expect(data.status).toBe('PUBLISHED');
    expect(data.quizTitle).toBe('JavaScript Fundamentals');
    expect(data.quizName).toBe('JavaScript Fundamentals');
    expect(data.participantName).toBe('Alice Learner');
    expect(data.participantId).toBe(42);
    expect(data.totalQuestions).toBe(2);
    expect(data.answeredCount).toBe(2);
    expect(data.correctCount).toBe(2);
    expect(data.wrongCount).toBe(0);
    expect(data.incorrectAnswers).toBe(0);
    expect(data.marksObtained).toBe(18);
    expect(data.maximumMarks).toBe(20);
    expect(data.percentage).toBe(90);
    expect(data.passStatus).toBe('Pass');
    expect(data.attemptNumber).toBe(1);
    expect(data.startedAt).toBeDefined();
    expect(data.submittedAt).toBeDefined();
    expect(data.timeTaken).toBe(1500);
    expect(data.submissionType).toBe('MANUAL');
    expect(data.autoSubmitted).toBe(false);
    expect(data.timeExpired).toBe(false);
    expect(data.malpracticeScore).toBe(5);
    expect(data.malpracticeStatus).toBe('LOW');
    expect(data.review).toHaveLength(2);
    expect(data.courseId).toBe(10);
    expect(data.trainingId).toBe(20);
  });

  test('3. Security Check: Participant cannot view another participant result by passing foreign attemptId', async () => {
    const fakeQuiz = {
      id: 101,
      courseId: 10,
      title: 'JavaScript Fundamentals',
      status: 'PUBLISHED',
      isPublished: true,
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(fakeQuiz);
    // When queried with foreign attemptId belonging to user 99, findOne with participantId: 42 returns null
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(null);
    jest.spyOn(Enrollment, 'findOne').mockResolvedValue({ id: 1, participantId: 42, courseId: 10, status: 'ENROLLED' });
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 42, name: 'Alice' });

    const req = {
      params: { quizId: 101 },
      query: { attemptId: '999' }, // Foreign attempt belonging to another user
      user: { id: 42, role: 'PARTICIPANT' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await participantCourseController.getQuizResult(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    // Must return NOT_SUBMITTED for this participant without leaking foreign data
    expect(data.status).toBe('NOT_SUBMITTED');
    expect(data.score).toBeUndefined();
    expect(data.review).toBeUndefined();
  });

  test('4. Correctly recognizes attempts with COMPLETED or AUTO_SUBMITTED status', async () => {
    const fakeQuiz = {
      id: 102,
      courseId: 10,
      title: 'CSS & Flexbox',
      status: 'PUBLISHED',
      resultStatus: 'PUBLISHED',
      isResultPublished: true,
    };

    const fakeAttempt = {
      id: 601,
      quizId: 102,
      participantId: 42,
      status: 'COMPLETED',
      startedAt: new Date(),
      submittedAt: new Date(),
      submissionType: 'AUTO_SUBMITTED',
      autoSubmitted: true,
      timeExpired: true,
      timeTaken: 1800,
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(fakeQuiz);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(fakeAttempt);
    jest.spyOn(QuizAttempt, 'count').mockResolvedValue(2);
    jest.spyOn(Enrollment, 'findOne').mockResolvedValue({ id: 1, participantId: 42, courseId: 10, status: 'ENROLLED' });
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 42, name: 'Alice' });
    jest.spyOn(QuizResult, 'findOne').mockResolvedValue({ percentage: 70, totalScore: 7, maxScore: 10 });
    jest.spyOn(AIQuestion, 'findAll').mockResolvedValue([{ id: 1, marks: 1 }]);
    jest.spyOn(QuizAnswer, 'findAll').mockResolvedValue([]);
    jest.spyOn(ProctoringReport, 'findOne').mockResolvedValue(null);

    const req = {
      params: { quizId: 102 },
      query: {},
      user: { id: 42, role: 'PARTICIPANT' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await participantCourseController.getQuizResult(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.status).toBe('PUBLISHED');
    expect(data.autoSubmitted).toBe(true);
    expect(data.timeExpired).toBe(true);
    expect(data.submissionType).toBe('AUTO_SUBMITTED');
    expect(data.attemptNumber).toBe(2);
  });

  test('5. Hides question review and detailed scores when resultStatus is HIDDEN/pending trainer review', async () => {
    const fakeQuiz = {
      id: 103,
      courseId: 10,
      title: 'Algorithms 101',
      status: 'PUBLISHED',
      resultStatus: 'HIDDEN',
      isResultPublished: false,
    };

    const fakeAttempt = {
      id: 701,
      quizId: 103,
      participantId: 42,
      status: 'SUBMITTED',
      startedAt: new Date(),
      submittedAt: new Date(),
      timeTaken: 1200,
      submissionType: 'MANUAL',
    };

    jest.spyOn(AIQuiz, 'findByPk').mockResolvedValue(fakeQuiz);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(fakeAttempt);
    jest.spyOn(QuizAttempt, 'count').mockResolvedValue(1);
    jest.spyOn(Enrollment, 'findOne').mockResolvedValue({ id: 1, participantId: 42, courseId: 10, status: 'ENROLLED' });
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 42, name: 'Alice' });
    jest.spyOn(QuizResult, 'findOne').mockResolvedValue(null);
    jest.spyOn(AIQuestion, 'count').mockResolvedValue(10);
    jest.spyOn(QuizAnswer, 'count').mockResolvedValue(10);
    jest.spyOn(ProctoringReport, 'findOne').mockResolvedValue(null);

    const req = {
      params: { quizId: 103 },
      query: { attemptId: '701' },
      user: { id: 42, role: 'PARTICIPANT' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await participantCourseController.getQuizResult(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.status).toBe('SUBMITTED_HIDDEN');
    expect(data.resultStatus).toBe('HIDDEN');
    expect(data.participantName).toBe('Alice');
    expect(data.attemptId).toBe(701);
    expect(data.review).toBeUndefined(); // Review and answers hidden from participant
    expect(data.score).toBeUndefined();
  });
});
