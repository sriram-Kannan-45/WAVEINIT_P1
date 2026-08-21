const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileSkill = sequelize.define('ProfileSkill', {
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT, allowNull: false, field: 'profile_id' },
  skill: { type: DataTypes.STRING(100), allowNull: false },
}, {
  tableName: 'profile_skills',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileSkill;
