/**
 * bootstrapCourseSchema.js
 * ─────────────────────────
 * One-shot, idempotent migration helper called from app.js at boot.
 *
 * Performs the structural changes that `Model.sync({ alter: true })` cannot
 * do safely on its own:
 *
 *   1. Rename `trainings` → `training_programs` if the legacy table is
 *      present and the new one isn't.
 *   2. If both tables exist (e.g. boot crashed mid-rename), drop the empty
 *      `training_programs` and rename. If both are populated, leave alone
 *      and warn loudly — that's a manual-intervention case.
 *
 * After this runs, the per-model `sync({ alter: true })` calls in app.js
 * will add the new columns (course_id, lesson_id, result_status, etc.) and
 * create the new tables (courses, lesson_materials,
 * course_trainer_assignments).
 *
 * Idempotent: every step checks current state via information_schema.
 */
const { sequelize } = require('../config/db');

async function tableExists(name) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [name] }
  );
  return rows[0].c > 0;
}

async function rowCount(name) {
  try {
    const [rows] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM \`${name}\``
    );
    return rows[0].c;
  } catch {
    return 0;
  }
}

async function bootstrapCourseSchema(logger = console) {
  const hasOld = await tableExists('trainings');
  const hasNew = await tableExists('training_programs');

  // Helper that disables FK checks while running a body — needed because
  // courses.training_program_id holds a FK that blocks DROP/RENAME of
  // `training_programs` even when the target is empty.
  async function withoutFkChecks(body) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      return await body();
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }

  if (hasOld && !hasNew) {
    logger.info('[course-schema] renaming trainings → training_programs');
    await withoutFkChecks(() =>
      sequelize.query('RENAME TABLE `trainings` TO `training_programs`')
    );
    return { renamed: true };
  }

  if (hasOld && hasNew) {
    const oldCount = await rowCount('trainings');
    const newCount = await rowCount('training_programs');

    if (oldCount === 0) {
      logger.info('[course-schema] dropping empty legacy `trainings` table');
      await withoutFkChecks(() => sequelize.query('DROP TABLE `trainings`'));
      return { droppedEmptyLegacy: true };
    }
    if (newCount === 0) {
      logger.info(
        '[course-schema] dropping empty `training_programs` then renaming legacy table'
      );
      await withoutFkChecks(async () => {
        await sequelize.query('DROP TABLE `training_programs`');
        await sequelize.query(
          'RENAME TABLE `trainings` TO `training_programs`'
        );
      });
      return { renamed: true };
    }
    logger.warn(
      '[course-schema] BOTH `trainings` and `training_programs` are populated. ' +
      'Manual reconciliation required — leaving as-is.'
    );
    await ensureAiQuizColumns(logger);
    return { conflict: true };
  }

  // Only `training_programs` exists, or neither — sync will handle creation.
  await ensureAiQuizColumns(logger);
  return { noop: true };
}

