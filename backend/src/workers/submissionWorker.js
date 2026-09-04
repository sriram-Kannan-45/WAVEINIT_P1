const { Worker } = require('bullmq');
const { JudgeEngine } = require('../judge/engine');
const { VERDICTS } = require('../judge/verdicts');
const { sequelize } = require('../config/db');
const { CodingSubmission, CodingProblem, CodingTestCase } = require('../models');
const { checkRequiredConcepts } = require('../services/requiredConceptValidator');
const relay = require('../socket/crossInstance');
const logger = require('../utils/logger');

const { getRedisClient, isRedisReady } = require('../config/redis');

const judgeEngine = new JudgeEngine();

async function emitProgress(io, submissionId, progress) {
  if (!io) return;
  try {
    relay.relayEmit(io, 'room', `submission_${submissionId}`, 'submission:progress', {
      submissionId, ...progress,
    });
  } catch (err) {
    logger.warn('[SubmissionWorker] Failed to emit progress', { submissionId, error: err.message });
  }
}

async function evaluateSubmission({ submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit, testCases, participantId, assessmentId, io }) {
  // NOTE: Docker evaluation is intentionally done OUTSIDE any DB transaction
  // so we do NOT hold a DB connection / row lock during expensive I/O.
  await emitProgress(io, submissionId, { status: VERDICTS.COMPILING, message: 'Compiling...', testCase: null });

  let evalResult;
  let problem;
  try {
    evalResult = await judgeEngine.evaluate({
      code, language, testCases, timeLimit, memoryLimit,
    });
    problem = problemId ? await CodingProblem.findByPk(problemId, { attributes: ['marks', 'requiredConcepts'] }) : null;
  } catch (evalErr) {
    logger.error(`[SubmissionWorker] Judge engine error evaluating submission ${submissionId}`, { error: evalErr.message });
    await emitProgress(io, submissionId, { status: VERDICTS.INTERNAL_ERROR, message: 'Internal judge error' });
    try {
      const sub = await CodingSubmission.findByPk(submissionId);
      if (sub) await sub.update({ status: VERDICTS.INTERNAL_ERROR, errorMessage: evalErr.message });
    } catch {}
    return;
  }

  // ── Compute results (pure computation, no DB) ──
  const totalTestCases = testCases.length;
  const passedTestCases = evalResult.passed;
  const compileOutput = evalResult.results.find(r => r.compileOutput)?.compileOutput || '';
  const compileError = evalResult.results.find(r => r.verdict === VERDICTS.COMPILATION_ERROR)?.error || '';
  const runtimeError = evalResult.results.find(r => r.verdict === VERDICTS.RUNTIME_ERROR)?.error || '';

  const problemMarks = problem?.marks || 10;
  const conceptValidation = checkRequiredConcepts(code, language, problem?.requiredConcepts || []);

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

  let finalVerdict = evalResult.verdict;
  let finalError = runtimeError;
  if (evalResult.verdict === VERDICTS.ACCEPTED && !conceptValidation.ok) {
    finalVerdict = 'FAILED_REQUIREMENTS';
    score = 0;
    finalError = conceptValidation.message || 'Required concept missing from solution';
  }

  const outputResults = evalResult.results.map((r, i) => ({
    testCaseId: testCases[i]?.id || null,
    input: testCases[i]?.isHidden ? '[Hidden]' : (testCases[i]?.input || ''),
    expectedOutput: testCases[i]?.isHidden ? '[Hidden]' : (testCases[i]?.expectedOutput || ''),
    actualOutput: testCases[i]?.isHidden ? (r.verdict === VERDICTS.ACCEPTED ? '[Passed]' : '[Failed]') : (r.actualOutput || ''),
    verdict: (!conceptValidation.ok && r.verdict === VERDICTS.ACCEPTED) ? 'FAILED_REQUIREMENTS' : r.verdict,
    passed: r.verdict === VERDICTS.ACCEPTED && conceptValidation.ok,
    executionTime: r.executionTime,
    memoryUsed: r.memoryUsed,
    isHidden: testCases[i]?.isHidden || false,
    error: r.error || (!conceptValidation.ok ? conceptValidation.message : null),
    compileOutput: r.compileOutput || null,
  }));

  // ── Short DB write transaction (fast, no Docker inside) ──
  const t = await sequelize.transaction();
  try {
    const submission = await CodingSubmission.findByPk(submissionId, { transaction: t });
    if (!submission) {
      await t.rollback();
      logger.error(`[SubmissionWorker] Submission ${submissionId} not found`);
      return;
    }

    const failedIndex = outputResults.findIndex(r => !r.passed);

    await submission.update({
      status: finalVerdict,
      totalTestCases,
      passedTestCases: conceptValidation.ok ? passedTestCases : 0,
      executionTime: evalResult.maxExecutionTime,
      memoryUsed: evalResult.maxMemory,
      score,
      output: outputResults,
      compilerOutput: compileOutput || compileError || null,
      errorMessage: finalError || null,
      failedTestCase: failedIndex >= 0 ? failedIndex + 1 : null,
    }, { transaction: t });

    await t.commit();
  } catch (err) {
    await t.rollback();
    logger.error(`[SubmissionWorker] DB write error for submission ${submissionId}`, { error: err.message });
    try {
      const sub = await CodingSubmission.findByPk(submissionId);
      if (sub) await sub.update({ status: VERDICTS.INTERNAL_ERROR, errorMessage: err.message });
    } catch {}
    await emitProgress(io, submissionId, { status: VERDICTS.INTERNAL_ERROR, message: 'Internal judge error' });
    return;
  }

  await emitProgress(io, submissionId, {
    status: finalVerdict,
    message: !conceptValidation.ok ? finalError : `Evaluation complete: ${finalVerdict}`,
    testCase: totalTestCases,
    totalTestCases,
    passedTestCases: conceptValidation.ok ? passedTestCases : 0,
    score,
    executionTime: evalResult.maxExecutionTime,
    memoryUsed: evalResult.maxMemory,
    results: outputResults,
    conceptValidation,
  });

  // Best-effort result-update emit (fire-and-forget, never blocks).
  if (io && attemptId) {
    setImmediate(async () => {
      try {
        const { CodingAttempt, CodingResult, CodingAssessment } = require('../models');
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

            relay.relayEmit(io, 'user-room', participantId, 'coding:result-update', {
              attemptId,
              assessmentId,
              totalScore,
              maxScore,
              percentage,
              problemsSolved,
              totalProblems: problems.length,
              verdict: evalResult.verdict,
            });
          }
        }
      } catch (emitErr) {
        logger.warn('[SubmissionWorker] Failed to emit result update', { error: emitErr.message });
      }
    });
  }

  logger.info(`[SubmissionWorker] Evaluated submission ${submissionId}: ${evalResult.verdict} (${passedTestCases}/${totalTestCases})`);
}

let submissionWorker = null;

function startWorker(io) {
  const connection = getRedisClient();
  if (!connection || !isRedisReady()) {
    logger.info('[SubmissionWorker] Redis not connected; submissions will be processed synchronously.');
    return null;
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
