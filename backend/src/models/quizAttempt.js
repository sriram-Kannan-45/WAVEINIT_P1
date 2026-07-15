const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizAttempt = sequelize.define('QuizAttempt', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'quiz_id'
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id'
  },
  status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'disqualified_copy_violation', 'disqualified_policy_violation'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS'
  },
  violationCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'violation_count'
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
  }
}, {
  tableName: 'quiz_attempts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['participant_id', 'quiz_id']
    }
  ]
});

module.exports = QuizAttempt;
