/* TEMP debug script — inspect interviews schema + attempt delete on #8 */
require('dotenv').config();
const { sequelize } = require('../src/config/db');

async function main() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    // 1. Interview #8 existence
    const [iv] = await sequelize.query('SELECT * FROM interviews WHERE id = 8');
    console.log('\n=== interviews WHERE id=8 ===');
    console.log(iv.length ? iv[0] : 'NOT FOUND');

    // 2. FK constraints referencing interviews
    const [fks] = await sequelize.query(`
      SELECT k.CONSTRAINT_NAME, k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
      JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      WHERE k.REFERENCED_TABLE_NAME = 'interviews' AND k.CONSTRAINT_SCHEMA = DATABASE()
    `);
    console.log('\n=== FKs referencing interviews ===');
    console.table(fks);

    // 3. Related child rows for interview #8 (legacy + model tables)
    const [sessions] = await sequelize.query('SELECT id, status FROM interview_sessions WHERE interview_id = 8');
    console.log('\n=== interview_sessions for #8 ===');
    console.table(sessions);
    const sessionIds = sessions.map(s => s.id);
    const childTables = [
      'interview_candidates', 'interview_evaluations', 'interview_feedback',
      'interview_notes', 'interview_notifications', 'interview_results',
      'interview_rooms', 'interview_trainers',
    ];
    for (const tbl of childTables) {
      try {
        const [rows] = await sequelize.query(`SELECT COUNT(*) AS c FROM ${tbl} WHERE interview_id = 8`);
        console.log(`${tbl} (by interview_id): ${rows[0].c}`);
      } catch (e) {
        console.log(`${tbl}: ERROR ${e.message}`);
      }
    }
    if (sessionIds.length) {
      for (const tbl of ['interview_devices', 'interview_recordings', 'interview_logs', 'interview_alerts']) {
        try {
          const [rows] = await sequelize.query(`SELECT COUNT(*) AS c FROM ${tbl} WHERE session_id IN (${sessionIds.join(',')})`);
          console.log(`${tbl} (by session_id): ${rows[0].c}`);
        } catch (e) {
          console.log(`${tbl}: ERROR ${e.message}`);
        }
      }
    } else {
      console.log('(no sessions — no session children)');
    }

    // 3b. FKs referencing interview_sessions
    const [sessionFks] = await sequelize.query(`
      SELECT k.TABLE_NAME, k.COLUMN_NAME, r.DELETE_RULE
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
      JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      WHERE k.REFERENCED_TABLE_NAME = 'interview_sessions' AND k.CONSTRAINT_SCHEMA = DATABASE()
    `);
    console.log('\n=== FKs referencing interview_sessions ===');
    console.table(sessionFks);

    // 4. Try a raw DELETE to see the real error (transaction rolled back)
    console.log('\n=== Trying raw DELETE on interviews WHERE id=8 (rolled back) ===');
    const t = await sequelize.transaction();
    try {
      await sequelize.query('DELETE FROM interviews WHERE id = 8', { transaction: t });
      console.log('DELETE executed OK (affected rows in-transaction)');
      const [check] = await sequelize.query('SELECT COUNT(*) AS c FROM interviews WHERE id = 8', { transaction: t });
      console.log('rows matching id=8 inside txn:', check[0].c);
      await t.rollback();
      console.log('Rolled back — nothing deleted');
    } catch (e) {
      await t.rollback();
      console.log('DELETE FAILED:', e.message);
      console.log('code:', e.original && e.original.code, '| errno:', e.original && e.original.errno);
    }
  } catch (err) {
    console.error('ERR', err.message);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

main();
