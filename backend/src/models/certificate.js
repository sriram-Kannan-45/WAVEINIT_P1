const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Certificate
 * ───────────
 * Stores generated certificates for participants when they complete their courses/trainings.
 */
const Certificate = sequelize.define('Certificate', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  certificateCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'certificate_code'
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'user_id'
  },
  trainingId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'training_id'
  },
  courseId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'course_id'
  },
  issuedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'issued_at'
  }
}, {
  tableName: 'certificates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['training_id'] },
    { fields: ['course_id'] }
  ]
});

module.exports = Certificate;
