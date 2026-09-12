const axios = require('axios');
const models = require('../src/models');
const monitoringService = require('../src/services/monitoringService');
const policyService = require('../src/services/hireProctoringPolicy');
const hireProctoringService = require('../src/services/hireProctoringService');
const verificationService = require('../src/services/assessmentVerificationService');

const row = data => ({
  ...data,
  update: jest.fn(async function update(patch) { Object.assign(this, patch); return this; }),
});

afterEach(() => jest.restoreAllMocks());

describe('Hire-only proctoring policy', () => {
  test('normalizes every control and clamps cost-sensitive limits', () => {
    expect(policyService.normalizePolicy({
      enabled: false,
      identityVerification: false,
      voiceRate: 9,
      voiceVolume: -2,
      identityCheckIntervalSeconds: 1,
      roomScanMinFrames: 99,
      defaultLanguage: 'unsupported',
      evidenceMode: 'NONE',
    })).toMatchObject({
      enabled: false,
      identityVerification: false,
      voiceRate: 1.4,
      voiceVolume: 0,
      identityCheckIntervalSeconds: 15,
      roomScanMinFrames: 12,
      defaultLanguage: 'en-IN',
      evidenceMode: 'NONE',
    });
  });

  test('leaves Course/Training engines outside the Hire policy', async () => {
    jest.spyOn(models.HiringAssessment, 'findOne').mockResolvedValue(null);
    const assignment = jest.spyOn(models.HiringAssignment, 'findOne');
    await expect(policyService.resolvePolicy('QUIZ', 44, 8)).resolves.toMatchObject({ isHire: false, policy: null, assigned: false });
    expect(assignment).not.toHaveBeenCalled();
  });

  test('requires a canonical Hire assignment', async () => {
    jest.spyOn(models.HiringAssessment, 'findOne').mockResolvedValue(row({ id: 7, proctoring_config: { defaultLanguage: 'ta-IN' } }));
    const assignment = jest.spyOn(models.HiringAssignment, 'findOne').mockResolvedValue(null);
    await expect(policyService.resolvePolicy('QUIZ', 44, 8)).resolves.toMatchObject({ isHire: true, assigned: false, policy: { defaultLanguage: 'ta-IN' } });
    assignment.mockResolvedValue({ id: 9 });
    await expect(policyService.resolvePolicy('QUIZ', 44, 8)).resolves.toMatchObject({ isHire: true, assigned: true });
  });
});

