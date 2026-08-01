/**
 * RefreshToken — Secure refresh token storage.
 *
 * Stores SHA-256 hashes of refresh tokens (never plaintext).
 * Supports token families for stolen-token detection.
 * Single-use: each rotation marks the old token as revoked.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RefreshToken = sequelize.define('RefreshToken', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  tokenHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'token_hash',
    comment: 'SHA-256 hash of the refresh token',
  },
  family: {
    type: DataTypes.STRING(36),
    allowNull: false,
    comment: 'Token family UUID for stolen-token detection',
  },
  fingerprint: {
    type: DataTypes.STRING(16),
    allowNull: true,
    comment: 'Device fingerprint hash (first 16 chars)',
  },
  userAgent: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'user_agent',
  },
  ipAddress: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'ip_address',
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
  },
  revoked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  revokedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'revoked_at',
  },
}, {
  tableName: 'refresh_tokens',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['token_hash'] },
    { fields: ['family'] },
    { fields: ['expires_at'] },
    { fields: ['user_id', 'revoked'] },
  ],
});

module.exports = RefreshToken;
