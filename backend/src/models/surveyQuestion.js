const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SurveyQuestion = sequelize.define('SurveyQuestion', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true, // If null, applies to all trainings. If set, specific to one.
    field: 'training_id'
  },
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  questionType: {
    type: DataTypes.ENUM('RATING', 'TEXT', 'MULTIPLE_CHOICE'),
    allowNull: false,
    defaultValue: 'TEXT'
  },
  options: {
    type: DataTypes.JSON, // Array of string options for MULTIPLE_CHOICE
    allowNull: true
  }
}, {
  tableName: 'survey_questions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SurveyQuestion;
