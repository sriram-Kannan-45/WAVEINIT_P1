const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TrainerExperience = sequelize.define('TrainerExperience', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'user_id'
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Job title'
  },
  company: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'end_date',
    comment: 'Null if current position'
  },
  isCurrent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_current'
  }
}, {
  tableName: 'trainer_experiences',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = TrainerExperience;
