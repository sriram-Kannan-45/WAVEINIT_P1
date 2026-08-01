const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Interview = sequelize.define('Interview', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  uuid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    unique: true,
  },
  candidate_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  interviewer_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  created_by: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
  },
  type: {
    type: DataTypes.ENUM('TECHNICAL', 'HR', 'MANAGERIAL', 'CUSTOM'),
    allowNull: false,
    defaultValue: 'TECHNICAL',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'),
    allowNull: false,
    defaultValue: 'SCHEDULED',
  },
  require_mobile_pairing: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  grace_period_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
  },
  meeting_type: {
    type: DataTypes.ENUM('ONLINE', 'IN_PERSON', 'HYBRID', 'IN_PLATFORM'),
    allowNull: false,
    defaultValue: 'IN_PLATFORM',
  },
  meeting_link: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  record_interview: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'interviews',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['candidate_id'] },
    { fields: ['interviewer_id'] },
    { fields: ['created_by'] },
    { fields: ['scheduled_at'] },
    { fields: ['status'] },
    { fields: ['uuid'], unique: true },
  ],
});

module.exports = Interview;