describe('Hire identity and room evidence controls', () => {
  const participant = { id: 8, role: 'PARTICIPANT' };
  const policy = policyService.normalizePolicy({ evidenceCapture: false, identityCheckIntervalSeconds: 30 });

  function ownedSession(status = 'ACTIVE') {
    return row({
      sessionId: 'ms_hire_1', participantId: participant.id, contextType: 'QUIZ', contextId: 44,
      status,
      metadata: { hireProctoring: { identitySignature: Array(24).fill(0.1), policy } },
    });
  }

  function mockOwnership(session) {
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(session);
    jest.spyOn(policyService, 'resolvePolicy').mockResolvedValue({ isHire: true, assigned: true, workflow: { id: 7 }, policy });
  }

  test('requires two consecutive identity mismatches before recording evidence', async () => {
    const session = ownedSession('ACTIVE');
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { matched: false, similarity: 0.2, confidence: 0.9 } });
    const report = jest.spyOn(monitoringService, 'reportEvent').mockResolvedValue({});

    const first = await hireProctoringService.verifyIdentity({ sessionId: session.sessionId, user: participant, frame: 'data:image/jpeg;base64,QQ==' });
    expect(first).toMatchObject({ matched: false, consecutiveFailures: 1 });
    expect(report).not.toHaveBeenCalled();

    const second = await hireProctoringService.verifyIdentity({ sessionId: session.sessionId, user: participant, frame: 'data:image/jpeg;base64,Qg==' });
    expect(second).toMatchObject({ matched: false, consecutiveFailures: 2 });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'IDENTITY_MISMATCH', severity: 'CRITICAL', participantId: participant.id }));
  });

  test('resets the mismatch sequence when the reference identity returns', async () => {
    const session = ownedSession('ACTIVE');
    session.metadata.hireProctoring.consecutiveIdentityFailures = 1;
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { matched: true, similarity: 0.92, confidence: 0.92 } });
    const result = await hireProctoringService.verifyIdentity({ sessionId: session.sessionId, user: participant, frame: 'data:image/jpeg;base64,QQ==' });
    expect(result.consecutiveFailures).toBe(0);
    expect(session.metadata.hireProctoring.consecutiveIdentityFailures).toBe(0);
  });

  test('rejects a repeated image masquerading as a multi-angle room scan', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    await expect(hireProctoringService.inspectRoom({
      sessionId: session.sessionId,
      user: participant,
      frames: Array(policy.roomScanMinFrames).fill('data:image/jpeg;base64,QQ=='),
    })).rejects.toMatchObject({ status: 422, message: 'Capture a different view for every room-scan angle' });
  });

  test('allows the primary laptop but flags a phone through the shared detector', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockImplementation(async (_url, payload) => ({ data: {
      success: true,
      detections: payload.frame.endsWith('Rg==')
        ? [{ class_name: 'cell phone', confidence: 0.91 }]
        : [{ class_name: 'laptop', confidence: 0.99 }],
    } }));
    const report = jest.spyOn(monitoringService, 'reportEvent').mockResolvedValue({});
    const frames = ['QQ==', 'Qg==', 'Qw==', 'RA==', 'RQ==', 'Rg=='].map(value => `data:image/jpeg;base64,${value}`);
    const result = await hireProctoringService.inspectRoom({ sessionId: session.sessionId, user: participant, frames });
    expect(result).toMatchObject({ clear: false, detectedObjects: ['cell phone'], framesAnalyzed: 6 });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ROOM_SCAN_OBJECT_DETECTED', source: 'MOBILE' }));
  });
});

describe('shared assessment admission gate', () => {
  test('preserves the original Course/Training mobile admission rule', async () => {
    jest.spyOn(models.MonitoringSession, 'findOne').mockResolvedValue(row({ contextId: 44, mobileEnabled: true, metadata: {} }));
    jest.spyOn(policyService, 'resolvePolicy').mockResolvedValue({ isHire: false });
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'QUIZ', attemptId: 3 }))
      .rejects.toThrow('Complete mobile person and laptop verification');
  });

  test('allows an administrator-disabled Hire policy without changing Training behavior', async () => {
    const monitor = row({ contextId: 44, mobileEnabled: false, metadata: { hireProctoring: {} } });
    jest.spyOn(models.MonitoringSession, 'findOne').mockResolvedValue(monitor);
    jest.spyOn(policyService, 'resolvePolicy').mockResolvedValue({ isHire: true, assigned: true, policy: policyService.normalizePolicy({ enabled: false }) });
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'QUIZ', attemptId: 3 })).resolves.toBe(monitor);
  });

  test('requires Hire identity and room state through the same gate used by quiz and coding', async () => {
    const monitor = row({ contextId: 44, mobileEnabled: true, metadata: { hireProctoring: {} } });
    jest.spyOn(models.MonitoringSession, 'findOne').mockResolvedValue(monitor);
    jest.spyOn(policyService, 'resolvePolicy').mockResolvedValue({ isHire: true, assigned: true, policy: policyService.normalizePolicy({}) });
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'CODING', attemptId: 3 }))
      .rejects.toThrow('identity and liveness');
    monitor.metadata.hireProctoring.identityVerifiedAt = new Date().toISOString();
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'CODING', attemptId: 3 }))
      .rejects.toThrow('360° room scan');
    monitor.metadata.hireProctoring.roomScanCompletedAt = new Date().toISOString();
    monitor.metadata.hireProctoring.roomScanClear = true;
    monitor.metadata.mobileAdmission = { admittedAt: new Date().toISOString() };
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'CODING', attemptId: 3 })).resolves.toBe(monitor);
  });
});
