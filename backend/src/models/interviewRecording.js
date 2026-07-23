const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewRecording = sequelize.define('InterviewRecording', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  recordingType: { type: DataTypes.ENUM('FULL','SCREEN','AUDIO'), defaultValue: 'FULL' },
  filePath: { type: DataTypes.STRING(500), allowNull: true },
  fileSize: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  durationSeconds: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  uploadedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  status: { type: DataTypes.ENUM('RECORDING','UPLOADING','PROCESSED','FAILED'), defaultValue: 'RECORDING' },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  endedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'interview_recordings',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewRecording;
