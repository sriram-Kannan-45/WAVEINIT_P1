const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const monitoringService = require('./monitoringService');
const policyService = require('./hireProctoringPolicy');
const logger = require('../utils/logger');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

const HIRE_ROOM_STEPS = Object.freeze(['front', 'left', 'back', 'right', 'desk', 'floor']);

function publicError(message, status = 400, code = null) { const error = new Error(message); error.status = status; error.code = code; return error; }

async function requireOwnedHireSession(sessionId, user) {
  const session = await monitoringService.getSession(sessionId);
  if (!session) throw publicError('Monitoring session not found', 404);
  if (user.role !== 'PARTICIPANT' || String(session.participantId) !== String(user.id)) throw publicError('This session belongs to another participant', 403);
  const resolved = await policyService.resolvePolicy(session.contextType, session.contextId, user.id);
  if (!resolved.isHire || !resolved.assigned) throw publicError('This endpoint is available only for your assigned Hire assessment', 403);
  if (!resolved.policy.enabled) throw publicError('AI proctoring is disabled for this assessment', 409);
  return { session, ...resolved };
}

async function callAi(pathname, payload, { timeoutMs = 12000, retryTimeoutOnce = false } = {}) {
  for (let attempt = 1; attempt <= (retryTimeoutOnce ? 2 : 1); attempt += 1) {
    try {
      const result = await axios.post(`${AI_SERVICE_URL}${pathname}`, payload,
        { timeout: timeoutMs, maxContentLength: MAX_FRAME_BYTES * 8, maxBodyLength: MAX_FRAME_BYTES * 8 });
      return result.data;
    } catch (error) {
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message || '');
      if (timedOut && retryTimeoutOnce && attempt === 1) {
        logger.warn('ROOM_PHOTO_AI_TIMEOUT_RETRY', { attempt, timeoutMs, pathname });
        continue;
      }
      if (timedOut && retryTimeoutOnce) throw publicError('Photo analysis is taking too long. Please try again.', 504, 'AI_TIMEOUT');
      const isConnectError = !error.response && (
        error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' || error.message?.includes('connect')
      );
      if (isConnectError) {
        throw publicError('Verification service is temporarily unavailable. Please try again.', 503, 'SERVER_ERROR');
      }
      const responseStatus = error.response?.status;
      const detail = error.response?.data?.detail || error.response?.data?.message || error.message || 'AI verification unavailable';
      // A rejected image is a candidate retake; a missing route or failed service is operational.
      const status = responseStatus === 422 ? 422 : 503;
      throw publicError(status === 422 ? detail : 'Verification service is temporarily unavailable. Please try again.', status,
        status === 422 ? 'INVALID_IMAGE' : 'SERVER_ERROR');
    }
  }
}

