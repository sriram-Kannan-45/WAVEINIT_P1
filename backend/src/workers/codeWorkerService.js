/**
 * CodeWorkerService
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Worker Process for Code Compilation & Test Case Execution.
 * Consumes from the BullMQ 'coding-submissions' queue.
 * Decoupled from the HTTP Application Servers to prevent CPU starvation.
 */

require('dotenv').config();
const { connectDB, sequelize } = require('../config/db');
const { initRedis, closeRedis } = require('../config/redis');
const { startWorker, stopWorker } = require('./submissionWorker');
const logger = require('../utils/logger');

const WORKER_NAME = process.env.WORKER_NAME || `code-worker-${process.pid}`;

async function main() {
  logger.logAlways(`[${WORKER_NAME}] ⚙️ Initializing Standalone Code Execution Worker...`);

  // 1. Connect to Database
  await connectDB();
  logger.info(`[${WORKER_NAME}] Database connected successfully.`);

  // 2. Connect to Shared Redis
  const redisClient = await initRedis();
  if (!redisClient) {
    logger.warn(`[${WORKER_NAME}] ⚠️ Redis unavailable. Worker requires Redis to consume queue jobs.`);
  }

  // 3. Start BullMQ Worker
  startWorker(null);

  logger.logAlways(`[${WORKER_NAME}] 🚀 Code Execution Worker is RUNNING and listening for jobs.`);

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.logAlways(`[${WORKER_NAME}] Received ${signal}, draining and stopping worker...`);
    await stopWorker();
    await closeRedis();
    await sequelize.close();
    logger.logAlways(`[${WORKER_NAME}] ✅ Shutdown complete.`);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    logger.error(`[${WORKER_NAME}] Fatal Worker Error:`, { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { main };
