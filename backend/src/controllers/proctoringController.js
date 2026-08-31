/**
 * Proctoring HTTP controller.
 *
 * Thin wrapper: parses req, delegates to proctoringService, emits socket
 * events for trainer monitoring side-channels.
 */
const proctoring = require('../services/proctoringService');
const proctoringReportService = require('../services/proctoringReportService');
const { ExamSession, AIQuiz, AIQuestion, QuizAnswer, QuizAttempt, QuizResult, CodingAssessment, CodingAttempt, CodingResult, User, Screenshot, ProctoringSession, ProctoringEvent, ProctoringReport, Course, Training, CourseTrainerAssignment, TrainingTrainerAssignment } = require('../models');
const aiService = require('../services/aiService');
const { acquireLock, releaseLock } = require('../config/redis');
const logger = require('../utils/logger');

const { gradeAnswer } = require('../utils/gradeAnswer');

function ok(res, data) { return res.json({ success: true, data }); }
function fail(res, status, message) { return res.status(status).json({ success: false, message }); }

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    null
  );
const relay = require('../socket/crossInstance');

function emitTrainerUpdate(req, quizId, payload, assessmentId) {
  const io = req.app.get('io');
  if (!io) return;
  const roomId = quizId || `coding_${assessmentId || ''}`;
  relay.relayEmit(io, 'room', `proctor_quiz_${roomId}`, 'proctor:update', payload);
  if (quizId) {
    relay.relayEmit(io, 'room', `proctor_coding_${quizId}`, 'proctor:update', payload);
  }
}

