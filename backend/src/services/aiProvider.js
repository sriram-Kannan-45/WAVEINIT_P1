'use strict';
const axios = require('axios');
const {randomUUID} = require('crypto');
const {getGeminiCredentials, getGeminiApiKey, getGeminiModel, providerConfiguration} = require('../config/aiProviders');
const {groqContent, retryDelayMs} = require('./groqProvider');
const logger = require('../utils/logger');

function failureInfo(error, provider) {
  const status = Number(error.status || error.response?.status) || undefined;
  let reason = 'API_FAILURE';
  if (error.code === 'MISSING_API_KEY') reason = 'MISSING_API_KEY';
  else if ([401, 403].includes(status)) reason = 'INVALID_API_KEY_OR_ACCESS';
  else if (status === 429) reason = 'RATE_OR_QUOTA_LIMIT';
  else if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code) || error.name === 'APIConnectionTimeoutError') reason = 'TIMEOUT';
  else if (error.code === 'INVALID_AI_RESPONSE') reason = 'INVALID_RESPONSE';
  else if (error.code === 'UNSUPPORTED_CAPABILITY') reason = 'UNSUPPORTED_CAPABILITY';
  else if ([400, 404, 422].includes(status)) reason = 'MODEL_OR_REQUEST_CONFIGURATION';
  else if (['ECONNREFUSED', 'ENOTFOUND', 'EACCES'].includes(error.code) || error.name === 'APIConnectionError') reason = 'CONNECTION_FAILURE';
  return {provider, status, reason, ...(status === 429 && retryDelayMs(error) != null ? {retryAfterMs: retryDelayMs(error)} : {})}; // Never include raw SDK error messages, headers or request bodies.
}
function unavailable(failures) {
  const descriptions = {MISSING_API_KEY: 'key is missing', INVALID_API_KEY_OR_ACCESS: 'key or access was rejected', RATE_OR_QUOTA_LIMIT: 'rate limit or quota was reached', TIMEOUT: 'request timed out', INVALID_RESPONSE: 'response failed validation', MODEL_OR_REQUEST_CONFIGURATION: 'model or request configuration was rejected', UNSUPPORTED_CAPABILITY: 'required source retrieval is unavailable', CONNECTION_FAILURE: 'connection failed', API_FAILURE: 'API request failed'};
  const error = new Error(`Live AI is unavailable. ${failures.map(f => `${f.provider === 'groq' ? 'Groq' : f.credential === 'GEMINI_API_KEY2' ? 'Gemini key 2' : 'Gemini key 1'}: ${descriptions[f.reason]}`).join('; ')}. No AI content was saved. Please retry or check server AI configuration.`);
  return Object.assign(error, {status: 503, code: 'AI_PROVIDERS_UNAVAILABLE', failures});
}
function validSchema(value, schema, tolerant = false) {
  if (!schema) return true;
  const type = schema.type?.toLowerCase();
  if (type === 'object') return value != null && !Array.isArray(value) && typeof value === 'object' && (tolerant || (schema.required || []).every(key => Object.hasOwn(value, key))) && Object.entries(schema.properties || {}).every(([key, sub]) => !Object.hasOwn(value, key) || validSchema(value[key], sub, tolerant));
  if (type === 'array') return Array.isArray(value) && (schema.minItems == null || value.length >= schema.minItems) && (schema.maxItems == null || value.length <= schema.maxItems) && value.every(item => validSchema(item, schema.items, tolerant));
  if (type === 'integer' && !Number.isInteger(value) && !(tolerant && typeof value === 'string' && /^-?\d+$/.test(value.trim()))) return false;
  if (type === 'boolean' && typeof value !== 'boolean' && !(tolerant && (value === 'true' || value === 'false'))) return false;
  if (type === 'string' && typeof value !== 'string' && !(tolerant && (typeof value === 'number' || typeof value === 'boolean'))) return false;
  if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)) && !(tolerant && typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))) return false;
  if (type === 'integer' && Number.isInteger(value) && schema.enum && !schema.enum.includes(value)) return false;
  if (schema.enum && !(schema.enum.includes(value) || (tolerant && typeof value === 'string' && schema.enum.some(entry => typeof entry === 'string' && entry.toLowerCase() === value.toLowerCase())))) return false;
  const numeric = Number(value);
  if (schema.minimum != null && Number.isFinite(numeric) && numeric < schema.minimum) return false;
  if (schema.maximum != null && Number.isFinite(numeric) && numeric > schema.maximum) return false;
  return true;
}
function validateResponse(response, {json, schema, search, tolerant}) {
  const candidate = response.data?.candidates?.[0];
  const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('').trim();
  const bad = () => Object.assign(new Error('Invalid provider response'), {code: 'INVALID_AI_RESPONSE'});
  if (candidate?.finishReason !== 'STOP' || !text) throw bad();
  if (json) {
    let value;
    try { value = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw bad(); }
    if (!validSchema(value, schema, tolerant)) throw bad();
  }
  if (search && !response.sourceEvidence?.length && (!candidate.groundingMetadata?.groundingChunks?.length || !candidate.groundingMetadata?.groundingSupports?.length)) throw bad();
  return response;
}
async function geminiContent(options) {
  const apiKey = options.apiKey ?? getGeminiApiKey();
  if (!apiKey) throw Object.assign(new Error('Gemini key missing'), {code: 'MISSING_API_KEY'});
  const {prompt, system, json, schema, maxOutputTokens, timeout, search} = options;
  // Every Gemini feature uses this setting, including generation and review.
  const selected = getGeminiModel();
  // Gemini 2.5 Flash-Lite is unavailable to new users. Its replacement uses
  // thinking levels; retain the old budget format for explicit 2.5 overrides.
  const thinkingConfig = /^gemini-3[.-]/.test(selected)
    ? {thinkingLevel: /flash-lite/.test(selected) ? 'minimal' : 'low'}
    : {thinkingBudget: 0};
  const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected)}:generateContent`, {
    ...(system ? {systemInstruction: {parts: [{text: system}]}} : {}), contents: [{parts: [{text: prompt}]}],
    ...(search ? {tools: [{google_search: {}}]} : {}),
    generationConfig: {temperature: 0.15, maxOutputTokens, thinkingConfig, ...(json ? {responseMimeType: 'application/json'} : {}), ...(schema ? {responseSchema: schema} : {})},
  }, {timeout, headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey}});
  return {...response, provider: 'gemini', data: {...response.data, provider: 'gemini'}};
}
function createAIProvider({gemini = geminiContent, groq = groqContent, log = logger} = {}) {
  return async function generateContent(options) {
    const requestId = randomUUID();
    const timeout = Math.max(1000, options.timeout || 30000);
    const deadline = Date.now() + timeout;
    const failures = [];
    const credentials = getGeminiCredentials();
    const geminiAttempts = credentials.length ? credentials : [{credential: 'GEMINI_API_KEY', apiKey: ''}];
    const providerList = [
      ...geminiAttempts.map(entry => ({provider: 'gemini', call: gemini, ...entry})),
      {provider: 'groq', call: groq},
    ];

    for (const [index, {provider, call, credential, apiKey}] of providerList.entries()) {
      const remaining = deadline - Date.now();
      const identity = {provider, ...(credential ? {credential} : {})};
      if (remaining <= 0) { failures.push({...identity, reason: 'TIMEOUT'}); continue; }
      // Both Gemini attempts share 40% of the deadline, leaving time for Groq.
      const budget = provider === 'gemini' ? Math.min(remaining, 20000, Math.max(1, Math.floor(timeout * 0.4 / geminiAttempts.length))) : remaining;
      try {
        log.info('[AIProvider] Attempt', {requestId, ...identity, feature: options.feature || 'quiz'});
        const result = validateResponse(await call({...options, ...(provider === 'gemini' ? {apiKey} : {}), timeout: budget, maxOutputTokens: options.maxOutputTokens || 1200}), options);
        result.provider = provider;
        if (credential) result.credential = credential;
        result.data.provider = provider;
        result.failover = failures;
        log.info('[AIProvider] Success', {requestId, ...identity, fallback: failures.length > 0, model: result.data.modelVersion, responseId: result.data.responseId});
        return result;
      } catch (error) {
        const failure = {...failureInfo(error, provider), ...(credential ? {credential} : {})};
        failures.push(failure);
        log.warn('[AIProvider] Failure', {requestId, ...failure, nextProvider: providerList[index + 1]?.provider || null});
      }
    }
    throw unavailable(failures);
  };
}
const generateContent = createAIProvider();

module.exports = {generateContent, createAIProvider, geminiContent, failureInfo, validSchema, providerConfiguration};
