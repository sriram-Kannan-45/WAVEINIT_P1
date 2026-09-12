const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const monitoringService = require('./monitoringService');
const policyService = require('./hireProctoringPolicy');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

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
    const message = error.response?.data?.detail || error.message || 'AI verification unavailable';
    throw publicError(message, error.response?.status === 422 ? 422 : 503);
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
  if (!['CALIBRATING', 'READY'].includes(session.status)) throw publicError('Identity verification must finish before the assessment starts', 409);
  if (session.metadata?.hireProctoring?.identityVerifiedAt) throw publicError('Identity is already locked for this assessment session', 409);
  const result = await callAi('/api/proctoring/hire/identity-reference', { sessionId, frames, challenge, requireLiveness: policy.livenessDetection });
  if (!result.success) {
    const evidenceRef = policy.evidenceCapture && policy.evidenceMode !== 'NONE' ? await saveEvidence(frames?.[frames.length - 1], sessionId, 'liveness') : null;
    await monitoringService.reportEvent({ sessionId, participantId: user.id, eventType: 'LIVENESS_FAILED', severity: 'HIGH', confidence: 1, evidenceRef,
      metadata: { hireProctoring: true, challenge } });
    throw publicError(result.message || 'Identity verification failed', 422);
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
  if (!policy.mobileRoomScan) return { skipped: true, policy };
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

module.exports = { requireOwnedHireSession, storeIdentityReference, verifyIdentity, inspectRoom, saveEvidence };
