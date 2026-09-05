'use strict';
// One small request per provider. Never print credentials, SDK errors or headers.
const {getGeminiCredentials} = require('../src/config/aiProviders');
const {geminiContent, failureInfo} = require('../src/services/aiProvider');
const {groqContent} = require('../src/services/groqProvider');
const axios = require('axios');

async function check(provider, call, credential, apiKey) {
  try {
    const response = await call({prompt: 'Reply with OK.', maxOutputTokens: 16, timeout: 15000, feature: 'quiz', ...(apiKey ? {apiKey} : {})});
    console.log(JSON.stringify({provider, credential, ok: true, model: response.data?.modelVersion}));
  } catch (error) {
    const details = error.response?.data?.error?.details || [];
    let message = String(error.response?.data?.error?.message || '');
    for (const key of [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY2, process.env.GROQ_API_KEY]) {
      if (key?.trim()) message = message.split(key.trim()).join('[REDACTED]');
    }
    const violations = details.filter(d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure').flatMap(d => d.violations || []);
    console.log(JSON.stringify({
      ...failureInfo(error, provider), credential, ok: false,
      message: message.slice(0, 1600),
      quota: violations.map(v => ({metric: v.quotaMetric, id: v.quotaId, model: v.quotaDimensions?.model, value: v.quotaValue})),
      retryDelay: details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')?.retryDelay,
      zeroQuota: /\blimit:\s*0(?:\D|$)/i.test(error.response?.data?.error?.message || ''),
    }));
    if (provider === 'gemini' && error.response?.status === 404) {
      try {
        const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: {'x-goog-api-key': apiKey}, timeout: 15000,
        });
        console.log(JSON.stringify({availableGeminiModels: response.data.models?.filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name)}));
      } catch (listError) {
        console.log(JSON.stringify({operation: 'list-models', ...failureInfo(listError, provider)}));
      }
    }
    process.exitCode = 1;
  }
}
const credentials = getGeminiCredentials();
console.log(JSON.stringify({geminiCredentials: credentials.map(c => c.credential)}));
(async () => {
  for (const {credential, apiKey} of credentials) await check('gemini', geminiContent, credential, apiKey);
  if (!process.argv.includes('--gemini-only')) await check('groq', groqContent);
})();
