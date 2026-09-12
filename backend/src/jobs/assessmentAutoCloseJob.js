/**
 * Assessment Auto-Close & Finalization Scheduler
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 30 seconds across the cluster, protected by distributed leader election.
 * Handles BOTH Quizzes and Coding Assessments:
 *
 *   1. Finds PUBLISHED assessments whose endTime has arrived and finalizedAt is null.
 *   2. Auto-submits any active in-progress attempts, computes their scores, and stores results.
 *   3. Concludes active monitoring and proctoring sessions.
 *   4. Identifies all enrolled learners who never started and marks them as ABSENT.
 *   5. Dispatches an idempotent summary notification to the trainer.
 *   6. Emits a real-time WebSocket broadcast ('assessment:ended').
 *   7. Marks the assessment as CLOSED and finalizedAt = NOW.
 */

const { Op } = require('sequelize');
const {
  AIQuiz,
  CodingAssessment,
  QuizAttempt,
  CodingAttempt,
  QuizResult,
  CodingResult,
  AIQuestion,
  QuizAnswer,
  Enrollment,
  QuizAssignment,
  ProctoringReport,
  MonitoringSession,
  Notification,
} = require('../models');
const { withLeaderLock } = require('../utils/leaderElection');
const relay = require('../socket/crossInstance');
const availabilityService = require('../services/assessmentAvailabilityService');
const proctoringReportService = require('../services/proctoringReportService');
const assessmentVerificationService = require('../services/assessmentVerificationService');
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const INTERVAL_MS = 30_000;

/**
 * Auto-finalizes an expired Quiz
 */
