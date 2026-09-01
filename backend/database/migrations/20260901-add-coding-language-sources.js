'use strict';

const { DataTypes } = require('sequelize');

/**
 * Multi-language AI generation sources
 * ──────────────────────────────────────────────
 * Adds generation provenance + lifecycle columns to coding_problem_languages so
 * the trainer UI can auto-generate starter/reference code per language WITHOUT
 * ever overwriting manually-edited code.
 *
 *   starter_code_source          'generated' | 'manual'
 *   reference_solution_source    'generated' | 'manual'
 *   generation_status            'pending'   | 'generating' | 'completed'
 *
 * Columns are added idempotently (missing columns only). The live app also runs
 * Model.sync({ alter: true }) on startup, so this migration is a supplementary,
 * manually-runnable backfill for environments not using sync.
 */
module.exports = {
  async up(queryInterface) {
    let cols;
    try {
      cols = await queryInterface.describeTable('coding_problem_languages');
    } catch (e) {
      // Table does not exist yet (no per-language rows) — nothing to migrate.
      return;
    }
    if (!cols.starter_code_source) {
      await queryInterface.addColumn('coding_problem_languages', 'starter_code_source', {
        type: DataTypes.ENUM('generated', 'manual'),
        allowNull: false,
        defaultValue: 'manual',
      });
    }
    if (!cols.reference_solution_source) {
      await queryInterface.addColumn('coding_problem_languages', 'reference_solution_source', {
        type: DataTypes.ENUM('generated', 'manual'),
        allowNull: false,
        defaultValue: 'manual',
      });
    }
    if (!cols.generation_status) {
      await queryInterface.addColumn('coding_problem_languages', 'generation_status', {
        type: DataTypes.ENUM('pending', 'generating', 'completed'),
        allowNull: false,
        defaultValue: 'pending',
      });
    }
  },

  async down(queryInterface) {
    let cols;
    try {
      cols = await queryInterface.describeTable('coding_problem_languages');
    } catch (e) {
      return;
    }
    if (cols.starter_code_source) await queryInterface.removeColumn('coding_problem_languages', 'starter_code_source');
    if (cols.reference_solution_source) await queryInterface.removeColumn('coding_problem_languages', 'reference_solution_source');
    if (cols.generation_status) await queryInterface.removeColumn('coding_problem_languages', 'generation_status');
  }
};
