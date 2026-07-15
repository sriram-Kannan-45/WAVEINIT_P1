const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Screenshot = sequelize.define('Screenshot', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'session_id',
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
  capturedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'captured_at',
  },
}, {
  tableName: 'proctor_screenshots',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'] },
    { fields: ['participant_id'] },
  ],
});

module.exports = Screenshot;
