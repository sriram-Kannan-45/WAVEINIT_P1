jest.mock('axios', () => ({post: jest.fn()}));
const axios = require('axios');
const generator = require('./src/services/promptQuizGenerator');
const packet = data => ({data: {modelVersion: 'test-fixture', responseId: 'unit-test', candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify(data)}]}}]}});
beforeEach(() => {axios.post.mockReset(); process.env.GEMINI_API_KEY = 'unit-test-only';});

test('debug: single valid candidate review stays accepted', async () => {
  axios.post.mockResolvedValueOnce(packet({reviews: [{index: 0, relevant: true, unique: true, unambiguous: true, explanationCorrect: true, difficultyCorrect: true, sourceSupported: true, correctOption: 1, correctAnswer: '', reason: ''}]}));
  const q = {question: 'A bus covers 150 km in 3 hours. What is its average speed?', questionText: 'A bus covers 150 km in 3 hours. What is its average speed?', questionType: 'MCQ', options: ['30 km/h', '50 km/h', '60 km/h', '90 km/h'], correctAnswer: '1', correctOption: 1, explanation: 'Average speed = total distance / elapsed time = 150 / 3 = 50 km/h.', difficulty: 'MEDIUM', marks: 1, topic: 'Average speed'};
  const reviews = await generator.reviewQuestions({topic: 'Speed, Distance, and Time', instructions: 'x'}, [q], {});
  console.log('REVIEW RESULT:', JSON.stringify(reviews));
  expect(reviews[0].valid).toBe(true);
});

test('debug: full generate single candidate', async () => {
  const intent = {valid: true, sourceRelevant: false, topic: 'Speed, Distance, and Time', domain: 'Mathematics', concepts: ['formulas', 'units', 'applications'], requirements: ['clear multiple-choice questions'], needsRetrieval: false, retrievalQuery: '', marksPerQuestion: 1};
  const q0 = {slot: 0, question: 'A bus covers 150 km in 3 hours. What is its average speed?', questionType: 'MCQ', options: ['30 km/h', '50 km/h', '60 km/h', '90 km/h'], correctAnswer: '50 km/h', explanation: 'Average speed = total distance / elapsed time = 150 / 3 = 50 km/h.', difficulty: 'MEDIUM', topic: 'Average speed'};
  const reviewR = {index: 0, relevant: true, unique: true, unambiguous: true, explanationCorrect: true, difficultyCorrect: true, sourceSupported: true, correctOption: 1, correctAnswer: '', reason: ''};
  axios.post.mockResolvedValueOnce(packet(intent));
  axios.post.mockResolvedValueOnce(packet({questions: [q0]}));
  axios.post.mockResolvedValueOnce(packet({reviews: [reviewR]}));
  const result = await generator.generate('Generate a quiz on Speed, Distance, and Time', 1);
  console.log('GENERATE RESULT:', JSON.stringify(result.map(q => ({q: q.question, a: q.correctAnswer, o: q.correctOption, d: q.difficulty}))));
  expect(result).toHaveLength(1);
});