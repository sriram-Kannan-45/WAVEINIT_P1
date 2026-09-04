'use strict';
const { normalizeGeneratedQuestionDifficulty, normalizeQuizDifficulty } = require('../utils/quizDifficulty');

function invalid(message) {
  return Object.assign(new Error(message), { status: 502, code: 'INVALID_GENERATED_QUIZ' });
}
function extractQuizIntent(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) {
    throw Object.assign(new Error('Enter a topic or generation instructions (up to 12000 characters).'), { status: 422 });
  }
  const instructions = prompt.trim();
  // Input validation only. Subject extraction belongs to the live AI analysis step.
  return { instructions };
}
const fingerprint = text => String(text).toLowerCase().replace(/\(?(?:part|question)\s*\d+\)?/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const optionKey = text => String(text).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

function validateMcqs(raw, { count, difficulty = 'MEDIUM', existing = [] } = {}) {
  difficulty = normalizeQuizDifficulty(difficulty);
  if (!Array.isArray(raw) || !raw.length || (count != null && raw.length !== count)) throw invalid(`Expected exactly ${count || 'one or more'} questions.`);
  const seen = new Set(existing.map(q => fingerprint(q.questionText ?? q.question)));
  return raw.map((q, index) => {
    if (!q || typeof q !== 'object') throw invalid(`Question ${index + 1} is not an object.`);
    const questionText = q.questionText ?? q.question;
    const options = q.options ?? [q.optionA, q.optionB, q.optionC, q.optionD];
    if (typeof questionText !== 'string' || questionText.trim().length < 10 || /\bpart\s+\d+\b/i.test(questionText)) throw invalid(`Question ${index + 1} has an invalid or repeated stem.`);
    const key = fingerprint(questionText);
    if (seen.has(key)) throw invalid('Repeated questions are not allowed.');
    // Catch near-duplicate stems, including a changed prefix or a minor rewording.
    const words = new Set(key.split(' '));
    for (const other of seen) {
      const prior = new Set(other.split(' '));
      const shared = [...words].filter(word => prior.has(word)).length;
      if (shared / new Set([...words, ...prior]).size > 0.88) throw invalid('Near-duplicate questions are not allowed.');
    }
    seen.add(key);
    if (!Array.isArray(options) || options.length !== 4 || options.some(o => typeof o !== 'string' || !o.trim() || /^(?:option|choice)\s*[a-d1-4]$/i.test(o.trim()))) throw invalid(`Question ${index + 1} must have four meaningful text options.`);
    const cleanOptions = options.map(o => o.trim());
    if (new Set(cleanOptions.map(optionKey)).size !== 4) throw invalid(`Question ${index + 1} has duplicate options.`);
    const supplied = q.correctAnswer ?? q.correct_answer;
    let answerIndex = /^[0-3]$/.test(String(supplied)) ? Number(supplied) : cleanOptions.findIndex(o => optionKey(o) === optionKey(supplied ?? ''));
    if (answerIndex < 0 && /^[A-D]$/i.test(String(supplied))) answerIndex = String(supplied).toUpperCase().charCodeAt(0) - 65;
    if (q.correctOption != null) {
      const agrees = supplied == null || String(supplied) === String(q.correctOption) || optionKey(supplied) === optionKey(cleanOptions[q.correctOption]);
      if (!Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption > 3 || !agrees) throw invalid(`Question ${index + 1} has conflicting answer keys.`);
      answerIndex = q.correctOption;
    }
    if (answerIndex < 0) throw invalid(`Question ${index + 1} has no valid answer key.`);
    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 10) throw invalid(`Question ${index + 1} needs an explanation supporting its answer.`);
    const level = normalizeGeneratedQuestionDifficulty(q.difficulty, difficulty);
    if (difficulty !== 'MIXED' && level !== difficulty.toUpperCase()) throw invalid('Question difficulty does not match the requested level.');
    const marks = q.marks ?? 1;
    if (!Number.isInteger(marks) || marks < 1 || marks > 1000) throw invalid('Question marks must be an integer between 1 and 1000.');
    return { question: questionText.trim(), questionText: questionText.trim(), questionType: 'MCQ', options: cleanOptions,
      correctAnswer: String(answerIndex), correctOption: answerIndex, explanation: q.explanation.trim(),
      difficulty: level, marks, topic: q.topic || null, bloomsLevel: q.bloomsLevel || null, order: index };
  });
}
function validateQuestions(raw, { difficulty = 'MIXED', existing = [], count } = {}) {
  difficulty = normalizeQuizDifficulty(difficulty);
  if (!Array.isArray(raw) || !raw.length || (count != null && raw.length !== count)) throw invalid('Incorrect question count.');
  const accepted = [...existing];
  return raw.map(q => {
    const type = q?.questionType || 'MCQ';
    if (type === 'MCQ') {
      const value = validateMcqs([q], {difficulty, existing: accepted})[0];
      accepted.push(value);
      return value;
    }
    if (!['TRUE_FALSE', 'FILL_BLANK'].includes(type)) throw invalid('Unsupported generated question type.');
    const stem = q.questionText ?? q.question;
    if (typeof stem !== 'string' || stem.trim().length < 10 || /\bpart\s+\d+\b/i.test(stem)) throw invalid('Invalid question stem.');
    if (accepted.some(other => fingerprint(other.questionText ?? other.question) === fingerprint(stem))) throw invalid('Repeated question.');
    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 10) throw invalid('Missing answer explanation.');
    const level = normalizeGeneratedQuestionDifficulty(q.difficulty, difficulty);
    if (difficulty !== 'MIXED' && level !== difficulty.toUpperCase()) throw invalid('Question difficulty does not match.');
    let answer = q.correctAnswer;
    let options = [];
    if (type === 'TRUE_FALSE') {
      const key = String(answer).toLowerCase();
      if (!['true', 'false', '0', '1'].includes(key)) throw invalid('Invalid True/False answer.');
      answer = ['true', '0'].includes(key) ? '0' : '1';
      options = ['True', 'False'];
    } else if (typeof answer !== 'string' || !answer.trim() || (stem.match(/____/g) || []).length !== 1) {
      throw invalid('Fill-in-the-blank requires one blank and an answer.');
    }
    const marks = q.marks ?? 1;
    if (!Number.isInteger(marks) || marks < 1 || marks > 1000) throw invalid('Invalid question marks.');
    const value = {...q, question: stem.trim(), questionText: stem.trim(), questionType: type, options, correctAnswer: answer, difficulty: level, marks};
    accepted.push(value);
    return value;
  });
}
module.exports = { extractQuizIntent, validateMcqs, validateQuestions, invalid, fingerprint };