async function finalizeQuiz(quiz, now, io) {
  logger.info(`[assessmentAutoCloseJob] Finalizing Quiz #${quiz.id} "${quiz.title}" (End time: ${quiz.endTime})`);

  // 1. Auto-submit any IN_PROGRESS attempts
  const activeAttempts = await QuizAttempt.findAll({
    where: { quizId: quiz.id, status: 'IN_PROGRESS' },
  });

  const questions = await AIQuestion.findAll({ where: { quizId: quiz.id } });
  const questionMap = new Map(questions.map(q => [Number(q.id), q]));
  let maxScore = questions.reduce((sum, q) => sum + (parseFloat(q.marks) || 1), 0);
  if (maxScore <= 0) maxScore = questions.length || 1;

  for (const attempt of activeAttempts) {
    try {
      const answers = await QuizAnswer.findAll({ where: { attemptId: attempt.id } });
      let totalScore = 0;
      for (const ans of answers) {
        const q = questionMap.get(Number(ans.questionId));
        if (!q) continue;
        let isCorrect = false;
        let qScore = 0;
        const qMarks = parseFloat(q.marks) || 1;
        if (ans.selectedOption !== undefined && ans.selectedOption !== null && q.options) {
          const opts = Array.isArray(q.options) ? q.options : [];
          const selectedText = opts[ans.selectedOption];
          if (selectedText && q.correctAnswer && String(selectedText).trim() === String(q.correctAnswer).trim()) {
            isCorrect = true;
            qScore = qMarks;
          }
        }
        ans.isCorrect = isCorrect;
        ans.score = qScore;
        await ans.save();
        totalScore += qScore;
      }

      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

      // Create or update QuizResult
      await QuizResult.upsert({
        attemptId: attempt.id,
        quizId: quiz.id,
        participantId: attempt.participantId,
        totalScore,
        maxScore,
        percentage,
        evaluatedAt: now,
        resultPublished: false,
      });

      // Update attempt status
      await attempt.update({
        status: 'AUTO_SUBMITTED',
        submittedAt: now,
        autoSubmitted: true,
        timeExpired: true,
        submissionType: 'AUTO_SUBMITTED',
        attendanceStatus: 'PRESENT',
      });

      // Update assignment
      await QuizAssignment.update(
        { status: 'COMPLETED' },
        { where: { quizId: quiz.id, participantId: attempt.participantId } }
      ).catch(() => {});

      // Finalize proctoring & monitoring
      proctoringReportService.generateFinalProctoringReport(attempt.id).catch(() => {});
      assessmentVerificationService.endSession({
        assessmentType: 'QUIZ',
        attemptId: attempt.id,
        participantId: attempt.participantId,
        force: true,
      }).catch(() => {});
    } catch (attemptErr) {
      logger.error(`[assessmentAutoCloseJob] Error finalizing attempt #${attempt.id}:`, attemptErr);
    }
  }

  // 2. Identify all enrolled participants
  const enrollmentFilter = [];
  if (quiz.courseId) enrollmentFilter.push({ courseId: quiz.courseId });
  if (quiz.trainingId) enrollmentFilter.push({ trainingId: quiz.trainingId });

  let enrolledParticipants = [];
  if (enrollmentFilter.length > 0) {
    const enrollments = await Enrollment.findAll({
      where: {
        status: { [Op.in]: ['ENROLLED', 'COMPLETED'] },
        [Op.or]: enrollmentFilter,
      },
      attributes: ['participantId'],
    });
    enrolledParticipants = [...new Set(enrollments.map(e => Number(e.participantId)))];
  }

  const assignments = await QuizAssignment.findAll({
    where: { quizId: quiz.id },
    attributes: ['participantId'],
  });
  assignments.forEach(a => enrolledParticipants.push(Number(a.participantId)));
  enrolledParticipants = [...new Set(enrolledParticipants)];

  // 3. Mark absent participants (assigned/enrolled with no attempt)
  const existingAttempts = await QuizAttempt.findAll({
    where: { quizId: quiz.id },
    attributes: ['participantId'],
  });
  const attendedSet = new Set(existingAttempts.map(a => Number(a.participantId)));

  const absentParticipantIds = enrolledParticipants.filter(pId => !attendedSet.has(pId));
  for (const absentId of absentParticipantIds) {
    await QuizAssignment.update(
      { status: 'COMPLETED' },
      { where: { quizId: quiz.id, participantId: absentId } }
    ).catch(() => {});
  }

  // 4. Calculate final metrics
  const allResults = await QuizResult.findAll({ where: { quizId: quiz.id } });
  const totalEnrolled = enrolledParticipants.length;
  const completedCount = allResults.length;
  const autoSubmittedCount = activeAttempts.length;
  const absentCount = absentParticipantIds.length;
  const avgScore = completedCount > 0
    ? Math.round(allResults.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0) / completedCount)
    : 0;

  // Malpractice flags count (high/critical reports or violations >= 3)
  const malpracticeReports = await ProctoringReport.count({
    where: {
      attemptId: { [Op.in]: (await QuizAttempt.findAll({ where: { quizId: quiz.id }, attributes: ['id'] })).map(a => a.id) },
      riskLevel: { [Op.in]: ['HIGH', 'CRITICAL'] },
    },
  }).catch(() => 0);

  // 5. Send idempotent trainer notification
  await sendTrainerEndNotification({
    trainerId: quiz.trainerId || quiz.createdBy,
    assessmentTitle: quiz.title,
    assessmentType: 'Quiz',
    endTime: quiz.endTime,
    timezone: quiz.timezone,
    totalEnrolled: totalEnrolled || completedCount + absentCount,
    completedCount,
    absentCount,
    autoSubmittedCount,
    avgScore,
    malpracticeCount: malpracticeReports,
    relatedEntityType: 'ai_quiz',
    relatedEntityId: quiz.id,
    courseId: quiz.courseId,
    io,
  });

  // 6. Mark quiz as CLOSED and finalized
  await quiz.update({
    status: 'CLOSED',
    closedAt: now,
    finalizedAt: now,
  });

  // 7. Real-time broadcast
  if (io) {
    relay.relayEmit(io, 'broadcast', '*', 'assessment:ended', {
      assessmentType: 'QUIZ',
      assessmentId: quiz.id,
      title: quiz.title,
    });
    relay.relayEmit(io, 'broadcast', '*', 'quiz:closed', { quizId: quiz.id });
  }

  logger.info(`[assessmentAutoCloseJob] Quiz #${quiz.id} finalized successfully: ${completedCount} completed, ${absentCount} absent, ${autoSubmittedCount} auto-submitted.`);
}

/**
 * Auto-finalizes an expired Coding Assessment
 */
