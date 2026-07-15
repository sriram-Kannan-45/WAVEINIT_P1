const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AIQuiz = sequelize.define('AIQuiz', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  courseId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'course_id'
  },
  lessonId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'lesson_id'
  },
  resultStatus: {
    type: DataTypes.ENUM('HIDDEN', 'PUBLISHED'),
    allowNull: false,
    defaultValue: 'HIDDEN',
    field: 'result_status'
  },
  isMandatory: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_mandatory'
  },
  documentId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'document_id'
  },
  trainerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'trainer_id'
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'training_id'
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
    defaultValue: 30,
    field: 'time_limit'
  },
  numQuestions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'num_questions'
  },
  difficulty: {
    type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD', 'MIXED'),
    allowNull: false,
    defaultValue: 'MIXED'
  },
  // ── Lifecycle status ──
  status: {
    type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED'),
    allowNull: false,
    defaultValue: 'DRAFT'
  },
  // ── Time window ──
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
  // ── Marks / scoring ──
  totalMarks: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_marks'
  },
  // ── Attempt settings ──
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
  showCorrectAnswersOnResult: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'show_correct_answers_on_result'
  },
  shuffleQuestions: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'shuffle_questions'
  },
  // ── Timestamps for lifecycle events ──
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
  // ── Legacy booleans (kept for backward compatibility, driven by status) ──
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'quiz_id'
  },
  questionCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'question_count'
  },
  createdBy: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'created_by'
  },
  published: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'published'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  isPublished: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_published'
  },
  isResultPublished: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_result_published'
  },
  copyProtectionEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'copy_protection_enabled'
  },
  maxCopyWarnings: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    field: 'max_copy_warnings'
  },
  copyViolationActions: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'copy_violation_actions'
  },
  copyWarningMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'copy_warning_message'
  },
  copyDisqualifyAction: {
    type: DataTypes.ENUM('LOCK', 'AUTO_SUBMIT'),
    allowNull: false,
    defaultValue: 'AUTO_SUBMIT',
    field: 'copy_disqualify_action'
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
  proctoringEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'proctoring_enabled'
  }
}, {
  tableName: 'ai_quizzes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = AIQuiz;
