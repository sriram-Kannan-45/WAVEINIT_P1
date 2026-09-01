'use strict';

const { DataTypes } = require('sequelize');

/**
 * Required Concepts (structured code requirements)
 * ─────────────────────────────────────────────────
 * Adds coding_problems.required_concepts (JSON) so trainers can specify concepts
 * a participant's solution MUST use (e.g. for loop, while loop, function,
 * recursion, class, array/list). This is deliberately kept SEPARATE from the
 * problem's `constraints` text column (which only describes the problem).
 *
 * Column is added idempotently. The live app also runs Model.sync({ alter: true })
 * on startup, so this migration is a supplementary manual backfill.
 */
module.exports = {
  async up(queryInterface) {
    let cols;
    try {
      cols = await queryInterface.describeTable('coding_problems');
    } catch (e) {
      return; // Table does not exist yet.
    }
    if (!cols.required_concepts) {
      await queryInterface.addColumn('coding_problems', 'required_concepts', {
        type: DataTypes.JSON,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    let cols;
    try {
      cols = await queryInterface.describeTable('coding_problems');
    } catch (e) {
      return;
    }
    if (cols.required_concepts) {
      await queryInterface.removeColumn('coding_problems', 'required_concepts');
    }
  }
};
