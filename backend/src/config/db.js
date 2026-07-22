require('dotenv').config();
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// ── Aiven MySQL Configuration ──────────────────────────────────────────
// All credentials MUST come from environment variables.
// Never hardcode passwords in source control.
const dbName   = process.env.DB_NAME   || 'training_db';
const dbUser   = process.env.DB_USER   || 'avnadmin';
const dbPass   = process.env.DB_PASS   || process.env.DB_PASSWORD || '';
const dbHost   = process.env.DB_HOST   || 'localhost';
const dbPort   = parseInt(process.env.DB_PORT, 10) || 3306;
const isProduction = process.env.NODE_ENV === 'production';

// SSL config for Aiven (required for cloud connections)
const sslConfig = isProduction ? {
  require: true,
  rejectUnauthorized: true,
  ca: process.env.DB_SSL_CA || undefined,
} : undefined;

const sequelize = new Sequelize(
  dbName,
  dbUser,
  dbPass,
  {
    host: dbHost,
    port: dbPort,
    dialect: 'mysql',
    logging: isProduction ? false : console.log,
    ssl: sslConfig,
    dialectOptions: isProduction ? {
      ssl: {
        require: true,
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA || undefined,
      },
      connectTimeout: 30000,
    } : {
      connectTimeout: 30000,
    },
    pool: {
      max: isProduction ? 5 : 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
      evict: 1000,
    },
    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /PROTOCOL_CONNECTION_LOST/,
        /ER_CON_COUNT_ERROR/,
        /ER_CON_LOST/,
      ],
      max: 5,
    },
    define: {
      freezeTableName: true,
    },
  }
);

// Skip createDatabase for Aiven — the database already exists on the cloud instance.
// On localhost, we still try to create it if it doesn't exist.
const createDatabase = async () => {
  if (isProduction) {
    logger.info('☁️  Production mode — skipping database creation (Aiven manages this)');
    return;
  }
  try {
    const tempSeq = new Sequelize('mysql', dbUser, dbPass, { 
      host: dbHost, 
      port: dbPort,
      dialect: 'mysql', 
      logging: false,
      define: { freezeTableName: true }
    });
    await tempSeq.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    logger.logAlways(`✅ Database '${dbName}' created or already exists`);
    await tempSeq.close();
  } catch (error) {
    logger.error('❌ Error creating database', { error: error.message });
  }
};

