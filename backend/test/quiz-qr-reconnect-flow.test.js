jest.mock('../src/models', () => Object.fromEntries([
  'AssessmentVerificationSession', 'MonitoringSession', 'MonitoringEvent', 'MonitoringConfig', 'ProctoringEvent',
  'QuizAttempt', 'CodingAttempt', 'AIQuiz', 'CodingAssessment', 'User',
  'ExamSession', 'Violation', 'DeviceFingerprint', 'ProctorActivity',
].map(name => [name, Object.fromEntries(['findAll', 'findAndCountAll', 'findOne', 'findByPk', 'findOrCreate', 'count', 'create', 'update'].map(method => [method, jest.fn()]))])));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/socket/crossInstance', () => ({ emitToRoom: jest.fn(), relayEmit: jest.fn() }));
jest.mock('../src/services/aiQuizService', () => ({}));
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../src/config/socket', () => ({
  getIO: () => ({
    to: () => ({ emit: jest.fn() }),
  }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-ci';

const { Op } = require('sequelize');
const models = require('../src/models');
models.sequelize = { literal: require('sequelize').literal, transaction: jest.fn(callback => callback({ LOCK: { UPDATE: 'UPDATE' } })) };
const verification = require('../src/services/assessmentVerificationService');
const monitoring = require('../src/services/monitoringService');

describe('Quiz Monitoring QR Code Visibility and Reconnection Flow', () => {
  let mockAttempts, mockMonitors, mockVerifSessions;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    mockAttempts = [];
    mockMonitors = [];
    mockVerifSessions = [];

    models.QuizAttempt.findOne.mockImplementation(async ({ where }) => {
      return mockAttempts.find(a => Object.entries(where).every(([k, v]) => a[k] === v)) || null;
    });
    models.QuizAttempt.findByPk.mockImplementation(async (id) => {
      return mockAttempts.find(a => a.id === Number(id)) || null;
    });
    models.QuizAttempt.create.mockImplementation(async (data) => {
      const created = { id: mockAttempts.length + 1, ...data, update: jest.fn(async (v) => Object.assign(created, v)) };
      mockAttempts.push(created);
      return created;
    });

    models.MonitoringSession.findOne.mockImplementation(async ({ where }) => {
      return mockMonitors.find(m => Object.entries(where).every(([k, v]) => {
        if (v && typeof v === 'object' && v[Op.in]) return v[Op.in].includes(m[k]);
        return m[k] === v;
      })) || null;
    });
    models.MonitoringSession.create.mockImplementation(async (data) => {
      const created = { id: mockMonitors.length + 1, ...data, update: jest.fn(async (v) => Object.assign(created, v)), reload: jest.fn() };
      mockMonitors.push(created);
      return created;
    });

    models.AssessmentVerificationSession.findOne.mockImplementation(async ({ where }) => {
      return mockVerifSessions.find(s => Object.entries(where).every(([k, v]) => {
        if (v && typeof v === 'object' && v[Op.in]) return v[Op.in].includes(s[k]);
        return s[k] === v;
      })) || null;
    });
    models.AssessmentVerificationSession.findAll.mockImplementation(async ({ where }) => {
      return mockVerifSessions.filter(s => Object.entries(where).every(([k, v]) => s[k] === v));
    });
    models.AssessmentVerificationSession.create.mockImplementation(async (data) => {
      const created = { id: mockVerifSessions.length + 1, ...data, update: jest.fn(async (v) => Object.assign(created, v)) };
      mockVerifSessions.push(created);
      return created;
    });
    models.AIQuiz.findByPk.mockResolvedValue({ id: 101, title: 'Sample Quiz' });
  });

  // Scenario A: Start a new quiz → QR appears
  test('Scenario A: Starting a quiz attempt generates a valid QR code session', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'IN_PROGRESS',
    });
    const monitor = await models.MonitoringSession.create({
      sessionId: 'ms_quiz_test_1',
      participantId: 5,
      contextType: 'QUIZ',
      contextId: 101,
      attemptId: attempt.id,
      status: 'ACTIVE',
      metadata: {},
    });

    const reconnectData = await verification.getReconnectQr({
      attemptId: attempt.id,
      assessmentType: 'QUIZ',
      assessmentId: 101,
      participantId: 5,
    });

    expect(reconnectData).toBeDefined();
    expect(reconnectData.sessionId).toMatch(/^verif_quiz_101_att_1_/);
    expect(reconnectData.qrPayload).toBeDefined();
    expect(reconnectData.qrPayload.shortUrl).toContain('/assessment/mobile-join/');
    expect(reconnectData.status).toBe('USED');
  });

  // Scenario B: Leave the quiz accidentally → return to the same attempt → existing QR/session is restored
  test('Scenario B: Leaving and returning to the same active attempt restores the existing QR session', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'IN_PROGRESS',
    });
    const verif = await models.AssessmentVerificationSession.create({
      session_id: 'verif_existing_123',
      participant_id: 5,
      assessment_id: 101,
      assessment_type: 'QUIZ',
      attempt_id: attempt.id,
      token: 'tok_abc_123',
      status: 'USED',
      expires_at: new Date(Date.now() + 600000),
    });
    const monitor = await models.MonitoringSession.create({
      sessionId: 'ms_quiz_active_1',
      participantId: 5,
      contextType: 'QUIZ',
      contextId: 101,
      attemptId: attempt.id,
      status: 'ACTIVE',
      metadata: { mobileAdmission: { verificationSessionId: verif.session_id } },
    });

    const restored = await verification.getReconnectQr({
      sessionId: verif.session_id,
      participantId: 5,
    });

    expect(restored.sessionId).toBe(verif.session_id);
    expect(restored.qrPayload.token).toBe('tok_abc_123');
    expect(restored.qrPayload.shortUrl).toContain('tok_abc_123');
    // Ensure no new verification sessions were spawned
    expect(mockVerifSessions.length).toBe(1);
  });

  // Scenario C: Refresh the quiz page → QR appears again (retrieved by attemptId or monitoring sessionId)
  test('Scenario C: Refreshing the page retrieves QR by attemptId and recovers monitoring session', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'IN_PROGRESS',
    });
    const verif = await models.AssessmentVerificationSession.create({
      session_id: 'verif_refresh_456',
      participant_id: 5,
      assessment_id: 101,
      assessment_type: 'QUIZ',
      attempt_id: attempt.id,
      token: 'tok_refresh_456',
      status: 'USED',
      expires_at: new Date(Date.now() + 600000),
    });
    await models.MonitoringSession.create({
      sessionId: 'ms_quiz_refresh_1',
      participantId: 5,
      contextType: 'QUIZ',
      contextId: 101,
      attemptId: attempt.id,
      status: 'ACTIVE',
      metadata: { mobileAdmission: { verificationSessionId: verif.session_id } },
    });

    // Frontend calls reconnect with attemptId and contextType after page reload
    const refreshed = await verification.getReconnectQr({
      attemptId: attempt.id,
      assessmentType: 'QUIZ',
      assessmentId: 101,
      participantId: 5,
    });

    expect(refreshed.sessionId).toBe('verif_refresh_456');
    expect(refreshed.qrPayload.token).toBe('tok_refresh_456');
  });

  // Scenario D: QR expires → new QR is generated and displayed automatically
  test('Scenario D: Expired or unlinked session automatically creates a fresh valid session and updates admission', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'IN_PROGRESS',
    });
    const monitor = await models.MonitoringSession.create({
      sessionId: 'ms_quiz_expired_mon',
      participantId: 5,
      contextType: 'QUIZ',
      contextId: 101,
      attemptId: attempt.id,
      status: 'ACTIVE',
      metadata: {},
    });

    // Pass an unknown or expired session ID
    const renewed = await verification.getReconnectQr({
      sessionId: 'verif_old_expired_session',
      attemptId: attempt.id,
      assessmentType: 'QUIZ',
      assessmentId: 101,
      participantId: 5,
    });

    expect(renewed).toBeDefined();
    expect(renewed.sessionId).toMatch(/^verif_quiz_101_att_1_/);
    expect(renewed.status).toBe('USED');
    expect(renewed.qrPayload.token).toBeDefined();
    // Verify monitor was linked to the newly generated session
    expect(monitor.metadata?.mobileAdmission?.verificationSessionId).toBe(renewed.sessionId);
  });

  // Scenario E: Mobile camera connects → QR changes to connected state / validation succeeds
  test('Scenario E: Mobile camera validates reconnect pairing token with isAssessmentStarted: true', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'IN_PROGRESS',
    });
    const verif = await models.AssessmentVerificationSession.create({
      session_id: 'verif_mobile_test',
      participant_id: 5,
      assessment_id: 101,
      assessment_type: 'QUIZ',
      attempt_id: attempt.id,
      token: 'tok_mobile_connect',
      status: 'USED',
      expires_at: new Date(Date.now() + 600000),
    });
    await models.MonitoringSession.create({
      sessionId: 'ms_quiz_mobile_mon',
      participantId: 5,
      contextType: 'QUIZ',
      contextId: 101,
      attemptId: attempt.id,
      status: 'ACTIVE',
      metadata: { mobileAdmission: { verificationSessionId: verif.session_id } },
    });

    const validationResult = await verification.validatePairingToken('tok_mobile_connect');
    expect(validationResult.success).toBe(true);
    expect(validationResult.sessionId).toBe(verif.session_id);
    expect(validationResult.isAssessmentStarted).toBe(true);
    expect(validationResult.socketToken).toBeDefined();
  });

  // Scenario F: Leave and return multiple times → no duplicate attempts or duplicate monitoring sessions
  test('Scenario F: Multiple reconnect calls reuse active sessions without creating duplicates', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'IN_PROGRESS',
    });
    const verif = await models.AssessmentVerificationSession.create({
      session_id: 'verif_idempotent_1',
      participant_id: 5,
      assessment_id: 101,
      assessment_type: 'QUIZ',
      attempt_id: attempt.id,
      token: 'tok_idempotent',
      status: 'USED',
      expires_at: new Date(Date.now() + 600000),
    });
    await models.MonitoringSession.create({
      sessionId: 'ms_quiz_idempotent',
      participantId: 5,
      contextType: 'QUIZ',
      contextId: 101,
      attemptId: attempt.id,
      status: 'ACTIVE',
      metadata: { mobileAdmission: { verificationSessionId: verif.session_id } },
    });

    for (let i = 0; i < 5; i++) {
      const res = await verification.getReconnectQr({
        sessionId: verif.session_id,
        participantId: 5,
        attemptId: attempt.id,
      });
      expect(res.sessionId).toBe(verif.session_id);
    }

    expect(mockAttempts.length).toBe(1);
    expect(mockMonitors.length).toBe(1);
    expect(mockVerifSessions.length).toBe(1);
  });

  // Scenario G: Submit/end quiz → monitoring session is properly closed
  test('Scenario G: Ending the verification session properly closes sessions and notifies peers', async () => {
    const attempt = await models.QuizAttempt.create({
      quizId: 101,
      participantId: 5,
      status: 'COMPLETED',
    });
    const verif = await models.AssessmentVerificationSession.create({
      session_id: 'verif_end_test',
      participant_id: 5,
      assessment_id: 101,
      assessment_type: 'QUIZ',
      attempt_id: attempt.id,
      token: 'tok_end_test',
      status: 'USED',
      expires_at: new Date(Date.now() + 600000),
    });

    const endResult = await verification.endSession({
      sessionId: verif.session_id,
      participantId: 5,
    });

    expect(endResult.success).toBe(true);
    expect(verif.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'EXPIRED' }));
  });
});
