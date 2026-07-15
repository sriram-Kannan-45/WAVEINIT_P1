const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  dob: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  profilePic: {
    type: DataTypes.STRING,
    allowNull: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  role: {
    type: DataTypes.ENUM('ADMIN', 'TRAINER', 'PARTICIPANT'),
    allowNull: false,
    defaultValue: 'PARTICIPANT'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'INACTIVE'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Soft delete flag'
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Soft delete timestamp'
  },
  passwordVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Tracks password hash algorithm version for future upgrades'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: false, // Disable built-in soft delete, use custom
  deletedAt: false
});

module.exports = User;