const connectDB = async () => {
  try {
    await createDatabase();
    logger.logAlways(`🔗 Connecting to MySQL: ${dbHost}:${dbPort}/${dbName} ...`);
    await sequelize.authenticate();
    logger.logAlways('✅ Database connected successfully');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // PRODUCTION-READY SYNC CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════════
    // 
    // `alter: false` - CRITICAL: Prevents repeated index creation
    //   ✅ Do NOT use `alter: true` - causes duplicate indexes
    //   Why? Each sync iteration tries to "fix" the table, creating:
    //   - email, email_1, email_2, email_3... up to email_31
    //   - username, username_1, username_2... up to username_31
    //   Result: 60+ duplicate indexes → exceeds MySQL's 64-key limit
    //
    // `force: false` - Do NOT drop and recreate tables
    //   ✅ Prevents data loss
    //   ❌ force: true deletes ALL data - never use in production
    //
    // For safe schema changes in production:
    //   → Use Sequelize migrations (sequelize-cli with umzug)
    //   → OR: Manual SQL scripts with version control
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // ── Pre-sync cleanup: drop quiz_assignments if it still has the OLD schema ──
    // The model now uses participant_id + status; old table has training_id instead.
    // If we don't drop it here, Sequelize will try ALTER TABLE to add the index
    // (quiz_id, participant_id) and fail because participant_id doesn't exist yet.
    try {
      const [oldCols] = await sequelize.query("SHOW COLUMNS FROM `quiz_assignments`");
      const oldColNames = oldCols.map(c => c.Field);
      if (oldColNames.includes('training_id') && !oldColNames.includes('participant_id')) {
        logger.info('♻️ Dropping old-format quiz_assignments (has training_id, needs participant_id)...');
        await sequelize.query("DROP TABLE IF EXISTS quiz_assignments");
      }
    } catch (_) {
      // Table doesn't exist yet — nothing to clean up
    }

    logger.info('📊 Syncing database schema...');
    await sequelize.sync({ 
      alter: false,  // ✅ CRITICAL: Do not alter - causes duplicate indexes
      force: false,  // ✅ CRITICAL: Do not drop - causes data loss
      logging: false
    });
    logger.info('✅ Database schema verified');
    
    // Manual database migration for ai_questions to support new quiz question formats
    try {
      const [columns] = await sequelize.query("SHOW COLUMNS FROM `ai_questions`");
      const columnNames = columns.map(c => c.Field);
      
      // Check and add acceptable_answers column
      if (!columnNames.includes('acceptable_answers')) {
        logger.info('➕ Adding acceptable_answers column to ai_questions...');
        await sequelize.query("ALTER TABLE `ai_questions` ADD COLUMN `acceptable_answers` JSON NULL COMMENT 'Acceptable answers for FILL_BLANK'");
      }
      
      // Check and add pairs column
      if (!columnNames.includes('pairs')) {
        logger.info('➕ Adding pairs column to ai_questions...');
        await sequelize.query("ALTER TABLE `ai_questions` ADD COLUMN `pairs` JSON NULL COMMENT 'Pairs for MATCHING question type'");
      }

      if (!columnNames.includes('topic')) {
        logger.info('Adding topic column to ai_questions...');
        await sequelize.query("ALTER TABLE `ai_questions` ADD COLUMN `topic` VARCHAR(255) NULL");
      }

      if (!columnNames.includes('blooms_level')) {
        logger.info('Adding blooms_level column to ai_questions...');
        await sequelize.query("ALTER TABLE `ai_questions` ADD COLUMN `blooms_level` VARCHAR(64) NULL");
      }

      if (!columnNames.includes('marks')) {
        logger.info('Adding marks column to ai_questions...');
        await sequelize.query("ALTER TABLE `ai_questions` ADD COLUMN `marks` INT NOT NULL DEFAULT 1 COMMENT 'Points this question is worth'");
      }
      
      // Check and update question_type enum column
      const questionTypeCol = columns.find(c => c.Field === 'question_type');
      if (questionTypeCol) {
        const typeStr = String(questionTypeCol.Type).toUpperCase();
        if (!typeStr.includes('TRUE_FALSE') || !typeStr.includes('FILL_BLANK') || !typeStr.includes('MATCHING')) {
          logger.info('🔄 Updating question_type ENUM values in ai_questions...');
          await sequelize.query("ALTER TABLE `ai_questions` MODIFY COLUMN `question_type` ENUM('MCQ', 'SHORT_ANSWER', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING') NOT NULL");
        }
      }

      // Manual migration: Ensure unique constraint UNIQUE(participant_id, quiz_id) on quiz_attempts
      try {
        logger.info('📊 Running manual migration for quiz_attempts uniqueness constraint...');
        
        // 1. Delete duplicate attempts if they exist, keeping the earliest created one.
        await sequelize.query(`
          DELETE q1 FROM quiz_attempts q1
          INNER JOIN quiz_attempts q2 
          WHERE q1.id > q2.id 
            AND q1.participant_id = q2.participant_id 
            AND q1.quiz_id = q2.quiz_id
        `);
        
        // 2. Check if the unique index 'idx_participant_quiz_unique' already exists
        const [indices] = await sequelize.query(`
          SELECT INDEX_NAME 
          FROM INFORMATION_SCHEMA.STATISTICS 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'quiz_attempts' 
            AND INDEX_NAME = 'idx_participant_quiz_unique' 
          LIMIT 1
        `);
        
        if (indices.length === 0) {
          logger.info('➕ Adding unique index idx_participant_quiz_unique to quiz_attempts...');
          await sequelize.query("ALTER TABLE `quiz_attempts` ADD UNIQUE INDEX `idx_participant_quiz_unique` (`participant_id`, `quiz_id`)");
        } else {
          logger.info('✅ Unique index idx_participant_quiz_unique already exists on quiz_attempts');
        }
      } catch (idxError) {
        logger.error('⚠️ Error migrating quiz_attempts unique index', { error: idxError.message });
      }

      // Manual database migration for ai_quizzes to support full lifecycle
      try {
        const [columns] = await sequelize.query("SHOW COLUMNS FROM `ai_quizzes`");
        const columnNames = columns.map(c => c.Field);
        
        if (!columnNames.includes('is_published')) {
          logger.info('➕ Adding is_published column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `is_published` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('is_result_published')) {
          logger.info('➕ Adding is_result_published column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `is_result_published` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('published_at')) {
          logger.info('➕ Adding published_at column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `published_at` TIMESTAMP NULL");
        }
        if (!columnNames.includes('result_published_at')) {
          logger.info('➕ Adding result_published_at column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `result_published_at` TIMESTAMP NULL");
        }

        // ── New lifecycle columns ──
        if (!columnNames.includes('start_time')) {
          logger.info('➕ Adding start_time column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `start_time` TIMESTAMP NULL");
        }
        if (!columnNames.includes('end_time')) {
          logger.info('➕ Adding end_time column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `end_time` TIMESTAMP NULL");
        }
        if (!columnNames.includes('closed_at')) {
          logger.info('➕ Adding closed_at column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `closed_at` TIMESTAMP NULL");
        }
        if (!columnNames.includes('total_marks')) {
          logger.info('➕ Adding total_marks column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `total_marks` DECIMAL(10,2) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('allow_multiple_attempts')) {
          logger.info('➕ Adding allow_multiple_attempts column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `allow_multiple_attempts` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('max_attempts')) {
          logger.info('➕ Adding max_attempts column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `max_attempts` INT NOT NULL DEFAULT 1");
        }
        if (!columnNames.includes('show_result_immediately')) {
          logger.info('➕ Adding show_result_immediately column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `show_result_immediately` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('show_correct_answers_on_result')) {
          logger.info('➕ Adding show_correct_answers_on_result column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `show_correct_answers_on_result` TINYINT(1) NOT NULL DEFAULT 1");
        }
        if (!columnNames.includes('shuffle_questions')) {
          logger.info('➕ Adding shuffle_questions column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `shuffle_questions` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('copy_protection_enabled')) {
          logger.info('➕ Adding copy_protection_enabled column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `copy_protection_enabled` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!columnNames.includes('max_copy_warnings')) {
          logger.info('➕ Adding max_copy_warnings column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `max_copy_warnings` INT NOT NULL DEFAULT 3");
        }
        if (!columnNames.includes('copy_violation_actions')) {
          logger.info('➕ Adding copy_violation_actions column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `copy_violation_actions` JSON NULL");
        }
        if (!columnNames.includes('copy_warning_message')) {
          logger.info('➕ Adding copy_warning_message column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `copy_warning_message` TEXT NULL");
        }
        if (!columnNames.includes('copy_disqualify_action')) {
          logger.info('➕ Adding copy_disqualify_action column to ai_quizzes...');
          await sequelize.query("ALTER TABLE `ai_quizzes` ADD COLUMN `copy_disqualify_action` ENUM('LOCK', 'AUTO_SUBMIT') NOT NULL DEFAULT 'AUTO_SUBMIT'");
        }

        // Update status ENUM — MySQL doesn't support DROP ENUM VALUE, so we
        // MODIFY the column to include RESULTS_PUBLISHED, ARCHIVED.
        const statusCol = columns.find(c => c.Field === 'status');
        if (statusCol) {
          const typeStr = String(statusCol.Type).toUpperCase();
          if (!typeStr.includes('RESULTS_PUBLISHED')) {
            logger.info('🔄 Updating status ENUM to include RESULTS_PUBLISHED, ARCHIVED...');
            await sequelize.query(
              "ALTER TABLE `ai_quizzes` MODIFY COLUMN `status` ENUM('DRAFT','PUBLISHED','CLOSED','RESULTS_PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT'"
            );
          }
        }

        // Backward-compat booleans sync
        try {
          await sequelize.query(`
            UPDATE ai_quizzes SET is_published = 1, published = 1 WHERE status IN ('PUBLISHED','CLOSED','RESULTS_PUBLISHED')
          `);
          await sequelize.query(`
            UPDATE ai_quizzes SET is_result_published = 1, resultStatus = 'PUBLISHED' WHERE status = 'RESULTS_PUBLISHED'
          `);
        } catch (_) {}
      } catch (migQuizError) {
        logger.error('⚠️ Error applying manual schema migrations to ai_quizzes', { error: migQuizError.message });
      }

      // Manual database migration for quiz_attempts (add violation_count column and update status ENUM)
      try {
        const [qaCols] = await sequelize.query("SHOW COLUMNS FROM `quiz_attempts`");
        const qaColNames = qaCols.map(c => c.Field);
        if (!qaColNames.includes('violation_count')) {
          logger.info('➕ Adding violation_count column to quiz_attempts...');
          await sequelize.query("ALTER TABLE `quiz_attempts` ADD COLUMN `violation_count` INT NOT NULL DEFAULT 0");
        }

        const statusCol = qaCols.find(c => c.Field === 'status');
        if (statusCol) {
          const typeStr = String(statusCol.Type).toUpperCase();
          if (!typeStr.includes('DISQUALIFIED_COPY_VIOLATION')) {
            logger.info('🔄 Updating status ENUM in quiz_attempts...');
            await sequelize.query(
              "ALTER TABLE `quiz_attempts` MODIFY COLUMN `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'disqualified_copy_violation') NOT NULL DEFAULT 'IN_PROGRESS'"
            );
          }
        }
      } catch (qaErr) {
        logger.error('⚠️ Error applying migration to quiz_attempts', { error: qaErr.message });
      }

      // Create quiz_copy_violations table if it does not exist
      try {
        const [tables] = await sequelize.query("SHOW TABLES LIKE 'quiz_copy_violations'");
        if (tables.length === 0) {
          logger.info('➕ Creating quiz_copy_violations table...');
          await sequelize.query(`
            CREATE TABLE quiz_copy_violations (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              attempt_id BIGINT UNSIGNED NOT NULL,
              quiz_id BIGINT UNSIGNED NOT NULL,
              participant_id BIGINT UNSIGNED NOT NULL,
              type VARCHAR(64) NOT NULL,
              question_number INT DEFAULT NULL,
              user_agent VARCHAR(500) DEFAULT NULL,
              occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              CONSTRAINT fk_qcv_attempt FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
              CONSTRAINT fk_qcv_quiz FOREIGN KEY (quiz_id) REFERENCES ai_quizzes(id) ON DELETE CASCADE,
              CONSTRAINT fk_qcv_participant FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
          `);
        }
      } catch (qcvErr) {
        logger.error('⚠️ Error creating quiz_copy_violations table', { error: qcvErr.message });
      }

      // Manual migration: quiz_assignments table (per-participant assignment with status)
      try {
        const [tables] = await sequelize.query("SHOW TABLES LIKE 'quiz_assignments'");
        if (tables.length === 0) {
          logger.info('➕ Creating quiz_assignments table...');
          await sequelize.query(`
            CREATE TABLE quiz_assignments (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              quiz_id BIGINT UNSIGNED NOT NULL,
              participant_id BIGINT UNSIGNED NOT NULL,
              status ENUM('PENDING','COMPLETED') NOT NULL DEFAULT 'PENDING',
              assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              UNIQUE INDEX idx_quiz_participant_unique (quiz_id, participant_id),
              INDEX idx_quiz_id (quiz_id),
              INDEX idx_participant_id (participant_id),
              INDEX idx_status (status),
              CONSTRAINT fk_qa_quiz FOREIGN KEY (quiz_id) REFERENCES ai_quizzes(id) ON DELETE CASCADE,
              CONSTRAINT fk_qa_participant FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
          `);
        } else {
          // Check if old schema (with training_id) — if so, drop and recreate
          try {
            const [cols] = await sequelize.query("SHOW COLUMNS FROM `quiz_assignments`");
            const colNames = cols.map(c => c.Field);
            if (colNames.includes('training_id') && !colNames.includes('participant_id')) {
              logger.info('♻️ Recreating quiz_assignments table with new schema...');
              await sequelize.query("DROP TABLE IF EXISTS quiz_assignments");
              await sequelize.query(`
                CREATE TABLE quiz_assignments (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  quiz_id BIGINT UNSIGNED NOT NULL,
                  participant_id BIGINT UNSIGNED NOT NULL,
                  status ENUM('PENDING','COMPLETED') NOT NULL DEFAULT 'PENDING',
                  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE INDEX idx_quiz_participant_unique (quiz_id, participant_id),
                  INDEX idx_quiz_id (quiz_id),
                  INDEX idx_participant_id (participant_id),
                  INDEX idx_status (status),
                  CONSTRAINT fk_qa_quiz FOREIGN KEY (quiz_id) REFERENCES ai_quizzes(id) ON DELETE CASCADE,
                  CONSTRAINT fk_qa_participant FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
              `);
            } else {
              logger.info('✅ quiz_assignments table already has correct schema');
            }
          } catch (checkErr) {
            logger.error('⚠️ Error checking quiz_assignments schema', { error: checkErr.message });
          }
        }
      } catch (qaError) {
        logger.error('⚠️ Error creating quiz_assignments table', { error: qaError.message });
      }

      // Manual database migration for quiz_results (result publication columns)
      try {
        const [qrCols] = await sequelize.query("SHOW COLUMNS FROM `quiz_results`");
        const qrColNames = qrCols.map(c => c.Field);
        if (!qrColNames.includes('result_published')) {
          logger.info('➕ Adding result_published column to quiz_results...');
          await sequelize.query("ALTER TABLE `quiz_results` ADD COLUMN `result_published` BOOLEAN NOT NULL DEFAULT FALSE");
        }
        if (!qrColNames.includes('published_at')) {
          logger.info('➕ Adding published_at column to quiz_results...');
          await sequelize.query("ALTER TABLE `quiz_results` ADD COLUMN `published_at` DATETIME NULL");
        }
        if (!qrColNames.includes('published_by')) {
          logger.info('➕ Adding published_by column to quiz_results...');
          await sequelize.query("ALTER TABLE `quiz_results` ADD COLUMN `published_by` BIGINT UNSIGNED NULL");
        }
      } catch (qrError) {
        logger.error('⚠️ Error applying migration to quiz_results', { error: qrError.message });
      }

      // Manual database migration for proctor_violations (add new types to enum)
      try {
        const [violationCols] = await sequelize.query("SHOW COLUMNS FROM `proctor_violations` LIKE 'type'");
        if (violationCols.length > 0) {
          const typeStr = String(violationCols[0].Type).toUpperCase();
          if (!typeStr.includes('SCREENSHOT_ATTEMPT') || !typeStr.includes('MOUSE_LEAVE')) {
            logger.info('🔄 Updating type ENUM values in proctor_violations...');
            await sequelize.query(
              "ALTER TABLE `proctor_violations` MODIFY COLUMN `type` ENUM(" +
              "'FULLSCREEN_EXIT','TAB_SWITCH','WINDOW_BLUR','BROWSER_MINIMIZE'," +
              "'SCREEN_SHARE_STOPPED','SCREEN_SHARE_DENIED','COPY_ATTEMPT','PASTE_ATTEMPT'," +
              "'RIGHT_CLICK','BLOCKED_SHORTCUT','DEVTOOLS_OPENED','REFRESH_ATTEMPT'," +
              "'NAVIGATION_ATTEMPT','MULTIPLE_LOGIN','NETWORK_LOST','HEARTBEAT_LOST'," +
              "'TERMINATED','SCREENSHOT_ATTEMPT','MOUSE_LEAVE','CLIPBOARD_ATTEMPT'," +
              "'NETWORK_TIMEOUT','FACE_ABSENT','FACE_MULTIPLE','LOOKING_AWAY','MOBILE_DETECTED','TRAINER_WARNING','MIC_MUTED','CAMERA_OFF','FACE_NOT_VISIBLE'" +
              ") NOT NULL"
            );
          }
        }
      } catch (pvError) {
        logger.error('⚠️ Error applying migration to proctor_violations', { error: pvError.message });
      }

      // ═══════════════════════════════════════════════════════════════════
      // ASSESSMENT SESSIONS + EXAM SESSIONS SCHEMA FIX
      // ═══════════════════════════════════════════════════════════════════
      // Both tables originally had `quiz_id BIGINT NOT NULL` with FK to
      // `ai_quizzes`.  Coding assessments use their own attempt/assessment
      // tables and set quiz_id = NULL.  We need to:
      //   1. Drop FK constraints so we can alter columns
      //   2. Make quiz_id NULL-able
      //   3. Add assessment_id + assessment_type columns if missing
      //   4. Drop FK on attempt_id if it references quiz_attempts
      // ───────────────────────────────────────────────────────────────────

      async function fixAssessmentTables() {
        const tables = [
          { name: 'assessment_sessions', columns: ['quiz_id', 'attempt_id'] },
          { name: 'exam_sessions',        columns: ['quiz_id', 'attempt_id'] },
          { name: 'proctor_violations',   columns: ['quiz_id'] },
        ];

        for (const { name: tbl, columns: fkCols } of tables) {
          try {
            // a) Drop ALL FK constraints on these columns so ALTER can succeed
            for (const col of fkCols) {
              try {
                const [rows] = await sequelize.query(`
                  SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tbl}'
                    AND COLUMN_NAME = '${col}' AND REFERENCED_TABLE_NAME IS NOT NULL
                `);
                for (const row of rows) {
                  try {
                    await sequelize.query(`ALTER TABLE \`${tbl}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
                    logger.info(`🗑️ Dropped FK ${row.CONSTRAINT_NAME} on ${tbl}.${col}`);
                  } catch (e) {
                    logger.warn(`⚠️ Could not drop FK ${row.CONSTRAINT_NAME}: ${e.message}`);
                  }
                }
              } catch (_) { /* query error */ }
            }

            // b) Add assessment_type if missing
            try {
              const [cols] = await sequelize.query(`SHOW COLUMNS FROM \`${tbl}\``);
              const names = cols.map(c => c.Field);

              if (!names.includes('assessment_type')) {
                await sequelize.query(
                  `ALTER TABLE \`${tbl}\` ADD COLUMN \`assessment_type\` ENUM('quiz','coding') NOT NULL DEFAULT 'quiz'`
                );
                logger.info(`➕ Added assessment_type to ${tbl}`);
              }

              if (!names.includes('assessment_id')) {
                await sequelize.query(
                  `ALTER TABLE \`${tbl}\` ADD COLUMN \`assessment_id\` BIGINT UNSIGNED NULL`
                );
                logger.info(`➕ Added assessment_id to ${tbl}`);
              }
            } catch (_) { /* table may not exist yet */ }

            // c) Make quiz_id nullable (safe even if already nullable)
            try {
              await sequelize.query(
                `ALTER TABLE \`${tbl}\` MODIFY COLUMN \`quiz_id\` BIGINT UNSIGNED NULL`
              );
              logger.info(`✅ Made ${tbl}.quiz_id nullable`);
            } catch (e) {
              logger.warn(`⚠️ Could not alter ${tbl}.quiz_id (may not exist): ${e.message}`);
            }

            // d) Make attempt_id nullable (coding sessions set it to null)
            try {
              await sequelize.query(
                `ALTER TABLE \`${tbl}\` MODIFY COLUMN \`attempt_id\` BIGINT UNSIGNED NULL`
              );
              logger.info(`✅ Made ${tbl}.attempt_id nullable`);
            } catch (e) {
              logger.warn(`⚠️ Could not alter ${tbl}.attempt_id (may not exist): ${e.message}`);
            }

            // e) Add coding_attempt_id column with FK to coding_attempts
            try {
              const [cols] = await sequelize.query(`SHOW COLUMNS FROM \`${tbl}\``);
              const names = cols.map(c => c.Field);
              if (!names.includes('coding_attempt_id')) {
                await sequelize.query(
                  `ALTER TABLE \`${tbl}\` ADD COLUMN \`coding_attempt_id\` BIGINT UNSIGNED NULL AFTER \`attempt_id\``
                );
                logger.info(`➕ Added coding_attempt_id to ${tbl}`);
              }
              // Drop any existing FK on coding_attempt_id first (safe)
              const [fkRows] = await sequelize.query(`
                SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tbl}'
                  AND COLUMN_NAME = 'coding_attempt_id' AND REFERENCED_TABLE_NAME IS NOT NULL
              `);
              for (const fk of fkRows) {
                try {
                  await sequelize.query(`ALTER TABLE \`${tbl}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
                } catch (_) {}
              }
              // Add FK to coding_attempts
              const tblName = tbl === 'assessment_sessions' ? 'assessment_sessions' : 'exam_sessions';
              await sequelize.query(
                `ALTER TABLE \`${tbl}\` ADD CONSTRAINT \`fk_${tbl}_coding_attempt\` FOREIGN KEY (\`coding_attempt_id\`) REFERENCES \`coding_attempts\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`
              );
              logger.info(`✅ Added FK on ${tbl}.coding_attempt_id → coding_attempts.id`);
            } catch (e) {
              logger.warn(`⚠️ Could not add coding_attempt_id to ${tbl}: ${e.message}`);
            }

            logger.info(`✅ ${tbl} schema migration done`);
          } catch (err) {
            logger.error(`⚠️ Error migrating ${tbl}: ${err.message}`);
          }
        }
      }

      await fixAssessmentTables();

      // Fix quiz_recordings ENUM to include 'coding'
      try {
        await sequelize.query(
          `ALTER TABLE \`quiz_recordings\` MODIFY COLUMN \`assessment_type\` ENUM('quiz','coding') NOT NULL DEFAULT 'quiz'`
        );
        logger.info('✅ Extended quiz_recordings.assessment_type ENUM to include coding');
      } catch (_) { /* table may not exist */ }

      // Fix users.status ENUM to include 'INACTIVE' (for soft-delete of trainers/participants)
      try {
        const [userCols] = await sequelize.query("SHOW COLUMNS FROM `users` WHERE `Field` = 'status'");
        if (userCols.length > 0) {
          const typeStr = String(userCols[0].Type).toUpperCase();
          if (!typeStr.includes('INACTIVE')) {
            logger.info('🔄 Updating users.status ENUM to include INACTIVE...');
            await sequelize.query(
              "ALTER TABLE `users` MODIFY COLUMN `status` ENUM('PENDING','APPROVED','INACTIVE') NOT NULL DEFAULT 'PENDING'"
            );
          }
        }
      } catch (userStatusErr) {
        logger.error('⚠️ Error updating users.status ENUM', { error: userStatusErr.message });
      }

      // Add passwordVersion column to users for hash algorithm tracking
      try {
        const [pwCols] = await sequelize.query("SHOW COLUMNS FROM `users` WHERE `Field` = 'passwordVersion'");
        if (pwCols.length === 0) {
          logger.info('🔄 Adding passwordVersion column to users...');
          await sequelize.query(
            "ALTER TABLE `users` ADD COLUMN `passwordVersion` INT NOT NULL DEFAULT 1 COMMENT 'Tracks password hash algorithm version'"
          );
          logger.info('✅ passwordVersion column added to users');
        }
      } catch (pwErr) {
        logger.error('⚠️ Error adding passwordVersion column', { error: pwErr.message });
      }

      // Fix coding_submissions.status ENUM to include new judge verdicts
      try {
        const [csCols] = await sequelize.query("SHOW COLUMNS FROM `coding_submissions` WHERE `Field` = 'status'");
        if (csCols.length > 0) {
          const typeStr = String(csCols[0].Type).toUpperCase();
          if (!typeStr.includes('OUTPUT_LIMIT_EXCEEDED')) {
            logger.info('🔄 Updating coding_submissions.status ENUM with full verdicts...');
            await sequelize.query(
              "ALTER TABLE `coding_submissions` MODIFY COLUMN `status` ENUM('PENDING','RUNNING','COMPILING','ACCEPTED','WRONG_ANSWER','TIME_LIMIT_EXCEEDED','MEMORY_LIMIT_EXCEEDED','RUNTIME_ERROR','COMPILATION_ERROR','OUTPUT_LIMIT_EXCEEDED','PRESENTATION_ERROR','INTERNAL_ERROR','FAILED') NOT NULL DEFAULT 'PENDING'"
            );
          }
        }
      } catch (csErr) {
        logger.error('⚠️ Error updating coding_submissions.status ENUM', { error: csErr.message });
      }

      // Add missing columns to coding_submissions
      try {
        const [csCols] = await sequelize.query("SHOW COLUMNS FROM `coding_submissions`");
        const csNames = csCols.map(c => c.Field);
        if (!csNames.includes('compiler_output')) {
          await sequelize.query("ALTER TABLE `coding_submissions` ADD COLUMN `compiler_output` TEXT NULL AFTER `output`");
          logger.info('➕ Added compiler_output to coding_submissions');
        }
        if (!csNames.includes('failed_test_case')) {
          await sequelize.query("ALTER TABLE `coding_submissions` ADD COLUMN `failed_test_case` INT NULL AFTER `error_message`");
          logger.info('➕ Added failed_test_case to coding_submissions');
        }
      } catch (csErr) {
        logger.error('⚠️ Error adding columns to coding_submissions', { error: csErr.message });
      }

      logger.info('✅ Manual schema migration checks completed successfully');
    } catch (migError) {
      logger.error('⚠️ Error applying manual schema migrations to ai_questions', { error: migError.message });
    }
    
  } catch (error) {
    logger.error('❌ Database connection failed', { error: error.message, code: error.code });
    
    // Helpful error messages for common issues
    const msg = (error.message || '').toLowerCase();
    
    if (msg.includes('etoimedout') || msg.includes('econnrefused')) {
      logger.logAlways('\n⚠️  CONNECTION TIMEOUT / REFUSED:');
      logger.logAlways('   The database server is unreachable.');
      logger.logAlways('   Checklist:');
      logger.logAlways('   1. Verify DB_HOST and DB_PORT are correct in .env / Render env vars');
      logger.logAlways('   2. Check Aiven service status: https://console.aiven.io');
      logger.logAlways('   3. Ensure your IP is whitelisted (Aiven → Service → Settings → IP allow list)');
      logger.logAlways('   4. For Render: ensure the service is not in sleep mode\n');
    } else if (msg.includes('access denied') || msg.includes('er_access_denied')) {
      logger.logAlways('\n⚠️  ACCESS DENIED:');
      logger.logAlways('   Username or password is incorrect.');
      logger.logAlways('   1. Verify DB_USER and DB_PASS are correct');
      logger.logAlways('   2. Reset password in Aiven console if needed\n');
    } else if (msg.includes('ssl') || msg.includes('handshake')) {
      logger.logAlways('\n⚠️  SSL ERROR:');
      logger.logAlways('   SSL handshake failed.');
      logger.logAlways('   1. Aiven requires SSL — ensure DB_SSL_CA is set or rejectUnauthorized is false');
      logger.logAlways('   2. Try setting NODE_ENV=production\n');
    } else if (msg.includes('unknown database') || msg.includes('er_bad_db_error')) {
      logger.logAlways('\n⚠️  UNKNOWN DATABASE:');
      logger.logAlways(`   Database '${dbName}' does not exist.`);
      logger.logAlways('   1. Create it in the Aiven console');
      logger.logAlways('   2. Import your SQL dump before starting the app\n');
    } else if (msg.includes('too many connections')) {
      logger.logAlways('\n⚠️  TOO MANY CONNECTIONS:');
      logger.logAlways('   Connection pool exhausted.');
      logger.logAlways('   1. Reduce pool.max in config');
      logger.logAlways('   2. Check for connection leaks');
      logger.logAlways('   3. Upgrade Aiven plan for more connections\n');
    } else if (msg.includes('er_parse_error') || msg.includes('too many keys')) {
      logger.logAlways('\n⚠️  SCHEMA ISSUE:');
      logger.logAlways('   Duplicate indexes detected.');
      logger.logAlways('   1. Run: node cleanup-duplicate-indexes.js');
      logger.logAlways('   2. Never use alter: true in production\n');
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      logger.logAlways('\n⚠️  TABLE DOES NOT EXIST:');
      logger.logAlways('   Run the SQL migration script to create tables.\n');
    }
    
    if (isProduction) {
      logger.logAlways('🛑 Production mode — exiting after connection failure.\n');
      process.exit(1);
    }
    
    // In development, don't exit — allow hot-reload to retry
    logger.logAlways('⚠️  Development mode — server will start without database.');
    logger.logAlways('   Fix the connection and restart.\n');
  }
};

module.exports = { sequelize, connectDB };
