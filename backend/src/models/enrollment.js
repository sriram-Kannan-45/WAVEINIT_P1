const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Enrollment
 * ──────────
 * Course-scoped after the restructure: a participant enrolls in a Course
 * (course_id), not in a TrainingProgram. The legacy training_id column is
 * kept nullable so older training-scoped enrollment paths continue to read.
 *
 * progress_percent is recomputed by the lesson-completion logic whenever a
 * participant views a lesson, completes a mandatory quiz, or submits a
 * mandatory assessment.
 *
 * The status enum still includes COMPLETED for backward compatibility with
 * the existing enrollmentController; new course-centric flows treat
 * progress_percent as the canonical completion signal and only flip status
 * between ENROLLED and CANCELLED.
 */
const Enrollment = sequelize.define('Enrollment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  courseId: {
    type: DataTypes.BIGINT,
    // Nullable while legacy training-only enrollments exist.
    allowNull: true,
    field: 'course_id'
  },
  trainingId: {
    // Deprecated — kept nullable for backward compat.
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id'
  },
  status: {
    // COMPLETED retained for legacy callers; canonical progress lives in
    // progress_percent. New flows only set ENROLLED / CANCELLED.
    type: DataTypes.ENUM('PENDING', 'ENROLLED', 'COMPLETED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  progressPercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'progress_percent'
  }
}, {
  tableName: 'enrollments',
  timestamps: true,
  createdAt: 'enrolled_at',
  updatedAt: 'updated_at'
  // The (course_id, participant_id) unique index is added by
  // bootstrapCourseSchema.js after the column is created. See lesson.js for
  // the same workaround.
});

module.exports = Enrollment;
