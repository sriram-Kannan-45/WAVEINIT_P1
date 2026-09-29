const axios = require('axios');
const models = require('../src/models');
const monitoringService = require('../src/services/monitoringService');
const policyService = require('../src/services/hireProctoringPolicy');
const hireProctoringService = require('../src/services/hireProctoringService');
const hireProctoringController = require('../src/controllers/hireProctoringController');
const verificationService = require('../src/services/assessmentVerificationService');

const row = data => ({
  ...data,
  update: jest.fn(async function update(patch) { Object.assign(this, patch); return this; }),
});

let captureSequence = 0;
const freshCapture = () => ({
  captureId: `capture-${String(++captureSequence).padStart(8, '0')}`,
  capturedAt: Date.now(),
  mobileStreamId: 'mobile-stream-test-01',
});
const mockRoomReference = () => ({ referenceCreatedAt: new Date().toISOString(), photos:
  ['front', 'left', 'right', 'bottom', 'desk'].map(step => ({ direction: step.toUpperCase(),
    visualSignature: `signature-${step}`, sceneDescriptor: `descriptor-${step}` })) });
const mockSimilarityReport = (score = 0.8) => ({ overallSimilarity: score, threshold: 0.6,
  result: score >= 0.6 ? 'PASS' : 'FAIL', sectorResults: Array.from({ length: 5 }, (_, sector) =>
    ({ sector, similarity: score, matchedReference: 'front', status: 'PASS' })) });
const mockPostScanReport = () => ({ result: 'PASS', arcDegrees: 180, reviewedSectors: 5,
  checks: { coverage: true, baseline: true, person: true, computer: true, unauthorizedObjects: true } });
const mockSweepSamples = () => Array(5).fill('data:image/jpeg;base64,QQ==');
const mockScanSectors = verified => ['Left', 'Front-left', 'Front', 'Front-right', 'Right']
  .map((label, sector) => ({ sector, label, verified: typeof verified === 'function' ? !!verified(sector) : !!verified }));
