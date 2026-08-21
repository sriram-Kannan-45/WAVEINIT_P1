const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewLog = sequelize.define('InterviewLog', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  session_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'interview_sessions', key: 'id' },
    onDelete: 'CASCADE',
  },
  actor_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  event_type: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  payload_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  ts: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'interview_logs',
  timestamps: false,
  indexes: [
    { fields: ['session_id'] },
    { fields: ['event_type'] },
    { fields: ['ts'] },
  ],
});

module.exports = InterviewLog;
