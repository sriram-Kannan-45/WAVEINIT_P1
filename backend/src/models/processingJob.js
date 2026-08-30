const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * ProcessingJob
 * ─────────────────────────────────────────────────────────────────────────────
 * Background job record that moves an uploaded VideoSegment through the async
 * AI pipeline. Every queued segment gets exactly one ProcessingJob; the worker
 * claims rows (workerId + lock), re-queues on failure, and a recovery sweep
 * re-claims jobs whose lock expired (crash recovery).
 */
const ProcessingJob = sequelize.define('ProcessingJob', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  jobId: {
    type: DataTypes.STRING(191),
    allowNull: false,
    unique: true,
    field: 'job_id',
    comment: 'Unique job id, derived from the segment: msj_<segmentKey>',
  },
  segmentId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'segment_id',
  },
  segmentKey: {
    type: DataTypes.STRING(191),
    allowNull: false,
    unique: true,
    field: 'segment_key',
    comment: 'One-to-one with the owning video_segments.segment_key',
  },
  monitoringSessionId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    field: 'monitoring_session_id',
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'attempt_id',
  },
  contextType: {
    type: DataTypes.ENUM('QUIZ', 'CODING', 'INTERVIEW'),
    allowNull: false,
    defaultValue: 'QUIZ',
    field: 'context_type',
  },
  status: {
    type: DataTypes.ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTERED'),
    allowNull: false,
    defaultValue: 'QUEUED',
    field: 'status',
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'attempts',
  },
  maxAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    field: 'max_attempts',
  },
  workerId: {
    type: DataTypes.STRING(128),
    allowNull: true,
    field: 'worker_id',
    comment: 'Worker that currently holds this job (processing lock)',
  },
  lockExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lock_expires_at',
    comment: 'When the worker lock expires; recovery sweep re-claims afterwards',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at',
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at',
  },
  lastError: {
    type: DataTypes.STRING(1024),
    allowNull: true,
    field: 'last_error',
  },
  videoPath: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'video_path',
    comment: 'Local path the worker reads (the uploaded segment file)',
  },
  requestPayload: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'request_payload',
    comment: 'AI-service request config: sample_fps, thresholds, configured_duration',
  },
}, {
  tableName: 'processing_jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['job_id'], unique: true },
    { fields: ['segment_key'], unique: true },
    { fields: ['monitoring_session_id'] },
    { fields: ['attempt_id'] },
    { fields: ['status'] },
    { fields: ['worker_id'] },
  ],
});

module.exports = ProcessingJob;