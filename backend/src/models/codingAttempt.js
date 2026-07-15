const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingAttempt = sequelize.define('CodingAttempt', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  assessmentId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'assessment_id'
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id'
  },
  status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'disqualified'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'started_at'
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at'
  },
  timeTaken: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'time_taken',
    comment: 'Time taken in seconds'
  },
  violationCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'violation_count'
  }
}, {
  tableName: 'coding_attempts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingAttempt;
