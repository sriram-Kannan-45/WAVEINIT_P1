const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Feedback = sequelize.define('Feedback', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  participantId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'participant_id'
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'training_id'
  },
  trainerRating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 5 }
  },
  subjectRating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 5 }
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  anonymous: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  trainerResponse: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'feedbacks',
  timestamps: true,
  createdAt: 'submitted_at',
  updatedAt: 'updated_at'
});

module.exports = Feedback;