/**
 * monitoringVideoService
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the recorded-video async monitoring pipeline:
 *   segment lifecycle (register/finalize/upload)
 *   job creation + enqueue on upload
 *   persistence of AI results into MonitoringEvent / ProctoringEvent rows
 *   per-session aggregation + authoritative final score (via getReport)
 *
 * The DB is the single source of truth; the queue (BullMQ, or the in-process
 * poller) only drives execution. Every write here is idempotent so retries
 * (client upload retries, worker re-claims, crash recovery) are safe.
 */

const fs = require('fs');
const { Op } = require('sequelize');
const {
  VideoSegment,
  ProcessingJob,
  MonitoringSession,
  MonitoringEvent,
  ProctoringEvent,
} = require('../models');
const logger = require('../utils/logger');
const monitoringConfig = require('../config/monitoringConfig');

// Severity label for a translated segment event
const SEVERITY_MAP = {
  GAZE_OFF_SCREEN_LEFT: 'WARNING',
  GAZE_OFF_SCREEN_RIGHT: 'WARNING',
  GAZE_OFF_SCREEN_UP: 'WARNING',
  HEAD_LOOKING_LEFT: 'WARNING',
  HEAD_LOOKING_RIGHT: 'WARNING',
  HEAD_LOOKING_UP: 'WARNING',
  PARTICIPANT_ABSENT: 'HIGH',
  MULTIPLE_FACES: 'HIGH',
};

const terminalSegmentStatuses = new Set([
  'COMPLETED', 'PROCESSING_FAILED', 'UPLOAD_FAILED',
]);

/**
 * Build the segment key (<sessionId>_seg_<sequence>). Shared shape for both
 * the frontend planner and the backend so they can never disagree.
 */
function buildSegmentKey(sessionId, segmentSequence) {
  return `${sessionId}_seg_${segmentSequence}`;
}

/**
 * findOrCreate a segment row (idempotent). Used by the frontend when it starts
 * a segment and by the backend when it finalizes one.
 */
async function registerSegment({
  sessionId,
  attemptId = null,
  participantId,
  contextType = 'QUIZ',
  segmentSequence = 1,
  startedAt = new Date(),
  durationSec = 0,
}) {
  const session = await MonitoringSession.findOne({ where: { sessionId } });
  if (!session) {
    throw new Error(`Monitoring session not found: ${sessionId}`);
  }
  if (!participantId) participantId = session.participantId;
  if (!attemptId) attemptId = session.attemptId;
  if (!contextType) contextType = session.contextType;

  const segmentKey = buildSegmentKey(sessionId, segmentSequence);
  const [segment] = await VideoSegment.findOrCreate({
    where: { segmentKey },
    defaults: {
      segmentKey,
      monitoringSessionId: sessionId,
      attemptId: attemptId || session.attemptId,
      participantId,
      contextType,
      segmentSequence,
      status: 'RECORDING',
      startedAt: new Date(startedAt),
      durationSec: Math.max(0, Number(durationSec) || 0),
    },
  });

  // Opt the session into the async pipeline
  if (session.monitoringStatus === 'NOT_ENABLED') {
    await session.update({ monitoringStatus: 'RECORDING' });
  }

  return segment;
}

/**
 * The client rotated / stopped a segment. Mark it FINALIZING if it is still
 * being recorded. Idempotent: never regresses a later status.
 */
async function finalizeSegment({ sessionId, segmentKey, endedAt = new Date(), durationSec = 0 }) {
  const segment = await VideoSegment.findOne({ where: { segmentKey } });
  if (!segment) {
    logger.warn(`[VideoService] finalizeSegment: unknown segment ${segmentKey}`);
    return null;
  }
  if (segment.monitoringSessionId !== sessionId) {
    throw new Error(`Segment ${segmentKey} does not belong to session ${sessionId}`);
  }
  if (!['RECORDING', 'UPLOAD_FAILED'].includes(segment.status)) {
    return segment; // already past the recordable stage
  }

  await segment.update({
    status: 'FINALIZING',
    endedAt: new Date(endedAt),
    durationSec: Math.max(0, Number(durationSec) || segment.durationSec || 0),
    finalizedAt: new Date(),
  });
  return segment;
}

