const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewDevice = sequelize.define('InterviewDevice', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  participantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  deviceToken: { type: DataTypes.STRING(255), unique: true, allowNull: false },
  deviceInfo: { type: DataTypes.JSON, allowNull: true },
  cameraStatus: { type: DataTypes.ENUM('CONNECTED','DISCONNECTED','ERROR'), defaultValue: 'DISCONNECTED' },
  batteryLevel: { type: DataTypes.INTEGER, allowNull: true },
  signalStrength: { type: DataTypes.ENUM('EXCELLENT','GOOD','FAIR','POOR','UNKNOWN'), defaultValue: 'UNKNOWN' },
  connectedAt: { type: DataTypes.DATE, allowNull: true },
  disconnectedAt: { type: DataTypes.DATE, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'interview_devices',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewDevice;
