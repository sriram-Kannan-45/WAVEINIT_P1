'use strict';

/**
 * Answer-leak guardrail regression tests (Issue 1).
 *
 * Locks in two things that pull in opposite directions:
 *   1. The mentor's approved maximum depth must survive the guard untouched —
 *      naming an operator, showing an isolated expression, and saying what its
 *      results mean is allowed coaching, not a leak.
 *   2. Anything assembled into a working answer must be blocked, along with any
 *      reply that restates the stored reference solution.
 *
 * Also asserts that the offline fallback generators — which are what a
 * participant sees when both model tiers are unavailable — are clean by
 * construction. If they ever trip the guard, every offline exchange would be
 * flagged and replaced with the static hold-back message.
 */

const guard = require('../src/services/aiAnswerGuard');
const coding = require('../src/services/codingAiAssistantService');
const quiz = require('../src/services/quizAiAssistantService');

const REFERENCE_SOLUTION = `
function checkEvenOdd(n) {
  if (n % 2 === 0) {
    return 'Even';
  } else {
    return 'Odd';
  }
}
`;

// The exact reply the approved UI spec shows as the deepest allowed answer.
const APPROVED_MAX_DEPTH = [
  'You can use the modulo operator (%) in JavaScript.',
  '',
  'Example: n % 2',
  '',
  'If the result is 0 -> Even',
  '',
  'If the result is 1 -> Odd',
  '',
  'Try using that in your code!',
].join('\n');

describe('aiAnswerGuard — coding replies', () => {
  test('approved max-depth mentor reply passes through unchanged', () => {
    const v = guard.checkCodingResponse({
      text: APPROVED_MAX_DEPTH,
      referenceSolutions: [REFERENCE_SOLUTION],
    });
    expect(v.possibleLeak).toBe(false);
    expect(v.blocked).toBe(false);
    expect(v.text).toBe(APPROVED_MAX_DEPTH);
  });

  test('conceptual coaching with no code at all passes', () => {
    const v = guard.checkCodingResponse({
      text: 'Think about the property of even and odd numbers.\n\nIf a number is divisible by 2 with no remainder, it is even.',
      referenceSolutions: [REFERENCE_SOLUTION],
    });
    expect(v.possibleLeak).toBe(false);
    expect(v.text).toContain('divisible by 2');
  });

  test('assembled if/else solution is blocked and reported', () => {
    const v = guard.checkCodingResponse({
      text: "Here you go:\n\nif (n % 2 === 0) {\n  return 'Even';\n} else {\n  return 'Odd';\n}",
      referenceSolutions: [REFERENCE_SOLUTION],
    });
    expect(v.blocked).toBe(true);
    expect(v.possibleLeak).toBe(true);
    expect(v.text).toBe('');
    expect(v.reasons.join(',')).toMatch(/reference_similarity/);
  });

  test('a renamed-variable copy of the reference solution is caught structurally', () => {
    const renamed = `
function isItEven(value) {
  if (value % 2 === 0) {
    return 'Even';
  } else {
    return 'Odd';
  }
}
`;
    const v = guard.checkCodingResponse({
      text: renamed,
      referenceSolutions: [REFERENCE_SOLUTION],
    });
    expect(v.blocked).toBe(true);
    // Renaming every identifier drops the plain score below its threshold —
    // this is exactly the gap the identifier-blind pass exists to close.
    expect(v.similarity).toBeLessThan(guard.GUARD_CONFIG.similarityThreshold);
    expect(v.structuralSimilarity)
      .toBeGreaterThanOrEqual(guard.GUARD_CONFIG.structuralSimilarityThreshold);
    expect(v.reasons.join(',')).toMatch(/reference_structure/);
  });

  test('an unrelated assembled solution is still blocked without a false reference match', () => {
    const unrelated = `
function reverseString(s) {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) {
    out += s[i];
  }
  return out;
}
`;
    const v = guard.checkCodingResponse({
      text: unrelated,
      referenceSolutions: [REFERENCE_SOLUTION],
    });
    expect(v.blocked).toBe(true);
    expect(v.possibleLeak).toBe(true);
    expect(v.structuralSimilarity)
      .toBeLessThan(guard.GUARD_CONFIG.structuralSimilarityThreshold);
    expect(v.text).toBe('');
  });

  test('prose is never scored against a solution structurally', () => {
    const v = guard.checkCodingResponse({
      text: 'Think about the property of even and odd numbers.\n\nWhat do you get when you divide 7 by 2?',
      referenceSolutions: [REFERENCE_SOLUTION],
    });
    expect(v.structuralSimilarity).toBe(0);
    expect(v.possibleLeak).toBe(false);
  });

  test('a fenced code block is blocked even with no reference solution loaded', () => {
    const v = guard.checkCodingResponse({
      text: 'Try this:\n\n```js\nconsole.log(n % 2 === 0 ? "Even" : "Odd");\n```\n\nGood luck!',
      referenceSolutions: [],
    });
    expect(v.blocked).toBe(true);
    expect(v.reasons).toContain('fenced_code');
    expect(v.text).toBe('');
  });
});

