const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MonitorAttempt = sequelize.define('MonitorAttempt', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  testId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'test_id',
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id',
  },
  sessionId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'session_id',
  },
  status: {
    type: DataTypes.ENUM('in_progress', 'submitted', 'disqualified', 'flagged'),
    allowNull: false,
    defaultValue: 'in_progress',
    field: 'status',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at',
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at',
  },
  endsAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ends_at',
  },
  duration: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    field: 'duration',
  },
  answers: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'answers',
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'score',
  },
  autoSubmitted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_submitted',
  },
  lateSubmission: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'late_submission',
  },
  flagged: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'flagged',
  },
  disqualificationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'disqualification_reason',
  },
}, {
  tableName: 'monitor_attempts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['test_id'] },
    { fields: ['participant_id'] },
    { fields: ['session_id'] },
    { fields: ['status'] },
    { fields: ['ends_at'] },
  ],
});

module.exports = MonitorAttempt;
