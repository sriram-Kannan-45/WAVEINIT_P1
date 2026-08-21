const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const InterviewDevice = sequelize.define('InterviewDevice', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  session_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'interview_sessions', key: 'id' },
    onDelete: 'CASCADE',
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  device_type: {
    type: DataTypes.ENUM('LAPTOP', 'MOBILE'),
    allowNull: false,
  },
  pairing_token: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  token_status: {
    type: DataTypes.ENUM('PENDING', 'CONSUMED', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  disconnected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('PAIRED', 'CONNECTED', 'DISCONNECTED'),
    allowNull: false,
    defaultValue: 'PAIRED',
  },
  device_info: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'interview_devices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['session_id'] },
    { fields: ['user_id'] },
    { fields: ['pairing_token'], unique: true },
    { fields: ['token_status'] },
    { fields: ['device_type'] },
  ],
});

module.exports = InterviewDevice;
