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

let captureSequence = 0;
const freshCapture = () => ({
  captureId: `capture-${String(++captureSequence).padStart(8, '0')}`,
  capturedAt: Date.now(),
  mobileStreamId: 'mobile-stream-test-01',
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
    expect(session.metadata.hireProctoring.roomVerificationPhase).toBe('ROOM_PHOTOS_VALIDATED');
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
      ['front', 'left', 'right', 'bottom'].map(step => [step, { verifiedAt: new Date().toISOString() }]));
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
    ai.mockResolvedValue({ data: { valid: true, guideKey: 'desk_ok', message: 'Desk verified.',
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

  test('runs the canonical five-step state machine into a verified 360 sweep', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring = { policy };
    mockOwnership(session);
    const ai = jest.spyOn(axios, 'post').mockImplementation(async (url, payload) => {
      if (url.endsWith('/room-scan-360')) return { data: {
        success: true, complete: true, coverage: 100,
        sectors: Array.from({ length: 8 }, (_, sector) => ({ sector, verified: true })),
        missingSectors: [], pendingObject: null, observations: [],
        guideKey: 'scan_complete', message: '360 complete.', taMessage: '360 முடிந்தது.',
      } };
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
    expect(session.metadata.hireProctoring.roomVerificationPhase).toBe('ROOM_PHOTOS_VALIDATED');
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
    expect(ai).toHaveBeenCalledTimes(6);
  });

  test('360 object warning blocks completion until the sweep restarts and re-verifies', async () => {
    const session = ownedSession('CALIBRATING');
    session.metadata.hireProctoring.sixCaptureStatus = Object.fromEntries(
      hireProctoringService.HIRE_ROOM_STEPS.map(step => [step, { verifiedAt: new Date().toISOString() }]));
    mockOwnership(session);
    const sectors = Array.from({ length: 8 }, (_, sector) => ({ sector, verified: sector !== 2 }));
    const ai = jest.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { success: true, complete: false,
        coverage: 87, sectors, missingSectors: ['Left'], currentDirection: 'Left',
        pendingObject: { sector: 2, label: 'Left', objectType: 'additional phone' }, observations: [] } })
      .mockResolvedValueOnce({ data: { success: true, complete: false,
        coverage: 0, sectors: sectors.map(item => ({ ...item, verified: false })), missingSectors: [],
        pendingObject: null, restarted: true, guideKey: 'scan_restarted', observations: [] } })
      .mockResolvedValueOnce({ data: { success: true, complete: true, coverage: 100,
        sectors: sectors.map(item => ({ ...item, verified: true })), missingSectors: [], pendingObject: null,
        observations: [] } });
    const capture = { sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='], orientations: [{ yaw: 90 }] };

    const blocked = await hireProctoringService.analyzeRoomScan360(capture);
    expect(blocked).toMatchObject({ roomScanClear: false, coverage: 87, pendingObject: { sector: 2 } });
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
      roomScanCompletedAt: new Date().toISOString(),
      roomScanClear: true,
      roomScan360Complete: true,
    };
    mockOwnership(session);
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, complete: false,
      coverage: 25, sectors: [], missingSectors: ['Back'], currentDirection: 'Back',
      pendingObject: { sector: 4, label: 'Back', objectType: 'visible notes / book' }, observations: [] } });
    const capture = { sessionId: session.sessionId, user: participant,
      frames: ['data:image/jpeg;base64,QQ=='], orientations: [{ yaw: 180 }] };

    const result = await hireProctoringService.analyzeRoomScan360(capture);
    expect(result).toMatchObject({ roomScanClear: false, pendingObject: { sector: 4 } });
    expect(session.metadata.hireProctoring.roomScan360Complete).toBe(false);
    expect(session.metadata.hireProctoring.roomScanCompletedAt).toBe(null);
    expect(session.metadata.hireProctoring.roomScanClear).toBe(false);
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
