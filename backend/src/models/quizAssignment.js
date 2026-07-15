const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const QuizAssignment = sequelize.define('QuizAssignment', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  quizId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'quiz_id'
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'assigned_at'
  }
}, {
  tableName: 'quiz_assignments',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['quiz_id', 'participant_id'] },
    { fields: ['quiz_id'] },
    { fields: ['participant_id'] },
    { fields: ['status'] }
  ]
});

module.exports = QuizAssignment;
