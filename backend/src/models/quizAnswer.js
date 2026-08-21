const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizAnswer = sequelize.define('QuizAnswer', {
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
  questionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'question_id'
  },
  answerText: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'answer_text'
  },
  selectedOption: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'selected_option',
    comment: 'Index of selected MCQ option'
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    field: 'is_correct'
  },
  score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  evaluatedByAI: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'evaluated_by_ai'
  }
}, {
  tableName: 'quiz_answers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = QuizAnswer;
