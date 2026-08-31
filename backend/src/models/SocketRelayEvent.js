/**
 * SocketRelayEvent — cross-instance Socket.IO event delivery without Redis.
 *
 * When the @socket.io/redis-adapter is NOT configured (the default deployment
 * has no Redis), Socket.IO state (rooms, socket membership) is per-instance.
 * A socket connected to instance A cannot be reached by an emit from instance
 * B, which breaks interview WebRTC signaling and real-time notifications under
 * scale-out.
 *
 * This table is an outbox: the emitting instance inserts a row; every instance
 * runs a short poller that CLAIMS the row (atomic status flip) and delivers it
 * if the target (socket id or room) is hosted locally. Rows are then deleted,
 * keeping the table tiny.
 *
 * High-volume events (monitoring/proctoring video frames) are intentionally
 * NOT relayed — they flow over the p2p/instance-local sockets that ARR sticky
 * sessions keep on the same instance.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SocketRelayEvent = sequelize.define('SocketRelayEvent', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  namespace: {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: '/',
    comment: 'Socket.IO namespace ("/" for the main namespace)',
  },
  targetType: {
    type: DataTypes.ENUM('socket', 'room', 'user-room', 'broadcast'),
    allowNull: false,
    defaultValue: 'room',
    field: 'target_type',
  },
  target: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Socket id, room name, or user id (for user-room)',
  },
  event: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Socket.IO event name, e.g. "interview:offer"',
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Event payload (must be JSON-serializable)',
  },
  status: {
    type: DataTypes.ENUM('pending', 'claimed'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'pending = ready for any instance to consume; claimed = being processed',
  },
  claimOwner: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'claim_owner',
    comment: 'Instance currently processing this row (no-op if the instance has no local target)',
  },
  claimedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'claimed_at',
    comment: 'When the row was claimed; used to requeue rows stuck after a crash',
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
  tableName: 'socket_relay_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['status', 'created_at'] },
    { fields: ['target'] },
    { fields: ['event'] },
    { fields: ['claimed_at'] },
  ],
});

module.exports = SocketRelayEvent;