const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewResult = sequelize.define('InterviewResult', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  interview_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'interviews', key: 'id' },
    onDelete: 'CASCADE',
  },
  session_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    references: { model: 'interview_sessions', key: 'id' },
    onDelete: 'SET NULL',
  },
  decision: {
    type: DataTypes.ENUM('SELECTED', 'REJECTED', 'ON_HOLD'),
    allowNull: false,
  },
  decided_by: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  decided_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_published: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'interview_results',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['interview_id'], unique: true },
    { fields: ['session_id'] },
    { fields: ['decided_by'] },
    { fields: ['decision'] },
  ],
});

module.exports = InterviewResult;
