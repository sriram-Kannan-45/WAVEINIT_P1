/**
 * monitoringJobQueue
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ transport for the recorded-video AI pipeline. Redis is optional: when
 * it is unavailable (local dev, Render free plan) jobs fall back to the
 * in-process DB poller inside monitoringJobWorker, so the pipeline still works
 * without a broker. The DB (processing_jobs) is always the source of truth.
 */

const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const { getRedisClient, isRedisReady } = require('../config/redis');

const QUEUE_NAME = 'monitoring-video';

let monitoringQueue = null;

function getMonitoringQueue() {
  const client = getRedisClient();
  if (!client || !isRedisReady()) {
    monitoringQueue = null;
    return null;
  }
  if (!monitoringQueue) {
    monitoringQueue = new Queue(QUEUE_NAME, {
      connection: client,
      defaultJobOptions: {
        attempts: 1, // retries are DB-driven so the DB stays authoritative
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    });
  }
  return monitoringQueue;
}

/**
 * Fire-and-forget enqueue. Never awaited by request handlers.
 */
async function enqueueMonitoringJob({ jobId }) {
  const queue = getMonitoringQueue();
  if (queue) {
    try {
      const job = await queue.add('process-video', { jobId }, { jobId });
      logger.info(`[MonitoringQueue] Enqueued ${jobId} as BullMQ job ${job.id}`);
      return job.id;
    } catch (err) {
      logger.warn(`[MonitoringQueue] BullMQ enqueue failed for ${jobId}, falling back to in-process: ${err.message}`);
    }
  }

  // Redis absent -> let the DB poller pick it up
  const { enqueueInProcess } = require('../workers/monitoringJobWorker');
  enqueueInProcess({ jobId });
  return null;
}

async function getJobState(jobId) {
  const queue = getMonitoringQueue();
  if (!queue) return null;
  const job = await queue.getJob(jobId);
  if (!job) return null;
  return { state: await job.getState(), failedReason: job.failedReason };
}

module.exports = { monitoringQueue: QUEUE_NAME, getMonitoringQueue, enqueueMonitoringJob, getJobState };