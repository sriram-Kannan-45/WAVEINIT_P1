// Canonical PostgreSQL/ORM/API values. Display labels must not be persisted.
const QUESTION_DIFFICULTIES = Object.freeze(['EASY', 'MEDIUM', 'HARD']);
const QUIZ_DIFFICULTIES = Object.freeze([...QUESTION_DIFFICULTIES, 'MIXED']);

function normalize(value, values, fallback, status = 422) {
  const canonical = value == null || value === '' ? fallback
    : typeof value === 'string' ? value.trim().toUpperCase() : null;
  if (!values.includes(canonical)) {
    const error = new Error(`Difficulty must be one of: ${values.join(', ')}.`);
    error.status = status;
    error.code = 'INVALID_QUIZ_DIFFICULTY';
    throw error;
  }
  return canonical;
}

const normalizeQuizDifficulty = value => normalize(value, QUIZ_DIFFICULTIES, 'MIXED');
const normalizeQuestionDifficulty = value => normalize(value, QUESTION_DIFFICULTIES, 'MEDIUM');

function normalizeGeneratedQuestionDifficulty(value, requestedDifficulty = 'MIXED') {
  const requested = normalizeQuizDifficulty(requestedDifficulty);
  const fallback = requested === 'MIXED' ? 'MEDIUM' : requested;
  // MIXED describes a quiz distribution, never a single question's enum value.
  if (typeof value === 'string' && value.trim().toUpperCase() === 'MIXED') return fallback;
  return normalize(value, QUESTION_DIFFICULTIES, fallback, 502);
}

module.exports = { QUESTION_DIFFICULTIES, QUIZ_DIFFICULTIES,
  normalizeQuizDifficulty, normalizeQuestionDifficulty, normalizeGeneratedQuestionDifficulty };
