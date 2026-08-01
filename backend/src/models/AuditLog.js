/**
 * AuditLog — Immutable audit trail for all security-relevant actions.
 *
 * Records: who, what, when, where, how, result.
 * Never deleted — use for compliance, forensics, anomaly detection.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'user_id',
    comment: 'NULL for unauthenticated actions (e.g., login attempt)',
  },
  action: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'LOGIN, LOGOUT, CREATE_COURSE, DELETE_FILE, etc.',
  },
  category: {
    type: DataTypes.ENUM('AUTH', 'DATA', 'SECURITY', 'FILE', 'SYSTEM', 'API'),
    allowNull: false,
    defaultValue: 'API',
  },
  severity: {
    type: DataTypes.ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'INFO',
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
  method: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'HTTP method: GET, POST, PUT, DELETE',
  },
  path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Request path',
  },
  statusCode: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'status_code',
  },
  resourceId: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'resource_id',
    comment: 'ID of affected resource',
  },
  resourceType: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'resource_type',
    comment: 'Type of affected resource (User, Course, etc.)',
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional context (old values, new values, error details)',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message',
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Request duration in milliseconds',
  },
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['action'] },
    { fields: ['category'] },
    { fields: ['severity'] },
    { fields: ['created_at'] },
    { fields: ['user_id', 'action'] },
    { fields: ['ip_address'] },
  ],
});

module.exports = AuditLog;
