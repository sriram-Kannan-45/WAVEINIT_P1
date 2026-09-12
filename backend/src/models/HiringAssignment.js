const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const HiringAssignment = sequelize.define('HiringAssignment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  assessment_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'hiring_assessments', key: 'id' },
    onDelete: 'CASCADE',
  },
  candidate_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'hiring_candidates', key: 'id' },
    onDelete: 'CASCADE',
  },
  participant_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  quiz_assignment_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'quiz_assignments', key: 'id' },
    onDelete: 'SET NULL',
    comment: 'Canonical quiz assignment when this workflow uses the quiz engine.',
  },
  status: {
    type: DataTypes.ENUM('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EVALUATED', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'ASSIGNED',
  },
  assigned_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  attempts_used: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'hiring_assignments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['assessment_id'] },
    { unique: true, fields: ['assessment_id', 'candidate_id'] },
    { fields: ['participant_id'] },
    { fields: ['status'] },
  ],
});

module.exports = HiringAssignment;
