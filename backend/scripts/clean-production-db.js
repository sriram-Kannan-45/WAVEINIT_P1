/**
 * clean-production-db.js
 *
 * Safe, robust PostgreSQL production database cleanup script.
 * Wipes all development/test records, sessions, logs, and test accounts,
 * while preserving the system ADMIN user.
 *
 * Usage:
 *   node scripts/clean-production-db.js              # Dry run (displays plan & counts)
 *   node scripts/clean-production-db.js --yes        # Executes cleanup
 *   node scripts/clean-production-db.js --yes --backup # Saves JSON backup before wipe
 */

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../src/config/db');

const CONFIRM = process.argv.includes('--yes');
const DO_BACKUP = process.argv.includes('--backup') || !process.argv.includes('--no-backup');
const KEEP_TABLE = 'users';

async function getRowCounts(tableNames) {
  const counts = {};
  // Query in chunks of 25 using UNION ALL for fast execution in 1-2 roundtrips
  const chunkSize = 25;
  for (let i = 0; i < tableNames.length; i += chunkSize) {
    const chunk = tableNames.slice(i, i + chunkSize);
    const sql = chunk.map(t => `SELECT '${t}' AS tbl, COUNT(*)::int AS c FROM "${t}"`).join(' UNION ALL ');
    try {
      const [rows] = await sequelize.query(sql);
      for (const r of rows) {
        counts[r.tbl] = parseInt(r.c, 10);
      }
    } catch (e) {
      // Fallback per-table if any table has special issues
      for (const t of chunk) {
        try {
          const [res] = await sequelize.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
          counts[t] = parseInt(res[0].c, 10);
        } catch (_) {
          counts[t] = 0;
        }
      }
    }
  }
  return counts;
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Connected to PostgreSQL database successfully.\n');

    // 1. Discover all base tables in the 'public' schema
    const [tables] = await sequelize.query(`
      SELECT table_name AS name
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);

    const tableNames = tables.map(t => t.name);
    console.log(`Discovered ${tableNames.length} tables in schema 'public'.\n`);

    // 2. Count rows in all tables (fast UNION ALL queries)
    console.log('--- SCANNING CURRENT ROW COUNTS ---');
    const beforeCounts = await getRowCounts(tableNames);

    // Display non-zero tables
    const nonZero = Object.entries(beforeCounts).filter(([_, count]) => count > 0);
    console.log(`Found ${nonZero.length} tables with existing data:`);
    console.table(nonZero.map(([table, count]) => ({ table, count })));

    // 3. Inspect existing Admin accounts
    const [admins] = await sequelize.query(`
      SELECT id, name, email, role, status 
      FROM "users" 
      WHERE role = 'ADMIN' 
      ORDER BY id ASC;
    `);

    if (admins.length === 0) {
      console.error('\n[ABORT] No user with role = "ADMIN" found! Aborting to prevent accidental lock out.');
      process.exit(1);
    }

    console.log('\n--- ADMIN ACCOUNTS TO PRESERVE ---');
    console.table(admins);

    // 4. If --backup requested and in execute mode, dump non-empty tables to JSON
    if (CONFIRM && DO_BACKUP) {
      const backupDir = path.join(__dirname, '..', 'database', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `pre-production-backup-${timestamp}.json`);
      
      console.log(`\n--- CREATING PRE-WIPE BACKUP ---`);
      console.log(`Writing to: ${backupFile}`);
      const backupData = {
        createdAt: new Date().toISOString(),
        tables: {}
      };

      for (const [table, count] of nonZero) {
        const [rows] = await sequelize.query(`SELECT * FROM "${table}"`);
        backupData.tables[table] = rows;
      }

      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
      console.log(`Backup completed successfully (${(fs.statSync(backupFile).size / (1024 * 1024)).toFixed(2)} MB).\n`);
    }

    // 5. Check if execution flag is provided
    if (!CONFIRM) {
      console.log('═════════════════════════════════════════════════════════════════════════');
      console.log('DRY-RUN ONLY: No changes were made.');
      console.log('To execute the clean and wipe all test data, run:');
      console.log('   node scripts/clean-production-db.js --yes');
      console.log('═════════════════════════════════════════════════════════════════════════');
      await sequelize.close();
      process.exit(0);
    }

    // 6. Execute cleanup
    console.log('\n--- EXECUTING PRODUCTION CLEANUP ---');

    // Tables to truncate with RESTART IDENTITY CASCADE
    const tablesToTruncate = tableNames.filter(name => name !== KEEP_TABLE);

    // Run within a transaction for safety
    await sequelize.transaction(async (t) => {
      // PostgreSQL: Truncate in chunks to avoid lock contention
      const chunkSize = 20;
      for (let i = 0; i < tablesToTruncate.length; i += chunkSize) {
        const chunk = tablesToTruncate.slice(i, i + chunkSize);
        const quotedList = chunk.map(name => `"${name}"`).join(', ');
        await sequelize.query(`TRUNCATE TABLE ${quotedList} RESTART IDENTITY CASCADE;`, { transaction: t });
      }

      // Delete non-admin users from users table
      await sequelize.query(
        `DELETE FROM "${KEEP_TABLE}" WHERE "role" <> 'ADMIN';`,
        { transaction: t }
      );
      console.log(`Deleted non-admin users from "${KEEP_TABLE}".`);
    });

    console.log('All dependent tables truncated and non-admin users deleted.');

    // 7. Verify post-cleanup state
    console.log('\n--- ROW COUNTS AFTER CLEANUP ---');
    const afterCountsMap = await getRowCounts(tableNames);
    const afterTable = [];
    for (const name of tableNames) {
      const prev = beforeCounts[name] || 0;
      const cur = afterCountsMap[name] || 0;
      if (prev > 0 || cur > 0) {
        afterTable.push({
          table: name,
          before: prev,
          after: cur,
          status: cur === 0 ? 'CLEANED' : (name === KEEP_TABLE ? `PRESERVED (${cur} ADMIN)` : 'WARNING')
        });
      }
    }
    console.table(afterTable);

    // Remaining users verification
    const [remainingUsers] = await sequelize.query(`
      SELECT id, name, email, role, status 
      FROM "users" 
      ORDER BY id ASC;
    `);
    console.log('\n--- REMAINING ACTIVE USERS IN PRODUCTION ---');
    console.table(remainingUsers);

    console.log('\n✓ Production database cleanup completed successfully.');
    await sequelize.close();
    process.exit(0);

  } catch (err) {
    console.error('\n[ERROR] Cleanup failed:', err);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  }
}

main();
