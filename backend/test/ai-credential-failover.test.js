jest.mock('axios', () => ({post: jest.fn()}));
const axios = require('axios');
const {createAIProvider} = require('../src/services/aiProvider');
const {getGeminiCredentials} = require('../src/config/aiProviders');
const keys = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GROQ_API_KEY'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const packet = text => ({data: {candidates: [{finishReason: 'STOP', content: {parts: [{text}]}}]}});
let log;
beforeEach(() => {
  axios.post.mockReset();
  keys.forEach((key, index) => {process.env[key] = `private-fixture-key-${index}`;});
  log = {info: jest.fn(), warn: jest.fn()};
});
afterAll(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test.each([401, 429, 503])('Gemini key 1 HTTP %s tries key 2 and stops before Groq', async status => {
  axios.post.mockRejectedValueOnce({response: {status}}).mockResolvedValueOnce(packet('{"ok":true}'));
  const groq = jest.fn();
  const result = await createAIProvider({groq, log})({prompt: 'Public fixture', json: true, timeout: 10000});
  expect(result.credential).toBe('GEMINI_API_KEY2');
  expect(axios.post.mock.calls.map(call => call[2].headers['x-goog-api-key'])).toEqual(keys.slice(0, 2).map(key => process.env[key]));
  expect(axios.post.mock.calls.map(call => call[2].timeout)).toEqual([2000, 2000]);
  expect(result.failover).toEqual([expect.objectContaining({credential: 'GEMINI_API_KEY', status})]);
  expect(groq).not.toHaveBeenCalled();
  expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls, result.failover])).not.toContain('private-fixture-key');
});

test('first Gemini success stops without contacting key 2 or Groq', async () => {
  axios.post.mockResolvedValueOnce(packet('OK'));
  const groq = jest.fn();
  const result = await createAIProvider({groq, log})({prompt: 'Reply OK'});
  expect(result.credential).toBe('GEMINI_API_KEY');
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(groq).not.toHaveBeenCalled();
});

test('bad JSON then a timeout on Gemini reaches Groq with the original request', async () => {
  axios.post.mockResolvedValueOnce(packet('{broken')).mockRejectedValueOnce({code: 'ETIMEDOUT'});
  const groq = jest.fn().mockResolvedValue(packet('{"ok":true}'));
  const result = await createAIProvider({groq, log})({prompt: 'Keep this request', json: true, timeout: 10000});
  expect(result.provider).toBe('groq');
  expect(result.failover.map(f => f.credential)).toEqual(['GEMINI_API_KEY', 'GEMINI_API_KEY2']);
  expect(groq).toHaveBeenCalledWith(expect.objectContaining({prompt: 'Keep this request', json: true}));
  expect(groq.mock.calls[0][0]).not.toHaveProperty('apiKey');
});

test('all three failures return one safe error with each failed credential identified', async () => {
  axios.post.mockRejectedValue({response: {status: 429}, message: 'private-fixture-key-0'});
  const groq = jest.fn().mockRejectedValue({status: 429, message: 'private-fixture-key-2'});
  let error;
  try { await createAIProvider({groq, log})({prompt: 'Public fixture'}); } catch (caught) {error = caught;}
  expect(error.code).toBe('AI_PROVIDERS_UNAVAILABLE');
  expect(error.failures).toHaveLength(3);
  expect(error.message).toMatch(/Gemini key 1.*Gemini key 2.*Groq/);
  expect(JSON.stringify([error, log.info.mock.calls, log.warn.mock.calls])).not.toContain('private-fixture-key');
});

test('duplicate or blank Gemini keys are not retried', async () => {
  process.env.GEMINI_API_KEY2 = ` ${process.env.GEMINI_API_KEY} `;
  expect(getGeminiCredentials()).toHaveLength(1);
  axios.post.mockRejectedValue({response: {status: 503}});
  const groq = jest.fn().mockResolvedValue(packet('OK'));
  await createAIProvider({groq, log})({prompt: 'Public fixture'});
  expect(axios.post).toHaveBeenCalledTimes(1);
  process.env.GEMINI_API_KEY = ' ';
  expect(getGeminiCredentials().map(c => c.credential)).toEqual(['GEMINI_API_KEY2']);
});