describe('aiAnswerGuard — quiz replies', () => {
  const OPTIONS = ['Even', 'Odd', 'Prime', 'Composite'];
  const ANSWERS = ['Even'];

  test('conceptual guidance mentioning option words in prose is allowed', () => {
    const v = guard.checkQuizResponse({
      text: 'Think about the property of even and odd numbers.\n\nWhat happens when you divide by 2?',
      options: OPTIONS,
      answerStrings: [],
    });
    expect(v.possibleLeak).toBe(false);
    expect(v.text).toContain('property of even and odd');
  });

  test('stating the correct answer is blocked', () => {
    const v = guard.checkQuizResponse({
      text: 'The correct answer is Even.',
      options: OPTIONS,
      answerStrings: ANSWERS,
    });
    expect(v.blocked).toBe(true);
    expect(v.reasons).toContain('correct_answer_verbatim');
    expect(v.text).toBe('');
  });

  test('pointing at an option letter is blocked', () => {
    const v = guard.checkQuizResponse({
      text: 'You should choose option B.',
      options: OPTIONS,
      answerStrings: ANSWERS,
    });
    expect(v.blocked).toBe(true);
    expect(v.reasons).toContain('option_letter_asserted');
  });

  test('quoting a long option verbatim is blocked', () => {
    const longOptions = ['A number divisible by two with no remainder', 'Something else entirely'];
    const v = guard.checkQuizResponse({
      text: 'Consider: A number divisible by two with no remainder.',
      options: longOptions,
      answerStrings: [],
    });
    expect(v.blocked).toBe(true);
    expect(v.reasons).toContain('long_option_verbatim');
  });
});

describe('offline fallback generators are clean by construction', () => {
  const CODING_CASES = [
    { level: 1, action: 'hint', question: 'I am stuck' },
    { level: 2, action: 'approach', question: 'How do I approach this?' },
    { level: 3, action: 'code_guidance', question: 'What structure should I use?' },
    { level: 1, action: 'hint', question: 'just give me the code' },
    { level: 1, action: 'explain_error', question: 'why is this wrong', errorContext: 'expected Even got Odd' },
    { level: 1, action: 'explain_problem', question: 'explain the input and output' },
    { level: 1, action: 'hint', question: 'enaku purila' },
  ];

  test.each(CODING_CASES)('coding fallback (level $level / $action) does not trip the guard', (args) => {
    const text = coding.generateLocalSocraticGuidance({
      title: 'Even or Odd',
      problemStatement: 'Print Even or Odd for the given number.',
      language: 'javascript',
      code: '',
      question: args.question,
      level: args.level,
      action: args.action,
      errorContext: args.errorContext || '',
    });
    const v = guard.checkCodingResponse({ text, referenceSolutions: [REFERENCE_SOLUTION] });
    expect(v.possibleLeak).toBe(false);
    expect(v.text.length).toBeGreaterThan(40);
  });

  const QUIZ_QUESTIONS = ['I am stuck', 'tell me the answer', 'enaku purila', 'explain this question'];

  test.each(QUIZ_QUESTIONS)('quiz fallback for "%s" does not trip the guard', (question) => {
    const text = quiz.generateLocalQuizGuidance({
      questionText: 'Which describes a number divisible by 2?',
      questionType: 'MCQ',
      question,
    });
    const v = guard.checkQuizResponse({
      text,
      options: ['Even', 'Odd', 'Prime', 'Composite'],
      answerStrings: ['Even'],
    });
    expect(v.possibleLeak).toBe(false);
    expect(v.text.length).toBeGreaterThan(40);
  });
});

describe('prompt builders never receive the answer key', () => {
  test('coding prompt contains no expected outputs and states it has none', () => {
    const prompt = coding.buildSystemPrompt({
      title: 'Even or Odd',
      problemStatement: 'Print Even or Odd for the given number.',
      language: 'javascript',
      code: '',
      question: 'help',
      level: 1,
      sampleInputs: 'Sample 1 Input: 4',
    });
    expect(prompt).toContain('Sample 1 Input: 4');
    expect(prompt).not.toMatch(/Expected:/);
    expect(prompt).toContain('You have not been given the expected outputs');
  });

  test('quiz prompt lists options without marking one and states it has no key', () => {
    const prompt = quiz.buildQuizSystemPrompt({
      questionText: 'Which describes a number divisible by 2?',
      questionType: 'MCQ',
      options: ['Even', 'Odd'],
      selectedAnswer: 'SECRET_SELECTED_OPTION',
      question: 'help',
      history: '',
    });
    expect(prompt).toContain('A. Even');
    expect(prompt).toContain('B. Odd');
    expect(prompt).not.toContain('SECRET_SELECTED_OPTION');
    expect(prompt).not.toContain('currently selected answer');
    expect(prompt).toContain('You have not been given the correct answer');
  });
});
