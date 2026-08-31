const cron = require('node-cron');
const { MonitorAttempt } = require('../models');
const { withLeaderLock } = require('../utils/leaderElection');
const relay = require('../socket/crossInstance');
const logger = require('../utils/logger');

let task = null;

function startMonitorAutoSubmitCron(io) {
  if (task) return task;

  task = cron.schedule('* * * * *', async () => {
    // Exactly one instance runs the sweep (distributed lock via shared DB).
    await withLeaderLock('cron:monitor-auto-submit', async () => {
      try {
        const now = new Date();
        const expiredAttempts = await MonitorAttempt.findAll({
          where: {
            status: 'in_progress',
            endsAt: { [require('sequelize').Op.lt]: now },
          },
        });

        for (const attempt of expiredAttempts) {
          attempt.status = 'submitted';
          attempt.autoSubmitted = true;
          attempt.submittedAt = now;
          await attempt.save();

          if (io) {
            relay.relayEmit(io, 'room', `trainer_${attempt.testId}`, 'test-submitted', {
              participantId: attempt.participantId,
              autoSubmitted: true,
              submittedAt: attempt.submittedAt,
            });
            relay.relayEmit(io, 'room', `participant_${attempt.id}`, 'force-submit', {
              reason: 'Time expired',
            });
          }

          logger.info('monitor auto-submitted expired attempt', { attemptId: attempt.id });
        }
      } catch (err) {
        logger.error('monitor auto-submit cron failed', { err: err.message });
      }
    });
  });

  logger.info('Monitor auto-submit cron started (leader-guarded)');
  return task;
}

function stopMonitorAutoSubmitCron() {
  if (task) {
    task.stop();
    task = null;
    logger.info('Monitor auto-submit cron stopped');
  }
}

module.exports = {
  startMonitorAutoSubmitCron,
  stopMonitorAutoSubmitCron,
};
