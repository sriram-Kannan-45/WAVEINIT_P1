const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MonitorScreenshot = sequelize.define('MonitorScreenshot', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  attemptId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'attempt_id',
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id',
  },
  filePath: {
    type: DataTypes.STRING(512),
    allowNull: false,
    field: 'file_path',
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'timestamp',
  },
}, {
  tableName: 'monitor_screenshots',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['attempt_id'] },
    { fields: ['participant_id'] },
    { fields: ['timestamp'] },
  ],
});

module.exports = MonitorScreenshot;
