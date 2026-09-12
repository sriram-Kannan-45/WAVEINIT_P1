const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingAttempt = sequelize.define('CodingAttempt', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  assessmentId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'assessment_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'disqualified'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'started_at'
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at'
  },
  timeTaken: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'time_taken',
    comment: 'Time taken in seconds'
  },
  violationCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'violation_count'
  },
  monitoringSessionId: {
    type: DataTypes.STRING(128),
    allowNull: true,
    field: 'monitoring_session_id',
    comment: 'Linked ProctoringSession.session_id'
  },
  aiHelpUsage: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'ai_help_usage',
    comment: 'JSON map of { problemId: number_of_ai_hints_used }'
  },
  submissionType: {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: 'MANUAL',
    field: 'submission_type',
    comment: 'MANUAL, AUTO_SUBMITTED, or TIME_EXPIRED'
  },
  attendanceStatus: {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: 'PRESENT',
    field: 'attendance_status',
    comment: 'PRESENT or ABSENT'
  },
  timeExpired: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'time_expired'
  },
  autoSubmitted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_submitted'
  }
}, {
  tableName: 'coding_attempts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingAttempt;
