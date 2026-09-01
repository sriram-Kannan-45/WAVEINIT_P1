/**
 * Coding Problem Validator & Quality Assurance
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates AI-generated coding problems for:
 * 1. Structural integrity & complete multi-language configurations.
 * 2. Semantic consistency with the user's analyzed intent.
 * 3. Test case relevance & consistency.
 * 4. Actual runtime execution of reference solutions against test cases.
 */

const logger = require('../utils/logger');
const { runTests } = require('./codeExecutionService');
const { CATEGORIES } = require('./codingIntentAnalyzer');

/**
 * 1. Structural Validation
 */
function validateStructure(problem, requestedLanguages = ['javascript']) {
  const issues = [];
  if (!problem || typeof problem !== 'object') {
    return { isValid: false, issues: ['Problem object is empty or invalid'] };
  }

  if (!problem.title || String(problem.title).trim().length < 2) {
    issues.push('Problem title is missing or too short.');
  }

  if (!problem.description || String(problem.description).trim().length < 10) {
    issues.push('Problem description is missing or too short.');
  }

  if (!Array.isArray(problem.testCases) || problem.testCases.length === 0) {
    issues.push('Problem has no test cases. At least one test case is required.');
  } else {
    problem.testCases.forEach((tc, idx) => {
      if (tc.expectedOutput === undefined || tc.expectedOutput === null) {
        issues.push(`Test case #${idx + 1} is missing expectedOutput.`);
      }
    });
  }

  const langSolutions = problem.languageSolutions || {};
  for (const lang of requestedLanguages) {
    const sol = langSolutions[lang];
    if (!sol) {
      issues.push(`Missing language solution configuration for "${lang}".`);
    } else {
      if (!sol.starterCode || String(sol.starterCode).trim() === '') {
        issues.push(`Missing starterCode for language "${lang}".`);
      }
      if (!sol.referenceSolution || String(sol.referenceSolution).trim() === '') {
        issues.push(`Missing referenceSolution for language "${lang}".`);
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * 2. Semantic & Intent Traceability Validation
 */
function validateSemanticConsistency(problem, intentProfile) {
  const issues = [];
  if (!intentProfile) return { isValid: true, issues: [] };

  const { primaryProgrammingTask, literalValues, forbiddenConcepts } = intentProfile;
  const combinedText = `${problem.title || ''} ${problem.description || ''} ${(problem.testCases || []).map(tc => `${tc.input} ${tc.expectedOutput}`).join(' ')}`.toLowerCase();

  // Check 1: Forbidden Concepts
  if (Array.isArray(forbiddenConcepts)) {
    for (const forbidden of forbiddenConcepts) {
      const keyword = forbidden.replace(/_/g, ' ');
      // If forbidden concept is "sorting" and prompt wasn't sorting
      if (forbidden === 'sorting' && /\b(sort|ascending|descending|quicksort|mergesort|bubblesort)\b/i.test(combinedText)) {
        issues.push(`Problem introduces forbidden concept "sorting" when user requested "${intentProfile.rawPrompt}".`);
      }
    }
  }

  // Check 2: Task Category Alignment
  if (primaryProgrammingTask === CATEGORIES.PRINT_OUTPUT) {
    // A print output problem must not demand algorithmic transformations of arrays
    if (/\b(sort the array|bubble sort|binary search tree|graph traversal)\b/i.test(combinedText)) {
      issues.push(`Generated problem contains complex algorithms when user only requested PRINT_OUTPUT for "${intentProfile.rawPrompt}".`);
    }

    // Check literal values preservation
    if (Array.isArray(literalValues) && literalValues.length > 0) {
      const target = literalValues[0].toLowerCase();
      const hasLiteral = combinedText.includes(target) ||
        (problem.testCases || []).some(tc => String(tc.expectedOutput).toLowerCase().includes(target));
      if (!hasLiteral) {
        issues.push(`Generated problem failed to preserve the explicit literal text "${literalValues[0]}".`);
      }
    }
  } else if (primaryProgrammingTask === CATEGORIES.SORTING) {
    if (!/\b(sort|ascending|descending|order)\b/i.test(combinedText)) {
      issues.push(`Problem does not mention sorting for request: "${intentProfile.rawPrompt}".`);
    }
  } else if (primaryProgrammingTask === CATEGORIES.STRING_PROCESSING) {
    if (!/\b(string|character|word|text|reverse|palindrome)\b/i.test(combinedText)) {
      issues.push(`Problem does not address string processing for request: "${intentProfile.rawPrompt}".`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * 3. Execution-backed Reference Solution Validation
 */
async function validateReferenceSolutionsExecution(problem, requestedLanguages = ['javascript']) {
  const issues = [];
  const perLanguage = {};
  const testCases = (problem.testCases || []).map((tc, idx) => ({
    testCaseId: tc.id || idx + 1,
    input: tc.input != null ? String(tc.input) : '',
    expectedOutput: tc.expectedOutput != null ? String(tc.expectedOutput) : '',
    isHidden: false, // Internal validation needs unmasked diagnostic output
    timeout: problem.timeLimit || 5,
    memoryLimit: problem.memoryLimit || 256,
  }));

  if (testCases.length === 0) {
    return { isValid: false, issues: ['No test cases available for execution testing.'], perLanguage };
  }

  const langSolutions = problem.languageSolutions || {};

  for (const lang of requestedLanguages) {
    const sol = langSolutions[lang];
    if (!sol || !sol.referenceSolution) {
      issues.push(`Language "${lang}" has no reference solution to execute.`);
      perLanguage[lang] = { passed: false, error: 'No reference solution' };
      continue;
    }

    try {
      const results = await runTests(
        sol.referenceSolution,
        lang,
        testCases,
        problem.timeLimit || 5,
        problem.memoryLimit || 256
      );

      const total = results.length;
      const passed = results.filter(r => r.passed).length;
      const allPassed = total > 0 && passed === total;

      if (!allPassed) {
        const failedIdx = results.findIndex(r => !r.passed);
        const failedResult = results[failedIdx];
        const tc = testCases[failedIdx];
        const reason = failedResult?.errorMessage ||
          `Expected "${tc?.expectedOutput}", got "${failedResult?.actualOutput}"`;
        issues.push(`Language "${lang}" reference solution failed test case #${failedIdx + 1}: ${reason}`);
      }

      perLanguage[lang] = {
        passed: allPassed,
        total,
        passedCount: passed,
        results,
      };
    } catch (err) {
      logger.error('[CodingProblemValidator] Execution error for language', { lang, error: err.message });
      issues.push(`Language "${lang}" execution crashed: ${err.message}`);
      perLanguage[lang] = { passed: false, error: err.message };
    }
  }

  const allLanguagesPassed = requestedLanguages.every(l => perLanguage[l]?.passed);

  return {
    isValid: allLanguagesPassed,
    issues,
    perLanguage,
  };
}

/**
 * 4. Comprehensive Validation Pipeline
 */
async function validateGeneratedProblem(problem, intentProfile, requestedLanguages = ['javascript'], options = { execute: true }) {
  const allIssues = [];

  // Stage 1: Structural check
  const struct = validateStructure(problem, requestedLanguages);
  if (!struct.isValid) {
    allIssues.push(...struct.issues);
  }

  // Stage 2: Semantic consistency check
  if (intentProfile) {
    const semantic = validateSemanticConsistency(problem, intentProfile);
    if (!semantic.isValid) {
      allIssues.push(...semantic.issues);
    }
  }

  // Stage 3: Execution validation (if structural checks passed and execution is enabled)
  let execution = { isValid: true, issues: [], perLanguage: {} };
  if (options.execute && struct.isValid && (problem.testCases || []).length > 0) {
    execution = await validateReferenceSolutionsExecution(problem, requestedLanguages);
    if (!execution.isValid) {
      allIssues.push(...execution.issues);
    }
  }

  return {
    isValid: allIssues.length === 0,
    issues: allIssues,
    structuralValidation: struct,
    executionValidation: execution,
  };
}

module.exports = {
  validateStructure,
  validateSemanticConsistency,
  validateReferenceSolutionsExecution,
  validateGeneratedProblem,
};
