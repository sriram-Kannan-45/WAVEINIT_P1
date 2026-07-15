const express = require('express');
const { Op } = require('sequelize');
const {
  AIQuiz,
  Enrollment,
  QuizAttempt,
  QuizResult,
  QuizAnswer,
  AIQuestion,
  AIQuestionOption,
  LessonQuiz,
  QuizProgress,
  ExamSession,
  ProctorActivity,
  Violation,
  AssessmentSession,
  Course,
  Training,
  CourseTrainerAssignment,
  TrainingTrainerAssignment,
  QuizAssignment,
  QuizCopyViolation
} = require('../models');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const NotificationService = require('../services/notificationService');
const { assertTransition } = require('../utils/quizStateMachine');

const router = express.Router();

// Middleware to ensure user is logged in
router.use(authenticateToken);

// Helper to check if trainer owns or is assigned to the course/training
async function verifyTrainerAccess(req, res, quiz) {
  const trainerId = req.user.id;
  const role = req.user.role;

  if (role === 'ADMIN') return true;
  if (quiz.trainerId === trainerId || quiz.createdBy === trainerId) return true;

  if (quiz.courseId) {
    const courseAssigned = await CourseTrainerAssignment.findOne({
      where: { courseId: quiz.courseId, trainerId }
    });
    if (courseAssigned) return true;
  }

  if (quiz.trainingId) {
    const trainingAssigned = await TrainingTrainerAssignment.findOne({
      where: { trainingId: quiz.trainingId, trainerId }
    });
    if (trainingAssigned) return true;
  }

  res.status(403).json({ error: 'You are not authorized to manage this quiz' });
  return false;
}

/**
 * POST /api/quizzes/:id/publish
 * DRAFT → PUBLISHED. Accepts optional start_time, end_time.
 */
