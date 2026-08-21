const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileActivityLog = sequelize.define('ProfileActivityLog', {
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT, allowNull: false, field: 'profile_id' },
  activity: { type: DataTypes.STRING(500), allowNull: false },
}, {
  tableName: 'profile_activity_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileActivityLog;
