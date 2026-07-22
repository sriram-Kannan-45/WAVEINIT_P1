const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const InterviewLog = sequelize.define('InterviewLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  eventType: {
    type: DataTypes.ENUM(
      'CREATED','SCHEDULED','RESCHEDULED','CANCELLED',
      'INVITATION_SENT','INVITATION_ACCEPTED','INVITATION_DECLINED',
      'INTERVIEWER_JOINED','CANDIDATE_JOINED','CANDIDATE_LEFT',
      'QR_GENERATED','QR_SCANNED','QR_VERIFIED',
      'MOBILE_CAMERA_CONNECTED','MOBILE_CAMERA_DISCONNECTED',
      'SCREEN_SHARE_STARTED','SCREEN_SHARE_STOPPED',
      'RECORDING_STARTED','RECORDING_STOPPED',
      'EVALUATION_SUBMITTED','RESULT_PUBLISHED',
      'VIOLATION_DETECTED','FORCE_TERMINATED',
      'WHITEBOARD_USED','CODING_SESSION_STARTED'
    ),
    allowNull: false,
  },
  metadata: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'interview_logs',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewLog;