router.post('/:id/publish', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    assertTransition(quiz, 'PUBLISHED');
    console.log(`[publish] === PUBLISHING QUIZ #${quiz.id} ===`);

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    // Resolve trainingId
    let trainingId = quiz.trainingId;
    if (!trainingId && quiz.courseId) {
      const course = await Course.findByPk(quiz.courseId);
      if (course && course.trainingProgramId) trainingId = course.trainingProgramId;
    }
    if (!trainingId) {
      const { Training, TrainingTrainerAssignment } = require('../models');
      const { Op } = require('sequelize');
      const training = await Training.findOne({
        where: { [Op.or]: [{ trainerId: quiz.trainerId }, { createdBy: quiz.trainerId }] }
      });
      if (training) trainingId = training.id;
      else {
        const assignment = await TrainingTrainerAssignment.findOne({ where: { trainerId: quiz.trainerId } });
        if (assignment) trainingId = assignment.trainingId;
      }
    }

    const now = new Date();
    const startTime = req.body.startTime ? new Date(req.body.startTime) : null;
    const endTime = req.body.endTime ? new Date(req.body.endTime) : null;

    // If end_time is provided, validate it
    if (endTime && endTime <= now) {
      return res.status(400).json({ error: 'end_time must be in the future' });
    }
    if (startTime && endTime && startTime >= endTime) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }

    const updateData = {
      isPublished: true,
      published: true,
      publishedAt: now,
      status: 'PUBLISHED',
      startTime,
      endTime,
    };
    if (trainingId && !quiz.trainingId) updateData.trainingId = trainingId;
    await quiz.update(updateData);

    // Recompute total_marks from questions
    const questions = await AIQuestion.findAll({ where: { quizId: quiz.id } });
    if (questions.length > 0) {
      const total = questions.reduce((sum, q) => sum + (q.marks || 1), 0);
      await quiz.update({ totalMarks: total });
    }

    console.log(`[publish] Quiz #${quiz.id} published. startTime=${startTime}, endTime=${endTime}`);

    // Notifications + socket event
    let participantIds = [];
    const effectiveTrainingId = trainingId || quiz.trainingId;
    if (quiz.courseId) {
      const enrollments = await Enrollment.findAll({ where: { courseId: quiz.courseId, status: 'ENROLLED' } });
      participantIds = enrollments.map(e => e.participantId);
    } else if (effectiveTrainingId) {
      const enrollments = await Enrollment.findAll({ where: { trainingId: effectiveTrainingId, status: 'ENROLLED' } });
      participantIds = enrollments.map(e => e.participantId);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('quiz:published', { quizId: quiz.id, courseId: quiz.courseId, trainingId: quiz.trainingId });
    }

    for (const pId of participantIds) {
      try {
        await NotificationService.createNotification({
          userId: pId,
          message: `New AI Quiz Available: ${quiz.title}`,
          type: 'ANNOUNCEMENT',
          actionUrl: quiz.courseId ? `/participant/courses/${quiz.courseId}/quizzes` : '/participant/quizzes',
          relatedEntityId: quiz.id,
          relatedEntityType: 'AI_QUIZ'
        }, io);
      } catch (err) {
        console.error('Failed to create notification for user:', pId, err.message);
      }
    }

    res.json({ success: true, message: 'Quiz published successfully', quiz });
  } catch (error) {
    console.error('Error publishing quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/close
 * PUBLISHED → CLOSED. Manual force-close. Auto-submits any IN_PROGRESS attempts.
 */
router.post('/:id/close', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    assertTransition(quiz, 'CLOSED', 'Quiz must be PUBLISHED to close');

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const now = new Date();

    // Auto-submit any in-progress attempts
    const inProgressAttempts = await QuizAttempt.findAll({
      where: { quizId: quiz.id, status: 'IN_PROGRESS' }
    });
    for (const attempt of inProgressAttempts) {
      await attempt.update({ status: 'AUTO_SUBMITTED', submittedAt: now });
    }

    await quiz.update({
      status: 'CLOSED',
      closedAt: now,
      isPublished: true,
      published: true,
    });

    console.log(`[close] Quiz #${quiz.id} closed. ${inProgressAttempts.length} attempts auto-submitted.`);

    const io = req.app.get('io');
    if (io) {
      io.emit('quiz:closed', { quizId: quiz.id });
    }

    res.json({ success: true, message: 'Quiz closed successfully', autoSubmitted: inProgressAttempts.length });
  } catch (error) {
    console.error('Error closing quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/unpublish
 * PUBLISHED → DRAFT (only if zero attempts exist).
 */
router.post('/:id/unpublish', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    assertTransition(quiz, 'DRAFT', 'Only PUBLISHED quizzes with zero attempts can be unpublished');

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const attemptCount = await QuizAttempt.count({ where: { quizId: quiz.id } });
    if (attemptCount > 0) {
      return res.status(400).json({
        error: 'Cannot unpublish — quiz already has participant attempts. Close it instead.',
        attemptCount
      });
    }

    await quiz.update({
      status: 'DRAFT',
      isPublished: false,
      published: false,
      publishedAt: null,
      startTime: null,
      endTime: null,
    });

    res.json({ success: true, message: 'Quiz returned to draft' });
  } catch (error) {
    console.error('Error unpublishing quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/send
 * Sends the quiz to all participants enrolled in the quiz's training.
 * Creates per-participant quiz_assignment records with status='PENDING',
 * publishes the quiz, and sends notifications.
 */
router.post('/:id/send', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    console.log(`[send] === SENDING QUIZ #${quiz.id} ===`);
    console.log(`[send] Quiz title: "${quiz.title}", trainingId=${quiz.trainingId}, courseId=${quiz.courseId}`);

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    if (!quiz.trainingId && !quiz.courseId) {
      return res.status(400).json({ error: 'Quiz has no training or course assigned. Please assign one first.' });
    }

    // Build enrollment lookup conditions — support both trainingId and courseId
    const enrollmentOrConditions = [];
    if (quiz.trainingId) {
      enrollmentOrConditions.push({ trainingId: quiz.trainingId });
    }
    if (quiz.courseId) {
      enrollmentOrConditions.push({ courseId: quiz.courseId });
    }

    const enrollments = await Enrollment.findAll({
      where: {
        status: 'ENROLLED',
        [Op.or]: enrollmentOrConditions
      }
    });

    if (enrollments.length === 0) {
      console.log(`[send] No enrolled participants found for training #${quiz.trainingId} / course #${quiz.courseId}`);
      // Still publish the quiz so it shows up once someone enrolls
      const now = new Date();
      await quiz.update({
        isPublished: true,
        publishedAt: now,
        status: 'PUBLISHED',
        published: true
      });
      return res.json({
        success: true,
        message: 'Quiz published. No enrolled participants found yet — they will see it when they enroll.',
        participantCount: 0,
      });
    }

    const participantIds = [...new Set(enrollments.map(e => e.participantId))];
    console.log(`[send] Found ${participantIds.length} enrolled participants: [${participantIds.join(',')}]`);

    // Create quiz_assignment records for each participant
    const { QuizAssignment } = require('../models');
    const now = new Date();
    let createdCount = 0;

    for (const participantId of participantIds) {
      try {
        await QuizAssignment.findOrCreate({
          where: { quizId: quiz.id, participantId },
          defaults: {
            quizId: quiz.id,
            participantId,
            status: 'PENDING',
            assignedAt: now
          }
        });
        createdCount++;
      } catch (dupErr) {
        // Unique constraint — already assigned, skip
        console.log(`[send] Participant #${participantId} already assigned to quiz #${quiz.id}`);
      }
    }

    console.log(`[send] Created ${createdCount} quiz_assignment records`);

    // Publish the quiz
    await quiz.update({
      isPublished: true,
      publishedAt: now,
      status: 'PUBLISHED',
      published: true
    });

    console.log(`[send] Quiz #${quiz.id} published successfully`);

    // Send notifications to all enrolled participants
    const io = req.app.get('io');
    for (const pId of participantIds) {
      try {
        await NotificationService.createNotification({
          userId: pId,
          message: `New AI Quiz Available: ${quiz.title}`,
          type: 'ANNOUNCEMENT',
          actionUrl: '/participant/quizzes',
          relatedEntityId: quiz.id,
          relatedEntityType: 'AI_QUIZ'
        }, io);
      } catch (err) {
        console.error(`[send] Failed to create notification for user #${pId}:`, err.message);
      }
    }

    console.log(`[send] Notifications sent to ${participantIds.length} participants`);

    // Emit socket event to refresh participant dashboards
    if (io) {
      io.emit('quiz:published', { quizId: quiz.id, trainingId: quiz.trainingId });
      console.log(`[send] Socket event 'quiz:published' emitted`);
    }

    res.json({
      success: true,
      message: `Quiz sent to ${createdCount} participants successfully`,
      data: {
        quizId: quiz.id,
        trainingId: quiz.trainingId,
        participantCount: createdCount,
        isPublished: true
      }
    });
  } catch (error) {
    console.error('[send] Error sending quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quizzes/:id/results-summary
 * Live (no-cache) summary of quiz completion status.
 * Used by PublishDialog and Results tab to show correct counts on every open.
 * IMPORTANT: never trust cached/prop-passed counts — always query fresh.
 */
router.get('/:id/results-summary', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const { fn, col, Op: SeqOp } = require('sequelize');
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    // Resolve the enrolled participant list from Enrollment table
    const enrollmentWhere = [];
    if (quiz.courseId)   enrollmentWhere.push({ courseId: quiz.courseId });
    if (quiz.trainingId) enrollmentWhere.push({ trainingId: quiz.trainingId });

    const enrollments = enrollmentWhere.length > 0
      ? await Enrollment.findAll({ where: { [Op.or]: enrollmentWhere }, attributes: ['participantId'] })
      : [];

    const participantIds = [...new Set(enrollments.map(e => String(e.participantId)))];
    const enrolled = participantIds.length;

    // completed = distinct participants with a QuizResult row (graded/evaluated)
    const completed = enrolled === 0 ? 0 : await QuizResult.count({
      where: { quizId: quiz.id, participantId: participantIds },
    });
    const pending = enrolled - completed;

    // Average score and pass rate
    let averageScore = null;
    let passRate = null;
    if (completed > 0) {
      const agg = await QuizResult.findOne({
        where: { quizId: quiz.id, participantId: participantIds },
        attributes: [[fn('AVG', col('percentage')), 'avg']],
        raw: true,
      });
      averageScore = agg?.avg != null ? parseFloat(parseFloat(agg.avg).toFixed(1)) : null;

      const passThreshold = quiz.passScore || 50;
      const passed = await QuizResult.count({
        where: {
          quizId: quiz.id,
          participantId: participantIds,
          percentage: { [Op.gte]: passThreshold },
        },
      });
      passRate = parseFloat(((passed / completed) * 100).toFixed(1));
    }

    res.json({
      success: true,
      quiz_id: quiz.id,
      title: quiz.title,
      enrolled,
      completed,
      pending,
      averageScore,
      passRate,
      results_visibility: quiz.resultStatus || 'HIDDEN',
      can_publish_without_override: pending === 0 && enrolled > 0,
    });
  } catch (error) {
    console.error('[results-summary] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/publish-result
 * Publishes results so participants can see their scores.
 * Accepts: { override: boolean, reason?: string }
 * Recomputes pending count live — never trusts client-sent numbers.
 */
router.post('/:id/publish-result', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const override = req.body.override === true || req.body.force === true;
    const reason   = req.body.reason || null;

    // Recompute live — do not trust any client-sent count
    const enrollmentWhere = [];
    if (quiz.courseId)   enrollmentWhere.push({ courseId: quiz.courseId });
    if (quiz.trainingId) enrollmentWhere.push({ trainingId: quiz.trainingId });

    const enrollments = enrollmentWhere.length > 0
      ? await Enrollment.findAll({ where: { [Op.or]: enrollmentWhere }, attributes: ['participantId'] })
      : [];
    const participantIds = [...new Set(enrollments.map(e => String(e.participantId)))];
    const enrolled = participantIds.length;

    const completed = enrolled === 0 ? 0 : await QuizResult.count({
      where: { quizId: quiz.id, participantId: participantIds },
    });
    const pending = enrolled - completed;

    if (pending > 0 && !override) {
      return res.status(400).json({
        error: 'PENDING_PARTICIPANTS',
        message: `${pending} participant(s) haven't completed the quiz yet.`,
        pending_count: pending,
        enrolled,
        completed,
      });
    }

    // Compute rank for each participant based on percentage
    const results = await QuizResult.findAll({
      where: { quizId: quiz.id },
      order: [['percentage', 'DESC']]
    });
    const now = new Date();
    const trainerId = req.user.id;
    for (let i = 0; i < results.length; i++) {
      await results[i].update({
        rank: i + 1,
        resultPublished: true,
        publishedAt: now,
        publishedBy: trainerId,
      });
    }

    await quiz.update({
      isResultPublished: true,
      resultPublishedAt: now,
      resultStatus: 'PUBLISHED',
      // Allow from PUBLISHED or CLOSED state (state machine is optional here)
      ...(quiz.status === 'CLOSED' ? { status: 'RESULTS_PUBLISHED' } : {}),
    });

    // Write audit log
    try {
      const { QuizResultsAudit } = require('../models');
      await QuizResultsAudit.create({
        quizId: quiz.id,
        action: (pending > 0 && override) ? 'override_used' : 'published',
        performedBy: trainerId,
        enrolledCount: enrolled,
        completedCount: completed,
        pendingCount: pending,
        reason: (pending > 0 && override) ? (reason || 'Override used without reason') : null,
      });
    } catch (auditErr) {
      console.warn('[publish-result] Audit log failed (non-fatal):', auditErr.message);
    }

    // Broadcast updated leaderboard
    const io = req.app.get('io');
    if (io) {
      try {
        const { User } = require('../models');
        const buildLeaderboard = async (where) => {
          const rows = await QuizResult.findAll({
            where: { ...where, resultPublished: true },
            include: [{ model: User, as: 'participant', attributes: ['id', 'name'] }],
            order: [['percentage', 'DESC']]
          });
          return rows.map((r, idx) => ({
            rank: idx + 1,
            userId: r.participantId,
            name: r.participant?.name || 'Unknown',
            score: parseFloat(r.percentage),
            totalScore: parseFloat(r.totalScore),
            maxScore: parseFloat(r.maxScore)
          }));
        };
        const quizLb = (await buildLeaderboard({ quizId: quiz.id })).slice(0, 50);
        io.to(`leaderboard:quiz:${quiz.id}`).emit('leaderboard:update', { scope: 'quiz', id: String(quiz.id), leaderboard: quizLb });
        if (quiz.trainingId) {
          const trainingQuizIds = (await AIQuiz.findAll({
            where: { trainingId: quiz.trainingId },
            attributes: ['id']
          })).map(q => q.id);
          const trainLb = (await buildLeaderboard({ quizId: trainingQuizIds })).slice(0, 50);
          io.to(`leaderboard:training:${quiz.trainingId}`).emit('leaderboard:update', { scope: 'training', id: String(quiz.trainingId), leaderboard: trainLb });
        }
      } catch (emitErr) {
        console.warn('[publish-result] leaderboard emit failed:', emitErr.message);
      }
      io.emit('quiz:results:published', { quizId: quiz.id, courseId: quiz.courseId, trainingId: quiz.trainingId });
    }

    // Notify all enrolled participants
    for (const pId of participantIds) {
      try {
        await NotificationService.createNotification({
          userId: pId,
          message: `Your quiz result is now available for: ${quiz.title}`,
          type: 'FEEDBACK_REPLY',
          actionUrl: quiz.courseId ? `/participant/courses/${quiz.courseId}/quizzes` : '/participant/quizzes',
          relatedEntityId: quiz.id,
          relatedEntityType: 'AI_QUIZ'
        }, io);
      } catch (err) {
        console.error('Failed to create result notification for user:', pId, err.message);
      }
    }

    res.json({ success: true, message: 'Results published successfully', published_at: now, enrolled, completed });
  } catch (error) {
    console.error('Error publishing results:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Individual & bulk result management ──────────────────────────────────


/**
 * GET /api/quizzes/:id
 * Returns full quiz details including questions, course, training, lesson info.
 */
router.get('/:id', async (req, res) => {
  try {
    const { Course, Training } = require('../models');
    const quiz = await AIQuiz.findByPk(req.params.id, {
      include: [
        { model: AIQuestion, as: 'questions', order: [['order', 'ASC'], ['id', 'ASC']] },
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] },
      ]
    });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json({ quiz });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quizzes/:id/results
 * Trainer-only: returns all results for a quiz with participant details,
 * regardless of publication status (for the trainer results management page).
 */
router.get('/:id/results', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const { User, QuizAttempt } = require('../models');
    const results = await QuizResult.findAll({
      where: { quizId: quiz.id },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email', 'profilePic'] },
        { model: QuizAttempt, as: 'attempt', attributes: ['id', 'status', 'violationCount'] }
      ],
      order: [['percentage', 'DESC']]
    });

    const participantResults = results.map((r, idx) => ({
      id: r.id,
      attemptId: r.attemptId,
      participantId: r.participantId,
      participantName: r.participant?.name || 'Unknown',
      participantEmail: r.participant?.email || '',
      totalScore: parseFloat(r.totalScore),
      maxScore: parseFloat(r.maxScore),
      percentage: parseFloat(r.percentage),
      rank: r.rank || idx + 1,
      evaluatedAt: r.evaluatedAt,
      resultPublished: r.resultPublished,
      publishedAt: r.publishedAt,
      attemptStatus: r.attempt?.status || 'SUBMITTED',
      violationCount: r.attempt?.violationCount || 0,
    }));

    res.json({ results: participantResults, quizTitle: quiz.title });
  } catch (error) {
    console.error('[results] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/publish-participant/:participantId
 * Trainer-only: publishes a single participant's result.
 */
router.post('/:id/publish-participant/:participantId', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const participantId = req.params.participantId;
    const result = await QuizResult.findOne({
      where: { quizId: quiz.id, participantId }
    });
    if (!result) return res.status(404).json({ error: 'Result not found for this participant' });
    if (result.resultPublished) {
      return res.status(409).json({ error: 'Result already published' });
    }

    const now = new Date();
    const trainerId = req.user.id;

    // Compute rank for this participant
    const higherCount = await QuizResult.count({
      where: { quizId: quiz.id, percentage: { [Op.gt]: result.percentage } },
    });
    await result.update({
      rank: higherCount + 1,
      resultPublished: true,
      publishedAt: now,
      publishedBy: trainerId,
    });

    // Broadcast updated leaderboard
    const io = req.app.get('io');
    if (io) {
      try {
        const { User } = require('../models');
        const buildLeaderboard = async (where) => {
          const rows = await QuizResult.findAll({
            where: { ...where, resultPublished: true },
            include: [{ model: User, as: 'participant', attributes: ['id', 'name'] }],
            order: [['percentage', 'DESC']]
          });
          return rows.map((r, idx) => ({
            rank: idx + 1,
            userId: r.participantId,
            name: r.participant?.name || 'Unknown',
            score: parseFloat(r.percentage),
            totalScore: parseFloat(r.totalScore),
            maxScore: parseFloat(r.maxScore)
          }));
        };
        const quizLb = (await buildLeaderboard({ quizId: quiz.id })).slice(0, 50);
        io.to(`leaderboard:quiz:${quiz.id}`).emit('leaderboard:update', { scope: 'quiz', id: String(quiz.id), leaderboard: quizLb });
      } catch (emitErr) {
        console.warn('[publish-participant] leaderboard emit failed:', emitErr.message);
      }
    }

    await NotificationService.createNotification({
      userId: participantId,
      message: `Your result for "${quiz.title}" has been published.`,
      type: 'FEEDBACK_REPLY',
      actionUrl: quiz.courseId ? `/participant/courses/${quiz.courseId}/quizzes` : '/participant/quizzes',
      relatedEntityId: quiz.id,
      relatedEntityType: 'AI_QUIZ'
    }, io);

    res.json({ success: true, message: 'Result published for participant', participantId });
  } catch (error) {
    console.error('[publish-participant] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Question CRUD ─────────────────────────────────────────────────────────

/**
 * GET /api/quizzes/:id/questions
 * Returns all questions for a quiz, ordered by `order` ASC.
 */
router.get('/:id/questions', async (req, res) => {
  try {
    const quizId = req.params.id;
    const userRole = (req.user.role || '').toUpperCase();
    const userId = req.user.id;

    console.log(`[GET /api/quizzes/${quizId}/questions] Request by user #${userId}, role: ${userRole}`);
    console.log(`[GET /api/quizzes/${quizId}/questions] JWT Payload:`, req.user);

    const quiz = await AIQuiz.findByPk(quizId, {
      attributes: [
        'id', 'courseId', 'trainingId', 'createdBy', 'status', 'timeLimit', 'title',
        'copyProtectionEnabled', 'maxCopyWarnings', 'copyViolationActions', 'copyWarningMessage', 'copyDisqualifyAction',
        'proctoringEnabled', 'proctoringLevel', 'gracePeriodMinutes'
      ]
    });
    if (!quiz) {
      console.log(`[GET /api/quizzes/${quizId}/questions] Quiz not found: #${quizId}`);
      return res.status(404).json({ error: 'Quiz not found' });
    }

    if (userRole === 'TRAINER' || userRole === 'ADMIN') {
      const hasAccess = await verifyTrainerAccess(req, res, quiz);
      if (!hasAccess) {
        console.log(`[GET /api/quizzes/${quizId}/questions] Trainer/Admin access denied for user #${userId}`);
        return; // verifyTrainerAccess already responded with 403
      }

      const questions = await AIQuestion.findAll({
        where: { quizId: quiz.id },
        order: [['order', 'ASC'], ['id', 'ASC']],
        include: [{ model: AIQuestionOption, as: 'options' }]
      });
      console.log(`[GET /api/quizzes/${quizId}/questions] Returning full question details (count: ${questions.length}) for trainer/admin #${userId}`);
      return res.json({ questions });
    } else if (userRole === 'PARTICIPANT') {
      // 1. Check if quiz is published
      if (quiz.status !== 'PUBLISHED') {
        console.log(`[GET /api/quizzes/${quizId}/questions] Permission denied: Quiz is not PUBLISHED`);
        return res.status(403).json({ error: 'Quiz is not published or is currently unavailable.' });
      }

      // 2. Check enrollment
      const enrollmentCheck = await Enrollment.findOne({
        where: {
          participantId: userId,
          status: 'ENROLLED',
          [Op.or]: [
            ...(quiz.courseId ? [{ courseId: quiz.courseId }] : []),
            ...(quiz.trainingId ? [{ trainingId: quiz.trainingId }] : []),
          ]
        }
      });

      console.log(`[GET /api/quizzes/${quizId}/questions] Enrollment check result for participant #${userId}:`, enrollmentCheck ? `Enrolled (ID: ${enrollmentCheck.id}, Status: ${enrollmentCheck.status})` : 'Not Enrolled');

      if (!enrollmentCheck) {
        console.log(`[GET /api/quizzes/${quizId}/questions] Permission denied: Participant #${userId} is not enrolled in course #${quiz.courseId} / training #${quiz.trainingId}`);
        return res.status(403).json({ error: 'Access denied. You are not enrolled in this training.' });
      }

      // 3. Check attempt
      const hasAttempt = await QuizAttempt.findOne({
        where: { quizId: quiz.id, participantId: userId }
      });

      console.log(`[GET /api/quizzes/${quizId}/questions] QuizAttempt check result for participant #${userId}:`, hasAttempt ? `Attempt exists (ID: ${hasAttempt.id}, Status: ${hasAttempt.status})` : 'No Attempt');

      if (!hasAttempt) {
        console.log(`[GET /api/quizzes/${quizId}/questions] Permission denied: Participant #${userId} has no active/existing attempt for quiz #${quizId}`);
        return res.status(403).json({ error: 'Access denied. Start the quiz attempt first.' });
      }

      // Fetch questions without correct answers
      const questions = await AIQuestion.findAll({
        where: { quizId: quiz.id },
        attributes: ['id', 'questionText', 'questionType', 'options', 'order', 'pairs', 'marks'],
        order: [['order', 'ASC'], ['id', 'ASC']]
      });

      console.log(`[GET /api/quizzes/${quizId}/questions] Permission check result: APPROVED. Returning ${questions.length} questions.`);
      
      const apiResponse = {
        success: true,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          timeLimit: quiz.timeLimit,
          copyProtectionEnabled: quiz.copyProtectionEnabled,
          maxCopyWarnings: quiz.maxCopyWarnings,
          copyViolationActions: quiz.copyViolationActions,
          copyWarningMessage: quiz.copyWarningMessage,
          copyDisqualifyAction: quiz.copyDisqualifyAction,
          proctoringEnabled: quiz.proctoringEnabled,
          proctoringLevel: quiz.proctoringLevel,
          gracePeriodMinutes: quiz.gracePeriodMinutes
        },
        attempt: {
          id: hasAttempt.id,
          violationCount: hasAttempt.violationCount || 0,
          status: hasAttempt.status
        },
        questions: questions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          order: q.order,
          pairs: q.pairs,
          marks: q.marks
        }))
      };

      return res.json(apiResponse);
    } else {
      console.log(`[GET /api/quizzes/${quizId}/questions] Permission denied: Unknown/Unmatched role: ${userRole}`);
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
  } catch (error) {
    console.error(`[GET /api/quizzes/${req.params.id}/questions] Error:`, error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/questions
 * Adds a new question to the quiz.
 * Body: { questionText, questionType, options?, correctAnswer?, marks?, order?, ... }
 */
router.post('/:id/questions', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const { questionText, questionType, options, correctAnswer, acceptableAnswers, pairs, explanation, difficulty, marks, order, answerText } = req.body;

    // Auto-assign order if not provided
    let questionOrder = order;
    if (questionOrder == null) {
      const maxOrder = await AIQuestion.max('order', { where: { quizId: quiz.id } });
      questionOrder = (maxOrder || 0) + 1;
    }

    const question = await AIQuestion.create({
      quizId: quiz.id,
      questionText,
      questionType: questionType || 'MCQ',
      options: options || null,
      correctAnswer: correctAnswer || answerText || null,
      acceptableAnswers: acceptableAnswers || null,
      pairs: pairs || null,
      explanation: explanation || null,
      difficulty: difficulty || 'MEDIUM',
      marks: marks || 1,
      order: questionOrder,
    });

    res.status(201).json({ success: true, question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/questions/:id
 * Updates a single question.
 */
router.put('/questions/:id', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const question = await AIQuestion.findByPk(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const quiz = await AIQuiz.findByPk(question.quizId);
    if (quiz) {
      const hasAccess = await verifyTrainerAccess(req, res, quiz);
      if (!hasAccess) return;
    }

    const { questionText, questionType, options, correctAnswer, acceptableAnswers, pairs, explanation, difficulty, marks, order, answerText } = req.body;

    await question.update({
      ...(questionText !== undefined && { questionText }),
      ...(questionType !== undefined && { questionType }),
      ...(options !== undefined && { options }),
      ...((correctAnswer !== undefined || answerText !== undefined) && { correctAnswer: correctAnswer ?? answerText ?? question.correctAnswer }),
      ...(acceptableAnswers !== undefined && { acceptableAnswers }),
      ...(pairs !== undefined && { pairs }),
      ...(explanation !== undefined && { explanation }),
      ...(difficulty !== undefined && { difficulty }),
      ...(marks !== undefined && { marks }),
      ...(order !== undefined && { order }),
    });

    res.json({ success: true, question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/questions/:id
 * Deletes a single question.
 */
router.delete('/questions/:id', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const question = await AIQuestion.findByPk(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const quiz = await AIQuiz.findByPk(question.quizId);
    if (quiz) {
      const hasAccess = await verifyTrainerAccess(req, res, quiz);
      if (!hasAccess) return;
    }

    await question.destroy();
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/questions/reorder
 * Body: { orderedIds: [1, 2, 3, ...] } — new ordering of question IDs
 */
router.post('/:id/questions/reorder', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await AIQuestion.update({ order: i }, { where: { id: orderedIds[i], quizId: quiz.id } });
    }

    res.json({ success: true, message: 'Questions reordered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Participant listing for a quiz ────────────────────────────────────────

/**
 * GET /api/quizzes/:id/participants
 * Returns all enrolled participants for a quiz with their current status.
 * Status logic:
 *   - No QuizAssignment record → NOT_STARTED
 *   - QuizAssignment status=PENDING, no QuizAttempt → NOT_STARTED
 *   - QuizAttempt status=IN_PROGRESS → IN_PROGRESS
 *   - QuizAttempt status=SUBMITTED/EVALUATED → SUBMITTED
 *   - Has QuizResult + resultPublished=false → WAITING_RESULT
 *   - Has QuizResult + resultPublished=true → RESULT_PUBLISHED
 */
router.get('/:id/participants', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const { User, QuizAssignment } = require('../models');

    const assignments = await QuizAssignment.findAll({ where: { quizId: quiz.id } });
    const attempts = await QuizAttempt.findAll({ where: { quizId: quiz.id } });
    const results = await QuizResult.findAll({ where: { quizId: quiz.id } });

    // Find all enrolled participants
    const enrollmentWhere = [];
    if (quiz.courseId) enrollmentWhere.push({ courseId: quiz.courseId });
    if (quiz.trainingId) enrollmentWhere.push({ trainingId: quiz.trainingId });

    const enrollments = enrollmentWhere.length > 0
      ? await Enrollment.findAll({ where: { [Op.or]: enrollmentWhere, status: 'ENROLLED' } })
      : [];

    const participantIds = [...new Set([
      ...enrollments.map(e => e.participantId),
      ...assignments.map(a => a.participantId),
      ...attempts.map(at => at.participantId),
      ...results.map(r => r.participantId)
    ])];

    if (participantIds.length === 0) {
      return res.json({ participants: [] });
    }

    const users = await User.findAll({
      where: { id: participantIds, role: 'PARTICIPANT' },
      attributes: ['id', 'name', 'email']
    });

    const assignmentByUser = {};
    assignments.forEach(a => { assignmentByUser[a.participantId] = a; });

    const attemptByUser = {};
    attempts.forEach(a => {
      if (!attemptByUser[a.participantId] || new Date(a.createdAt) > new Date(attemptByUser[a.participantId].createdAt)) {
        attemptByUser[a.participantId] = a;
      }
    });

    const resultByUser = {};
    results.forEach(r => { resultByUser[r.participantId] = r; });

    const participants = users.map(user => {
      const assignment = assignmentByUser[user.id];
      const attempt = attemptByUser[user.id];
      const result = resultByUser[user.id];

      let status = 'NOT_STARTED';
      let submittedAt = null;
      let score = null;
      let percentage = null;
      let totalScore = null;
      let maxScore = null;

      if (attempt) {
        if (attempt.status === 'IN_PROGRESS') status = 'IN_PROGRESS';
        else if (attempt.status === 'disqualified_copy_violation' || attempt.status === 'disqualified_policy_violation') {
          status = 'DISQUALIFIED';
          submittedAt = attempt.submittedAt;
        }
        else if (['SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'COMPLETED', 'GRADED', 'submitted', 'completed', 'evaluated', 'graded'].includes(attempt.status)) {
          status = 'COMPLETED';
          submittedAt = attempt.submittedAt;
        }
      }

      if (result) {
        score = parseFloat(result.totalScore);
        totalScore = parseFloat(result.totalScore);
        maxScore = parseFloat(result.maxScore);
        percentage = parseFloat(result.percentage);
        submittedAt = result.evaluatedAt || submittedAt;
        // Always mark as completed if a result row exists, regardless of attempt status
        status = result.resultPublished ? 'RESULT_PUBLISHED' : 'COMPLETED';
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        status,
        submittedAt,
        score,
        totalScore,
        maxScore,
        percentage,
        passed: result ? parseFloat(result.percentage) >= (50) : null,
        resultPublished: result ? result.resultPublished : false,
        attemptId: attempt?.id || null,
        violationCount: attempt?.violationCount || 0,
      };
    });

    res.json({ participants, total: participants.length });
  } catch (error) {
    console.error('[participants] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


/**
 * DELETE /api/quizzes/:id
 * Deep deletes a quiz and all associated dependencies.
 */
router.delete('/:id', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const quiz = await AIQuiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hasAccess = await verifyTrainerAccess(req, res, quiz);
    if (!hasAccess) return;

    const quizId = quiz.id;
    const { sequelize } = require('../config/db');

    await sequelize.transaction(async (t) => {
      // 1. Find all dependent entities
      const attempts = await QuizAttempt.findAll({ where: { quizId }, transaction: t });
      const attemptIds = attempts.map(a => a.id);

      const examSessions = await ExamSession.findAll({ where: { quizId }, transaction: t });
      const examSessionIds = examSessions.map(es => es.id);

      const questions = await AIQuestion.findAll({ where: { quizId }, transaction: t });
      const questionIds = questions.map(q => q.id);

      const lessonQuizzes = await LessonQuiz.findAll({ where: { quizId }, transaction: t });
      const lessonQuizIds = lessonQuizzes.map(lq => lq.id);

      // 2. Delete child records
      if (examSessionIds.length > 0) {
        await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: examSessionIds } }, transaction: t });
        await Violation.destroy({ where: { sessionId: { [Op.in]: examSessionIds } }, transaction: t });
      }

      await AssessmentSession.destroy({ where: { quizId }, transaction: t });
      await ExamSession.destroy({ where: { quizId }, transaction: t });

      if (lessonQuizIds.length > 0) {
        await QuizProgress.destroy({ where: { lessonQuizId: { [Op.in]: lessonQuizIds } }, transaction: t });
      }
      await LessonQuiz.destroy({ where: { quizId }, transaction: t });

      if (attemptIds.length > 0) {
        await QuizAnswer.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
      }
      await QuizResult.destroy({ where: { quizId }, transaction: t });
      await QuizAttempt.destroy({ where: { quizId }, transaction: t });

      if (questionIds.length > 0) {
        await AIQuestionOption.destroy({ where: { questionId: { [Op.in]: questionIds } }, transaction: t });
      }
      await AIQuestion.destroy({ where: { quizId }, transaction: t });

      // 3. Delete parent
      await quiz.destroy({ transaction: t });
    });

    res.json({ success: true, message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:quizId/attempts
 * Starts or resumes a quiz attempt for a participant.
 */
const startQuizAttempt = async (req, res) => {
  try {
    const quizId = req.params.quizId;
    const participantId = req.user.id;
    const authHeader = req.headers['authorization'];

    console.log("--- START QUIZ ATTEMPT API HIT ---");
    console.log("Participant ID:", participantId);
    console.log("JWT:", authHeader);
    console.log("req.user:", req.user);
    console.log("req.params:", req.params);
    console.log("req.body:", req.body);

    const quiz = await AIQuiz.findByPk(quizId);
    if (!quiz) {
      console.log(`[startQuizAttempt] Quiz not found: #${quizId}`);
      return res.status(404).json({ error: 'Quiz not found' });
    }

    console.log("Training ID:", quiz.trainingId || quiz.courseId);
    console.log("Quiz ID:", quiz.id);
    console.log("quiz:", quiz.toJSON ? quiz.toJSON() : quiz);

    if (quiz.status !== 'PUBLISHED') {
      console.log(`[startQuizAttempt] Permission denied: Quiz is not PUBLISHED`);
      return res.status(403).json({ error: 'Quiz not published' });
    }

    // Verify participant has access — either via QuizAssignment or enrollment
    let assignment = await QuizAssignment.findOne({
      where: { quizId: quiz.id, participantId }
    });

    if (!assignment) {
      const enrollmentCheck = await Enrollment.findOne({
        where: {
          participantId,
          status: 'ENROLLED',
          [Op.or]: [
            ...(quiz.courseId ? [{ courseId: quiz.courseId }] : []),
            ...(quiz.trainingId ? [{ trainingId: quiz.trainingId }] : []),
          ]
        }
      });
      
      console.log(`[startQuizAttempt] Enrollment check result:`, enrollmentCheck ? `Enrolled (ID: ${enrollmentCheck.id})` : 'Not Enrolled');

      if (!enrollmentCheck) {
        console.log(`[startQuizAttempt] Permission denied: Participant #${participantId} is not enrolled in course/training`);
        return res.status(403).json({ error: 'Participant not enrolled' });
      }
      // Create a pending QuizAssignment on-the-fly for tracking
      assignment = await QuizAssignment.create({
        quizId: quiz.id,
        participantId,
        status: 'PENDING'
      });
    }

    // Check if completed attempt exists or resume/create in-progress attempt
    let attempt = await QuizAttempt.findOne({
      where: { quizId: quiz.id, participantId }
    });

    if (attempt) {
      if (attempt.status === 'IN_PROGRESS') {
        console.log(`[startQuizAttempt] Resuming existing in-progress attempt #${attempt.id} for participant #${participantId}`);
        console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status set to IN_PROGRESS at ${new Date().toISOString()}`);
        
        // Handle AssessmentSession lock recovery
        const crypto = require('crypto');
        const ipAddress = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
        const userAgent = (req.headers['user-agent'] || '').slice(0, 1024);
        const deviceFingerprint = (req.body?.deviceFingerprint || '').toString().slice(0, 512) || null;

        const minutes = Number.isFinite(quiz.timeLimit) && quiz.timeLimit > 0 ? quiz.timeLimit : 0;
        const ttlMs = minutes > 0 ? (minutes + 15) * 60_000 : 3 * 60 * 60_000;
        const expiresAt = new Date(Date.now() + ttlMs);

        let session = await AssessmentSession.findOne({ where: { attemptId: attempt.id } });
        const sessionToken = crypto.randomBytes(32).toString('hex');

        if (session) {
          console.log(`[startQuizAttempt] Found existing assessment session #${session.id} for attempt #${attempt.id} with status: ${session.status}. Updating...`);
          await session.update({
            quizId: quiz.id,
            participantId,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            deviceFingerprint,
            sessionToken,
            status: 'ACTIVE',
            lockedAt: new Date(),
            expiresAt
          });
          console.log(`[startQuizAttempt] Successfully updated and reactivated session #${session.id} for attempt #${attempt.id}`);
        } else {
          console.log(`[startQuizAttempt] No session found for attempt #${attempt.id}. Creating new...`);
          session = await AssessmentSession.create({
            attemptId: attempt.id,
            quizId: quiz.id,
            participantId,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            deviceFingerprint,
            sessionToken,
            status: 'ACTIVE',
            lockedAt: new Date(),
            expiresAt
          });
          console.log(`[startQuizAttempt] Successfully created new session #${session.id} for attempt #${attempt.id}`);
        }

        const apiResponse = {
          success: true,
          attemptId: attempt.id,
          sessionToken: session.sessionToken,
          quiz: {
            id: quiz.id,
            title: quiz.title,
            timeLimit: quiz.timeLimit,
            proctoringEnabled: quiz.proctoringEnabled
          }
        };

        console.log(`[startQuizAttempt] Success resume response:`, apiResponse);
        return res.json(apiResponse);
      } else {
        console.log(`[startQuizAttempt] Rejecting start: attempt already exists and is completed for quiz #${quiz.id}, participant #${participantId}`);
        return res.status(400).json({
          success: false,
          message: "You have already attempted this quiz."
        });
      }
    }

    // Since no attempt exists, create a new in-progress attempt
    attempt = await QuizAttempt.create({
      quizId: quiz.id,
      participantId,
      status: 'IN_PROGRESS',
      startedAt: new Date()
    });
    console.log(`[startQuizAttempt] Created new attempt #${attempt.id} for participant #${participantId}`);
    console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status set to IN_PROGRESS at ${new Date().toISOString()}`);

    // Handle AssessmentSession lock
    const crypto = require('crypto');
    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    const userAgent = (req.headers['user-agent'] || '').slice(0, 1024);
    const deviceFingerprint = (req.body?.deviceFingerprint || '').toString().slice(0, 512) || null;

    const minutes = Number.isFinite(quiz.timeLimit) && quiz.timeLimit > 0 ? quiz.timeLimit : 0;
    const ttlMs = minutes > 0 ? (minutes + 15) * 60_000 : 3 * 60 * 60_000;
    const expiresAt = new Date(Date.now() + ttlMs);

    let session = await AssessmentSession.findOne({
      where: {
        attemptId: attempt.id
      }
    });

    const sessionToken = crypto.randomBytes(32).toString('hex');

    if (session) {
      console.log(`[startQuizAttempt] Found existing assessment session #${session.id} for attempt #${attempt.id} with status: ${session.status}. Updating...`);
      await session.update({
        quizId: quiz.id,
        participantId,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        deviceFingerprint,
        sessionToken,
        status: 'ACTIVE',
        lockedAt: new Date(),
        expiresAt
      });
      console.log(`[startQuizAttempt] Successfully updated and reactivated session #${session.id} for attempt #${attempt.id}`);
    } else {
      console.log(`[startQuizAttempt] No session found for attempt #${attempt.id}. Creating new...`);
      session = await AssessmentSession.create({
        attemptId: attempt.id,
        quizId: quiz.id,
        participantId,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        deviceFingerprint,
        sessionToken,
        status: 'ACTIVE',
        lockedAt: new Date(),
        expiresAt
      });
      console.log(`[startQuizAttempt] Successfully created new session #${session.id} for attempt #${attempt.id}`);
    }

    const apiResponse = {
      success: true,
      attemptId: attempt.id,
      sessionToken: session.sessionToken,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        timeLimit: quiz.timeLimit,
        proctoringEnabled: quiz.proctoringEnabled
      }
    };

    console.log(`[startQuizAttempt] Success response:`, apiResponse);
    return res.json(apiResponse);
  } catch (error) {
    console.error('[startQuizAttempt] Error starting quiz attempt:', error);
    return res.status(500).json({ error: error.message || 'Failed to start quiz attempt' });
  }
};

router.post('/:quizId/attempts', startQuizAttempt);
router.post('/:quizId/start', startQuizAttempt);

router.get('/attempts/:attemptId', async (req, res) => {
  try {
    const attemptId = req.params.attemptId;
    const participantId = req.user.id;

    console.log(`[GET /api/quizzes/attempts/${attemptId}] Request by user #${participantId}`);

    const attempt = await QuizAttempt.findByPk(attemptId, {
      include: [{ model: AIQuiz, as: 'quiz' }]
    });

    if (!attempt) {
      console.log(`[GET /api/quizzes/attempts/${attemptId}] Attempt not found`);
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== participantId) {
      console.log(`[GET /api/quizzes/attempts/${attemptId}] Access denied. User #${participantId} does not own attempt #${attemptId}`);
      return res.status(403).json({ error: 'Permission denied' });
    }

    console.log(`[GET /api/quizzes/attempts/${attemptId}] Returning attempt details`);
    return res.json({ attempt });
  } catch (err) {
    console.error('Error fetching quiz attempt:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Note: GET /:quizId/questions has been merged with GET /:id/questions above to avoid router matching conflicts.

/**
 * POST /api/quizzes/:quizId/attempts/:attemptId/submit
 * Submits and grades the quiz attempt, updating enrollment status inside a transaction.
 */
router.post('/:quizId/attempts/:attemptId/submit', async (req, res) => {
  try {
    const { answers } = req.body;
    const { attemptId, quizId } = req.params;
    const participantId = req.user.id;

    if (!Array.isArray(answers)) {
      return res.status(422).json({ error: 'answers[] is required' });
    }

    let attempt = await QuizAttempt.findOne({
      where: { id: attemptId, quizId, participantId }
    });
    if (!attempt) {
      console.log(`[submit] Attempt #${attemptId} not found. Attempting recovery for participant #${participantId}, quiz #${quizId}`);
      attempt = await QuizAttempt.findOne({
        where: { quizId, participantId, status: 'IN_PROGRESS' },
        order: [['createdAt', 'DESC']]
      });
      if (!attempt) {
        console.log(`[submit] Recovery failed. No IN_PROGRESS attempt found for participant #${participantId}, quiz #${quizId}`);
        return res.status(404).json({ error: 'Attempt not found' });
      }
      console.log(`[submit] Recovery successful. Found active attempt #${attempt.id} for participant #${participantId}, quiz #${quizId}`);
    }
    if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED') {
      return res.status(409).json({ error: 'Quiz already submitted' });
    }

    const quiz = await AIQuiz.findByPk(quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const questions = await AIQuestion.findAll({ where: { quizId: quiz.id } });
    const questionsMap = {};
    let maxScore = 0;
    questions.forEach(q => {
      questionsMap[q.id] = q;
      maxScore += (q.marks || 1);
    });

    const { sequelize } = require('../models');
    let totalScore = 0;

    await sequelize.transaction(async (t) => {
      // Wipe any prior partial answers for this attempt
      await QuizAnswer.destroy({ where: { attemptId: attempt.id }, transaction: t });

      for (const ans of answers) {
        const question = questionsMap[ans.questionId];
        if (!question) continue;

        let score = 0;
        let feedback = '';
        let isCorrect = false;
        const qMarks = question.marks || 1;

        if (['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING'].includes(question.questionType)) {
          const { gradeAnswer } = require('../utils/gradeAnswer');
          const result = gradeAnswer(question, {
            selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
            answer: ans.answerText || ans.answer || '',
            answerText: ans.answerText || ans.answer || '',
            matches: ans.matches
          });
          isCorrect = result.isCorrect;
          score = result.score > 0 ? (result.score / 100) * qMarks : 0;
          if (question.questionType === 'MATCHING') {
            feedback = `Score: ${result.score}%. Matched ${result.correctCount} of ${result.total} correctly.`;
          } else {
            feedback = isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${question.correctAnswer}`;
          }
        } else {
          // Fallback to AI evaluation
          const aiService = require('../services/aiService');
          try {
            const evaluation = await aiService.evaluateShortAnswer(
              question.questionText,
              question.correctAnswer,
              ans.answerText || ''
            );
            score = evaluation.score || 0;
            feedback = evaluation.feedback || '';
            isCorrect = evaluation.isCorrect || false;
          } catch (aiErr) {
            console.error('AI evaluation failed, defaulting to 0:', aiErr.message);
          }
        }

        await QuizAnswer.create({
          attemptId: attempt.id,
          questionId: ans.questionId,
          answerText: ans.answerText || '',
          selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
          isCorrect,
          score,
          feedback,
          evaluatedByAI: !['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING'].includes(question.questionType)
        }, { transaction: t });

        totalScore += score;
      }

      const submittedAt = new Date();
      let timeTaken = null;
      if (attempt.startedAt) {
        timeTaken = Math.max(0, Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
      }

      await attempt.update({
        status: 'EVALUATED',
        submittedAt,
        ...(timeTaken != null ? { timeTaken } : {})
      }, { transaction: t });

      console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status changed from IN_PROGRESS to SUBMITTED at ${new Date().toISOString()}`);

      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

      await QuizResult.create({
        attemptId: attempt.id,
        quizId: quiz.id,
        participantId,
        totalScore,
        maxScore,
        percentage,
        evaluatedAt: submittedAt,
        resultPublished: false
      }, { transaction: t });

      // Synchronously update QuizAssignment status in the same transaction
      await QuizAssignment.update(
        { status: 'COMPLETED' },
        { where: { quizId: quiz.id, participantId }, transaction: t }
      );
    });

    // Best-effort: expire assessment session
    try {
      const sessionToken = req.headers['x-assessment-session'] || req.headers['X-Assessment-Session'];
      if (sessionToken) {
        await AssessmentSession.update(
          { status: 'EXPIRED' },
          { where: { sessionToken, attemptId, status: 'ACTIVE' } }
        );
      }
    } catch (sessionErr) {
      console.warn('Failed to expire assessment session:', sessionErr.message);
    }

    return res.json({
      success: true,
      message: 'Quiz submitted successfully. Please wait for trainer to publish results.',
      status: 'PENDING_RESULT'
    });
  } catch (err) {
    console.error('Error submitting quiz attempt:', err);
    return res.status(500).json({ error: 'Failed to submit quiz attempt' });
  }
});

/**
 * POST /api/quizzes/attempts/:attemptId/violation
 * Logs a quiz copy violation, increments warning counter, and disqualifies participant if limit reached.
 */
router.post('/attempts/:attemptId/violation', async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { type, weight, questionNumber } = req.body;
    const participantId = req.user.id;
    const userAgent = req.headers['user-agent'] || '';

    console.log('[VIOLATION] Payload received:', { attemptId, type, weight, participantId, body: req.body });

    const attempt = await QuizAttempt.findOne({
      where: { id: attemptId, participantId }
    });
    if (!attempt) {
      console.log('[VIOLATION] Attempt not found:', { attemptId, participantId });
      return res.status(404).json({ error: 'Attempt not found' });
    }
    console.log('[VIOLATION] Found attempt:', { id: attempt.id, quizId: attempt.quizId, status: attempt.status });

    const isDisqualifiedStatus = attempt.status === 'disqualified_copy_violation' || attempt.status === 'disqualified_policy_violation';
    if (isDisqualifiedStatus || attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED') {
      return res.json({
        success: true,
        disqualified: isDisqualifiedStatus,
        violationCount: attempt.violationCount || 0,
        message: isDisqualifiedStatus ? 'You have been disqualified for repeated policy violations.' : 'Quiz already submitted'
      });
    }

    const quiz = await AIQuiz.findByPk(attempt.quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const violationWeight = typeof weight === 'number' ? weight : 1.0;
    const isHard = violationWeight >= 1.0;
    const newViolationCount = (attempt.violationCount || 0) + (isHard ? 1 : 0);
    let disqualified = false;

    const { sequelize } = require('../models');
    const { gradeAnswer } = require('../utils/gradeAnswer');

    await sequelize.transaction(async t => {
      // 1. Create QuizCopyViolation record with weight
      await QuizCopyViolation.create({
        attemptId: attempt.id,
        quizId: quiz.id,
        participantId,
        type: type || 'COPY_ATTEMPT',
        weight: violationWeight,
        questionNumber: questionNumber || null,
        userAgent,
        occurredAt: new Date()
      }, { transaction: t });

      // 2. Update QuizAttempt violationCount (only hard violations increment)
      await attempt.update({ violationCount: newViolationCount }, { transaction: t });

      // 3. Disqualify policy check
      if (newViolationCount >= (quiz.maxCopyWarnings || 3)) {
        disqualified = true;

        const newStatus = 'disqualified_policy_violation';

        // Mark status as disqualified
        await attempt.update({
          status: newStatus,
          submittedAt: new Date()
        }, { transaction: t });

        console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status changed from IN_PROGRESS to ${newStatus} at ${new Date().toISOString()}`);

        // If auto-submit is configured (default), run grading logic
        if (quiz.copyDisqualifyAction === 'AUTO_SUBMIT' || !quiz.copyDisqualifyAction) {
          const questions = await AIQuestion.findAll({ where: { quizId: quiz.id }, transaction: t });

          let totalScore = 0;
          let maxScore = 0;
          const questionsMap = {};
          questions.forEach(q => {
            questionsMap[q.id] = q;
            maxScore += (q.marks || 1);
          });

          const submittedAnswers = req.body.answers || [];
          if (submittedAnswers.length > 0) {
            // Wipe prior answers
            await QuizAnswer.destroy({ where: { attemptId: attempt.id }, transaction: t });

            for (const ans of submittedAnswers) {
              const question = questionsMap[ans.questionId];
              if (!question) continue;

              let score = 0;
              let isCorrect = false;
              const qMarks = question.marks || 1;

              const result = gradeAnswer(question, {
                selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
                answer: ans.answerText || ans.answer || '',
                answerText: ans.answerText || ans.answer || '',
                matches: ans.matches
              });
              isCorrect = result.isCorrect;
              score = result.score > 0 ? (result.score / 100) * qMarks : 0;

              await QuizAnswer.create({
                attemptId: attempt.id,
                questionId: ans.questionId,
                answerText: ans.answerText || ans.answer || '',
                selectedOption: ans.selectedOption !== undefined ? ans.selectedOption : null,
                isCorrect,
                score,
                feedback: isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${question.correctAnswer}`
              }, { transaction: t });

              totalScore += score;
            }
          } else {
            // Just sum the scores from already saved QuizAnswer rows
            const savedAnswers = await QuizAnswer.findAll({ where: { attemptId: attempt.id }, transaction: t });
            savedAnswers.forEach(ans => {
              totalScore += (ans.score || 0);
            });
          }

          const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

          await QuizResult.upsert({
            attemptId: attempt.id,
            quizId: quiz.id,
            participantId,
            totalScore,
            maxScore,
            percentage: Number(percentage.toFixed(2)),
            evaluatedAt: new Date(),
            resultPublished: false
          }, { transaction: t });

          // Mark quiz_assignment as COMPLETED
          await QuizAssignment.update(
            { status: 'COMPLETED' },
            { where: { quizId: quiz.id, participantId }, transaction: t }
          );
        }
      }
    });

    return res.json({
      success: true,
      disqualified,
      violationCount: newViolationCount,
      message: disqualified ? 'You have been disqualified for repeated policy violations.' : 'Violation recorded'
    });
  } catch (error) {
    console.error('Error recording quiz violation:', error);
    return res.status(500).json({ error: 'Failed to record violation' });
  }
});

/**
 * POST /api/quizzes/attempts/:attemptId/reinstate
 * Reinstates a disqualified attempt, resetting its violationCount and status.
 */
router.post('/attempts/:attemptId/reinstate', roleMiddleware('TRAINER', 'ADMIN'), async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await QuizAttempt.findByPk(attemptId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const { sequelize } = require('../models');

    await sequelize.transaction(async t => {
      // 1. Reset attempt status back to 'IN_PROGRESS' and violationCount to 0
      await attempt.update({
        status: 'IN_PROGRESS',
        violationCount: 0,
        submittedAt: null
      }, { transaction: t });

      console.log(`[ATTEMPT_STATUS_CHANGE] Attempt #${attempt.id} status changed from ${attempt.status} to IN_PROGRESS at ${new Date().toISOString()}`);

      // 2. Delete corresponding QuizResult
      await QuizResult.destroy({
        where: { attemptId: attempt.id, quizId: attempt.quizId, participantId: attempt.participantId },
        transaction: t
      });

      // 3. Delete any QuizCopyViolation records
      await QuizCopyViolation.destroy({
        where: { attemptId: attempt.id },
        transaction: t
      });

      // 4. Reset quiz assignment status back to 'PENDING'
      await QuizAssignment.update(
        { status: 'PENDING' },
        { where: { quizId: attempt.quizId, participantId: attempt.participantId }, transaction: t }
      );
    });

    return res.json({ success: true, message: 'Attempt has been reinstated successfully.' });
  } catch (error) {
    console.error('Error reinstating quiz attempt:', error);
    return res.status(500).json({ error: 'Failed to reinstate attempt' });
  }
});

/**
 * GET /api/quizzes/attempts/:attemptId/violations
 * Returns all violation records for a given attempt.
 */
router.get('/attempts/:attemptId/violations', async (req, res) => {
  try {
    const { attemptId } = req.params;
    const participantId = req.user.id;

    const attempt = await QuizAttempt.findByPk(attemptId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    // TRAINER / ADMIN can view any attempt's violations; PARTICIPANT only own
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== participantId) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const violations = await QuizCopyViolation.findAll({
      where: { attemptId },
      order: [['occurred_at', 'ASC']],
      attributes: ['id', 'type', 'weight', 'questionNumber', 'userAgent', 'occurredAt']
    });

    return res.json({ success: true, violations });
  } catch (error) {
    console.error('Error fetching violations:', error);
    return res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

/**
 * GET /api/quizzes
 * Returns all quizzes for admin/trainer recordings and quiz listing pages.
 * Supports pagination via ?page=&limit=, and optional ?search=&status= filters.
 */
router.get('/', roleMiddleware('ADMIN', 'TRAINER'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (search) {
      where.title = { [Op.like]: `%${search}%` };
    }
    if (status) {
      where.status = status.toUpperCase();
    }

    if (req.user.role === 'TRAINER') {
      const trainerId = req.user.id;
      const { Training, CourseTrainerAssignment, TrainingTrainerAssignment } = require('../models');
      const trainerCourseIds = (await CourseTrainerAssignment.findAll({
        where: { trainerId }, attributes: ['courseId']
      })).map(a => a.courseId);
      const trainerTrainingIds = (await TrainingTrainerAssignment.findAll({
        where: { trainerId }, attributes: ['trainingId']
      })).map(a => a.trainingId);
      const ownTrainings = (await Training.findAll({
        where: { [Op.or]: [{ trainerId }, { createdBy: trainerId }] },
        attributes: ['id']
      })).map(t => t.id);

      where[Op.or] = [
        { createdBy: trainerId },
        ...(trainerCourseIds.length ? [{ courseId: trainerCourseIds }] : []),
        ...(trainerTrainingIds.length ? [{ trainingId: trainerTrainingIds }] : []),
        ...(ownTrainings.length ? [{ trainingId: ownTrainings }] : []),
      ];
    }

    const { count, rows } = await AIQuiz.findAndCountAll({
      where,
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title'] },
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit: parseInt(limit),
    });

    res.json({
      quizzes: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('[GET /api/quizzes] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