/**
 * Record an uploaded segment file (idempotent by segmentKey + uploadKey).
 * Transitions RECORDING/FINALIZING/UPLOADING/UPLOAD_FAILED -> UPLOADED and,
 * once committed, creates + enqueues the ProcessingJob.
 */
async function handleSegmentUpload({
  sessionId,
  segmentKey,
  filePath,
  uploadKey = null,
  mimeType = null,
  size = 0,
}) {
  const segment = await VideoSegment.findOne({ where: { segmentKey } });
  if (!segment || segment.monitoringSessionId !== sessionId) {
    throw new Error(`Segment ${segmentKey} not found for session ${sessionId}`);
  }
  if (segment.status === 'COMPLETED') {
    return { segment, accepted: false, reason: 'ALREADY_COMPLETED' };
  }
  if (['UPLOADED', 'QUEUED', 'PROCESSING'].includes(segment.status)) {
    // Already in the pipeline. A retry after a lost response must not clobber
    // the existing row, but re-marking the upload attempt is harmless.
    if (uploadKey && segment.uploadKey && uploadKey === segment.uploadKey) {
      await segment.update({ uploadAttempts: segment.uploadAttempts + 1 });
    }
    return { segment, accepted: false, reason: 'ALREADY_UPLOADED' };
  }

  const stat = size > 0
    ? { size }
    : (fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 0 });

  await segment.update({
    status: 'UPLOADED',
    videoPath: filePath,
    mimeType,
    fileSize: stat.size || segment.fileSize || 0,
    uploadKey: uploadKey || segment.uploadKey,
    uploadAttempts: segment.uploadAttempts + 1,
    uploadedAt: new Date(),
    errorMessage: null,
  });

  await createProcessingJobAndEnqueue(segment);
  return { segment, accepted: true, reason: 'UPLOADED_AND_QUEUED' };
}

async function markSegmentUploadFailed({ segment, message }) {
  if (!segment) return;
  await segment.update({
    status: segment.uploadAttempts + 1 >= 4 ? 'UPLOAD_FAILED' : 'FINALIZING',
    errorMessage: String(message).slice(0, 1024),
  });
  await aggregateSession(segment.monitoringSessionId);
}

/**
 * findOrCreate the ProcessingJob for a segment and enqueue it. When a job
 * already reached a terminal state it is left untouched (dedupe).
 */
async function createProcessingJobAndEnqueue(segment) {
  const jobId = `msj_${segment.segmentKey}`;
  const [job] = await ProcessingJob.findOrCreate({
    where: { segmentId: segment.id },
    defaults: {
      jobId,
      segmentId: segment.id,
      segmentKey: segment.segmentKey,
      monitoringSessionId: segment.monitoringSessionId,
      attemptId: segment.attemptId,
      contextType: segment.contextType,
      status: 'QUEUED',
      maxAttempts: monitoringConfig.JOB_MAX_RETRIES + 1,
      videoPath: segment.videoPath,
      requestPayload: {
        sampleFps: monitoringConfig.SAMPLE_FPS,
        configuredDuration: Math.max(1, segment.durationSec || monitoringConfig.SEGMENT_DURATION_MIN * 60),
        thresholds: {
          noPersonMinFrames: Math.max(5, Math.round(monitoringConfig.SAMPLE_FPS * 1.0)),
          noPersonMinDurationSec: 1.0,
          multiplePersonMinFrames: Math.max(5, Math.round(monitoringConfig.SAMPLE_FPS * 1.0)),
          multiplePersonMinDurationSec: 1.0,
          faceNotVisibleMinFrames: Math.max(5, Math.round(monitoringConfig.SAMPLE_FPS * 1.0)),
          faceNotVisibleMinDurationSec: 1.0,
        },
      },
    },
  });

  if (job.status === 'COMPLETED' || job.status === 'DEAD_LETTERED') {
    return job;
  }

  if (segment.status === 'UPLOADED' || segment.status === 'RETRYING') {
    await segment.update({ status: 'QUEUED', queuedAt: new Date() });
  }
  await job.update({ status: 'QUEUED', videoPath: segment.videoPath, lastError: null });

  // Never await heavy processing inside a request handler: enqueue is detached.
  const { enqueueMonitoringJob } = require('../queues/monitoringJobQueue');
  enqueueMonitoringJob({ jobId: job.jobId }).catch((err) => {
    logger.error(`[VideoService] Failed to enqueue ${job.jobId}`, { error: err.message });
  });
  return job;
}

