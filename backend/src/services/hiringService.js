/**
 * Hiring workflow helpers.
 *
 * Hire deliberately does not own questions, attempts, grading, code execution,
 * monitoring or reports. It links candidates to the existing Quiz/Coding
 * engines and keeps only the recruitment-specific pending-email workflow.
 */
const {
  HiringAssessment,
  HiringCandidate,
  HiringAssignment,
  QuizAssignment,
  QuizAttempt,
  CodingAttempt,
  User,
  sequelize,
} = require('../models');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function engineDescriptor(assessment) {
  const type = String(assessment?.assessment_type || 'QUIZ').toUpperCase();
  return { type, id: type === 'CODING' ? assessment?.coding_assessment_id : assessment?.quiz_id };
}

async function canonicalAttemptFor(assessment, participantId) {
  const engine = engineDescriptor(assessment);
  if (!engine.id || !participantId) return null;
  if (engine.type === 'CODING') {
    return CodingAttempt.findOne({
      where: { assessmentId: engine.id, participantId },
      order: [['id', 'DESC']],
    });
  }
  return QuizAttempt.findOne({
    where: { quizId: engine.id, participantId },
    order: [['id', 'DESC']],
  });
}

function mapAttemptStatus(attempt) {
  if (!attempt) return 'ASSIGNED';
  const status = String(attempt.status || '').toUpperCase();
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (status === 'EVALUATED') return 'EVALUATED';
  if (['SUBMITTED', 'AUTO_SUBMITTED', 'COMPLETED'].includes(status)) return 'COMPLETED';
  return 'ASSIGNED';
}

async function refreshAssignmentStatus(assignment, assessment) {
  const attempt = await canonicalAttemptFor(assessment, assignment.participant_id);
  const status = mapAttemptStatus(attempt);
  if (assignment.status !== status) {
    await assignment.update({
      status,
      completed_at: ['COMPLETED', 'EVALUATED'].includes(status)
        ? (attempt?.submittedAt || attempt?.submitted_at || assignment.completed_at || new Date())
        : null,
    });
  }
  return { assignment, attempt };
}

async function recomputeAssessmentStatus(assessmentId) {
  const assessment = await HiringAssessment.findByPk(assessmentId, {
    include: [
      { association: 'quiz', required: false },
      { association: 'codingAssessment', required: false },
    ],
  });
  if (!assessment) return null;

  const assignments = await HiringAssignment.findAll({ where: { assessment_id: assessmentId } });
  for (const assignment of assignments) await refreshAssignmentStatus(assignment, assessment);
  for (const assignment of assignments) {
    const candidate = await HiringCandidate.findByPk(assignment.candidate_id);
    if (candidate && candidate.status !== assignment.status) await candidate.update({ status: assignment.status });
  }

  const statuses = assignments.map((a) => a.status);
  const engine = assessment.assessment_type === 'CODING' ? assessment.codingAssessment : assessment.quiz;
  const engineStatus = String(engine?.status || 'DRAFT').toUpperCase();
  let status = engineStatus === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
  if (engineStatus === 'ARCHIVED') status = 'EXPIRED';
  else if (['CLOSED', 'RESULTS_PUBLISHED'].includes(engineStatus)) status = 'COMPLETED';
  else {
    if (statuses.length) status = 'ASSIGNED';
    if (statuses.some((s) => s === 'IN_PROGRESS')) status = 'IN_PROGRESS';
    if (statuses.length && statuses.every((s) => ['COMPLETED', 'EVALUATED'].includes(s))) status = 'COMPLETED';
    if (statuses.length && statuses.every((s) => s === 'EVALUATED')) status = 'EVALUATED';
  }
  if (assessment.end_date && new Date(`${assessment.end_date}T23:59:59.999Z`) < new Date()) status = 'EXPIRED';
  if (assessment.status !== status) await assessment.update({ status });
  return status;
}

