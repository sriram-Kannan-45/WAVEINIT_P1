const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SurveyAnswer = sequelize.define('SurveyAnswer', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  feedbackId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'feedback_id'
  },
  questionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'question_id'
  },
  answerText: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  answerRating: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'survey_answers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SurveyAnswer;
