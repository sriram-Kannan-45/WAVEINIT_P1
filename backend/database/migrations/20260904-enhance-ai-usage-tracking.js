'use strict';

const { DataTypes } = require('sequelize');

/**
 * Enhanced AI usage tracking
 * ──────────────────────────────────────────────
 * Adds support for:
 *   1. AI assistance level tracking (hint, approach, code guidance)
 *   2. AI assistance category tracking for better analytics
 *   3. AI usage statistics in coding results
 *   4. Configurable AI usage level evaluation
 */
module.exports = {
  async up(queryInterface) {
    // 1. coding_ai_help — Enhanced tracking
    let cols = await queryInterface.describeTable('coding_ai_help');
    if (!cols.assistance_level) {
      await queryInterface.addColumn('coding_ai_help', 'assistance_level', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Level of AI assistance requested (1=Hint, 2=Approach, 3=Code Guidance)'
      });
    }
    if (!cols.assistance_category) {
      await queryInterface.addColumn('coding_ai_help', 'assistance_category', {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Category of assistance: hint, approach, explain_error, explain_problem, code_guidance, custom'
      });
    }

    // 2. coding_results — AI usage statistics
    cols = await queryInterface.describeTable('coding_results');
    if (!cols.ai_used) {
      await queryInterface.addColumn('coding_results', 'ai_used', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether AI assistance was used during the assessment'
      });
    }
    if (!cols.ai_interaction_count) {
      await queryInterface.addColumn('coding_results', 'ai_interaction_count', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of AI interactions across all questions'
      });
    }
    if (!cols.ai_usage_details) {
      await queryInterface.addColumn('coding_results', 'ai_usage_details', {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Detailed AI usage breakdown per question'
      });
    }
    if (!cols.ai_usage_level) {
      await queryInterface.addColumn('coding_results', 'ai_usage_level', {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'AI usage level category: NONE, LIGHT, MODERATE, HIGH'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('coding_ai_help', 'assistance_level');
    await queryInterface.removeColumn('coding_ai_help', 'assistance_category');
    await queryInterface.removeColumn('coding_results', 'ai_used');
    await queryInterface.removeColumn('coding_results', 'ai_interaction_count');
    await queryInterface.removeColumn('coding_results', 'ai_usage_details');
    await queryInterface.removeColumn('coding_results', 'ai_usage_level');
  }
};
