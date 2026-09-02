/**
 * bootstrapPerformanceIndexes.js
 * ─────────────────────────────────────────────────────────────
 * Dynamically creates high-performance indexes on database tables
 * by detecting the actual column casing (snake_case vs camelCase)
 * in PostgreSQL and MySQL.
 */

const logger = require('../utils/logger');

async function getExistingColumns(sequelize, tableName) {
  try {
    const isPostgres = sequelize.getDialect() === 'postgres';
    const query = isPostgres
      ? `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}';`
      : `SELECT COLUMN_NAME as column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${tableName}';`;
    const [results] = await sequelize.query(query);
    return new Set((results || []).map(r => r.column_name || r.COLUMN_NAME));
  } catch (_) {
    return new Set();
  }
}

async function createIndexSafely(sequelize, tableName, indexName, candidateColumnGroups) {
  try {
    const existingCols = await getExistingColumns(sequelize, tableName);
    if (existingCols.size === 0) return;

    // Find the matching column names
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
      const [results] = await sequelize.query(
        `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND index_name = '${indexName}' LIMIT 1;`
      );
      if (!results || results.length === 0) {
        await sequelize.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${colsSql});`);
      }
    }
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
  ];

  for (const def of indexDefinitions) {
    await createIndexSafely(sequelize, def.table, def.name, def.cols);
  }

  logger.info('✓ Database performance indexes ready');
}

module.exports = { bootstrapPerformanceIndexes };
