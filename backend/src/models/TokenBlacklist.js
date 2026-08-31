/**
 * TokenBlacklist — shared (DB-backed) access-token revocation.
 *
 * Previously `tokenService` kept the blacklist in a process-local `Set`, so a
 * logout on instance A did not revoke the token for instance B. Using the
 * shared database makes revocation global across all App Service instances.
 *
 * Lookups are by `jti`, the unique JWT ID, so a blacklist check is a PRIMARY
 * KEY lookup — millisecond-fast on the shared Supabase PostgreSQL.
 *
 * Every row records the fingerprint (hash of the token) and expiry so the
 * cleanup job can purge rows once the token itself has expired.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TokenBlacklist = sequelize.define('TokenBlacklist', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  jti: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: 'uq_token_blacklist_jti',
    comment: 'JWT ID (jti claim). Unique so double-logouts are idempotent.',
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'user_id',
    comment: 'User the token belonged to (NULL if undecodable/JTI only)',
  },
  tokenHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'token_hash',
    comment: 'SHA-256 fingerprint of the raw token (for forensics/audit)',
  },
  reason: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'logout | revoke-all | session-revoked | password-change | other',
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: 'When the JWT expires; used by the cleanup job',
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at',
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at',
  },
}, {
  tableName: 'token_blacklist',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['jti'] },
    { fields: ['expires_at'] },
    { fields: ['created_at'] },
  ],
});

module.exports = TokenBlacklist;