// POST /api/proctor/sessions/start  { quizId, fingerprintHash, screenSharing, assessmentType }
exports.startSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { quizId, attemptId, fingerprintHash, screenSharing = false, assessmentType = 'quiz' } = req.body;
    if (!quizId) return fail(res, 400, 'quizId/assessmentId is required');

    const { session, resumed } = await proctoring.startSession({
      userId,
      quizId,
      attemptId,
      fingerprintHash,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      screenSharing,
      assessmentType,
    });

    emitTrainerUpdate(req, quizId, {
      type: resumed ? 'resumed' : 'started',
      session: proctoring.buildClientView(session),
    }, session.assessmentId);

    ok(res, { ...proctoring.buildClientView(session), resumed });
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/activate   (after fullscreen acquired)
exports.activateSession = async (req, res, next) => {
  try {
    const session = req.examSession;
    await proctoring.activateSession(session);
    emitTrainerUpdate(req, session.quizId, {
      type: 'activated',
      session: proctoring.buildClientView(session),
    }, session.assessmentId);
    ok(res, proctoring.buildClientView(session));
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/heartbeat
exports.heartbeat = async (req, res, next) => {
  try {
    const session = req.examSession;
    await proctoring.heartbeat(session);
    ok(res, { lastHeartbeatAt: session.lastHeartbeatAt });
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/violation  { type, message, metadata }
exports.recordViolation = async (req, res, next) => {
  try {
    const session = req.examSession;
    const { type, message, metadata } = req.body;
    const result = await proctoring.recordViolation({ session, type, message, metadata });

    emitTrainerUpdate(req, session.quizId, {
      type: 'violation',
      session: proctoring.buildClientView(session),
      violation: result.violation,
    }, session.assessmentId);

    ok(res, {
      session: proctoring.buildClientView(session),
      violation: result.violation,
      terminated: result.terminated,
    });
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/activity   { eventType, payload }
exports.recordActivity = async (req, res, next) => {
  try {
    const session = req.examSession;
    const { eventType, payload } = req.body;
    if (!eventType) return fail(res, 400, 'eventType required');
    const activity = await proctoring.recordActivity({ session, eventType, payload });
    ok(res, activity);
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/submit
exports.submit = async (req, res, next) => {
  try {
    const session = req.examSession;
    await proctoring.submitSession(session);
    try {
      const verificationService = require('../services/assessmentVerificationService');
      await verificationService.endSession({ attemptId: session.attemptId, participantId: session.participantId, sessionId: session.id }).catch(() => {});
    } catch (_) {}
    emitTrainerUpdate(req, session.quizId, {
      type: 'submitted',
      session: proctoring.buildClientView(session),
    }, session.assessmentId);
    ok(res, proctoring.buildClientView(session));
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/terminate  (participant-initiated)
exports.terminate = async (req, res, next) => {
  try {
    const session = req.examSession;
    await proctoring.terminateSession({
      session,
      reason: req.body?.reason || 'Terminated by participant',
    });
    try {
      const verificationService = require('../services/assessmentVerificationService');
      await verificationService.endSession({ attemptId: session.attemptId, participantId: session.participantId, sessionId: session.id }).catch(() => {});
    } catch (_) {}
    emitTrainerUpdate(req, session.quizId, {
      type: 'terminated',
      session: proctoring.buildClientView(session),
    }, session.assessmentId);
    ok(res, proctoring.buildClientView(session));
  } catch (err) { next(err); }
};

// GET /api/proctor/sessions/active  (participant — am I in an exam?)
exports.getActiveSession = async (req, res, next) => {
  try {
    const session = await proctoring.getActiveSessionForUser(req.user.id);
    ok(res, session ? proctoring.buildClientView(session) : null);
  } catch (err) { next(err); }
};

// GET /api/proctor/sessions/:sessionId
exports.getSession = async (req, res, next) => {
  try {
    const session = await ExamSession.findByPk(req.params.sessionId);
    if (!session) return fail(res, 404, 'Session not found');
    if (
      req.user.role !== 'TRAINER' &&
      req.user.role !== 'ADMIN' &&
      session.participantId !== req.user.id
    ) return fail(res, 403, 'Forbidden');
    ok(res, proctoring.buildClientView(session));
  } catch (err) { next(err); }
};

// GET /api/proctor/quiz/:quizId/monitor   (trainer)
exports.getQuizMonitor = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const data = await proctoring.getQuizMonitor(req.params.quizId);
    ok(res, data);
  } catch (err) { next(err); }
};

// GET /api/proctor/sessions/:sessionId/violations   (trainer)
exports.getViolations = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const violations = await proctoring.getSessionViolations(req.params.sessionId);
    ok(res, violations);
  } catch (err) { next(err); }
};

// GET /api/proctor/sessions/:sessionId/export.json  (trainer)
exports.exportLogs = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const data = await proctoring.exportSessionLogs(req.params.sessionId);
    if (!data) return fail(res, 404, 'Session not found');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proctor-session-${req.params.sessionId}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  } catch (err) { next(err); }
};

// POST /api/proctor/sessions/:sessionId/force-terminate  (trainer override)
exports.forceTerminate = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const session = await ExamSession.findByPk(req.params.sessionId);
    if (!session) return fail(res, 404, 'Session not found');
    await proctoring.terminateSession({
      session,
      reason: req.body?.reason || 'Terminated by trainer',
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${session.participantId}`).emit('proctor:terminated', {
        sessionId: session.id,
        reason: session.terminationReason,
      });
      const roomId = session.quizId || `coding_${session.assessmentId || ''}`;
      io.to(`proctor_quiz_${roomId}`).emit('proctor:update', {
        type: 'terminated',
        session: proctoring.buildClientView(session),
      });
    }
    ok(res, proctoring.buildClientView(session));
  } catch (err) { next(err); }
};

/**
 * GET /api/proctor/sessions/:sessionId/exam
 *
 * One-shot fetch for the participant exam page. Server is the source
 * of truth for `endsAt`; questions are returned WITHOUT correctAnswer
 * so the client can never see them. Saved answers (autosave) come
 * back so a refresh restores progress.
 */
exports.getExamData = async (req, res, next) => {
  try {
    const session = req.examSession;
    if (!session) return fail(res, 404, 'Session not found');

    if (session.assessmentType === 'coding') {
      const { CodingAssessment, CodingProblem } = require('../models');
      const assessment = await CodingAssessment.findByPk(session.assessmentId, {
        include: [{ model: CodingProblem, as: 'problems' }],
      });
      if (!assessment) return fail(res, 404, 'Coding assessment not found');

      const problems = (assessment.problems || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          constraints: p.constraints,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          sampleInput: p.sampleInput,
          sampleOutput: p.sampleOutput,
          difficulty: p.difficulty,
          marks: p.marks,
          order: p.order,
          starterCode: p.starterCode,
        }));

      return ok(res, {
        session: proctoring.buildClientView(session),
        assessment: {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          timeLimit: assessment.timeLimit,
          difficulty: assessment.difficulty,
          languages: assessment.languages,
        },
        problems,
        serverTime: new Date().toISOString(),
      });
    }

    const [quiz, savedAnswers] = await Promise.all([
      AIQuiz.findByPk(session.quizId, {
        include: [{ model: AIQuestion, as: 'questions' }],
      }),
      session.attemptId
        ? QuizAnswer.findAll({ where: { attemptId: session.attemptId } })
        : Promise.resolve([]),
    ]);

    if (!quiz) return fail(res, 404, 'Quiz not found');

    const questions = (quiz.questions || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(q => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options || null,
        difficulty: q.difficulty,
        order: q.order,
      }));

    const answers = savedAnswers.map(a => ({
      questionId: a.questionId,
      selectedOption: a.selectedOption,
      answerText: a.answerText || '',
    }));

    ok(res, {
      session: proctoring.buildClientView(session),
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.timeLimit,
        difficulty: quiz.difficulty,
      },
      questions,
      savedAnswers: answers,
      serverTime: new Date().toISOString(),
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/proctor/sessions/:sessionId/answers   { answers: [{ questionId, selectedOption?, answerText? }] }
 *
 * Idempotent autosave. Upserts QuizAnswer rows for the active attempt;
 * never sets isCorrect/score (those are filled by /finalize).
 */
exports.saveAnswers = async (req, res, next) => {
  try {
    const session = req.examSession;
    if (!session.attemptId) return fail(res, 409, 'Session has no attempt');
    if (['SUBMITTED', 'TERMINATED', 'EXPIRED'].includes(session.status)) {
      return fail(res, 410, 'Session has ended');
    }

    // Coding assessments use their own save mechanism, not QuizAnswer.
    if (session.assessmentType === 'coding') {
      return ok(res, { saved: 0 });
    }

    const incoming = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (!incoming.length) return ok(res, { saved: 0 });

    let saved = 0;
    for (const a of incoming) {
      if (!a || a.questionId == null) continue;
      const [row] = await QuizAnswer.findOrCreate({
        where: { attemptId: session.attemptId, questionId: a.questionId },
        defaults: {
          attemptId: session.attemptId,
          questionId: a.questionId,
          selectedOption: a.selectedOption ?? null,
          answerText: a.answerText ?? '',
        },
      });
      // Always update the participant's latest pick.
      row.selectedOption = a.selectedOption ?? row.selectedOption;
      row.answerText = a.answerText ?? row.answerText;
      await row.save();
      saved += 1;
    }

    ok(res, { saved });
  } catch (err) { next(err); }
};

/**
 * POST /api/proctor/sessions/:sessionId/finalize
 *
 * Idempotent: if the session is already SUBMITTED/EVALUATED, returns
 * the existing QuizResult instead of recomputing. Otherwise:
 *   1. Marks session SUBMITTED + records timeTaken
 *   2. Reads existing QuizAnswer rows (saved via /answers autosave)
 *   3. Scores each (MCQ inline; SHORT_ANSWER via aiService)
 *   4. Writes QuizResult, updates QuizAttempt -> EVALUATED
 *   5. Best-effort socket emits for trainer monitor + leaderboard
 */
exports.finalize = async (req, res, next) => {
  try {
    const session = req.examSession;
    if (!session.attemptId) return fail(res, 409, 'Session has no attempt');

    // ── Coding assessment: just submit, don't grade quiz answers ──
    if (session.assessmentType === 'coding') {
      if (session.status !== 'SUBMITTED' && session.status !== 'TERMINATED') {
        await proctoring.submitSession(session);
      }
      try {
        const io = req.app.get('io');
        if (io) {
          const roomId = session.quizId || `coding_${session.assessmentId || ''}`;
          io.to(`proctor_quiz_${roomId}`).emit('proctor:update', {
            type: 'submitted',
            session: proctoring.buildClientView(session),
          });
        }
      } catch { /* swallow */ }
      return ok(res, { submitted: true });
    }

    // ── Quiz: full grading logic with Distributed Lock Protection ──
    const lockKey = `lock:quiz:finalize:${session.attemptId}`;
    const lockToken = await acquireLock(lockKey, 20000);

    const existingResult = await QuizResult.findOne({ where: { attemptId: session.attemptId } });
    if (existingResult) {
      if (lockToken) await releaseLock(lockKey, lockToken);
      if (session.status !== 'SUBMITTED' && session.status !== 'TERMINATED') {
        await proctoring.submitSession(session);
      }
      return ok(res, {
        alreadySubmitted: true,
        result: {
          id: existingResult.id,
          totalScore: Number(existingResult.totalScore),
          maxScore: Number(existingResult.maxScore),
          percentage: Number(existingResult.percentage),
          attemptId: existingResult.attemptId,
        },
      });
    }

    const finalAnswers = Array.isArray(req.body?.answers) ? req.body.answers : null;
    if (finalAnswers && finalAnswers.length) {
      for (const a of finalAnswers) {
        if (!a || a.questionId == null) continue;
        const [row] = await QuizAnswer.findOrCreate({
          where: { attemptId: session.attemptId, questionId: a.questionId },
          defaults: {
            attemptId: session.attemptId,
            questionId: a.questionId,
            selectedOption: a.selectedOption ?? null,
            answerText: a.answerText ?? '',
          },
        });
        row.selectedOption = a.selectedOption ?? row.selectedOption;
        row.answerText = a.answerText ?? row.answerText;
        await row.save();
      }
    }

    await proctoring.submitSession(session);

    const [attempt, quiz, savedRows] = await Promise.all([
      QuizAttempt.findByPk(session.attemptId),
      AIQuiz.findByPk(session.quizId, {
        include: [{ model: AIQuestion, as: 'questions' }],
      }),
      QuizAnswer.findAll({ where: { attemptId: session.attemptId } }),
    ]);

    const qById = new Map((quiz.questions || []).map(q => [q.id, q]));
    let totalScore = 0;
    for (const row of savedRows) {
      const q = qById.get(row.questionId);
      if (!q) continue;

      let score = 0;
      let isCorrect = false;
      let feedback = '';

      if (['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING'].includes(q.questionType)) {
        const result = gradeAnswer(q, {
          selectedOption: row.selectedOption !== undefined && row.selectedOption !== null ? row.selectedOption : null,
          answer: row.answerText || '',
          answerText: row.answerText || '',
          matches: null
        });
        isCorrect = result.isCorrect;
        score = result.score;
        if (q.questionType === 'MATCHING') {
          feedback = `Score: ${score}%. Matched ${result.correctCount} of ${result.total} correctly.`;
        } else {
          feedback = isCorrect ? 'Correct!' : 'Incorrect';
        }
      } else {
        try {
          const evalResult = await aiService.evaluateShortAnswer(
            q.questionText, q.correctAnswer, row.answerText || '',
          );
          score = evalResult.score || 0;
          feedback = evalResult.feedback || '';
          isCorrect = evalResult.isCorrect || false;
        } catch (e) {
          logger.warn('AI eval failed; awarding 0', { err: e.message });
          score = 0; feedback = 'Could not evaluate'; isCorrect = false;
        }
      }

      row.isCorrect = isCorrect;
      row.score = score;
      row.feedback = feedback;
      row.evaluatedByAI = true;
      await row.save();

      totalScore += Number(score);
    }

    const totalQuestions = (quiz.questions || []).length;
    const maxScore = totalQuestions * 100;
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    const submittedAt = new Date();
    if (attempt) {
      let timeTaken = null;
      if (attempt.startedAt) {
        timeTaken = Math.max(0, Math.round(
          (submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000,
        ));
      }
      await attempt.update({
        status: 'EVALUATED',
        submittedAt,
        ...(timeTaken != null ? { timeTaken } : {}),
      });
    }

    const result = await QuizResult.create({
      attemptId: session.attemptId,
      quizId: session.quizId,
      participantId: session.participantId,
      totalScore,
      maxScore,
      percentage,
      evaluatedAt: submittedAt,
    });

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`proctor_quiz_${session.quizId}`).emit('proctor:update', {
          type: 'submitted',
          session: proctoring.buildClientView(session),
        });
      }
    } catch { /* swallow */ }

    if (lockToken) {
      await releaseLock(lockKey, lockToken).catch(() => {});
    }

    ok(res, {
      result: {
        id: result.id,
        totalScore: Number(result.totalScore),
        maxScore: Number(result.maxScore),
        percentage: Number(result.percentage),
        attemptId: result.attemptId,
      },
    });
  } catch (err) {
    logger.error('finalize error', { err: err.message, stack: err.stack });
    next(err);
  }
};

/**
 * GET /api/proctor/sessions/:sessionId/result
 *
 * Returns the final QuizResult + per-question breakdown for the
 * post-exam page. Owner or trainer/admin only.
 */
exports.getResult = async (req, res, next) => {
  try {
    const session = await ExamSession.findByPk(req.params.sessionId);
    if (!session) return fail(res, 404, 'Session not found');

    const isOwner = session.participantId === req.user.id;
    const isTrainer = req.user.role === 'TRAINER' || req.user.role === 'ADMIN';
    if (!isOwner && !isTrainer) return fail(res, 403, 'Forbidden');

    if (session.assessmentType === 'coding') {
      const { CodingResult, CodingAssessment, ProctoringReport } = require('../models');
      const attemptId = session.codingAttemptId;
      const [result, assessment, proctorReport] = await Promise.all([
        attemptId ? CodingResult.findOne({ where: { attemptId } }) : Promise.resolve(null),
        CodingAssessment.findByPk(session.assessmentId),
        attemptId ? ProctoringReport.findOne({ where: { attemptId } }) : Promise.resolve(null),
      ]);
      return ok(res, {
        session: proctoring.buildClientView(session),
        assessment: assessment ? {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
        } : null,
        result: result ? {
          id: result.id,
          totalScore: Number(result.totalScore),
          maxScore: Number(result.maxScore),
          percentage: Number(result.percentage),
          evaluatedAt: result.evaluatedAt,
        } : null,
        proctorReport: proctorReport ? {
          riskScore: proctorReport.riskScore,
          riskLevel: proctorReport.riskLevel,
          summary: proctorReport.summary,
        } : null,
      });
    }

    const { ProctoringReport } = require('../models');
    const [result, quiz, savedAnswers, proctorReport] = await Promise.all([
      QuizResult.findOne({ where: { attemptId: session.attemptId } }),
      AIQuiz.findByPk(session.quizId, {
        include: [{ model: AIQuestion, as: 'questions' }],
      }),
      QuizAnswer.findAll({ where: { attemptId: session.attemptId } }),
      session.attemptId ? ProctoringReport.findOne({ where: { attemptId: session.attemptId } }) : Promise.resolve(null),
    ]);

    const breakdown = (quiz?.questions || []).map(q => {
      const a = savedAnswers.find(x => x.questionId === q.id);
      return {
        questionId: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options || null,
        correctAnswer: q.correctAnswer,
        selectedOption: a?.selectedOption ?? null,
        answerText: a?.answerText || '',
        isCorrect: a?.isCorrect ?? false,
        score: a ? Number(a.score) : 0,
        feedback: a?.feedback || '',
      };
    });

    ok(res, {
      session: proctoring.buildClientView(session),
      quiz: quiz ? {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.timeLimit,
      } : null,
      result: result ? {
        id: result.id,
        totalScore: Number(result.totalScore),
        maxScore: Number(result.maxScore),
        percentage: Number(result.percentage),
        evaluatedAt: result.evaluatedAt,
      } : null,
      proctorReport: proctorReport ? {
        riskScore: proctorReport.riskScore,
        riskLevel: proctorReport.riskLevel,
        summary: proctorReport.summary,
      } : null,
      breakdown,
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/proctor/quiz/:quizId/report
 * Aggregated monitoring report for all participants in a quiz.
 */
exports.getQuizReport = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const report = await proctoring.getQuizReport(req.params.quizId);
    ok(res, report);
  } catch (err) { next(err); }
};

/**
 * GET /api/proctor/quiz/:quizId/report/csv
 * CSV export of the monitoring report.
 */
exports.exportReportCSV = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const csv = await proctoring.getQuizReportCSV(req.params.quizId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proctor-report-quiz-${req.params.quizId}.csv"`,
    );
    res.send(csv);
  } catch (err) { next(err); }
};

/**
 * GET /api/proctor/sessions/:sessionId/screenshots
 * Get screenshot history for a session (trainer only).
 */
exports.getScreenshots = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer only');
    }
    const screenshots = await Screenshot.findAll({
      where: { sessionId: req.params.sessionId },
      order: [['capturedAt', 'ASC']],
    });
    ok(res, screenshots);
  } catch (err) { next(err); }
};