/**
 * Translate one AI result event into a MonitoringEvent (and mirrored
 * ProctoringEvent row). Only scored categories are materialized; read-only
 * aggregates (face_not_visible) stay inside segment.results.
 */
function buildMonitoringEvent({ segment, event }) {
  const { category, detector, direction, start, end, duration, confidence } = event;
  const startSec = Math.max(0, Number(start) || 0);
  const durationSec = Math.abs(Number(duration) ?? (end - start)) || 0;
  const startMs = Math.round(startSec * 1000);
  const durationMs = Math.max(1, Math.round(durationSec * 1000));

  let eventType = null;
  let severity = 'INFO';
  if (category === 'looking_away') {
    const dir = String(direction || 'LEFT').toUpperCase();
    const det = detector === 'head' ? 'HEAD' : 'EYE';
    eventType = det === 'HEAD'
      ? `HEAD_LOOKING_${dir}`
      : `GAZE_OFF_SCREEN_${dir}`;
    severity = SEVERITY_MAP[eventType] || 'WARNING';
  } else if (category === 'no_person') {
    eventType = 'PARTICIPANT_ABSENT';
    severity = SEVERITY_MAP[eventType] || 'HIGH';
  } else if (category === 'multiple_person') {
    eventType = 'MULTIPLE_FACES';
    severity = SEVERITY_MAP[eventType] || 'HIGH';
  } else {
    return null; // face_not_visible & phone stay in results, not scored events
  }

  const occurredAtMs = new Date(segment.startedAt).getTime() + startMs;
  const occurredAt = new Date(occurredAtMs);
  const violationEnd = new Date(occurredAtMs + durationMs);

  return {
    monitoringSessionId: segment.monitoringSessionId,
    attemptId: segment.attemptId,
    participantId: segment.participantId,
    contextType: segment.contextType,
    segmentId: segment.id,
    source: 'LAPTOP',
    eventType,
    severity,
    scoreDelta: 0,
    durationMs,
    occurredAt,
    confidence: Math.max(0.3, Math.min(1.0, Number(confidence) ?? 1.0)),
    metadata: {
      direction,
      segmentKey: segment.segmentKey,
      segmentSequence: segment.segmentSequence,
      sourceVideoDurationSec: segment.durationSec,
      violationStartTime: occurredAt.toISOString(),
      violationEndTime: violationEnd.toISOString(),
      source: 'MONITORING_SEGMENT',
    },
    idempotencyKey: `seg_${segment.segmentKey}_${eventType}_${startMs}`,
  };
}

