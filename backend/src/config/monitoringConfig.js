/**
 * monitoringConfig
 * ─────────────────────────────────────────────────────────────────────────────
 * Central configuration for the recorded-video async monitoring pipeline.
 * Every knob is overridable via environment variables so deployments can tune
 * segment length, sampling, worker concurrency, and recovery cadence.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const SEGMENT_DURATION_MIN = Math.max(1, Number(process.env.MONITORING_SEGMENT_DURATION_MIN) || 30);
const SAMPLE_FPS = Math.max(1, Math.min(10, Number(process.env.MONITORING_SAMPLE_FPS) || 3));
const WORKER_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.MONITORING_WORKER_CONCURRENCY) || 2));
const JOB_MAX_RETRIES = Math.max(0, Number(process.env.MONITORING_JOB_MAX_RETRIES) || 3);
const JOB_LOCK_TIMEOUT_MS = Math.max(60_000, Number(process.env.MONITORING_JOB_LOCK_TIMEOUT_MS) || (45 * 60 * 1000));
const RECOVERY_INTERVAL_MS = Math.max(10_000, Number(process.env.MONITORING_RECOVERY_INTERVAL_MS) || 60_000);
// Grace period before a FINALIZING segment with no upload is marked
// UPLOAD_FAILED (covers crashed tabs / lost media).
const FINALIZING_GRACE_MS = Math.max(60_000, Number(process.env.MONITORING_FINALIZING_GRACE_MS) || (15 * 60 * 1000));
const VIDEO_STORAGE_ENABLED = process.env.MONITORING_VIDEO_STORAGE === 'true';
const UPLOAD_MAX_FILE_SIZE = Number(process.env.MONITORING_UPLOAD_MAX_MB || 500) * 1024 * 1024;

module.exports = {
  AI_SERVICE_URL,
  SEGMENT_DURATION_MIN,
  SAMPLE_FPS,
  WORKER_CONCURRENCY,
  JOB_MAX_RETRIES,
  JOB_LOCK_TIMEOUT_MS,
  RECOVERY_INTERVAL_MS,
  FINALIZING_GRACE_MS,
  VIDEO_STORAGE_ENABLED,
  UPLOAD_MAX_FILE_SIZE,
};