jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const difficulty = require('../src/utils/quizDifficulty');
const { AIQuestion, AIQuiz } = require('../src/models');
const aiService = require('../src/services/aiService');
const quizService = require('../src/services/aiQuizService');
const originalKey = process.env.GEMINI_API_KEY;
afterEach(() => { jest.resetAllMocks(); if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; });

test.each(['Easy', 'Medium', 'Hard'])('%s normalizes consistently in requests, AI responses and ORM writes', label => {
  const expected = label.toUpperCase();
  for (const value of [label, expected, label.toLowerCase(), `  ${label}  `]) {
    expect(difficulty.normalizeQuizDifficulty(value)).toBe(expected);
    expect(difficulty.normalizeGeneratedQuestionDifficulty(value)).toBe(expected);
    expect(AIQuestion.build({difficulty:value}).difficulty).toBe(expected);
    expect(AIQuestion.bulkBuild([{difficulty:value}])[0].difficulty).toBe(expected);
    expect(AIQuiz.build({difficulty:value}).difficulty).toBe(expected);
  }
});

test('Mixed is a quiz distribution; missing question difficulty uses a valid individual level', () => {
  expect(difficulty.normalizeQuizDifficulty('Mixed')).toBe('MIXED');
  expect(difficulty.normalizeGeneratedQuestionDifficulty(null, 'Hard')).toBe('HARD');
  expect(difficulty.normalizeGeneratedQuestionDifficulty('Mixed', 'Mixed')).toBe('MEDIUM');
  expect(difficulty.normalizeGeneratedQuestionDifficulty(null, 'Mixed')).toBe('MEDIUM');
  expect(() => AIQuestion.build({difficulty:'MIXED'})).toThrow(/EASY, MEDIUM, HARD/);
});

test.each(['Expert', '   ', 1, {}, ['Easy']])('rejects unsupported difficulty %p before PostgreSQL', value => {
  expect(() => difficulty.normalizeQuizDifficulty(value)).toThrow(/Difficulty must/);
});

test('frontend option values and ORM definitions match the central contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/constants/quizDifficulty.js'), 'utf8');
  expect([...source.matchAll(/value: '([^']+)'/g)].map(m => m[1])).toEqual(difficulty.QUIZ_DIFFICULTIES);
  expect(AIQuestion.rawAttributes.difficulty.values).toEqual(difficulty.QUESTION_DIFFICULTIES);
  expect(AIQuiz.rawAttributes.difficulty.values).toEqual(difficulty.QUIZ_DIFFICULTIES);
});

test.each(['Easy', 'Medium', 'Hard'])('verified AI and material flows preserve canonical %s and answer choices', async label => {
  const question = {slot:0,questionType:'MCQ',topic:'React state',question:'Which React hook stores state?',options:['useEffect','useState','useMemo','useRef'],correctAnswer:'useState',explanation:'useState stores local component state.',difficulty:label.toUpperCase()};
  process.env.GEMINI_API_KEY = 'unit-test-only';
  const packet = data => ({data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}});
  const intent = {valid:true,sourceRelevant:true,topic:'React hooks',domain:'Programming',concepts:['state'],requirements:[],needsRetrieval:false,retrievalQuery:'',marksPerQuestion:1};
  const review = {reviews:[{index:0,relevant:true,unique:true,unambiguous:true,explanationCorrect:true,difficultyCorrect:true,sourceSupported:true,correctOption:1,correctAnswer:'',reason:''}]};
  for (let i = 0; i < 2; i++) {
    axios.post.mockResolvedValueOnce(packet(intent));
    axios.post.mockResolvedValueOnce(packet({questions:[question]}));
    axios.post.mockResolvedValueOnce(packet(review));
  }
  const direct = await aiService.generateQuizFromPrompt('React hooks', 1, label);
  expect(direct[0].difficulty).toBe(label.toUpperCase());
  const parsed = quizService.parseResponse(direct, label);
  expect(parsed[0].options).toEqual(question.options);
  expect(parsed[0].correctAnswer).toBe('1');
  const material=await aiService.generateQuizFromText('React hooks manage state and effects in function components. '.repeat(3),1,label,{questionType:'MCQ'});
  expect(material.questions[0].difficulty).toBe(label.toUpperCase());
});
