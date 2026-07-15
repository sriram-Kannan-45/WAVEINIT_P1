const { Worker } = require('bullmq');
const { JudgeEngine } = require('../judge/engine');
const { VERDICTS } = require('../judge/verdicts');
const { sequelize } = require('../config/db');
const { CodingSubmission, CodingProblem, CodingTestCase } = require('../models');
const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let connection = null;

const IORedis = require('ioredis');
const redisConn = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 50, 2000);
  },
  lazyConnect: true,
});

redisConn.on('error', (err) => {
  logger.warn('[SubmissionWorker] Redis connection error', { error: err.message });
});

redisConn.on('ready', () => {
  logger.info('[SubmissionWorker] Redis connected');
  connection = redisConn;
});

redisConn.on('close', () => {
  connection = null;
});

redisConn.connect().catch((err) => {
  logger.warn('[SubmissionWorker] Redis unavailable, worker will process synchronously', { error: err.message });
  connection = null;
});

const judgeEngine = new JudgeEngine();

async function emitProgress(io, submissionId, progress) {
  if (!io) return;
  try {
    io.to(`submission_${submissionId}`).emit('submission:progress', {
      submissionId, ...progress,
    });
  } catch (err) {
    logger.warn('[SubmissionWorker] Failed to emit progress', { submissionId, error: err.message });
  }
}

async function evaluateSubmission({ submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit, testCases, participantId, assessmentId, io }) {
  const t = await sequelize.transaction();
  try {
    await emitProgress(io, submissionId, { status: VERDICTS.COMPILING, message: 'Compiling...', testCase: null });
    const evalResult = await judgeEngine.evaluate({
      code, language, testCases, timeLimit, memoryLimit,
    });

    const totalTestCases = testCases.length;
    const passedTestCases = evalResult.passed;
    const compileOutput = evalResult.results.find(r => r.compileOutput)?.compileOutput || '';
    const compileError = evalResult.results.find(r => r.verdict === VERDICTS.COMPILATION_ERROR)?.error || '';
    const runtimeError = evalResult.results.find(r => r.verdict === VERDICTS.RUNTIME_ERROR)?.error || '';

    const problem = problemId ? await CodingProblem.findByPk(problemId, { attributes: ['marks'], transaction: t }) : null;
    const problemMarks = problem?.marks || 10;

    let score = 0;
    if (totalTestCases > 0) {
      const totalWeight = testCases.reduce((s, tc) => s + (tc.weight || 1), 0);
      const earnedWeight = testCases.reduce((s, tc, i) => {
        const r = evalResult.results[i];
        if (r && r.verdict === VERDICTS.ACCEPTED) return s + (tc.weight || 1);
        return s;
      }, 0);
      score = totalWeight > 0 ? Math.min(Math.round((earnedWeight / totalWeight) * problemMarks * 100) / 100, problemMarks) : 0;
    }

    const outputResults = evalResult.results.map((r, i) => ({
      testCaseId: testCases[i]?.id || null,
      input: testCases[i]?.isHidden ? '[Hidden]' : (testCases[i]?.input || ''),
      expectedOutput: testCases[i]?.isHidden ? '[Hidden]' : (testCases[i]?.expectedOutput || ''),
      actualOutput: testCases[i]?.isHidden ? (r.verdict === VERDICTS.ACCEPTED ? '[Passed]' : '[Failed]') : (r.actualOutput || ''),
      verdict: r.verdict,
      passed: r.verdict === VERDICTS.ACCEPTED,
      executionTime: r.executionTime,
      memoryUsed: r.memoryUsed,
      isHidden: testCases[i]?.isHidden || false,
      error: r.error || null,
      compileOutput: r.compileOutput || null,
    }));

    const submission = await CodingSubmission.findByPk(submissionId, { transaction: t });
    if (!submission) {
      await t.rollback();
      logger.error(`[SubmissionWorker] Submission ${submissionId} not found`);
      return;
    }

    const failedIndex = outputResults.findIndex(r => !r.passed);

    await submission.update({
      status: evalResult.verdict,
      totalTestCases,
      passedTestCases,
      executionTime: evalResult.maxExecutionTime,
      memoryUsed: evalResult.maxMemory,
      score,
      output: outputResults,
      compilerOutput: compileOutput || compileError || null,
      errorMessage: runtimeError || null,
      failedTestCase: failedIndex >= 0 ? failedIndex + 1 : null,
    }, { transaction: t });

    await t.commit();

    await emitProgress(io, submissionId, {
      status: evalResult.verdict,
      message: `Evaluation complete: ${evalResult.verdict}`,
      testCase: totalTestCases,
      totalTestCases,
      passedTestCases,
      score,
      executionTime: evalResult.maxExecutionTime,
      memoryUsed: evalResult.maxMemory,
      results: outputResults,
    });

    if (io) {
      const { CodingAttempt, CodingResult, CodingAssessment } = require('../models');
      const { Op } = require('sequelize');

      if (attemptId) {
        const attempt = await CodingAttempt.findByPk(attemptId);
        if (attempt && attempt.status === 'SUBMITTED') {
          const assessment = await CodingAssessment.findByPk(assessmentId);
          if (assessment) {
            const allSubs = await CodingSubmission.findAll({ where: { attemptId } });
            let totalScore = 0;
            let maxScore = 0;
            let problemsSolved = 0;
            let totalTC = 0;
            let passedTC = 0;

            const problems = await CodingProblem.findAll({ where: { assessmentId } });
            for (const p of problems) maxScore += (p.marks || 10);
            for (const sub of allSubs) {
              totalScore += parseFloat(sub.score || 0);
              totalTC += (sub.totalTestCases || 0);
              passedTC += (sub.passedTestCases || 0);
              if (sub.status === 'ACCEPTED') problemsSolved++;
            }
            totalScore = Math.min(totalScore, maxScore);
            const percentage = maxScore > 0 ? Math.min(Math.round((totalScore / maxScore) * 10000) / 100, 100) : 0;

            const result = await CodingResult.findOne({ where: { attemptId } });
            if (result) {
              await result.update({
                totalScore: Math.min(totalScore, 999.99),
                maxScore: Math.min(maxScore, 999.99),
                percentage: Math.min(percentage, 100),
                problemsSolved,
                totalTestCases: totalTC, passedTestCases: passedTC,
              });
            }

            try {
              io.to(`user_${participantId}`).emit('coding:result-update', {
                attemptId,
                assessmentId,
                totalScore,
                maxScore,
                percentage,
                problemsSolved,
                totalProblems: problems.length,
                verdict: evalResult.verdict,
              });
            } catch (emitErr) {
              logger.warn('[SubmissionWorker] Failed to emit result update', { error: emitErr.message });
            }
          }
        }
      }
    }

    logger.info(`[SubmissionWorker] Evaluated submission ${submissionId}: ${evalResult.verdict} (${passedTestCases}/${totalTestCases})`);
  } catch (err) {
    await t.rollback();
    logger.error(`[SubmissionWorker] Error evaluating submission ${submissionId}`, { error: err.message, stack: err.stack });
    try {
      const sub = await CodingSubmission.findByPk(submissionId);
      if (sub) {
        await sub.update({ status: VERDICTS.INTERNAL_ERROR, errorMessage: err.message });
      }
    } catch {}
    await emitProgress(io, submissionId, { status: VERDICTS.INTERNAL_ERROR, message: 'Internal judge error' });
  }
}

