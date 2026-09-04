const { JudgeEngine } = require('../src/judge/engine');
const { runTests } = require('../src/services/codeExecutionService');

async function benchmark() {
  console.log('=== BENCHMARK: Code Execution & Judge Engine Timing ===\n');

  const oddEvenCode = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim();
function solve(n) {
  return n % 2 === 0 ? 'Even' : 'Odd';
}
console.log(solve(parseInt(input, 10)));
`;

  const testCases = [
    { id: 1, input: '4', expectedOutput: 'Even', isHidden: false },
    { id: 2, input: '7', expectedOutput: 'Odd', isHidden: false },
    { id: 3, input: '0', expectedOutput: 'Even', isHidden: true },
    { id: 4, input: '-3', expectedOutput: 'Odd', isHidden: true },
  ];

  const engine = new JudgeEngine();

  // Test 1: JudgeEngine.evaluate (used by submissionWorker for "Submit Code")
  console.time('JudgeEngine.evaluate (SubmissionWorker)');
  const t0 = Date.now();
  const res1 = await engine.evaluate({
    code: oddEvenCode,
    language: 'javascript',
    testCases,
    timeLimit: 5,
    memoryLimit: 256,
  });
  const t1 = Date.now();
  console.timeEnd('JudgeEngine.evaluate (SubmissionWorker)');
  console.log(`  -> Passed ${res1.passed}/${res1.total} | Verdict: ${res1.verdict} | Time: ${t1 - t0}ms\n`);

  // Test 2: codeExecutionService.runTests (used by submitAssessment for final submit)
  console.time('codeExecutionService.runTests (Final Submit)');
  const t2 = Date.now();
  const res2 = await runTests(oddEvenCode, 'javascript', testCases, 5, 256);
  const t3 = Date.now();
  console.timeEnd('codeExecutionService.runTests (Final Submit)');
  const passed2 = res2.filter(r => r.passed).length;
  console.log(`  -> Passed ${passed2}/${res2.length} | Time: ${t3 - t2}ms\n`);
}

benchmark().catch(console.error);
