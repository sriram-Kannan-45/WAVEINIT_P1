/**
 * ExamSession — single source of truth for one proctored attempt.
 *
 * Lifecycle: PENDING -> ACTIVE -> (SUBMITTED | TERMINATED | EXPIRED)
 *
 * Notes:
 *  - One session per (participant, quiz). Re-entry is handled by reusing
 *    the active session if status is ACTIVE and not expired.
 *  - `sessionToken` is a cryptographic handle the client must echo back on
 *    every proctoring action; validated server-side.
 *  - `encryptedPayload` stores AES-encrypted blob (e.g. seat-info, answers
 *    snapshot) — keeps PII / answers opaque at rest.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ExamSession = sequelize.define('ExamSession', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  assessmentType: {
    type: DataTypes.ENUM('quiz', 'coding'),
    allowNull: false,
    defaultValue: 'quiz',
    field: 'assessment_type',
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'quiz_id',
  },
  assessmentId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'assessment_id',
  },
  attemptId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'attempt_id',
    comment: 'Linked QuizAttempt.id (null for coding)',
  },
  codingAttemptId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'coding_attempt_id',
    comment: 'Linked CodingAttempt.id (null for quiz)',
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id',
  },
  sessionToken: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    field: 'session_token',
  },
  deviceFingerprintId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'device_fingerprint_id',
  },
  status: {
    type: DataTypes.ENUM(
      'PENDING',
      'ACTIVE',
      'SUBMITTED',
      'TERMINATED',
      'EXPIRED',
    ),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  warningsCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'warnings_count',
  },
  fullscreenExits: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'fullscreen_exits',
  },
  isFullscreen: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_fullscreen',
  },
  isScreenSharing: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_screen_sharing',
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_online',
  },
  ipAddress: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'ip_address',
  },
  userAgent: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'user_agent',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at',
  },
  endsAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ends_at',
    comment: 'Absolute deadline for synced timer',
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ended_at',
  },
  terminationReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'termination_reason',
  },
  encryptedPayload: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'encrypted_payload',
  },
  lastHeartbeatAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_heartbeat_at'
  },
  disconnectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'disconnected_at'
  },
  gracePeriodEndsAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'grace_period_ends_at'
  },
  proctoringLevel: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
    allowNull: false,
    defaultValue: 'MEDIUM',
    field: 'proctoring_level'
  },
  gracePeriodMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
    field: 'grace_period_minutes'
  },
}, {
  tableName: 'exam_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['participant_id'] },
    { fields: ['quiz_id'] },
    { fields: ['assessment_id'] },
    { fields: ['status'] },
  ],
});

module.exports = ExamSession;
