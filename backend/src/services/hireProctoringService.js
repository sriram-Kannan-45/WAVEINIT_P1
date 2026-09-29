const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const monitoringService = require('./monitoringService');
const policyService = require('./hireProctoringPolicy');
const logger = require('../utils/logger');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const ROOM_CAPTURE_MAX_AGE_MS = Number(process.env.ROOM_CAPTURE_MAX_AGE_MS) || 15000;
const ROOM_CAPTURE_FUTURE_SKEW_MS = 5000;
const ROOM_CAPTURE_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

// Canonical guided room steps per the Hire spec:
// FRONT, LEFT, RIGHT, BOTTOM (lower area / floor), DESK.
// The former UP (upper area / ceiling) step was removed from the flow.
const HIRE_ROOM_STEPS = Object.freeze(['front', 'left', 'right', 'bottom', 'desk']);

// Steps stored by older builds: `floor` (tilt-down view) and `back` (the old
// turn-around view). `floor` decodes to the current schema so in-flight records
// never regress to a partial state; `back` is no longer part of the flow and is
// simply ignored by the step gates.
const LEGACY_STEP_MAP = Object.freeze({ floor: 'bottom' });

// Aggregated outcome of one finished 180-degree recording. `PASS` admits the
// room, `FLAG` means the sweep itself was usable but a prohibited object or an
// extra person has to be dealt with, and `RETRY` means the recording has to be
// repeated. Both non-pass verdicts re-arm recording; only the message differs.
const ROOM_SCAN_VERDICTS = Object.freeze(['PASS', 'FLAG', 'RETRY']);

function normalizedSixCaptureStatus(sixCaptureStatus) {
  if (!sixCaptureStatus) return sixCaptureStatus;
  const normalized = {};
  for (const [name, capture] of Object.entries(sixCaptureStatus)) {
    normalized[LEGACY_STEP_MAP[name] || name] = capture;
  }
  return normalized;
}

function roomCaptureBuffer(frame) {
  if (Buffer.isBuffer(frame)) return frame;
  const match = String(frame || '').match(/^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/);
  return match ? Buffer.from(match[1], 'base64') : null;
}

function pendingRoomState(sixCaptureStatus) {
  const pending = HIRE_ROOM_STEPS.find(name => !normalizedSixCaptureStatus(sixCaptureStatus)?.[name]?.verifiedAt);
  return pending ? `ROOM_${pending.toUpperCase()}_PENDING` : 'ROOM_PHOTOS_VALIDATED';
}

// Structured failure reasons surfaced to the phone UI and audit logs so a
// retake is never an unexplained loop.
// Maps the AI room-scanner's machine-readable failure reason onto the stable
// audit/UI vocabulary. The scanner's `reason` is the ACTUAL cause of a
// rejection, so it is honoured first -- a retake is never an unexplained loop
// and never a generic "photo not verified".
const ROOM_STEP_REASON_CODES = {
  resolution_too_low: 'RESOLUTION_TOO_LOW',
  image_corrupt: 'IMAGE_UNREADABLE',
  too_dark: 'FRAME_TOO_DARK',
  overexposed: 'FRAME_OVEREXPOSED',
  no_visual_information: 'CAMERA_BLOCKED',
  camera_blocked: 'CAMERA_BLOCKED',
  blurred: 'FRAME_TOO_BLURRY',
  quality_too_low: 'QUALITY_TOO_LOW',
  quality_below_threshold: 'QUALITY_TOO_LOW',
  low_information: 'QUALITY_TOO_LOW',
  duplicate_image: 'DUPLICATE_IMAGE',
  view_too_similar: 'TOO_SIMILAR_TO_PREVIOUS_VIEW',
  wrong_direction: 'WRONG_DIRECTION',
  webcam_unavailable: 'WEBCAM_VALIDATION_FAILED',
  multiple_persons: 'MULTIPLE_PERSONS_DETECTED',
  participant_not_visible: 'PARTICIPANT_NOT_DETECTED',
  movement_unconfirmed: 'INSUFFICIENT_CAMERA_MOVEMENT',
};

function stepFailureReason(result = {}) {
  if (result.sameFrame === true) return 'DUPLICATE_IMAGE';
  if (result.sameView === true) return 'TOO_SIMILAR_TO_PREVIOUS_VIEW';
  if (result.wrongDirection === true) return 'WRONG_DIRECTION';
  if (result.guideKey === 'participant_missing') return 'PARTICIPANT_NOT_DETECTED';
  if (result.guideKey === 'multiple_participants') return 'MULTIPLE_PERSONS_DETECTED';
  if (result.guideKey === 'laptop_camera_required') return 'WEBCAM_VALIDATION_FAILED';
  if (['movement_unconfirmed', 'laptop_motion_missing'].includes(result.guideKey)) {
    return result.laptopMovement && result.laptopMovement.available === true
      ? 'INSUFFICIENT_CAMERA_MOVEMENT' : 'WEBCAM_VALIDATION_FAILED';
  }
  if (result.guideKey === 'blurred') return 'FRAME_TOO_BLURRY';
  if (result.guideKey === 'dark' || result.guideKey === 'lighting') return 'FRAME_TOO_DARK';
  // The scanner's own reason names the real cause, so surface it verbatim
  // instead of collapsing every unknown failure into INVALID_IMAGE.
  if (result.reason && ROOM_STEP_REASON_CODES[result.reason]) {
    return ROOM_STEP_REASON_CODES[result.reason];
  }
  return 'INVALID_IMAGE';
}

// Serializes every room-verification mutation for a given session through a
// promise chain. The HTTP routes (room-step / room-scan-360 / room-scan) have
// no database lock, so without this a concurrent stale call could overwrite a
// newer verdict (e.g. "complete" after an object was blocked) and re-open the
// admission gate. A same-process chain is the cheapest correct guard; cross-
// process deployments should additionally rely on the row's updatedAt check.
const sessionMutationChains = new Map();

