const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizResult = sequelize.define('QuizResult', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  attemptId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    unique: true,
    field: 'attempt_id'
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
  totalScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_score'
  },
  maxScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    field: 'max_score'
  },
  percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  evaluatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'evaluated_at'
  },
  resultPublished: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'result_published'
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at'
  },
  publishedBy: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'published_by'
  }
}, {
  tableName: 'quiz_results',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = QuizResult;
