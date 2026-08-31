/**
 * Attendance Daily Synchronization Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every night / periodically to ensure that all active training programs
 * have complete Morning & Evening attendance sessions prepared.
 *
 * Leader-guarded: exactly one instance across an Azure App Service scale-out pool
 * executes the background sweep.
 */

const cron = require('node-cron');
const { withLeaderLock } = require('../utils/leaderElection');
const { ensureAllActiveTrainingsAttendance } = require('../services/attendanceAutomationService');
const logger = require('../utils/logger');

let task = null;

function startAttendanceAutoJob() {
  if (task) return task;

  // Run once at boot (leader-guarded)
  withLeaderLock('cron:attendance-auto-sync-boot', async () => {
    try {
      await ensureAllActiveTrainingsAttendance();
    } catch (err) {
      logger.warn('[attendanceAutoJob] Boot check failed', { error: err.message });
    }
  }).catch(() => {});

  // Run at 00:05 IST (18:35 UTC) daily or every 4 hours as a safety sweep
  task = cron.schedule('5 0,4,8,12,16,20 * * *', async () => {
    await withLeaderLock('cron:attendance-daily-sync', async () => {
      try {
        await ensureAllActiveTrainingsAttendance();
      } catch (err) {
        logger.error('[attendanceAutoJob] Daily attendance cron failed', { error: err.message });
      }
    });
  });

  logger.info('[attendanceAutoJob] Attendance auto-sync scheduler started (leader-guarded)');
  return task;
}

function stopAttendanceAutoJob() {
  if (task) {
    task.stop();
    task = null;
    logger.info('[attendanceAutoJob] Attendance auto-sync scheduler stopped');
  }
}

module.exports = {
  startAttendanceAutoJob,
  stopAttendanceAutoJob,
};
