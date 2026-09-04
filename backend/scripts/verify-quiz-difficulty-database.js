// Authenticated API -> AI adapter -> ORM -> real PostgreSQL verification.
// All database writes are isolated in an outer rollback transaction. Existing
// courses/users are only read; generated quizzes are never published or assigned.
// Default uses deterministic provider responses. --live uses configured prompt AI.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const models = require('../src/models');
const { sequelize, Course, User, AIQuiz, AIQuestion, AIQuestionOption } = models;
const { QUIZ_DIFFICULTIES } = require('../src/utils/quizDifficulty');

(async () => {
  const outer = await sequelize.transaction();
  const originalQuery = sequelize.query.bind(sequelize);
  const originalTransaction = sequelize.transaction.bind(sequelize);
  const originalPost = axios.post;
  const originalKey = process.env.GEMINI_API_KEY;
  const uploads = [];
  const live = process.argv.includes('--live');
  sequelize.query = (sql, options = {}) => originalQuery(sql, { ...options, transaction: options.transaction || outer });
  sequelize.transaction = (options, callback) => typeof options === 'function'
    ? originalTransaction({ transaction: outer }, options)
    : originalTransaction({ ...options, transaction: options?.transaction || outer }, callback);
  let providerDifficulty = 'Easy';
  let reviewCount=2;
  if (!live) {
    process.env.GEMINI_API_KEY = 'isolated-provider-fixture';
    axios.post = async (url, payload) => {
      const text = payload.contents?.[0]?.parts?.[0]?.text || '';
      const packet = data => ({data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}});
      if(text.startsWith('Analyze the quiz request')) return packet({valid:true,sourceRelevant:true,topic:'React hooks',domain:'Programming',concepts:['state'],requirements:[],needsRetrieval:false,retrievalQuery:'',marksPerQuestion:1});
      if(text.startsWith('Independently audit')) {
        const questions=JSON.parse(text.split('Candidates: ')[1]);
        return packet({reviews:questions.map((q,index)=>({index,relevant:true,unique:true,unambiguous:true,explanationCorrect:true,difficultyCorrect:true,sourceSupported:true,correctOption:1,correctAnswer:'',reason:''}))});
      }
      const slots=JSON.parse(text.split('Missing slots: ')[1].split('\nPreviously accepted')[0]);
      return packet({questions:slots.map(slot=>({slot:slot.id,questionType:'MCQ',question:slot.id===0?'Which React hook stores component state?':'What should be passed to the state setter when updating based on previous state?',
        options:slot.id===0?['useEffect','useState','useMemo','useRef']:['A component','An updater function','A CSS selector','A DOM node'],correctAnswer:slot.id===0?'useState':'An updater function',
        explanation:slot.id===0?'useState stores component state.':'An updater function receives the previous state.',difficulty:slot.difficulty,topic:'React hooks'}))});
    };
  }
  try {
    let course, user;
    for (const candidate of await Course.findAll({ attributes: ['id', 'trainerId', 'trainingProgramId'] })) {
      const owner = await User.findByPk(candidate.trainerId, { attributes: ['id', 'role'] });
      if (owner?.role === 'TRAINER') { course = candidate; user = owner; break; }
    }
    assert.ok(course && user, 'A trainer-owned course is required for this rollback verification');
    const token = jwt.sign({ id: Number(user.id), role: user.role, type: 'access', jti: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { res.on('finish', () => { if (req.file?.path) uploads.push(req.file.path); }); next(); });
    app.use('/api/ai-quiz', require('../src/routes/aiQuizRoutes'));
    const checkSaved = async (response, expected, count) => {
      assert.equal(response.status, 201, JSON.stringify(response.body));
      const quiz = await AIQuiz.findByPk(response.body.quiz.id);
      const questions = await AIQuestion.findAll({ where: { quizId: quiz.id }, order: [['order', 'ASC']] });
      assert.equal(quiz.difficulty, expected);
      assert.equal(quiz.status, 'DRAFT');
      assert.equal(questions.length, count);
      for (const question of questions) {
        assert.equal(question.difficulty, expected);
        assert.equal(question.options.length, 4);
        const options = await AIQuestionOption.findAll({ where: { questionId: question.id } });
        assert.equal(options.length, 4);
        assert.equal(options.filter(option => option.isCorrect).length, 1);
        if (!live) assert.equal(question.correctAnswer, '1');
      }
    };
    for (const label of ['Easy', 'Medium', 'Hard']) {
      providerDifficulty = label;
      reviewCount=2;
      const response = await request(app).post('/api/ai-quiz/generate-from-prompt')
        .set('Authorization', `Bearer ${token}`).send({ courseId: course.id, prompt: 'React state and hooks', questionCount: 2, difficulty: label });
      await checkSaved(response, label.toUpperCase(), 2);
      console.log(`PASS ${label}: authenticated prompt generation, quiz + questions + four choices persisted as ${label.toUpperCase()}`);
      if (!live) {
        reviewCount=1;
        const fileResponse = await request(app).post('/api/ai-quiz/generate-from-document')
          .set('Authorization', `Bearer ${token}`).field('courseId', String(course.id))
          .field('difficulty', ` ${label.toLowerCase()} `).field('questionCount', '1')
          .attach('file', Buffer.from('React components use the useState hook to store local state and return a setter. '.repeat(3)), 'difficulty-verification.txt');
        await checkSaved(fileResponse, label.toUpperCase(), 1);
        console.log(`PASS ${label}: multipart document generation and question save`);
      }
    }
    if (!live) {
      const before = await AIQuiz.count();
      const invalid = await request(app).post('/api/ai-quiz/generate-from-prompt').set('Authorization', `Bearer ${token}`)
        .send({ courseId: course.id, prompt: 'React', questionCount: 2, difficulty: 'Expert' });
      assert.equal(invalid.status, 422);
      assert.equal(await AIQuiz.count(), before);
      // Fail after a question has been inserted, proving the header, questions
      // and choices share a rollback boundary, rather than leaving a partial quiz.
      reviewCount=2;
      const createOption = AIQuestionOption.create;
      AIQuestionOption.create = async () => { throw new Error('Injected choice-save failure'); };
      try {
        const failed = await request(app).post('/api/ai-quiz/generate-from-prompt').set('Authorization', `Bearer ${token}`)
          .send({ courseId: course.id, prompt: 'React rollback', questionCount: 2, difficulty: 'Hard' });
        assert.equal(failed.status, 500);
        assert.equal(await AIQuiz.count(), before);
      } finally { AIQuestionOption.create = createOption; }
      console.log('PASS: invalid input returns 422; failed question/choice persistence leaves no partial quiz');
    }
  } finally {
    sequelize.query = originalQuery;
    sequelize.transaction = originalTransaction;
    axios.post = originalPost;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    await outer.rollback();
    await sequelize.close();
    const uploadRoot = path.resolve(require('../src/config/paths').getUploadsPath('ai-docs')) + path.sep;
    for (const file of uploads) {
      const resolved = path.resolve(file);
      if (!resolved.startsWith(uploadRoot)) throw new Error('Unexpected verification upload path');
      fs.unlinkSync(resolved);
    }
    console.log('All generated quiz records rolled back and verification uploads removed.');
  }
})().catch(error => { console.error(error.message || error.name); process.exitCode = 1; });