async function assignCandidate(assessment, candidate) {
  if (!assessment || !candidate) return { error: 'Candidate or hiring workflow not found.' };
  if (candidate.registration_status !== 'REGISTERED' || !candidate.user_id) {
    return { error: 'Only registered candidates can be assigned. Re-check registration first.' };
  }

  return sequelize.transaction(async (transaction) => {
    const [assignment, created] = await HiringAssignment.findOrCreate({
      where: { assessment_id: assessment.id, candidate_id: candidate.id },
      defaults: { participant_id: candidate.user_id, status: 'ASSIGNED', assigned_at: new Date() },
      transaction,
    });

    if (assessment.assessment_type === 'QUIZ' && assessment.quiz_id) {
      const [quizAssignment] = await QuizAssignment.findOrCreate({
        where: { quizId: assessment.quiz_id, participantId: candidate.user_id },
        defaults: { status: 'PENDING', assignedAt: new Date() },
        transaction,
      });
      if (assignment.quiz_assignment_id !== quizAssignment.id) {
        await assignment.update({ quiz_assignment_id: quizAssignment.id }, { transaction });
      }
    }

    await candidate.update({ assignment_status: 'ASSIGNED', status: 'ASSIGNED' }, { transaction });
    return { assignment, alreadyAssigned: !created };
  });
}

async function unassignCandidate(assessment, candidate) {
  const attempt = await canonicalAttemptFor(assessment, candidate.user_id);
  if (attempt && String(attempt.status).toUpperCase() === 'IN_PROGRESS') {
    const error = new Error('Cannot unassign a candidate with an active assessment attempt.');
    error.status = 409;
    throw error;
  }
  return sequelize.transaction(async (transaction) => {
    const assignment = await HiringAssignment.findOne({
      where: { assessment_id: assessment.id, candidate_id: candidate.id },
      transaction,
    });
    if (assignment?.quiz_assignment_id) {
      await QuizAssignment.destroy({ where: { id: assignment.quiz_assignment_id }, transaction });
    }
    if (assignment) await assignment.destroy({ transaction });
    await candidate.update({ assignment_status: 'NOT_ASSIGNED', status: 'PENDING' }, { transaction });
  });
}

async function recheckCandidateRegistration(assessmentId) {
  const assessment = await HiringAssessment.findByPk(assessmentId);
  if (!assessment) return { updated: 0, newlyAssigned: 0, total: 0, stillUnregistered: 0 };
  const candidates = await HiringCandidate.findAll({ where: { assessment_id: assessmentId } });
  let updated = 0;
  let newlyAssigned = 0;
  let stillUnregistered = 0;

  for (const candidate of candidates) {
    const user = await User.findOne({
      where: { email: normalizeEmail(candidate.email), role: 'PARTICIPANT', isDeleted: false },
      attributes: ['id', 'status'],
    });
    const approved = Boolean(user) && String(user.status).toUpperCase() === 'APPROVED';
    const pending = Boolean(user) && String(user.status).toUpperCase() === 'PENDING';
    const registration_status = approved ? 'REGISTERED' : (pending ? 'PENDING' : 'NOT_REGISTERED');
    if (candidate.registration_status !== registration_status || (approved && !candidate.user_id)) {
      await candidate.update({ registration_status, user_id: approved ? user.id : null, last_rechecked_at: new Date() });
      updated += 1;
    }
    if (approved && candidate.assignment_status !== 'ASSIGNED') {
      const result = await assignCandidate(assessment, candidate);
      if (result.assignment && !result.alreadyAssigned) newlyAssigned += 1;
    }
    if (!approved) stillUnregistered += 1;
  }
  await recomputeAssessmentStatus(assessmentId);
  return { updated, newlyAssigned, total: candidates.length, stillUnregistered };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  engineDescriptor,
  canonicalAttemptFor,
  refreshAssignmentStatus,
  recomputeAssessmentStatus,
  assignCandidate,
  unassignCandidate,
  recheckCandidateRegistration,
};
