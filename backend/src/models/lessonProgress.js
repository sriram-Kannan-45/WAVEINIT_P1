const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const LessonProgress = sequelize.define('LessonProgress', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  lessonId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'lesson_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  contentViewed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'content_viewed'
  },
  status: {
    type: DataTypes.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'NOT_STARTED'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  }
}, {
  tableName: 'lesson_progress',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['lesson_id', 'participant_id'] }]
});

module.exports = LessonProgress;
