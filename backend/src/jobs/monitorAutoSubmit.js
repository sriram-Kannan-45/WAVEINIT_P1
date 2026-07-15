const cron = require('node-cron');
const { MonitorAttempt } = require('../models');
const logger = require('../utils/logger');

let task = null;

function startMonitorAutoSubmitCron(io) {
  if (task) return task;

  task = cron.schedule('* * * * *', async () => {
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
          io.to(`trainer_${attempt.testId}`).emit('test-submitted', {
            participantId: attempt.participantId,
            autoSubmitted: true,
            submittedAt: attempt.submittedAt,
          });
          io.to(`participant_${attempt.id}`).emit('force-submit', {
            reason: 'Time expired',
          });
        }

        logger.info('monitor auto-submitted expired attempt', { attemptId: attempt.id });
      }
    } catch (err) {
      logger.error('monitor auto-submit cron failed', { err: err.message });
    }
  });

  logger.info('Monitor auto-submit cron started');
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