const mockScan180 = (overrides = {}) => ({ success: true, step: 'scan180', arcDegrees: 180,
  complete: false, verdict: 'RETRY', mode: 'recorded_video',
  coverage: 0, sectors: mockScanSectors(false),
  similarityReport: mockSimilarityReport(),
  postScanReport: { ...mockPostScanReport(), result: 'PENDING', reviewedSectors: 0 },
  ...overrides });

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

  test('legacy free-scan endpoint cannot unlock the room', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    await expect(hireProctoringService.inspectRoom({
      sessionId: session.sessionId,
      user: participant,
      frames: Array(policy.roomScanMinFrames).fill('data:image/jpeg;base64,QQ=='),
    })).rejects.toMatchObject({ status: 410, code: 'GUIDED_SCAN_REQUIRED' });
  });

  test('legacy free-scan endpoint cannot bypass the guided object review', async () => {
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
    await expect(hireProctoringService.inspectRoom({ sessionId: session.sessionId, user: participant, frames }))
      .rejects.toMatchObject({ status: 410, code: 'GUIDED_SCAN_REQUIRED' });
    expect(report).not.toHaveBeenCalled();
  });

  test('accepts one ordered room photo and keeps a blurry retake on the same step', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: false, sameFrame: false, guideKey: 'blurred', message: 'Photo is blurry.',
      taMessage: 'புகைப்படம் தெளிவாக இல்லை.', observations: [],
    } });
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'left', frame: Buffer.from('left-photo'), ...freshCapture() }))
      .rejects.toMatchObject({ status: 409 });
    const retake = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'front', frame: Buffer.from('blurry-photo'), ...freshCapture() });
    expect(retake).toMatchObject({ valid: false, attempts: 1, guideKey: 'blurred' });
    expect(retake.message).toContain('take the front photo again');
    expect(session.metadata.hireProctoring.sixCaptureStatus.front.verifiedAt).toBeNull();
    ai.mockResolvedValue({ data: { valid: true, sameFrame: false, guideKey: 'front_ok',
      message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', coverage: 0.9, confidence: 0.9, observations: [] } });
    const accepted = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'front', frame: Buffer.from('clear-photo'), ...freshCapture() });
    expect(accepted).toMatchObject({ valid: true, attempts: 2 });
    expect(session.metadata.hireProctoring.sixCaptureStatus.front.verifiedAt).toBeTruthy();
    expect(ai).toHaveBeenCalledTimes(2);
  });

  test('desk is the fifth step and flips 4/5 to 5/5 on a successful verdict', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = { policy };
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockImplementation(async (url, payload) => ({ data: {
      success: true, valid: true, sameFrame: false,
      visualSignature: `signature-${payload.step}`, sceneDescriptor: `descriptor-${payload.step}`,
      orientation: payload.orientation, guideKey: `${payload.step}_ok`,
      message: `${payload.step} verified.`, taMessage: `${payload.step} சரிபார்க்கப்பட்டது.`,
      coverage: 0.9, confidence: 0.9, laptopMovementScore: 0.4, observations: [],
    } }));
    const verifiedCount = map => hireProctoringService.HIRE_ROOM_STEPS
      .filter(name => map?.[name]?.verifiedAt).length;
    const submit = (step, index) => hireProctoringService.analyzeRoomStep({
      sessionId: session.sessionId, user: participant, step,
      frame: Buffer.from(`photo-${step}-${index}`), orientation: { yaw: index * 60, pitch: 0 },
      laptopFrames: Array(4).fill('data:image/jpeg;base64,QQ=='), ...freshCapture(),
    });

    // The first four steps leave the flow incomplete at 4/5.
    for (const [index, step] of ['front', 'left', 'right', 'bottom'].entries()) {
      const result = await submit(step, index);
      expect(result).toMatchObject({ step, verified: true, allCapturesVerified: false });
      expect(verifiedCount(result.sixCaptureStatus)).toBe(index + 1);
    }
    expect(verifiedCount(session.metadata.hireProctoring.sixCaptureStatus)).toBe(4);
    expect(session.metadata.hireProctoring.roomVerificationPhase).not.toBe('ROOM_PHOTOS_VALIDATED');

    // Desk is accepted last and completes room verification at 5/5.
    const desk = await submit('desk', 4);
    expect(desk).toMatchObject({ success: true, step: 'desk', valid: true, verified: true,
      allCapturesVerified: true, guideKey: 'desk_ok' });
    expect(verifiedCount(desk.sixCaptureStatus)).toBe(5);
    expect(session.metadata.hireProctoring.roomVerificationPhase).toBe('ROOM_REFERENCE_CREATED');
  });

  test('reports a step-order desync with a real code and the pending step, not a server error', async () => {
    // Regression: this guard used to throw a code-less 409, which the socket
    // collapsed into SERVER_ERROR, so a Desk capture during a step desync
    // surfaced as "Photo analysis temporarily failed".
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: true, sameFrame: false, guideKey: 'front_ok', coverage: 0.9, confidence: 0.9,
      message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', observations: [],
    } });
    await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'front', frame: Buffer.from('front-ok'), ...freshCapture() });
    expect(ai).toHaveBeenCalledTimes(1);

    // Client believes it is on the final Desk step while the server still
    // expects 'left'.
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'desk', frame: Buffer.from('desk-early'), ...freshCapture() }))
      .rejects.toMatchObject({ code: 'STEP_OUT_OF_ORDER', status: 409, expectedStep: 'left' });

    // The desync must never reach the AI, and the pending step is unchanged.
    expect(ai).toHaveBeenCalledTimes(1);
    expect(session.metadata.hireProctoring.sixCaptureStatus.desk).toBeUndefined();
  });

  test('sends laptop samples and prior visual features for every next room photo', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: {
      success: true, valid: true, sameFrame: false, visualSignature: 'abcd', sceneDescriptor: 'compact-feature',
      featureDescriptor: 'orb-local-features',
      guideKey: 'front_ok', message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', observations: [],
    } }).mockResolvedValueOnce({ data: {
      success: true, valid: false, sameView: true, guideKey: 'move_left_further',
      message: 'Move further left.', taMessage: 'இடது பக்கம் திருப்பவும்.', observations: [],
    } });
    const laptopFrames = Array(4).fill('data:image/jpeg;base64,QQ==');
    const args = { sessionId: session.sessionId, user: participant, laptopFrames };
    await hireProctoringService.analyzeRoomStep({ ...args, step: 'front', frame: Buffer.from('front-photo'), ...freshCapture() });
    const left = await hireProctoringService.analyzeRoomStep({ ...args, step: 'left', frame: Buffer.from('left-photo'), ...freshCapture() });
    expect(ai.mock.calls[1][1]).toMatchObject({ requireLaptop: true, laptopFrames,
      priorCaptures: [{ step: 'front', visualSignature: 'abcd', sceneDescriptor: 'compact-feature',
        featureDescriptor: 'orb-local-features' }] });
    expect(left.verified).toBe(false);
    expect(session.metadata.hireProctoring.sixCaptureStatus.left.verifiedAt).toBeNull();
  });

  test('room photo AI timeout retries once and preserves the current step for a later capture', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockRejectedValue(Object.assign(new Error('timeout of 18000ms exceeded'), { code: 'ECONNABORTED' }));
    const capture = { sessionId: session.sessionId, user: participant, step: 'front',
      frame: Buffer.from('timed-out-photo'), ...freshCapture() };
    await expect(hireProctoringService.analyzeRoomStep(capture)).rejects.toMatchObject({ code: 'AI_TIMEOUT', status: 504 });
    expect(ai).toHaveBeenCalledTimes(2);
    expect(session.metadata.hireProctoring.sixCaptureStatus).toBeUndefined();
    ai.mockResolvedValue({ data: { valid: true, sameFrame: false, guideKey: 'front_ok',
      message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', coverage: 0.9, confidence: 0.9, observations: [] } });
    await expect(hireProctoringService.analyzeRoomStep({ ...capture, frame: Buffer.from('fresh-photo'), ...freshCapture() })).resolves.toMatchObject({
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
      sessionId: session.sessionId, user: participant, step: 'front', frame: Buffer.from('photo'), ...freshCapture(),
    })).rejects.toMatchObject({ code: 'SERVER_ERROR', status: 503 });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(session.metadata.hireProctoring.sixCaptureStatus).toBeUndefined();
  });

  test('stores an extra-phone observation and requires a desk retake', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      ['front', 'left', 'right', 'bottom'].map(step => [step, { verifiedAt: new Date().toISOString(),
        visualSignature: `signature-${step}`, sceneDescriptor: `descriptor-${step}`,
        evidencePath: `/uploads/hire-proctoring/test/${step}.jpg` }]));
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: true, guideKey: 'observed', message: 'Detected.', taMessage: 'கண்டறியப்பட்டது.',
      observations: [{ objectType: 'additional phone', confidence: 0.9 }],
    } });
    const args = { sessionId: session.sessionId, user: participant, step: 'desk' };
    const retake = await hireProctoringService.analyzeRoomStep({ ...args, frame: Buffer.from('phone-visible'), ...freshCapture() });
    expect(retake).toMatchObject({ valid: false, guideKey: 'remove_observation' });
    expect(retake.message).toContain('remove it');
    expect(session.metadata.hireProctoring.roomObservations).toEqual(expect.arrayContaining([expect.objectContaining({ objectType: 'additional phone' })]));
    ai.mockResolvedValue({ data: { valid: true, visualSignature: 'signature-desk',
      sceneDescriptor: 'descriptor-desk', guideKey: 'desk_ok', message: 'Desk verified.',
      taMessage: 'மேசை சரிபார்க்கப்பட்டது.', observations: [] } });
    expect(await hireProctoringService.analyzeRoomStep({ ...args, frame: Buffer.from('clean-desk'), ...freshCapture() }))
      .toMatchObject({ valid: true, attempts: 2 });
  });

  test('rejects an exact photo replay before a second AI call', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      success: true, valid: true, sameFrame: false, visualSignature: 'front-signature',
      sceneDescriptor: 'front-descriptor', guideKey: 'front_ok', message: 'Front verified.',
      taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.', coverage: 0.9, confidence: 0.9, observations: [],
    } });
    const photo = Buffer.from('identical-photo-bytes');
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'front', frame: photo, ...freshCapture() })).resolves.toMatchObject({ verified: true });
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'left', frame: photo, ...freshCapture() })).resolves.toMatchObject({
      verified: false, failureReason: 'DUPLICATE_IMAGE', guideKey: 'duplicate_image',
    });
    expect(ai).toHaveBeenCalledTimes(1);
  });

  test('rejects a view flagged as repeated even if an AI response claims valid', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = { front: { verifiedAt: new Date().toISOString(),
      visualSignature: 'front-signature', sceneDescriptor: 'front-descriptor',
      evidencePath: '/uploads/hire-proctoring/test/front.jpg' } };
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, valid: true,
      sameView: true, reason: 'view_too_similar', guideKey: 'move_left_further',
      message: 'Show the left side.', taMessage: 'இடது பக்கத்தைக் காட்டவும்.', observations: [] } });
    const result = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId,
      user: participant, step: 'left', frame: Buffer.from('left-repeat'), ...freshCapture() });
    expect(result).toMatchObject({ verified: false, failureReason: 'TOO_SIMILAR_TO_PREVIOUS_VIEW' });
    expect(session.metadata.hireProctoring.sixCaptureStatus.left.verifiedAt).toBeNull();
  });

  test('does not accept a room photo when required object detection failed', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, valid: true,
      detectorError: true, visualSignature: 'front', sceneDescriptor: 'front', observations: [] } });
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId,
      user: participant, step: 'front', frame: Buffer.from('photo'), ...freshCapture() }))
      .rejects.toMatchObject({ code: 'AI_SERVICE_ERROR', status: 503 });
    expect(session.metadata.hireProctoring.sixCaptureStatus?.front?.verifiedAt).toBeFalsy();
  });

  test('accepts a plain room photo whose Laplacian variance sits under the old absolute blur cut', async () => {
    // Regression: a readable room photo scored laplacianVar ~24 on the 480px
    // downscale, below the old unconditional "blur < 28" gate, and was rejected
    // as blurred. A quorum-based verdict on the real signals must be accepted.
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      ['front', 'left'].map(step => [step, { verifiedAt: new Date().toISOString() }]));
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: true, sameFrame: false, reason: 'valid_room_view', guideKey: 'right_ok',
      message: 'Right side verified.', taMessage: 'வலது பக்கம் சரிபார்க்கப்பட்டது.',
      coverage: 0.745, confidence: 0.8, qualityScore: 74.5, qualityThreshold: 38,
      blurScore: 24.22, relativeSharpness: 0.168, tenengrad: 4.69, fineDetailRatio: 0.106,
      blurSignals: 0, brightnessScore: 1, brightness: 102.9, contrastScore: 0.45,
      sceneScore: 0.6, resolutionScore: 1, edgeDensity: 0.0096, objectCount: 0,
      resolution: '1080x1920', observations: [],
    } });
    const result = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId,
      user: participant, step: 'right', frame: Buffer.from('plain-wall'), ...freshCapture() });
    expect(result).toMatchObject({ valid: true, verified: true, validationReason: 'valid_room_view' });
    expect(result.failureReason).toBeNull();
    expect(session.metadata.hireProctoring.sixCaptureStatus.right.verifiedAt).toBeTruthy();
    // The room photo bar is its own policy, not the 360 sweep coverage threshold.
    expect(policyService.normalizePolicy({}).roomPhotoQualityThreshold).toBe(40);
    expect(ai.mock.calls[0][1]).toMatchObject({ step: 'right', threshold: 0.4 });
  });

  test('surfaces the real quality reason and diagnostics instead of a generic failure', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: false, sameFrame: false, reason: 'too_dark', guideKey: 'too_dark',
      message: 'The photo is too dark.', taMessage: 'புகைப்படம் மிகவும் இருளாக உள்ளது.',
      coverage: 0.2, confidence: 0.3, qualityScore: 22, qualityThreshold: 38,
      blurScore: 40, blurSignals: 0, brightness: 14, brightnessScore: 0.05,
      contrastScore: 0.1, sceneScore: 0.05, resolutionScore: 1, observations: [],
    } });
    const result = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId,
      user: participant, step: 'front', frame: Buffer.from('dark-photo'), ...freshCapture() });
    expect(result).toMatchObject({ valid: false, failureReason: 'FRAME_TOO_DARK',
      validationReason: 'too_dark', guideKey: 'too_dark' });
    expect(result.quality).toMatchObject({ qualityScore: 22, brightness: 14, blurSignals: 0 });
    expect(result.reason).toContain('too dark');
  });

  test('reports an object-blocked photo as blocked, not as a valid room view', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      ['front', 'left'].map(step => [step, { verifiedAt: new Date().toISOString() }]));
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: true, sameFrame: false, reason: 'valid_room_view', guideKey: 'right_ok',
      message: 'Right side verified.', taMessage: 'வலது பக்கம் சரிபார்க்கப்பட்டது.',
      qualityScore: 82, blurScore: 55, blurSignals: 0, coverage: 0.9, confidence: 0.9,
      observations: [{ objectType: 'additional phone', confidence: 0.9 }],
    } });
    const result = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId,
      user: participant, step: 'right', frame: Buffer.from('phone-in-shot'), ...freshCapture() });
    expect(result.valid).toBe(false);
    expect(result.validationReason).toBe('object_blocked');
    expect(result.failureReason).toBe('SUSPICIOUS_OBJECT_DETECTED');
    expect(result.guideKey).toBe('remove_observation');
  });

  test('returns quality diagnostics on an accepted photo too', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      valid: true, sameFrame: false, reason: 'valid_room_view', guideKey: 'front_ok',
      message: 'Front verified.', taMessage: 'முன் பகுதி சரிபார்க்கப்பட்டது.',
      coverage: 0.9, confidence: 0.9, qualityScore: 88, qualityThreshold: 38,
      blurScore: 61, blurSignals: 0, brightness: 118, brightnessScore: 1,
      contrastScore: 0.7, sceneScore: 0.8, resolutionScore: 1, observations: [],
    } });
    const result = await hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId,
      user: participant, step: 'front', frame: Buffer.from('good-photo'), ...freshCapture() });
    expect(result.valid).toBe(true);
    expect(result.quality).toMatchObject({ qualityScore: 88, blurScore: 61, blurSignals: 0 });
  });

  test('rejects stale and reused capture identifiers before AI inference', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      success: true, valid: false, sameFrame: false, guideKey: 'blurred', observations: [],
    } });
    await expect(hireProctoringService.analyzeRoomStep({ sessionId: session.sessionId, user: participant,
      step: 'front', frame: Buffer.from('stale-photo'), ...freshCapture(), capturedAt: Date.now() - 60000 }))
      .rejects.toMatchObject({ status: 409, code: 'STALE_CAPTURE' });
    const capture = { sessionId: session.sessionId, user: participant, step: 'front',
      frame: Buffer.from('fresh-but-blurry'), ...freshCapture() };
    await expect(hireProctoringService.analyzeRoomStep(capture)).resolves.toMatchObject({ verified: false });
    await expect(hireProctoringService.analyzeRoomStep(capture))
      .rejects.toMatchObject({ status: 409, code: 'CAPTURE_REPLAY' });
    expect(ai).toHaveBeenCalledTimes(1);
  });

  test('does not analyze the 360 sweep until five photos are verified', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post');
    await expect(hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='] })).rejects.toMatchObject({ status: 409 });
    expect(ai).not.toHaveBeenCalled();
  });

  test('rejects an old eight-direction AI response before persisting scan progress', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: {
      success: true, step: 'scan360', coverage: 75,
      sectors: ['Front', 'Front-right', 'Right', 'Back-right', 'Back', 'Back-left', 'Left', 'Front-left']
        .map((label, sector) => ({ sector, label, verified: sector < 6 })),
      similarityReport: { ...mockSimilarityReport(), sectorResults: Array(8).fill({ similarity: 0.8 }) },
      postScanReport: { ...mockPostScanReport(), arcDegrees: 360 },
    } });
    await expect(hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] }))
      .rejects.toMatchObject({ code: 'AI_SCAN_VERSION_MISMATCH', status: 503 });
    expect(session.metadata.hireProctoring.roomScanCoverage).toBeUndefined();
  });

  test('clears a pending eight-direction scan when the participant reloads', async () => {
    const session = ownedSession('CALIBRATING');
    Object.assign(session.metadata.hireProctoring, {
      roomReference: mockRoomReference(), roomScanCoverage: 75,
      roomScanSectors: Array(8).fill({ verified: true }),
      roomPostScanReport: { ...mockPostScanReport(), arcDegrees: 360 },
    });
    mockOwnership(session);
    const state = await hireProctoringService.getRoomVerificationState({
      sessionId: session.sessionId, user: participant });
    expect(state.roomScanCoverage).toBe(0);
    expect(state.roomScanSectors).toEqual([]);
    expect(state.roomScanClear).toBe(false);
  });

  test('runs the canonical five-step state machine into a verified 180 sweep', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = { policy };
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockImplementation(async (url, payload) => {
      if (url.endsWith('/room-scan-360')) return { data: mockScan180({
        success: true, complete: true, verdict: 'PASS', sweepCovered: true, arcDegrees: 180, coverage: 100, similarityReport: mockSimilarityReport(),
        postScanReport: mockPostScanReport(), sampledFrames: mockSweepSamples(),
        sectors: mockScanSectors(true),
        missingSectors: [], pendingObject: null, observations: [],
        guideKey: 'scan_complete', message: '180 complete.', taMessage: '180 முடிந்தது.',
      }) };
      return { data: {
        success: true, valid: true, sameFrame: false,
        visualSignature: `signature-${payload.step}`,
        sceneDescriptor: `descriptor-${payload.step}`,
        orientation: payload.orientation,
        guideKey: `${payload.step}_ok`, message: `${payload.step} verified.`,
        taMessage: `${payload.step} சரிபார்க்கப்பட்டது.`, coverage: 0.9, confidence: 0.9,
        laptopMovementScore: 0.4, observations: [],
      } };
    });

    for (const [index, step] of hireProctoringService.HIRE_ROOM_STEPS.entries()) {
      const result = await hireProctoringService.analyzeRoomStep({
        sessionId: session.sessionId, user: participant, step,
        frame: Buffer.from(`distinct-${step}-photo`), orientation: { yaw: index * 60, pitch: 0 },
        laptopFrames: Array(4).fill('data:image/jpeg;base64,QQ=='), ...freshCapture(),
      });
      expect(result).toMatchObject({ step, verified: true });
    }
    expect(session.metadata.hireProctoring.roomVerificationPhase).toBe('ROOM_REFERENCE_CREATED');
    expect(Object.keys(session.metadata.hireProctoring.sixCaptureStatus)).toEqual(
      ['front', 'left', 'right', 'bottom', 'desk']);

    const sweep = await hireProctoringService.analyzeRoomScan360({
      sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='], orientations: [{ yaw: 360 }],
      laptopFrames: Array(4).fill('data:image/jpeg;base64,QQ=='),
    });
    expect(sweep).toMatchObject({ complete: true, roomScanClear: true, coverage: 100 });
    expect(session.metadata.hireProctoring).toMatchObject({
      roomVerificationPhase: 'WORKSPACE_CHECK', roomScan360Complete: true, roomScanClear: true,
    });
    expect(session.metadata.hireProctoring.roomScanSampleIds).toHaveLength(5);
    expect(ai).toHaveBeenCalledTimes(6);
    const repeat = await hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] });
    expect(repeat.roomScanClear).toBe(true);
    expect(ai).toHaveBeenCalledTimes(6);
  });

  test('finished recording uses reviewed evidence rather than a 100 percent live coverage target', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = { policy,
      sixCaptureStatus: Object.fromEntries(hireProctoringService.HIRE_ROOM_STEPS.map(step =>
        [step, { verifiedAt: new Date().toISOString() }])),
      roomReference: mockRoomReference(),
      roomObjectEvents: [{ eventId: 'object-1', sector: 2, objectType: 'additional phone',
        beforeEvidenceId: '/uploads/object-before.jpg', status: 'ACTION_REQUIRED' }],
    };
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({ mode: 'recorded_video',
      complete: true, sweepCovered: true, coverage: 60, similarityReport: mockSimilarityReport(),
      postScanReport: mockPostScanReport(), sampledFrames: mockSweepSamples(),
      sectors: mockScanSectors(true) }) });
    const result = await hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] });
    expect(result.roomScanClear).toBe(true);
    expect(session.metadata.hireProctoring.roomObjectEvents[0].status).toBe('CLEARED');
    expect(session.metadata.hireProctoring.roomObjectEvents[0].afterEvidenceId).toBeTruthy();
  });

  test('covered sweep cannot pass when person evidence is missing', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({ success: true, complete: false,
      verdict: 'RETRY', failureReason: 'laptop_motion_missing',
      sweepCovered: true, arcDegrees: 180, coverage: 100, similarityReport: mockSimilarityReport(),
      postScanReport: { ...mockPostScanReport(), result: 'FAIL', checks: {
        ...mockPostScanReport().checks, person: false } }, sampledFrames: mockSweepSamples(),
      sectors: mockScanSectors(true) }) });
    const result = await hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] });
    expect(result.roomScanClear).toBe(false);
    expect(result.verdict).toBe('RETRY');
    expect(result.postScanReport.checks.person).toBe(false);
    expect(session.metadata.hireProctoring.roomScanSampleIds).toHaveLength(5);
  });

  test('refuses an incremental live-accumulator answer instead of gating the room on it', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    // Same step/arc/sector shape as the recorded path, but produced by the
    // legacy per-frame accumulator. Accepting it would run a second, competing
    // room pipeline alongside the record-then-review flow.
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({
      mode: 'visual_baseline', complete: true, verdict: 'PASS', coverage: 100,
      sweepCovered: true, similarityReport: mockSimilarityReport(),
      postScanReport: mockPostScanReport(), sampledFrames: mockSweepSamples(),
      sectors: mockScanSectors(true) }) });
    await expect(hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] }))
      .rejects.toMatchObject({ code: 'AI_SCAN_VERSION_MISMATCH', status: 503 });
    expect(session.metadata.hireProctoring.roomScanClear).toBeUndefined();
    expect(session.metadata.hireProctoring.roomScanCompletedAt).toBeUndefined();
  });

  test('rejects an unrecognised verdict rather than defaulting it to a pass', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({
      complete: true, verdict: undefined,
      similarityReport: mockSimilarityReport(), postScanReport: mockPostScanReport(),
      sampledFrames: mockSweepSamples(), sectors: mockScanSectors(true) }) });
    await expect(hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] }))
      .rejects.toMatchObject({ code: 'AI_SCAN_VERSION_MISMATCH', status: 503 });
  });

  test('a prohibited object in the sweep reports FLAG, not a room mismatch', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({
      success: true, complete: false, verdict: 'FLAG', failureReason: 'remove_object', rescanRequired: true,
      sweepCovered: true, arcDegrees: 180, coverage: 100, similarityReport: mockSimilarityReport(),
      postScanReport: { ...mockPostScanReport(), result: 'FAIL', checks: {
        ...mockPostScanReport().checks, unauthorizedObjects: false } },
      sampledFrames: mockSweepSamples(), sectors: mockScanSectors(false),
      pendingObject: { sector: 1, label: 'Front-left', objectType: 'additional phone',
        reason: 'remove_object', action: 'REMOVE_AND_RESCAN' },
      objectTransition: { type: 'DETECTED', objectType: 'additional phone', sector: 1, frameIndex: 0 },
      guideKey: 'remove_object', message: 'A prohibited item (additional phone) was visible.',
      observations: [{ objectType: 'additional phone', confidence: 0.8 }] }) });

    const result = await hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ==', 'data:image/jpeg;base64,Qg=='] });

    // The sweep evidence was usable, so the room must not be blamed.
    expect(result.verdict).toBe('FLAG');
    expect(result.guideKey).toBe('remove_object');
    expect(result.failureReason).toBe('remove_object');
    expect(result.pendingObject).toMatchObject({ objectType: 'additional phone' });
    expect(result.roomScanClear).toBe(false);
    expect(result.rescanRequired).toBe(true);
    // A FLAG is a "remove it and go again" instruction, not a restart of the sweep.
    expect(session.metadata.hireProctoring.roomScanRestarted).toBe(false);
    expect(session.metadata.hireProctoring.roomObjectEvents).toEqual([
      expect.objectContaining({ objectType: 'additional phone', status: 'ACTION_REQUIRED' })]);
  });

  test('360 object warning blocks completion until the sweep restarts and re-verifies', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    const sectors = mockScanSectors(sector => sector !== 2);
    const ai = jest.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: mockScan180({ complete: false,
        coverage: 80, sectors, missingSectors: ['Front'], currentDirection: 'Front',
        pendingObject: { sector: 2, label: 'Front', objectType: 'additional phone' }, observations: [] }) })
      .mockResolvedValueOnce({ data: mockScan180({ complete: false,
        coverage: 0, sectors: sectors.map(item => ({ ...item, verified: false })), missingSectors: [],
        pendingObject: null, restarted: true, guideKey: 'scan_restarted', observations: [] }) })
      .mockResolvedValueOnce({ data: mockScan180({ complete: true, sweepCovered: true, coverage: 100,
        postScanReport: mockPostScanReport(), sampledFrames: mockSweepSamples(),
        sectors: sectors.map(item => ({ ...item, verified: true })), missingSectors: [], pendingObject: null,
        observations: [] }) });
    const capture = { sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='], orientations: [{ yaw: 90 }] };

    const blocked = await hireProctoringService.analyzeRoomScan360(capture);
    expect(blocked).toMatchObject({ roomScanClear: false, coverage: 80, pendingObject: { sector: 2 } });
    expect(session.metadata.hireProctoring.roomScanClear).toBe(false);
    expect(ai.mock.calls[0][1].orientations).toEqual([{ yaw: 90 }]);

    // Object removed -> entire sweep restarts at 0%.
    const restarted = await hireProctoringService.analyzeRoomScan360(capture);
    expect(restarted).toMatchObject({ restarted: true, coverage: 0, pendingObject: null, roomScanClear: false });
    expect(session.metadata.hireProctoring.roomScan360Complete).toBe(false);
    expect(session.metadata.hireProctoring.roomScanCompletedAt).toBe(null);
    expect(session.metadata.hireProctoring.roomScanClear).toBe(false);

    // Fresh sweep completes.
    const cleared = await hireProctoringService.analyzeRoomScan360(capture);
    expect(cleared).toMatchObject({ roomScanClear: true, coverage: 100, pendingObject: null, restarted: false });
    expect(session.metadata.hireProctoring.roomScanClear).toBe(true);
  });

  test('360 blocking object never resurrects an earlier completion state', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = {
      sixCaptureStatus: Object.fromEntries(
        hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }])),
      roomReference: mockRoomReference(),
      roomScanCompletedAt: new Date().toISOString(),
      roomScanClear: true,
      roomScan360Complete: true,
    };
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({ complete: false,
      coverage: 20, sectors: mockScanSectors(sector => sector === 0), missingSectors: ['Right'], currentDirection: 'Right',
      pendingObject: { sector: 4, label: 'Right', objectType: 'visible notes / book' }, observations: [] }) });
    const capture = { sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='], orientations: [{ yaw: 180 }] };

    const result = await hireProctoringService.analyzeRoomScan360(capture);
    expect(result).toMatchObject({ roomScanClear: false, pendingObject: { sector: 4 } });
    expect(session.metadata.hireProctoring.roomScan360Complete).toBe(false);
    expect(session.metadata.hireProctoring.roomScanCompletedAt).toBe(null);
    expect(session.metadata.hireProctoring.roomScanClear).toBe(false);
  });

  test('complete coverage cannot admit a low-similarity room', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({ complete: false,
      coverage: 100, similarityReport: mockSimilarityReport(0.42), sectors: mockScanSectors(true), observations: [],
      rescanRequired: true, message: 'Room does not match the baseline.' }) });
    const result = await hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] });
    expect(result).toMatchObject({ roomScanClear: false, rescanRequired: true });
    expect(session.metadata.hireProctoring.roomScanClear).toBe(false);
  });

  test('required object detection fails closed during a detector outage', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: mockScan180({ success: true, complete: true,
      detectorAvailable: false, coverage: 100, similarityReport: mockSimilarityReport(),
      sectors: mockScanSectors(true), observations: [] }) });
    await expect(hireProctoringService.analyzeRoomScan360({ sessionId: session.sessionId,
      user: participant, frames: ['data:image/jpeg;base64,QQ=='] }))
      .rejects.toMatchObject({ code: 'AI_SERVICE_ERROR', status: 503 });
    expect(session.metadata.hireProctoring.roomScanClear).toBeUndefined();
  });

  test('records before and after evidence only after same-area clear confirmation', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    session.metadata.hireProctoring.roomReference = mockRoomReference();
    mockOwnership(session);
    const report = mockSimilarityReport();
    jest.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: mockScan180({ complete: false, coverage: 20,
        similarityReport: report, sectors: mockScanSectors(sector => sector === 0), observations: [],
        pendingObject: { sector: 2, objectType: 'additional phone' },
        objectTransition: { type: 'DETECTED', sector: 2, objectType: 'additional phone',
          frameIndex: 0, confidence: 0.9 } }) })
      .mockResolvedValueOnce({ data: mockScan180({ complete: false, coverage: 20,
        similarityReport: report, sectors: mockScanSectors(sector => sector === 0), observations: [],
        pendingObject: { sector: 2, objectType: 'additional phone' },
        reverificationFailure: 'OBJECT_STILL_PRESENT' }) })
      .mockResolvedValueOnce({ data: mockScan180({ complete: false, coverage: 0,
        similarityReport: report, sectors: mockScanSectors(false), observations: [], restarted: true,
        objectTransition: { type: 'CLEARED', sector: 2, objectType: 'additional phone',
          frameIndex: 0, sameAreaSimilarity: 0.86, clearFrames: 3, qualityScore: 82 } }) });
    const payload = { sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='] };
    await hireProctoringService.analyzeRoomScan360(payload);
    expect(session.metadata.hireProctoring.roomObjectEvents[0]).toMatchObject({ status: 'ACTION_REQUIRED',
      beforeConfidence: 0.9, sector: 2 });
    await hireProctoringService.analyzeRoomScan360(payload);
    expect(session.metadata.hireProctoring.roomObjectEvents[0].status).toBe('STILL_PRESENT');
    await hireProctoringService.analyzeRoomScan360(payload);
    expect(session.metadata.hireProctoring.roomObjectEvents[0]).toMatchObject({ status: 'CLEARED',
      afterVerificationResult: { sameAreaSimilarity: 0.86, clearFrames: 3 } });
    expect(session.metadata.hireProctoring.roomObjectEvents[0].beforeEvidenceId).toContain('room_object_before');
    expect(session.metadata.hireProctoring.roomObjectEvents[0].afterEvidenceId).toContain('room_object_after');
  });

  test('360 HTTP endpoint waits for an active paired mobile camera', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    jest.spyOn(models.AssessmentVerificationSession, 'findOne').mockResolvedValue({ session_id: 'verified-room' });
    const analyze = jest.spyOn(hireProctoringService, 'analyzeRoomScan360').mockResolvedValue({ roomScanClear: true });
    const req = { params: { sessionId: session.sessionId }, user: participant, body: { frames: [] },
      app: { get: () => ({ in: () => ({ fetchSockets: async () => [] }) }) } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await hireProctoringController.roomScan360(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'QR_NOT_PAIRED' }));
    expect(analyze).not.toHaveBeenCalled();
  });

  test('360 HTTP endpoint rejects laptop-submitted frames without phone provenance', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    jest.spyOn(models.AssessmentVerificationSession, 'findOne').mockResolvedValue({ session_id: 'verified-room' });
    const analyze = jest.spyOn(hireProctoringService, 'analyzeRoomScan360').mockResolvedValue({ roomScanClear: true });
    const req = { params: { sessionId: session.sessionId }, user: participant,
      body: { frames: ['data:image/jpeg;base64,QQ=='], recordingComplete: true }, app: { get: () => ({ in: () => ({
        fetchSockets: async () => [{ id: 'paired-phone', data: { assessmentVerification: {
          role: 'mobile_camera', sessionId: 'verified-room', mobileStreamId: 'active-stream' } } }],
      }) }) } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await hireProctoringController.roomScan360(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'PHONE_SCAN_SAMPLES_REQUIRED' }));
    expect(analyze).not.toHaveBeenCalled();
  });

  test('360 HTTP pass announces workspace readiness to the paired phone', async () => {
    const session = ownedSession('CALIBRATING');
    mockOwnership(session);
    Object.assign(session.metadata.hireProctoring, {
      roomScanClear: true, roomScanCompletedAt: new Date().toISOString(),
      roomScanSampleIds: Array(5).fill('sample'), roomSimilarityReport: mockSimilarityReport(),
      roomPostScanReport: mockPostScanReport(),
    });
    jest.spyOn(models.AssessmentVerificationSession, 'findOne').mockResolvedValue({ session_id: 'verified-room' });
    jest.spyOn(hireProctoringService, 'analyzeRoomScan360').mockResolvedValue({ roomScanClear: true });
    const relay = require('../src/socket/crossInstance');
    const announce = jest.spyOn(relay, 'relayEmit').mockResolvedValue();
    const io = { in: () => ({ fetchSockets: async () => [{ id: 'paired-phone', data: { assessmentVerification: {
      role: 'mobile_camera', sessionId: 'verified-room', mobileStreamId: 'active-stream' } } }] }) };
    const req = { params: { sessionId: session.sessionId }, user: participant,
      body: { frames: [] }, app: { get: () => io } };
    const res = { json: jest.fn().mockReturnThis() };
    await hireProctoringController.roomScan360(req, res);
    expect(res.json).toHaveBeenCalledWith({ roomScanClear: true });
    expect(announce).toHaveBeenCalledWith(io, 'room', 'assessment_verif_verified-room',
      'assessment_verif:workspace_ready', { sessionId: 'verified-room', ready: true });
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
      .rejects.toThrow('180° room scan');
    monitor.metadata.hireProctoring.roomScanCompletedAt = new Date().toISOString();
    monitor.metadata.hireProctoring.roomScanClear = true;
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'CODING', attemptId: 3 }))
      .rejects.toThrow('180° room scan');
    monitor.metadata.hireProctoring.roomPostScanReport = mockPostScanReport();
    monitor.metadata.hireProctoring.roomScanSampleIds = Array(5).fill('/uploads/sector.jpg');
    monitor.metadata.hireProctoring.roomSimilarityReport = mockSimilarityReport();
    monitor.metadata.mobileAdmission = { admittedAt: new Date().toISOString() };
    await expect(verificationService.assertAttemptAdmitted({ participantId: 8, assessmentType: 'CODING', attemptId: 3 })).resolves.toBe(monitor);
  });
});
