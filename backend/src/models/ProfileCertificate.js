const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ProfileCertificate = sequelize.define('ProfileCertificate', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  profileId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'profile_id' },
  title: { type: DataTypes.STRING(200), allowNull: false },
  issuer: { type: DataTypes.STRING(200), allowNull: true },
  credentialId: { type: DataTypes.STRING(200), allowNull: true, field: 'credential_id' },
  issueDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'issue_date' },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'expiry_date' },
  verificationUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'verification_url' },
  certificateFile: { type: DataTypes.STRING(500), allowNull: true, field: 'certificate_file' },
}, {
  tableName: 'profile_certificates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProfileCertificate;
