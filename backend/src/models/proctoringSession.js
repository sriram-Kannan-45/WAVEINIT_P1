const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProctoringSession = sequelize.define('ProctoringSession', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    field: 'session_id',
    comment: 'Unique identifier for monitoring session (UUID/string)'
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
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'started_at'
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ended_at'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'TERMINATED', 'FAILED'),
    allowNull: false,
    defaultValue: 'ACTIVE'
  },
  finalRiskScore: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
    field: 'final_risk_score'
  },
  finalRiskLevel: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'LOW',
    field: 'final_risk_level'
  },
  totalEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_events'
  },
  warningEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'warning_events'
  },
  highEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'high_events'
  },
  criticalEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'critical_events'
  }
}, {
  tableName: 'proctoring_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'], unique: true },
    { fields: ['attempt_id'] },
    { fields: ['participant_id'] },
    { fields: ['quiz_id'] },
    { fields: ['status'] }
  ]
});

module.exports = ProctoringSession;
