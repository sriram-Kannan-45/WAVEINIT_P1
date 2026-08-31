/**
 * distributedLock — DB-backed distributed mutual exclusion (no Redis needed).
 *
 * Used as the fallback in config/redis.js when REDIS_URL is unset, so that
 * `acquireLock`/`releaseLock` become truly cross-instance on the shared
 * Supabase PostgreSQL (or MySQL).
 *
 * The acquire path serializes on a single table row using a `FOR UPDATE` lock
 * inside a transaction. This is atomic and dialect-independent.
 */

const { sequelize } = require('../config/db');
const DistributedLock = require('../models/DistributedLock');
const { getInstanceId } = require('../config/instance');

const now = () => new Date();

/**
 * Acquire a distributed lock.
 *
 * @param {string} key      logical lock name
 * @param {number} ttlMs    how long the lock is valid
 * @param {string} purpose  human-readable purpose (recorded on the row)
 * @param {string} [token]  optional caller-supplied token (defaults to instance token)
 * @returns {Promise<string|null>} lock token on success, null if already held
 */
async function acquire(key, ttlMs = 30000, purpose = '', token = null) {
  const lockToken = token || `${getInstanceId()}-${process.pid}-${Math.random().toString(36).slice(2, 12)}`;
  const expiresAt = new Date(Date.now() + ttlMs);

  // Retry once on a unique-constraint race: two instances can concurrently find
  // no row, both attempt to INSERT, and only one may win. The loser re-reads the
  // winner's row (now protected by FOR UPDATE) instead of blindly overwriting it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await sequelize.transaction();
    try {
      const existing = await DistributedLock.findOne({
        where: { lockKey: key },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
        await t.rollback();
        return null;
      }

      if (existing) {
        existing.token = lockToken;
        existing.owner = getInstanceId();
        existing.expiresAt = expiresAt;
        if (purpose) existing.purpose = purpose;
        await existing.save({ transaction: t });
      } else {
        await DistributedLock.create({
          lockKey: key,
          token: lockToken,
          owner: getInstanceId(),
          expiresAt,
          purpose: purpose || null,
        }, { transaction: t });
      }

      await t.commit();
      return lockToken;
    } catch (err) {
      try { await t.rollback(); } catch (_) { /* noop */ }
      const isUniqueViolation = [
        err?.name,
        err?.parent?.code,
        err?.original?.code,
        err?.original?.errno,
      ].some((c) => c === 'SequelizeUniqueConstraintError' || c === 'ER_DUP_ENTRY' || c === '23505');
      if (isUniqueViolation && attempt === 0) continue; // re-read the winner's row
      throw err;
    }
  }
  // Unreachable — only reached if attempt === 2 which never yields past the retry.
  return null;
}

/**
 * Renew an existing lock held by us (heartbeat).
 * Returns true if the renewal succeeded (and we still own the lock).
 */
async function renew(key, token, ttlMs = 30000) {
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    const [updated] = await DistributedLock.update(
      { expiresAt },
      { where: { lockKey: key, token } }
    );
    return updated > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Release a lock we own. If the holder changed (token mismatch) the lock is
 * left untouched so a lock rotation cannot be clobbered by an old owner.
 *
 * @returns {Promise<boolean>} true if the lock was released by us
 */
async function release(key, token) {
  try {
    const destroyed = await DistributedLock.destroy({
      where: { lockKey: key, token },
    });
    return destroyed > 0;
  } catch (_) {
    return false;
  }
}

/**
 * How many microseconds before expiry the lock will be released — used by
 * monitoring/health to warn about near-expiry content locks.
 */
async function ttlMs(key) {
  try {
    const row = await DistributedLock.findOne({ where: { lockKey: key } });
    if (!row) return null;
    return Math.max(0, new Date(row.expiresAt).getTime() - Date.now());
  } catch (_) {
    return null;
  }
}

/**
 * Cleanup: remove expired rows. Calls itself weekly from the leader to keep
 * the tiny table tidy. Never blocks acquire (acquire overwrites expired rows).
 */
async function cleanupExpired(batchSize = 1000) {
  return DistributedLock.destroy({
    where: { expiresAt: { [require('sequelize').Op.lt]: now() } },
    limit: batchSize,
  });
}

module.exports = { acquire, renew, release, ttlMs, cleanupExpired };