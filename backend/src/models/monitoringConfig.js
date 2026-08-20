const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * MonitoringConfig
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic configuration table for thresholds, cooldowns, score weights, and
 * risk boundaries. Keyed by (key, contextType) where contextType=NULL is global default.
 */
const MonitoringConfig = sequelize.define('MonitoringConfig', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  key: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'config_key',
    comment: 'e.g. thresholds, score_weights, cooldowns, risk_boundaries, camera_fps',
  },
  contextType: {
    type: DataTypes.ENUM('QUIZ', 'CODING', 'INTERVIEW'),
    allowNull: true,
    defaultValue: null,
    field: 'context_type',
    comment: 'NULL for global defaults, or specific module override',
  },
  value: {
    type: DataTypes.JSON,
    allowNull: false,
    field: 'config_value',
    comment: 'JSON payload with configuration values',
  },
  updatedBy: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    field: 'updated_by',
    comment: 'Admin or Trainer User.id who last modified this setting',
  },
}, {
  tableName: 'monitoring_config',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['config_key', 'context_type'], unique: true },
  ],
});

module.exports = MonitoringConfig;
