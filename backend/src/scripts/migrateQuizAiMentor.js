'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { connectDB, sequelize } = require('../config/db');

/**
 * One-time, idempotent migration for the AI Quiz mentor feature.
 *
 * Applies the same `ADD COLUMN IF NOT EXISTS` statements that the startup
 * bootstrap in src/config/db.js runs on every boot. Safe to run on an existing
 * database: existing rows receive the NOT NULL DEFAULT and are never dropped,
 * and the table is never recreated.
 *
 * Fixes the root cause of:
 *   column "ai_assistant_enabled" of relation "ai_quizzes" does not exist
 */

(async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();

    const isPostgres = sequelize.getDialect() === 'postgres';

    if (isPostgres) {
      await sequelize.query('ALTER TABLE "ai_quizzes" ADD COLUMN IF NOT EXISTS "ai_assistant_enabled" BOOLEAN NOT NULL DEFAULT TRUE;');
      await sequelize.query('ALTER TABLE "ai_quizzes" ADD COLUMN IF NOT EXISTS "ai_help_limit" INTEGER NOT NULL DEFAULT 0;');
      await sequelize.query('ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "ai_help_usage" INTEGER NOT NULL DEFAULT 0;');
      // quiz_ai_help audit table (idempotent)
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS quiz_ai_help (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          attempt_id      BIGINT NOT NULL,
          question_id     BIGINT NOT NULL,
          participant_id  BIGINT NOT NULL,
          prompt          TEXT NOT NULL,
          response        TEXT NOT NULL,
          question_text   TEXT,
          selected_answer TEXT,
          usage_number    INTEGER NOT NULL DEFAULT 1,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } else {
      try { await sequelize.query('ALTER TABLE `ai_quizzes` ADD COLUMN `ai_assistant_enabled` TINYINT(1) NOT NULL DEFAULT 1'); } catch (_) {}
      try { await sequelize.query('ALTER TABLE `ai_quizzes` ADD COLUMN `ai_help_limit` INT NOT NULL DEFAULT 0'); } catch (_) {}
      try { await sequelize.query('ALTER TABLE `quiz_attempts` ADD COLUMN `ai_help_usage` INT NOT NULL DEFAULT 0'); } catch (_) {}
    }

    console.log('✅ AI Quiz mentor columns ensured (ai_quizzes.ai_assistant_enabled, ai_quizzes.ai_help_limit, quiz_attempts.ai_help_usage).');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
})();
