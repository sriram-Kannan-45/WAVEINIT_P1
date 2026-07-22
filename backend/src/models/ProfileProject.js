const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileProject = sequelize.define('ProfileProject', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'profile_id' },
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  techStack: { type: DataTypes.STRING(500), allowNull: true, field: 'tech_stack' },
  github: { type: DataTypes.STRING(500), allowNull: true },
  liveDemo: { type: DataTypes.STRING(500), allowNull: true, field: 'live_demo' },
  thumbnail: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'profile_projects',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileProject;
