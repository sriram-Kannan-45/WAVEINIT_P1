/**
 * Regression tests for the Hire audit bug-fix pass (5 surgical fixes).
 *
 * 1. deleteInterview must not hard-delete EVALUATED / IN_PROGRESS interviews.
 * 2. Group Discussions auto-flip to EVALUATED once every member is scored
 *    (any context, not just 6-member HIRE GDs).
 * 3. runCode rejects attempts owned by another participant.
 * 4. Hire quiz start returns a clean 403 for an unassigned candidate.
 * 5. startQuizAttempt honors allowMultipleAttempts / maxAttempts.
 */
jest.mock('../src/services/interviewNotificationService', () => ({ notifyCreated: jest.fn(), scheduleReminder: jest.fn(), notifyCancelled: jest.fn() }));
jest.mock('../src/services/notificationService', () => ({ createNotification: jest.fn(), CATEGORIES: { ACADEMIC: 'ACADEMIC' } }));

const models = require('../src/models');
const interview = require('../src/controllers/interviewController');
const lifecycle = require('../src/services/interviewLifecycleService');
const coding = require('../src/controllers/codingAssessmentController');

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json: jest.fn(), setHeader: jest.fn(), send: jest.fn() });
const row = (data) => ({ ...data, update: jest.fn(async function (patch) { Object.assign(this, patch); return this; }), destroy: jest.fn(async () => 1), toJSON() { return { ...this }; } });

afterEach(() => jest.restoreAllMocks());

// ── Fix 1: deleteInterview prohibits deleting terminal / live interviews ──

describe('deleteInterview guard', () => {
  const runDelete = async (status) => {
    const res = response();
    const interviewRow = row({ id: 7, status, title: 'Hire GD', scheduled_at: new Date(), candidate_id: 1, interviewer_id: 2 });
    jest.spyOn(models.Interview, 'findByPk').mockResolvedValue(interviewRow);
    jest.spyOn(models.Interview, 'destroy').mockResolvedValue(1);
    await interview.deleteInterview({ params: { id: 7 }, user: { id: 99, role: 'ADMIN' }, get: () => 'localhost' }, res);
    return { res, interviewRow };
  };

  test.each(['COMPLETED', 'EVALUATED', 'IN_PROGRESS'])('blocks hard delete for %s interviews', async (status) => {
    const { res } = await runDelete(status);
    expect(res.statusCode).toBe(400);
    expect(models.Interview.destroy).not.toHaveBeenCalled();
  });

  test('still allows deleting a cancelled (non-terminal) interview', async () => {
    const { res, interviewRow } = await runDelete('CANCELLED');
    expect(res.statusCode).toBe(200);
    expect(models.Interview.destroy).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(interviewRow.title).toBe('Hire GD');
  });
});

// ── Fix 2: auto-EVALUATED once ALL GD members are scored (any context) ──

describe('GD automatic evaluation unlock', () => {
  const criteria = lifecycle.normalizeCriteria([{ name: 'Communication', maxScore: 10, weight: 1 }]);
  const makeGd = (context, status) => row({
    id: 1, context, mode: 'GROUP_DISCUSSION', status,
    interviewer_id: 90, created_by: 99, evaluation_criteria: criteria,
    update: jest.fn(async function (patch) { Object.assign(this, patch); return this; }),
  });

  test('a 3-member TRAINING GD flips to EVALUATED once every member is scored', async () => {
    const session = makeGd('TRAINING', 'COMPLETED');
    const members = [1, 2, 3].map((user_id) => row({ user_id }));
    jest.spyOn(models.Interview, 'findByPk').mockResolvedValue(session);
    jest.spyOn(models.InterviewParticipant, 'findOne').mockImplementation(async ({ where }) => members.find((p) => p.user_id === where.user_id));
    jest.spyOn(models.InterviewParticipant, 'findAll').mockResolvedValue(members);

    await lifecycle.saveEvaluation(1, 1, { id: 90, role: 'TRAINER' }, { scores: { criterion_1: 8 }, decision: 'ON_HOLD' });
    expect(session.status).toBe('COMPLETED');
    await lifecycle.saveEvaluation(1, 2, { id: 90, role: 'TRAINER' }, { scores: { criterion_1: 7 }, decision: 'ON_HOLD' });
    expect(session.status).toBe('COMPLETED');
    await lifecycle.saveEvaluation(1, 3, { id: 90, role: 'TRAINER' }, { scores: { criterion_1: 9 }, decision: 'SELECTED' });
    expect(session.status).toBe('EVALUATED');
  });

  test('an already EVALUATED GD stays editable for later publication', async () => {
    const session = makeGd('HIRE', 'EVALUATED');
    const members = [1, 2, 3, 4, 5, 6].map((user_id) => row({ user_id, evaluation: { scores: { criterion_1: 5 } } }));
    jest.spyOn(models.Interview, 'findByPk').mockResolvedValue(session);
    jest.spyOn(models.InterviewParticipant, 'findOne').mockImplementation(async ({ where }) => members.find((p) => p.user_id === where.user_id));
    jest.spyOn(models.InterviewParticipant, 'findAll').mockResolvedValue(members);

    const result = await lifecycle.saveEvaluation(1, 1, { id: 90, role: 'TRAINER' }, { scores: { criterion_1: 10 }, decision: 'SELECTED', isPublished: true });
    expect(session.status).toBe('EVALUATED');
    expect(result.isPublished).toBe(true);
  });
});

// ── Fix 3: runCode attempt ownership ──

describe('runCode attempt ownership', () => {
  test('rejects running code on another participant attempt with 403', async () => {
    jest.spyOn(models.CodingAttempt, 'findByPk').mockResolvedValue({ id: 44, participantId: 5, assessment: { id: 8 } });
    const res = response();
    await coding.runCode({ body: { attemptId: 44, code: 'x', language: 'javascript' }, user: { id: 9, role: 'PARTICIPANT' } }, res);
    expect(res.statusCode).toBe(403);
  });

  test('allows running code on an attempt owned by the caller', async () => {
    const engine = require('../src/judge/engine');
    jest.spyOn(models.CodingAttempt, 'findByPk').mockResolvedValue({ id: 44, participantId: 9, assessment: { id: 8, status: 'PUBLISHED' } });
    jest.spyOn(engine.JudgeEngine.prototype, 'runSampleTests').mockResolvedValue([{ verdict: 'ACCEPTED', actualOutput: '5' }]);
    const conceptValidator = require('../src/services/requiredConceptValidator');
    jest.spyOn(conceptValidator, 'checkRequiredConcepts').mockReturnValue([]);
    const res = response();
    await coding.runCode({ body: { attemptId: 44, code: 'print(2+3)', language: 'python', customInput: '' }, user: { id: 9, role: 'PARTICIPANT' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
  });
});

// ── Fix 4 + 5: startQuizAttempt hire gate and retakes ──

describe('startQuizAttempt hire gate and retakes', () => {
  const getStartHandler = () => {
    const router = require('../src/routes/quizzesRoutes');
    return router.stack.find((layer) => layer.route && layer.route.path === '/:quizId/start' && layer.route.methods.post).route.stack[0].handle;
  };
  const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

  test('Hire quiz start returns 403 when the participant has no hiring assignment', async () => {
    const handler = getStartHandler();
    const req = { params: { quizId: 101 }, user: { id: 42, role: 'PARTICIPANT' }, headers: {}, body: {} };
    const res = makeRes();
    const quiz = { id: 101, context: 'HIRE', status: 'PUBLISHED', toJSON: () => ({ id: 101, context: 'HIRE', status: 'PUBLISHED' }) };
    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(quiz);
    jest.spyOn(models.QuizAssignment, 'findOne').mockResolvedValue({ id: 1, status: 'PENDING' });
    const policy = require('../src/services/hireProctoringPolicy');
    jest.spyOn(policy, 'resolvePolicy').mockResolvedValue({ isHire: true, assigned: false, policy: null });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Hiring assessment assignment required.' }));
  });

  test('Hire quiz start proceeds for an assigned candidate', async () => {
    const { ProctoringSession, AssessmentSession } = models;
    const monitoringService = require('../src/services/monitoringService');
    const handler = getStartHandler();
    const req = { params: { quizId: 101 }, user: { id: 42, role: 'PARTICIPANT' }, headers: {}, body: {} };
    const res = makeRes();
    const quiz = { id: 101, context: 'HIRE', status: 'PUBLISHED', title: 'Screening', timeLimit: 30, proctoringEnabled: true, toJSON: () => ({ id: 101, context: 'HIRE', status: 'PUBLISHED', title: 'Screening', timeLimit: 30 }) };
    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(quiz);
    jest.spyOn(models.QuizAssignment, 'findOne').mockResolvedValue({ id: 1, status: 'PENDING' });
    const policy = require('../src/services/hireProctoringPolicy');
    jest.spyOn(policy, 'resolvePolicy').mockResolvedValue({ isHire: true, assigned: true, policy: null });
    jest.spyOn(models.QuizAttempt, 'findOne').mockResolvedValue(null);
    const mockAttempt = { id: 77, status: 'IN_PROGRESS', monitoringSessionId: 'psess_101_42' };
    jest.spyOn(models.QuizAttempt, 'create').mockResolvedValue(mockAttempt);
    jest.spyOn(ProctoringSession, 'create').mockResolvedValue({ id: 1 });
    jest.spyOn(AssessmentSession, 'findOne').mockResolvedValue(null);
    jest.spyOn(AssessmentSession, 'create').mockResolvedValue({ id: 9, sessionToken: 'tok_hire' });
    jest.spyOn(monitoringService, 'startSession').mockResolvedValue({ session: { sessionId: 'ms_hire_101' } });

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, attemptId: 77 }));
  });

  test('retake creates a fresh attempt when allowMultipleAttempts permits it', async () => {
    const { ProctoringSession, AssessmentSession } = models;
    const monitoringService = require('../src/services/monitoringService');
    const handler = getStartHandler();
    const req = { params: { quizId: 101 }, user: { id: 42, role: 'PARTICIPANT' }, headers: {}, body: {} };
    const res = makeRes();
    const quiz = { id: 101, status: 'PUBLISHED', title: 'Reusable', timeLimit: 20, proctoringEnabled: false, allowMultipleAttempts: true, maxAttempts: 2, toJSON: () => ({ id: 101 }) };
    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(quiz);
    jest.spyOn(models.QuizAssignment, 'findOne').mockResolvedValue({ id: 1, status: 'COMPLETED' });
    jest.spyOn(models.QuizAttempt, 'findOne').mockResolvedValue({ id: 10, status: 'COMPLETED' });
    jest.spyOn(models.QuizAttempt, 'count').mockResolvedValue(1);
    const mockAttempt = { id: 88, status: 'IN_PROGRESS', monitoringSessionId: 'psess_101_42_2' };
    jest.spyOn(models.QuizAttempt, 'create').mockResolvedValue(mockAttempt);
    jest.spyOn(ProctoringSession, 'create').mockResolvedValue({ id: 2 });
    jest.spyOn(AssessmentSession, 'findOne').mockResolvedValue(null);
    jest.spyOn(AssessmentSession, 'create').mockResolvedValue({ id: 10, sessionToken: 'tok_retake' });
    jest.spyOn(monitoringService, 'startSession').mockResolvedValue({ session: { sessionId: 'ms_retake_101' } });

    await handler(req, res);

    expect(models.QuizAttempt.count).toHaveBeenCalled();
    expect(models.QuizAttempt.create).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, attemptId: 88 }));
  });

  test('retake blocked when maxAttempts reached', async () => {
    const handler = getStartHandler();
    const req = { params: { quizId: 101 }, user: { id: 42, role: 'PARTICIPANT' }, headers: {}, body: {} };
    const res = makeRes();
    const quiz = { id: 101, status: 'PUBLISHED', allowMultipleAttempts: true, maxAttempts: 1, toJSON: () => ({ id: 101 }) };
    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(quiz);
    jest.spyOn(models.QuizAssignment, 'findOne').mockResolvedValue({ id: 1, status: 'COMPLETED' });
    jest.spyOn(models.QuizAttempt, 'findOne').mockResolvedValue({ id: 10, status: 'COMPLETED' });
    jest.spyOn(models.QuizAttempt, 'count').mockResolvedValue(1);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'You have already attempted this quiz.' }));
  });

  test('resume still targets the latest in-progress attempt', async () => {
    const { ProctoringSession, AssessmentSession } = models;
    const monitoringService = require('../src/services/monitoringService');
    const handler = getStartHandler();
    const req = { params: { quizId: 101 }, user: { id: 42, role: 'PARTICIPANT' }, headers: {}, body: {} };
    const res = makeRes();
    const quiz = { id: 101, status: 'PUBLISHED', title: 'Go', timeLimit: 30, proctoringEnabled: true, toJSON: () => ({ id: 101 }) };
    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(quiz);
    jest.spyOn(models.QuizAssignment, 'findOne').mockResolvedValue({ id: 1, status: 'PENDING' });
    const attempt = { id: 20, status: 'IN_PROGRESS', monitoringSessionId: 'psess_101_42', update: jest.fn().mockResolvedValue(true) };
    jest.spyOn(models.QuizAttempt, 'create').mockImplementation(async () => { throw new Error('must not create on resume'); });
    jest.spyOn(models.QuizAttempt, 'findOne').mockResolvedValue(attempt);
    jest.spyOn(AssessmentSession, 'findOne').mockResolvedValue({ id: 5, status: 'ACTIVE', update: jest.fn().mockResolvedValue(true) });
    jest.spyOn(ProctoringSession, 'findOrCreate').mockResolvedValue([{ sessionId: 'psess_101_42', status: 'ACTIVE', update: jest.fn().mockResolvedValue(true) }, false]);
    jest.spyOn(monitoringService, 'startSession').mockResolvedValue({ session: { sessionId: 'ms_go_101' } });

    await handler(req, res);

    expect(models.QuizAttempt.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, attemptId: 20, isResumed: true }));
  });
});

