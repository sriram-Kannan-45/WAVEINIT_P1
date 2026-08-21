/**
 * DeviceFingerprint — single-device-per-account enforcement.
 *
 * `fingerprintHash` is a deterministic SHA-256 of UA + screen + tz + canvas
 * computed on the client. We do NOT store raw fingerprint components.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const DeviceFingerprint = sequelize.define('DeviceFingerprint', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'user_id',
  },
  fingerprintHash: {
    type: DataTypes.STRING(128),
    allowNull: false,
    field: 'fingerprint_hash',
  },
  label: {
    type: DataTypes.STRING(120),
    allowNull: true,
    comment: 'Human-friendly name e.g. "Chrome on Windows"',
  },
  ipAddress: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'ip_address',
  },
  userAgent: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'user_agent',
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'last_seen_at',
  },
  isTrusted: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_trusted',
  },
}, {
  tableName: 'device_fingerprints',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['fingerprint_hash'] },
    { unique: true, fields: ['user_id', 'fingerprint_hash'], name: 'uniq_user_device' },
  ],
});

module.exports = DeviceFingerprint;
