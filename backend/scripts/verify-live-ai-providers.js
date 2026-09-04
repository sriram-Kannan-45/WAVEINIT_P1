'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {generateContent, createAIProvider, geminiContent, providerConfiguration} = require('../src/services/aiProvider');
const {groqContent} = require('../src/services/groqProvider');
const providerModule = require('../src/services/aiProvider');
const liveTransport = providerModule.generateContent;
providerModule.generateContent = async options => {
  const response = await liveTransport(options);
  if (options.prompt.startsWith('Independently audit')) {
    const audit = JSON.parse(response.data.candidates[0].content.parts[0].text);
    console.log('PUBLIC SAMPLE REVIEW:', JSON.stringify(audit.reviews.map(({correctOption, correctAnswer, ...review}) => review)));
  }
  return response;
};
const generator = require('../src/services/promptQuizGenerator');
const quiz = require('../src/services/quizAiAssistantService');
const coding = require('../src/services/codingAiAssistantService');
const section = process.argv.find(arg => arg.startsWith('--section='))?.split('=')[1];
const result = {checkedAt: new Date().toISOString(), configuration: providerConfiguration(), checks: {}};
(async () => {
  if (!section || section === 'probe') {
  try {
    const direct = await geminiContent({prompt: 'Reply READY only.',timeout: 10000,maxOutputTokens: 100});
    result.checks.gemini = {success: true, model: direct.data.modelVersion};
  } catch (error) { result.checks.gemini = {success: false, status: error.response?.status, reason: 'Live provider rejected the request'}; }
  const forced = createAIProvider({gemini: async () => {throw {response: {status: 429}};}, groq: groqContent});
  const fallback = await forced({prompt: 'Explain in one sentence what average speed measures. Do not include numbers.', maxOutputTokens: 700, timeout: 25000});
  assert.equal(fallback.provider, 'groq');
  result.checks.forcedGeminiQuota = {success: true, provider: fallback.provider, responseId: fallback.data.responseId};
  }
  if (!section || section === 'quiz') {
  const questions = await generator.generate('Generate a quiz on Speed, Distance, and Time with clear multiple-choice questions covering basic formulas, calculations, units, and real-life problems.', 3, 'MEDIUM');
  assert.equal(questions.length, 3);
  generator.assertVerifiedQuestions(questions);
  assert.ok(questions.every(q => q.options.length === 4));
  result.checks.quizGeneration = {success: true, topic: questions.topic, count: questions.length, generationSource: questions.generationSource, questions: questions.map(q => ({question:q.question, options:q.options, correctAnswer:q.correctAnswer, explanation:q.explanation}))};
  }
  if (!section || section === 'chatbots') {
  const hint = await quiz.callQuizAssist({questionText: 'A bus covers 150 km in 3 hours. What is its average speed?', questionType: 'MCQ', options: ['30 km/h','50 km/h','60 km/h','90 km/h'], answerStrings: ['50 km/h'], question: 'How should I start reasoning about this?'});
  assert.equal(hint.tier, 'groq');
  assert.ok(!hint.text.includes('50 km/h'));
  result.checks.quizChatbot = {success: true, provider: hint.tier, text: hint.text};
  const guidance = await coding.callAssist({title: 'Palindrome check', problemStatement: 'Read a string and determine whether it reads the same forward and backward.', language:'python', code:'text = input()', question:'Give me a hint, not the code.', errorContext:'', referenceSolutions: ['text = input()\nprint(text == text[::-1])']});
  assert.equal(guidance.tier, 'groq');
  assert.ok(!/print\(|def |```/.test(guidance.text));
  result.checks.codingChatbot = {success: true, provider: guidance.tier, text: guidance.text};
  }
  fs.writeFileSync(path.resolve(__dirname, `../../docs/groq-live-${section || 'verification'}.json`), JSON.stringify(result, null, 2));
  console.log(`PASS: live ${section || 'provider, quiz and chatbot'} checks. No quiz was saved to the LMS.`);
})().catch(error => {
  console.error(JSON.stringify({code: error.code, status: error.status, message: error.code ? error.message : 'Verification assertion failed', failures:error.failures}));
  process.exitCode = 1;
});
