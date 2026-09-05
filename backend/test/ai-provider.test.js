'use strict';
jest.mock('groq-sdk', () => jest.fn());
jest.mock('axios', () => ({post: jest.fn()}));
const axios = require('axios');
const Groq = require('groq-sdk');
const {createAIProvider, failureInfo, providerConfiguration, geminiContent} = require('../src/services/aiProvider');
const {getGeminiApiKey} = require('../src/config/aiProviders');
const {groqContent} = require('../src/services/groqProvider');
const packet = text => ({data: {modelVersion:'test-model',responseId:'test-id',candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}});
const log = {info: jest.fn(), warn: jest.fn()};
beforeEach(() => jest.clearAllMocks());

test.each([
  [{GEMINI_API_KEY2: ' new-key ', GEMINI_API_KEY: 'old-key'}, 'old-key'],
  [{GEMINI_API_KEY2: 'new-key'}, 'new-key'],
  [{GEMINI_API_KEY2: ' ', GEMINI_API_KEY: 'old-key'}, 'old-key'],
  [{GEMINI_API_KEY2: 'your_new_key', GEMINI_API_KEY: 'old-key'}, 'old-key'],
  [{}, ''],
])('selects the configured Gemini replacement key with legacy compatibility %#', (env, expected) => {
  expect(getGeminiApiKey(env)).toBe(expected);
});

