const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingAssessment = sequelize.define('CodingAssessment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  courseId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'course_id'
  },
  trainingId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id'
  },
  trainerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'trainer_id'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  timeLimit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 120,
    field: 'time_limit'
  },
  numProblems: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'num_problems'
  },
  languages: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: ['javascript']
  },
  difficulty: {
    type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD', 'MIXED'),
    allowNull: false,
    defaultValue: 'MIXED'
  },
  status: {
    type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED'),
    allowNull: false,
    defaultValue: 'DRAFT'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_time'
  },
  totalMarks: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_marks'
  },
  allowMultipleAttempts: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'allow_multiple_attempts'
  },
  maxAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'max_attempts'
  },
  showResultImmediately: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'show_result_immediately'
  },
  resultStatus: {
    type: DataTypes.ENUM('HIDDEN', 'PUBLISHED'),
    allowNull: false,
    defaultValue: 'HIDDEN',
    field: 'result_status'
  },
  proctoringEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'proctoring_enabled'
  },
  proctoringLevel: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
    allowNull: false,
    defaultValue: 'MEDIUM',
    field: 'proctoring_level'
  },
  gracePeriodMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
    field: 'grace_period_minutes'
  },
  maxCopyWarnings: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    field: 'max_copy_warnings'
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at'
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'closed_at'
  },
  resultPublishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'result_published_at'
  },
  aiHelpLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: -1,
    field: 'ai_help_limit',
    comment: 'Legacy column retained for compatibility; coding mentor usage is unlimited.'
  },
  aiAssistantEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'ai_assistant_enabled'
  },
  aiUnlockThresholds: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'ai_unlock_thresholds',
    comment: 'Legacy column retained for compatibility; coding mentor no longer uses unlock thresholds.'
  },
  originalPrompt: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'original_prompt',
    comment: 'The exact trainer prompt used to AI-generate this assessment.'
  },
  analyzedIntent: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'analyzed_intent',
    comment: 'Structured intent analysis captured at generation time (primary task, subtopics, IO, forbidden concepts).'
  },
  generationVersion: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'generation_version',
    comment: 'Version/name of the generation pipeline (e.g. langgraph-workflow-v1).'
  },
  validationResult: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'validation_result',
    comment: 'Per-problem AI validation summary at generation time.'
  }
}, {
  tableName: 'coding_assessments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingAssessment;
