const assert = require('assert');
const monitoringService = require('../src/services/monitoringService');

const {
  calculateEyeHeadScore,
  mergeIntervals,
  calculateUniqueViolationSeconds,
} = monitoringService;

console.log('===============================================================');
console.log('RUNNING MEDIAPIPE AUDIT TEST SUITE (100% SPECIFICATION MATCH)');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}`);
    console.error(`   Error: ${err.message}`);
  }
}

// TEST 1: 100s test, 6 categories 10s each -> 36 / 60
runTest('TEST 1: 100-second test with 6 categories (10s each = 60s total) -> 36 / 60', () => {
  const intervals = [
    [0.0, 10.0], [10.0, 20.0], [20.0, 30.0],
    [30.0, 40.0], [40.0, 50.0], [50.0, 60.0],
  ];
  const uniqueSec = calculateUniqueViolationSeconds(intervals);
  assert.strictEqual(uniqueSec, 60.0);
  const score = calculateEyeHeadScore(uniqueSec, 100.0);
  assert.strictEqual(score, 36.0);
});

// TEST 2: 100s test, 35s non-overlapping (Head Left 10s + Head Right 5s + Eye Left 20s) -> 21 / 60
runTest('TEST 2: 100-second test with 35s non-overlapping violations -> 21 / 60', () => {
  const intervals = [
    [0.0, 10.0],  // Head Left: 10s
    [15.0, 20.0], // Head Right: 5s
    [30.0, 50.0], // Eye Left: 20s
  ];
  const uniqueSec = calculateUniqueViolationSeconds(intervals);
  assert.strictEqual(uniqueSec, 35.0);
  const score = calculateEyeHeadScore(uniqueSec, 100.0);
  assert.strictEqual(score, 21.0);
});

// TEST 3: Overlapping violations (Head Left 10->20, Eye Left 12->18) -> 6 / 60 (NOT 16s / 9.6)
runTest('TEST 3: Overlapping Head Left [10, 20] & Eye Left [12, 18] -> 10s unique (6 / 60)', () => {
  const intervals = [
    [10.0, 20.0],
    [12.0, 18.0],
  ];
  const uniqueSec = calculateUniqueViolationSeconds(intervals);
  assert.strictEqual(uniqueSec, 10.0);
  const score = calculateEyeHeadScore(uniqueSec, 100.0);
  assert.strictEqual(score, 6.0);
});

// TEST 4: Early submission at 63s with 21s violation -> 20 / 60 (NOT 12.6)
runTest('TEST 4: Early submission at 63s with 21s violation -> 20 / 60 (NOT 12.6)', () => {
  const actualTestDuration = 63.0;
  const uniqueSec = 21.0;
  const score = calculateEyeHeadScore(uniqueSec, actualTestDuration);
  assert.strictEqual(score, 20.0);
});

// TEST 5: Early submission (Configured 600s, submitted at 300s with 60s violation) -> 12 / 60 (NOT 6)
runTest('TEST 5: Early submission (Configured 600s, Actual 300s, Violation 60s) -> 12 / 60', () => {
  const actualTestDuration = 300.0;
  const uniqueSec = 60.0;
  const score = calculateEyeHeadScore(uniqueSec, actualTestDuration);
  assert.strictEqual(score, 12.0);
});

// TEST 6: Continuous duration preservation
runTest('TEST 6: Valid continuous episodes (7.4s, 8.7s) preserve full actual duration', () => {
  const intervals = [
    [10.0, 17.4], // 7.4s
    [20.0, 28.7], // 8.7s
  ];
  const uniqueSec = calculateUniqueViolationSeconds(intervals);
  assert.strictEqual(uniqueSec, 16.1);
  const score = calculateEyeHeadScore(uniqueSec, 100.0);
  assert.strictEqual(Math.round(score * 100) / 100, 9.66);
});

// TEST 7: Zero violation and maximum violation clamping (0 to 60)
runTest('TEST 7: Clamping from 0 to 60', () => {
  assert.strictEqual(calculateEyeHeadScore(0.0, 100.0), 0.0);
  assert.strictEqual(calculateEyeHeadScore(100.0, 100.0), 60.0);
  assert.strictEqual(calculateEyeHeadScore(150.0, 100.0), 60.0);
});

console.log('\n===============================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
console.log('===============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
