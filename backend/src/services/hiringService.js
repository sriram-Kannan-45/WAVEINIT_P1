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
  QuizAnswer,
  QuizResult,
  AssessmentSession,
  CodingAttempt,
  CodingSubmission,
  CodingResult,
  User,
  sequelize,
} = require('../models');
const { INACTIVE_ASSIGNMENT_STATUSES } = require('../constants/hiringStatuses');

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
  if (!participantId || !assessment) return null;
  if (assessment?.assessment_type === 'COMBINED') {
    const [quizAttempt, codingAttempt] = await Promise.all([
      assessment.quiz_id
        ? QuizAttempt.findOne({ where: { quizId: assessment.quiz_id, participantId }, order: [['id', 'DESC']] })
        : null,
      assessment.coding_assessment_id
        ? CodingAttempt.findOne({ where: { assessmentId: assessment.coding_assessment_id, participantId }, order: [['id', 'DESC']] })
        : null,
    ]);
    if (quizAttempt?.status === 'IN_PROGRESS') return quizAttempt;
    if (codingAttempt?.status === 'IN_PROGRESS') return codingAttempt;
    if (quizAttempt && codingAttempt) {
      return (quizAttempt.id > codingAttempt.id) ? quizAttempt : codingAttempt;
    }
    return quizAttempt || codingAttempt;
  }

  const engine = engineDescriptor(assessment);
  if (!engine.id) return null;
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
  // A revoked assignment is terminal from the workflow's perspective: the
  // canonical attempt (if any) must never resurrect it.
  if (['REVOKED', 'DROPPED'].includes(String(assignment.status || '').toUpperCase())) {
    return { assignment, attempt: null, revoked: true };
  }
  const attempt = await canonicalAttemptFor(assessment, assignment.participant_id);
  const status = mapAttemptStatus(attempt);
  if (assignment.status !== status) {
    await assignment.update({
      status,
      completed_at: ['COMPLETED', 'EVALUATED'].includes(status)
        ? (attempt?.submittedAt || attempt?.submitted_at || assignment.completed_at || new Date())
        : INACTIVE_ASSIGNMENT_STATUSES.includes(status) ? assignment.completed_at : null,
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
    const active = statuses.filter((s) => !INACTIVE_ASSIGNMENT_STATUSES.includes(s));
    if (active.length) status = 'ASSIGNED';
    if (active.some((s) => s === 'IN_PROGRESS')) status = 'IN_PROGRESS';
    if (active.length && active.every((s) => ['COMPLETED', 'EVALUATED'].includes(s))) status = 'COMPLETED';
    if (active.length && active.every((s) => s === 'EVALUATED')) status = 'EVALUATED';
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

    if ((assessment.assessment_type === 'QUIZ' || assessment.assessment_type === 'COMBINED') && assessment.quiz_id) {
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

/**
 * Revoke = terminal workflow status (REVOKED). Unlike unassignCandidate the
 * row is preserved for audit and the canonical quiz assignment is cancelled so
 * the candidate can no longer access the assessment.
 */
async function revokeCandidate(assessment, candidate) {
  if (!assessment || !candidate) return { error: 'Candidate or hiring workflow not found.' };
  return sequelize.transaction(async (transaction) => {
    const assignment = await HiringAssignment.findOne({
      where: { assessment_id: assessment.id, candidate_id: candidate.id },
      transaction,
    });
    if (!assignment) {
      const error = new Error('Candidate is not assigned to this assessment.');
      error.status = 404;
      throw error;
    }
    if (String(assignment.status).toUpperCase() === 'REVOKED') return { assignment, alreadyRevoked: true };

    if (assignment.quiz_assignment_id) {
      await QuizAssignment.update(
        { status: 'CANCELLED', cancelledAt: new Date() },
        { where: { id: assignment.quiz_assignment_id }, transaction },
      ).catch(() => {});
    }
    await assignment.update({ status: 'REVOKED', completed_at: null }, { transaction });
    await candidate.update({ status: 'REVOKED' }, { transaction });
    return { assignment, alreadyRevoked: false };
  });
}

/**
 * Reassign = reactivate a REVOKED (or simply uncompleted) assignment so the
 * candidate can start again. Recreates the canonical quiz assignment.
 */
async function reassignCandidate(assessment, candidate) {
  if (!assessment || !candidate) return { error: 'Candidate or hiring workflow not found.' };
  if (candidate.registration_status !== 'REGISTERED' || !candidate.user_id) {
    return { error: 'Only registered candidates can be assigned. Re-check registration first.' };
  }
  return sequelize.transaction(async (transaction) => {
    let assignment = await HiringAssignment.findOne({
      where: { assessment_id: assessment.id, candidate_id: candidate.id },
      transaction,
    });

    if (assessment.assessment_type === 'QUIZ' && assessment.quiz_id) {
      const [quizAssignment] = await QuizAssignment.findOrCreate({
        where: { quizId: assessment.quiz_id, participantId: candidate.user_id },
        defaults: { status: 'PENDING', assignedAt: new Date() },
        transaction,
      });
      await quizAssignment.update({ status: 'PENDING', cancelledAt: null }, { transaction }).catch(() => {});
      if (assignment && assignment.quiz_assignment_id !== quizAssignment.id) {
        await assignment.update({ quiz_assignment_id: quizAssignment.id }, { transaction });
      }
    }

    if (assignment) {
      await assignment.update({ status: 'ASSIGNED', completed_at: null }, { transaction });
    } else {
      assignment = await HiringAssignment.create({
        assessment_id: assessment.id,
        candidate_id: candidate.id,
        participant_id: candidate.user_id,
        status: 'ASSIGNED',
        assigned_at: new Date(),
      }, { transaction });
    }

    await candidate.update({ assignment_status: 'ASSIGNED', status: 'ASSIGNED' }, { transaction });
    return { assignment, reassigned: true };
  });
}

/**
 * Reset attempt = delete the canonical attempt + answers/results/session so the
 * candidate can start a fresh attempt. Only allowed when attempts are not
 * currently in progress.
 */
async function resetCandidateAttempt(assessment, candidate) {
  if (!assessment || !candidate) return { error: 'Candidate or hiring workflow not found.' };
  return sequelize.transaction(async (transaction) => {
    if (!candidate.user_id) {
      const error = new Error('Candidate has no linked participant account.');
      error.status = 422;
      throw error;
    }
    const attempt = await canonicalAttemptFor(assessment, candidate.user_id);
    if (attempt && String(attempt.status).toUpperCase() === 'IN_PROGRESS') {
      const error = new Error('Cannot reset an attempt that is currently in progress.');
      error.status = 409;
      throw error;
    }
    if (attempt) {
      const engine = engineDescriptor(assessment);
      if (engine.type === 'CODING') {
        await CodingSubmission.destroy({ where: { attemptId: attempt.id }, transaction });
        await CodingResult.destroy({ where: { attemptId: attempt.id }, transaction });
      } else {
        await QuizAnswer.destroy({ where: { attemptId: attempt.id }, transaction });
        await QuizResult.destroy({ where: { attemptId: attempt.id }, transaction });
      }
      await AssessmentSession.destroy({ where: { attemptId: attempt.id }, transaction }).catch(() => {});
      await attempt.destroy({ transaction });
    }
    const assignment = await HiringAssignment.findOne({
      where: { assessment_id: assessment.id, candidate_id: candidate.id },
      transaction,
    });
    if (assignment && !INACTIVE_ASSIGNMENT_STATUSES.includes(String(assignment.status).toUpperCase())) {
      await assignment.update({ status: 'ASSIGNED', attempts_used: 0, completed_at: null }, { transaction });
    }
    if (candidate.status !== 'REVOKED') await candidate.update({ status: 'ASSIGNED' }, { transaction });
    return { reset: true };
  });
}

/**
 * Extend time = grant additional minutes to a running attempt. Falls back to
 * updating the assessment window when the attempt has no per-attempt deadline.
 */
async function extendCandidateTime(assessment, candidate, minutes = 15) {
  if (!assessment || !candidate) return { error: 'Candidate or hiring workflow not found.' };
  const extra = Math.max(1, Math.min(Number(minutes) || 15, 240));
  const attempt = await canonicalAttemptFor(assessment, candidate.user_id);
  if (!attempt || String(attempt.status).toUpperCase() !== 'IN_PROGRESS') {
    const error = new Error('Candidate has no active attempt to extend.');
    error.status = 409;
    throw error;
  }
  // The canonical engines compute the deadline from AssessmentSession.expiresAt
  // or startedAt + timeLimit. Extending the session keeps the backend timer
  // authoritative.
  const sessions = await AssessmentSession.findAll({ where: { attemptId: attempt.id }, transaction: null });
  for (const session of sessions) {
    if (session.expiresAt) {
      await session.update({ expiresAt: new Date(new Date(session.expiresAt).getTime() + extra * 60_000) });
    }
  }
  // Fallback marker so the audit trail shows the extension.
  await attempt.update({ time_taken: attempt.timeTaken || 0 });
  return { extendedMinutes: extra };
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
  revokeCandidate,
  reassignCandidate,
  resetCandidateAttempt,
  extendCandidateTime,
  recheckCandidateRegistration,
};
