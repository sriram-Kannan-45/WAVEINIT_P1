const { Op } = require('sequelize');
const {
  AIQuiz,
  AIQuestion,
  AIQuestionOption,
  MonitorAttempt,
  MonitorViolation,
  MonitorScreenshot,
  User,
} = require('../models');
const logger = require('../utils/logger');

// ── Helpers ────────────────────────────────────────────────────────────────
function getNow() {
  return new Date();
}

function buildParticipantView(attempt) {
  const participant = attempt.participant || {};
  const violations = attempt.violations || [];
  const screenshots = attempt.screenshots || [];
  const latestScreenshot = screenshots.length ? screenshots[screenshots.length - 1] : null;
  const remainingSeconds = attempt.endsAt
    ? Math.max(0, Math.floor((new Date(attempt.endsAt) - getNow()) / 1000))
    : 0;

  return {
    id: participant.id || attempt.participantId,
    attemptId: attempt.id,
    name: participant.name || 'Unknown',
    avatar: participant.avatarUrl || participant.profilePic || null,
    email: participant.email || null,
    status: attempt.status === 'submitted' ? 'Submitted'
      : attempt.status === 'disqualified' ? 'Flagged'
      : attempt.flagged ? 'Flagged'
      : attempt.status === 'in_progress' ? 'In Progress'
      : 'Not Started',
    timeRemaining: remainingSeconds,
    violationCount: violations.length,
    latestScreenshot: latestScreenshot ? latestScreenshot.filePath : null,
    lastSeen: latestScreenshot ? latestScreenshot.timestamp : null,
    lastViolation: violations.length
      ? { type: violations[violations.length - 1].type, timestamp: violations[violations.length - 1].timestamp }
      : null,
    score: attempt.score,
    submittedAt: attempt.submittedAt,
    startedAt: attempt.startedAt,
  };
}

