const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizAttempt = sequelize.define('QuizAttempt', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  quizId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'quiz_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'disqualified_copy_violation', 'disqualified_policy_violation'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS'
  },
  violationCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'violation_count'
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
  monitoringSessionId: {
    type: DataTypes.STRING(128),
    allowNull: true,
    field: 'monitoring_session_id',
    comment: 'Linked ProctoringSession.session_id'
  },
  aiHelpUsage: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ai_help_usage',
    comment: 'Number of AI mentor exchanges used this attempt'
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
  tableName: 'quiz_attempts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['participant_id', 'quiz_id']
    }
  ]
});

module.exports = QuizAttempt;
