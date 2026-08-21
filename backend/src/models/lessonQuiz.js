const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Links a Lesson to a quiz (reuses the existing ai_quizzes records via quizId).
// resultStatus is the per-lesson-quiz gate the trainer flips to reveal scores.
const LessonQuiz = sequelize.define('LessonQuiz', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  lessonId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'lesson_id'
  },
  quizId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'quiz_id'
  },
  isMandatory: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_mandatory'
  },
  resultStatus: {
    type: DataTypes.ENUM('HIDDEN', 'PUBLISHED'),
    allowNull: false,
    defaultValue: 'HIDDEN',
    field: 'result_status'
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at'
  }
}, {
  tableName: 'lesson_quizzes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = LessonQuiz;
