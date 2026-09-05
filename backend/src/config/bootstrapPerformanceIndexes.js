/**
 * bootstrapPerformanceIndexes.js
 * ─────────────────────────────────────────────────────────────
 * Dynamically creates high-performance indexes on database tables
 * by detecting the actual column casing (snake_case vs camelCase)
 * in PostgreSQL and MySQL.
 */

const logger = require('../utils/logger');

async function getBulkTableMetadata(sequelize, tableNames) {
  const isPostgres = sequelize.getDialect() === 'postgres';
  const tableColumns = new Map();
  const existingIndexes = new Set();

  try {
    const inList = tableNames.map(t => `'${t}'`).join(',');
    
    // 1. Fetch all columns for all target tables in one query
    const colQuery = isPostgres
      ? `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${inList});`
      : `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN (${inList});`;
    
    // 2. Fetch all existing index names in one query
    const idxQuery = isPostgres
      ? `SELECT indexname as index_name FROM pg_indexes WHERE schemaname = 'public';`
      : `SELECT DISTINCT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name IN (${inList});`;

    const [[colResults], [idxResults]] = await Promise.all([
      sequelize.query(colQuery).catch(() => [[]]),
      sequelize.query(idxQuery).catch(() => [[]]),
    ]);

    for (const r of (colResults || [])) {
      const t = (r.table_name || r.TABLE_NAME || '').toLowerCase();
      const c = r.column_name || r.COLUMN_NAME;
      if (!tableColumns.has(t)) tableColumns.set(t, new Set());
      tableColumns.get(t).add(c);
    }

    for (const r of (idxResults || [])) {
      const name = r.index_name || r.indexname;
      if (name) existingIndexes.add(name.toLowerCase());
    }
  } catch (err) {
    logger.debug(`[bootstrapPerformanceIndexes] Metadata prefetch note: ${err.message}`);
  }

  return { tableColumns, existingIndexes };
}

