const { sequelize } = require('../src/config/db');
(async () => {
  try {
    const [rows] = await sequelize.query(`SELECT c.table_name, c.column_name, c.udt_name,
      c.column_default, e.enumlabel
      FROM information_schema.columns c
      JOIN pg_type t ON t.typname = c.udt_name
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE c.table_schema = current_schema()
      AND c.table_name IN ('ai_questions', 'ai_quizzes') AND c.column_name = 'difficulty'
      ORDER BY c.table_name, e.enumsortorder`);
    console.log(JSON.stringify(rows, null, 2));
  } finally { await sequelize.close(); }
})().catch(error => { console.error(error.message || error.name); process.exitCode = 1; });
