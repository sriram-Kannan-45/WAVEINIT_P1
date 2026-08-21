const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PasswordResetOtp = sequelize.define('PasswordResetOtp', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  otpHash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of failed verify attempts; record invalidated after 5'
  },
  ip: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Source IP at OTP issuance — for audit'
  }
}, {
  tableName: 'password_reset_otps',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = PasswordResetOtp;
