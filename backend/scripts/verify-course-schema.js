/**
 * Verifies that Step 1 of the course-centric restructure landed cleanly.
 * Run after the server has booted at least once:
 *   node scripts/verify-course-schema.js
 */
const { sequelize } = require('../src/config/db');

const REQUIRED_TABLES = [
  'training_programs',
  'courses',
  'lesson_materials',
  'course_trainer_assignments',
  'lessons',
  'ai_quizzes',
  'enrollments',
];

const REQUIRED_COLUMNS = [
  ['training_programs', 'thumbnail_url'],
  ['courses',           'training_program_id'],
  ['courses',           'trainer_id'],
  ['courses',           'status'],
  ['courses',           'thumbnail_url'],
  ['lesson_materials',  'lesson_id'],
  ['lesson_materials',  'material_type'],
  ['lesson_materials',  'file_url'],
  ['lesson_materials',  'link_url'],
  ['lesson_materials',  'thumbnail_url'],
  ['lesson_materials',  'order_index'],
  ['lessons',           'course_id'],
  ['lessons',           'description'],
  ['ai_quizzes',        'course_id'],
  ['ai_quizzes',        'lesson_id'],
  ['ai_quizzes',        'result_status'],
  ['ai_quizzes',        'is_mandatory'],
  ['enrollments',       'course_id'],
  ['enrollments',       'progress_percent'],
];

const REQUIRED_ENUM_VALUES = [
  ['lesson_materials', 'material_type', ['NOTE', 'VIDEO', 'IMAGE', 'LINK', 'PDF', 'PPT']],
  ['ai_quizzes',       'result_status', ['HIDDEN', 'PUBLISHED']],
  ['courses',          'status',        ['DRAFT', 'PUBLISHED', 'ARCHIVED']],
];

async function tableExists(name) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [name] }
  );
  return rows[0].c > 0;
}

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows[0].c > 0;
}

async function enumValues(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  if (!rows.length) return null;
  const m = String(rows[0].COLUMN_TYPE).match(/^enum\((.+)\)$/i);
  if (!m) return null;
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
}

(async () => {
  await sequelize.authenticate();

  let pass = 0, fail = 0;
  const errs = [];

  // 1. Required tables
  for (const t of REQUIRED_TABLES) {
    if (await tableExists(t)) { pass++; console.log(`  ✓ table ${t}`); }
    else                      { fail++; errs.push(`MISSING table ${t}`); console.log(`  ✗ table ${t}`); }
  }

  // 2. Required columns
  for (const [t, c] of REQUIRED_COLUMNS) {
    if (await columnExists(t, c)) { pass++; console.log(`  ✓ ${t}.${c}`); }
    else                          { fail++; errs.push(`MISSING column ${t}.${c}`); console.log(`  ✗ ${t}.${c}`); }
  }

  // 3. Required enum values
  for (const [t, c, expected] of REQUIRED_ENUM_VALUES) {
    const actual = await enumValues(t, c);
    if (!actual) {
      fail++; errs.push(`${t}.${c} is not an ENUM`); console.log(`  ✗ ${t}.${c} ENUM`);
      continue;
    }
    const missing = expected.filter(v => !actual.includes(v));
    if (missing.length === 0) { pass++; console.log(`  ✓ ${t}.${c} ENUM has ${expected.join(',')}`); }
    else                       { fail++; errs.push(`${t}.${c} ENUM missing ${missing.join(',')} (has ${actual.join(',')})`); console.log(`  ✗ ${t}.${c} ENUM missing ${missing.join(',')}`); }
  }

  // 4. Legacy `trainings` should be gone
  if (await tableExists('trainings')) {
    fail++; errs.push('Legacy `trainings` table still exists alongside training_programs');
    console.log(`  ✗ legacy 'trainings' still exists`);
  } else {
    pass++; console.log(`  ✓ legacy 'trainings' table removed`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailures:');
    errs.forEach(e => console.log(`  - ${e}`));
  }

  await sequelize.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
