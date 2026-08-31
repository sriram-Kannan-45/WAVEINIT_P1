const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Lesson
 * ──────
 * Course-scoped after the restructure. The `course_id` column is the new
 * canonical link; `training_id` is retained as nullable for backward
 * compatibility with any code still on the old training-centric paths and
 * will be dropped once all routes are migrated.
 *
 * The `content` field (rich-text summary/intro shown above the materials list)
 * is kept; per-material content lives in the new `lesson_materials` table.
 */
const Lesson = sequelize.define('Lesson', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  courseId: {
    type: DataTypes.BIGINT,
    // Nullable while legacy training-scoped lessons exist; new lessons must
    // always set this. Backend route validation enforces presence.
    allowNull: true,
    field: 'course_id'
  },
  trainingId: {
    // Deprecated — kept nullable for backward compat.
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
  content: {
    // Optional rich-text summary shown at the top of the lesson before
    // materials. Per-material content (notes, files, links) is in
    // lesson_materials. Kept for legacy lesson rendering paths.
    type: DataTypes.TEXT,
    allowNull: true
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'order_index'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'PENDING'
  }
}, {
  tableName: 'lessons',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
  // Indexes on the new course_id column are added by
  // bootstrapCourseSchema.js after the column itself is created. Defining
  // them here would race the global sync (alter:false still adds indexes)
  // before the per-model sync({alter:true}) has had a chance to add the
  // column.
});

module.exports = Lesson;