async function saveEvidence(frame, sessionId, label) {
  if (!frame) return null;
  const match = String(frame).match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_FRAME_BYTES) return null;
  const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeSessionId) return null;
  const dir = path.resolve(__dirname, '../../uploads/hire-proctoring', safeSessionId);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${label}_${crypto.randomBytes(8).toString('hex')}.${match[1] === 'png' ? 'png' : 'jpg'}`;
  await fs.promises.writeFile(path.join(dir, filename), buffer, { flag: 'wx' });
  return `/uploads/hire-proctoring/${safeSessionId}/${filename}`;
}

async function storeIdentityReference({ sessionId, user, frames, challenge }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.identityVerification) return { skipped: true, policy };
  if (session.metadata?.hireProctoring?.identityVerifiedAt) throw publicError('Identity is already locked for this assessment session', 409);
  if (!['CALIBRATING', 'READY', 'ACTIVE'].includes(session.status)) throw publicError('Identity verification must finish before the assessment starts', 409);
  const hireState = session.metadata?.hireProctoring || {};
  const completed = Array.isArray(hireState.completedLivenessChallenges) ? hireState.completedLivenessChallenges : [];
  const sequence = policy.livenessDetection === false ? ['LOOK_CENTER'] : ['TURN_LEFT', 'TURN_RIGHT', 'LOOK_CENTER'];
  if (sequence[completed.length] !== challenge) throw publicError('Liveness challenge is out of sequence', 409);
  const result = await callAi('/api/proctoring/hire/identity-reference', {
    sessionId, frames, challenge, requireLiveness: policy.livenessDetection,
    neutralYaw: hireState.livenessNeutralYaw ?? null,
    previousYaw: hireState.livenessLastPoseYaw ?? null,
  }, { timeoutMs: 25000 });
  if (result.success && result.challengeCompleted === false) {
    return { success: true, challengeCompleted: false, challenge, detectedMovement: null,
      completedChallenges: completed, message: result.message || 'Movement not detected yet.' };
  }
  if (!result.success) {
    const evidenceRef = policy.evidenceCapture && policy.evidenceMode !== 'NONE' ? await saveEvidence(frames?.[frames.length - 1], sessionId, 'liveness') : null;
    await monitoringService.reportEvent({ sessionId, participantId: user.id, eventType: 'LIVENESS_FAILED', severity: 'HIGH', confidence: 1, evidenceRef,
      metadata: { hireProctoring: true, challenge } });
    // Give a meaningful message rather than a generic one so the UI can
    // route to the correct explanation panel.
    const msg = result.message || 'Liveness not detected. Please ensure you are well-lit, face the camera, and follow the movement instruction.';
    throw publicError(msg, 422);
  }
  if (result.challengeCompleted !== true || result.detectedMovement !== challenge.replace('TURN_', '').replace('LOOK_', '')) {
    throw publicError('Liveness result did not match the active challenge', 422);
  }
  const nextCompleted = [...completed, challenge];
  const nextChallenge = sequence[nextCompleted.length] || null;
  const verified = nextChallenge === null;
  await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: {
    ...hireState, policy, completedLivenessChallenges: nextCompleted,
    livenessNeutralYaw: result.neutralYaw, challenge: nextChallenge,
    livenessLastPoseYaw: result.poseYaw,
    challengeExpiresAt: nextChallenge ? new Date(Date.now() + 2 * 60_000).toISOString() : null,
    ...(verified ? { identitySignature: result.signature, identityVerifiedAt: new Date().toISOString(),
      livenessPassed: !!result.livenessPassed, livenessChallenge: nextCompleted } : {}),
  } } });
  return { success: true, challengeCompleted: true, detectedMovement: result.detectedMovement,
    challenge, completedChallenges: nextCompleted, nextChallenge, verified,
    livenessPassed: verified && !!result.livenessPassed, policy };
}

async function verifyIdentity({ sessionId, user, frame }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!['ACTIVE', 'PAUSED'].includes(session.status)) throw publicError('Continuous identity checks run only during an active assessment', 409);
  const reference = session.metadata?.hireProctoring?.identitySignature;
  if (!reference) throw publicError('Complete identity and liveness verification first', 409);
  const result = await callAi('/api/proctoring/hire/identity-verify', { sessionId, frame, referenceSignature: reference });
  const previousFailures = Number(session.metadata?.hireProctoring?.consecutiveIdentityFailures) || 0;
  if (!result.matched) {
    const consecutiveIdentityFailures = previousFailures + 1;
    await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: { ...(session.metadata?.hireProctoring || {}), consecutiveIdentityFailures, lastIdentityCheckAt: new Date().toISOString() } } });
    // Require two consecutive mismatches before persisting biometric evidence.
    // This reduces single-frame false positives and keeps storage/inference costs bounded.
    if (consecutiveIdentityFailures >= 2) {
      const evidenceRef = policy.evidenceCapture && policy.evidenceMode !== 'NONE' ? await saveEvidence(frame, sessionId, 'identity') : null;
      const timeBucket = Math.floor(Date.now() / (Math.max(15, policy.identityCheckIntervalSeconds) * 2000));
      await monitoringService.reportEvent({ sessionId, participantId: user.id, eventType: 'IDENTITY_MISMATCH', severity: 'CRITICAL', confidence: result.confidence || 1, evidenceRef,
        idempotencyKey: `hire_identity_${sessionId}_${timeBucket}`, metadata: { similarity: result.similarity, hireProctoring: true, consecutiveIdentityFailures } });
    }
  } else if (previousFailures) {
    await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: { ...(session.metadata?.hireProctoring || {}), consecutiveIdentityFailures: 0, lastIdentityCheckAt: new Date().toISOString() } } });
  }
  return { matched: !!result.matched, similarity: result.similarity, confidence: result.confidence, consecutiveFailures: result.matched ? 0 : previousFailures + 1, checkedAt: new Date().toISOString() };
}

async function inspectRoom({ sessionId, user, frames }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409);
  if (!Array.isArray(frames) || frames.length < policy.roomScanMinFrames || frames.length > 12) throw publicError(`Capture ${policy.roomScanMinFrames}–12 room-scan frames`, 422);
  const uniqueFrames = new Set(frames.map(frame => crypto.createHash('sha256').update(String(frame)).digest('hex')));
  if (uniqueFrames.size < policy.roomScanMinFrames) throw publicError('Capture a different view for every room-scan angle', 422);
  const findings = [];
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const finding = await callAi('/api/proctoring/yolo/analyze-frame', {
      frame: frames[frameIndex], sessionId, participantId: user.id, moduleType: session.contextType, cameraSource: 'MOBILE_CAMERA', confidenceThreshold: 0.35,
    });
    findings.push({ ...finding, frameIndex });
  }
  // A laptop/primary monitor is required for the assessment and is not itself
  // unauthorized. Existing live monitoring remains responsible for secondary-device rules.
  const forbidden = new Set(['cell phone', 'mobile phone', 'phone', 'book', 'tv', 'tablet', 'earbuds']);
  const detected = findings.flatMap(item => (item.detections || []).map(detection => ({ ...detection, frameIndex: item.frameIndex }))).filter(item => forbidden.has(String(item.class_name || item.class || '').toLowerCase()));
  const hasUnauthorizedObjects = policy.unauthorizedObjectDetection && detected.length > 0;
  if (hasUnauthorizedObjects) {
    const evidenceRef = policy.evidenceCapture && policy.evidenceMode !== 'NONE' ? await saveEvidence(frames[detected[0]?.frameIndex || 0] || frames[0], sessionId, 'room') : null;
    await monitoringService.reportEvent({ sessionId, participantId: user.id, source: 'MOBILE', eventType: 'ROOM_SCAN_OBJECT_DETECTED', severity: 'CRITICAL',
      confidence: Math.max(...detected.map(item => Number(item.confidence) || 0.7)), evidenceRef, metadata: { hireProctoring: true, detectedObjects: detected.slice(0, 20) } });
  }
  await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: { ...(session.metadata?.hireProctoring || {}), roomScanCompletedAt: new Date().toISOString(), roomScanClear: !hasUnauthorizedObjects } } });
  return { clear: !hasUnauthorizedObjects, detectedObjects: hasUnauthorizedObjects ? detected.map(item => item.class_name || item.class) : [], framesAnalyzed: findings.length };
}

function hireProctoringState(session) {
  return session.metadata?.hireProctoring || {};
}

async function updateHireState(session, patch) {
  await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: { ...hireProctoringState(session), ...patch } } });
}

function allSixCaptured(sixCaptureStatus) {
  return HIRE_ROOM_STEPS.every(step => sixCaptureStatus?.[step]?.verifiedAt);
}

async function analyzeRoomStep({ sessionId, user, step, frame, orientation = null, laptopFrames = [] }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, step, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409);
  const normalizedStep = String(step || '').toLowerCase();
  if (!HIRE_ROOM_STEPS.includes(normalizedStep)) throw publicError('Unsupported room capture step', 422);
  const photo = Buffer.isBuffer(frame) ? `data:image/jpeg;base64,${frame.toString('base64')}` : frame;
  if (!photo || String(photo).length > MAX_FRAME_BYTES) throw publicError('Camera photo missing or too large', 422);
  if (!Array.isArray(laptopFrames) || laptopFrames.length > 6 || laptopFrames.some(item => typeof item !== 'string' || item.length > 180000))
    throw publicError('Laptop camera sample is invalid', 422);
  const initialState = hireProctoringState(session);
  const pending = HIRE_ROOM_STEPS.find(name => !initialState.sixCaptureStatus?.[name]?.verifiedAt);
  if (normalizedStep !== pending) throw publicError('Capture the current room step first', 409);

  const startedAt = Date.now();
  logger.info('AI_ANALYSIS_START', { sessionId, step: normalizedStep, photoBytes: Buffer.isBuffer(frame) ? frame.length : undefined });
  const result = await callAi('/api/proctoring/hire/room-step', {
    sessionId, step: normalizedStep, frame: photo,
    threshold: (policy.roomScanCoverageThreshold / 100) - 0.3,
    priorCaptures: Object.entries(initialState.sixCaptureStatus || {}).filter(([, capture]) => capture.verifiedAt)
      .map(([name, capture]) => ({ step: name, visualSignature: capture.visualSignature,
        sceneDescriptor: capture.sceneDescriptor, orientation: capture.orientation })),
    orientation, laptopFrames, requireLaptop: true,
  }, { timeoutMs: 18000, retryTimeoutOnce: true });
  logger.info('AI_ANALYSIS_COMPLETE', { sessionId, step: normalizedStep, durationMs: Date.now() - startedAt });
  logger.info('AI_RESPONSE', { sessionId, step: normalizedStep, valid: result.valid === true,
    confidence: result.confidence, guideKey: result.guideKey });
  if (result.success === false || typeof result.valid !== 'boolean') {
    throw publicError('Verification service is temporarily unavailable. Please try again.', 503, 'SERVER_ERROR');
  }

  const state = hireProctoringState(session);
  const sixCaptureStatus = { ...(state.sixCaptureStatus || {}) };
  const previous = sixCaptureStatus[normalizedStep] || {};
  const attempts = Number(previous.attempts) || 0;
  const captured = {
    verifiedAt: previous.verifiedAt || null,
    coverage: Number(previous.coverage) || 0,
    confidence: Number(previous.confidence) || 0,
    attempts: attempts + 1,
  };

  const blockingObservations = (result.observations || []).filter(obs =>
    obs.objectType === 'additional person' || (policy.unauthorizedObjectDetection &&
      ['additional phone', 'visible notes / book', 'tablet', 'second laptop', 'additional monitor'].includes(obs.objectType)));
  captured.observations = [...(previous.observations || []), ...(result.observations || [])].slice(-50);
  captured.observationEvidencePaths = previous.observationEvidencePaths || [];
  if (blockingObservations.length && policy.evidenceCapture && policy.evidenceMode !== 'NONE') {
    const evidencePath = await saveEvidence(photo, sessionId, `room_${normalizedStep}_observation`);
    if (evidencePath) captured.observationEvidencePaths = [...captured.observationEvidencePaths, evidencePath].slice(-5);
  }
  if (result.valid && !result.sameFrame && !blockingObservations.length) {
    captured.verifiedAt = new Date().toISOString();
    captured.coverage = Number(result.coverage) || 0;
    captured.confidence = Number(result.confidence) || 0;
    if (result.visualSignature) captured.visualSignature = result.visualSignature;
    if (result.sceneDescriptor) captured.sceneDescriptor = result.sceneDescriptor;
    if (result.orientation) captured.orientation = result.orientation;
    if (Array.isArray(result.detectedObjects) && result.detectedObjects.length) {
      captured.detectedObjects = result.detectedObjects;
    }
    if (policy.evidenceCapture && policy.evidenceMode !== 'NONE') {
      captured.evidencePath = await saveEvidence(photo, sessionId, `room_${normalizedStep}`);
    }
  } else if (result.sameFrame) {
    captured.verifiedAt = previous.verifiedAt || null;
  }

  sixCaptureStatus[normalizedStep] = captured;
  if (blockingObservations.length) captured.retakeReason = blockingObservations[0].objectType;
  else if (!captured.verifiedAt) captured.retakeReason = result.guideKey || 'unclear';
  await updateHireState(session, { sixCaptureStatus });

  // Neutral observations persist for the human reviewer — never a verdict.
  const mergedObservations = state.roomObservations || [];
  if (Array.isArray(result.observations) && result.observations.length) {
    const seen = new Set(mergedObservations.map(obs => `${obs.objectType}:${JSON.stringify(obs.box)}`));
    for (const obs of result.observations) {
      const key = `${obs.objectType}:${JSON.stringify(obs.box)}`;
      if (!seen.has(key)) { mergedObservations.push(obs); seen.add(key); }
    }
    await updateHireState(session, { roomObservations: mergedObservations.slice(-100) });
  }

  const observed = blockingObservations[0]?.objectType;
  const objectNames = {
    'additional phone': ['An additional phone', 'கூடுதல் கைப்பேசி'],
    'visible notes / book': ['Notes or a book', 'குறிப்புகள் அல்லது புத்தகம்'],
    tablet: ['A tablet', 'டேப்லெட்'],
    'second laptop': ['An additional laptop', 'கூடுதல் மடிக்கணினி'],
    'additional monitor': ['An additional display', 'கூடுதல் திரை'],
  };
  const objectName = objectNames[observed];
  const message = observed === 'additional person'
    ? 'Another person may be visible. Please ensure you are alone and take this photo again.'
    : objectName ? `${objectName[0]} is visible. Please remove it and take the ${normalizedStep} photo again.`
      : captured.verifiedAt ? result.message : `${result.message || 'Photo is unclear.'} Please take the ${normalizedStep} photo again.`;
  const taMessage = observed === 'additional person'
    ? 'மற்றொரு நபர் காணப்படுகிறார். தயவுசெய்து நீங்கள் மட்டும் இருப்பதை உறுதி செய்து இந்தப் புகைப்படத்தை மீண்டும் எடுக்கவும்.'
    : objectName ? `${objectName[1]} காணப்படுகிறது. அதை அகற்றி இந்தப் புகைப்படத்தை மீண்டும் எடுக்கவும்.`
      : captured.verifiedAt ? result.taMessage : `${result.taMessage || 'புகைப்படம் தெளிவாக இல்லை.'} இந்தப் புகைப்படத்தை மீண்டும் எடுக்கவும்.`;

  const response = {
    success: true,
    step: normalizedStep,
    valid: !!captured.verifiedAt,
    verified: !!captured.verifiedAt,
    reason: message,
    retry: !captured.verifiedAt,
    verifiedBefore: !!previous.verifiedAt,
    coverage: captured.coverage,
    confidence: captured.confidence,
    attempts: captured.attempts,
    guideKey: blockingObservations.length ? 'remove_observation' : (result.guideKey || null),
    message,
    taMessage,
    observations: result.observations || [],
    detectedObjects: result.detectedObjects || [],
    sixCaptureStatus,
    allSixCaptured: allSixCaptured(sixCaptureStatus),
  };
  logger.info('VERIFICATION_RESULT', { sessionId, step: normalizedStep, verified: response.verified,
    confidence: response.confidence, attempts: response.attempts });
  return response;
}

async function analyzeRoomScan360({ sessionId, user, frames, orientations = [], laptopFrames = [] }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409);
  if (!Array.isArray(frames) || !frames.length || frames.length > 12) throw publicError('Submit 1–12 sampled scan frames', 422);
  if (!Array.isArray(laptopFrames) || laptopFrames.length > 6 || laptopFrames.some(item => typeof item !== 'string' || item.length > 180000))
    throw publicError('Laptop camera sample is invalid', 422);
  if (!allSixCaptured(hireProctoringState(session).sixCaptureStatus)) throw publicError('Verify all six room photos before the 360° scan', 409);

  const result = await callAi('/api/proctoring/hire/room-scan-360', { sessionId, frames, orientations,
    laptopFrames, requireLaptop: true, blockObjects: policy.unauthorizedObjectDetection === true },
    { timeoutMs: 18000, retryTimeoutOnce: true });

  const state = hireProctoringState(session);
  const coverage = Number(result.coverage) || 0;
  const patch = {
    roomScanCoverage: Math.min(100, Math.max(0, coverage)),
    roomScan360Complete: !!result.complete,
    roomScanGuideKey: result.guideKey || null,
    roomScanMessage: result.message || null,
    roomScanTaMessage: result.taMessage || null,
    roomScanSectors: result.sectors || state.roomScanSectors || [],
    roomScanPendingObject: result.pendingObject || null,
  };
  const mergedObservations = state.roomObservations || [];
  if (Array.isArray(result.observations) && result.observations.length) {
    const seen = new Set(mergedObservations.map(obs => `${obs.objectType}:${JSON.stringify(obs.box)}`));
    for (const obs of result.observations) {
      const key = `${obs.objectType}:${JSON.stringify(obs.box)}`;
      if (!seen.has(key)) { mergedObservations.push(obs); seen.add(key); }
    }
    patch.roomObservations = mergedObservations.slice(-100);
  }

  if (result.complete && !result.pendingObject && policy.roomScanCoverageThreshold != null && coverage >= policy.roomScanCoverageThreshold) {
    const six = state.sixCaptureStatus || {};
    if (allSixCaptured(six)) {
      // Room verification is only complete when the six guided captures passed
      // AND the 360 sweep reached the required coverage. Observations remain
      // neutral and are never treated as a verdict.
      patch.roomScanCompletedAt = new Date().toISOString();
      patch.roomScanClear = true;
      patch.roomScanCoverageAt = Number(coverage);
      patch.sixCaptureStatus = six;
    } else {
      patch.pendingSteps = HIRE_ROOM_STEPS.filter(step => !six[step]?.verifiedAt);
    }
  }

  await updateHireState(session, patch);

  return {
    complete: !!result.complete,
    coverage,
    coverageThreshold: policy.roomScanCoverageThreshold,
    guideKey: result.guideKey || null,
    message: result.message || null,
    taMessage: result.taMessage || null,
    samplesSeen: Number(result.samplesSeen) || 0,
    sectors: result.sectors || [],
    missingSectors: result.missingSectors || [],
    currentDirection: result.currentDirection || null,
    pendingObject: result.pendingObject || null,
    pendingSteps: patch.pendingSteps || [],
    observations: result.observations || [],
    detectedObjects: result.detectedObjects || [],
    roomScanCompletedAt: patch.roomScanCompletedAt || state.roomScanCompletedAt || null,
    roomScanClear: patch.roomScanClear === true ? true : (state.roomScanClear === true),
  };
}

async function getRoomVerificationState({ sessionId, user }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  const state = hireProctoringState(session);
  return {
    sixCaptureStatus: state.sixCaptureStatus || null,
    roomScanCoverage: Number(state.roomScanCoverage) || 0,
    roomScan360Complete: state.roomScan360Complete === true,
    roomScanCompletedAt: state.roomScanCompletedAt || null,
    roomScanClear: state.roomScanClear === true,
    roomScanSectors: state.roomScanSectors || [],
    roomScanPendingObject: state.roomScanPendingObject || null,
    roomObservations: state.roomObservations || [],
    roomScanCoverageThreshold: policy.roomScanCoverageThreshold,
  };
}

module.exports = { requireOwnedHireSession, storeIdentityReference, verifyIdentity, inspectRoom, analyzeRoomStep, analyzeRoomScan360, getRoomVerificationState, saveEvidence, HIRE_ROOM_STEPS };
