'use strict';

/**
 * Answer pre-fill regression tests (Issue 3).
 *
 * The integrity bug being locked out: a participant opens a fresh attempt and
 * the editor already contains the answer. These tests assert the two guarantees
 * that make that impossible at serve time, for both assessment types:
 *
 *   Coding — a fresh attempt's initial editor content is the starter template
 *            from the problem definition, never the reference solution, even
 *            when the stored starter column has been polluted with it.
 *   Quiz   — a fresh attempt returns no selected option and no answer text, and
 *            the served question carries no answer-key field.
 *
 * They also pin the deliberate asymmetry between the two surfaces: the problem
 * definition's starter template is rewritten when it matches the answer key
 * (nobody's work), while a participant's own saved code is reported and served
 * untouched (their work — a correct solution legitimately converges on the
 * reference text).
 */

const integrity = require('../src/services/starterCodeIntegrity');
const {
  getDefaultStarterCode,
  getDefaultReferenceSolution,
} = require('../src/utils/languageTemplates');

const PROBLEM_CTX = { title: 'Even Or Odd', description: 'Print Even or Odd.', sampleOutput: 'Even' };

const JS_REFERENCE = `function evenOrOdd(n) {
  if (n % 2 === 0) {
    return 'Even';
  }
  return 'Odd';
}`;

const JS_STARTER = getDefaultStarterCode('javascript', PROBLEM_CTX);

/** A problem whose starter column has been polluted with the answer. */
const pollutedProblem = () => ({
  id: 42,
  title: PROBLEM_CTX.title,
  description: PROBLEM_CTX.description,
  sampleOutput: PROBLEM_CTX.sampleOutput,
  programmingLanguage: 'javascript',
  starterCode: JS_REFERENCE,
  expectedSolution: JS_REFERENCE,
});

/** The same problem, correctly authored. */
const cleanProblem = () => ({
  ...pollutedProblem(),
  starterCode: JS_STARTER,
});

const rows = (problem, starter) => [{
  language: 'javascript',
  starterCode: starter,
  referenceSolution: problem.expectedSolution,
  starterCodeSource: 'ai',
  referenceSolutionSource: 'ai',
  generationStatus: 'completed',
}];

// ── Coding: fresh attempt initial content ────────────────────────────────────

describe('coding attempt initialisation', () => {
  test('a clean problem is served with the starter template unchanged', () => {
    const problem = cleanProblem();
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: rows(problem, JS_STARTER),
    });

    expect(served.leaks).toEqual([]);
    expect(served.starterCode).toBe(JS_STARTER);
    expect(served.languages[0].starterCode).toBe(JS_STARTER);
  });

  test('the served starter is never the reference solution, even when stored as one', () => {
    const problem = pollutedProblem();
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: rows(problem, JS_REFERENCE),
    });

    // The requirement: initial code equals the starter template, not the answer.
    expect(served.starterCode).toBe(JS_STARTER);
    expect(served.languages[0].starterCode).toBe(JS_STARTER);
    expect(served.starterCode).not.toContain('return');
    expect(served.languages[0].starterCode).not.toContain("'Even'");
  });

  test('the replacement is alerted on, per surface, with a reason', () => {
    const problem = pollutedProblem();
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: rows(problem, JS_REFERENCE),
    });

    expect(served.leaks).toHaveLength(2);
    expect(served.leaks.map(l => l.where).sort()).toEqual([
      'languages[javascript].starterCode',
      'problem.starterCode',
    ]);
    served.leaks.forEach((leak) => {
      expect(leak.reason).toBe('starter_equals_reference');
      expect(leak.problemId).toBe(42);
    });
  });

  test('trainer-only fields never reach the participant payload', () => {
    const problem = cleanProblem();
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: rows(problem, JS_STARTER),
    });

    integrity.TRAINER_ONLY_LANGUAGE_KEYS.forEach((key) => {
      expect(served.languages[0]).not.toHaveProperty(key);
    });
    expect(Object.keys(served.languages[0]).sort()).toEqual(['language', 'starterCode']);
  });

  test('renaming every identifier does not sneak a solution into the starter', () => {
    const renamed = JS_REFERENCE.replace(/\bevenOrOdd\b/g, 'compute').replace(/\bn\b/g, 'value');
    const problem = { ...pollutedProblem(), starterCode: renamed };
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: rows(problem, renamed),
    });

    expect(served.starterCode).toBe(JS_STARTER);
    expect(served.leaks.every(l => l.reason === 'starter_structurally_matches_reference')).toBe(true);
  });

  test('a starter that wraps the solution in extra scaffolding is still caught', () => {
    const wrapped = `// TODO: complete this\n${JS_REFERENCE}\nmodule.exports = evenOrOdd;\n`;
    const problem = { ...pollutedProblem(), starterCode: wrapped };
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: rows(problem, wrapped),
    });

    expect(served.starterCode).toBe(JS_STARTER);
    expect(served.leaks[0].reason).toBe('starter_contains_reference');
  });

  test('block mode refuses to serve instead of substituting', () => {
    const original = integrity.INTEGRITY_CONFIG.onLeak;
    integrity.INTEGRITY_CONFIG.onLeak = 'block';
    try {
      const problem = pollutedProblem();
      expect(() => integrity.sanitiseServedProblem({
        problem,
        languages: rows(problem, JS_REFERENCE),
      })).toThrow(integrity.StarterCodeIntegrityError);
    } finally {
      integrity.INTEGRITY_CONFIG.onLeak = original;
    }
  });
});

