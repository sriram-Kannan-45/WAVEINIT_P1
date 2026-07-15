const { JudgeEngine } = require('../judge/engine');
const { OutputComparator } = require('../judge/outputComparator');
const { VERDICTS } = require('../judge/verdicts');
const { getLanguageConfig } = require('../judge/languageConfig');
const logger = require('../utils/logger');

const judgeEngine = new JudgeEngine();
const comparator = new OutputComparator();

async function executeCode(code, language, input, timeLimit = 5, memoryLimit = 256) {
  const result = await judgeEngine.runSingleTest({
    code, language, stdin: input || '',
    expectedOutput: null,
    timeLimit, memoryLimit,
  });

  return {
    output: result.actualOutput || '',
    error: result.error || '',
    status: result.verdict === VERDICTS.ACCEPTED ? 'ACCEPTED' : result.verdict,
    executionTime: result.executionTime || 0,
    memoryUsed: result.memoryUsed || 0,
    compileOutput: result.compileOutput || '',
  };
}

async function runTests(code, language, testCases, timeLimit, memoryLimit) {
  const results = [];
  for (const tc of testCases) {
    const startTime = Date.now();
    const result = await judgeEngine.runSingleTest({
      code, language, input: tc.input,
      expectedOutput: tc.expectedOutput,
      timeLimit: tc.timeout || timeLimit,
      memoryLimit: tc.memoryLimit || memoryLimit,
    });

    const actualOutput = tc.isHidden ? (result.verdict === VERDICTS.ACCEPTED ? '[Passed]' : '[Failed]') : (result.actualOutput || '');
    const expectedOutput = tc.isHidden ? '[Hidden]' : (tc.expectedOutput || '');

    results.push({
      testCaseId: tc.id || null,
      input: tc.isHidden ? '[Hidden]' : tc.input,
      expectedOutput,
      actualOutput,
      passed: result.verdict === VERDICTS.ACCEPTED,
      status: result.verdict,
      executionTime: result.executionTime || 0,
      memoryUsed: result.memoryUsed || 0,
      isHidden: tc.isHidden,
      error: result.error || '',
      compileOutput: result.compileOutput || '',
    });
  }
  return results;
}

async function runTestCase(code, language, testCase, timeLimit, memoryLimit) {
  const results = await runTests(code, language, [testCase], timeLimit, memoryLimit);
  return results[0];
}

function normalizeOutput(output) {
  return comparator.normalize(output || '');
}

module.exports = { executeCode, runTests, runTestCase, normalizeOutput, judgeEngine, LANGUAGE_IDS: {}, LANGUAGE_EXT: {}, checkJudge0: async () => true };
