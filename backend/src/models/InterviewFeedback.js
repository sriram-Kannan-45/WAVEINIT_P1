const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewFeedback = sequelize.define('InterviewFeedback', {
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
  interview_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'interviews', key: 'id' },
    onDelete: 'CASCADE',
  },
  interviewer_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 10 },
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'interview_feedback',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'] },
    { fields: ['interview_id'] },
    { fields: ['interviewer_id'] },
  ],
});

module.exports = InterviewFeedback;
