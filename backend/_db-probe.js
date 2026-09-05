const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
});
const pool = new Pool({ host: env.DB_HOST, port: Number(env.DB_PORT || 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
async function main() {
  const courses = await pool.query(`SELECT id, title, trainer_id, training_program_id FROM courses WHERE title ILIKE '%react%' OR title ILIKE '%python%' LIMIT 20`);
  console.log('=== COURSES matching react/python ===');
  for (const c of courses.rows) console.log(c.id, '|', c.title, '| trainer', c.trainer_id, '| training', c.training_program_id);

  for (const c of courses.rows.slice(0, 4)) {
    const lessons = await pool.query(`SELECT id, title, length(coalesce(content,'')) AS content_len, length(coalesce(description,'')) AS desc_len FROM lessons WHERE course_id = $1 ORDER BY order_index ASC`, [c.id]);
    const total = lessons.rows.reduce((s, r) => s + r.content_len + r.desc_len, 0);
    console.log(`\nCourse ${c.id} (${c.title}): ${lessons.rows.length} lessons, total len=${total}`);
    console.table(lessons.rows);
    const mats = await pool.query(`SELECT lm.title, length(coalesce(lm.content,'')) AS len, lm.material_type, lm.file_url FROM lesson_materials lm JOIN lessons l ON l.id = lm.lesson_id WHERE l.course_id = $1`, [c.id]);
    console.log('materials:', JSON.stringify(mats.rows));
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });