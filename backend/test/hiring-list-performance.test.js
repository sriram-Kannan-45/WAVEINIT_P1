const mockFindAndCountAll = jest.fn();
const grouped = () => ({ findAll: jest.fn().mockResolvedValue([]) });
const mockHiringCandidate = grouped();
const mockHiringAssignment = grouped();
const mockQuizAttempt = grouped();
const mockCodingAttempt = grouped();
const mockAIQuestion = grouped();
const mockCodingProblem = grouped();

jest.mock('../src/models', () => ({
  HiringAssessment: { findAndCountAll: mockFindAndCountAll },
  HiringCandidate: mockHiringCandidate,
  HiringAssignment: mockHiringAssignment,
  AIQuiz: {},
  AIQuestion: mockAIQuestion,
  QuizAttempt: mockQuizAttempt,
  QuizResult: {},
  CodingAssessment: {},
  CodingProblem: mockCodingProblem,
  CodingTestCase: {},
  CodingAttempt: mockCodingAttempt,
  CodingResult: {},
  User: {},
  sequelize: {
    col: jest.fn((value) => ({ col: value })),
    fn: jest.fn((name, value) => ({ fn: name, value })),
  },
}));
jest.mock('../src/services/hiringService', () => ({}));
jest.mock('../src/utils/logger', () => ({ error: jest.fn() }));
jest.mock('../src/services/hireProctoringPolicy', () => ({ normalizePolicy: (value) => value }));

const { listAssessments } = require('../src/controllers/hiringController');

function workflow(id, type, quizId, codingId) {
  const value = {
    id,
    title: `Assessment ${id}`,
    assessment_type: type,
    quiz_id: quizId,
    coding_assessment_id: codingId,
    quiz: quizId ? { id: quizId, title: `Quiz ${id}`, status: 'PUBLISHED' } : null,
    codingAssessment: codingId ? { id: codingId, title: `Coding ${id}`, status: 'PUBLISHED' } : null,
  };
  return { ...value, toJSON: () => value };
}

describe('Hire assessment list performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindAndCountAll.mockResolvedValue({
      rows: [workflow(1, 'QUIZ', 11, null), workflow(2, 'CODING', null, 22)],
      count: 2,
    });
    mockHiringCandidate.findAll.mockResolvedValue([
      { entityId: 1, status: 'REGISTERED', count: '2' },
      { entityId: 1, status: 'PENDING', count: '1' },
    ]);
    mockHiringAssignment.findAll.mockResolvedValue([{ entityId: 1, count: '3' }]);
    mockQuizAttempt.findAll.mockResolvedValue([{ entityId: 11, status: 'IN_PROGRESS', count: '1' }]);
    mockCodingAttempt.findAll.mockResolvedValue([{ entityId: 22, status: 'SUBMITTED', count: '2' }]);
    mockAIQuestion.findAll.mockResolvedValue([{ entityId: 11, count: '5' }]);
    mockCodingProblem.findAll.mockResolvedValue([{ entityId: 22, count: '4' }]);
  });

  test('loads metrics with a fixed number of grouped queries', async () => {
    const req = { query: { limit: '100' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    await listAssessments(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.assessments).toHaveLength(2);
    expect(body.assessments[0]).toEqual(expect.objectContaining({
      candidate_count: 3,
      registered_count: 2,
      pending_candidates: 1,
      assigned_count: 3,
      in_progress_count: 1,
      content_count: 5,
    }));
    expect(body.assessments[1]).toEqual(expect.objectContaining({
      completed_count: 2,
      content_count: 4,
    }));
    for (const model of [mockHiringCandidate, mockHiringAssignment, mockQuizAttempt, mockCodingAttempt, mockAIQuestion, mockCodingProblem]) {
      expect(model.findAll).toHaveBeenCalledTimes(1);
    }
  });
});
