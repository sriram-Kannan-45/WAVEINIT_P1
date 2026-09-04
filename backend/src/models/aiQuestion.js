const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { QUESTION_DIFFICULTIES, normalizeQuestionDifficulty } = require('../utils/quizDifficulty');

const AIQuestion = sequelize.define('AIQuestion', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  quizId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'quiz_id'
  },
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'question_text'
  },
  questionType: {
    type: DataTypes.ENUM('MCQ', 'SHORT_ANSWER', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING'),
    allowNull: false,
    field: 'question_type'
  },
  options: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of options for MCQ'
  },
  correctAnswer: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'correct_answer'
  },
  acceptableAnswers: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'acceptable_answers',
    comment: 'Acceptable answers for FILL_BLANK'
  },
  pairs: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Pairs for MATCHING question type'
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  topic: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bloomsLevel: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'blooms_level'
  },
  difficulty: {
    type: DataTypes.ENUM(...QUESTION_DIFFICULTIES),
    allowNull: false,
    defaultValue: 'MEDIUM',
    set(value) { this.setDataValue('difficulty', normalizeQuestionDifficulty(value)); }
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  marks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Points this question is worth'
  }
}, {
  tableName: 'ai_questions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = AIQuestion;