let submissionWorker = null;

function startWorker(io) {
  if (!connection) {
    logger.warn('[SubmissionWorker] Redis unavailable, worker will process synchronously');
    return;
  }

  if (submissionWorker) {
    logger.info('[SubmissionWorker] Worker already running');
    return submissionWorker;
  }

  submissionWorker = new Worker('coding-submissions', async (job) => {
    const { submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit, testCases, participantId, assessmentId } = job.data;

    logger.info(`[SubmissionWorker] Processing job ${job.id} for submission ${submissionId}`);

    await emitProgress(io, submissionId, { status: 'QUEUED', message: 'Queued for evaluation...', testCase: 0, totalTestCases: testCases?.length });

    let testCasesProcessed = 0;
    for (let i = 0; i < (testCases?.length || 0); i++) {
      testCasesProcessed++;
      await job.updateProgress({ testCase: testCasesProcessed, total: testCases.length });
    }

    await evaluateSubmission({
      submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit,
      testCases, participantId, assessmentId, io,
    });

    return { submissionId, processed: true };
  }, {
    connection,
    concurrency: 4,
    limiter: { max: 10, duration: 1000 },
  });

  submissionWorker.on('completed', (job) => {
    logger.info(`[SubmissionWorker] Job ${job.id} completed`);
  });

  submissionWorker.on('failed', (job, err) => {
    logger.error(`[SubmissionWorker] Job ${job.id} failed`, { error: err.message });
  });

  logger.info('[SubmissionWorker] Started with concurrency=4');
  return submissionWorker;
}

async function stopWorker() {
  if (submissionWorker) {
    await submissionWorker.close();
    submissionWorker = null;
    logger.info('[SubmissionWorker] Stopped');
  }
}

module.exports = { evaluateSubmission, startWorker, stopWorker, judgeEngine };
