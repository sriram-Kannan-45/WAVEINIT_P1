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

module.exports = {
  initRedis,
  getRedisClient,
  isRedisReady,
  closeRedis,
};
