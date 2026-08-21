const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProctoringReport = sequelize.define('ProctoringReport', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    field: 'attempt_id',
    comment: 'Associated QuizAttempt.id'
  },
  monitoringSessionId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    field: 'monitoring_session_id',
    comment: 'Associated session_id string'
  },
  status: {
    type: DataTypes.ENUM('GENERATING', 'COMPLETED', 'GENERATION_FAILED'),
    allowNull: false,
    defaultValue: 'GENERATING',
    field: 'status'
  },
  riskScore: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
    field: 'risk_score'
  },
  riskLevel: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'LOW',
    field: 'risk_level'
  },
  summary: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'summary',
    comment: 'Category breakdown (face, eyes, head, body, person, objects, browser, camera)'
  },
  timeline: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'timeline',
    comment: 'Important event timeline array'
  },
  generatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'generated_at'
  }
}, {
  tableName: 'proctoring_reports',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['attempt_id'], unique: true },
    { fields: ['monitoring_session_id'] },
    { fields: ['status'] },
    { fields: ['risk_level'] }
  ]
});

module.exports = ProctoringReport;
