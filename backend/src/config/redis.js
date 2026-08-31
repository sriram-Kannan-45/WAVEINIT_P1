/**
 * Shared Redis Connection Manager
 * 
 * Provides a single, fail-fast, leak-free Redis connection.
 * If REDIS_URL is not set or Redis is unreachable, cleanly disables Redis
 * without unhandled promises, dangling sockets, or background retry loops.
 */

const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL;
let redisClient = null;
let isInitialized = false;
let isAvailable = false;

async function initRedis() {
  if (isInitialized) return redisClient;
  isInitialized = true;

  if (!REDIS_URL || !REDIS_URL.trim()) {
    logger.info('[Redis] Redis not configured (REDIS_URL missing); using synchronous in-memory processing.');
    isAvailable = false;
    redisClient = null;
    return null;
  }

  try {
    const IORedis = require('ioredis');
    const parsedUrl = new URL(REDIS_URL.includes('://') ? REDIS_URL : `redis://${REDIS_URL}`);
    const host = parsedUrl.hostname || 'localhost';
    const port = parsedUrl.port || 6379;

    const client = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 4000,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        // Fail fast: Stop retrying after 2 attempts to prevent memory leaks and zombie sockets
        if (times > 2) return null;
        return 1000;
      },
    });

    client.on('error', (err) => {
      // Only log if we haven't already marked it unavailable
      if (isAvailable) {
        logger.warn('[Redis] Connection error', { host, port, error: err.message });
      }
    });

    // Attempt initial connection with a strict timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out (4s)')), 4500)),
    ]);

    logger.info(`[Redis] Connected successfully to ${host}:${port}`);
    redisClient = client;
    isAvailable = true;
    return redisClient;
  } catch (err) {
    const host = REDIS_URL.split('@').pop() || 'remote';
    logger.warn(`[Redis] Redis unavailable at ${host} (${err.message}); disabling queue and using synchronous processing.`);
    
    if (redisClient) {
      try {
        redisClient.disconnect(false);
        redisClient.removeAllListeners();
      } catch (_) {}
    }
    redisClient = null;
    isAvailable = false;
    return null;
  }
}

function getRedisClient() {
  return isAvailable ? redisClient : null;
}

function isRedisReady() {
  return isAvailable && redisClient !== null && redisClient.status === 'ready';
}

/**
 * Which transport backs acquireLock/releaseLock: 'redis' or 'db'.
 * Exposed on the health endpoint so deployments can confirm the shared lock.
 */
function getLockProvider() {
  return isRedisReady() ? 'redis' : 'db';
}

async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (_) {
      redisClient.disconnect(false);
    }
    redisClient.removeAllListeners();
    redisClient = null;
    isAvailable = false;
  }
}

/**
 * Acquire a distributed lock using Redis SET key value NX PX <ttlMs>
 * @param {string} lockKey - Name of lock (e.g. 'lock:quiz:sub:123')
 * @param {number} ttlMs - Lock expiration in milliseconds (default: 10000)
 * @returns {Promise<string|null>} Lock token if acquired, null if already locked
 */
async function acquireLock(lockKey, ttlMs = 10000) {
  const client = getRedisClient();
  const token = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (!client || !isRedisReady()) {
    // No Redis → use the shared-DB distributed lock (multi-instance safe)
    // when the database is available; otherwise (unit tests, bootstrapping)
    // fall back to the per-process in-memory Map.
    try {
      const dbLock = require('../utils/distributedLock');
      const acquired = await dbLock.acquire(lockKey, ttlMs, 'redis-fallback');
      return acquired || null;
    } catch (err) {
      if (!global.__inMemoryLocks) global.__inMemoryLocks = new Map();
      const existing = global.__inMemoryLocks.get(lockKey);
      const now = Date.now();
      if (existing && existing.expiresAt > now) {
        return null;
      }
      global.__inMemoryLocks.set(lockKey, { token, expiresAt: now + ttlMs });
      return token;
    }
  }
  try {
    const res = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
    return res === 'OK' ? token : null;
  } catch (err) {
    logger.warn('[Redis] acquireLock error, falling back to permissive', { error: err.message, lockKey });
    return token;
  }
}

/**
 * Release a distributed lock safely using Lua script
 * @param {string} lockKey - Name of lock
 * @param {string} token - Token returned by acquireLock
 * @returns {Promise<boolean>} True if released, false otherwise
 */
async function releaseLock(lockKey, token) {
  if (!token) return false;
  const client = getRedisClient();
  if (!client || !isRedisReady()) {
    try {
      const dbLock = require('../utils/distributedLock');
      return await dbLock.release(lockKey, token);
    } catch (err) {
      if (global.__inMemoryLocks) {
        const existing = global.__inMemoryLocks.get(lockKey);
        if (existing && existing.token === token) {
          global.__inMemoryLocks.delete(lockKey);
          return true;
        }
      }
      return false;
    }
  }
  try {
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await client.eval(luaScript, 1, lockKey, token);
    return result === 1;
  } catch (err) {
    logger.warn('[Redis] releaseLock error', { error: err.message, lockKey });
    return false;
  }
}

/**
 * Helper to get JSON cached data
 */
async function getCache(key) {
  const client = getRedisClient();
  if (!client || !isRedisReady()) return null;
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Helper to set JSON cached data with TTL (seconds)
 */
async function setCache(key, value, ttlSeconds = 60) {
  const client = getRedisClient();
  if (!client || !isRedisReady()) return false;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to delete cached data
 */
async function delCache(key) {
  const client = getRedisClient();
  if (!client || !isRedisReady()) return false;
  try {
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  initRedis,
  getRedisClient,
  isRedisReady,
  getLockProvider,
  closeRedis,
  acquireLock,
  releaseLock,
  getCache,
  setCache,
  delCache,
};
