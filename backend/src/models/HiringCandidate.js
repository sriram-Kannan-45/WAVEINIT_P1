const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const HiringCandidate = sequelize.define('HiringCandidate', {
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
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  full_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  phone: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  registration_status: {
    type: DataTypes.ENUM('PENDING', 'REGISTERED', 'NOT_REGISTERED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  assignment_status: {
    type: DataTypes.ENUM('NOT_ASSIGNED', 'ASSIGNED'),
    allowNull: false,
    defaultValue: 'NOT_ASSIGNED',
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EVALUATED', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  last_rechecked_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  notes: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'hiring_candidates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['assessment_id'] },
    { unique: true, fields: ['assessment_id', 'email'] },
    { fields: ['user_id'] },
    { fields: ['registration_status'] },
    { fields: ['status'] },
  ],
});

module.exports = HiringCandidate;