const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingResult = sequelize.define('CodingResult', {
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
  problemsSolved: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'problems_solved'
  },
  totalProblems: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_problems'
  },
  totalTestCases: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_test_cases'
  },
  passedTestCases: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'passed_test_cases'
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
  tableName: 'coding_results',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingResult;
