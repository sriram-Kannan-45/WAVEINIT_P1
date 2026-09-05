'use strict';
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Server-only configuration. Never import this module from frontend code.
// Deployment environment wins; local backend .env comes next. The existing
// Python service .env supplies only missing shared AI settings, not unrelated config.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({path: path.resolve(__dirname, '../../.env')});
  const sharedFile = path.resolve(__dirname, '../../../ai-service/.env');
  if (fs.existsSync(sharedFile)) {
    const shared = dotenv.parse(fs.readFileSync(sharedFile));
    for (const name of ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_QUIZ_MODEL', 'GROQ_MENTOR_MODEL', 'GROQ_RETRIEVAL_MODEL']) {
      if (!process.env[name]?.trim() && shared[name]?.trim()) process.env[name] = shared[name].trim();
    }
  }
}
const hasKey = value => typeof value === 'string' && !!value.trim() && !/^(your[-_]|replace[-_]|placeholder)/i.test(value);
function getGeminiCredentials(env = process.env) {
  const seen = new Set();
  return ['GEMINI_API_KEY', 'GEMINI_API_KEY2'].flatMap(credential => {
    const apiKey = env[credential]?.trim();
    if (!hasKey(apiKey) || seen.has(apiKey)) return [];
    seen.add(apiKey);
    return [{credential, apiKey}];
  });
}
function getGeminiApiKey(env = process.env) {
  return getGeminiCredentials(env)[0]?.apiKey || '';
}
function providerConfiguration() {
  return {geminiConfigured: hasKey(getGeminiApiKey()), groqConfigured: hasKey(process.env.GROQ_API_KEY)};
}
function getGeminiModel(env = process.env) {
  return env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
}
module.exports = {hasKey, getGeminiCredentials, getGeminiApiKey, getGeminiModel, providerConfiguration};
