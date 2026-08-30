/**
 * monitoringJobWorker
 * ─────────────────────────────────────────────────────────────────────────────
 * Consumes monitoring ProcessingJobs:
 *   - BullMQ worker when Redis is available
 *   - in-process DB poller when it is not (local dev / Render free plan)
 *   - a recovery sweep that re-claims expired worker locks (crash recovery)
 *
 * Every job claims its processing_jobs row (workerId + lockExpiresAt) before
 * doing work, so multiple instances can never process the same segment twice
 * concurrently. Idempotency keys on MonitoringEvent/ProctoringEvent make even
 * an overlapping retry safe.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const monitoringConfig = require('../config/monitoringConfig');
const { getRedisClient, isRedisReady } = require('../config/redis');
const { ProcessingJob, VideoSegment } = require('../models');
const videoService = require('../services/monitoringVideoService');

const AI_SERVICE_URL = monitoringConfig.AI_SERVICE_URL;
const LOCK_MS = monitoringConfig.JOB_LOCK_TIMEOUT_MS;
const HTTP_TIMEOUT_MS = Math.max(60_000, LOCK_MS - 60_000);
const WORKER_INSTANCE_ID = `worker_${process.pid}_${Date.now().toString(36)}`;

// ── Socket.IO progress ───────────────────────────────────────────────────────
async function emitSegmentStatus(io, segment, status, message = '') {
  if (!io) return;
  try {
    const payload = {
      sessionId: segment.monitoringSessionId,
      segmentKey: segment.segmentKey,
      segmentSequence: segment.segmentSequence,
      status,
      message,
      timestamp: new Date().toISOString(),
    };
    io.to(`monitoring_${segment.monitoringSessionId}`).emit('monitoring:segment-status', payload);
    if (segment.participantId) {
      io.to(`user_${segment.participantId}`).emit('monitoring:segment-status', payload);
    }
  } catch (err) {
    logger.warn('[MonitoringWorker] Failed to emit segment status', { error: err.message });
  }
}

// ── Job claiming (crash-safe lock) ───────────────────────────────────────────
async function claimJob(jobId) {
  const now = new Date();
  const [updated] = await ProcessingJob.update(
    {
      status: 'PROCESSING',
      workerId: WORKER_INSTANCE_ID,
      lockExpiresAt: new Date(now.getTime() + LOCK_MS),
      startedAt: now,
      attempts: ProcessingJob.sequelize.literal('attempts + 1'),
    },
    {
      where: {
        jobId,
        [Op.or]: [
          { status: 'QUEUED' },
          { status: 'PROCESSING', lockExpiresAt: { [Op.lt]: now } },
        ],
      },
    }
  );
  return updated > 0;
}

// ── Core processing ──────────────────────────────────────────────────────────
async function processSegmentJob(jobId, io) {
  const job = await ProcessingJob.findOne({ where: { jobId } });
  if (!job) {
    logger.warn(`[MonitoringWorker] Job ${jobId} not found`);
    return { processed: false, reason: 'JOB_NOT_FOUND' };
  }
  if (job.status === 'COMPLETED') return { processed: false, reason: 'ALREADY_COMPLETED' };

  const claimed = await claimJob(jobId);
  if (!claimed) {
    logger.info(`[MonitoringWorker] Job ${jobId} is locked by another worker; skipping`);
    return { processed: false, reason: 'LOCKED' };
  }

  let segment = null;
  try {
    segment = await VideoSegment.findByPk(job.segmentId);
    if (!segment || !segment.videoPath || !fs.existsSync(segment.videoPath)) {
      throw Object.assign(new Error(`Segment video artifact missing (${segment?.videoPath || 'no path'})`), {
        code: 'ARTIFACT_MISSING',
        permanent: true,
      });
    }

    await segment.update({ status: 'PROCESSING', processingStartedAt: new Date(), errorMessage: null });
    await emitSegmentStatus(io, segment, 'PROCESSING', 'AI service analyzing segment...');

    const payload = job.requestPayload || {};
    const result = await callAiProcessVideo({ segment, job, payload });

    if (!result || result.status === 'error') {
      throw new Error(result?.error || 'AI service returned error status');
    }

    await segment.update({ status: 'COMPLETED', processedAt: new Date() });
    await videoService.persistSegmentResults(segment, result);

    await ProcessingJob.update(
      { status: 'COMPLETED', completedAt: new Date(), lastError: null, workerId: null, lockExpiresAt: null },
      { where: { jobId } }
    );

    await emitSegmentStatus(io, segment, 'COMPLETED', 'Segment processed');
    await videoService.aggregateSession(segment.monitoringSessionId);

    logger.info(
      `[MonitoringWorker] Job ${jobId} completed: ${result.events?.length || 0} events from ${(result.durationSec || 0).toFixed(1)}s video`
    );
    return { processed: true, segmentKey: segment.segmentKey };
  } catch (err) {
    return handleJobError({ jobId, segment, error: err, io });
  }
}

async function callAiProcessVideo({ segment, payload }) {
  const videoPath = segment.videoPath;
  const th = payload.thresholds || {};

  const form = new FormData();
  form.append('file', fs.createReadStream(videoPath), {
    filename: path.basename(videoPath) || 'segment.webm',
    contentType: segment.mimeType || 'video/webm',
  });
  form.append('session_id', segment.monitoringSessionId || '');
  form.append('segment_key', segment.segmentKey || '');
  form.append('attempt_id', segment.attemptId ? String(segment.attemptId) : '');
  form.append('participant_id', segment.participantId ? String(segment.participantId) : '');
  form.append('configured_duration', String(payload.configuredDuration || Math.max(1, segment.durationSec || 1800)));
  form.append('sample_fps', String(payload.sampleFps || monitoringConfig.SAMPLE_FPS));
  form.append('start_time', String(new Date(segment.startedAt).getTime()));
  [
    ['no_person_min_frames', th.noPersonMinFrames],
    ['no_person_min_duration_sec', th.noPersonMinDurationSec],
    ['multiple_person_min_frames', th.multiplePersonMinFrames],
    ['multiple_person_min_duration_sec', th.multiplePersonMinDurationSec],
    ['face_not_visible_min_frames', th.faceNotVisibleMinFrames],
    ['face_not_visible_min_duration_sec', th.faceNotVisibleMinDurationSec],
  ].forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });

  let response;
  try {
    response = await axios.post(`${AI_SERVICE_URL}/api/proctoring/process-video`, form, {
      headers: {
        ...form.getHeaders(),
        ...(process.env.AI_SERVICE_API_KEY ? { Authorization: `Bearer ${process.env.AI_SERVICE_API_KEY}` } : {}),
      },
      timeout: HTTP_TIMEOUT_MS,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  } catch (err) {
    // Network-level failures & timeouts are retryable; HTTP error responses land in body.
    const status = err?.response?.status;
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      throw Object.assign(new Error(`AI service rejected request (HTTP ${status}): ${detail}`), {
        code: 'AI_HTTP_ERROR',
        permanent: true,
      });
    }
    throw Object.assign(new Error(err?.message || 'AI service network error'), {
      code: err?.code || 'AI_NETWORK_ERROR',
      permanent: false,
    });
  }

  if (response.status >= 500) {
    throw Object.assign(new Error(`AI service error (HTTP ${response.status})`), {
      code: 'AI_HTTP_ERROR',
      permanent: false,
    });
  }
  return response.data;
}

async function handleJobError({ jobId, segment, error, io }) {
  const message = (error?.message || 'Unknown error').slice(0, 1024);
  const permanent = error?.permanent === true;
  const freshJob = await ProcessingJob.findOne({ where: { jobId } });
  const maxAttempts = freshJob?.maxAttempts || monitoringConfig.JOB_MAX_RETRIES + 1;
  const attemptsUsed = freshJob?.attempts || 0;
  logger.warn(`[MonitoringWorker] Job ${jobId} failed (attempt ${attemptsUsed}/${maxAttempts}): ${message}`);

  const retrying = !permanent && attemptsUsed < maxAttempts;

  if (retrying) {
    // Reset the row to QUEUED immediately (lock cleared) so the poller or the
    // scheduled BullMQ re-add can own it; recovery sweep can never steal it.
    await ProcessingJob.update(
      {
        status: 'QUEUED',
        workerId: null,
        lockExpiresAt: null,
        lastError: message,
      },
      { where: { jobId } }
    );
    if (segment) {
      await segment.update({
        status: 'RETRYING',
        processingRetries: (segment.processingRetries || 0) + 1,
        errorMessage: message,
      });
      await emitSegmentStatus(io, segment, 'RETRYING', `Processing failed, retrying (${maxAttempts - attemptsUsed} left)`);
    }

    const retryJobId = `${jobId}_r${attemptsUsed + 1}`;
    const backoffMs = Math.min(60_000, 5_000 * Math.pow(2, attemptsUsed - 1));
    setTimeout(() => {
      // Rename the row to the fresh BullMQ job id and re-enqueue.
      ProcessingJob.update({ jobId: retryJobId }, { where: { id: freshJob.id } })
        .catch((e) => logger.warn(`[MonitoringWorker] jobId rename failed: ${e.message}`))
        .finally(() => {
          require('../queues/monitoringJobQueue').enqueueMonitoringJob({ jobId: retryJobId }).catch(() => {});
        });
    }, backoffMs);
    return { processed: false, retrying: true, jobId: retryJobId };
  }

  // Permanent failure or attempts exhausted
  await ProcessingJob.update(
    { status: permanent ? 'DEAD_LETTERED' : 'FAILED', workerId: null, lockExpiresAt: null },
    { where: { jobId } }
  );
  if (segment) {
    await segment.update({
      status: 'PROCESSING_FAILED',
      errorMessage: message,
      processingRetries: (segment.processingRetries || 0) + 1,
    });
    await emitSegmentStatus(io, segment, 'PROCESSING_FAILED', message);
    await videoService.aggregateSession(segment.monitoringSessionId);
  }
  return { processed: false, jobId };
}

// ── Recovery sweep (crash recovery across all modes) ─────────────────────────
async function recoverStaleJobs(io) {
  const now = new Date();
  const stale = await ProcessingJob.findAll({
    where: {
      status: 'PROCESSING',
      [Op.or]: [{ lockExpiresAt: { [Op.lt]: now } }, { lockExpiresAt: null }],
    },
    limit: 25,
  });

  for (const job of stale) {
    const segment = await VideoSegment.findByPk(job.segmentId).catch(() => null);
    if (segment && !['PROCESSING_FAILED', 'DEAD_LETTERED'].includes(segment.status)) {
      await segment.update({ status: 'QUEUED', queuedAt: new Date(), errorMessage: null });
    }
    await ProcessingJob.update(
      { status: 'QUEUED', workerId: null, lockExpiresAt: null },
      { where: { id: job.id } }
    );
    logger.info(`[MonitoringWorker] Recovery: re-queued stale job ${job.jobId}`);
    enqueueMonitoringJob({ jobId: `${job.jobId}_recovery_${now.getTime()}` }).catch(() => {});
  }

  await reapStaleFinalizing(io);
  return stale.length;
}

// ── Stale FINALIZING reaper ───────────────────────────────────────────────────
// A segment the browser finalized but whose media never arrived (crashed tab,
// lost network, abandoned attempt) would otherwise wedge the session in "waiting
// for processing" forever. After FINALIZING_GRACE_MS we flag it UPLOAD_FAILED so
// the session can aggregate to PARTIAL and reviewers see the coverage gap.
async function reapStaleFinalizing(io) {
  const cutoff = new Date(Date.now() - monitoringConfig.FINALIZING_GRACE_MS);
  const graceMin = Math.round(monitoringConfig.FINALIZING_GRACE_MS / 60_000);
  let reaped = 0;
  try {
    const stale = await VideoSegment.findAll({
      where: {
        status: 'FINALIZING',
        finalizedAt: { [Op.lt]: cutoff },
      },
      limit: 25,
    });
    for (const segment of stale) {
      await segment.update({
        status: 'UPLOAD_FAILED',
        errorMessage: `No upload within ${graceMin} min of finalization (likely lost media).`,
        processedAt: new Date(),
      });
      await emitSegmentStatus(io, segment, 'UPLOAD_FAILED', 'Segment media was never uploaded');
      await videoService.aggregateSession(segment.monitoringSessionId);
      reaped += 1;
    }
  } catch (err) {
    logger.warn(`[MonitoringWorker] FINALIZING reaper error: ${err.message}`);
  }
  if (reaped > 0) logger.info(`[MonitoringWorker] FINALIZING reaper flagged ${reaped} lost segments as UPLOAD_FAILED`);
  return reaped;
}

// ── In-process poller (no Redis) ─────────────────────────────────────────────
const inProcessQueue = [];
const inFlight = new Set();
let pollerTimer = null;
let sweepTimer = null;

function enqueueInProcess({ jobId }) {
  if (!jobId || inFlight.has(jobId)) return;
  inProcessQueue.push(jobId);
  pump(undefined);
}

async function pump(io) {
  while (inProcessQueue.length > 0 && inFlight.size < monitoringConfig.WORKER_CONCURRENCY) {
    const jobId = inProcessQueue.shift();
    if (inFlight.has(jobId)) continue;
    inFlight.add(jobId);
    processSegmentJob(jobId, io)
      .catch((err) => logger.error(`[MonitoringWorker] In-process job ${jobId} crashed: ${err.message}`))
      .finally(() => {
        inFlight.delete(jobId);
        pump(io);
      });
  }
}

async function pollDb(io) {
  try {
    const capacity = Math.max(1, monitoringConfig.WORKER_CONCURRENCY - inFlight.size);
    const pending = await ProcessingJob.findAll({
      where: { status: 'QUEUED' },
      order: [['id', 'ASC']],
      limit: capacity,
    });
    for (const job of pending) {
      enqueueInProcess({ jobId: job.jobId });
    }
    await recoverStaleJobs(io);
  } catch (err) {
    logger.warn(`[MonitoringWorker] Poller iteration failed: ${err.message}`);
  }
}

// ── BullMQ worker ────────────────────────────────────────────────────────────
let bullWorker = null;

function startBullWorker(io) {
  const { Worker } = require('bullmq');
  const connection = getRedisClient();
  bullWorker = new Worker(
    'monitoring-video',
    async (bullJob) => {
      const { jobId } = bullJob.data || {};
      if (!jobId) return { processed: false, reason: 'NO_JOB_ID' };
      return processSegmentJob(jobId, io);
    },
    { connection, concurrency: monitoringConfig.WORKER_CONCURRENCY }
  );

  bullWorker.on('completed', (bullJob) => {
    logger.info(`[MonitoringWorker] BullMQ job ${bullJob.id} completed`);
  });
  bullWorker.on('failed', (bullJob, err) => {
    logger.error(`[MonitoringWorker] BullMQ job ${bullJob.id} failed: ${err.message}`);
  });
  bullWorker.on('error', (err) => {
    logger.warn(`[MonitoringWorker] BullMQ worker error: ${err.message}`);
  });
  logger.info(`[MonitoringWorker] BullMQ worker started (concurrency=${monitoringConfig.WORKER_CONCURRENCY})`);
}

/**
 * Start the worker. Returns a handle with stop().
 */
