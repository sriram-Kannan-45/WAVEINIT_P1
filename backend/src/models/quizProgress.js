const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Per-participant completion state for a lesson quiz. score is stored on
// submission but never returned to the participant until the parent
// LessonQuiz.resultStatus is PUBLISHED by the trainer.
const QuizProgress = sequelize.define('QuizProgress', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  lessonQuizId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'lesson_quiz_id'
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id'
  },
  status: {
    type: DataTypes.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'NOT_STARTED'
  },
  score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  }
}, {
  tableName: 'quiz_progress',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['lesson_quiz_id', 'participant_id'] }]
});

module.exports = QuizProgress;
