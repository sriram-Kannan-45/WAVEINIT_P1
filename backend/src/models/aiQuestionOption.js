const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AIQuestionOption = sequelize.define('AIQuestionOption', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  questionId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'question_id',
    references: {
      model: 'ai_questions',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  optionText: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'option_text',
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_correct',
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'ai_question_options',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['question_id'] },
  ],
});

module.exports = AIQuestionOption;

