const proctoringController = require('../src/controllers/hireProctoringController');
const proctoringService = require('../src/services/hireProctoringService');
const monitoringService = require('../src/services/monitoringService');
const policyService = require('../src/services/hireProctoringPolicy');
const axios = require('axios');

jest.mock('axios');
jest.mock('../src/services/monitoringService');
jest.mock('../src/services/hireProctoringPolicy');

describe('Hire Proctoring Service - Differentiated Errors & Status Checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupMockSession = (sessionOverrides = {}, policyOverrides = {}) => {
    const fakeSession = {
      id: 'session-123',
      participantId: 10,
      contextType: 'QUIZ',
      contextId: 1,
      status: 'READY',
      metadata: {},
      update: jest.fn().mockResolvedValue(true),
      ...sessionOverrides,
    };

    monitoringService.getSession.mockResolvedValue(fakeSession);
    policyService.resolvePolicy.mockResolvedValue({
      isHire: true,
      assigned: true,
      policy: {
        enabled: true,
        identityVerification: true,
        livenessDetection: true,
        evidenceCapture: false,
        ...policyOverrides,
      },
    });

    return fakeSession;
  };

  test('getChallenge allows ACTIVE session if identity is not verified yet', async () => {
    const fakeSession = setupMockSession({ status: 'ACTIVE' });

    const req = {
      params: { sessionId: 'session-123' },
      user: { id: 10, role: 'PARTICIPANT' },
    };

    let statusCode = 200;
    let jsonBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
    };

    await proctoringController.getChallenge(req, res);

    expect(statusCode).toBe(200);
    expect(jsonBody).toHaveProperty('challenge');
    expect(fakeSession.update).toHaveBeenCalled();
  });

  test('getChallenge rejects session with 409 if identity is already verified', async () => {
    setupMockSession({
      status: 'ACTIVE',
      metadata: {
        hireProctoring: {
          identityVerifiedAt: '2026-09-15T10:00:00.000Z',
        },
      },
    });

    const req = {
      params: { sessionId: 'session-123' },
      user: { id: 10, role: 'PARTICIPANT' },
    };

    let statusCode = 200;
    let jsonBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
    };

    await proctoringController.getChallenge(req, res);

    expect(statusCode).toBe(409);
    expect(jsonBody.error).toMatch(/already.*verified/i);
  });

  test('storeIdentityReference distinguishes 503 service unavailable from liveness failure', async () => {
    setupMockSession({ id: 'session-456' });

    // Simulate Python AI service offline (ECONNREFUSED)
    const netErr = new Error('connect ECONNREFUSED 127.0.0.1:8000');
    netErr.code = 'ECONNREFUSED';
    axios.post.mockRejectedValueOnce(netErr);

    await expect(
      proctoringService.storeIdentityReference({
        sessionId: 'session-456',
        user: { id: 10, role: 'PARTICIPANT' },
        frames: ['data:image/jpeg;base64,frame1', 'data:image/jpeg;base64,frame2'],
        challenge: 'TURN_LEFT',
      })
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/temporarily unavailable/i),
    });
  });

  test('storeIdentityReference returns 422 with clear message when movement is not detected', async () => {
    setupMockSession({ id: 'session-456' });

    // Simulate Python service responding with success: false
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { success: false, livenessPassed: false, message: 'Liveness movement was not detected. Please follow the movement instruction.' },
    });

    await expect(
      proctoringService.storeIdentityReference({
        sessionId: 'session-456',
        user: { id: 10, role: 'PARTICIPANT' },
        frames: ['data:image/jpeg;base64,frame1', 'data:image/jpeg;base64,frame2'],
        challenge: 'TURN_LEFT',
      })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/movement was not detected/i),
    });
  });

  test('storeIdentityReference allows ACTIVE session if identity is not yet locked', async () => {
    const fakeSession = setupMockSession({ id: 'session-789', status: 'ACTIVE' });

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { success: true, livenessPassed: true, signature: 'test_sig', challenge: 'TURN_LEFT' },
    });

    const result = await proctoringService.storeIdentityReference({
      sessionId: 'session-789',
      user: { id: 10, role: 'PARTICIPANT' },
      frames: ['data:image/jpeg;base64,frame1'],
      challenge: 'TURN_LEFT',
    });

    expect(result.verified).toBe(true);
    expect(result.livenessPassed).toBe(true);
    expect(fakeSession.update).toHaveBeenCalled();
  });
});
