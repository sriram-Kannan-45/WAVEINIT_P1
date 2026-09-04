jest.mock('axios', () => ({post: jest.fn()}));
jest.mock('../src/models', () => ({
  sequelize: {transaction: jest.fn(async callback => callback({id: 'test-transaction'}))},
  AIQuestion: {create: jest.fn(async () => ({id: 42}))},
  AIQuestionOption: {create: jest.fn(async () => ({}))},
}));
const axios = require('axios');
const models = require('../src/models');
const generator = require('../src/services/promptQuizGenerator');
const service = require('../src/services/aiQuizService');
const originalKey = process.env.GEMINI_API_KEY;
const packet = data => ({data: {candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify(data)}]}}]}});
beforeEach(() => {jest.clearAllMocks(); process.env.GEMINI_API_KEY = 'unit-test-only';});
afterAll(() => {if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;});
async function generate() {
  const outputs = [
    {valid: true, sourceRelevant: false, topic: 'Arithmetic', domain: 'Mathematics', concepts: ['addition'], requirements: [], needsRetrieval: false, retrievalQuery: '', marksPerQuestion: 4},
    {questions: [{slot: 0, question: 'What is the result of adding two and three?', questionType: 'MCQ', options: ['3', '4', '5', '6'], correctAnswer: '5', explanation: 'Adding two to three gives a total of five.', difficulty: 'EASY', topic: 'Addition'}]},
    {reviews: [{index: 0, relevant: true, unique: true, unambiguous: true, explanationCorrect: true, difficultyCorrect: true, sourceSupported: true, correctOption: 2, correctAnswer: '', reason: ''}]},
  ];
  outputs.forEach(output => axios.post.mockResolvedValueOnce(packet(output)));
  return generator.generate('Arithmetic', 1, 'EASY');
}
test('writes only verified normalized answers, marks and four options in one transaction', async () => {
  const questions = await generate();
  await service.saveQuestions(12, questions, {difficulty: 'EASY'});
  expect(models.AIQuestion.create).toHaveBeenCalledWith(expect.objectContaining({marks: 4, correctAnswer: '2', difficulty: 'EASY'}), {transaction: {id: 'test-transaction'}});
  expect(models.AIQuestionOption.create).toHaveBeenCalledTimes(4);
  const options = models.AIQuestionOption.create.mock.calls.map(call => call[0]);
  expect(options.filter(option => option.isCorrect)).toEqual([expect.objectContaining({optionText: '5'})]);
});
test('blocks unverified or tampered batches before any question insert', async () => {
  const questions = await generate();
  await expect(service.saveQuestions(12, [...questions], {difficulty: 'EASY'})).rejects.toThrow(/live AI-verified/);
  questions[0].marks = -5;
  await expect(service.saveQuestions(12, questions, {difficulty: 'EASY'})).rejects.toThrow(/unchanged/);
  expect(models.AIQuestion.create).not.toHaveBeenCalled();
  expect(models.AIQuestionOption.create).not.toHaveBeenCalled();
});
