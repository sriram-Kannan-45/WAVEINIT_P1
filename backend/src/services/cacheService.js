/**
 * cacheService.js
 * ─────────────────────────────────────────────────────────────
 * High-performance in-memory TTL cache with namespace support,
 * automated cache wrapping, and pattern-based invalidation.
 * Eliminates redundant database computations for read-heavy operations.
 */

const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.del(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds = 30) {
    this.del(key); // Clear existing timer if any
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiresAt });

    // Set cleanup timeout
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttlSeconds * 1000);

    if (timer.unref) timer.unref();
    this.timers.set(key, timer);
    return value;
  }

  del(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    this.cache.delete(key);
  }

  delByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.del(key);
      }
    }
  }

  /**
   * Stale-while-revalidate / Cache-aside wrapper
   * @param {string} key
   * @param {Function} fetchFn Async function that produces the value if cache misses
   * @param {number} ttlSeconds
   */
  async wrap(key, fetchFn, ttlSeconds = 30) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFn();
    if (fresh !== undefined && fresh !== null) {
      this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
  }

  // ── High-Level Invalidation Helpers ──
  invalidateCourse(courseId) {
    if (!courseId) return;
    this.delByPrefix(`course:${courseId}:`);
    this.delByPrefix(`courses:list:`);
  }

  invalidateLeaderboard(courseOrTrainingId) {
    this.delByPrefix(`leaderboard:`);
    if (courseOrTrainingId) {
      this.delByPrefix(`training_leaderboard:${courseOrTrainingId}`);
      this.delByPrefix(`quiz_leaderboard:${courseOrTrainingId}`);
    }
  }

  invalidateTrainer(trainerId) {
    if (!trainerId) return;
    this.delByPrefix(`trainer:${trainerId}:`);
    this.delByPrefix(`courses:list:`);
  }

  invalidateParticipant(participantId) {
    if (!participantId) return;
    this.delByPrefix(`participant:${participantId}:`);
  }
}

const cacheService = new CacheService();
module.exports = cacheService;