function startMonitoringWorker(io) {
  if (getRedisClient() && isRedisReady()) {
    try {
      startBullWorker(io);
    } catch (err) {
      logger.warn(`[MonitoringWorker] Could not start BullMQ worker, using DB poller: ${err.message}`);
      if (bullWorker) {
        bullWorker.close().catch(() => {});
        bullWorker = null;
      }
    }
  } else {
    logger.info('[MonitoringWorker] Redis not available — using in-process DB poller');
  }

  // Poller drives work when Redis is offline; harmless no-op with it online.
  // Always keep the recovery sweep running.
  if (!pollerTimer) {
    pollerTimer = setInterval(() => pollDb(io), Math.min(30_000, monitoringConfig.RECOVERY_INTERVAL_MS));
    pollerTimer.unref();
  }
  if (!sweepTimer) {
    sweepTimer = setInterval(() => {
      recoverStaleJobs(io).catch((err) => {
        logger.warn(`[MonitoringWorker] Sweep failed: ${err.message}`);
      });
    }, monitoringConfig.RECOVERY_INTERVAL_MS);
    sweepTimer.unref();
  }

  // One recovery pass at boot so crashed jobs resume fast
  recoverStaleJobs(io).catch(() => {});

  return {
    stop: async () => {
      if (pollerTimer) { clearInterval(pollerTimer); pollerTimer = null; }
      if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
      if (bullWorker) {
        await bullWorker.close().catch(() => {});
        bullWorker = null;
      }
    },
  };
}

module.exports = {
  processSegmentJob,
  recoverStaleJobs,
  enqueueInProcess,
  startMonitoringWorker,
};