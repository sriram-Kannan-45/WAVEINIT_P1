const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * AttendanceSession
 * ─────────────────
 * Represents an individual class / lecture / training session for which
 * attendance is recorded.
 */
const AttendanceSession = sequelize.define('AttendanceSession', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  courseId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'course_id',
  },
  trainingId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id',
  },
  trainerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'trainer_id',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  sessionDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'session_date',
  },
  startTime: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'start_time',
  },
  endTime: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'end_time',
  },
  batchName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'batch_name',
  },
  topic: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'COMPLETED',
  },
  sessionType: {
    type: DataTypes.ENUM('MORNING', 'EVENING', 'GENERAL'),
    allowNull: false,
    defaultValue: 'MORNING',
    field: 'session_type',
  },
  dayNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'day_number',
  },
  isLocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_locked',
  },
}, {
  tableName: 'attendance_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['course_id', 'session_date'] },
    { fields: ['training_id'] },
    { fields: ['trainer_id'] },
    { fields: ['training_id', 'session_date', 'session_type'] },
  ],
});

module.exports = AttendanceSession;
