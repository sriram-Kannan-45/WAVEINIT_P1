const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewAlert = sequelize.define('InterviewAlert', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  session_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'interview_sessions', key: 'id' },
    onDelete: 'CASCADE',
  },
  alert_type: {
    type: DataTypes.ENUM(
      'TAB_SWITCH', 'COPY_PASTE', 'CAMERA_DISABLED', 'SCREEN_SHARE_STOPPED',
      'MULTIPLE_PERSONS', 'MOBILE_PHONE_DETECTED', 'FACE_MISSING',
      'LOOKING_AWAY', 'CANDIDATE_LEFT', 'TAB_BLUR'
    ),
    allowNull: false,
  },
  severity: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
    allowNull: false,
    defaultValue: 'MEDIUM',
  },
  source_device: {
    type: DataTypes.ENUM('LAPTOP', 'MOBILE', 'SYSTEM'),
    allowNull: false,
    defaultValue: 'LAPTOP',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  ts: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'interview_alerts',
  timestamps: false,
  indexes: [
    { fields: ['session_id'] },
    { fields: ['alert_type'] },
    { fields: ['severity'] },
    { fields: ['ts'] },
  ],
});

module.exports = InterviewAlert;
