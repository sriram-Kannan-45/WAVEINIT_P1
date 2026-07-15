const { DockerExecutor } = require('./dockerExecutor');
const { OutputComparator } = require('./outputComparator');
const { VERDICTS, aggregateVerdict } = require('./verdicts');
const { getLanguageConfig } = require('./languageConfig');
const logger = require('../utils/logger');

class JudgeEngine {
  constructor(options = {}) {
    this.executor = new DockerExecutor(options);
    this.comparator = new OutputComparator(options);
  }

  async compile({ code, language, timeLimit }) {
    const langCfg = getLanguageConfig(language);
    if (!langCfg.compile) return { success: true, output: '' };

    const result = await this.executor.execute({ code, language, stdin: '', timeLimit: 30, memoryLimit: 512 });
    if (result.status === VERDICTS.COMPILATION_ERROR) {
      return { success: false, output: result.error, compileOutput: result.error };
    }
    return { success: true, output: result.output };
  }

  async runSingleTest({ code, language, input, expectedOutput, timeLimit, memoryLimit, floatingPointTolerance, unordered, caseSensitive }) {
    const startTime = Date.now();
    let result;

    try {
      result = await this.executor.execute({ code, language, stdin: input, timeLimit, memoryLimit });
    } catch (err) {
      logger.error('[JudgeEngine] Execution error', { error: err.message });
      return {
        verdict: VERDICTS.INTERNAL_ERROR,
        actualOutput: '',
        expectedOutput,
        executionTime: 0,
        memoryUsed: 0,
        error: err.message,
        timedOut: false,
      };
    }

    const elapsed = (Date.now() - startTime) / 1000;

    if (result.status === VERDICTS.COMPILATION_ERROR) {
      return {
        verdict: VERDICTS.COMPILATION_ERROR,
        actualOutput: result.output,
        expectedOutput,
        executionTime: 0,
        memoryUsed: 0,
        compileOutput: result.compileOutput || result.error,
        error: result.error,
        timedOut: false,
      };
    }

    if (result.status === VERDICTS.TIME_LIMIT_EXCEEDED || result.timedOut) {
      return {
        verdict: VERDICTS.TIME_LIMIT_EXCEEDED,
        actualOutput: result.output,
        expectedOutput,
        executionTime: timeLimit || 5,
        memoryUsed: 0,
        timedOut: true,
      };
    }

    if (result.status === VERDICTS.MEMORY_LIMIT_EXCEEDED) {
      return {
        verdict: VERDICTS.MEMORY_LIMIT_EXCEEDED,
        actualOutput: result.output,
        expectedOutput,
        executionTime: elapsed,
        memoryUsed: memoryLimit || 256,
        timedOut: false,
      };
    }

    if (result.status === VERDICTS.OUTPUT_LIMIT_EXCEEDED) {
      return {
        verdict: VERDICTS.OUTPUT_LIMIT_EXCEEDED,
        actualOutput: result.output,
        expectedOutput,
        executionTime: elapsed,
        memoryUsed: result.memoryUsed || 0,
        timedOut: false,
      };
    }

    if (result.status === VERDICTS.RUNTIME_ERROR) {
      return {
        verdict: VERDICTS.RUNTIME_ERROR,
        actualOutput: result.output,
        expectedOutput,
        executionTime: elapsed,
        memoryUsed: result.memoryUsed || 0,
        error: result.error,
        timedOut: false,
      };
    }

    if (result.status === VERDICTS.WRONG_ANSWER) {
      const compare = this.comparator.compare(result.output, expectedOutput || '');
      if (!compare.match) {
        return {
          verdict: VERDICTS.WRONG_ANSWER,
          actualOutput: result.output,
          expectedOutput,
          executionTime: elapsed,
          memoryUsed: result.memoryUsed || 0,
          error: result.error,
          timedOut: false,
        };
      }
    }

    const compare = this.comparator.compare(result.output, expectedOutput || '');

    if (!compare.match) {
      return {
        verdict: compare.presentation ? VERDICTS.PRESENTATION_ERROR : VERDICTS.WRONG_ANSWER,
        actualOutput: result.output,
        expectedOutput,
        executionTime: elapsed,
        memoryUsed: result.memoryUsed || 0,
        error: result.error,
        timedOut: false,
      };
    }

    return {
      verdict: VERDICTS.ACCEPTED,
      actualOutput: result.output,
      expectedOutput,
      executionTime: elapsed,
      memoryUsed: result.memoryUsed || 0,
      error: result.error,
      timedOut: false,
    };
  }

  async evaluate({ code, language, testCases, timeLimit, memoryLimit }) {
    const results = [];
    let anyCompileError = false;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const hasCompilerOutput = results.some(r => r.compileOutput);

      if (!anyCompileError && !hasCompilerOutput) {
        const result = await this.runSingleTest({
          code,
          language,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          timeLimit: tc.timeout || timeLimit,
          memoryLimit: tc.memoryLimit || memoryLimit,
          floatingPointTolerance: tc.floatingPointTolerance,
          unordered: tc.unordered,
        });

        if (result.verdict === VERDICTS.COMPILATION_ERROR) {
          anyCompileError = true;
        }

        results.push({ ...result, testCaseIndex: i });
      } else {
        results.push({
          verdict: anyCompileError ? VERDICTS.COMPILATION_ERROR : VERDICTS.ACCEPTED,
          actualOutput: '',
          expectedOutput: tc.expectedOutput,
          executionTime: 0,
          memoryUsed: 0,
          testCaseIndex: i,
          skipped: true,
        });
      }
    }

    const passed = results.filter(r => r.verdict === VERDICTS.ACCEPTED).length;
    const total = testCases.length;
    const aggregate = aggregateVerdict(results);
    const maxExecutionTime = Math.max(...results.map(r => r.executionTime || 0));
    const maxMemory = Math.max(...results.map(r => r.memoryUsed || 0));

    return {
      results,
      passed,
      total,
      verdict: aggregate,
      maxExecutionTime,
      maxMemory,
    };
  }

  async runSampleTests({ code, language, sampleTestCases, timeLimit, memoryLimit }) {
    const results = [];
    for (const tc of sampleTestCases) {
      const result = await this.runSingleTest({
        code, language,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        timeLimit: tc.timeout || timeLimit,
        memoryLimit: tc.memoryLimit || memoryLimit,
      });
      results.push({ ...result, testCaseId: tc.id, input: tc.input, expectedOutput: tc.expectedOutput });
    }
    return results;
  }

  async healthCheck() {
    return this.executor.healthCheck();
  }
}

module.exports = { JudgeEngine };
