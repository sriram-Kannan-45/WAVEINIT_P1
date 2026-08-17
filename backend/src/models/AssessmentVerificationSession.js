/**
 * AssessmentVerificationSession Model
 * Dedicated verification and QR pairing session for Quiz and Coding Assessments.
 * Strictly separate from Interview module.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AssessmentVerificationSession = sequelize.define('AssessmentVerificationSession', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  participant_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  assessment_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  assessment_type: {
    type: DataTypes.ENUM('QUIZ', 'CODING'),
    allowNull: false,
  },
  attempt_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  session_id: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
  },
  token: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
  },
  socket_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PAIRED', 'VERIFIED', 'USED', 'EXPIRED'),
    defaultValue: 'PENDING',
    allowNull: false,
  },
  laptop_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  mobile_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  mobile_device_info: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'assessment_verification_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'avs_part_type_att_idx', fields: ['participant_id', 'assessment_type', 'attempt_id'] },
    { name: 'avs_token_uq', fields: ['token'], unique: true },
    { name: 'avs_session_id_uq', fields: ['session_id'], unique: true },
    { name: 'avs_status_idx', fields: ['status'] },
    { name: 'avs_expires_at_idx', fields: ['expires_at'] },
  ],
});

module.exports = AssessmentVerificationSession;
