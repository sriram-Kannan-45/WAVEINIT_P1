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

  test('advances liveness once per detected movement and locks identity only after center', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = { policy };
    mockOwnership(session);
    const movements = ['LEFT', 'RIGHT', 'CENTER'];
    const ai = jest.spyOn(axios, 'post').mockImplementation(async (_url, payload) => ({ data: {
      success: true, challengeCompleted: true, detectedMovement: movements.shift(),
      neutralYaw: 0.01, poseYaw: 0.12, signature: Array(64).fill(0.1), livenessPassed: true,
    } }));
    const args = { sessionId: session.sessionId, user: participant, frames: Array(8).fill('data:image/jpeg;base64,QQ==') };
    const left = await hireProctoringService.storeIdentityReference({ ...args, challenge: 'TURN_LEFT' });
    expect(left).toMatchObject({ challengeCompleted: true, nextChallenge: 'TURN_RIGHT', verified: false });
    expect(session.metadata.hireProctoring.identityVerifiedAt).toBeUndefined();
    await expect(hireProctoringService.storeIdentityReference({ ...args, challenge: 'TURN_LEFT' }))
      .rejects.toMatchObject({ status: 409 });
    const right = await hireProctoringService.storeIdentityReference({ ...args, challenge: 'TURN_RIGHT' });
    expect(right).toMatchObject({ nextChallenge: 'LOOK_CENTER', verified: false });
    expect(ai.mock.calls[1][1].neutralYaw).toBe(0.01);
    expect(ai.mock.calls[1][1].previousYaw).toBe(0.12);
    const center = await hireProctoringService.storeIdentityReference({ ...args, challenge: 'LOOK_CENTER' });
    expect(center).toMatchObject({ verified: true, livenessPassed: true });
    expect(session.metadata.hireProctoring.identityVerifiedAt).toBeTruthy();
    expect(session.metadata.hireProctoring.completedLivenessChallenges).toEqual(['TURN_LEFT', 'TURN_RIGHT', 'LOOK_CENTER']);
  });

  test('an undetected batch leaves the active liveness challenge unchanged', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = { policy };
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, challengeCompleted: false,
      detectedMovement: null, message: 'Movement not detected yet.' } });
    const result = await hireProctoringService.storeIdentityReference({ sessionId: session.sessionId,
      user: participant, frames: Array(8).fill('data:image/jpeg;base64,QQ=='), challenge: 'TURN_LEFT' });
    expect(result).toMatchObject({ challengeCompleted: false, completedChallenges: [] });
    expect(session.update).not.toHaveBeenCalled();
  });

  test('an administrator-disabled liveness policy still locks a real face reference', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = {};
    const noLiveness = policyService.normalizePolicy({ livenessDetection: false, evidenceCapture: false });
    jest.spyOn(monitoringService, 'getSession').mockResolvedValue(session);
    jest.spyOn(policyService, 'resolvePolicy').mockResolvedValue({ isHire: true, assigned: true, policy: noLiveness });
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, challengeCompleted: true,
      detectedMovement: 'CENTER', neutralYaw: 0, signature: Array(64).fill(0.1), livenessPassed: true } });
    const result = await hireProctoringService.storeIdentityReference({ sessionId: session.sessionId,
      user: participant, frames: Array(8).fill('data:image/jpeg;base64,QQ=='), challenge: 'LOOK_CENTER' });
    expect(result).toMatchObject({ verified: true, challengeCompleted: true });
    expect(session.metadata.hireProctoring.identitySignature).toHaveLength(64);
  });

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

  test('accepts one ordered room photo and keeps a blurry retake on the same step', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: false, sameFrame: false, guideKey: 'blurred', message: 'Photo is blurry.',
      taMessage: 'புகைப்படம் தெளிவாக இல்லை.', observations: [],
    } });
    const frame = Buffer.from('photo');
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant, step: 'left', frame }))
      .rejects.toMatchObject({ status: 409 });
    const retake = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant, step: 'front', frame });
    expect(retake).toMatchObject({ valid: false, attempts: 1, guideKey: 'blurred' });
    expect(retake.message).toContain('take the front photo again');
    expect(session.metadata.hireProctoring.sixCaptureStatus.front.verifiedAt).toBeNull();
    ai.mockResolvedValue({ data: { valid: true, sameFrame: false, guideKey: 'front_ok',
      message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', coverage: 0.9, confidence: 0.9, observations: [] } });
    const accepted = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant, step: 'front', frame });
    expect(accepted).toMatchObject({ valid: true, attempts: 2 });
    expect(session.metadata.hireProctoring.sixCaptureStatus.front.verifiedAt).toBeTruthy();
    expect(ai).toHaveBeenCalledTimes(2);
  });

  test('sends laptop samples and prior visual features for every next room photo', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: {
      success: true, valid: true, sameFrame: false, visualSignature: 'abcd', sceneDescriptor: 'compact-feature',
      guideKey: 'front_ok', message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', observations: [],
    } }).mockResolvedValueOnce({ data: {
      success: true, valid: false, sameView: true, guideKey: 'move_left_further',
      message: 'Move further left.', taMessage: 'இடது பக்கம் திருப்பவும்.', observations: [],
    } });
    const laptopFrames = Array(4).fill('data:image/jpeg;base64,QQ==');
    const args = { sessionId: session.sessionId, user: participant, frame: Buffer.from('photo'), laptopFrames };
    await hireProctoringService.analyzeRoomStep({ ...args, step: 'front' });
    const left = await hireProctoringService.analyzeRoomStep({ ...args, step: 'left' });
    expect(ai.mock.calls[1][1]).toMatchObject({ requireLaptop: true, laptopFrames,
      priorCaptures: [{ step: 'front', visualSignature: 'abcd', sceneDescriptor: 'compact-feature' }] });
    expect(left.verified).toBe(false);
    expect(session.metadata.hireProctoring.sixCaptureStatus.left.verifiedAt).toBeNull();
  });

  test('room photo AI timeout retries once and preserves the current step for a later capture', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockRejectedValue(Object.assign(new Error('timeout of 18000ms exceeded'), { code: 'ECONNABORTED' }));
    const capture = { sessionId: session.sessionId, user: participant, step: 'front', frame: Buffer.from('photo') };
    await expect(hireProctoringService.analyzeRoomStep(capture)).rejects.toMatchObject({ code: 'AI_TIMEOUT', status: 504 });
    expect(ai).toHaveBeenCalledTimes(2);
    expect(session.metadata.hireProctoring.sixCaptureStatus).toBeUndefined();
    ai.mockResolvedValue({ data: { valid: true, sameFrame: false, guideKey: 'front_ok',
      message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', coverage: 0.9, confidence: 0.9, observations: [] } });
    await expect(hireProctoringService.analyzeRoomStep(capture)).resolves.toMatchObject({
      success: true, verified: true, step: 'front', attempts: 1,
    });
  });

  test('missing AI room route is a server error and leaves the photo step pending', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), {
      response: { status: 404, data: { detail: 'Not Found' } },
    }));
    await expect(hireProctoringService.analyzeRoomStep({
      sessionId: session.sessionId, user: participant, step: 'front', frame: Buffer.from('photo'),
    })).rejects.toMatchObject({ code: 'SERVER_ERROR', status: 503 });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(session.metadata.hireProctoring.sixCaptureStatus).toBeUndefined();
  });

  test('stores an extra-phone observation and requires a desk retake', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      ['front', 'left', 'back', 'right'].map(step => [step, { verifiedAt: new Date().toISOString() }]));
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: true, guideKey: 'observed', message: 'Detected.', taMessage: 'கண்டறியப்பட்டது.',
      observations: [{ objectType: 'additional phone', confidence: 0.9 }],
    } });
    const args = { sessionId: session.sessionId, user: participant, step: 'desk', frame: Buffer.from('photo') };
    const retake = await hireProctoringService.analyzeRoomStep(args);
    expect(retake).toMatchObject({ valid: false, guideKey: 'remove_observation' });
    expect(retake.message).toContain('remove it');
    expect(session.metadata.hireProctoring.roomObservations).toEqual(expect.arrayContaining([expect.objectContaining({ objectType: 'additional phone' })]));
    ai.mockResolvedValue({ data: { valid: true, guideKey: 'desk_ok', message: 'Desk verified.',
      taMessage: 'மேசை சரிபார்க்கப்பட்டது.', observations: [] } });
    expect(await hireProctoringService.analyzeRoomStep(args)).toMatchObject({ valid: true, attempts: 2 });
  });

  test('does not analyze the 360 sweep until six photos are verified', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post');
    await expect(hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='] })).rejects.toMatchObject({ status: 409 });
    expect(ai).not.toHaveBeenCalled();
  });

  test('360 sector warning holds completion until that area is rescanned', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    mockOwnership(session);
    const sectors = Array.from({ length: 8 }, (_, sector) => ({ sector, verified: sector !== 2 }));
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, complete: false,
      coverage: 87, sectors, missingSectors: ['Left'], currentDirection: 'Left',
      pendingObject: { sector: 2, label: 'Left', objectType: 'additional phone' }, observations: [] } });
    const capture = { sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='], orientations: [{ yaw: 90 }] };
    const blocked = await hireProctoringService.analyzeRoomScan360(capture);
    expect(blocked).toMatchObject({ roomScanClear: false, coverage: 87, pendingObject: { sector: 2 } });
    expect(session.metadata.hireProctoring.roomScanClear).toBeUndefined();
    expect(ai.mock.calls[0][1].orientations).toEqual([{ yaw: 90 }]);
    ai.mockResolvedValue({ data: { success: true, complete: true, coverage: 100,
      sectors: sectors.map(item => ({ ...item, verified: true })), missingSectors: [], pendingObject: null,
      observations: [] } });
    const cleared = await hireProctoringService.analyzeRoomScan360(capture);
    expect(cleared).toMatchObject({ roomScanClear: true, coverage: 100, pendingObject: null });
    expect(session.metadata.hireProctoring.roomScanClear).toBe(true);
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
