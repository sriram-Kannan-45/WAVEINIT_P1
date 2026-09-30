// Reproduce the GET /api/quizzes/:id 500 without the swallowing catch block.
// Run: node test/scripts/repro-quiz-detail.js
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'diagnostic-only-secret';

const path = require('node:path');
const backend = path.join(__dirname, '..', '..', 'backend');

// Exactly mirrors the GET /api/quizzes/:id handler, for every quiz in the DB.
(async () => {
  const { sequelize } = require(path.join(backend, 'src', 'config', 'db'));
  const { AIQuiz, AIQuestion, Course, Training } = require(path.join(backend, 'src', 'models'));

  await sequelize.authenticate();
  const all = await AIQuiz.findAll({ attributes: ['id', 'title', 'context', 'status'] });
  console.log('RESULT quiz count:', all.length);

  for (const a of all) {
    try {
      const quiz = await AIQuiz.findByPk(a.id, {
        include: [
          { model: AIQuestion, as: 'questions', order: [['order', 'ASC'], ['id', 'ASC']] },
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] },
        ],
      });
      const json = JSON.stringify({ quiz });
      console.log(`RESULT id=${a.id} ctx=${a.context} OK questions=${quiz.questions?.length} bytes=${json.length}`);
    } catch (e) {
      console.log(`RESULT id=${a.id} ctx=${a.context} THREW: ${e.name} | ${e.message}`);
    }
  }

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('RESULT fatal:', e.name, e.message); process.exit(1); });