/**
 * POST /api/proctoring/events & /api/proctor/events
 * Ingests an objective monitoring event from Python monitor or frontend client.
 */
exports.recordMonitoringEvent = async (req, res, next) => {
  try {
    const {
      monitoringSessionId,
      attemptId,
      participantId: bodyParticipantId,
      quizId,
      eventType,
      severity = 'INFO',
      confidence = 1.0,
      duration = 0.0,
      timestamp = new Date(),
      metadata = {},
      idempotencyKey,
    } = req.body;

    // Decode token if present
    let user = req.user;
    if (!user && req.headers && req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer ')) {
      try {
        const { verifyAndCheckToken } = require('../security/tokenService');
        const token = req.headers['authorization'].split(' ')[1];
        user = await verifyAndCheckToken(token);
      } catch (_) {}
    }

    // Use JWT user identity if participant or fallback to body if server-to-server with attempt check
    const participantId = user?.role === 'PARTICIPANT' ? user.id : (bodyParticipantId || user?.id);

    if (!attemptId || !eventType) {
      return fail(res, 400, 'attemptId and eventType are required');
    }

    // Resolve quizId & participantId from attempt if not provided
    let resolvedQuizId = quizId;
    let resolvedParticipantId = participantId;
    let resolvedSessionId = monitoringSessionId;

    let attempt = await QuizAttempt.findByPk(attemptId);
    let isCoding = false;
    let codingAttempt = null;

    if (attempt) {
      resolvedQuizId = resolvedQuizId || attempt.quizId;
      resolvedParticipantId = resolvedParticipantId || attempt.participantId;
      resolvedSessionId = resolvedSessionId || attempt.monitoringSessionId || `session_${attempt.id}`;
    } else {
      codingAttempt = await CodingAttempt.findByPk(attemptId);
      if (codingAttempt) {
        isCoding = true;
        resolvedQuizId = resolvedQuizId || codingAttempt.assessmentId;
        resolvedParticipantId = resolvedParticipantId || codingAttempt.participantId;
        resolvedSessionId = resolvedSessionId || codingAttempt.monitoringSessionId || `session_${codingAttempt.id}`;
      }
    }

    let finalParticipantId = Number(resolvedParticipantId);
    if (!Number.isInteger(finalParticipantId) || finalParticipantId <= 0) {
      finalParticipantId = attempt?.participantId || codingAttempt?.participantId || (user?.id ? Number(user.id) : 1);
    }

    const event = await proctoringReportService.recordMonitoringEvent({
      monitoringSessionId: resolvedSessionId,
      attemptId,
      participantId: finalParticipantId,
      quizId: resolvedQuizId,
      eventType,
      severity,
      confidence,
      duration,
      timestamp,
      metadata,
      idempotencyKey,
    });

    emitTrainerUpdate(req, resolvedQuizId, {
      type: 'monitoring_event',
      event: {
        id: event.id,
        attemptId: event.attemptId,
        participantId: event.participantId,
        eventType: event.eventType,
        severity: event.severity,
        confidence: event.confidence,
        duration: event.duration,
        timestamp: event.timestamp,
        metadata: event.metadata,
      }
    });

    ok(res, { eventId: event.id, status: 'RECORDED' });
  } catch (err) {
    logger.error(`[recordMonitoringEvent] Failed: ${err.message}`);
    next(err);
  }
};