function enqueueSessionMutation(sessionId, task) {
  const previous = sessionMutationChains.get(sessionId) || Promise.resolve();
  const current = previous.then(task, task);
  // The tail never rejects; the caller still sees the real error from `current`.
  const tail = current.catch(() => {});
  sessionMutationChains.set(sessionId, tail);
  tail.then(() => {
    if (sessionMutationChains.get(sessionId) === tail) sessionMutationChains.delete(sessionId);
  });
  return current;
}

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
  let completed = Array.isArray(hireState.completedLivenessChallenges) ? hireState.completedLivenessChallenges : [];
  const sequence = policy.livenessDetection === false ? ['LOOK_CENTER'] : ['TURN_LEFT', 'TURN_RIGHT', 'LOOK_CENTER'];
  const expecting = sequence[completed.length];
  if (expecting !== challenge) {
    // When every challenge in the sequence has run without yielding identity
    // verification, the controller asks for the first challenge again. Accept
    // that as a restart of the sequence instead of a permanent 409 dead-end.
    const requiresRestart = completed.length >= sequence.length && sequence[0] === challenge;
    if (!requiresRestart) throw publicError('Liveness challenge is out of sequence', 409);
    completed = [];
  }
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
  const challengeMatches = result.challengeCompleted === true
    ? result.detectedMovement === challenge.replace('TURN_', '').replace('LOOK_', '')
    : (result.livenessPassed === true || result.challenge === challenge);
  if (!challengeMatches) {
    throw publicError('Liveness result did not match the active challenge', 422);
  }
  const nextCompleted = [...completed, challenge];
  const nextChallenge = (result.challengeCompleted === undefined && result.livenessPassed)
    ? null
    : (sequence[nextCompleted.length] || null);
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
    livenessPassed: !!result.livenessPassed, policy };
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

async function inspectRoom(payload) {
  return enqueueSessionMutation(String(payload.sessionId), () => inspectRoomUnlocked(payload));
}

async function inspectRoomUnlocked({ sessionId, user }) {
  const { policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, policy };
  // The legacy free-scan route cannot prove coverage or compare all reference photos.
  throw publicError('Use the guided 180° room verification flow.', 410, 'GUIDED_SCAN_REQUIRED');
}

function hireProctoringState(session) {
  return session.metadata?.hireProctoring || {};
}

async function updateHireState(session, patch) {
  if (typeof session.reload === 'function') {
    try { await session.reload(); } catch (_) {}
  }
  const currentMetadata = session.metadata || {};
  const currentHire = currentMetadata.hireProctoring || {};
  const mergedHire = { ...currentHire, ...patch };
  if (patch.sixCaptureStatus && currentHire.sixCaptureStatus) {
    mergedHire.sixCaptureStatus = {
      ...currentHire.sixCaptureStatus,
      ...patch.sixCaptureStatus,
    };
  }
  await session.update({
    metadata: {
      ...currentMetadata,
      hireProctoring: mergedHire,
    },
  });
}

function allRoomCapturesVerified(sixCaptureStatus) {
  return HIRE_ROOM_STEPS.every(step => sixCaptureStatus?.[step]?.verifiedAt);
}

function makeRoomReference(sessionId, captures, createdAt = null) {
  if (!allRoomCapturesVerified(captures) || HIRE_ROOM_STEPS.some(name =>
    !captures[name].visualSignature || !captures[name].sceneDescriptor || !captures[name].evidencePath)) return null;
  return { sessionId: String(sessionId), referenceCreatedAt: createdAt || new Date().toISOString(),
    photos: HIRE_ROOM_STEPS.map(name => ({ stepId: captures[name].stepId ||
      `ROOM_STEP_${String(HIRE_ROOM_STEPS.indexOf(name) + 1).padStart(2, '0')}`,
      direction: name.toUpperCase(), imageId: captures[name].evidencePath,
      capturedAt: captures[name].lastCapturedAt || captures[name].verifiedAt,
      qualityScore: captures[name].qualityScore ?? null,
      visualSignature: captures[name].visualSignature,
      sceneDescriptor: captures[name].sceneDescriptor,
      featureDescriptor: captures[name].featureDescriptor || '' })) };
}

function publicCaptureStatuses(captures) {
  if (!captures) return null;
  return Object.fromEntries(Object.entries(normalizedSixCaptureStatus(captures)).map(([name, capture]) =>
    [name, { verifiedAt: capture.verifiedAt || null, attempts: capture.attempts || 0,
      retakeReason: capture.retakeReason || null, qualityScore: capture.qualityScore ?? null,
      evidencePath: capture.evidencePath || null }]));
}

