'use strict';

/**
 * Course-centric restructure
 * ──────────────────────────
 * RECORD-OF-CHANGE migration.
 *
 * The actual schema changes for this restructure are applied at boot via
 *   • backend/src/config/bootstrapCourseSchema.js  (table rename)
 *   • Model.sync({ alter: true })                  (column adds)
 *
 * This file exists so the change shows up in the canonical
 * backend/database/migrations/ folder alongside the existing
 * 20260527-create-assessment-sessions migration. If/when this project moves
 * to sequelize-cli driven migrations, the up() body below is the authoritative
 * description of what should happen.
 *
 * Summary of changes:
 *   1. RENAME TABLE trainings → training_programs.
 *   2. ALTER training_programs ADD COLUMN thumbnail_url VARCHAR(500) NULL.
 *   3. CREATE TABLE courses
 *        (id, training_program_id FK, trainer_id FK, title, description,
 *         status ENUM('DRAFT','PUBLISHED','ARCHIVED'), thumbnail_url,
 *         created_at, updated_at).
 *   4. CREATE TABLE lesson_materials
 *        (id, lesson_id FK, material_type ENUM('NOTE','VIDEO','IMAGE','LINK','PDF','PPT'),
 *         title, content LONGTEXT, file_url, link_url, file_name, file_size,
 *         thumbnail_url, order_index, created_at, updated_at).
 *   5. CREATE TABLE course_trainer_assignments
 *        (id, course_id FK, trainer_id FK, assigned_at,
 *         UNIQUE(course_id, trainer_id)).
 *   6. ALTER lessons ADD COLUMN course_id BIGINT UNSIGNED NULL,
 *                   ADD COLUMN description TEXT NULL.
 *   7. ALTER ai_quizzes ADD COLUMN course_id BIGINT UNSIGNED NULL,
 *                       ADD COLUMN lesson_id BIGINT UNSIGNED NULL,
 *                       ADD COLUMN result_status ENUM('HIDDEN','PUBLISHED') DEFAULT 'HIDDEN',
 *                       ADD COLUMN is_mandatory BOOLEAN DEFAULT TRUE.
 *   8. ALTER enrollments ADD COLUMN course_id BIGINT UNSIGNED NULL,
 *                        ADD COLUMN progress_percent DECIMAL(5,2) DEFAULT 0.00,
 *                        MODIFY training_id BIGINT UNSIGNED NULL.
 *
 * Legacy columns (training_id on lessons/ai_quizzes/enrollments,
 * trainer_id/start_date/end_date/capacity on training_programs) are kept
 * nullable for backward compatibility with controllers that haven't yet been
 * migrated to the course-centric routes. They will be dropped in a follow-up
 * cleanup migration.
 */
module.exports = {
  async up(queryInterface) {
    // Implemented via boot bootstrap + per-model sync. This body is left
    // intentionally as documentation; see bootstrapCourseSchema.js.
  },

  async down(queryInterface) {
    throw new Error(
      'Reverting the course-centric restructure is not supported. ' +
      'Use scripts/wipe-except-admin.js --yes --drop-legacy to reset the DB instead.'
    );
  }
};
