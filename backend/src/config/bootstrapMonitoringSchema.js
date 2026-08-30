/**
 * bootstrapMonitoringSchema
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds the recorded-video async monitoring columns to the already-existing
 * monitoring_sessions / monitoring_events tables.
 *
 * Background: sequelize.sync({ alter: false }) happily creates NEW tables
 * (video_segments, processing_jobs) but will NOT add columns to pre-existing
 * tables. MySQL rejects Postgres ENUM syntax and the legacy MySQL-only ALTERs
 * in config/db.js can't run against Postgres/Supabase, so this module uses
 * Sequelize's dialect-agnostic QueryInterface (describeTable / addColumn) and
 * is safe on both MySQL and PostgreSQL.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');
const logger = require('../utils/logger');

const COLUMN_MIGRATIONS = [
  {
    table: 'monitoring_sessions',
    columns: [
      {
        name: 'monitoring_status',
        type: DataTypes.ENUM(
          'NOT_ENABLED',
          'RECORDING',
          'WAITING_FOR_PROCESSING',
          'PROCESSING',
          'PARTIAL',
          'COMPLETED',
          'FAILED'
        ),
        defaultValue: 'NOT_ENABLED',
        allowNull: false,
      },
      { name: 'monitoring_final_score', type: DataTypes.FLOAT, allowNull: true },
      { name: 'monitoring_completed_at', type: DataTypes.DATE, allowNull: true },
      { name: 'total_segments', type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      { name: 'completed_segments', type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      { name: 'failed_segments', type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ],
  },
  {
    table: 'monitoring_events',
    columns: [
      { name: 'segment_id', type: DataTypes.BIGINT, allowNull: true },
    ],
  },
];

async function ensureMonitoringSchema() {
  const qi = sequelize.getQueryInterface();

  for (const migration of COLUMN_MIGRATIONS) {
    let existing = {};
    try {
      existing = await qi.describeTable(migration.table);
    } catch (err) {
      logger.warn(`[bootstrap-monitoring] Table ${migration.table} not available to describe (${err.message}); skipping column checks.`);
      continue;
    }

    for (const col of migration.columns) {
      if (existing[col.name]) continue;
      try {
        await qi.addColumn(migration.table, col.name, {
          type: col.type,
          allowNull: col.allowNull ?? true,
          defaultValue: col.defaultValue,
        });
        logger.info(`➕ Added ${migration.table}.${col.name}`);
      } catch (err) {
        logger.warn(`⚠️ Could not add ${migration.table}.${col.name}: ${err.message}`);
      }
    }
  }

  return true;
}

module.exports = { ensureMonitoringSchema, COLUMN_MIGRATIONS };