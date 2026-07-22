const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileContactLink = sequelize.define('ProfileContactLink', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'profile_id' },
  linkedin: { type: DataTypes.STRING(500), allowNull: true },
  github: { type: DataTypes.STRING(500), allowNull: true },
  portfolio: { type: DataTypes.STRING(500), allowNull: true },
  website: { type: DataTypes.STRING(500), allowNull: true },
  twitter: { type: DataTypes.STRING(500), allowNull: true },
  youtube: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'profile_contact_links',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileContactLink;