async function persistSegmentResults(segment, aiResult) {
  const events = Array.isArray(aiResult?.events) ? aiResult.events : [];
  let createdEvents = 0;

  for (const ev of events) {
    const mapping = buildMonitoringEvent({ segment, event: ev });
    if (!mapping) continue;
    try {
      const [, wasCreated] = await MonitoringEvent.findOrCreate({
        where: { idempotencyKey: mapping.idempotencyKey },
        defaults: mapping,
      });
      if (wasCreated) {
        createdEvents += 1;
        try {
          await ProctoringEvent.findOrCreate({
            where: { idempotencyKey: mapping.idempotencyKey },
            defaults: {
              monitoringSessionId: mapping.monitoringSessionId,
              attemptId: mapping.attemptId,
              participantId: mapping.participantId,
              quizId: null,
              eventType: mapping.eventType,
              severity: mapping.severity,
              confidence: mapping.confidence,
              duration: Math.round(mapping.durationMs / 100) / 10,
              timestamp: mapping.occurredAt,
              metadata: mapping.metadata,
              idempotencyKey: mapping.idempotencyKey,
            },
          });
        } catch (crossErr) {
          logger.warn(`[VideoService] ProctoringEvent mirror failed for ${mapping.idempotencyKey}: ${crossErr.message}`);
        }
      }
    } catch (err) {
      logger.warn(`[VideoService] findOrCreate failed for ${mapping.idempotencyKey}: ${err.message}`);
    }
  }

  const { results } = segment;
  const mergedResults = {
    ...(results || {}),
    ...(aiResult || {}),
    events, // keep raw AI events readable by trainer review
    eventSource: 'AI_SERVICE',
  };
  await segment.update({ results: mergedResults, errorMessage: null });
  logger.info(
    `[VideoService] Persisted ${createdEvents}/${events.length} events for segment ${segment.segmentKey}`
  );
  return { createdEvents, totalEvents: events.length };
}

/**
 * Session-level aggregation. Recomputes counts + status and refreshes the
 * authoritative final score by re-running the report engine (which merges
 * live + segment events). Cheap enough to run after every segment completes.
 */
async function aggregateSession(sessionId) {
  const session = await MonitoringSession.findOne({ where: { sessionId } });
  if (!session) return null;

  const [segments, failedCount] = await Promise.all([
    VideoSegment.findAll({
      where: { monitoringSessionId: sessionId },
      attributes: ['status'],
    }),
    VideoSegment.count({
      where: {
        monitoringSessionId: sessionId,
        status: { [Op.in]: ['PROCESSING_FAILED', 'UPLOAD_FAILED'] },
      },
    }),
  ]);

  const totalSegments = segments.length;
  const completedSegments = segments.filter((s) => s.status === 'COMPLETED').length;
  const failedSegments = failedCount;

  let monitoringStatus;
  if (totalSegments === 0) {
    monitoringStatus = session.monitoringStatus === 'NOT_ENABLED' ? 'NOT_ENABLED' : 'RECORDING';
  } else if (completedSegments === totalSegments) {
    monitoringStatus = 'COMPLETED';
  } else if (failedSegments > 0 && completedSegments >= 0) {
    monitoringStatus = failedSegments === totalSegments ? 'FAILED' : 'PARTIAL';
  } else if (session.status === 'COMPLETED' || session.status === 'ABORTED' || session.endedAt) {
    monitoringStatus = 'WAITING_FOR_PROCESSING';
  } else {
    monitoringStatus = 'RECORDING';
  }

  const updateData = { totalSegments, completedSegments, failedSegments, monitoringStatus };
  if (monitoringStatus === 'COMPLETED') {
    updateData.monitoringCompletedAt = new Date();
  }

  try {
    const monitoringService = require('./monitoringService');
    const report = await monitoringService.getReport({ sessionId, attemptId: session.attemptId });
    const finalScore = Number(report?.session?.score);
    if (Number.isFinite(finalScore)) {
      updateData.monitoringFinalScore = Math.max(0, Math.min(100, finalScore));
    }
  } catch (err) {
    logger.warn(`[VideoService] aggregateSession score refresh failed for ${sessionId}: ${err.message}`);
  }

  await session.update(updateData);
  return session;
}

async function listSegments(sessionId) {
  return VideoSegment.findAll({
    where: { monitoringSessionId: sessionId },
    order: [['segment_sequence', 'ASC']],
  });
}

async function getJobForSegment(segmentKey) {
  return ProcessingJob.findOne({ where: { segmentKey } });
}

module.exports = {
  buildSegmentKey,
  registerSegment,
  finalizeSegment,
  handleSegmentUpload,
  markSegmentUploadFailed,
  createProcessingJobAndEnqueue,
  persistSegmentResults,
  aggregateSession,
  listSegments,
  getJobForSegment,
  buildMonitoringEvent,
};