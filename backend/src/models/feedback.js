const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Feedback = sequelize.define('Feedback', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  participantId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'participant_id',
  },
  trainingId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id',
  },
  courseId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'course_id',
  },
  quizId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'quiz_id',
  },
  assessmentId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'assessment_id',
  },
  feedbackType: {
    type: DataTypes.ENUM('COURSE', 'TRAINER', 'ASSESSMENT', 'GENERAL'),
    allowNull: false,
    defaultValue: 'COURSE',
    field: 'feedback_type',
  },
  trainerRating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 5 },
    field: 'trainer_rating',
  },
  subjectRating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 5 },
    field: 'subject_rating',
  },
  courseRating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 5 },
    field: 'course_rating',
  },
  surveyResponses: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'survey_responses',
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  anonymous: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  trainerResponse: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'trainer_response',
  },
}, {
  tableName: 'feedbacks',
  timestamps: true,
  createdAt: 'submitted_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['participant_id'] },
    { fields: ['course_id'] },
    { fields: ['training_id'] },
    { fields: ['quiz_id'] },
    { fields: ['feedback_type'] },
  ],
});

module.exports = Feedback;