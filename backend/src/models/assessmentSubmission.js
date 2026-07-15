const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AssessmentSubmission = sequelize.define('AssessmentSubmission', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  assessmentId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'assessment_id'
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id'
  },
  content: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  fileUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'file_url'
  },
  status: {
    type: DataTypes.ENUM('NOT_STARTED', 'SUBMITTED', 'REVIEWED', 'PUBLISHED'),
    allowNull: false,
    defaultValue: 'SUBMITTED'
  },
  score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at'
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reviewed_at'
  }
}, {
  tableName: 'assessment_submissions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['assessment_id', 'participant_id'] }]
});

module.exports = AssessmentSubmission;
