const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const InterviewTrainer = sequelize.define('InterviewTrainer', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  trainerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  role: { type: DataTypes.ENUM('PRIMARY','SECONDARY'), defaultValue: 'PRIMARY' },
  assignedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'interview_trainers',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewTrainer;