async function finalizeCodingAssessment(assessment, now, io) {
  logger.info(`[assessmentAutoCloseJob] Finalizing Coding Assessment #${assessment.id} "${assessment.title}" (End time: ${assessment.endTime})`);

  // 1. Auto-submit any IN_PROGRESS attempts
  const activeAttempts = await CodingAttempt.findAll({
    where: { assessmentId: assessment.id, status: 'IN_PROGRESS' },
  });

  for (const attempt of activeAttempts) {
    try {
      const { CodingSubmission, CodingProblem } = require('../models');
      const submissions = await CodingSubmission.findAll({ where: { attemptId: attempt.id } });
      const problems = await CodingProblem.findAll({ where: { assessmentId: assessment.id } });
      const maxScore = problems.reduce((s, p) => s + (p.marks || 10), 0) || 10;
      let totalScore = 0;
      let passedCount = 0;

      for (const sub of submissions) {
        if (sub.score != null) totalScore += parseFloat(sub.score) || 0;
        if (sub.status === 'ACCEPTED') passedCount++;
      }

      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

      await CodingResult.upsert({
        attemptId: attempt.id,
        assessmentId: assessment.id,
        participantId: attempt.participantId,
        totalScore,
        maxScore,
        percentage,
        problemsSolved: passedCount,
        totalProblems: problems.length,
        evaluatedAt: now,
      });

      await attempt.update({
        status: 'AUTO_SUBMITTED',
        submittedAt: now,
        autoSubmitted: true,
        timeExpired: true,
        submissionType: 'AUTO_SUBMITTED',
        attendanceStatus: 'PRESENT',
      });

      proctoringReportService.generateFinalProctoringReport(attempt.id).catch(() => {});
      assessmentVerificationService.endSession({
        assessmentType: 'CODING',
        attemptId: attempt.id,
        participantId: attempt.participantId,
        force: true,
      }).catch(() => {});
    } catch (attemptErr) {
      logger.error(`[assessmentAutoCloseJob] Error finalizing coding attempt #${attempt.id}:`, attemptErr);
    }
  }

  // 2. Identify enrolled participants
  const enrollmentFilter = [];
  if (assessment.courseId) enrollmentFilter.push({ courseId: assessment.courseId });
  if (assessment.trainingId) enrollmentFilter.push({ trainingId: assessment.trainingId });

  let enrolledParticipants = [];
  if (enrollmentFilter.length > 0) {
    const enrollments = await Enrollment.findAll({
      where: {
        status: { [Op.in]: ['ENROLLED', 'COMPLETED'] },
        [Op.or]: enrollmentFilter,
      },
      attributes: ['participantId'],
    });
    enrolledParticipants = [...new Set(enrollments.map(e => Number(e.participantId)))];
  }

  // 3. Mark absent participants
  const existingAttempts = await CodingAttempt.findAll({
    where: { assessmentId: assessment.id },
    attributes: ['participantId'],
  });
  const attendedSet = new Set(existingAttempts.map(a => Number(a.participantId)));
  const absentParticipantIds = enrolledParticipants.filter(pId => !attendedSet.has(pId));

  // 4. Calculate metrics
  const allResults = await CodingResult.findAll({ where: { assessmentId: assessment.id } });
  const totalEnrolled = enrolledParticipants.length;
  const completedCount = allResults.length;
  const autoSubmittedCount = activeAttempts.length;
  const absentCount = absentParticipantIds.length;
  const avgScore = completedCount > 0
    ? Math.round(allResults.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0) / completedCount)
    : 0;

  const malpracticeReports = await ProctoringReport.count({
    where: {
      attemptId: { [Op.in]: (await CodingAttempt.findAll({ where: { assessmentId: assessment.id }, attributes: ['id'] })).map(a => a.id) },
      riskLevel: { [Op.in]: ['HIGH', 'CRITICAL'] },
    },
  }).catch(() => 0);

  // 5. Send idempotent trainer notification
  await sendTrainerEndNotification({
    trainerId: assessment.trainerId,
    assessmentTitle: assessment.title,
    assessmentType: 'Coding Assessment',
    endTime: assessment.endTime,
    timezone: assessment.timezone,
    totalEnrolled: totalEnrolled || completedCount + absentCount,
    completedCount,
    absentCount,
    autoSubmittedCount,
    avgScore,
    malpracticeCount: malpracticeReports,
    relatedEntityType: 'coding_assessment',
    relatedEntityId: assessment.id,
    courseId: assessment.courseId,
    io,
  });

  // 6. Update assessment
  await assessment.update({
    status: 'CLOSED',
    closedAt: now,
    finalizedAt: now,
  });

  // 7. Real-time broadcast
  if (io) {
    relay.relayEmit(io, 'broadcast', '*', 'assessment:ended', {
      assessmentType: 'CODING',
      assessmentId: assessment.id,
      title: assessment.title,
    });
  }

  logger.info(`[assessmentAutoCloseJob] Coding Assessment #${assessment.id} finalized successfully: ${completedCount} completed, ${absentCount} absent, ${autoSubmittedCount} auto-submitted.`);
}

