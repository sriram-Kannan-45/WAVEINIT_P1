'use strict';
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Server-only configuration. Never import this module from frontend code.
// Deployment environment wins; local backend .env comes next. The existing
// Python service .env supplies only missing Groq settings, not unrelated config.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({path: path.resolve(__dirname, '../../.env')});
  const sharedFile = path.resolve(__dirname, '../../../ai-service/.env');
  if (fs.existsSync(sharedFile)) {
    const shared = dotenv.parse(fs.readFileSync(sharedFile));
    for (const name of ['GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_QUIZ_MODEL', 'GROQ_MENTOR_MODEL', 'GROQ_RETRIEVAL_MODEL']) {
      if (!process.env[name]?.trim() && shared[name]?.trim()) process.env[name] = shared[name].trim();
    }
  }
}
const hasKey = value => typeof value === 'string' && !!value.trim() && !/^(your[-_]|replace[-_]|placeholder)/i.test(value);
function providerConfiguration() {
  return {geminiConfigured: hasKey(process.env.GEMINI_API_KEY), groqConfigured: hasKey(process.env.GROQ_API_KEY)};
}
module.exports = {hasKey, providerConfiguration};