// ── Fix 6: ensureQuiz and ensureCoding idempotency and duplicate prevention ──

describe('ensureQuiz and ensureCoding idempotency', () => {
  const hiring = require('../src/controllers/hiringController');

  beforeEach(() => {
    jest.spyOn(models.HiringCandidate, 'count').mockResolvedValue(0);
    jest.spyOn(models.AIQuestion, 'count').mockResolvedValue(0);
    jest.spyOn(models.CodingProblem, 'count').mockResolvedValue(0);
    jest.spyOn(models.QuizAttempt, 'count').mockResolvedValue(0);
    if (models.CodingAttempt) jest.spyOn(models.CodingAttempt, 'count').mockResolvedValue(0);
    if (models.HiringAssignment) jest.spyOn(models.HiringAssignment, 'findAll').mockResolvedValue([]);
    if (models.QuizAttempt) jest.spyOn(models.QuizAttempt, 'findAll').mockResolvedValue([]);
    if (models.CodingAttempt) jest.spyOn(models.CodingAttempt, 'findAll').mockResolvedValue([]);
  });

  test('ensureQuiz creates quiz when none exists and links to hire assessment', async () => {
    const res = response();
    const assessment = row({
      id: 50,
      title: 'Fullstack Dev Assessment',
      assessment_type: 'QUIZ',
      quiz_id: null,
      update: jest.fn().mockResolvedValue(true),
    });
    const createdQuiz = { id: 700, title: 'Fullstack Dev Assessment', context: 'HIRE' };

    jest.spyOn(models.sequelize, 'transaction').mockImplementation(async (callback) => callback({}));
    jest.spyOn(models.HiringAssessment, 'findByPk').mockResolvedValue(assessment);
    jest.spyOn(models.AIQuiz, 'create').mockResolvedValue(createdQuiz);

    await hiring.ensureQuiz({ params: { id: 50 }, user: { id: 1, role: 'ADMIN' } }, res);

    expect(models.AIQuiz.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fullstack Dev Assessment',
        context: 'HIRE',
      }),
      expect.anything()
    );
    expect(assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({ quiz_id: 700 }),
      expect.anything()
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, created: true }));
  });

  test('ensureQuiz reuses existing quiz and prevents duplicate creation', async () => {
    const res = response();
    const existingQuiz = { id: 700, title: 'Existing Quiz', context: 'HIRE' };
    const assessment = row({
      id: 50,
      title: 'Fullstack Dev Assessment',
      assessment_type: 'QUIZ',
      quiz_id: 700,
      update: jest.fn(),
    });

    jest.spyOn(models.sequelize, 'transaction').mockImplementation(async (callback) => callback({}));
    jest.spyOn(models.HiringAssessment, 'findByPk').mockResolvedValue(assessment);
    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(existingQuiz);
    jest.spyOn(models.AIQuiz, 'create').mockImplementation(() => { throw new Error('Must not create duplicate'); });

    await hiring.ensureQuiz({ params: { id: 50 }, user: { id: 1, role: 'ADMIN' } }, res);

    expect(models.AIQuiz.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, created: false, quiz: existingQuiz }));
  });

  test('ensureCoding creates coding assessment when none exists and links to hire assessment', async () => {
    const res = response();
    const assessment = row({
      id: 60,
      title: 'Algorithms Screening',
      assessment_type: 'CODING',
      coding_assessment_id: null,
      update: jest.fn().mockResolvedValue(true),
    });
    const createdCoding = { id: 800, title: 'Algorithms Screening', context: 'HIRE' };

    jest.spyOn(models.sequelize, 'transaction').mockImplementation(async (callback) => callback({}));
    jest.spyOn(models.HiringAssessment, 'findByPk').mockResolvedValue(assessment);
    jest.spyOn(models.CodingAssessment, 'create').mockResolvedValue(createdCoding);

    await hiring.ensureCoding({ params: { id: 60 }, user: { id: 1, role: 'ADMIN' } }, res);

    expect(models.CodingAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Algorithms Screening',
        context: 'HIRE',
      }),
      expect.anything()
    );
    expect(assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({ coding_assessment_id: 800 }),
      expect.anything()
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, created: true }));
  });

  test('ensureCoding reuses existing coding assessment and prevents duplicate creation', async () => {
    const res = response();
    const existingCoding = { id: 800, title: 'Existing Coding Assessment', context: 'HIRE' };
    const assessment = row({
      id: 60,
      title: 'Algorithms Screening',
      assessment_type: 'CODING',
      coding_assessment_id: 800,
      update: jest.fn(),
    });

    jest.spyOn(models.sequelize, 'transaction').mockImplementation(async (callback) => callback({}));
    jest.spyOn(models.HiringAssessment, 'findByPk').mockResolvedValue(assessment);
    jest.spyOn(models.CodingAssessment, 'findByPk').mockResolvedValue(existingCoding);
    jest.spyOn(models.CodingAssessment, 'create').mockImplementation(() => { throw new Error('Must not create duplicate'); });

    await hiring.ensureCoding({ params: { id: 60 }, user: { id: 1, role: 'ADMIN' } }, res);

    expect(models.CodingAssessment.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, created: false, codingAssessment: existingCoding }));
  });
});

