const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connection = null;
let submissionQueue = null;

function createRedisConnection() {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 50, 2000);
    },
    lazyConnect: true,
  });

  conn.on('error', (err) => {
    logger.warn('[SubmissionQueue] Redis connection error', { error: err.message });
  });

  conn.on('ready', () => {
    logger.info('[SubmissionQueue] Redis connected');
    connection = conn;
    if (!submissionQueue) {
      submissionQueue = new Queue('coding-submissions', {
        connection: conn,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });
    }
  });

  conn.on('close', () => {
    connection = null;
    submissionQueue = null;
  });

  conn.connect().catch((err) => {
    logger.warn('[SubmissionQueue] Redis unavailable, using in-process queue fallback', { error: err.message });
    connection = null;
  });
}

createRedisConnection();

async function enqueueSubmission({ submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit, testCases, participantId, assessmentId, io }) {
  if (submissionQueue) {
    const job = await submissionQueue.add('evaluate', {
      submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit,
      testCases, participantId, assessmentId,
    }, {
      jobId: `sub-${submissionId}`,
      priority: 1,
    });
    logger.info(`[SubmissionQueue] Enqueued submission ${submissionId} as job ${job.id}`);
    return job.id;
  }

  logger.info('[SubmissionQueue] Queue unavailable, processing inline');
  const { evaluateSubmission } = require('../workers/submissionWorker');
  await evaluateSubmission({
    submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit,
    testCases, participantId, assessmentId, io,
  });
}

async function getJobStatus(submissionId) {
  if (!submissionQueue) return null;
  const job = await submissionQueue.getJob(`sub-${submissionId}`);
  if (!job) return null;
  const state = await job.getState();
  const progress = job.progress;
  return { state, progress, failedReason: job.failedReason };
}

module.exports = { submissionQueue, enqueueSubmission, getJobStatus, connection };
