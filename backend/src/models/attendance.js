const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Attendance Model
 * Tracks exactly when a user joins and leaves a live session.
 */
const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'user_id'
  },
  sessionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'session_id'
  },
  joinTime: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'join_time'
  },
  leaveTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'leave_time'
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_seconds',
    comment: 'Calculated upon leaving'
  }
}, {
  tableName: 'session_attendance',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Attendance;
