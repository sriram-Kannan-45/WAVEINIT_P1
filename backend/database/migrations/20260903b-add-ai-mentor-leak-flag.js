'use strict';

const { DataTypes } = require('sequelize');

/**
 * AI Mentor answer-leak audit columns.
 *
 * Every mentor exchange is already logged with participant_id and the question
 * id (problem_id for coding, question_id for quiz). This migration adds the
 * leak-audit fields so a reviewer can filter for exchanges where the
 * response-level guard (backend/src/services/aiAnswerGuard.js) fired:
 *
 *   possible_leak_detected  BOOLEAN  NOT NULL DEFAULT false
 *   leak_reasons            VARCHAR(500) NULL   comma-separated reason codes
 *
 * Reason codes look like "gemini:branch_with_output" or
 * "gemini:reference_similarity:0.83" for coding, and "correct_answer_verbatim"
 * or "option_asserted_as_answer" for quiz.
 *
 * Columns are added idempotently (missing columns only), matching the pattern
 * used by 20260903-add-quiz-ai-mentor.js. Startup and the dedicated migration
 * command run this explicitly: sync({ alter: false }) cannot upgrade old tables,
 * and a late group of alter-sync calls can fail before reaching coding_ai_help.
 */
const LEAK_COLUMNS = {
  possible_leak_detected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  leak_reasons: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
};

const TARGET_TABLES = ['coding_ai_help', 'quiz_ai_help'];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const migrate = async (transaction) => {
      const options = transaction ? { transaction } : {};
      if (transaction) {
        // Serialize PostgreSQL replicas checking/adding the same columns.
        await sequelize.query('SELECT pg_advisory_xact_lock(60903, 1)', options);
        await sequelize.query("SET LOCAL lock_timeout = '10s'", options);
      }
      const tables = (await queryInterface.showAllTables(options))
        .map(table => typeof table === 'string' ? table : table.tableName);
      const added = [];
      for (const table of TARGET_TABLES) {
        if (!tables.includes(table)) continue;
        const cols = await queryInterface.describeTable(table, options);
        for (const [name, spec] of Object.entries(LEAK_COLUMNS)) {
          if (!cols[name]) {
            await queryInterface.addColumn(table, name, spec, options);
            added.push(`${table}.${name}`);
          }
        }
      }
      return added;
    };
    return sequelize.getDialect() === 'postgres'
      ? sequelize.transaction(migrate)
      : migrate();
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    for (const table of TARGET_TABLES) {
      if (!tables.includes(table)) continue;
      const cols = await queryInterface.describeTable(table);
      for (const name of Object.keys(LEAK_COLUMNS)) {
        if (cols[name]) {
          await queryInterface.removeColumn(table, name);
        }
      }
    }
  },
};
