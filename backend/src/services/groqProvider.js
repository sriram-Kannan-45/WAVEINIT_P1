'use strict';
const Groq = require('groq-sdk');
const {hasKey} = require('../config/aiProviders');
const logger = require('../utils/logger');
function retryDelayMs(error) {
  const raw = error.headers?.get?.('retry-after') ?? error.headers?.['retry-after'];
  if (raw == null) return null;
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : null;
}

function jsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map(jsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const result = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, key === 'type' && typeof value === 'string' ? value.toLowerCase() : jsonSchema(value)]));
  if (result.type === 'object') result.additionalProperties = false;
  return result;
}
async function groqContent({prompt, system, json, schema, maxOutputTokens, timeout, feature, search}) {
  if (!hasKey(process.env.GROQ_API_KEY)) throw Object.assign(new Error('Groq key missing'), {code: 'MISSING_API_KEY'});
  const model = search ? (process.env.GROQ_RETRIEVAL_MODEL || 'groq/compound') : (feature === 'mentor' ? process.env.GROQ_MENTOR_MODEL : process.env.GROQ_QUIZ_MODEL) || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const converted = schema ? jsonSchema(schema) : null;
  const strict = converted && /^openai\/gpt-oss-(?:20b|120b)$/.test(model);
  // Structured output is enabled for the default model; semantic and schema
  // validation remain mandatory in the common layer and quiz pipeline.
  const client = new Groq({apiKey: process.env.GROQ_API_KEY.trim(), maxRetries: 0, timeout});
  const payload = {
    model,
    messages: [
      {role: 'system', content: (system || 'Respond to the user accurately.') + (json ? `\nReturn only a JSON object.${converted && !strict ? ` Match this JSON schema exactly: ${JSON.stringify(converted)}` : ''}` : '')},
      {role: 'user', content: prompt},
    ],
    temperature: 0.15,
    max_completion_tokens: Math.min(maxOutputTokens || 1200, 8000),
    ...(json ? {response_format: strict ? {type: 'json_schema', json_schema: {name: 'lms_response', strict: true, schema: converted}} : {type: 'json_object'}} : {}),
    ...(/^openai\/gpt-oss-/.test(model) ? {reasoning_effort: 'low'} : {}),
    ...(search ? {compound_custom: {tools: {enabled_tools: ['web_search']}}} : {}),
  };
  const deadline = Date.now() + timeout;
  let completion;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      completion = await client.chat.completions.create(payload, {timeout: Math.max(1, deadline - Date.now()), maxRetries: 0});
      break;
    } catch (error) {
      const delay = retryDelayMs(error);
      const waitMs = delay == null ? null : Math.max(250, delay) + 250;
      // Honor the provider's actual reset time, including 27–42s token windows.
      // Retry only this transport call: previously validated quiz items stay intact.
      // Daily quota resets or delays beyond this request's deadline fail normally.
      if (error.status !== 429 || attempt >= 2 || waitMs == null || waitMs + 3000 >= deadline - Date.now()) throw error;
      logger.warn('[AIProvider] Rate limit retry', {provider:'groq', delayMs:waitMs, attempt:attempt+1, reason:'RATE_OR_QUOTA_LIMIT'});
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  const choice = completion.choices?.[0];
  const sourceEvidence = (choice?.message?.executed_tools || []).flatMap(tool => tool.search_results?.results || []).filter(row => /^https:\/\//.test(row.url || '') && typeof row.content === 'string' && row.content.trim()).map(row => ({uri: row.url, title: row.title, content: row.content}));
  return {sourceEvidence, data: {
    provider: 'groq', modelVersion: completion.model, responseId: completion.id,
    usageMetadata: {totalTokenCount: completion.usage?.total_tokens},
    candidates: [{finishReason: choice?.finish_reason === 'stop' ? 'STOP' : choice?.finish_reason || 'EMPTY', content: {parts: [{text: choice?.message?.content || ''}]}}],
  }, provider: 'groq'};
}
module.exports = {groqContent, jsonSchema, retryDelayMs};
