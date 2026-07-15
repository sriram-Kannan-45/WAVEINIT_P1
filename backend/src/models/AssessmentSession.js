/**
 * AssessmentSession
 * ─────────────────────────────────────────────────────────────────────────
 * One row per active proctored quiz attempt. Locks an attempt to a single
 * (participant, device, IP) tuple so the participant can't fork the same
 * attempt across multiple browsers / machines.
 *
 * Status lifecycle:
 *   ACTIVE  → just created, valid until expires_at
 *   EXPIRED → swept by jobs/expireAssessmentSessions on a 5-min interval
 *   RESET   → admin manually freed the session via /admin/reset-session/:id
 *
 * Companion: src/middleware/validateAssessmentSession.js (validates the
 * session_token sent by the client on each protected request).
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AssessmentSession = sequelize.define(
  'AssessmentSession',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    attemptId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      unique: true,
      field: 'attempt_id',
      comment: 'Quiz attempt FK (null for coding)',
    },
    codingAttemptId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      unique: true,
      field: 'coding_attempt_id',
      comment: 'Coding attempt FK (null for quiz)',
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
    assessmentType: {
      type: DataTypes.ENUM('quiz', 'coding'),
      allowNull: false,
      defaultValue: 'quiz',
      field: 'assessment_type',
    },
    participantId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: 'participant_id',
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'ip_address',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent',
    },
    deviceFingerprint: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'device_fingerprint',
    },
    sessionToken: {
      type: DataTypes.STRING(512),
      allowNull: false,
      field: 'session_token',
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'RESET'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    lockedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'locked_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    resetByAdmin: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      field: 'reset_by_admin',
    },
    resetAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reset_at',
    },
  },
  {
    tableName: 'assessment_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['participant_id', 'quiz_id', 'status'] },
      { fields: ['participant_id', 'assessment_id', 'status'] },
      { fields: ['session_token'] },
      { fields: ['expires_at'] },
    ],
  }
);

module.exports = AssessmentSession;
