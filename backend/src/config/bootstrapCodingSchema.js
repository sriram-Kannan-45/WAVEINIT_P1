'use strict';

/**
 * bootstrapCodingSchema
 * ─────────────────────────────────────────────────────────────────────────────
 * Dialect-agnostic (PostgreSQL / MySQL / SQLite) schema bootstrapper for
 * Coding Assessments, AI Assistant, and Multi-Language support.
 *
 * Background: sequelize.sync({ alter: false }) will NOT add newly declared
 * columns to existing tables. This module ensures all required columns and
 * tables exist seamlessly on startup without requiring manual DB commands.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');
const logger = require('../utils/logger');

const CODING_COLUMN_MIGRATIONS = [
  {
    table: 'coding_assessments',
    columns: [
      { name: 'ai_help_limit', type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      { name: 'ai_assistant_enabled', type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      { name: 'ai_unlock_thresholds', type: DataTypes.JSON, allowNull: true },
      { name: 'original_prompt', type: DataTypes.TEXT, allowNull: true },
      {
        name: 'analyzed_intent',
        type: DataTypes.JSON,
        allowNull: true,
      },
      { name: 'generation_version', type: DataTypes.STRING, allowNull: true },
      {
        name: 'validation_result',
        type: DataTypes.JSON,
        allowNull: true,
      },
    ],
  },
  {
    table: 'coding_problems',
    columns: [
      {
        name: 'source',
        type: DataTypes.ENUM('MANUAL', 'AI'),
        allowNull: false,
        defaultValue: 'MANUAL',
      },
      {
        name: 'ai_validation_status',
        type: DataTypes.ENUM('AI_GENERATED', 'VALIDATING', 'VALIDATED', 'VALIDATION_FAILED', 'NEEDS_TRAINER_REVIEW', 'PUBLISHED'),
        allowNull: false,
        defaultValue: 'PUBLISHED',
      },
      { name: 'ai_validation_message', type: DataTypes.TEXT, allowNull: true },
      { name: 'required_concepts', type: DataTypes.JSON, allowNull: true },
      { name: 'validation_result', type: DataTypes.JSON, allowNull: true },
    ],
  },
  {
    table: 'coding_attempts',
    columns: [
      { name: 'ai_help_usage', type: DataTypes.JSON, allowNull: false, defaultValue: {} },
      { name: 'monitoring_session_id', type: DataTypes.STRING(128), allowNull: true },
    ],
  },
];

async function ensureCodingSchema() {
  const qi = sequelize.getQueryInterface();

  for (const migration of CODING_COLUMN_MIGRATIONS) {
    let existing = {};
    try {
      existing = await qi.describeTable(migration.table);
    } catch (err) {
      logger.warn(`[bootstrap-coding] Table ${migration.table} not available to describe (${err.message}); skipping column checks.`);
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

  // Ensure coding_ai_help table exists
  try {
    const tables = await qi.showAllTables();
    const tableNames = tables.map(t => (typeof t === 'object' ? t.tableName || Object.values(t)[0] : String(t)));
    if (!tableNames.includes('coding_ai_help')) {
      await qi.createTable('coding_ai_help', {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        attempt_id: { type: DataTypes.BIGINT, allowNull: false, field: 'attempt_id' },
        problem_id: { type: DataTypes.BIGINT, allowNull: false, field: 'problem_id' },
        participant_id: { type: DataTypes.BIGINT, allowNull: false, field: 'participant_id' },
        prompt: { type: DataTypes.TEXT, allowNull: false },
        response: { type: DataTypes.TEXT, allowNull: false },
        language: { type: DataTypes.STRING, allowNull: true },
        code: { type: DataTypes.TEXT, allowNull: true },
        usage_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'usage_number' },
        created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
        updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
      });
      logger.info('➕ Created table coding_ai_help');
    }
  } catch (err) {
    logger.warn(`⚠️ Could not check/create coding_ai_help table: ${err.message}`);
  }

  return true;
}

module.exports = { ensureCodingSchema, CODING_COLUMN_MIGRATIONS };
