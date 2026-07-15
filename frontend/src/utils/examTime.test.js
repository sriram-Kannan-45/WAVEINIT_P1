import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRemainingTime, getRemainingMs } from './examTime.js';

describe('examTime helpers', () => {
  describe('getRemainingMs', () => {
    it('returns the full duration when the exam just started', () => {
      const now = Date.now();
      const durationMinutes = 60;
      const startedAt = new Date(now).toISOString();
      const remaining = getRemainingMs(startedAt, durationMinutes);

      // Allow a small tolerance for execution time.
      assert.ok(remaining >= 59 * 60 * 1000 && remaining <= 60 * 60 * 1000);
    });

    it('returns zero when the exam has already expired', () => {
      const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const durationMinutes = 60;
      assert.strictEqual(getRemainingMs(startedAt, durationMinutes), 0);
    });

    it('returns zero for missing startedAt', () => {
      assert.strictEqual(getRemainingMs(null, 30), 0);
      assert.strictEqual(getRemainingMs(undefined, 30), 0);
    });

    it('returns zero for missing or invalid duration', () => {
      const startedAt = new Date().toISOString();
      assert.strictEqual(getRemainingMs(startedAt, null), 0);
      assert.strictEqual(getRemainingMs(startedAt, undefined), 0);
      assert.strictEqual(getRemainingMs(startedAt, NaN), 0);
    });

    it('accepts a Date object as startedAt', () => {
      const durationMinutes = 30;
      const startedAt = new Date();
      const remaining = getRemainingMs(startedAt, durationMinutes);
      assert.ok(remaining >= 29 * 60 * 1000 && remaining <= 30 * 60 * 1000);
    });

    it('accepts a numeric timestamp as startedAt', () => {
      const durationMinutes = 15;
      const startedAt = Date.now();
      const remaining = getRemainingMs(startedAt, durationMinutes);
      assert.ok(remaining >= 14 * 60 * 1000 && remaining <= 15 * 60 * 1000);
    });
  });

  describe('formatRemainingTime', () => {
    it('formats zero milliseconds as 00:00:00', () => {
      assert.strictEqual(formatRemainingTime(0), '00:00:00');
    });

    it('formats one second correctly', () => {
      assert.strictEqual(formatRemainingTime(1000), '00:00:01');
    });

    it('formats one minute correctly', () => {
      assert.strictEqual(formatRemainingTime(60 * 1000), '00:01:00');
    });

    it('formats one hour correctly', () => {
      assert.strictEqual(formatRemainingTime(60 * 60 * 1000), '01:00:00');
    });

    it('pads single digit values', () => {
      assert.strictEqual(formatRemainingTime(61 * 1000), '00:01:01');
      assert.strictEqual(formatRemainingTime(3661 * 1000), '01:01:01');
    });

    it('handles durations longer than 24 hours', () => {
      const ms = 25 * 60 * 60 * 1000 + 30 * 60 * 1000 + 15 * 1000;
      assert.strictEqual(formatRemainingTime(ms), '25:30:15');
    });

    it('clamps negative durations to zero', () => {
      assert.strictEqual(formatRemainingTime(-5000), '00:00:00');
    });
  });
});
