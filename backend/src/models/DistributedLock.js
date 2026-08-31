/**
 * DistributedLock — cross-instance mutual exclusion backed by the shared DB.
 *
 * The application has no Redis dependency (Redis is optional; when
 * REDIS_URL is unset a per-process in-memory fallback is used, which breaks
 * mutual exclusion once more than one App Service instance runs).
 *
 * This table gives us a real distributed lock so that two backend instances
 * cannot run the same single-writer job (OTP cleanup, proctoring reapers,
 * monitoring auto-submit) or claim the same quiz submission concurrently.
 *
 * Safety: a lock row only grants ownership while `expiresAt` is in the future.
 * If the holder crashes, the lock self-expires and another instance can take
 * over. The acquire path uses a `FOR UPDATE` row lock inside a transaction,
 * which is dialect-independent (works on both PostgreSQL and MySQL).
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const DistributedLock = sequelize.define('DistributedLock', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  lockKey: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: 'uq_distributed_locks_lock_key',
    field: 'lock_key',
    comment: 'Logical lock name, e.g. "leader:cron:monitor-auto-submit"',
  },
  token: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'Claimer instance token (INSTANCE_ID + pid + nonce). Release must match.',
  },
  owner: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Instance ID that currently holds the lock',
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
    comment: 'When the ownership expires; NULL never allowed so stale rows do not block',
  },
  purpose: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Human readable purpose for debugging',
  },
}, {
  tableName: 'distributed_locks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['lock_key'] },
    { fields: ['expires_at'] },
    { fields: ['token'] },
  ],
});

module.exports = DistributedLock;