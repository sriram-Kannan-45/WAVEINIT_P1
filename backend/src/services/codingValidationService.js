const logger = require('../utils/logger');
const { runTests } = require('./codeExecutionService');

// Edge-case inputs added during validation to stress the reference solution.
// These are NOT persisted as student test cases; they exist only to prove the
// reference solution + trainer outputs are consistent.
function buildEdgeCases(language) {
  const isJs = /js|javascript|typescript|ts|node/i.test(language || '');
  const edge = [];
  edge.push({ input: '', expectedOutput: '', isHidden: true, description: 'Validation: empty input' });
  if (isJs) {
    edge.push({ input: 'null', expectedOutput: '', isHidden: true, description: 'Validation: null input' });
  }
  return edge;
}

/**
 * Extract per-language reference solutions from a problem.
 * - New multi-language problems carry problem.languages[] (each with referenceSolution).
 * - Legacy problems carry a single programmingLanguage + expectedSolution.
 */
function getRefSolutions(problem) {
  const languages = Array.isArray(problem.languages) && problem.languages.length > 0 ? problem.languages : null;

  if (languages) {
    return languages.map(l => ({
      language: String(l.language || '').trim().toLowerCase(),
      referenceSolution: l.referenceSolution != null ? String(l.referenceSolution) : '',
    }));
  }

  // Legacy single-language fallback.
  return [{
    language: problem.programmingLanguage || 'javascript',
    referenceSolution: problem.expectedSolution != null ? String(problem.expectedSolution) : '',
  }];
}

/**
 * Validate a coding problem by executing each configured language's reference
 * solution against all persisted test cases (visible + hidden) plus synthetic
 * edge cases. Every language must pass before the problem is considered valid.
 *
 * Returns a structured report:
 *  - passed / total                — how many tests the reference solutions satisfy
 *  - issues[]                      — human readable problems detected
 *  - languages                     — per-language pass/fail detail
 *  - recommendedStatus             — VALIDATED | VALIDATION_FAILED | NEEDS_TRAINER_REVIEW
 */
async function validateProblem(problem) {
  const { CodingTestCase } = require('../models');

  const refs = getRefSolutions(problem);

  // Every configured language must provide a reference solution.
  const missingRef = refs.filter(r => !r.referenceSolution || String(r.referenceSolution).trim() === '');
  if (missingRef.length > 0) {
    return {
      passed: 0, total: 0,
      issues: missingRef.map(r => `Language "${r.language}" has no reference solution, so it cannot be auto-validated.`),
      languages: missingRef.map(r => ({ language: r.language, passed: false, error: 'No reference solution' })),
      recommendedStatus: 'NEEDS_TRAINER_REVIEW',
    };
  }

  const testCases = await CodingTestCase.findAll({ where: { problemId: problem.id }, order: [['order', 'ASC']] });

  if (!testCases || testCases.length === 0) {
    return {
      passed: 0, total: 0,
      issues: ['The problem has no test cases. Add at least a sample and hidden cases before publishing.'],
      languages: refs.map(r => ({ language: r.language, passed: false, error: 'No test cases' })),
      recommendedStatus: 'VALIDATION_FAILED',
    };
  }

  const hasHidden = testCases.some(tc => tc.isHidden);
  const hasVisible = testCases.some(tc => !tc.isHidden);
  const issues = [];

  const casesToRun = testCases.map(tc => ({
    testCaseId: tc.id,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    isHidden: tc.isHidden,
    timeout: tc.timeout || problem.timeLimit || 5,
    memoryLimit: tc.memoryLimit || problem.memoryLimit || 256,
  }));

  const perLanguage = [];

  for (const ref of refs) {
    const language = ref.language;

    let results = [];
    try {
      results = await runTests(
        ref.referenceSolution,
        language,
        casesToRun,
        problem.timeLimit || 5,
        problem.memoryLimit || 256,
      );
    } catch (err) {
      logger.error('[CodingValidation] Judge engine failed for problem', { problemId: problem.id, language, error: err.message });
      issues.push(`Language "${language}" reference solution could not be executed: ${err.message}`);
      perLanguage.push({ language, passed: false, error: err.message });
      continue;
    }

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const allPass = total > 0 && passed === total;

    if (!allPass) {
      const failedIdx = results.findIndex(r => !r.passed);
      const tc = testCases[failedIdx];
      const r = results[failedIdx];
      issues.push(
        `Language "${language}": test "${tc?.description || (`#${(failedIdx || 0) + 1}`)}" failed with the reference solution ` +
        `(expected ${JSON.stringify(tc?.expectedOutput).slice(0, 80)}, got ${JSON.stringify(r?.actualOutput).slice(0, 80)}).`
      );
    }

    perLanguage.push({ language, passed: allPass, total });
  }

  if (!hasVisible) issues.push('No visible (sample) test cases. Students will have no examples to verify with Run Code.');
  if (!hasHidden) issues.push('No hidden test cases. The assessment will be trivially verifiable and easier to game.');

  const allLanguagesPass = perLanguage.every(l => l.passed);

  let recommendedStatus;
  if (!allLanguagesPass) {
    recommendedStatus = 'VALIDATION_FAILED';
  } else if (issues.length === 0) {
    recommendedStatus = 'VALIDATED';
  } else {
    recommendedStatus = 'NEEDS_TRAINER_REVIEW';
  }

  return {
    passed: perLanguage.filter(l => l.passed).length,
    total: perLanguage.length,
    issues,
    languages: perLanguage,
    recommendedStatus,
  };
}

module.exports = { validateProblem };