async function createIndexSafely(sequelize, tableName, indexName, candidateColumnGroups, tableColumns, existingIndexes) {
  try {
    // Fast skip: if index already exists in database, skip execution
    if (existingIndexes && existingIndexes.has(indexName.toLowerCase())) {
      return;
    }

    const lowerTable = tableName.toLowerCase();
    const existingCols = tableColumns ? tableColumns.get(lowerTable) : null;
    if (!existingCols || existingCols.size === 0) return;

    // Find matching columns
    const resolvedCols = [];
    for (const group of candidateColumnGroups) {
      const match = group.candidates.find(c => existingCols.has(c));
      if (match) {
        resolvedCols.push({ col: match, order: group.order || '' });
      }
    }

    if (resolvedCols.length === 0) return;

    const isPostgres = sequelize.getDialect() === 'postgres';
    const colsSql = resolvedCols
      .map(r => {
        const quoted = isPostgres ? `"${r.col}"` : `\`${r.col}\``;
        return r.order ? `${quoted} ${r.order}` : quoted;
      })
      .join(', ');

    if (isPostgres) {
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" (${colsSql});`
      );
    } else {
      await sequelize.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${colsSql});`);
    }

    if (existingIndexes) existingIndexes.add(indexName.toLowerCase());
  } catch (err) {
    if (!err.message?.includes('already exists') && !err.message?.includes('duplicate key')) {
      logger.debug(`[bootstrapPerformanceIndexes] Note for ${indexName}: ${err.message}`);
    }
  }
}

async function bootstrapPerformanceIndexes(sequelize) {
  if (!sequelize) return;
  logger.info('⚡ Initializing database performance indexes...');

  const indexDefinitions = [
    // ── Users ──
    {
      table: 'users', name: 'idx_perf_users_role_status',
      cols: [{ candidates: ['role'] }, { candidates: ['status'] }, { candidates: ['isDeleted', 'is_deleted'] }]
    },
    {
      table: 'users', name: 'idx_perf_users_email',
      cols: [{ candidates: ['email'] }]
    },

    // ── Courses & Trainings ──
    {
      table: 'courses', name: 'idx_perf_courses_trainer_status',
      cols: [{ candidates: ['trainerId', 'trainer_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'courses', name: 'idx_perf_courses_program',
      cols: [{ candidates: ['trainingProgramId', 'training_program_id', 'trainingId', 'training_id'] }]
    },
    {
      table: 'courses', name: 'idx_perf_courses_status_created',
      cols: [{ candidates: ['status'] }, { candidates: ['created_at', 'createdAt'], order: 'DESC' }]
    },
    {
      table: 'trainings', name: 'idx_perf_trainings_trainer',
      cols: [{ candidates: ['trainerId', 'trainer_id'] }, { candidates: ['endDate', 'end_date'] }]
    },

    // ── Enrollments ──
    {
      table: 'enrollments', name: 'idx_perf_enroll_part_course',
      cols: [{ candidates: ['participantId', 'participant_id'] }, { candidates: ['courseId', 'course_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'enrollments', name: 'idx_perf_enroll_part_train',
      cols: [{ candidates: ['participantId', 'participant_id'] }, { candidates: ['trainingId', 'training_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'enrollments', name: 'idx_perf_enroll_course_stat',
      cols: [{ candidates: ['courseId', 'course_id'] }, { candidates: ['status'] }]
    },

    // ── Lessons & Progress ──
    {
      table: 'lessons', name: 'idx_perf_lessons_course_order',
      cols: [{ candidates: ['courseId', 'course_id'] }, { candidates: ['order'] }]
    },
    {
      table: 'lesson_materials', name: 'idx_perf_mat_lesson_order',
      cols: [{ candidates: ['lessonId', 'lesson_id'] }, { candidates: ['order'] }]
    },
    {
      table: 'lesson_progress', name: 'idx_perf_lp_part_lesson',
      cols: [{ candidates: ['participantId', 'participant_id'] }, { candidates: ['lessonId', 'lesson_id'] }, { candidates: ['status'] }]
    },

    // ── AI Quizzes & Results ──
    {
      table: 'ai_quizzes', name: 'idx_perf_quiz_course_stat',
      cols: [{ candidates: ['courseId', 'course_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'ai_quizzes', name: 'idx_perf_quiz_trainer',
      cols: [{ candidates: ['trainerId', 'trainer_id'] }]
    },
    {
      table: 'ai_questions', name: 'idx_perf_q_quiz_order',
      cols: [{ candidates: ['quizId', 'quiz_id'] }, { candidates: ['order'] }]
    },
    {
      table: 'ai_question_options', name: 'idx_perf_opt_q_order',
      cols: [{ candidates: ['questionId', 'question_id'] }, { candidates: ['order'] }]
    },
    {
      table: 'quiz_attempts', name: 'idx_perf_qa_quiz_part',
      cols: [{ candidates: ['quizId', 'quiz_id'] }, { candidates: ['participantId', 'participant_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'quiz_results', name: 'idx_perf_qr_quiz_pct',
      cols: [{ candidates: ['quizId', 'quiz_id'] }, { candidates: ['percentage'], order: 'DESC' }]
    },
    {
      table: 'quiz_results', name: 'idx_perf_qr_part',
      cols: [{ candidates: ['participantId', 'participant_id'] }]
    },

    // ── Coding Assessments & Submissions ──
    {
      table: 'coding_assessments', name: 'idx_perf_ca_course_stat',
      cols: [{ candidates: ['courseId', 'course_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'coding_assessments', name: 'idx_perf_ca_trainer',
      cols: [{ candidates: ['trainerId', 'trainer_id'] }]
    },
    {
      table: 'coding_problems', name: 'idx_perf_cp_assess_order',
      cols: [{ candidates: ['assessmentId', 'assessment_id'] }, { candidates: ['order'] }]
    },
    {
      table: 'coding_test_cases', name: 'idx_perf_ctc_prob_hidden',
      cols: [{ candidates: ['problemId', 'problem_id'] }, { candidates: ['isHidden', 'is_hidden'] }]
    },
    {
      table: 'coding_problem_languages', name: 'idx_perf_cpl_prob',
      cols: [{ candidates: ['problemId', 'problem_id'] }, { candidates: ['language'] }]
    },
    {
      table: 'coding_attempts', name: 'idx_perf_ca_assess_part',
      cols: [{ candidates: ['assessmentId', 'assessment_id'] }, { candidates: ['participantId', 'participant_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'coding_submissions', name: 'idx_perf_cs_att_prob',
      cols: [{ candidates: ['attemptId', 'attempt_id'] }, { candidates: ['problemId', 'problem_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'coding_results', name: 'idx_perf_cr_assess_pct',
      cols: [{ candidates: ['assessmentId', 'assessment_id'] }, { candidates: ['percentage'], order: 'DESC' }]
    },
    {
      table: 'coding_results', name: 'idx_perf_cr_part',
      cols: [{ candidates: ['participantId', 'participant_id'] }]
    },

    // ── Feedbacks, Certificates, Interviews ──
    {
      table: 'feedbacks', name: 'idx_perf_fb_train_part',
      cols: [{ candidates: ['trainingId', 'training_id'] }, { candidates: ['participantId', 'participant_id'] }]
    },
    {
      table: 'certificates', name: 'idx_perf_cert_part',
      cols: [{ candidates: ['participantId', 'participant_id'] }]
    },
    {
      table: 'interviews', name: 'idx_perf_int_trainer_part',
      cols: [{ candidates: ['trainerId', 'trainer_id'] }, { candidates: ['participantId', 'participant_id'] }, { candidates: ['status'] }]
    },
    {
      table: 'coding_ai_help', name: 'idx_perf_cah_att_prob',
      cols: [{ candidates: ['attemptId', 'attempt_id'] }, { candidates: ['problemId', 'problem_id'] }]
    },
    {
      table: 'quiz_ai_help', name: 'idx_perf_qah_att_q',
      cols: [{ candidates: ['attemptId', 'attempt_id'] }, { candidates: ['questionId', 'question_id'] }]
    },
    {
      table: 'device_fingerprints', name: 'idx_perf_df_user',
      cols: [{ candidates: ['userId', 'user_id'] }, { candidates: ['visitorId', 'visitor_id'] }]
    },
    {
      table: 'token_blacklists', name: 'idx_perf_tb_hash',
      cols: [{ candidates: ['tokenHash', 'token_hash'] }]
    },
  ];

  const uniqueTables = Array.from(new Set(indexDefinitions.map(d => d.table)));
  const { tableColumns, existingIndexes } = await getBulkTableMetadata(sequelize, uniqueTables);

  for (const def of indexDefinitions) {
    await createIndexSafely(sequelize, def.table, def.name, def.cols, tableColumns, existingIndexes);
  }

  logger.info('✓ Database performance indexes ready');
}

module.exports = { bootstrapPerformanceIndexes };
