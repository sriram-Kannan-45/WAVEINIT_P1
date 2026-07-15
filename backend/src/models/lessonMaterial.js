const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * LessonMaterial
 * ──────────────
 * A single piece of learning content attached to a Lesson.
 *
 * Type-specific columns:
 *   NOTE  → content (rich-text HTML stored as TEXT)
 *   PDF   → file_url + file_name + file_size
 *   PPT   → file_url + file_name + file_size + thumbnail_url (1st slide preview)
 *   VIDEO → file_url (uploaded) OR link_url (external e.g. YouTube)
 *   IMAGE → file_url (single) — multi-image grids stored as multiple rows
 *   LINK  → link_url + content (description text)
 */
const LessonMaterial = sequelize.define('LessonMaterial', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  lessonId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'lesson_id'
  },
  materialType: {
    type: DataTypes.ENUM('NOTE', 'VIDEO', 'IMAGE', 'LINK', 'PDF', 'PPT', 'ATTACHMENT', 'LIVE_SESSION'),
    allowNull: false,
    field: 'material_type'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    // Rich-text HTML for NOTE; description text for LINK; null otherwise.
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  fileUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'file_url'
  },
  linkUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'link_url'
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'file_name'
  },
  fileSize: {
    // Bytes. INT goes up to ~2 GB which is enough given our 500 MB video cap.
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'file_size'
  },
  thumbnailUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'thumbnail_url'
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'order_index'
  }
}, {
  tableName: 'lesson_materials',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['lesson_id', 'order_index'] },
    { fields: ['material_type'] }
  ]
});

module.exports = LessonMaterial;
