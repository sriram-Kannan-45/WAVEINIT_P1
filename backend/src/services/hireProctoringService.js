const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const monitoringService = require('./monitoringService');
const policyService = require('./hireProctoringPolicy');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

const HIRE_ROOM_STEPS = Object.freeze(['front', 'left', 'back', 'right', 'desk', 'floor']);

function publicError(message, status = 400) { const error = new Error(message); error.status = status; return error; }

async function requireOwnedHireSession(sessionId, user) {
  const session = await monitoringService.getSession(sessionId);
  if (!session) throw publicError('Monitoring session not found', 404);
  if (user.role !== 'PARTICIPANT' || String(session.participantId) !== String(user.id)) throw publicError('This session belongs to another participant', 403);
  const resolved = await policyService.resolvePolicy(session.contextType, session.contextId, user.id);
  if (!resolved.isHire || !resolved.assigned) throw publicError('This endpoint is available only for your assigned Hire assessment', 403);
  if (!resolved.policy.enabled) throw publicError('AI proctoring is disabled for this assessment', 409);
  return { session, ...resolved };
}

async function callAi(pathname, payload) {
  try {
    const result = await axios.post(`${AI_SERVICE_URL}${pathname}`, payload, { timeout: 12000, maxContentLength: MAX_FRAME_BYTES * 8 });
    return result.data;
  } catch (error) {
    // Connection-level failures (ECONNREFUSED, ETIMEDOUT) mean the AI
    // service is not running — give a clear operational message.
    const isConnectError = !error.response && (
      error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' ||
      error.message?.includes('connect') || error.message?.includes('timeout')
    );
    if (isConnectError) {
      throw publicError('Verification service is temporarily unavailable. Please try again in a moment.', 503);
    }
    const responseStatus = error.response?.status;
    const detail = error.response?.data?.detail || error.response?.data?.message || error.message || 'AI verification unavailable';
    // 422 = model rejected the input (bad frames, face not found, liveness failed)
    // 4xx = client error — propagate as 422
    // 5xx / other = server/AI error — surface as 503
    const status = responseStatus === 422 ? 422 : (responseStatus >= 400 && responseStatus < 500 ? 422 : 503);
    throw publicError(detail, status);
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
  const result = await callAi('/api/proctoring/hire/identity-reference', { sessionId, frames, challenge, requireLiveness: policy.livenessDetection });
  if (!result.success) {
    const evidenceRef = policy.evidenceCapture && policy.evidenceMode !== 'NONE' ? await saveEvidence(frames?.[frames.length - 1], sessionId, 'liveness') : null;
    await monitoringService.reportEvent({ sessionId, participantId: user.id, eventType: 'LIVENESS_FAILED', severity: 'HIGH', confidence: 1, evidenceRef,
      metadata: { hireProctoring: true, challenge } });
    // Give a meaningful message rather than a generic one so the UI can
    // route to the correct explanation panel.
    const msg = result.message || 'Liveness not detected. Please ensure you are well-lit, face the camera, and follow the movement instruction.';
    throw publicError(msg, 422);
  }
  await session.update({ metadata: { ...(session.metadata || {}), hireProctoring: {
    ...(session.metadata?.hireProctoring || {}), policy, identitySignature: result.signature,
    identityVerifiedAt: new Date().toISOString(), livenessPassed: !!result.livenessPassed,
    livenessChallenge: result.challenge, challenge: null, challengeExpiresAt: null,
  } } });
  return { verified: true, livenessPassed: !!result.livenessPassed, challenge: result.challenge, policy };
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

async function analyzeRoomStep({ sessionId, user, step, frame }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, step, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409);
  const normalizedStep = String(step || '').toLowerCase();
  if (!HIRE_ROOM_STEPS.includes(normalizedStep)) throw publicError('Unsupported room capture step', 422);
  if (!frame || String(frame).length > MAX_FRAME_BYTES) throw publicError('Camera frame missing or too large', 422);

  const result = await callAi('/api/proctoring/hire/room-step', {
    sessionId, step: normalizedStep, frame,
    threshold: (policy.roomScanCoverageThreshold / 100) - 0.3,
  });

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

  if (result.valid && !result.sameFrame) {
    captured.verifiedAt = new Date().toISOString();
    captured.coverage = Number(result.coverage) || 0;
    captured.confidence = Number(result.confidence) || 0;
    if (Array.isArray(result.observations) && result.observations.length) {
      const observations = [...((sixCaptureStatus[normalizedStep]?.observations) || []), ...result.observations];
      captured.observations = observations.slice(-50);
    }
    if (Array.isArray(result.detectedObjects) && result.detectedObjects.length) {
      captured.detectedObjects = result.detectedObjects;
    }
    if (policy.evidenceCapture && policy.evidenceMode !== 'NONE') {
      captured.evidencePath = await saveEvidence(frame, sessionId, `room_${normalizedStep}`);
    }
  } else if (result.sameFrame) {
    captured.verifiedAt = previous.verifiedAt || null;
  }

  sixCaptureStatus[normalizedStep] = captured;
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

  return {
    step: normalizedStep,
    valid: !!captured.verifiedAt,
    verifiedBefore: !!previous.verifiedAt,
    coverage: captured.coverage,
    confidence: captured.confidence,
    attempts: captured.attempts,
    guideKey: result.guideKey || null,
    message: result.message || null,
    taMessage: result.taMessage || null,
    observations: result.observations || [],
    detectedObjects: result.detectedObjects || [],
    sixCaptureStatus,
    allSixCaptured: allSixCaptured(sixCaptureStatus),
  };
}

async function analyzeRoomScan360({ sessionId, user, frames }) {
  const { session, policy } = await requireOwnedHireSession(sessionId, user);
  if (!policy.mobileRoomScan && !policy.roomScan360Enabled) return { skipped: true, policy };
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Room scanning must finish before the assessment starts', 409);
  if (!Array.isArray(frames) || !frames.length || frames.length > 12) throw publicError('Submit 1–12 sampled scan frames', 422);

  const result = await callAi('/api/proctoring/hire/room-scan-360', { sessionId, frames });

  const state = hireProctoringState(session);
  const coverage = Number(result.coverage) || 0;
  const patch = {
    roomScanCoverage: Math.min(100, Math.max(0, coverage)),
    roomScan360Complete: !!result.complete,
    roomScanGuideKey: result.guideKey || null,
    roomScanMessage: result.message || null,
    roomScanTaMessage: result.taMessage || null,
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

  if (result.complete && policy.roomScanCoverageThreshold != null && coverage >= policy.roomScanCoverageThreshold) {
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
    roomObservations: state.roomObservations || [],
    roomScanCoverageThreshold: policy.roomScanCoverageThreshold,
  };
}

module.exports = { requireOwnedHireSession, storeIdentityReference, verifyIdentity, inspectRoom, analyzeRoomStep, analyzeRoomScan360, getRoomVerificationState, saveEvidence, HIRE_ROOM_STEPS };
