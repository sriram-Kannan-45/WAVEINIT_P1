/**
 * Proctoring HTTP controller.
 *
 * Thin wrapper: parses req, delegates to proctoringService, emits socket
 * events for trainer monitoring side-channels.
 */
const proctoring = require('../services/proctoringService');
const { ExamSession, AIQuiz, AIQuestion, QuizAnswer, QuizAttempt, QuizResult, User, Screenshot } = require('../models');
const aiService = require('../services/aiService');
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
}

function emitTrainerUpdate(req, quizId, payload, assessmentId) {
  const io = req.app.get('io');
  if (!io) return;
  const roomId = quizId || `coding_${assessmentId || ''}`;
  io.to(`proctor_quiz_${roomId}`).emit('proctor:update', payload);
  if (quizId) {
    io.to(`proctor_coding_${quizId}`).emit('proctor:update', payload);
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

    // ── Quiz: full grading logic ──
    const existingResult = await QuizResult.findOne({ where: { attemptId: session.attemptId } });
    if (existingResult) {
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
      const { CodingResult, CodingAssessment } = require('../models');
      const attemptId = session.codingAttemptId;
      const [result, assessment] = await Promise.all([
        attemptId ? CodingResult.findOne({ where: { attemptId } }) : Promise.resolve(null),
        CodingAssessment.findByPk(session.assessmentId),
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
      });
    }

    const [result, quiz, savedAnswers] = await Promise.all([
      QuizResult.findOne({ where: { attemptId: session.attemptId } }),
      AIQuiz.findByPk(session.quizId, {
        include: [{ model: AIQuestion, as: 'questions' }],
      }),
      QuizAnswer.findAll({ where: { attemptId: session.attemptId } }),
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
