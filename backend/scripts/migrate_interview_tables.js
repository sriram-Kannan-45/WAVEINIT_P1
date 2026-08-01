/**
 * Interview Module — Database Migration
 * Creates all 9 interview tables with proper FK constraints and indexes.
 * Run: node backend/scripts/migrate_interview_tables.js
 */

const { sequelize } = require('../src/config/db');
const logger = require('../src/utils/logger');

const MIGRATION_SQL = `
-- ============================================================
-- 1. interviews — core scheduling record
-- ============================================================
CREATE TABLE IF NOT EXISTS interviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  candidate_id BIGINT UNSIGNED NOT NULL,
  interviewer_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  type ENUM('TECHNICAL','HR','MANAGERIAL','CUSTOM') NOT NULL DEFAULT 'TECHNICAL',
  title VARCHAR(255) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  status ENUM('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','RESCHEDULED','NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
  require_mobile_pairing TINYINT(1) NOT NULL DEFAULT 1,
  grace_period_minutes INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_interviews_uuid (uuid),
  INDEX idx_interviews_candidate (candidate_id),
  INDEX idx_interviews_interviewer (interviewer_id),
  INDEX idx_interviews_creator (created_by),
  INDEX idx_interviews_scheduled (scheduled_at),
  INDEX idx_interviews_status (status),
  CONSTRAINT fk_interviews_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_interviews_interviewer FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_interviews_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. interview_sessions — one row per actual live session
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_uuid CHAR(36) NOT NULL,
  interview_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME DEFAULT NULL,
  ended_at DATETIME DEFAULT NULL,
  status ENUM('WAITING','ACTIVE','ENDED','FAILED') NOT NULL DEFAULT 'WAITING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_isession_uuid (session_uuid),
  INDEX idx_isession_interview (interview_id),
  INDEX idx_isession_status (status),
  CONSTRAINT fk_isession_interview FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. interview_devices — device pairing state
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  device_type ENUM('LAPTOP','MOBILE') NOT NULL,
  pairing_token VARCHAR(255) DEFAULT NULL,
  token_status ENUM('PENDING','CONSUMED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  token_expires_at DATETIME DEFAULT NULL,
  connected_at DATETIME DEFAULT NULL,
  disconnected_at DATETIME DEFAULT NULL,
  status ENUM('PAIRED','CONNECTED','DISCONNECTED') NOT NULL DEFAULT 'PAIRED',
  device_info JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_idevice_token (pairing_token),
  INDEX idx_idevice_session (session_id),
  INDEX idx_idevice_user (user_id),
  INDEX idx_idevice_token_status (token_status),
  INDEX idx_idevice_device_type (device_type),
  CONSTRAINT fk_idevice_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_idevice_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. interview_recordings — recording segment metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_recordings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  device_type ENUM('LAPTOP','MOBILE','SCREEN_SHARE') NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size BIGINT UNSIGNED DEFAULT NULL,
  mime_type VARCHAR(100) DEFAULT 'video/webm',
  duration_seconds INT DEFAULT NULL,
  checksum VARCHAR(64) DEFAULT NULL,
  status ENUM('RECORDING','UPLOADING','COMPLETED','FAILED') NOT NULL DEFAULT 'RECORDING',
  uploaded_by BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_irecording_session (session_id),
  INDEX idx_irecording_device (device_type),
  INDEX idx_irecording_status (status),
  CONSTRAINT fk_irecording_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_irecording_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. interview_logs — generic activity/audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED DEFAULT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload_json JSON DEFAULT NULL,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ilog_session (session_id),
  INDEX idx_ilog_event (event_type),
  INDEX idx_ilog_ts (ts),
  CONSTRAINT fk_ilog_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ilog_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 6. interview_alerts — AI monitoring alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  alert_type ENUM('TAB_SWITCH','COPY_PASTE','CAMERA_DISABLED','SCREEN_SHARE_STOPPED','MULTIPLE_PERSONS','MOBILE_PHONE_DETECTED','FACE_MISSING','LOOKING_AWAY','CANDIDATE_LEFT','TAB_BLUR') NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  source_device ENUM('LAPTOP','MOBILE','SYSTEM') NOT NULL DEFAULT 'LAPTOP',
  message TEXT DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ialert_session (session_id),
  INDEX idx_ialert_type (alert_type),
  INDEX idx_ialert_severity (severity),
  INDEX idx_ialert_ts (ts),
  CONSTRAINT fk_ialert_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. interview_feedback — ratings (schema supports panel interviews)
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  interview_id BIGINT UNSIGNED NOT NULL,
  interviewer_id BIGINT UNSIGNED NOT NULL,
  rating INT NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ifeedback_session (session_id),
  INDEX idx_ifeedback_interview (interview_id),
  INDEX idx_ifeedback_interviewer (interviewer_id),
  CONSTRAINT fk_ifeedback_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ifeedback_interview FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_ifeedback_interviewer FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. interview_results — final decision
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  interview_id BIGINT UNSIGNED NOT NULL,
  session_id BIGINT UNSIGNED DEFAULT NULL,
  decision ENUM('SELECTED','REJECTED','ON_HOLD') NOT NULL,
  decided_by BIGINT UNSIGNED NOT NULL,
  decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_iresult_interview (interview_id),
  INDEX idx_iresult_session (session_id),
  INDEX idx_iresult_decider (decided_by),
  INDEX idx_iresult_decision (decision),
  CONSTRAINT fk_iresult_interview FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_iresult_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_iresult_decider FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. interview_notes — timestamped interviewer observations
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  interview_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  note_type ENUM('OBSERVATION','QUESTION','ANSWER','SCORE','FLAG','GENERAL') NOT NULL DEFAULT 'GENERAL',
  content TEXT NOT NULL,
  timestamp_seconds INT DEFAULT NULL COMMENT 'Seconds into the interview when note was taken',
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inote_session (session_id),
  INDEX idx_inote_interview (interview_id),
  INDEX idx_inote_author (author_id),
  INDEX idx_inote_type (note_type),
  CONSTRAINT fk_inote_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_inote_interview FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_inote_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function migrate() {
  try {
    logger.logAlways('🔗 Connecting to database for interview migration...');
    await sequelize.authenticate();
    logger.logAlways('✅ Database connected');

    const statements = MIGRATION_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await sequelize.query(stmt);
        const tableMatch = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        if (tableMatch) {
          logger.logAlways(`✅ Table ${tableMatch[1]} ensured`);
        }
      } catch (err) {
        if (err.message.includes('Duplicate column') || err.message.includes('Duplicate key')) {
          logger.info(`⏭️  Skipped (already exists): ${err.message.substring(0, 80)}`);
        } else {
          logger.error(`❌ Migration error: ${err.message}`);
        }
      }
    }

    logger.logAlways('✅ Interview module migration complete');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate, MIGRATION_SQL };
