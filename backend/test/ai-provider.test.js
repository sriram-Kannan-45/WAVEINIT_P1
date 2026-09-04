'use strict';
jest.mock('groq-sdk', () => jest.fn());
const Groq = require('groq-sdk');
const {createAIProvider, failureInfo, providerConfiguration} = require('../src/services/aiProvider');
const {groqContent} = require('../src/services/groqProvider');
const packet = text => ({data: {modelVersion:'test-model',responseId:'test-id',candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}});
const log = {info: jest.fn(), warn: jest.fn()};
beforeEach(() => jest.clearAllMocks());
test('Gemini success returns immediately without contacting Groq', async () => {
  const gemini=jest.fn().mockResolvedValue(packet('A live-style response fixture')), groq=jest.fn();
  const response=await createAIProvider({gemini,groq,log})({prompt:'Test request'});
  expect(response.provider).toBe('gemini');expect(groq).not.toHaveBeenCalled();
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
