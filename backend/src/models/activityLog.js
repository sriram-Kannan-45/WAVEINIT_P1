const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'login, profile_update, trainer_create, participant_register, training_create, etc.'
  },
  entityType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'User, Training, Note, Feedback, Enrollment'
  },
  entityId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userAgent: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('SUCCESS', 'FAILED'),
    defaultValue: 'SUCCESS'
  }
}, {
  tableName: 'activity_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['userId'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
});

module.exports = ActivityLog;