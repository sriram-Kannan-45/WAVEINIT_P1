/**
 * Quiz Auto-Close Job
 * ─────────────────────
 * Runs every 60 seconds. Finds PUBLISHED quizzes whose end_time has passed,
 * transitions them to CLOSED, and auto-submits any in-progress attempts.
 */
const { Op } = require('sequelize');
const { AIQuiz, QuizAttempt, QuizResult, QuizAnswer } = require('../models');

const INTERVAL_MS = 60_000;

async function tick() {
  const now = new Date();
  let io = null;
  try {
    io = require('../../app')?.get('io');
  } catch (_) {}

  try {
    const expiredQuizzes = await AIQuiz.findAll({
      where: {
        status: 'PUBLISHED',
        endTime: { [Op.lte]: now },
      }
    });

    for (const quiz of expiredQuizzes) {
      console.log(`[quizAutoClose] Auto-closing quiz #${quiz.id} "${quiz.title}" — end_time passed`);

      // Auto-submit in-progress attempts
      const inProgress = await QuizAttempt.findAll({
        where: { quizId: quiz.id, status: 'IN_PROGRESS' }
      });
      for (const attempt of inProgress) {
        await attempt.update({ status: 'AUTO_SUBMITTED', submittedAt: now });
      }

      await quiz.update({ status: 'CLOSED', closedAt: now });

      if (io) {
        io.emit('quiz:closed', { quizId: quiz.id });
        io.emit('quiz:published', { quizId: quiz.id });
      }
    }

    if (expiredQuizzes.length > 0) {
      console.log(`[quizAutoClose] Closed ${expiredQuizzes.length} quiz(es), auto-submitted in-progress attempts`);
    }
  } catch (error) {
    console.error('[quizAutoClose] Error:', error.message);
  }
}

let intervalHandle = null;

function start() {
  tick();
  intervalHandle = setInterval(tick, INTERVAL_MS);
  console.log(`[quizAutoClose] Auto-close scheduler started (interval: ${INTERVAL_MS}ms)`);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop };
