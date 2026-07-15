const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizCopyViolation = sequelize.define('QuizCopyViolation', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  attemptId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'attempt_id',
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'quiz_id',
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id',
  },
  type: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  weight: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 1.0,
  },
  questionNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'question_number',
  },
  userAgent: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'user_agent',
  },
  occurredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'occurred_at',
  },
}, {
  tableName: 'quiz_copy_violations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = QuizCopyViolation;