// ── Coding: un-filled generator placeholders are not false positives ─────────

describe('placeholder reference solutions', () => {
  const LANGUAGES = ['javascript', 'python', 'java', 'cpp', 'c', 'csharp', 'go', 'ruby', 'rust'];

  test.each(LANGUAGES)('%s: a not-yet-written reference never flags its own starter', (lang) => {
    const problem = {
      id: 1,
      ...PROBLEM_CTX,
      programmingLanguage: lang,
      starterCode: getDefaultStarterCode(lang, PROBLEM_CTX),
      expectedSolution: getDefaultReferenceSolution(lang, PROBLEM_CTX),
    };
    const served = integrity.sanitiseServedProblem({
      problem,
      languages: [{
        language: lang,
        starterCode: problem.starterCode,
        referenceSolution: problem.expectedSolution,
      }],
    });

    expect(integrity.collectReferenceSolutions(problem)).toEqual([]);
    expect(served.leaks).toEqual([]);
    expect(served.starterCode).toBe(problem.starterCode);
  });
});

// ── Coding: the participant's own work is reported, never rewritten ──────────

describe('saved submission code', () => {
  test('a submission matching the reference is flagged but not altered', () => {
    const problem = cleanProblem();
    const audit = integrity.auditSavedCode({ problem, code: JS_REFERENCE });

    expect(audit.suspicious).toBe(true);
    expect(audit.reason).toBe('submission_equals_reference');
    // auditSavedCode returns a verdict only — it has no way to mutate the code.
    expect(Object.keys(audit).sort()).toEqual(['reason', 'similarity', 'structural', 'suspicious']);
  });

  test('ordinary in-progress work is not flagged', () => {
    const problem = cleanProblem();
    const audit = integrity.auditSavedCode({
      problem,
      code: 'function evenOrOdd(n) {\n  console.log(n);\n}',
    });

    expect(audit.suspicious).toBe(false);
    expect(audit.reason).toBeNull();
  });

  test('the answer key is never returned to the caller', () => {
    const problem = cleanProblem();
    const audit = integrity.auditSavedCode({ problem, code: JS_REFERENCE });
    expect(JSON.stringify(audit)).not.toContain('Even');
  });
});

// ── Quiz: fresh attempt initial answers and served questions ─────────────────

describe('quiz attempt initialisation', () => {
  const LIVE_QUESTION = {
    id: 11,
    questionText: 'Is 4 even or odd?',
    questionType: 'MCQ',
    options: ['Even', 'Odd'],
    order: 0,
    marks: 1,
  };

  test('a fresh attempt returns nothing selected and nothing typed', () => {
    expect(integrity.checkInitialAnswers([])).toEqual({ leak: false, offenders: [] });
    expect(integrity.checkInitialAnswers([
      { questionId: 11, selectedOption: null, answerText: '' },
    ])).toEqual({ leak: false, offenders: [] });
  });

  test('a pre-filled answer on a fresh attempt is detected', () => {
    const res = integrity.checkInitialAnswers([
      { questionId: 11, selectedOption: 'Even', answerText: '' },
      { questionId: 12, selectedOption: null, answerText: 'Even' },
    ]);

    expect(res.leak).toBe(true);
    expect(res.offenders).toEqual([
      { questionId: 11, field: 'selectedOption' },
      { questionId: 12, field: 'answerText' },
    ]);
  });

  test('a live question payload carries no answer-key field', () => {
    expect(integrity.checkServedQuestion(LIVE_QUESTION)).toEqual({ leak: false, keys: [] });
    expect(integrity.assertQuizPayloadClean({ questions: [LIVE_QUESTION] }).leaks).toEqual([]);
  });

  test('an answer key leaking into a live question is detected', () => {
    const leaky = { ...LIVE_QUESTION, correctAnswer: 'Even', explanation: '4 / 2 has no remainder.' };
    const res = integrity.checkServedQuestion(leaky);

    expect(res.leak).toBe(true);
    expect(res.keys.sort()).toEqual(['correctAnswer', 'explanation']);
    expect(integrity.assertQuizPayloadClean({ questions: [leaky] }).leaks).toEqual([
      { questionId: 11, keys: ['correctAnswer', 'explanation'] },
    ]);
  });

  test('matching-question pairs are not treated as an answer key', () => {
    // `pairs` is required to render a matching question, so it must not trip the
    // assertion — otherwise every legitimate matching question would alert.
    const matching = {
      ...LIVE_QUESTION,
      questionType: 'MATCHING',
      pairs: [{ left: 'even', right: 'divisible by 2' }],
    };
    expect(integrity.checkServedQuestion(matching).leak).toBe(false);
  });
});