/**
 * GET /api/proctoring/reports/:attemptId & /api/proctor/reports/:attemptId
 * Returns complete Proctoring Report (Risk Score, Risk Level, Category Summary, Timeline).
 * PROTECTED: Strictly TRAINER and ADMIN only. Returns 403 for PARTICIPANT.
 */
exports.getAttemptProctoringReport = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    // Hard requirement: Participant is strictly forbidden
    if (role === 'PARTICIPANT') {
      return fail(res, 403, 'Participants are not authorized to view proctoring reports');
    }

    const { attemptId } = req.params;
    let attempt = await QuizAttempt.findByPk(attemptId, {
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email', 'profilePic'] },
        {
          model: AIQuiz,
          as: 'quiz',
          include: [
            { model: Course, as: 'course', attributes: ['id', 'title', 'trainerId'] },
            { model: Training, as: 'training', attributes: ['id', 'title', 'trainerId'] }
          ]
        },
        { model: QuizResult, as: 'result' }
      ]
    });

    let isCoding = false;
    let codingAttempt = null;

    if (!attempt) {
      codingAttempt = await CodingAttempt.findByPk(attemptId, {
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'email', 'profilePic'] },
          {
            model: CodingAssessment,
            as: 'assessment',
            include: [
              { model: Course, as: 'course', attributes: ['id', 'title', 'trainerId'] },
              { model: Training, as: 'training', attributes: ['id', 'title', 'trainerId'] }
            ]
          },
          { model: CodingResult, as: 'result' }
        ]
      });
      if (codingAttempt) {
        isCoding = true;
      }
    }

    if (!attempt && !codingAttempt) {
      return fail(res, 404, 'Assessment attempt not found');
    }

    // IDOR / Permission check for Trainer
    if (role === 'TRAINER') {
      const assessmentObj = isCoding ? codingAttempt.assessment : attempt.quiz;
      const isDirectOwner = assessmentObj && (assessmentObj.trainerId === userId || assessmentObj.createdBy === userId);
      let isAssigned = isDirectOwner;

      if (!isAssigned && assessmentObj?.courseId) {
        const cAssign = await CourseTrainerAssignment.findOne({
          where: { courseId: assessmentObj.courseId, trainerId: userId }
        });
        if (cAssign) isAssigned = true;
      }

      if (!isAssigned && assessmentObj?.trainingId) {
        const tAssign = await TrainingTrainerAssignment.findOne({
          where: { trainingId: assessmentObj.trainingId, trainerId: userId }
        });
        if (tAssign) isAssigned = true;
      }

      if (!isAssigned && !isDirectOwner) {
        return fail(res, 403, 'You are not authorized to access this attempt proctoring report');
      }
    }

    let report = await proctoringReportService.getProctoringReportByAttempt(attemptId);

    // If report has not been generated yet or was failed, generate now on demand
    if (!report || report.status === 'GENERATION_FAILED') {
      report = await proctoringReportService.generateFinalProctoringReport(attemptId);
      if (report) {
        report = await proctoringReportService.getProctoringReportByAttempt(attemptId);
      }
    }

    if (!report) {
      return fail(res, 404, 'Proctoring report could not be found or generated');
    }

    const activeParticipant = isCoding ? codingAttempt.participant : attempt.participant;
    const activeObj = isCoding ? codingAttempt.assessment : attempt.quiz;
    const activeResult = isCoding ? codingAttempt.result : attempt.result;

    return res.json({
      success: true,
      data: {
        attemptId: isCoding ? codingAttempt.id : attempt.id,
        participant: {
          id: activeParticipant?.id,
          name: activeParticipant?.name || 'Participant',
          email: activeParticipant?.email || '',
          profilePic: activeParticipant?.profilePic || null,
        },
        quiz: {
          id: activeObj?.id,
          title: activeObj?.title || (isCoding ? 'Coding Assessment' : 'Quiz'),
          timeLimit: activeObj?.timeLimit,
        },
        score: activeResult ? Number(activeResult.percentage) : null,
        totalScore: activeResult ? Number(activeResult.totalScore) : null,
        maxScore: activeResult ? Number(activeResult.maxScore) : null,
        proctoring: {
          id: report.id,
          monitoringSessionId: report.monitoringSessionId,
          status: report.status,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel,
          generatedAt: report.generatedAt,
          summary: report.summary || {},
          timeline: report.timeline || [],
        }
      }
    });
  } catch (err) {
    logger.error(`[getAttemptProctoringReport] Failed: ${err.message}`);
    next(err);
  }
};

