/**
 * UserSession — Tracks all active sessions per user.
 *
 * Enables: view active sessions, logout current/all, detect suspicious logins,
 * impossible travel detection, IP/browser change detection.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserSession = sequelize.define('UserSession', {
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
  sessionId: {
    type: DataTypes.STRING(36),
    allowNull: false,
    unique: true,
    field: 'session_id',
    comment: 'UUID for this session',
  },
  family: {
    type: DataTypes.STRING(36),
    allowNull: false,
    comment: 'Refresh token family UUID',
  },
  deviceId: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'device_id',
    comment: 'Browser fingerprint hash',
  },
  browserFingerprint: {
    type: DataTypes.STRING(128),
    allowNull: true,
    field: 'browser_fingerprint',
    comment: 'Full browser fingerprint for anomaly detection',
  },
  ipAddress: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'ip_address',
  },
  userAgent: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'user_agent',
  },
  browser: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Parsed browser name',
  },
  os: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Parsed OS name',
  },
  deviceType: {
    type: DataTypes.ENUM('desktop', 'mobile', 'tablet', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown',
    field: 'device_type',
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Approximate location from IP (city, country)',
  },
  loginAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'login_at',
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'last_activity_at',
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
  },
  logoutAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'logout_at',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  },
  suspiciousScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'suspicious_score',
    comment: '0-100 risk score (0=safe, 100=very suspicious)',
  },
  suspiciousReasons: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'suspicious_reasons',
    comment: 'Array of reasons flagged as suspicious',
  },
}, {
  tableName: 'user_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['session_id'] },
    { fields: ['user_id', 'is_active'] },
    { fields: ['expires_at'] },
    { fields: ['family'] },
  ],
});

module.exports = UserSession;
