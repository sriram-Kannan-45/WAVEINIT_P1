const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * VideoSegment
 * ─────────────────────────────────────────────────────────────────────────────
 * One recorded webcam segment of a monitoring session (default ~30 minutes).
 * Owns the full lifecycle of the artifact and its async AI processing:
 *   RECORDING -> FINALIZING -> UPLOADING -> UPLOADED -> QUEUED
 *   -> PROCESSING -> COMPLETED
 * plus failure states UPLOAD_FAILED, PROCESSING_FAILED, RETRYING.
 *
 * Recording on the browser is zero-gap (the next segment starts immediately),
 * and upload/pipeline work is fully decoupled from recording.
 */
const VideoSegment = sequelize.define('VideoSegment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  segmentKey: {
    type: DataTypes.STRING(191),
    allowNull: false,
    field: 'segment_key',
    comment: 'Unique idempotency key for this segment: <sessionId>_seg_<sequence>',
  },
  monitoringSessionId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    field: 'monitoring_session_id',
    comment: 'Associated MonitoringSession.sessionId',
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'attempt_id',
    comment: 'Associated QuizAttempt.id, CodingAttempt.id, or Interview.id',
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id',
    comment: 'Participant User.id',
  },
  contextType: {
    type: DataTypes.ENUM('QUIZ', 'CODING', 'INTERVIEW'),
    allowNull: false,
    defaultValue: 'QUIZ',
    field: 'context_type',
  },
  segmentSequence: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'segment_sequence',
    comment: 'Order within the session (1-based). Rotation increment on each new segment.',
  },
  status: {
    type: DataTypes.ENUM(
      'RECORDING',
      'FINALIZING',
      'UPLOADING',
      'UPLOADED',
      'QUEUED',
      'PROCESSING',
      'COMPLETED',
      'UPLOAD_FAILED',
      'PROCESSING_FAILED',
      'RETRYING'
    ),
    allowNull: false,
    defaultValue: 'RECORDING',
    field: 'status',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'started_at',
    comment: 'Wall-clock time recording of this segment began',
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ended_at',
    comment: 'Wall-clock time this segment was finalized (rotated)',
  },
  durationSec: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'duration_sec',
    comment: 'Recorded media duration in seconds',
  },
  videoPath: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'video_path',
    comment: 'Stored relative path/URL of the uploaded segment file',
  },
  mimeType: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'mime_type',
  },
  fileSize: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'file_size',
  },
  uploadKey: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'upload_key',
    comment: 'Client-generated idempotency token for retry-safe uploads',
  },
  uploadAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'upload_attempts',
  },
  processingRetries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'processing_retries',
  },
  finalizedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'finalized_at',
  },
  uploadedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'uploaded_at',
  },
  queuedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'queued_at',
  },
  processingStartedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'processing_started_at',
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'processed_at',
  },
  results: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'results',
    comment: 'Aggregated per-segment AI results (events, violations, score inputs)',
  },
  errorMessage: {
    type: DataTypes.STRING(1024),
    allowNull: true,
    field: 'error_message',
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'metadata',
    comment: 'Sample FPS, resolution, encoder, rotation reason, etc.',
  },
}, {
  tableName: 'video_segments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['segment_key'], unique: true },
    { fields: ['monitoring_session_id'] },
    { fields: ['attempt_id'] },
    { fields: ['participant_id'] },
    { fields: ['status'] },
    { fields: ['monitoring_session_id', 'segment_sequence'], unique: true },
  ],
});

module.exports = VideoSegment;