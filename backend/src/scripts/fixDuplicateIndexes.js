/**
 * Fix Duplicate Indexes Script
 *
 * MySQL has a hard limit of 64 indexes per table. When Sequelize runs
 * sync({ alter: true }) repeatedly, it can accumulate duplicate indexes
 * (e.g., session_id, session_id_1, session_id_2...) until the limit is hit.
 *
 * This script drops duplicate indexes on the affected tables:
 *   - proctor_violations
 *   - registration_applications
 *   - certificates
 *
 * Usage:
 *   cd backend
 *   node src/scripts/fixDuplicateIndexes.js
 *
 * Safe to run multiple times — idempotent.
 */

require('dotenv').config();
const { sequelize } = require('../config/db');
const logger = console;

async function dropDuplicateIndexes(tableName) {
  try {
    const [indexes] = await sequelize.query(
      `SHOW INDEX FROM \`${tableName}\` WHERE Non_unique = 1`
    );

    // Group indexes by Column_name
    const byColumn = {};
    for (const idx of indexes) {
      const col = idx.Column_name;
      if (!byColumn[col]) byColumn[col] = [];
      byColumn[col].push(idx);
    }

    let dropped = 0;
    for (const [col, idxs] of Object.entries(byColumn)) {
      if (idxs.length <= 1) continue;

      // Keep the first (original) index, drop duplicates
      // Skip PRIMARY KEY index
      const toDrop = idxs.filter(i => i.Key_name !== 'PRIMARY').slice(1);
      for (const idx of toDrop) {
        try {
          await sequelize.query(`DROP INDEX \`${idx.Key_name}\` ON \`${tableName}\``);
          logger.log(`  ✅ Dropped duplicate index: ${idx.Key_name} on ${col}`);
          dropped++;
        } catch (e) {
          logger.warn(`  ⚠️  Could not drop ${idx.Key_name}: ${e.message}`);
        }
      }
    }

    if (dropped > 0) {
      logger.log(`  📊 Dropped ${dropped} duplicate indexes from ${tableName}`);
    } else {
      logger.log(`  ✅ ${tableName}: no duplicate indexes found`);
    }
  } catch (e) {
    if (e.message.includes('Table') && e.message.includes("doesn't exist")) {
      logger.log(`  ℹ️  ${tableName}: table does not exist yet, skipping`);
    } else {
      logger.error(`  ❌ Error processing ${tableName}:`, e.message);
    }
  }
}

async function main() {
  logger.log('🔧 Fixing duplicate indexes on affected tables...\n');

  const tables = [
    'proctor_violations',
    'registration_applications',
    'certificates',
    'interviews',
    'interview_sessions',
    'interview_devices',
    'interview_logs',
  ];

  for (const table of tables) {
    logger.log(`Processing: ${table}`);
    await dropDuplicateIndexes(table);
    logger.log('');
  }

  // Verify key count after cleanup
  logger.log('📊 Index counts after cleanup:');
  for (const table of tables) {
    try {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`
      );
      const count = rows[0]?.cnt || 0;
      const status = count > 55 ? '⚠️  CLOSE TO LIMIT' : '✅ OK';
      logger.log(`  ${table}: ${count} indexes ${status}`);
    } catch (e) {
      // Table might not exist
    }
  }

  logger.log('\nDone. You can now restart the server.');
  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
