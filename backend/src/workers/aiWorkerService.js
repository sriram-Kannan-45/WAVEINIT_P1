/**
 * AIWorkerService
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Worker Process for MediaPipe & YOLO Video Segment Analysis.
 * Consumes from the BullMQ 'monitoring-video' queue.
 * Decoupled from the HTTP Application Servers to prevent blocking API requests.
 */

require('dotenv').config();
const { connectDB, sequelize } = require('../config/db');
const { initRedis, closeRedis } = require('../config/redis');
const { startMonitoringWorker } = require('./monitoringJobWorker');
const logger = require('../utils/logger');

const WORKER_NAME = process.env.WORKER_NAME || `ai-worker-${process.pid}`;

async function main() {
  logger.logAlways(`[${WORKER_NAME}] ⚙️ Initializing Standalone AI/MediaPipe Video Processing Worker...`);

  // 1. Connect to Database
  await connectDB();
  logger.info(`[${WORKER_NAME}] Database connected successfully.`);

  // 2. Connect to Shared Redis
  const redisClient = await initRedis();
  if (!redisClient) {
    logger.warn(`[${WORKER_NAME}] ⚠️ Redis unavailable. Worker falling back to database polling.`);
  }

  // 3. Start BullMQ / DB Poller Monitoring Worker
  const workerHandle = startMonitoringWorker(null);

  logger.logAlways(`[${WORKER_NAME}] 🚀 AI/MediaPipe Video Worker is RUNNING and listening for jobs.`);

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.logAlways(`[${WORKER_NAME}] Received ${signal}, draining and stopping worker...`);
    if (workerHandle && workerHandle.stop) {
      await workerHandle.stop();
    }
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
