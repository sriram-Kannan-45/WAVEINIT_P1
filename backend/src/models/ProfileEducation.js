const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileEducation = sequelize.define('ProfileEducation', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'profile_id' },
  institution: { type: DataTypes.STRING(200), allowNull: false },
  logo: { type: DataTypes.STRING(500), allowNull: true },
  degree: { type: DataTypes.STRING(200), allowNull: true },
  department: { type: DataTypes.STRING(200), allowNull: true },
  cgpa: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  year: { type: DataTypes.STRING(50), allowNull: true },
}, {
  tableName: 'profile_educations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileEducation;
