const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizAiHelp = sequelize.define('QuizAiHelp', {
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
  questionText: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'question_text',
    comment: 'Snapshot of the question text when help was requested (never includes the correct answer)'
  },
  selectedAnswer: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'selected_answer',
    comment: 'Participant selected answer snapshot (never sent to the model unredacted if sensitive)'
  },
  usageNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'usage_number'
  },
  possibleLeakDetected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'possible_leak_detected',
    comment: 'True when aiAnswerGuard flagged the generated reply as a possible answer leak'
  },
  leakReasons: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'leak_reasons',
    comment: 'Comma-separated guard reason codes, e.g. correct_answer_verbatim'
  }
}, {
  tableName: 'quiz_ai_help',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = QuizAiHelp;
