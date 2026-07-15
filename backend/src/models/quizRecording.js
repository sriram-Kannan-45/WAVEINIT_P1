const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizRecording = sequelize.define('QuizRecording', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  assessmentType: {
    type: DataTypes.ENUM('quiz', 'coding'),
    allowNull: false,
    defaultValue: 'quiz',
    field: 'assessment_type'
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'quiz_id'
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id'
  },
  trainerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'trainer_id'
  },
  sessionId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'session_id'
  },
  filePath: {
    type: DataTypes.STRING(512),
    allowNull: false,
    field: 'file_path'
  },
  fileSizeMb: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'file_size_mb'
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_seconds'
  },
  recordedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'recorded_at'
  },
  status: {
    type: DataTypes.ENUM('processing', 'ready', 'failed'),
    allowNull: false,
    defaultValue: 'processing'
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_deleted'
  }
}, {
  tableName: 'quiz_recordings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['quiz_id'] },
    { fields: ['participant_id'] },
    { fields: ['trainer_id'] },
    { fields: ['session_id'] },
    { fields: ['is_deleted'] }
  ]
});

module.exports = QuizRecording;
