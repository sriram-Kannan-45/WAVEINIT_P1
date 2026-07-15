const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MonitorViolation = sequelize.define('MonitorViolation', {
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
  type: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'type',
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'timestamp',
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'metadata',
  },
}, {
  tableName: 'monitor_violations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['attempt_id'] },
    { fields: ['participant_id'] },
    { fields: ['type'] },
    { fields: ['timestamp'] },
  ],
});

module.exports = MonitorViolation;
