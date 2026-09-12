const { Op } = require('sequelize');
const { HiringAssessment, HiringAssignment } = require('../models');

const SUPPORTED_LANGUAGES = Object.freeze([
  'en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'bn-IN', 'gu-IN', 'pa-IN',
]);

const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  identityVerification: true,
  livenessDetection: true,
  continuousFaceVerification: true,
  mobileRoomScan: true,
  unauthorizedObjectDetection: true,
  evidenceCapture: true,
  voiceWarnings: true,
  defaultLanguage: 'en-IN',
  allowParticipantLanguage: true,
  voiceRate: 0.95,
  voiceVolume: 1,
  identityCheckIntervalSeconds: 30,
  roomScanMinFrames: 6,
  evidenceMode: 'SCREENSHOT',
});

const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function normalizePolicy(input = {}) {
  const language = SUPPORTED_LANGUAGES.includes(input.defaultLanguage) ? input.defaultLanguage : DEFAULT_POLICY.defaultLanguage;
  return {
    enabled: bool(input.enabled, DEFAULT_POLICY.enabled),
    identityVerification: bool(input.identityVerification, DEFAULT_POLICY.identityVerification),
    livenessDetection: bool(input.livenessDetection, DEFAULT_POLICY.livenessDetection),
    continuousFaceVerification: bool(input.continuousFaceVerification, DEFAULT_POLICY.continuousFaceVerification),
    mobileRoomScan: bool(input.mobileRoomScan, DEFAULT_POLICY.mobileRoomScan),
    unauthorizedObjectDetection: bool(input.unauthorizedObjectDetection, DEFAULT_POLICY.unauthorizedObjectDetection),
    evidenceCapture: bool(input.evidenceCapture, DEFAULT_POLICY.evidenceCapture),
    voiceWarnings: bool(input.voiceWarnings, DEFAULT_POLICY.voiceWarnings),
    defaultLanguage: language,
    allowParticipantLanguage: bool(input.allowParticipantLanguage, DEFAULT_POLICY.allowParticipantLanguage),
    voiceRate: number(input.voiceRate, DEFAULT_POLICY.voiceRate, 0.6, 1.4),
    voiceVolume: number(input.voiceVolume, DEFAULT_POLICY.voiceVolume, 0, 1),
    identityCheckIntervalSeconds: Math.round(number(input.identityCheckIntervalSeconds, DEFAULT_POLICY.identityCheckIntervalSeconds, 15, 300)),
    roomScanMinFrames: Math.round(number(input.roomScanMinFrames, DEFAULT_POLICY.roomScanMinFrames, 4, 12)),
    evidenceMode: input.evidenceMode === 'NONE' ? 'NONE' : 'SCREENSHOT',
  };
}

async function findWorkflow(contextType, contextId) {
  const type = String(contextType || '').toUpperCase();
  if (!['QUIZ', 'CODING'].includes(type) || !Number(contextId)) return null;
  return HiringAssessment.findOne({
    where: type === 'CODING' ? { coding_assessment_id: Number(contextId) } : { quiz_id: Number(contextId) },
  });
}

async function resolvePolicy(contextType, contextId, participantId = null) {
  const workflow = await findWorkflow(contextType, contextId);
  if (!workflow) return { isHire: false, workflow: null, policy: null, assigned: false };
  const assigned = participantId ? !!(await HiringAssignment.findOne({
    where: { assessment_id: workflow.id, participant_id: Number(participantId), status: { [Op.ne]: 'REVOKED' } },
  })) : false;
  return { isHire: true, workflow, policy: normalizePolicy(workflow.proctoring_config || {}), assigned };
}

module.exports = { DEFAULT_POLICY, SUPPORTED_LANGUAGES, normalizePolicy, findWorkflow, resolvePolicy };