async function ensureAiQuizColumns(logger = console) {
  try {
    if (!(await tableExists('ai_quizzes'))) {
      logger.info('[course-schema] ai_quizzes table does not exist yet. Skipping column check.');
      return;
    }

    const colsToAdd = [
      { name: 'quiz_id', type: 'BIGINT UNSIGNED NULL' },
      { name: 'question_count', type: 'INT NULL' },
      { name: 'created_by', type: 'BIGINT UNSIGNED NULL' },
      { name: 'published', type: 'BOOLEAN DEFAULT FALSE' }
    ];

    for (const col of colsToAdd) {
      const exists = await columnExists('ai_quizzes', col.name);
      if (!exists) {
        logger.info(`[course-schema] Adding missing column ai_quizzes.${col.name}`);
        await sequelize.query(`ALTER TABLE \`ai_quizzes\` ADD COLUMN \`${col.name}\` ${col.type}`);
      }
    }
  } catch (err) {
    logger.error(`[course-schema] Error ensuring ai_quizzes columns: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Index helpers — applied AFTER per-model sync({alter:true}) has added the
// new columns. Wrapped in try/catch so re-runs (index already exists) don't
// crash boot.
// ─────────────────────────────────────────────────────────────────────────────

async function indexExists(table, indexName) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    { replacements: [table, indexName] }
  );
  return rows[0].c > 0;
}

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows[0].c > 0;
}

async function columnIsNullable(table, column) {
  const [rows] = await sequelize.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows.length > 0 && rows[0].IS_NULLABLE === 'YES';
}

/**
 * Pre-sync alters that Sequelize's diff cannot do cleanly.
 *
 * Two passes:
 *   (1) Explicit list — columns that the new model declarations have flipped
 *       from NOT NULL → NULL, but the DB column hasn't been altered yet.
 *       Without this, Sequelize emits ALTER TABLE that races with the FK
 *       constraint update and fails with "Column 'X' cannot be NOT NULL:
 *       needed in a foreign key constraint Y SET NULL".
 *   (2) Generic scan — any FK in the schema with ON DELETE/UPDATE = SET NULL
 *       on a still-NOT-NULL column. Catches inconsistent legacy state.
 *
 * Idempotent and safe to run on every boot.
 */
async function relaxLegacyTrainingIdColumns(logger = console) {
  // (1) Explicit pre-relax targets — see column nullability changes in
  //     models/lesson.js, aiQuiz.js, enrollment.js, training.js.
  const explicitTargets = [
    { table: 'lessons',           column: 'training_id' },
    { table: 'enrollments',       column: 'training_id' },
    { table: 'ai_quizzes',        column: 'training_id' },
    { table: 'ai_quizzes',        column: 'document_id' },
    { table: 'training_programs', column: 'trainer_id'  },
  ];

  for (const { table, column } of explicitTargets) {
    if (!(await tableExists(table))) continue;
    if (!(await columnExists(table, column))) continue;
    if (await columnIsNullable(table, column)) continue;

    try {
      // Look up the actual COLUMN_TYPE so we don't accidentally narrow it.
      const [r] = await sequelize.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        { replacements: [table, column] }
      );
      const colType = r[0]?.COLUMN_TYPE || 'BIGINT UNSIGNED';
      await sequelize.query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${colType} NULL`
      );
      logger.info(`[course-schema] relaxed ${table}.${column} → NULL (explicit)`);
    } catch (e) {
      logger.warn(
        `[course-schema] could not relax ${table}.${column}: ${e.message}`
      );
    }
  }

  // (2) Generic scan — any FK with SET NULL action on a still-NOT-NULL column.
  const [rows] = await sequelize.query(
    `
    SELECT
      kcu.TABLE_NAME           AS tableName,
      kcu.COLUMN_NAME          AS columnName,
      kcu.CONSTRAINT_NAME      AS constraintName,
      rc.DELETE_RULE           AS onDelete,
      rc.UPDATE_RULE           AS onUpdate,
      cols.IS_NULLABLE         AS isNullable,
      cols.COLUMN_TYPE         AS columnType
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
     AND rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
    JOIN information_schema.COLUMNS cols
      ON cols.TABLE_SCHEMA = kcu.TABLE_SCHEMA
     AND cols.TABLE_NAME   = kcu.TABLE_NAME
     AND cols.COLUMN_NAME  = kcu.COLUMN_NAME
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND (rc.DELETE_RULE = 'SET NULL' OR rc.UPDATE_RULE = 'SET NULL')
      AND cols.IS_NULLABLE = 'NO'
    `
  );

  for (const r of rows) {
    try {
      await sequelize.query(
        `ALTER TABLE \`${r.tableName}\` MODIFY COLUMN \`${r.columnName}\` ${r.columnType} NULL`
      );
      logger.info(
        `[course-schema] relaxed ${r.tableName}.${r.columnName} → NULL ` +
        `(scan: FK ${r.constraintName} ${r.onDelete}/${r.onUpdate})`
      );
    } catch (e) {
      logger.warn(
        `[course-schema] could not relax ${r.tableName}.${r.columnName}: ${e.message}`
      );
    }
  }
}

async function addIndexIfMissing(table, indexName, columns, { unique = false } = {}, logger = console) {
  // Verify all referenced columns exist first — otherwise CREATE INDEX
  // throws "Key column ... doesn't exist in table".
  for (const col of columns) {
    if (!(await columnExists(table, col))) {
      logger.warn(`[course-schema] skipping index ${indexName}: column ${table}.${col} missing`);
      return false;
    }
  }
  if (await indexExists(table, indexName)) return false;
  const colList = columns.map(c => `\`${c}\``).join(', ');
  const sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` ON \`${table}\` (${colList})`;
  await sequelize.query(sql);
  logger.info(`[course-schema] created index ${indexName} on ${table}`);
  return true;
}