test('Gemini request and configuration check use KEY2 when the original key is absent', async () => {
  const previous = {GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_API_KEY2: process.env.GEMINI_API_KEY2};
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY2 = ' test-replacement-secret ';
  axios.post.mockResolvedValueOnce(packet('Replacement key response'));
  try {
    expect(providerConfiguration().geminiConfigured).toBe(true);
    await geminiContent({prompt: 'Reply OK', timeout: 3000, maxOutputTokens: 10});
    const [url, body, config] = axios.post.mock.calls[0];
    expect(config.headers['x-goog-api-key']).toBe('test-replacement-secret');
    expect(JSON.stringify({url, body, status: providerConfiguration()})).not.toContain('test-replacement-secret');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test('Gemini success returns immediately without contacting Groq', async () => {
  const gemini=jest.fn().mockResolvedValue(packet('A live-style response fixture')), groq=jest.fn();
  const response=await createAIProvider({gemini,groq,log})({prompt:'Test request'});
  expect(response.provider).toBe('gemini');expect(groq).not.toHaveBeenCalled();
});

test.each(['quiz', 'coding_generation', 'mentor', 'course_structure', 'assessment_evaluation'])('%s shares the configured Gemini key and model', async feature => {
  const names = ['GEMINI_API_KEY2', 'GEMINI_MODEL', 'QUIZ_GENERATION_MODEL', 'QUIZ_RETRIEVAL_MODEL', 'CODING_GENERATION_MODEL', 'AI_MENTOR_MODEL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  names.forEach(name => { process.env[name] = 'obsolete-feature-model'; });
  process.env.GEMINI_API_KEY2 = 'shared-test-key';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
  axios.post.mockResolvedValueOnce(packet('OK'));
  const groq = jest.fn();
  try {
    await createAIProvider({groq, log})({prompt: 'Reply OK', feature, model: 'obsolete-model'});
    const [url, , config] = axios.post.mock.calls[0];
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent');
    expect(config.headers['x-goog-api-key']).toBe('shared-test-key');
    expect(groq).not.toHaveBeenCalled();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test.each([
  [undefined, 'gemini-3.5-flash-lite', {thinkingLevel: 'minimal'}],
  ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', {thinkingLevel: 'minimal'}],
  ['gemini-3.5-flash', 'gemini-3.5-flash', {thinkingLevel: 'low'}],
  ['gemini-2.5-flash', 'gemini-2.5-flash', {thinkingBudget: 0}],
])('Gemini model %s uses compatible settings and preserves structured output', async (model, expected, thinkingConfig) => {
  const names = ['GEMINI_API_KEY2', 'GEMINI_MODEL', 'GEMINI_MODELS'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.GEMINI_API_KEY2 = 'test-model-key';
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MODELS;
  const schema = {type: 'OBJECT', properties: {topic: {type: 'STRING'}}, required: ['topic']};
  axios.post.mockResolvedValueOnce(packet('{"topic":"Math"}'));
  try {
    if (model) process.env.GEMINI_MODEL = model;
    // Old per-request/list overrides must not split generation from review.
    process.env.GEMINI_MODELS = 'obsolete-model';
    await geminiContent({prompt: 'Topic', model: 'obsolete-feature-model', json: true, schema, timeout: 3000, maxOutputTokens: 100});
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toContain(`/models/${expected}:generateContent`);
    expect(body.generationConfig).toMatchObject({thinkingConfig, responseMimeType: 'application/json', responseSchema: schema});
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
test.each([400,401,403,404,408,429,500,502,503,504])('Gemini HTTP %i automatically tries Groq',async status=>{
  const gemini=jest.fn().mockRejectedValue({response:{status}}),groq=jest.fn().mockResolvedValue(packet('Backup response fixture'));
  const result=await createAIProvider({gemini,groq,log})({prompt:'Dynamic request',system:'Rules',timeout:10000});
  expect(result.provider).toBe('groq');expect(groq.mock.calls[0][0].prompt).toBe('Dynamic request');
  expect(groq.mock.calls[0][0].system).toBe('Rules');
  expect(gemini.mock.calls[0][0].timeout).toBeLessThan(10000);
  expect(log.warn).toHaveBeenCalledWith('[AIProvider] Failure',expect.objectContaining({provider:'gemini',nextProvider:'groq'}));
});
test.each(['MISSING_API_KEY','ECONNABORTED','ENOTFOUND','ECONNREFUSED'])('Gemini %s leaves a bounded Groq attempt',async code=>{
  const result=await createAIProvider({gemini:async()=>{throw {code};},groq:async()=>packet('Reply'),log})({prompt:'Dynamic request',timeout:10000});
  expect(result.provider).toBe('groq');
});
test('malformed or truncated Gemini JSON falls through to valid Groq JSON',async()=>{
  const result=await createAIProvider({gemini:async()=>packet('{broken'),groq:async()=>packet('{"topic":"Biology"}'),log})({prompt:'Topic',json:true,schema:{type:'OBJECT',required:['topic'],properties:{topic:{type:'STRING'}}}});
  expect(result.provider).toBe('groq');
});
test('both failures expose only safe classifications, never raw keys or provider messages',async()=>{
  const secret='SECRET_TEST_SENTINEL';
  const fail=async()=>{throw {response:{status:429,data:{error:{message:secret}}},message:secret,config:{headers:{Authorization:secret}}};};
  let caught;
  try{await createAIProvider({gemini:fail,groq:fail,log})({prompt:'User content should not be logged'});}catch(e){caught=e;}
  expect(caught).toMatchObject({status:503,code:'AI_PROVIDERS_UNAVAILABLE'});
  expect(caught.message).not.toContain(secret);
  expect(JSON.stringify([log.info.mock.calls,log.warn.mock.calls,caught])).not.toMatch(/SECRET_TEST_SENTINEL|User content/);
  expect(caught.failures).toHaveLength(2);
});
test.each([
 [{code:'MISSING_API_KEY'},'MISSING_API_KEY'],[{status:401},'INVALID_API_KEY_OR_ACCESS'],[{status:429},'RATE_OR_QUOTA_LIMIT'],[{name:'APIConnectionTimeoutError'},'TIMEOUT'],[{status:503},'API_FAILURE']
])('normalizes Groq SDK failures safely', (error,reason)=>expect(failureInfo(error,'groq').reason).toBe(reason));
test('Groq SDK uses server key and structured schema without SDK retries',async()=>{
  const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='unit-test-secret';
  const create=jest.fn().mockResolvedValue({id:'test-response',model:'openai/gpt-oss-120b',choices:[{finish_reason:'stop',message:{content:'{"topic":"Math"}'}}]});
  Groq.mockImplementation(()=>({chat:{completions:{create}}}));
  try {
    const response=await groqContent({prompt:'Quiz on math',json:true,schema:{type:'OBJECT',required:['topic'],properties:{topic:{type:'STRING'}}},timeout:3000});
    expect(response.provider).toBe('groq');
    expect(Groq).toHaveBeenCalledWith(expect.objectContaining({apiKey:'unit-test-secret',maxRetries:0,timeout:3000}));
    const request=create.mock.calls[0][0];
    expect(request.response_format.json_schema.schema.type).toBe('object');
    expect(JSON.stringify(request.messages)).not.toContain('unit-test-secret');
  } finally {if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