/**
 * POST /api/proctoring/reports/:attemptId/regenerate
 * Force-regenerate proctoring report (Trainer/Admin).
 */
exports.regenerateAttemptProctoringReport = async (req, res, next) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Trainer or Admin only');
    }

    const { attemptId } = req.params;
    const report = await proctoringReportService.generateFinalProctoringReport(attemptId);
    if (!report) {
      return fail(res, 500, 'Failed to regenerate report');
    }

    ok(res, { report });
  } catch (err) { next(err); }
};

/**
 * GET /api/proctoring/admin/reports
 * Admin-only list of proctoring reports with filtering.
 */
exports.getAdminProctoringReports = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return fail(res, 403, 'Admin only');
    }

    const { quizId, participantId, riskLevel, page = 1, limit = 50 } = req.query;
    const where = {};
    if (riskLevel) where.riskLevel = riskLevel;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const includeAttempt = {
      model: QuizAttempt,
      as: 'attempt',
      required: true,
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        { model: AIQuiz, as: 'quiz', attributes: ['id', 'title', 'courseId', 'trainingId'] }
      ]
    };

    if (quizId) includeAttempt.where = { ...(includeAttempt.where || {}), quizId };
    if (participantId) includeAttempt.where = { ...(includeAttempt.where || {}), participantId };

    const { rows: reports, count } = await ProctoringReport.findAndCountAll({
      where,
      include: [includeAttempt],
      order: [['generatedAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });

    ok(res, { reports, total: count, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
};

