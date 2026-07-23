const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewEvaluation = sequelize.define('InterviewEvaluation', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  interviewId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  participantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  evaluatorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  communicationRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  technicalRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  codingRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  problemSolvingRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  confidenceRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  behaviorRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  overallRating: { type: DataTypes.DECIMAL(3,2), allowNull: true },
  recommendation: { type: DataTypes.ENUM('HIKE','MAYBE','REJECT'), defaultValue: 'MAYBE' },
  remarks: { type: DataTypes.TEXT, allowNull: true },
  feedbackFileUrl: { type: DataTypes.STRING(500), allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'interview_evaluations',
  timestamps: true,
  underscored: true,
});

module.exports = InterviewEvaluation;
