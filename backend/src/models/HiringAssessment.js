const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const HiringAssessment = sequelize.define('HiringAssessment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  assessment_type: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'QUIZ',
    validate: { isIn: [['QUIZ', 'CODING']] },
    comment: 'Selects the existing shared assessment engine used by this hiring workflow.',
  },
  quiz_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'ai_quizzes', key: 'id' },
    onDelete: 'SET NULL',
  },
  coding_assessment_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'coding_assessments', key: 'id' },
    onDelete: 'SET NULL',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  instructions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
  },
  passing_score: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 50,
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  timezone: {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: 'UTC',
  },
  shuffle_questions: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  allow_retake: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  max_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  show_result_immediately: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  proctoring_config: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Hire-only policy layered on the shared monitoring, QR and report engines.',
  },
  status: {
    type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EVALUATED', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'DRAFT',
  },
  total_marks: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  question_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  published_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'hiring_assessments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['status'] },
    { fields: ['created_by'] },
    { fields: ['published_by'] },
  ],
});

module.exports = HiringAssessment;
