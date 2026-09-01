'use strict';

/**
 * Backfill per-language config rows for legacy single-language coding problems.
 * ─────────────────────────────────────────────────────────────────────────────
 * Older problems were created with only scalar columns:
 *   coding_problems.programming_language / starter_code / expected_solution
 *
 * This migration materializes those into the structured per-language table
 * (coding_problem_languages) so the Edit modal can show language tabs and the
 * participant selector reflects the configured language — WITHOUT losing any
 * code. Existing per-language rows are left untouched (idempotent).
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    let hasProblems;
    let hasLangs;
    try {
      hasProblems = await q.query(
        "SELECT to_regclass('public.coding_problems') IS NOT NULL AS ok",
        { type: q.QueryTypes.SELECT }
      );
      hasLangs = await q.query(
        "SELECT to_regclass('public.coding_problem_languages') IS NOT NULL AS ok",
        { type: q.QueryTypes.SELECT }
      );
    } catch (e) {
      return; // Non-Postgres dialect — skip silently.
    }
    if (!hasProblems?.[0]?.ok || !hasLangs?.[0]?.ok) return;

    // Legacy problems that have no per-language row yet.
    await q.query(`
      INSERT INTO coding_problem_languages
        (problem_id, language, starter_code, reference_solution,
         starter_code_source, reference_solution_source, generation_status,
         "order", created_at, updated_at)
      SELECT
        p.id,
        lower(p.programming_language),
        p.starter_code,
        p.expected_solution,
        'manual', 'manual',
        CASE WHEN p.expected_solution IS NOT NULL AND p.expected_solution <> '' THEN 'completed' ELSE 'pending' END,
        0,
        now(), now()
      FROM coding_problems p
      WHERE p.programming_language IS NOT NULL AND p.programming_language <> ''
        AND NOT EXISTS (
          SELECT 1 FROM coding_problem_languages l
          WHERE l.problem_id = p.id AND lower(l.language) = lower(p.programming_language)
        )
    `);
  },

  async down() {
    // Data backfill is not reversible; no-op.
  }
};
