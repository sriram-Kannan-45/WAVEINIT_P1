'use strict';

jest.mock('../src/models', () => ({
  CodingAttempt: { findOne: jest.fn() },
  CodingProblem: { findByPk: jest.fn() },
  CodingTestCase: { findAll: jest.fn() },
  CodingProblemLanguage: { findAll: jest.fn() },
  CodingAiHelp: { findAll: jest.fn(), create: jest.fn() },
  CodingAssessment: {},
}));
jest.mock('../src/config/db', () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }));

const models = require('../src/models');
const { sequelize } = require('../src/config/db');
const axios = require('axios');
const service = require('../src/services/codingAiAssistantService');
const base = { attemptId: 1, problemId: 11, participantId: 7, code: '', question: 'Can you explain the problem?' };
let attempt, problem, records;

beforeEach(() => {
  jest.clearAllMocks();
  records = [];
  attempt = { assessmentId: 2, aiHelpUsage: {}, update: jest.fn(async patch => Object.assign(attempt, patch)) };
  problem = { assessmentId: 2, title: 'Classify a number', description: 'Determine its parity.', assessment: { aiHelpLimit: 1, aiAssistantEnabled: true } };
  models.CodingAttempt.findOne.mockResolvedValue(attempt);
  models.CodingProblem.findByPk.mockResolvedValue(problem);
  models.CodingTestCase.findAll.mockResolvedValue([]);
  models.CodingProblemLanguage.findAll.mockResolvedValue([]);
  models.CodingAiHelp.findAll.mockImplementation(async ({ where, limit }) => records.filter(r => r.problemId === where.problemId).slice(-limit).reverse());
  models.CodingAiHelp.create.mockImplementation(async row => records.push({ ...row, created_at: new Date() }));
  sequelize.transaction.mockImplementation(async callback => {
    const before = { ...attempt.aiHelpUsage };
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { attempt.aiHelpUsage = before; throw error; }
  });
  axios.post.mockResolvedValue({ data: { assist: 'Think about what property distinguishes the two possible categories.\n\nWhich operation would help you check that property?' } });
});

test.each([0, 1, 3, -1])('ten successful exchanges ignore legacy quota %s and persist reporting', async limit => {
  problem.assessment.aiHelpLimit = limit;
  for (let i = 1; i <= 10; i++) {
    const result = await service.grantAssist({ ...base, question: `Question ${i}` });
    expect(result).toMatchObject({ usageUsed: i, usageLimit: -1, remaining: -1, unlimited: true });
  }
  expect(records).toHaveLength(10);
  expect(records.map(r => r.usageNumber)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  expect(records.every(r => r.attemptId === 1 && r.problemId === 11 && r.participantId === 7 && r.created_at)).toBe(true);
  expect(await service.getStatus(base)).toMatchObject({ used: 10, unlimited: true, enabled: true });
  const payloads = axios.post.mock.calls.filter(([url]) => url.endsWith('/coding/assist')).map(([, payload]) => payload);
  expect(payloads[9].conversation).toHaveLength(18);
  expect(payloads[9].conversation[0]).toEqual({ role: 'user', text: 'Question 1' });
});

test('question context is isolated and returning to a question resumes its history', async () => {
  await service.grantAssist(base);
  await service.grantAssist({ ...base, problemId: 12, question: 'Second problem' });
  const payloads = () => axios.post.mock.calls.filter(([url]) => url.endsWith('/coding/assist')).map(([, p]) => p);
  expect(payloads()[1].conversation).toEqual([]);
  await service.grantAssist(base);
  expect(payloads()[2].conversation).toHaveLength(2);
  expect(attempt.aiHelpUsage).toEqual({ 11: 2, 12: 1 });
});

test('failed persistence does not consume usage and the next request succeeds', async () => {
  models.CodingAiHelp.create.mockRejectedValueOnce(new Error('Temporary storage failure'));
  await expect(service.grantAssist(base)).rejects.toThrow('Temporary storage failure');
  expect(attempt.aiHelpUsage).toEqual({});
  expect((await service.grantAssist(base)).usageUsed).toBe(1);
});

test('provider failure falls back without imposing a lock', async () => {
  axios.post.mockRejectedValue(new Error('Upstream timeout'));
  expect(await service.grantAssist(base)).toMatchObject({ usageUsed: 1, unlimited: true });
  expect(await service.grantAssist(base)).toMatchObject({ usageUsed: 2, unlimited: true });
});

test.each([
  'Your hint will unlock after you make an attempt.',
  'Your help options unlock as you make progress.',
  'Try the problem for a little longer.',
  'Make an attempt first.',
  'Write code first.',
  'Run your code first before asking for help.',
])('obsolete response is rejected and excluded from model history: %s', async response => {
  records.push({ ...base, prompt: 'Hint?', response: 'Your help options unlock as you make progress.' });
  axios.post.mockResolvedValue({ data: { assist: response } });
  const result = await service.grantAssist(base);
  expect(result.response).not.toMatch(/unlock|wait|make an attempt/i);
  const payload = axios.post.mock.calls.find(([url]) => url.endsWith('/coding/assist'))[1];
  expect(payload.conversation).toEqual([{ role: 'user', text: 'Hint?' }]);
});

test('authorization and explicit assessment enablement still apply', async () => {
  problem.assessmentId = 99;
  await expect(service.grantAssist(base)).rejects.toMatchObject({ status: 404 });
  problem.assessmentId = 2;
  problem.assessment.aiAssistantEnabled = false;
  await expect(service.grantAssist(base)).rejects.toMatchObject({ status: 400 });
  expect(models.CodingAiHelp.create).not.toHaveBeenCalled();
});

test('both current question and recent conversation are present in the system prompt', () => {
  const prompt = service.buildSystemPrompt({ question: 'Why?', conversation: [{ role: 'user', text: 'What does remainder mean?' }] });
  expect(prompt).toContain('What does remainder mean?');
  expect(prompt).toContain('Never require an attempt');
});
