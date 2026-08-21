const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * CourseTrainerAssignment
 * ───────────────────────
 * Many-to-many junction between courses and trainers.
 *
 * Today every course has a single primary trainer (Course.trainer_id) and this
 * table mirrors that — when admin assigns a trainer to a course we insert a
 * row here too. This positions us for future multi-trainer support without a
 * schema migration.
 */
const CourseTrainerAssignment = sequelize.define('CourseTrainerAssignment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  courseId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'course_id'
  },
  trainerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'trainer_id'
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'assigned_at'
  }
}, {
  tableName: 'course_trainer_assignments',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['course_id', 'trainer_id'] },
    { fields: ['trainer_id'] }
  ]
});

module.exports = CourseTrainerAssignment;