function logHireDecision(event, payload, phase = 'ROOM_PHOTO') {
  logger.info(`HIRE_VERIFICATION_DECISION_${event}`, {
    phase,
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

async function analyzeRoomStep(payload) {
  return enqueueSessionMutation(String(payload.sessionId), () => analyzeRoomStepUnlocked(payload));
}

async function analyzeRoomStepUnlocked({ sessionId, user, step, frame, orientation = null, laptopFrames = [],
  captureId, capturedAt, mobileStreamId, transportSessionId = null }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, step, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409, 'ROOM_PHASE_INVALID');
  const normalizedStep = String(step || '').toLowerCase();
  if (!HIRE_ROOM_STEPS.includes(normalizedStep)) throw publicError('Unsupported room capture step', 422, 'UNSUPPORTED_STEP');
  if (!ROOM_CAPTURE_ID_PATTERN.test(String(captureId || ''))) {
    throw publicError('Capture identifier is missing or invalid', 422, 'INVALID_CAPTURE_ID');
  }
  if (!ROOM_CAPTURE_ID_PATTERN.test(String(mobileStreamId || ''))) {
    throw publicError('The active mobile camera stream could not be verified', 409, 'CAMERA_NOT_READY');
  }
  const capturedAtMs = Number(capturedAt);
  const captureAgeMs = Date.now() - capturedAtMs;
  if (!Number.isFinite(capturedAtMs) || captureAgeMs > ROOM_CAPTURE_MAX_AGE_MS || captureAgeMs < -ROOM_CAPTURE_FUTURE_SKEW_MS) {
    throw publicError('That camera frame is no longer fresh. Capture a new photo.', 409, 'STALE_CAPTURE');
  }
  const photo = Buffer.isBuffer(frame) ? `data:image/jpeg;base64,${frame.toString('base64')}` : frame;
  if (!photo || String(photo).length > MAX_FRAME_BYTES) throw publicError('Camera photo missing or too large', 422, 'INVALID_IMAGE');
  const photoBuffer = roomCaptureBuffer(frame);
  if (!photoBuffer?.length) throw publicError('Camera photo is invalid', 422, 'INVALID_IMAGE');
  const imageHash = crypto.createHash('sha256').update(photoBuffer).digest('hex');
  if (!Array.isArray(laptopFrames) || laptopFrames.length > 6 || laptopFrames.some(item => typeof item !== 'string' || item.length > 180000))
    throw publicError('Laptop camera sample is invalid', 422, 'INVALID_LAPTOP_SAMPLE');
  const initialState = hireProctoringState(session);
  const initialCaptures = normalizedSixCaptureStatus(initialState.sixCaptureStatus) || {};
  const pending = HIRE_ROOM_STEPS.find(name => !initialCaptures[name]?.verifiedAt);
  if (normalizedStep !== pending) {
    // A code-less error here used to collapse into SERVER_ERROR, so a plain
    // client/server step desync surfaced as "service temporarily unavailable".
    // Report the authoritative pending step so the caller can re-sync.
    const error = publicError('Capture the current room step first', 409, 'STEP_OUT_OF_ORDER');
    error.expectedStep = pending || null;
    throw error;
  }
  const captureHistory = Array.isArray(initialState.roomCaptureAttempts) ? initialState.roomCaptureAttempts : [];
  if (captureHistory.some(item => item?.captureId === captureId)) {
    throw publicError('This capture was already submitted. Take a new photo.', 409, 'CAPTURE_REPLAY');
  }
  const duplicateAttempt = captureHistory.find(item => item?.imageHash === imageHash && item.validationStatus !== 'ERROR');
  const captureAudit = {
    captureId: String(captureId), step: normalizedStep, imageHash,
    capturedAt: new Date(capturedAtMs).toISOString(), receivedAt: new Date().toISOString(),
    mobileStreamId: String(mobileStreamId), transportSessionId: transportSessionId || null,
  };
  await updateHireState(session, { roomCaptureAttempts: [...captureHistory, captureAudit].slice(-60),
    roomVerificationPhase: `ROOM_${normalizedStep.toUpperCase()}_PENDING` });

  if (duplicateAttempt) {
    const sixCaptureStatus = { ...(initialState.sixCaptureStatus || {}) };
    const previous = sixCaptureStatus[normalizedStep] || {};
    sixCaptureStatus[normalizedStep] = {
      ...previous,
      verifiedAt: previous.verifiedAt || null,
      attempts: (Number(previous.attempts) || 0) + 1,
      retakeReason: 'duplicate_image',
      lastCaptureId: String(captureId),
    };
    await updateHireState(session, { sixCaptureStatus,
      roomVerificationPhase: `ROOM_${normalizedStep.toUpperCase()}_PENDING`,
      roomCaptureAttempts: [...captureHistory, { ...captureAudit,
        validationStatus: 'REJECTED', duplicate: true, failureReason: 'DUPLICATE_IMAGE' }].slice(-60) });
    const direction = normalizedStep.toUpperCase();
    const message = `This photo was already submitted for ${String(duplicateAttempt.step || 'another view').toUpperCase()}. Capture a fresh ${direction} view.`;
    const taMessage = `இந்தப் புகைப்படம் முன்பே சமர்ப்பிக்கப்பட்டது. புதிய ${direction} காட்சியைப் படம் எடுக்கவும்.`;
    logHireDecision('ROOM_PHOTO', {
      sessionId, captureId, mobileFrameTimestamp: capturedAtMs, step: normalizedStep,
      decision: 'REJECT', reason: 'DUPLICATE_IMAGE', failureReason: 'DUPLICATE_IMAGE',
      duplicateOfCaptureId: duplicateAttempt.captureId, mobileStreamId,
    });
    return {
      success: true, step: normalizedStep, captureId: String(captureId), valid: false, verified: false,
      reason: message, retry: true, verifiedBefore: !!previous.verifiedAt,
      failureReason: 'DUPLICATE_IMAGE', coverage: Number(previous.coverage) || 0,
      confidence: Number(previous.confidence) || 0, attempts: sixCaptureStatus[normalizedStep].attempts,
      guideKey: 'duplicate_image', message, taMessage, observations: [], detectedObjects: [],
      sixCaptureStatus: publicCaptureStatuses(sixCaptureStatus), allCapturesVerified: allRoomCapturesVerified(sixCaptureStatus),
    };
  }

  const startedAt = Date.now();
  logger.info('AI_ANALYSIS_START', { sessionId, captureId, step: normalizedStep,
    mobileFrameTimestamp: capturedAtMs, mobileStreamId, photoBytes: photoBuffer.length });
  let result;
  try {
    result = await callAi('/api/proctoring/hire/room-step', {
    sessionId, captureId, capturedAt: capturedAtMs, mobileStreamId, step: normalizedStep, frame: photo,
    // Accept bar for one photo, expressed on the scanner's 0..1 coverage scale.
    // This is the room-PHOTO quality bar, not the 360-degree sweep percentage.
    threshold: (policy.roomPhotoQualityThreshold / 100),
    priorCaptures: Object.entries(initialCaptures).filter(([, capture]) => capture.verifiedAt)
      .map(([name, capture]) => ({ step: name, visualSignature: capture.visualSignature,
        sceneDescriptor: capture.sceneDescriptor, featureDescriptor: capture.featureDescriptor,
        orientation: capture.orientation })),
    orientation, laptopFrames, requireLaptop: true,
    duplicateThreshold: policy.roomDuplicateSimilarityThreshold,
    }, { timeoutMs: 18000, retryTimeoutOnce: true });
  } catch (error) {
    await updateHireState(session, { roomCaptureAttempts: [...captureHistory,
      { ...captureAudit, validationStatus: 'ERROR', failureReason: error.code || 'AI_SERVICE_ERROR' }].slice(-60) });
    throw error;
  }
  logger.info('AI_ANALYSIS_COMPLETE', { sessionId, step: normalizedStep, durationMs: Date.now() - startedAt });
  logger.info('AI_RESPONSE', { sessionId, step: normalizedStep, valid: result.valid === true,
    confidence: result.confidence, guideKey: result.guideKey });
  if (result.success === false || typeof result.valid !== 'boolean') {
    throw publicError('Verification service is temporarily unavailable. Please try again.', 503, 'SERVER_ERROR');
  }
  if (policy.unauthorizedObjectDetection && (result.detectorError === true || result.yoloAvailable === false)) {
    await updateHireState(session, { roomCaptureAttempts: [...captureHistory,
      { ...captureAudit, validationStatus: 'ERROR', failureReason: 'AI_SERVICE_ERROR' }].slice(-60) });
    throw publicError('Room object detection is temporarily unavailable. Please retry this photo.', 503, 'AI_SERVICE_ERROR');
  }

  if (typeof session.reload === 'function') {
    try { await session.reload(); } catch (_) {}
  }
  const state = hireProctoringState(session);
  // Re-validate the step is still the pending one AFTER the AI round-trip. A
  // stale retry that resolves after the step was already verified must not
  // overwrite the accepted capture (verifiedAt would regress to null).
  const pendingNow = HIRE_ROOM_STEPS.find(name => !normalizedSixCaptureStatus(state.sixCaptureStatus)?.[name]?.verifiedAt);
  if (pendingNow && pendingNow !== normalizedStep) throw publicError('Capture the current room step first', 409);
  const sixCaptureStatus = { ...(state.sixCaptureStatus || {}) };
  const previous = sixCaptureStatus[normalizedStep] || {};
  const attempts = Number(previous.attempts) || 0;
  const captured = {
    verifiedAt: previous.verifiedAt || null,
    coverage: Number(previous.coverage) || 0,
    confidence: Number(previous.confidence) || 0,
    attempts: attempts + 1,
    lastCaptureId: String(captureId),
    lastCapturedAt: new Date(capturedAtMs).toISOString(),
    mobileStreamId: String(mobileStreamId),
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
  if (result.valid && !result.sameFrame && !result.sameView && !result.wrongDirection && !blockingObservations.length) {
    captured.verifiedAt = new Date().toISOString();
    captured.coverage = Number(result.coverage) || 0;
    captured.confidence = Number(result.confidence) || 0;
    if (result.visualSignature) captured.visualSignature = result.visualSignature;
    if (result.sceneDescriptor) captured.sceneDescriptor = result.sceneDescriptor;
    if (result.featureDescriptor) captured.featureDescriptor = result.featureDescriptor;
    if (result.orientation) captured.orientation = result.orientation;
    captured.imageHash = imageHash;
    captured.stepId = `ROOM_STEP_${String(HIRE_ROOM_STEPS.indexOf(normalizedStep) + 1).padStart(2, '0')}`;
    captured.direction = normalizedStep.toUpperCase();
    captured.qualityScore = Number(result.qualityScore) || 0;
    captured.validationStatus = 'VALID';
    if (Array.isArray(result.detectedObjects) && result.detectedObjects.length) {
      captured.detectedObjects = result.detectedObjects;
    }
    captured.evidencePath = await saveEvidence(photo, sessionId, `room_${normalizedStep}`);
  } else if (result.sameFrame) {
    captured.verifiedAt = previous.verifiedAt || null;
  }

  sixCaptureStatus[normalizedStep] = captured;
  if (blockingObservations.length) captured.retakeReason = blockingObservations[0].objectType;
  else if (!captured.verifiedAt) captured.retakeReason = result.guideKey || 'unclear';
  const baselineComplete = allRoomCapturesVerified(sixCaptureStatus);
  const roomReference = baselineComplete
    ? makeRoomReference(sessionId, sixCaptureStatus, state.roomReference?.referenceCreatedAt) : null;
  // The fifth photo is not complete unless its evidence and descriptors were
  // stored. Fail closed if disk persistence failed or AI omitted features.
  if (baselineComplete && !roomReference) throw publicError('Room reference could not be saved. Please retry.', 503, 'ROOM_REFERENCE_INCOMPLETE');
  await updateHireState(session, { sixCaptureStatus, roomReference,
    roomVerificationPhase: baselineComplete ? 'ROOM_REFERENCE_CREATED' : pendingRoomState(sixCaptureStatus) });

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
  // The scanner already returns reason-specific bilingual copy that matches the
  // real cause. These last-resort strings are only reached if the AI service
  // omitted a message entirely, and they still name a concrete cause rather
  // than a generic "photo not verified".
  const fallbackMessage = 'The photo could not be used to verify the room view.';
  const fallbackTaMessage = 'அறைக் காட்சியைச் சரிபார்க்க இந்தப் புகைப்படத்தைப் பயன்படுத்த முடியவில்லை.';
  const message = observed === 'additional person'
    ? 'Another person may be visible. Please ensure you are alone and take this photo again.'
    : objectName ? `${objectName[0]} is visible. Please remove it and take the ${normalizedStep} photo again.`
      : captured.verifiedAt ? result.message : `${result.message || fallbackMessage} Please take the ${normalizedStep} photo again.`;
  const taMessage = observed === 'additional person'
    ? 'மற்றொரு நபர் காணப்படுகிறார். தயவுசெய்து நீங்கள் மட்டும் இருப்பதை உறுதி செய்து இந்தப் புகைப்படத்தை மீண்டும் எடுக்கவும்.'
    : objectName ? `${objectName[1]} காணப்படுகிறது. அதை அகற்றி இந்தப் புகைப்படத்தை மீண்டும் எடுக்கவும்.`
      : captured.verifiedAt ? result.taMessage : `${result.taMessage || fallbackTaMessage} இந்தப் புகைப்படத்தை மீண்டும் எடுக்கவும்.`;

  const response = {
    success: true,
    step: normalizedStep,
    captureId: String(captureId),
    valid: !!captured.verifiedAt,
    verified: !!captured.verifiedAt,
    reason: message,
    retry: !captured.verifiedAt,
    verifiedBefore: !!previous.verifiedAt,
    // A blocking observation invalidates an otherwise good photo, so it has to
    // win over the scanner's own reason. Without this the response claimed
    // 'valid_room_view' on a capture that was in fact rejected.
    failureReason: captured.verifiedAt ? null
      : blockingObservations.length ? 'SUSPICIOUS_OBJECT_DETECTED'
        : stepFailureReason(result),
    // Machine-readable ACTUAL cause. 'valid_room_view' on success.
    validationReason: captured.verifiedAt ? 'valid_room_view'
      : blockingObservations.length ? 'object_blocked'
        : (result.reason || stepFailureReason(result)),
    coverage: captured.coverage,
    confidence: captured.confidence,
    attempts: captured.attempts,
    guideKey: blockingObservations.length ? 'remove_observation' : (result.guideKey || null),
    message,
    taMessage,
    // Room-step quality diagnostics so the phone UI and the audit trail can
    // explain a rejection instead of showing a generic "not verified". Returned
    // on success too -- the metrics are what prove a photo was good.
    quality: {
      qualityScore: result.qualityScore ?? null,
      qualityThreshold: result.qualityThreshold ?? null,
      blurScore: result.blurScore ?? null,
      relativeSharpness: result.relativeSharpness ?? null,
      blurSignals: result.blurSignals ?? null,
      brightnessScore: result.brightnessScore ?? null,
      brightness: result.brightness ?? null,
      contrastScore: result.contrastScore ?? null,
      sceneScore: result.sceneScore ?? null,
      resolutionScore: result.resolutionScore ?? null,
      edgeDensity: result.edgeDensity ?? null,
      objectCount: result.objectCount ?? null,
      yoloConfidence: result.yoloConfidence ?? null,
      resolution: result.resolution ?? null,
    },
    observations: result.observations || [],
    detectedObjects: result.detectedObjects || [],
    sixCaptureStatus: publicCaptureStatuses(sixCaptureStatus),
    allCapturesVerified: allRoomCapturesVerified(sixCaptureStatus),
  };

  const sceneSignals = Array.isArray(result.sceneSignals) ? result.sceneSignals : [];
  const visualSimilarityScore = sceneSignals.length
    ? Math.max(...sceneSignals.map(signal => Number(signal.visualSimilarityScore) || 0)) : null;
  const attemptsNow = Array.isArray(hireProctoringState(session).roomCaptureAttempts)
    ? hireProctoringState(session).roomCaptureAttempts : [];
  await updateHireState(session, { roomCaptureAttempts: attemptsNow.map(item => item.captureId === captureId
    ? { ...item, validationStatus: response.verified ? 'VALID' : 'REJECTED',
      duplicate: result.sameView === true || result.sameFrame === true,
      visualSimilarityScore, failureReason: response.failureReason }
    : item) });
  logHireDecision('ROOM_PHOTO', {
    sessionId,
    captureId,
    mobileFrameTimestamp: capturedAtMs,
    mobileStreamId,
    step: normalizedStep,
    decision: response.verified ? 'ACCEPT' : 'REJECT',
    reason: blockingObservations.length ? 'OBJECT_BLOCKED'
      : response.verified ? 'VALID_VIEW'
      : result.sameView ? 'VIEW_TOO_SIMILAR'
      : result.wrongDirection ? 'WRONG_DIRECTION'
      : result.guideKey === 'laptop_camera_required' ? 'WEBCAM_VALIDATION_FAILED'
      : result.reason || result.guideKey || 'UNKNOWN_REASON',
    failureReason: response.failureReason,
    // Room-step quality diagnostics, logged for every photo so a false rejection
    // is always attributable to a specific metric.
    validationReason: response.validationReason,
    resolution: result.resolution ?? null,
    qualityScore: result.qualityScore ?? null,
    blurScore: result.blurScore ?? null,
    relativeSharpness: result.relativeSharpness ?? null,
    blurSignals: result.blurSignals ?? null,
    brightness: result.brightness ?? null,
    brightnessScore: result.brightnessScore ?? null,
    contrast: result.contrast ?? null,
    edgeDensity: result.edgeDensity ?? null,
    sceneScore: result.sceneScore ?? null,
    objectCount: result.objectCount ?? null,
    yoloConfidence: result.yoloConfidence ?? null,
    mobileSceneSimilarity: sceneSignals.length ? Math.max(...sceneSignals.map(signal => Number(signal.visualSimilarityScore) || 0)) : null,
    orientationDelta: result.orientationDelta ?? null,
    opticalFlowScore: result.opticalFlowScore ?? null,
    laptopMovementScore: result.laptopMovementScore ?? (Number(result.laptopMovement?.score) || 0),
    phoneVisible: result.phoneVisible === true,
    attempts: response.attempts,
    capturesVerified: HIRE_ROOM_STEPS.filter(name => sixCaptureStatus[name]?.verifiedAt).length,
  });
  logger.info('[ROOM-BASELINE]', { sessionId, step: normalizedStep.toUpperCase(),
    visualSimilarity: sceneSignals.length ? Math.max(...sceneSignals.map(signal => Number(signal.visualSimilarityScore) || 0)) : null,
    duplicate: result.sameView === true || result.sameFrame === true,
    result: response.verified ? 'ACCEPTED' : 'REJECTED', failureReason: response.failureReason });
  logger.info('[ROOM-VERIFY] step=%s session=%s resolution=%s qualityScore=%s blurScore=%s '
    + 'relativeSharpness=%s blurSignals=%s brightness=%s brightnessScore=%s contrast=%s edgeDensity=%s '
    + 'sceneScore=%s objectCount=%s yoloConfidence=%s coverage=%s threshold=%s verified=%s reason=%s',
    normalizedStep, sessionId, result.resolution ?? null, result.qualityScore ?? null,
    result.blurScore ?? null, result.relativeSharpness ?? null, result.blurSignals ?? null,
    result.brightness ?? null, result.brightnessScore ?? null, result.contrast ?? null,
    result.edgeDensity ?? null, result.sceneScore ?? null, result.objectCount ?? null,
    result.yoloConfidence ?? null, result.coverage ?? null, result.threshold ?? null,
    response.verified, response.validationReason);
  logger.info('VERIFICATION_RESULT', { sessionId, step: normalizedStep, verified: response.verified,
    confidence: response.confidence, attempts: response.attempts });
  return response;
}

async function analyzeRoomScan360(payload) {
  return enqueueSessionMutation(String(payload.sessionId), () => analyzeRoomScan360Unlocked(payload));
}

async function analyzeRoomScan360Unlocked({ sessionId, user, frames, orientations = [], laptopFrames = [], recordingComplete = false }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409);
  if (!Array.isArray(frames) || !frames.length || frames.length > 12) throw publicError('Submit 1–12 sampled scan frames', 422);
  if (!Array.isArray(laptopFrames) || laptopFrames.length > 6 || laptopFrames.some(item => typeof item !== 'string' || item.length > 180000))
    throw publicError('Laptop camera sample is invalid', 422, 'INVALID_LAPTOP_SAMPLE');
  if (!allRoomCapturesVerified(hireProctoringState(session).sixCaptureStatus)) throw publicError('Verify all five room photos before the 180° scan', 409, 'ROOM_PHOTOS_INCOMPLETE');
  const initialState = hireProctoringState(session);
  if (policyService.roomScanApproved(initialState)) {
    return { complete: true, roomScanClear: true, coverage: initialState.roomScanCoverage,
      sectors: initialState.roomScanSectors || [], postScanReport: initialState.roomPostScanReport,
      similarityReport: initialState.roomSimilarityReport, roomScanCompletedAt: initialState.roomScanCompletedAt };
  }
  const baseline = initialState.roomReference;
  if (!baseline || baseline.photos?.length !== HIRE_ROOM_STEPS.length ||
      baseline.photos.some(photo => !photo.visualSignature || !photo.sceneDescriptor)) {
    throw publicError('The room reference is incomplete. Retake the room photos.', 409, 'ROOM_REFERENCE_INCOMPLETE');
  }

  const result = await callAi('/api/proctoring/hire/room-scan-360', { sessionId, frames, orientations,
    recordingComplete,
    laptopFrames, requireLaptop: true, blockObjects: true,
    references: baseline.photos.map(photo => ({ step: photo.direction.toLowerCase(),
      visualSignature: photo.visualSignature, sceneDescriptor: photo.sceneDescriptor,
      featureDescriptor: photo.featureDescriptor })),
    referenceThreshold: policy.roomReferenceSimilarityThreshold,
    detectionFrames: policy.roomObjectDetectionFrames, clearFrames: policy.roomObjectClearFrames,
    sameAreaThreshold: policy.roomSameAreaSimilarityThreshold },
    { timeoutMs: 60000, retryTimeoutOnce: false });
  const expectedViews = ['Left', 'Front-left', 'Front', 'Front-right', 'Right'];
  // A room decision is only ever taken from one complete recording. The legacy
  // incremental accumulator answers with the same step/arc shape but no verdict
  // and a different mode, so it is rejected here rather than silently accepted.
  if (result.step !== 'scan180' || result.arcDegrees !== 180 || result.mode !== 'recorded_video' ||
      !ROOM_SCAN_VERDICTS.includes(result.verdict) ||
      !Array.isArray(result.sectors) || result.sectors.length !== expectedViews.length ||
      result.sectors.some((sector, index) => sector?.sector !== index || sector?.label !== expectedViews[index]) ||
      result.postScanReport?.arcDegrees !== 180 ||
      !Array.isArray(result.similarityReport?.sectorResults) || result.similarityReport.sectorResults.length !== 5) {
    throw publicError('The room scanner is running an older version. Restart the AI service and retry the 180° scan.',
      503, 'AI_SCAN_VERSION_MISMATCH');
  }
  if (result.success !== true || !result.similarityReport || !Array.isArray(result.similarityReport.sectorResults) ||
      (result.complete && (!result.postScanReport || !result.postScanReport.checks))) {
    throw publicError('Room comparison is temporarily unavailable. Please retry.', 503, 'AI_SERVICE_ERROR');
  }
  if (result.detectorAvailable === false) {
    throw publicError('Room object detection is temporarily unavailable. Please retry.', 503, 'AI_SERVICE_ERROR');
  }

  if (typeof session.reload === 'function') {
    try { await session.reload(); } catch (_) {}
  }
  const state = hireProctoringState(session);
  const coverage = Number(result.coverage) || 0;
  const patch = {
    roomScanCoverage: Math.min(100, Math.max(0, coverage)),
    roomScan360Complete: false,
    roomScanGuideKey: result.guideKey || null,
    roomScanMessage: result.message || null,
    roomScanTaMessage: result.taMessage || null,
    roomScanSectors: result.sectors || state.roomScanSectors || [],
    roomScanPendingObject: result.pendingObject || null,
    roomSimilarityReport: result.similarityReport,
    roomPostScanReport: result.postScanReport || null,
    roomScanCompletedAt: null,
    roomScanClear: false,
    roomScanCoverageAt: null,
    roomVerificationPhase: state.roomVerificationPhase === 'WORKSPACE_CHECK' ? 'WORKSPACE_CHECK' : 'ROOM_360',
  };
  if (result.sweepCovered === true && result.arcDegrees === 180 &&
      Array.isArray(result.sampledFrames) && result.sampledFrames.length === 5) {
    const fingerprint = crypto.createHash('sha256').update(result.sampledFrames.join('|')).digest('hex');
    if (fingerprint !== state.roomScanSampleFingerprint) {
      const sampleIds = await Promise.all(result.sampledFrames.map((frame, index) =>
        saveEvidence(frame, sessionId, `room_360_sector_${index}`)));
      if (sampleIds.some(id => !id)) throw publicError('Room scan evidence could not be saved. Please retry.', 503, 'ROOM_EVIDENCE_ERROR');
      patch.roomScanSampleIds = sampleIds;
      patch.roomScanSampleFingerprint = fingerprint;
      patch.roomScanEvidenceHistory = [...(state.roomScanEvidenceHistory || []), {
        capturedAt: new Date().toISOString(), sampleIds, postScanReport: result.postScanReport,
        similarityReport: result.similarityReport,
      }].slice(-10);
    }
  }
  const objectEvents = Array.isArray(state.roomObjectEvents) ? [...state.roomObjectEvents] : [];
  if (result.objectTransition?.type === 'DETECTED') {
    const transition = result.objectTransition;
    const beforeEvidenceId = await saveEvidence(frames[transition.frameIndex], sessionId, 'room_object_before');
    objectEvents.push({ eventId: crypto.randomUUID(), objectType: transition.objectType,
      sector: transition.sector, beforeEvidenceId, beforeTimestamp: new Date().toISOString(),
      beforeConfidence: transition.confidence, status: 'ACTION_REQUIRED' });
    patch.roomObjectEvents = objectEvents.slice(-30);
    logger.info('[ROOM-PROCTOR]', { sessionId, object: transition.objectType,
      sector: transition.sector, confidence: transition.confidence, status: 'ACTION_REQUIRED' });
  } else if (result.pendingObject && result.reverificationFailure === 'OBJECT_STILL_PRESENT') {
    const event = [...objectEvents].reverse().find(item =>
      ['ACTION_REQUIRED', 'STILL_PRESENT'].includes(item.status) && item.sector === result.pendingObject.sector);
    if (event) { event.status = 'STILL_PRESENT'; patch.roomObjectEvents = objectEvents.slice(-30); }
  } else if (result.objectTransition?.type === 'CLEARED') {
    const transition = result.objectTransition;
    const event = [...objectEvents].reverse().find(item => ['ACTION_REQUIRED', 'STILL_PRESENT'].includes(item.status) &&
      item.sector === transition.sector && item.objectType === transition.objectType);
    if (event) {
      event.afterEvidenceId = await saveEvidence(frames[transition.frameIndex], sessionId, 'room_object_after');
      event.afterTimestamp = new Date().toISOString();
      event.afterVerificationResult = { sameAreaSimilarity: transition.sameAreaSimilarity,
        clearFrames: transition.clearFrames, qualityScore: transition.qualityScore };
      event.status = event.beforeEvidenceId && event.afterEvidenceId ? 'CLEARED' : 'REVERIFICATION_FAILED';
      patch.roomObjectEvents = objectEvents.slice(-30);
      logger.info('[ROOM-REVERIFY]', { sessionId, object: transition.objectType,
        sector: transition.sector, beforeEvidence: event.beforeEvidenceId,
        afterEvidence: event.afterEvidenceId, clearFrames: transition.clearFrames, result: event.status });
    }
  } else if (result.mode === 'recorded_video' && result.complete === true &&
      Array.isArray(result.sampledFrames) && result.sampledFrames.length === 5) {
    // A new full recording rechecks the whole saved half-turn after an object
    // was removed. Keep before/after evidence for the human review trail.
    for (const event of objectEvents.filter(item => ['ACTION_REQUIRED', 'STILL_PRESENT'].includes(item.status))) {
      const sector = Math.max(0, Math.min(4, Number(event.sector) || 0));
      event.afterEvidenceId = await saveEvidence(result.sampledFrames[sector], sessionId, 'room_object_after');
      event.afterTimestamp = new Date().toISOString();
      event.afterVerificationResult = { fullRecording: true,
        baselineMatched: result.postScanReport?.checks?.baseline === true,
        prohibitedObjectsClear: result.postScanReport?.checks?.unauthorizedObjects === true };
      event.status = event.afterEvidenceId ? 'CLEARED' : 'REVERIFICATION_FAILED';
    }
    patch.roomObjectEvents = objectEvents.slice(-30);
  }

  if (result.restarted === true) {
    // A blocking object was removed and the ENTIRE sweep must be recorded again.
    // Old sectors are discarded and any stale completion flags are torn down so
    // the admission gate re-locks until the re-recorded room verifies.
    patch.roomScanCoverage = 0;
    patch.roomScan360Complete = false;
    patch.roomScanCompletedAt = null;
    patch.roomScanClear = false;
    patch.roomScanCoverageAt = null;
    patch.roomScanPendingObject = null;
    patch.roomScanSectors = result.sectors || [];
    patch.roomScanRestarted = true;
  } else if (result.rescanRequired === true) {
    patch.roomScanCoverage = 0;
    patch.roomScanSectors = [];
    // A FLAG is not a restart: the sweep was usable, an object or a second
    // person just has to be dealt with. The candidate is told exactly that
    // instead of being sent back to the left view with no reason.
    patch.roomScanRestarted = result.verdict !== 'FLAG';
  } else if (result.pendingObject) {
    // While a prohibited object is present the sweep must never count as
    // complete, even if an earlier call already set completion flags.
    patch.roomScan360Complete = false;
    patch.roomScanCompletedAt = null;
    patch.roomScanClear = false;
    patch.roomScanRestarted = false;
  }

  // A non-terminal sweep must never leave stale completion flags behind: a
  // previously "clear" room stays admitted on flags from an earlier successful
  // sweep, so tear them down whenever this call did not re-verify.
  if (!result.complete) {
    patch.roomScanCompletedAt = null;
    patch.roomScanClear = false;
    patch.roomScanCoverageAt = null;
    patch.roomScanRestarted = result.restarted === true || result.verdict === 'RETRY';
  }
  const mergedObservations = state.roomObservations || [];
  if (Array.isArray(result.observations) && result.observations.length) {
    const seen = new Set(mergedObservations.map(obs => `${obs.objectType}:${JSON.stringify(obs.box)}`));
    for (const obs of result.observations) {
      const key = `${obs.objectType}:${JSON.stringify(obs.box)}`;
      if (!seen.has(key)) { mergedObservations.push(obs); seen.add(key); }
    }
    patch.roomObservations = mergedObservations.slice(-100);
  }

  const unresolvedEvents = (patch.roomObjectEvents || objectEvents).some(event => event.status !== 'CLEARED');
  if (result.complete && result.postScanReport?.result === 'PASS' &&
      ['coverage', 'baseline', 'person', 'computer', 'unauthorizedObjects'].every(key => result.postScanReport?.checks?.[key] === true) &&
      result.postScanReport.arcDegrees === 180 && result.postScanReport.reviewedSectors === 5 &&
      Array.isArray(result.sampledFrames) && result.sampledFrames.length === 5 &&
      result.similarityReport.result === 'PASS' &&
      result.similarityReport.overallSimilarity >= policy.roomReferenceSimilarityThreshold &&
      !result.pendingObject && !unresolvedEvents &&
      (result.mode === 'recorded_video' || (policy.roomScanCoverageThreshold != null && coverage >= policy.roomScanCoverageThreshold))) {
    const capturesRaw = state.sixCaptureStatus || {};
    const captures = normalizedSixCaptureStatus(capturesRaw) || {};
    if (allRoomCapturesVerified(captures)) {
      if (!(patch.roomScanSampleIds || state.roomScanSampleIds)?.length)
        throw publicError('Room scan evidence could not be saved. Please retry.', 503, 'ROOM_EVIDENCE_ERROR');
      // Room verification is only complete when the five guided captures passed
      // AND the 360 sweep reached the required coverage. Observations remain
      // neutral and are never treated as a verdict.
      patch.roomScanCompletedAt = new Date().toISOString();
      patch.roomScanClear = true;
      patch.roomScan360Complete = true;
      patch.roomScanCoverageAt = Number(coverage);
      patch.roomScanRestarted = false;
      patch.roomVerificationPhase = 'WORKSPACE_CHECK';
      patch.sixCaptureStatus = capturesRaw;
    } else {
      patch.pendingSteps = HIRE_ROOM_STEPS.filter(step => !captures[step]?.verifiedAt);
    }
  }

  logHireDecision('ROOM_360', {
    sessionId,
    verdict: result.verdict,
    decision: result.verdict,
    reason: result.failureReason || (patch.roomScanCompletedAt ? 'SWEEP_VERIFIED' : 'SWEEP_IN_PROGRESS'),
    sector: result.pendingObject?.label || result.currentDirection || null,
    coverage: Number(coverage) || 0,
    accumulatedSweep: Number(result.accumulatedSweep) || 0,
    maxForwardSweep: Number(result.maxForwardSweep) || 0,
    failureReason: result.failureReason || null,
    motionEvidence: result.motionEvidence || null,
    closingEvidence: result.closingEvidence || null,
    objectDetected: result.pendingObject?.objectType || null,
    referenceSimilarity: result.similarityReport.overallSimilarity,
    referenceThreshold: policy.roomReferenceSimilarityThreshold,
    laptopMovementScore: result.laptopMovementScore ?? (Number(result.laptopMovement?.score) || 0),
    verifiedSectors: (result.sectors || []).filter(sector => sector.verified).length,
    restarted: result.restarted === true,
  }, 'ROOM_360');
  logger.info('[ROOM-180]', { sessionId, verdict: result.verdict, failureReason: result.failureReason,
    sector: result.currentDirection, referenceSimilarity: result.similarityReport.overallSimilarity,
    coverage, roomScanClear: patch.roomScanClear === true });

  await updateHireState(session, patch);

  return {
    complete: patch.roomScanClear === true,
    verdict: result.verdict,
    coverage: patch.roomScanCoverage,
    coverageThreshold: policy.roomScanCoverageThreshold,
    guideKey: result.guideKey || null,
    message: result.message || null,
    taMessage: result.taMessage || null,
    samplesSeen: Number(result.samplesSeen) || 0,
    sectors: result.sectors || [],
    missingSectors: result.missingSectors || [],
    currentDirection: result.currentDirection || null,
    accumulatedSweep: Number(result.accumulatedSweep) || 0,
    maxForwardSweep: Number(result.maxForwardSweep) || 0,
    failureReason: result.failureReason || null,
    motionEvidence: result.motionEvidence || null,
    closingEvidence: result.closingEvidence || null,
    pendingObject: result.pendingObject || null,
    similarityReport: result.similarityReport,
    postScanReport: result.postScanReport,
    rescanRequired: result.rescanRequired === true,
    objectEvents: patch.roomObjectEvents || objectEvents,
    restarted: result.restarted === true,
    roomScanRestarted: result.restarted === true,
    pendingSteps: patch.pendingSteps || [],
    observations: result.observations || [],
    detectedObjects: result.detectedObjects || [],
    roomScanCompletedAt: patch.roomScanCompletedAt || null,
    roomScanClear: patch.roomScanClear === true,
  };
}

async function getRoomVerificationState({ sessionId, user }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  let state = hireProctoringState(session);
  const staleScan = !policyService.roomScanApproved(state) &&
    ((Array.isArray(state.roomScanSectors) && state.roomScanSectors.length > 0 && state.roomScanSectors.length !== 5) ||
     (state.roomPostScanReport && state.roomPostScanReport.arcDegrees !== 180));
  if (staleScan && ['CALIBRATING', 'READY'].includes(session.status)) {
    await updateHireState(session, { roomScanCoverage: 0, roomScanSectors: [], roomScanPendingObject: null,
      roomScanClear: false, roomScan360Complete: false, roomScanCompletedAt: null,
      roomScanCoverageAt: null, roomSimilarityReport: null, roomPostScanReport: null,
      roomScanSampleIds: [], roomScanSampleFingerprint: null, roomScanRestarted: true,
      roomVerificationPhase: 'ROOM_REFERENCE_CREATED' });
    state = hireProctoringState(session);
  }
  if (['CALIBRATING', 'READY'].includes(session.status) && allRoomCapturesVerified(normalizedSixCaptureStatus(state.sixCaptureStatus)) && !state.roomReference) {
    const recovered = makeRoomReference(sessionId, normalizedSixCaptureStatus(state.sixCaptureStatus));
    if (recovered) await updateHireState(session, { roomReference: recovered, roomVerificationPhase: 'ROOM_REFERENCE_CREATED' });
    else await updateHireState(session, { sixCaptureStatus: Object.fromEntries(HIRE_ROOM_STEPS.map(name =>
      [name, { verifiedAt: null, attempts: 0 }])), roomCaptureAttempts: [], roomReference: null,
      roomVerificationPhase: 'ROOM_FRONT_PENDING', roomScanClear: false,
      roomScan360Complete: false, roomScanCompletedAt: null });
    state = hireProctoringState(session);
  }
  return {
    sixCaptureStatus: publicCaptureStatuses(state.sixCaptureStatus),
    roomSteps: HIRE_ROOM_STEPS,
    verificationState: state.roomVerificationPhase || pendingRoomState(state.sixCaptureStatus),
    roomScanCoverage: Number(state.roomScanCoverage) || 0,
    roomScan360Complete: policyService.roomScanApproved(state),
    roomScanCompletedAt: state.roomScanCompletedAt || null,
    roomScanClear: policyService.roomScanApproved(state),
    roomScanSectors: state.roomScanSectors || [],
    roomScanPendingObject: state.roomScanPendingObject || null,
    roomReference: state.roomReference ? { sessionId: state.roomReference.sessionId,
      referenceCreatedAt: state.roomReference.referenceCreatedAt,
      photos: state.roomReference.photos.map(({ stepId, direction, imageId, capturedAt, qualityScore }) =>
        ({ stepId, direction, imageId, capturedAt, qualityScore })) } : null,
    roomSimilarityReport: state.roomSimilarityReport || null,
    roomPostScanReport: state.roomPostScanReport || null,
    roomScanSampleIds: state.roomScanSampleIds || [],
    roomObjectEvents: state.roomObjectEvents || [],
    roomScanRestarted: state.roomScanRestarted === true,
    roomVerificationPhase: state.roomVerificationPhase || 'ROOM_PHOTOS',
    roomObservations: state.roomObservations || [],
    roomScanCoverageThreshold: policy.roomScanCoverageThreshold,
    roomReferenceSimilarityThreshold: policy.roomReferenceSimilarityThreshold,
  };
}

module.exports = { requireOwnedHireSession, storeIdentityReference, verifyIdentity, inspectRoom, analyzeRoomStep, analyzeRoomScan360, getRoomVerificationState, saveEvidence, HIRE_ROOM_STEPS };
