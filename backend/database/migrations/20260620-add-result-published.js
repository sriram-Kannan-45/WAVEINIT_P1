'use strict';

/**
 * Add per-result publication columns to quiz_results
 * ──────────────────────────────────────────────────
 * Previously, result visibility was controlled solely by the
 * quiz-level showResultImmediately / status=RESULTS_PUBLISHED
 * flags. This migration adds per-participant granularity so that:
 *
 *   1. Scores are hidden immediately after submission.
 *   2. The trainer can publish individual results (or all at once).
 *   3. The leaderboard excludes unpublished results.
 *
 * New columns on quiz_results:
 *   • result_published  BOOLEAN  DEFAULT FALSE   — has the trainer released this result?
 *   • published_at      DATETIME NULL            — when it was released
 *   • published_by      BIGINT   NULL            — which trainer released it
 */
module.exports = {
  async up(queryInterface) {
    const table = 'quiz_results';

    const cols = await queryInterface.describeTable(table);

    if (!cols.result_published) {
      await queryInterface.addColumn(table, 'result_published', {
        type: 'BOOLEAN',
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!cols.published_at) {
      await queryInterface.addColumn(table, 'published_at', {
        type: 'DATETIME',
        allowNull: true,
      });
    }
    if (!cols.published_by) {
      await queryInterface.addColumn(table, 'published_by', {
        type: 'BIGINT UNSIGNED',
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('quiz_results', 'result_published');
    await queryInterface.removeColumn('quiz_results', 'published_at');
    await queryInterface.removeColumn('quiz_results', 'published_by');
  }
};
