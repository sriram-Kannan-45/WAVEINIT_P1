const assert = require('assert');
const monitoringService = require('../src/services/monitoringService');

const {
  calculateEyeHeadScore,
  mergeIntervals,
  calculateUniqueViolationSeconds,
} = monitoringService;

describe('MediaPipe Audit Scoring Test Suite', () => {
  test('TEST 1: 100-second test with 6 categories (10s each = 60s total) -> 36 / 60', () => {
    const intervals = [
      [0.0, 10.0], [10.0, 20.0], [20.0, 30.0],
      [30.0, 40.0], [40.0, 50.0], [50.0, 60.0],
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(60.0);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(36.0);
  });

  test('TEST 2: 100-second test with 35s non-overlapping violations -> 21 / 60', () => {
    const intervals = [
      [0.0, 10.0],  // Head Left: 10s
      [15.0, 20.0], // Head Right: 5s
      [30.0, 50.0], // Eye Left: 20s
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(35.0);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(21.0);
  });

  test('TEST 3: Overlapping Head Left [10, 20] & Eye Left [12, 18] -> 10s unique (6 / 60)', () => {
    const intervals = [
      [10.0, 20.0],
      [12.0, 18.0],
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(10.0);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(score).toBe(6.0);
  });

  test('TEST 4: Early submission at 63s with 21s violation -> 20 / 60 (NOT 12.6)', () => {
    const actualTestDuration = 63.0;
    const uniqueSec = 21.0;
    const score = calculateEyeHeadScore(uniqueSec, actualTestDuration);
    expect(score).toBe(20.0);
  });

  test('TEST 5: Early submission (Configured 600s, Actual 300s, Violation 60s) -> 12 / 60', () => {
    const actualTestDuration = 300.0;
    const uniqueSec = 60.0;
    const score = calculateEyeHeadScore(uniqueSec, actualTestDuration);
    expect(score).toBe(12.0);
  });

  test('TEST 6: Valid continuous episodes (7.4s, 8.7s) preserve full actual duration', () => {
    const intervals = [
      [10.0, 17.4], // 7.4s
      [20.0, 28.7], // 8.7s
    ];
    const uniqueSec = calculateUniqueViolationSeconds(intervals);
    expect(uniqueSec).toBe(16.1);
    const score = calculateEyeHeadScore(uniqueSec, 100.0);
    expect(Math.round(score * 100) / 100).toBe(9.66);
  });

  test('TEST 7: Clamping from 0 to 60', () => {
    expect(calculateEyeHeadScore(0.0, 100.0)).toBe(0.0);
    expect(calculateEyeHeadScore(100.0, 100.0)).toBe(60.0);
    expect(calculateEyeHeadScore(150.0, 100.0)).toBe(60.0);
  });
});
