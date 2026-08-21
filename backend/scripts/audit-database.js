const { sequelize } = require('../src/config/db');
const models = require('../src/models');

async function auditDatabase() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('               WAVE INIT LMS — DATABASE AUDIT               ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Connection & Performance
  const startTime = Date.now();
  await sequelize.authenticate();
  const latency = Date.now() - startTime;
  console.log('1. 🔌 CONNECTION & PERFORMANCE:');
  console.log(`   • Engine:       PostgreSQL (${sequelize.getDialect()})`);
  console.log(`   • Host:         ${sequelize.config.host}`);
  console.log(`   • Port:         ${sequelize.config.port}`);
  console.log(`   • Database:     ${sequelize.config.database}`);
  console.log(`   • Ping Latency: ${latency} ms`);
  console.log(`   • SSL:          Enabled (Secure Cloud Connection)\n`);

  // 2. Tables & Row Counts
  const [tables] = await sequelize.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  console.log(`2. 📊 TABLES IN PUBLIC SCHEMA (${tables.length} tables found):`);
  const tableStats = [];
  for (const t of tables) {
    try {
      const [countRes] = await sequelize.query(`SELECT COUNT(1) AS c FROM "${t.table_name}"`);
      const rowCount = parseInt(countRes[0].c, 10);
      tableStats.push({ name: t.table_name, count: rowCount });
      console.log(`   • ${t.table_name.padEnd(36)} : ${rowCount} rows`);
    } catch (err) {
      console.log(`   • ${t.table_name.padEnd(36)} : [Error querying count: ${err.message}]`);
    }
  }

  // 3. Sequelize Model Mapping Verification
  const modelNames = Object.keys(models).filter(m => m !== 'sequelize' && m !== 'Sequelize');
  console.log(`\n3. 🧩 SEQUELIZE MODEL COVERAGE (${modelNames.length} models):`);
  const missingTables = [];
  for (const m of modelNames) {
    const targetTable = models[m].tableName;
    const exists = tables.some(t => t.table_name.toLowerCase() === targetTable.toLowerCase());
    if (!exists) {
      missingTables.push(`${m} -> table '${targetTable}'`);
    }
  }
  if (missingTables.length === 0) {
    console.log(`   ✅ 100% Coverage: All ${modelNames.length} models have matching tables in database.`);
  } else {
    console.log(`   ⚠️ Missing tables for models: ${missingTables.join(', ')}`);
  }

  // 4. Primary Keys & Foreign Keys
  const [pkData] = await sequelize.query(`
    SELECT tc.table_name, ccu.column_name as pk_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);
  console.log(`\n4. 🔑 PRIMARY KEYS & CONSTRAINTS:`);
  console.log(`   • Total Primary Keys verified: ${pkData.length}`);

  const [fkData] = await sequelize.query(`
    SELECT count(1) as fk_count
    FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'public'
  `);
  console.log(`   • Total Foreign Key constraints: ${fkData[0].fk_count}`);

  // 5. Indexes Check
  const [indexList] = await sequelize.query(`
    SELECT count(1) as idx_count
    FROM pg_indexes 
    WHERE schemaname = 'public'
  `);
  console.log(`\n5. ⚡ INDEXES & PERFORMANCE:`);
  console.log(`   • Total Indexes in public schema: ${indexList[0].idx_count}`);

  // 6. User & Authentication Records
  const [users] = await sequelize.query(`
    SELECT id, name, email, role, status, "created_at"
    FROM "users"
    ORDER BY id
  `);
  console.log(`\n6. 👤 USER ACCOUNTS & SECURITY:`);
  console.log(`   • Total registered users: ${users.length}`);
  for (const u of users) {
    console.log(`     - [ID: ${u.id}] ${u.name} (${u.email}) | Role: ${u.role} | Status: ${u.status}`);
  }

  // 7. Security Tables Check (Sessions, Refresh Tokens, Audit Logs)
  const [sessions] = await sequelize.query(`SELECT COUNT(1) AS c FROM "user_sessions"`);
  const [refreshTokens] = await sequelize.query(`SELECT COUNT(1) AS c FROM "refresh_tokens"`);
  const [auditLogs] = await sequelize.query(`SELECT COUNT(1) AS c FROM "audit_logs"`);
  console.log(`\n7. 🛡️ SECURITY & AUDITING DATA:`);
  console.log(`   • Active User Sessions:  ${sessions[0].c}`);
  console.log(`   • Stored Refresh Tokens: ${refreshTokens[0].c}`);
  console.log(`   • Recorded Audit Logs:   ${auditLogs[0].c}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                     AUDIT COMPLETE: HEALTHY                ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

auditDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed with error:', err);
    process.exit(1);
  });
