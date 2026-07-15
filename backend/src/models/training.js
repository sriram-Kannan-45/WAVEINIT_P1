const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Training (Sequelize model name) — table renamed to `training_programs`
 * ──────────────────────────────────────────────────────────────────────
 * Represents a top-level training program owned by an admin. A program now
 * contains one or more Courses (see models/course.js); courses hold lessons,
 * quizzes, materials, and enrollments.
 *
 * Model name kept as `Training` to avoid breaking imports throughout existing
 * controllers/services. The actual DB table is `training_programs`.
 *
 * Legacy columns (start_date, end_date, capacity, trainer_id) are retained as
 * nullable so older training-scoped code continues to function during the
 * staged migration to the course-centric architecture. They will be dropped
 * in a follow-up cleanup migration once all routes are course-scoped.
 */
const Training = sequelize.define('Training', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  thumbnailUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'thumbnail_url'
  },
  // ── Legacy fields (deprecated — kept nullable for backward compat) ──
  trainerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'trainer_id'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  // ── New required field ──
  createdBy: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'created_by'
  },
  sequentialLearning: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'sequential_learning'
  }
}, {
  tableName: 'training_programs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Training;
