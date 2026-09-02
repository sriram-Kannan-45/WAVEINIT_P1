/**
 * Idempotent PostgreSQL schema bootstrap for the notifications table.
 * Ensures all required columns exist with correct types and indexes.
 */
const { sequelize } = require('./db');

async function bootstrapNotificationSchema(logger = console) {
  try {
    // 1. Create table if not exists (with base columns)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(60) DEFAULT 'OTHER',
        is_read BOOLEAN NOT NULL DEFAULT false,
        action_url VARCHAR(500),
        related_entity_id VARCHAR(50),
        related_entity_type VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Add any missing columns safely
    const alterQueries = [
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255);`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(20);`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(40) DEFAULT 'SYSTEM';`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'NORMAL';`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;`,
      // Ensure type column is VARCHAR(60) rather than restricted enum if table was previously created with enum
      `ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(60) USING type::text;`,
      `ALTER TABLE notifications ALTER COLUMN message TYPE TEXT;`,
      `ALTER TABLE notifications ALTER COLUMN action_url TYPE VARCHAR(500);`,
      `ALTER TABLE notifications ALTER COLUMN related_entity_id TYPE VARCHAR(50) USING related_entity_id::text;`,
    ];

    for (const q of alterQueries) {
      try {
        await sequelize.query(q);
      } catch (colErr) {
        // Non-fatal column addition (e.g. if column already exists or already converted)
        logger.debug?.(`[bootstrapNotificationSchema] Notice on: ${q} - ${colErr.message}`);
      }
    }

    // 3. Create indexes for high-performance notification retrieval
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON notifications(user_id, is_read);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);`,
    ];

    for (const idxQ of indexQueries) {
      try {
        await sequelize.query(idxQ);
      } catch (idxErr) {
        logger.debug?.(`[bootstrapNotificationSchema] Index notice: ${idxErr.message}`);
      }
    }

    logger.info('[bootstrapNotificationSchema] notifications table schema successfully verified & updated');
    return true;
  } catch (err) {
    logger.error('[bootstrapNotificationSchema] Schema bootstrap error:', err);
    throw err;
  }
}

module.exports = { bootstrapNotificationSchema };
