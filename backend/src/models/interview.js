const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Interview = sequelize.define('Interview', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  interviewType: { 
    type: DataTypes.ENUM('TECHNICAL','HR','BEHAVIORAL','CODING','SYSTEM_DESIGN'),
    allowNull: false, defaultValue: 'HR'
  },
  createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  durationMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 60 },
  timezone: { type: DataTypes.STRING(50), defaultValue: 'Asia/Kolkata' },
  meetingPassword: { type: DataTypes.STRING(100), allowNull: true },
  instructions: { type: DataTypes.TEXT, allowNull: true },
  recordingEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  mobileCameraEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  qrVerificationEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  screenShareEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  whiteboardEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  chatEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  resumeViewerEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  notesEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  aiSummaryEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  antiCopyEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  antiTabSwitchEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  fullscreenModeEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  status: { 
    type: DataTypes.ENUM('SCHEDULED','LIVE','COMPLETED','CANCELLED','RESCHEDULED'),
    defaultValue: 'SCHEDULED'
  },
  roomId: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  recordingUrl: { type: DataTypes.STRING(500), allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  endedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'interviews',
  timestamps: true,
  underscored: true,
});

module.exports = Interview;
