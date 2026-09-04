'use strict';

const { DataTypes } = require('sequelize');

/**
 * Quiz AI Mentor enhancements.
 *
 * Adds support for:
 *   1. AI mentor (Socratic study helper) configuration per quiz
 *      (ai_assistant_enabled, ai_help_limit)
 *   2. AI help usage tracking on quiz attempts (ai_help_usage)
 *   3. A log of every AI mentor exchange (quiz_ai_help)
 *
 * Columns are added idempotently (missing columns only). The live app also
 * runs Model.sync({ alter: true }) on startup, so this migration is a
 * supplementary, manually-runnable backfill for environments not using sync.
 */
module.exports = {
  async up(queryInterface) {
    // 1. ai_quizzes - AI mentor configuration
    let cols = await queryInterface.describeTable('ai_quizzes');
    if (!cols.ai_assistant_enabled) {
      await queryInterface.addColumn('ai_quizzes', 'ai_assistant_enabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!cols.ai_help_limit) {
      await queryInterface.addColumn('ai_quizzes', 'ai_help_limit', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    // 2. quiz_attempts - AI help usage counter
    cols = await queryInterface.describeTable('quiz_attempts');
    if (!cols.ai_help_usage) {
      await queryInterface.addColumn('quiz_attempts', 'ai_help_usage', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    // 3. quiz_ai_help table (idempotent create)
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('quiz_ai_help')) {
      await queryInterface.createTable('quiz_ai_help', {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        attempt_id: { type: DataTypes.BIGINT, allowNull: false },
        question_id: { type: DataTypes.BIGINT, allowNull: false },
        participant_id: { type: DataTypes.BIGINT, allowNull: false },
        prompt: { type: DataTypes.TEXT, allowNull: false },
        response: { type: DataTypes.TEXT, allowNull: false },
        question_text: { type: DataTypes.TEXT, allowNull: true },
        selected_answer: { type: DataTypes.TEXT, allowNull: true },
        usage_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ai_quizzes', 'ai_assistant_enabled');
    await queryInterface.removeColumn('ai_quizzes', 'ai_help_limit');
    await queryInterface.removeColumn('quiz_attempts', 'ai_help_usage');
    await queryInterface.dropTable('quiz_ai_help');
  }
};
