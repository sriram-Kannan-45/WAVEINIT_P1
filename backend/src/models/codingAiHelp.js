const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingAiHelp = sequelize.define('CodingAiHelp', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  attemptId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'attempt_id'
  },
  problemId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'problem_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  prompt: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  response: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  language: {
    type: DataTypes.STRING,
    allowNull: true
  },
  code: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Snapshot of code when help was requested (never passed to the model unredacted)'
  },
  usageNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'usage_number'
  }
}, {
  tableName: 'coding_ai_help',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingAiHelp;
