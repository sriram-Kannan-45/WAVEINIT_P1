const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserProfile = sequelize.define('UserProfile', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true, field: 'user_id' },
  headline: { type: DataTypes.STRING(200), allowNull: true },
  about: { type: DataTypes.TEXT, allowNull: true },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  location: { type: DataTypes.STRING(200), allowNull: true },
  company: { type: DataTypes.STRING(200), allowNull: true },
  department: { type: DataTypes.STRING(200), allowNull: true },
  designation: { type: DataTypes.STRING(200), allowNull: true },
  experience: { type: DataTypes.STRING(100), allowNull: true },
  timezone: { type: DataTypes.STRING(100), allowNull: true },
  language: { type: DataTypes.STRING(100), allowNull: true },
  bannerImage: { type: DataTypes.STRING(500), allowNull: true, field: 'banner_image' },
  profileImage: { type: DataTypes.TEXT('medium'), allowNull: true, field: 'profile_image' },
  resume: { type: DataTypes.STRING(500), allowNull: true },
  visibility: { type: DataTypes.ENUM('PUBLIC', 'PRIVATE', 'TEAM'), defaultValue: 'PUBLIC' },
}, {
  tableName: 'user_profiles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = UserProfile;
