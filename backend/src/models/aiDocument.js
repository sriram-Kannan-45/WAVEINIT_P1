const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AIDocument = sequelize.define('AIDocument', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  trainerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'trainer_id'
  },
  trainingId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fileUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'file_url'
  },
  fileType: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'file_type'
  },
  status: {
    type: DataTypes.ENUM('PROCESSING', 'READY', 'ERROR'),
    allowNull: false,
    defaultValue: 'READY'
  }
}, {
  tableName: 'ai_documents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = AIDocument;
