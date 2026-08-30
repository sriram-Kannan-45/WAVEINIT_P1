const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * AttendanceRecord
 * ────────────────
 * Represents a student's attendance record for an AttendanceSession.
 * Status values: PRESENT, ABSENT, LATE, EXCUSED.
 */
const AttendanceRecord = sequelize.define('AttendanceRecord', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'session_id',
  },
  studentId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'student_id',
  },
  courseId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'course_id',
  },
  status: {
    type: DataTypes.ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED'),
    allowNull: false,
    defaultValue: 'PRESENT',
  },
  remarks: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  markedBy: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'marked_by',
  },
  markedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'marked_at',
  },
}, {
  tableName: 'attendance_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['session_id', 'student_id'] },
    { fields: ['student_id'] },
    { fields: ['course_id', 'status'] },
  ],
});

module.exports = AttendanceRecord;
