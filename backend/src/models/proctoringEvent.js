const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProctoringEvent = sequelize.define('ProctoringEvent', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  monitoringSessionId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    field: 'monitoring_session_id',
    comment: 'Associated session_id string'
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'attempt_id',
    comment: 'Associated QuizAttempt.id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id',
    comment: 'Participant User.id'
  },
  quizId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'quiz_id',
    comment: 'AIQuiz.id or null for coding assessment'
  },
  eventType: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'event_type',
    comment: 'Standard event name e.g. HEAD_TURNED_LEFT, EYES_LOOKING_RIGHT'
  },
  severity: {
    type: DataTypes.ENUM('INFO', 'WARNING', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'INFO',
    field: 'severity'
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 1.0,
    field: 'confidence'
  },
  duration: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
    field: 'duration',
    comment: 'Duration in seconds'
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'timestamp'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'metadata',
    comment: 'Detailed metrics e.g. yaw, pitch, roll, gaze_direction'
  },
  idempotencyKey: {
    type: DataTypes.STRING(128),
    allowNull: true,
    unique: true,
    field: 'idempotency_key',
    comment: 'Prevents duplicate event insertion during retries'
  }
}, {
  tableName: 'proctoring_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['monitoring_session_id'] },
    { fields: ['attempt_id'] },
    { fields: ['participant_id'] },
    { fields: ['quiz_id'] },
    { fields: ['event_type'] },
    { fields: ['severity'] },
    { fields: ['idempotency_key'], unique: true }
  ]
});

module.exports = ProctoringEvent;
