'use strict';

const assert = require('assert');
const {
  evaluateEffortAndUnlockStatus,
  filterAndSanitizeAiResponse,
  callAssist,
  DEFAULT_AI_UNLOCK_THRESHOLDS,
} = require('../src/services/codingAiAssistantService');

async function runTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING AI CODING ASSISTANT TEST SUITE');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Participant immediately clicks Hint (0m effort)
  // ----------------------------------------------------
  test('TEST 1: Immediate Hint Request (0s effort) is LOCKED and gives encouragement', () => {
    const status = evaluateEffortAndUnlockStatus({
      timeSpentSeconds: 10,
      editCount: 0,
      typedChars: 0,
      runAttempts: 0,
      usageCount: 0,
    });

    assert.strictEqual(status.levels[1].unlocked, false, 'Level 1 must be locked when effort is 0');
    assert.strictEqual(status.levels[2].unlocked, false, 'Level 2 must be locked when effort is 0');
    assert.strictEqual(status.levels[3].unlocked, false, 'Level 3 must be locked when effort is 0');
    assert.ok(status.levels[1].message.includes('Try the problem for a little longer'), 'Reason should encourage participant to try first');
  });

  // ----------------------------------------------------
  // TEST 2: Participant spends >= 120s and edits code
  // ----------------------------------------------------
  test('TEST 2: Level 1 unlocks after 120s + code edit / run attempt', () => {
    // Case A: 120s but 0 edits -> still locked
    const statusNoEdit = evaluateEffortAndUnlockStatus({
      timeSpentSeconds: 130,
      editCount: 0,
      typedChars: 0,
      runAttempts: 0,
    });
    assert.strictEqual(statusNoEdit.levels[1].unlocked, false, 'Level 1 must require code attempt even if time passed');

    // Case B: 120s + 1 edit -> unlocked!
    const statusWithEdit = evaluateEffortAndUnlockStatus({
      timeSpentSeconds: 125,
      editCount: 1,
      typedChars: 20,
      runAttempts: 0,
    });
    assert.strictEqual(statusWithEdit.levels[1].unlocked, true, 'Level 1 must unlock after 120s + 1 edit');
  });

  // ----------------------------------------------------
  // TEST 3: "Explain this problem" conceptual breakdown
  // ----------------------------------------------------
  await asyncTest('TEST 3: "Explain this problem" returns structured explanation with ZERO code', async () => {
    const response = await callAssist({
      title: 'Even or Odd Number Check',
      problemStatement: 'Given an integer N, print EVEN if the number is even, else print ODD.',
      inputFormat: 'A single integer N',
      outputFormat: 'EVEN or ODD',
      constraints: '1 <= N <= 10^5',
      language: 'python',
      code: '',
      question: 'Can you explain this problem in simple words?',
      level: 1,
      action: 'explain_problem',
    });

    assert.ok(response.includes('WHAT THE QUESTION WANTS:'), 'Response should include WHAT THE QUESTION WANTS section');
    assert.ok(response.includes('WHAT YOU NEED TO THINK ABOUT:'), 'Response should include WHAT YOU NEED TO THINK ABOUT section');
    assert.ok(!response.includes('```'), 'Response must NOT contain markdown code fences');
    assert.ok(!response.includes('def '), 'Response must NOT contain Python function syntax');
    assert.ok(!response.includes('if ('), 'Response must NOT contain if condition code');
    assert.ok(!response.includes('return '), 'Response must NOT contain return code');
  });

  // ----------------------------------------------------
  // TEST 4: Participant asks "Give me Python code"
  // ----------------------------------------------------
  await asyncTest('TEST 4: Participant asks "Give me Python code" -> Refusal + conceptual guidance, NO code', async () => {
    const response = await callAssist({
      title: 'Sum of Two Numbers',
      problemStatement: 'Add two numbers A and B and return their sum.',
      language: 'python',
      code: '',
      question: 'Give me Python code to solve this',
      level: 1,
      action: 'custom',
    });

    assert.ok(
      response.includes('I cannot write the code for you') || response.includes('cannot write the code'),
      'Response must politely refuse to give code'
    );
    assert.ok(!response.includes('```'), 'Response must NOT contain code blocks');
    assert.ok(!response.includes('print('), 'Response must NOT contain print syntax');
    assert.ok(!response.includes('def '), 'Response must NOT contain def syntax');
  });

  // ----------------------------------------------------
  // TEST 5: Participant asks "What is the logic?"
  // ----------------------------------------------------
  await asyncTest('TEST 5: Participant asks "What is the logic?" -> Easy plain English explanation', async () => {
    const response = await callAssist({
      title: 'Find Maximum in Array',
      problemStatement: 'Given an array of numbers, find the largest number.',
      language: 'javascript',
      code: '',
      question: 'What is the logic to solve this problem?',
      level: 2,
      action: 'approach',
    });

    assert.ok(response.includes('WHAT THE QUESTION WANTS:') || response.includes('IDEA TO TRY:'), 'Response must have clear structured sections');
    assert.ok(!response.includes('```'), 'Response must NOT contain code blocks');
    assert.ok(!response.includes('for ('), 'Response must NOT contain for loop syntax');
  });

  // ----------------------------------------------------
  // TEST 6: Multilingual support: "Enaku purila"
  // ----------------------------------------------------
  await asyncTest('TEST 6: Participant asks in Tamil/Tanglish "Enaku purila" -> Beginner-friendly Tamil/Tanglish, NO code', async () => {
    const response = await callAssist({
      title: 'Check Palindrome',
      problemStatement: 'Check if a given string is a palindrome.',
      language: 'python',
      code: '',
      question: 'Enaku purila, enna panradhu?',
      level: 1,
      action: 'custom',
    });

    assert.ok(
      response.toLowerCase().includes('parava illa') || response.toLowerCase().includes('yosinga') || response.toLowerCase().includes('simple'),
      'Response should address participant in friendly Tanglish/Tamil'
    );
    assert.ok(!response.includes('```'), 'Response must NOT contain code blocks');
  });

  // ----------------------------------------------------
  // TEST 7: Error help without code rewrite
  // ----------------------------------------------------
  await asyncTest('TEST 7: "Help me understand my error" -> Explains error conceptually without rewriting code', async () => {
    const response = await callAssist({
      title: 'Division Check',
      problemStatement: 'Divide A by B.',
      language: 'python',
      code: 'result = a / b',
      question: 'Help me understand my error',
      level: 3,
      action: 'explain_error',
      errorContext: 'ZeroDivisionError: division by zero',
    });

    assert.ok(response.includes('WHAT YOU NEED TO THINK ABOUT:'), 'Must explain what to think about');
    assert.ok(!response.includes('```'), 'Must NOT give code replacement');
    assert.ok(!response.includes('result ='), 'Must NOT give corrected code statement');
  });

  // ----------------------------------------------------
  // TEST 8: AI Safety Filter Layer
  // ----------------------------------------------------
  test('TEST 8: AI Safety Filter Layer cleanses synthetic code fences and syntax lines', () => {
    const dirtyOutput = `WHAT THE QUESTION WANTS:
Here is how to solve it.

\`\`\`python
def solve(n):
    if n % 2 == 0:
        return "EVEN"
    else:
        return "ODD"
\`\`\`

You should use \`if (n % 2 == 0)\` to check parity.
console.log("Done");`;

    const cleanOutput = filterAndSanitizeAiResponse(dirtyOutput);

    assert.ok(!cleanOutput.includes('```'), 'Safety filter must strip markdown code blocks');
    assert.ok(!cleanOutput.includes('def solve'), 'Safety filter must strip function definition');
    assert.ok(!cleanOutput.includes('console.log'), 'Safety filter must strip console.log');
    assert.ok(!cleanOutput.includes('return "EVEN"'), 'Safety filter must strip return statements');
  });

  console.log('\n==================================================');
  console.log(`📊 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
