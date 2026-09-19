const { Op } = require('sequelize');
const { HiringAssessment, HiringAssignment } = require('../models');
const { INACTIVE_ASSIGNMENT_STATUSES } = require('../constants/hiringStatuses');

const SUPPORTED_LANGUAGES = Object.freeze([
  'en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'bn-IN', 'gu-IN', 'pa-IN',
]);

// Hire room verification and proctoring voice stays English + Tamil only.
const HIRE_VOICE_LANGUAGES = Object.freeze(['en-IN', 'ta-IN']);

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
  roomScan360Enabled: true,
  roomScanCoverageThreshold: 85,
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
    roomScan360Enabled: bool(input.roomScan360Enabled, DEFAULT_POLICY.roomScan360Enabled),
    roomScanCoverageThreshold: Math.round(number(input.roomScanCoverageThreshold, DEFAULT_POLICY.roomScanCoverageThreshold, 50, 100)),
  };
}

async function findWorkflow(contextType, contextId) {
  const type = String(contextType || '').toUpperCase();
  const id = Number(contextId);
  if (!id) return null;
  if (type === 'CODING') {
    const byCoding = await HiringAssessment.findOne({ where: { coding_assessment_id: id } });
    if (byCoding) return byCoding;
  }
  if (type === 'QUIZ') {
    const byQuiz = await HiringAssessment.findOne({ where: { quiz_id: id } });
    if (byQuiz) return byQuiz;
  }
  // For COMBINED, direct workflow ID, or cross-engine resolution:
  return HiringAssessment.findOne({
    where: {
      [Op.or]: [
        { id },
        { quiz_id: id },
        { coding_assessment_id: id },
      ],
    },
  });
}

async function resolvePolicy(contextType, contextId, participantId = null) {
  const workflow = await findWorkflow(contextType, contextId);
  if (!workflow) return { isHire: false, workflow: null, policy: null, assigned: false };
  const assigned = participantId ? !!(await HiringAssignment.findOne({
    where: {
      assessment_id: workflow.id,
      participant_id: Number(participantId),
      status: { [Op.notIn]: INACTIVE_ASSIGNMENT_STATUSES },
    },
  })) : false;
  return { isHire: true, workflow, policy: normalizePolicy(workflow.proctoring_config || {}), assigned };
}

module.exports = { DEFAULT_POLICY, SUPPORTED_LANGUAGES, HIRE_VOICE_LANGUAGES, normalizePolicy, findWorkflow, resolvePolicy };
