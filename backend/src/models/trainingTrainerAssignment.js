const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * TrainingTrainerAssignment
 * ─────────────────────────
 * Many-to-many junction between training programs and trainers.
 */
const TrainingTrainerAssignment = sequelize.define('TrainingTrainerAssignment', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'training_id'
  },
  trainerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'trainer_id'
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'assigned_at'
  }
}, {
  tableName: 'training_trainer_assignments',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['training_id', 'trainer_id'] },
    { fields: ['trainer_id'] }
  ]
});

module.exports = TrainingTrainerAssignment;
