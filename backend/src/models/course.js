const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Course
 * ──────
 * A unit of learning under a TrainingProgram, owned by one trainer.
 * Lessons, quizzes, materials, and enrollments are all scoped to a Course.
 *
 * Created as part of the course-centric restructure (see TRAINER_COURSE_PROMPT
 * Section 1). Replaces the old flat Training-as-course concept; the Training
 * model is now repurposed as TrainingProgram (table renamed to
 * `training_programs`).
 */
const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  trainingProgramId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'training_program_id'
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
  status: {
    type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED'),
    allowNull: false,
    defaultValue: 'DRAFT'
  },
  thumbnailUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'thumbnail_url'
  }
}, {
  tableName: 'courses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['training_program_id'] },
    { fields: ['trainer_id'] },
    { fields: ['status'] }
  ]
});

module.exports = Course;
