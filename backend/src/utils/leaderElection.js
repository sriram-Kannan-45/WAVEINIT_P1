/**
 * leaderElection — one-in-charge guard for single-writer jobs.
 *
 * App.js currently starts "background job workers" and several timers on EVERY
 * process. That is correct single-host, but under scale-out every instance
 * would run the same cron — OTP cleanup would double-delete (harmless), but
 * proctoring auto-submit and attendance auto-actions would fire duplicates.
 *
 * This module wraps those jobs in a short distributed lock
 * (`distributed_locks` table → config/redis.js fallback path) so exactly ONE
 * instance across the whole pool runs each job, and the leadership is
 * re-checked before every job tick (no timer missed whenever the leader
 * changes). Locks self-expire, so crashes cannot strand the namespace.
 */

const crypto = require('crypto');
const { acquire, release } = require('./distributedLock');
const { getInstanceId } = require('../config/instance');

const LEADER_TTL_MS = 120_000;      // leadership window before re-election
const HEARTBEAT_MS = 30_000;        // stagger between elections

/**
 * Run `fn` only if we win a short leadership lock for `name`.
 * Returns the result of fn, or null when another instance holds the lock.
 *
 * @param {string} name   logical leader key, e.g. 'cron:otp-cleanup'
 * @param {Function} fn   async job to run only when the lock is acquired
 * @returns {Promise<*>}  result of fn or null
 */
async function withLeaderLock(name, fn) {
  const token = `${getInstanceId()}-${crypto.randomBytes(4).toString('hex')}`;
  const lockKey = `leader:${name}`;

  const acquiredToken = await acquire(lockKey, LEADER_TTL_MS, `leader(${name})`, token);
  if (!acquiredToken) return null;

  try {
    return await fn();
  } finally {
    await release(lockKey, acquiredToken).catch(() => {});
  }
}

/**
 * Whether the current instance is the leader for `name` *right now*.
 * Uses a short-lived lock; useful for status/reporting only.
 */
async function isCurrentLeader(name) {
  return !!(await acquire(`leader:${name}`, LEADER_TTL_MS, `leader(${name})`));
}

/**
 * Convenience guard for interval timers that must run on a single instance:
 *   scheduleSingletonInterval('monitor:auto-submit', 60_000, async () => {...})
 * Leadership is re-negotiated on every tick.
 */
function scheduleSingletonInterval(name, intervalMs, fn, { runImmediately = false } = {}) {
  const tick = async () => {
    try {
      await withLeaderLock(name, fn);
    } catch (err) {
      // Loggers live in app.js; a failing leader job must not crash the process.
      // eslint-disable-next-line no-console
      console.error(`[leader:${name}] job failed:`, err?.message || err);
    }
  };

  if (runImmediately) {
    setImmediate(tick);
  } else {
    setTimeout(tick, intervalMs);
  }
  return setInterval(tick, intervalMs);
}

module.exports = { withLeaderLock, isCurrentLeader, scheduleSingletonInterval, LEADER_TTL_MS };