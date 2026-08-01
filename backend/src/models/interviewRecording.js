const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewRecording = sequelize.define('InterviewRecording', {
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
  device_type: {
    type: DataTypes.ENUM('LAPTOP', 'MOBILE', 'SCREEN_SHARE'),
    allowNull: false,
  },
  file_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  file_size: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  },
  mime_type: {
    type: DataTypes.STRING(100),
    defaultValue: 'video/webm',
  },
  duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  checksum: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('RECORDING', 'UPLOADING', 'COMPLETED', 'FAILED'),
    allowNull: false,
    defaultValue: 'RECORDING',
  },
  uploaded_by: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'interview_recordings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'] },
    { fields: ['device_type'] },
    { fields: ['status'] },
  ],
});

module.exports = InterviewRecording;