// ── Fix 7: getQuizResult hire handling and immediate score release ──

describe('getQuizResult hire context and publication', () => {
  const participantController = require('../src/controllers/participantCourseController');

  test('getQuizResult loads hire assessment quiz results with showResultImmediately', async () => {
    const res = response();
    const hireQuiz = {
      id: 3,
      context: 'HIRE',
      status: 'PUBLISHED',
      resultStatus: 'HIDDEN',
      showResultImmediately: true,
      title: 'Quiz 2.0',
      totalMarks: 10,
    };
    const attempt = {
      id: 1,
      quizId: 3,
      participantId: 438,
      status: 'SUBMITTED',
      startedAt: new Date(),
      submittedAt: new Date(),
    };
    const quizResult = {
      id: 1,
      attemptId: 1,
      quizId: 3,
      participantId: 438,
      percentage: 80,
      totalScore: 8,
      maxScore: 10,
    };

    jest.spyOn(models.AIQuiz, 'findByPk').mockResolvedValue(hireQuiz);
    jest.spyOn(models.QuizAttempt, 'findOne').mockResolvedValue(attempt);
    jest.spyOn(models.QuizAttempt, 'count').mockResolvedValue(1);
    jest.spyOn(models.QuizResult, 'findOne').mockResolvedValue(quizResult);
    jest.spyOn(models.AIQuestion, 'findAll').mockResolvedValue([]);
    jest.spyOn(models.QuizAnswer, 'findAll').mockResolvedValue([]);
    jest.spyOn(models.User, 'findByPk').mockResolvedValue({ id: 438, name: 'Learner One' });

    await participantController.getQuizResult(
      { params: { quizId: 3 }, query: { attemptId: 1 }, user: { id: 438, role: 'PARTICIPANT' } },
      res
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: 'PUBLISHED',
        resultStatus: 'PUBLISHED',
        percentage: 80,
        quizTitle: 'Quiz 2.0',
      })
    );
  });
});