const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Note = sequelize.define('Note', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fileUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fileType: {
    type: DataTypes.ENUM('PDF', 'IMAGE', 'VIDEO', 'LINK'),
    allowNull: true
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  trainerId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false
  },
  trainingId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING'
  }
}, {
  tableName: 'notes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Note;