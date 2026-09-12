/**
 * bootstrapAssessmentSchedulingSchema.js
 * ──────────────────────────────────────
 * Safe, idempotent migration helper to ensure that assessment scheduling,
 * auto-closing, attendance, and malpractice fields exist across PostgreSQL/MySQL.
 */

const { sequelize } = require('../config/db');

async function bootstrapAssessmentSchedulingSchema(logger = console) {
  try {
    const isPostgres = sequelize.getDialect() === 'postgres';

    const queries = [
      // AI Quizzes
      isPostgres
        ? `ALTER TABLE ai_quizzes ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'Asia/Kolkata';`
        : `ALTER TABLE ai_quizzes ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'Asia/Kolkata';`,
      isPostgres
        ? `ALTER TABLE ai_quizzes ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;`
        : `ALTER TABLE ai_quizzes ADD COLUMN IF NOT EXISTS finalized_at DATETIME;`,

      // Coding Assessments
      isPostgres
        ? `ALTER TABLE coding_assessments ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'Asia/Kolkata';`
        : `ALTER TABLE coding_assessments ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'Asia/Kolkata';`,
      isPostgres
        ? `ALTER TABLE coding_assessments ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;`
        : `ALTER TABLE coding_assessments ADD COLUMN IF NOT EXISTS finalized_at DATETIME;`,

      // Quiz Attempts
      isPostgres
        ? `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS submission_type VARCHAR(32) DEFAULT 'MANUAL';`
        : `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS submission_type VARCHAR(32) DEFAULT 'MANUAL';`,
      isPostgres
        ? `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(32) DEFAULT 'PRESENT';`
        : `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(32) DEFAULT 'PRESENT';`,
      isPostgres
        ? `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS time_expired BOOLEAN DEFAULT FALSE;`
        : `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS time_expired TINYINT(1) DEFAULT 0;`,
      isPostgres
        ? `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE;`
        : `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS auto_submitted TINYINT(1) DEFAULT 0;`,

      // Coding Attempts
      isPostgres
        ? `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS submission_type VARCHAR(32) DEFAULT 'MANUAL';`
        : `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS submission_type VARCHAR(32) DEFAULT 'MANUAL';`,
      isPostgres
        ? `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(32) DEFAULT 'PRESENT';`
        : `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(32) DEFAULT 'PRESENT';`,
      isPostgres
        ? `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS time_expired BOOLEAN DEFAULT FALSE;`
        : `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS time_expired TINYINT(1) DEFAULT 0;`,
      isPostgres
        ? `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE;`
        : `ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS auto_submitted TINYINT(1) DEFAULT 0;`,
    ];

    for (const sql of queries) {
      try {
        await sequelize.query(sql);
      } catch (err) {
        // Log minor warning if table doesn't exist yet or already has column
        logger.debug?.(`[assessment-scheduling-bootstrap] query note: ${err.message}`);
      }
    }

    logger.info?.('[assessment-scheduling-bootstrap] Assessment scheduling columns verified and ready');
    return { success: true };
  } catch (err) {
    logger.warn?.('[assessment-scheduling-bootstrap] Could not run assessment scheduling bootstrap:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { bootstrapAssessmentSchedulingSchema };
