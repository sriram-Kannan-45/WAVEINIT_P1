'use strict';

const { DataTypes } = require('sequelize');

/**
 * Multi-language coding problem support
 * ──────────────────────────────────────────────
 * Creates the coding_problem_languages table holding per-language configuration
 * (starter code, reference solution and optional execution overrides) for each
 * coding problem. Each supported language gets its OWN starter/reference so code
 * is never shared across languages.
 *
 * Table and unique index are created idempotently. The live app also runs
 * Model.sync({ alter: true }) on startup via app.js, so this migration is a
 * supplementary, manually-runnable backfill for environments not using sync.
 */
module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('coding_problem_languages')) {
      await queryInterface.createTable('coding_problem_languages', {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        problem_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: 'coding_problems', key: 'id' }, onDelete: 'CASCADE' },
        language: { type: DataTypes.STRING, allowNull: false },
        starter_code: { type: DataTypes.TEXT, allowNull: true },
        reference_solution: { type: DataTypes.TEXT, allowNull: true },
        time_limit: { type: DataTypes.INTEGER, allowNull: true, comment: 'Optional per-language execution time limit in seconds (falls back to problem time limit)' },
        memory_limit: { type: DataTypes.INTEGER, allowNull: true, comment: 'Optional per-language memory limit in MB (falls back to problem memory limit)' },
        order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('coding_problem_languages', ['problem_id', 'language'], {
        unique: true,
        name: 'coding_problem_languages_problem_language_unique',
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('coding_problem_languages')) {
      await queryInterface.dropTable('coding_problem_languages');
    }
  }
};