/**
 * Called from app.js AFTER all per-model sync({alter:true}) blocks have run.
 * Adds the indexes that were intentionally left out of the model definitions
 * to avoid the global-sync race.
 */
async function bootstrapCourseIndexes(logger = console) {
  try {
    await addIndexIfMissing('lessons', 'idx_lessons_course_order',
      ['course_id', 'order_index'], {}, logger);
    await addIndexIfMissing('lessons', 'idx_lessons_training',
      ['training_id'], {}, logger);
    await addIndexIfMissing('lessons', 'idx_lessons_trainer',
      ['trainer_id'], {}, logger);

    await addIndexIfMissing('ai_quizzes', 'idx_ai_quizzes_course',
      ['course_id'], {}, logger);
    await addIndexIfMissing('ai_quizzes', 'idx_ai_quizzes_lesson',
      ['lesson_id'], {}, logger);
    await addIndexIfMissing('ai_quizzes', 'idx_ai_quizzes_result_status',
      ['result_status'], {}, logger);

    await addIndexIfMissing('enrollments', 'idx_enrollments_course',
      ['course_id'], {}, logger);
    await addIndexIfMissing('enrollments', 'idx_enrollments_participant',
      ['participant_id'], {}, logger);
    await addIndexIfMissing('enrollments', 'enrollments_course_participant_unique',
      ['course_id', 'participant_id'], { unique: true }, logger);
  } catch (e) {
    logger.warn(`[course-schema] index bootstrap warning: ${e.message}`);
  }
}

async function syncMissingCourses(logger = console) {
  try {
    const { Training, Course, CourseTrainerAssignment, TrainingTrainerAssignment } = require('../models');
    
    // Find all training programs (Training)
    const trainings = await Training.findAll();
    logger.info(`[course-schema] Syncing courses: found ${trainings.length} training programs`);

    for (const training of trainings) {
      // Check if corresponding Course exists
      const courseExists = await Course.findOne({ where: { trainingProgramId: training.id } });
      if (!courseExists) {
        logger.info(`[course-schema] Auto-creating missing course for training ID ${training.id} ("${training.title}")`);
        
        // Find assigned trainer IDs from TrainingTrainerAssignment
        const assignments = await TrainingTrainerAssignment.findAll({
          where: { trainingId: training.id }
        });
        const trainerIds = assignments.map(a => a.trainerId);
        
        // Primary trainer ID
        const primaryTrainerId = training.trainerId || trainerIds[0] || 1; // fallback to admin/user 1 if none
        
        const course = await Course.create({
          trainingProgramId: training.id,
          trainerId: primaryTrainerId,
          title: training.title,
          description: training.description || null,
          status: 'PUBLISHED'
        });
        
        logger.info(`[course-schema] Course created (ID: ${course.id}) for training ID ${training.id}`);

        // Sync trainer assignments in CourseTrainerAssignment
        const allTrainerIds = Array.from(new Set([primaryTrainerId, ...trainerIds]));
        const courseAssignments = allTrainerIds.map(tId => ({
          courseId: course.id,
          trainerId: tId
        }));
        
        await CourseTrainerAssignment.bulkCreate(courseAssignments, { ignoreDuplicates: true });
        logger.info(`[course-schema] Synced ${courseAssignments.length} trainer assignments for course ID ${course.id}`);
      } else {
        // Even if course exists, make sure trainer assignments are synced!
        const assignments = await TrainingTrainerAssignment.findAll({
          where: { trainingId: training.id }
        });
        const trainerIds = assignments.map(a => a.trainerId);
        const allTrainerIds = Array.from(new Set([courseExists.trainerId, ...trainerIds]));
        const courseAssignments = allTrainerIds.map(tId => ({
          courseId: courseExists.id,
          trainerId: tId
        }));
        await CourseTrainerAssignment.bulkCreate(courseAssignments, { ignoreDuplicates: true });
      }
    }
  } catch (error) {
    logger.error('[course-schema] Error syncing missing courses:', error.message);
  }
}

module.exports = { bootstrapCourseSchema, bootstrapCourseIndexes, relaxLegacyTrainingIdColumns, syncMissingCourses };

