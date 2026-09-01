'use strict';

const { DataTypes } = require('sequelize');

/**
 * Coding assessment enhancements
 * ──────────────────────────────────────────────
 * Adds support for:
 *   1. AI student assistant (per-assessment enable + per-question hint limit)
 *   2. AI-generated question validation lifecycle (source + status)
 *   3. AI help usage tracking on attempts
 *   4. A log of every AI assistant exchange (coding_ai_help)
 *
 * Columns are added idempotently (missing columns only). The live app also
 * runs Model.sync({ alter: true }) on startup, so this migration is a
 * supplementary, manually-runnable backfill for environments not using sync.
 */
module.exports = {
  async up(queryInterface) {
    // 1. coding_assessments — AI assistant configuration
    let cols = await queryInterface.describeTable('coding_assessments');
    if (!cols.ai_help_limit) {
      await queryInterface.addColumn('coding_assessments', 'ai_help_limit', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }
    if (!cols.ai_assistant_enabled) {
      await queryInterface.addColumn('coding_assessments', 'ai_assistant_enabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    // 2. coding_problems — AI validation lifecycle + source
    cols = await queryInterface.describeTable('coding_problems');
    if (!cols.source) {
      await queryInterface.addColumn('coding_problems', 'source', {
        type: DataTypes.ENUM('MANUAL', 'AI'),
        allowNull: false,
        defaultValue: 'MANUAL',
      });
    }
    if (!cols.ai_validation_status) {
      await queryInterface.addColumn('coding_problems', 'ai_validation_status', {
        type: DataTypes.ENUM(
          'AI_GENERATED', 'VALIDATING', 'VALIDATED',
          'VALIDATION_FAILED', 'NEEDS_TRAINER_REVIEW', 'PUBLISHED'
        ),
        allowNull: false,
        defaultValue: 'PUBLISHED',
      });
    }
    if (!cols.ai_validation_message) {
      await queryInterface.addColumn('coding_problems', 'ai_validation_message', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }

    // 3. coding_attempts — AI help usage map
    cols = await queryInterface.describeTable('coding_attempts');
    if (!cols.ai_help_usage) {
      await queryInterface.addColumn('coding_attempts', 'ai_help_usage', {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      });
    }

    // 4. coding_ai_help table (idempotent create)
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('coding_ai_help')) {
      await queryInterface.createTable('coding_ai_help', {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        attempt_id: { type: DataTypes.BIGINT, allowNull: false },
        problem_id: { type: DataTypes.BIGINT, allowNull: false },
        participant_id: { type: DataTypes.BIGINT, allowNull: false },
        prompt: { type: DataTypes.TEXT, allowNull: false },
        response: { type: DataTypes.TEXT, allowNull: false },
        language: { type: DataTypes.STRING, allowNull: true },
        code: { type: DataTypes.TEXT, allowNull: true },
        usage_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('coding_assessments', 'ai_help_limit');
    await queryInterface.removeColumn('coding_assessments', 'ai_assistant_enabled');
    await queryInterface.removeColumn('coding_problems', 'source');
    await queryInterface.removeColumn('coding_problems', 'ai_validation_status');
    await queryInterface.removeColumn('coding_problems', 'ai_validation_message');
    await queryInterface.removeColumn('coding_attempts', 'ai_help_usage');
    await queryInterface.dropTable('coding_ai_help');
  }
};
