const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * ParticipantTracking
 * ───────────────────
 * Tracks study time, video completion percentage, login/logout, and last activity per participant.
 */
const ParticipantTracking = sequelize.define('ParticipantTracking', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'user_id'
  },
  lessonId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'lesson_id'
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'training_id'
  },
  videoCompletionPercent: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    field: 'video_completion_percent'
  },
  studyTimeSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'study_time_seconds'
  },
  loginTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'login_time'
  },
  logoutTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'logout_time'
  },
  lastActivity: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'last_activity'
  }
}, {
  tableName: 'participant_trackings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['lesson_id'] },
    { fields: ['training_id'] }
  ]
});

module.exports = ParticipantTracking;
