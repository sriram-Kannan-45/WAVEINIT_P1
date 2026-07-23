const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewNotification = sequelize.define('InterviewNotification', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  type: {
    type: DataTypes.ENUM(
      'INTERVIEW_SCHEDULED','INTERVIEW_REMINDER','INTERVIEW_CANCELLED',
      'INTERVIEW_RESCHEDULED','INVITATION_RECEIVED','EVALUATION_SUBMITTED',
      'RESULT_PUBLISHED','INTERVIEW_STARTING_SOON'
    ),
    allowNull: false,
  },
  message: { type: DataTypes.TEXT, allowNull: false },
  isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
  readAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'interview_notifications',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewNotification;
