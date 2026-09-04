const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingResult = sequelize.define('CodingResult', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    field: 'attempt_id'
  },
  assessmentId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'assessment_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
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
  aiUsed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'ai_used',
    comment: 'Whether AI assistance was used during the assessment'
  },
  aiInteractionCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ai_interaction_count',
    comment: 'Total number of AI interactions across all questions'
  },
  aiUsageDetails: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'ai_usage_details',
    comment: 'Detailed AI usage breakdown per question: { problemId: { used: boolean, interactions: number, firstUsed: timestamp, lastUsed: timestamp } }'
  },
  aiUsageLevel: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'ai_usage_level',
    comment: 'AI usage level category: NONE, LIGHT, MODERATE, HIGH'
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
    type: DataTypes.BIGINT,
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
