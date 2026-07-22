const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileExperience = sequelize.define('ProfileExperience', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'profile_id' },
  company: { type: DataTypes.STRING(200), allowNull: false },
  logo: { type: DataTypes.STRING(500), allowNull: true },
  role: { type: DataTypes.STRING(200), allowNull: false },
  employmentType: { type: DataTypes.ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE', 'SELF_EMPLOYED'), defaultValue: 'FULL_TIME', field: 'employment_type' },
  location: { type: DataTypes.STRING(200), allowNull: true },
  startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
  endDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'end_date' },
  currentlyWorking: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'currently_working' },
  description: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'profile_experiences',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileExperience;