// ── Participant: Start Test ────────────────────────────────────────────────
async function startTest(req, res) {
  try {
    const { testId } = req.params;
    const participantId = req.body.participantId || req.user.id;

    if (req.user.role === 'PARTICIPANT' && participantId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const quiz = await AIQuiz.findByPk(testId);
    if (!quiz) return res.status(404).json({ error: 'Test not found' });

    // Reuse existing in-progress attempt if present
    let attempt = await MonitorAttempt.findOne({
      where: { testId, participantId, status: 'in_progress' },
    });

    if (!attempt) {
      const durationSeconds = (quiz.timeLimit || 0) * 60;
      const startedAt = getNow();
      const endsAt = durationSeconds > 0 ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

      attempt = await MonitorAttempt.create({
        testId,
        participantId,
        status: 'in_progress',
        startedAt,
        endsAt,
        duration: durationSeconds,
        answers: [],
      });
    }

    const questions = await AIQuestion.findAll({
      where: { quizId: testId },
      include: [{ model: AIQuestionOption, as: 'optionRows' }],
      order: [['id', 'ASC']],
    });

    const sanitizedQuestions = questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: (q.optionRows || []).map((opt) => ({
        id: opt.id,
        text: opt.text,
      })),
    }));

    const remainingSeconds = attempt.endsAt
      ? Math.max(0, Math.floor((new Date(attempt.endsAt) - getNow()) / 1000))
      : 0;

    res.json({
      attemptId: attempt.id,
      questions: sanitizedQuestions,
      duration: remainingSeconds,
    });
  } catch (err) {
    logger.error('monitor startTest failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Participant: Save Answers ──────────────────────────────────────────────
async function saveAnswers(req, res) {
  try {
    const { testId, attemptId } = req.params;
    const { answers } = req.body;

    const attempt = await MonitorAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.testId !== Number(testId)) return res.status(400).json({ error: 'Attempt does not match test' });
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(409).json({ error: 'Attempt is not active' });
    }

    attempt.answers = answers || [];
    await attempt.save();

    res.json({ success: true });
  } catch (err) {
    logger.error('monitor saveAnswers failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Participant: Submit Test ───────────────────────────────────────────────
async function submitTest(req, res) {
  try {
    const { testId, attemptId } = req.params;
    const { answers, autoSubmitted } = req.body;

    const attempt = await MonitorAttempt.findByPk(attemptId, {
      include: [{ model: MonitorViolation, as: 'violations' }],
    });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.testId !== Number(testId)) return res.status(400).json({ error: 'Attempt does not match test' });
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const finalAnswers = answers || attempt.answers || [];

    // Grade MCQ
    const questions = await AIQuestion.findAll({
      where: { quizId: testId },
      include: [{ model: AIQuestionOption, as: 'optionRows' }],
    });

    let score = 0;
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    for (const ans of finalAnswers) {
      const question = questionMap.get(ans.questionId);
      if (!question) continue;
      const correctOption = (question.optionRows || []).find((o) => o.isCorrect);
      if (correctOption && correctOption.id === ans.selectedOption) {
        score += 1;
      }
    }

    const now = getNow();
    const late = attempt.endsAt ? now > new Date(attempt.endsAt.getTime() + 30000) : false;

    attempt.status = 'submitted';
    attempt.submittedAt = now;
    attempt.answers = finalAnswers;
    attempt.score = score;
    attempt.autoSubmitted = !!autoSubmitted;
    attempt.lateSubmission = late;
    await attempt.save();

    res.json({ success: true, attemptId: attempt.id, score, lateSubmission: late, autoSubmitted: !!autoSubmitted });
  } catch (err) {
    logger.error('monitor submitTest failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Participant: Time Remaining ────────────────────────────────────────────
async function getTimeRemaining(req, res) {
  try {
    const { testId, attemptId } = req.params;

    const attempt = await MonitorAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.testId !== Number(testId)) return res.status(400).json({ error: 'Attempt does not match test' });
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const remainingSeconds = attempt.endsAt
      ? Math.max(0, Math.floor((new Date(attempt.endsAt) - getNow()) / 1000))
      : 0;

    res.json({ remainingSeconds });
  } catch (err) {
    logger.error('monitor getTimeRemaining failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Participant: Flag Self (optional) ──────────────────────────────────────
async function flagTest(req, res) {
  try {
    const { testId } = req.params;
    const { attemptId, reason } = req.body;

    const attempt = await MonitorAttempt.findOne({
      where: { id: attemptId, testId },
    });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (req.user.role === 'PARTICIPANT' && attempt.participantId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    attempt.flagged = true;
    await attempt.save();

    res.json({ success: true });
  } catch (err) {
    logger.error('monitor flagTest failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Sessions ──────────────────────────────────────────────────────
async function getTrainerSessions(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const attempts = await MonitorAttempt.findAll({
      attributes: ['testId'],
      group: ['testId'],
      raw: true,
    });

    const testIds = attempts.map((a) => a.testId);
    const tests = await AIQuiz.findAll({
      where: { id: { [Op.in]: testIds } },
      attributes: ['id', 'title', 'timeLimit'],
    });

    res.json({
      sessions: tests.map((t) => ({
        id: t.id,
        title: t.title,
        timeLimit: t.timeLimit,
      })),
    });
  } catch (err) {
    logger.error('monitor getTrainerSessions failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Participants in Session ───────────────────────────────────────
async function getSessionParticipants(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { sessionId } = req.params;
    const attempts = await MonitorAttempt.findAll({
      where: { testId: sessionId },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email', 'avatarUrl', 'profilePic'] },
        { model: MonitorViolation, as: 'violations' },
        { model: MonitorScreenshot, as: 'screenshots' },
      ],
      order: [['id', 'DESC']],
    });

    res.json({
      participants: attempts.map(buildParticipantView),
    });
  } catch (err) {
    logger.error('monitor getSessionParticipants failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Screenshots for attempt ───────────────────────────────────────
async function getParticipantScreenshots(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { attemptId } = req.params;
    const screenshots = await MonitorScreenshot.findAll({
      where: { attemptId },
      order: [['timestamp', 'DESC']],
    });

    res.json({ screenshots });
  } catch (err) {
    logger.error('monitor getParticipantScreenshots failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Violations for attempt ────────────────────────────────────────
async function getParticipantViolations(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { attemptId } = req.params;
    const violations = await MonitorViolation.findAll({
      where: { attemptId },
      order: [['timestamp', 'ASC']],
    });

    res.json({ violations });
  } catch (err) {
    logger.error('monitor getParticipantViolations failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Flag Participant ──────────────────────────────────────────────
async function flagParticipant(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { attemptId } = req.params;
    const attempt = await MonitorAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    attempt.flagged = true;
    await attempt.save();

    res.json({ success: true });
  } catch (err) {
    logger.error('monitor flagParticipant failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Disqualify Participant ────────────────────────────────────────
async function disqualifyParticipant(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { attemptId } = req.params;
    const { reason } = req.body;
    const attempt = await MonitorAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    attempt.status = 'disqualified';
    attempt.flagged = true;
    attempt.disqualificationReason = reason || 'Disqualified by trainer';
    await attempt.save();

    res.json({ success: true });
  } catch (err) {
    logger.error('monitor disqualifyParticipant failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Warn Participant ──────────────────────────────────────────────
async function warnParticipant(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { attemptId } = req.params;
    const { message } = req.body;
    const attempt = await MonitorAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    // The actual socket emit happens in monitorEvents.js via a broadcast lookup,
    // but we persist a TRAINER_WARNING violation here for the audit log.
    await MonitorViolation.create({
      attemptId,
      participantId: attempt.participantId,
      type: 'TRAINER_WARNING',
      metadata: { message },
    });

    res.json({ success: true, message });
  } catch (err) {
    logger.error('monitor warnParticipant failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── Trainer: Force Submit ──────────────────────────────────────────────────
async function forceSubmitParticipant(req, res) {
  try {
    if (!['TRAINER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { attemptId } = req.params;
    const { reason } = req.body;
    const attempt = await MonitorAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    attempt.status = 'submitted';
    attempt.submittedAt = getNow();
    attempt.autoSubmitted = true;
    await attempt.save();

    res.json({ success: true, reason });
  } catch (err) {
    logger.error('monitor forceSubmitParticipant failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  startTest,
  saveAnswers,
  submitTest,
  getTimeRemaining,
  flagTest,
  getTrainerSessions,
  getSessionParticipants,
  getParticipantScreenshots,
  getParticipantViolations,
  flagParticipant,
  disqualifyParticipant,
  warnParticipant,
  forceSubmitParticipant,
};
