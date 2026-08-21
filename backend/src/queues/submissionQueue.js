const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const { getRedisClient, isRedisReady } = require('../config/redis');

let submissionQueue = null;

function getSubmissionQueue() {
  const client = getRedisClient();
  if (!client || !isRedisReady()) {
    submissionQueue = null;
    return null;
  }
  if (!submissionQueue) {
    submissionQueue = new Queue('coding-submissions', {
      connection: client,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return submissionQueue;
}

async function enqueueSubmission({ submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit, testCases, participantId, assessmentId, io }) {
  const queue = getSubmissionQueue();
  if (queue) {
    try {
      const job = await queue.add('evaluate', {
        submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit,
        testCases, participantId, assessmentId,
      }, {
        jobId: `sub-${submissionId}`,
        priority: 1,
      });
      logger.info(`[SubmissionQueue] Enqueued submission ${submissionId} as job ${job.id}`);
      return job.id;
    } catch (err) {
      logger.warn('[SubmissionQueue] Failed to enqueue to BullMQ, falling back to synchronous processing', {
        error: err.message,
      });
    }
  }

  logger.info('[SubmissionQueue] Processing submission synchronously (Redis queue not active)');
  const { evaluateSubmission } = require('../workers/submissionWorker');
  await evaluateSubmission({
    submissionId, attemptId, problemId, code, language, timeLimit, memoryLimit,
    testCases, participantId, assessmentId, io,
  });
}

async function getJobStatus(submissionId) {
  const queue = getSubmissionQueue();
  if (!queue) return null;
  const job = await queue.getJob(`sub-${submissionId}`);
  if (!job) return null;
  const state = await job.getState();
  const progress = job.progress;
  return { state, progress, failedReason: job.failedReason };
}

module.exports = { submissionQueue, enqueueSubmission, getJobStatus };