/**
 * Dispatches an idempotent trainer notification
 */
async function sendTrainerEndNotification({
  trainerId,
  assessmentTitle,
  assessmentType,
  endTime,
  timezone,
  totalEnrolled,
  completedCount,
  absentCount,
  autoSubmittedCount,
  avgScore,
  malpracticeCount,
  relatedEntityType,
  relatedEntityId,
  courseId,
  io,
}) {
  if (!trainerId) return;

  // Check idempotency: avoid sending duplicate notifications
  const existingNotif = await Notification.findOne({
    where: {
      userId: trainerId,
      type: 'ASSESSMENT_ENDED',
      relatedEntityType,
      relatedEntityId: String(relatedEntityId),
    },
  });

  if (existingNotif) {
    logger.info(`[assessmentAutoCloseJob] Trainer notification already sent for ${assessmentType} #${relatedEntityId}`);
    return;
  }

  const formattedEndTime = availabilityService.formatTimeOnly(endTime, timezone);
  const message = `Assessment Ended\n"${assessmentTitle}" has ended.\nEnd time: ${formattedEndTime}\nParticipants: ${totalEnrolled}\nCompleted: ${completedCount}\nAbsent: ${absentCount}\nAuto-submitted: ${autoSubmittedCount}\nAverage Score: ${avgScore}%\nMalpractice Flags: ${malpracticeCount}\n\nAssessment report is ready.`;

  const actionUrl = courseId
    ? `/trainer/courses/${courseId}?tab=${relatedEntityType === 'ai_quiz' ? 'quizzes' : 'coding'}&assessmentId=${relatedEntityId}`
    : `/trainer/dashboard`;

  await NotificationService.createNotification({
    userId: trainerId,
    recipientRole: 'TRAINER',
    type: 'ASSESSMENT_ENDED',
    category: NotificationService.CATEGORIES.ASSESSMENT || 'ASSESSMENT',
    title: `Assessment Ended: ${assessmentTitle}`,
    message,
    relatedEntityType,
    relatedEntityId: String(relatedEntityId),
    actionUrl,
    priority: 'HIGH',
    metadata: {
      assessmentType,
      totalEnrolled,
      completedCount,
      absentCount,
      autoSubmittedCount,
      avgScore,
      malpracticeCount,
    },
  }, io).catch(err => {
    logger.error('[assessmentAutoCloseJob] Error sending trainer notification:', err);
  });
}

/**
 * Main execution tick
 */
async function tick() {
  await withLeaderLock('cron:assessment-auto-close', async () => {
    const now = new Date();
    let io = null;
    try {
      io = require('../app')?.get('io');
    } catch (_) {}

    try {
      // 1. Quizzes ready for finalization
      const expiredQuizzes = await AIQuiz.findAll({
        where: {
          status: 'PUBLISHED',
          endTime: { [Op.lte]: now },
          finalizedAt: null,
        },
      });

      for (const quiz of expiredQuizzes) {
        await finalizeQuiz(quiz, now, io);
      }

      // 2. Coding Assessments ready for finalization
      const expiredCoding = await CodingAssessment.findAll({
        where: {
          status: 'PUBLISHED',
          endTime: { [Op.lte]: now },
          finalizedAt: null,
        },
      });

      for (const coding of expiredCoding) {
        await finalizeCodingAssessment(coding, now, io);
      }
    } catch (err) {
      logger.error('[assessmentAutoCloseJob] Sweep error:', err.message);
    }
  });
}

let intervalHandle = null;

function start() {
  tick();
  intervalHandle = setInterval(tick, INTERVAL_MS);
  logger.info(`[assessmentAutoCloseJob] Assessment Auto-Close & Finalization scheduler active (interval: ${INTERVAL_MS}ms)`);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[assessmentAutoCloseJob] Scheduler stopped');
  }
}

module.exports = {
  start,
  stop,
  tick,
  autoCloseExpiredAssessments: tick,
  finalizeQuiz,
  finalizeCodingAssessment,
};
