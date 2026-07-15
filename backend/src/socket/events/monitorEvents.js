const fs = require('fs');
const path = require('path');
const {
  MonitorAttempt,
  MonitorViolation,
  MonitorScreenshot,
} = require('../../models');
const logger = require('../../utils/logger');

const SCREENSHOT_DIR = path.join(__dirname, '../../../uploads/monitor-screenshots');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = function registerMonitorEvents(io, socket) {
  // ── Participant joins their session room ───────────────────────────────
  socket.on('join-session', async ({ participantId, sessionId, attemptId }) => {
    try {
      const isOwner = socket.userRole === 'PARTICIPANT' && socket.userId === participantId;
      const isStaff = ['TRAINER', 'ADMIN'].includes(socket.userRole);
      if (!isOwner && !isStaff) return;

      if (attemptId) {
        socket.join(`participant_${attemptId}`);
        socket.data.monitorAttemptId = attemptId;
      }
      if (sessionId) {
        socket.join(`session_${sessionId}`);
        socket.data.monitorSessionId = sessionId;
      }
      logger.info('monitor:join-session', { socketId: socket.id, participantId, sessionId, attemptId });
    } catch (err) {
      logger.error('monitor join-session failed', { err: err.message });
    }
  });

  // ── Trainer joins monitoring room for a session/test ───────────────────
  socket.on('join-trainer-room', async ({ sessionId }) => {
    try {
      if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) return;
      socket.join(`trainer_${sessionId}`);
      socket.data.monitorTrainerSessionId = sessionId;
      logger.info('monitor:join-trainer-room', { socketId: socket.id, sessionId });
    } catch (err) {
      logger.error('monitor join-trainer-room failed', { err: err.message });
    }
  });

  // ── Screen-frame from participant ──────────────────────────────────────
  socket.on('screen-frame', async ({ attemptId, participantId, imageBase64, timestamp }) => {
    try {
      if (!attemptId || !imageBase64) return;

      const attempt = await MonitorAttempt.findByPk(attemptId);
      if (!attempt) return;

      const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, '');
      const filename = `${participantId}_${Date.now()}.jpg`;
      const attemptDir = path.join(SCREENSHOT_DIR, String(attemptId));
      ensureDir(attemptDir);
      const filepath = path.join(attemptDir, filename);

      fs.writeFileSync(filepath, base64Data, 'base64');

      const screenshot = await MonitorScreenshot.create({
        attemptId,
        participantId,
        filePath: filepath,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });

      // Forward to trainers
      io.to(`trainer_${attempt.testId}`).emit('new-frame', {
        participantId,
        imageBase64,
        timestamp: screenshot.timestamp,
      });
    } catch (err) {
      logger.error('monitor screen-frame failed', { err: err.message });
    }
  });

  // ── Violation from participant ─────────────────────────────────────────
  socket.on('violation', async ({ attemptId, participantId, type, timestamp }) => {
    try {
      if (!attemptId || !type) return;

      const attempt = await MonitorAttempt.findByPk(attemptId);
      if (!attempt) return;

      const violation = await MonitorViolation.create({
        attemptId,
        participantId,
        type,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });

      const count = await MonitorViolation.count({ where: { attemptId } });

      io.to(`trainer_${attempt.testId}`).emit('violation', {
        participantId,
        type,
        timestamp: violation.timestamp,
      });

      if (count >= 5 && !attempt.flagged) {
        attempt.flagged = true;
        await attempt.save();
        io.to(`trainer_${attempt.testId}`).emit('participant-flagged', {
          participantId,
          reason: 'Exceeded violation threshold',
        });
      }
    } catch (err) {
      logger.error('monitor violation failed', { err: err.message });
    }
  });

  // ── Auto-flag from client ──────────────────────────────────────────────
  socket.on('auto-flag', async ({ attemptId, participantId, reason }) => {
    try {
      const attempt = await MonitorAttempt.findByPk(attemptId);
      if (!attempt) return;

      attempt.flagged = true;
      await attempt.save();

      await MonitorViolation.create({
        attemptId,
        participantId,
        type: 'AUTO_FLAG',
        metadata: { reason },
      });

      io.to(`trainer_${attempt.testId}`).emit('participant-flagged', {
        participantId,
        reason: reason || 'Auto-flagged by client',
      });
    } catch (err) {
      logger.error('monitor auto-flag failed', { err: err.message });
    }
  });

  // ── Trainer sends warning to participant ───────────────────────────────
  socket.on('send-trainer-warning', async ({ attemptId, message }) => {
    try {
      if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) return;

      const attempt = await MonitorAttempt.findByPk(attemptId);
      if (!attempt) return;

      await MonitorViolation.create({
        attemptId,
        participantId: attempt.participantId,
        type: 'TRAINER_WARNING',
        metadata: { message },
      });

      io.to(`participant_${attemptId}`).emit('trainer-warning', { message });
      io.to(`trainer_${attempt.testId}`).emit('violation', {
        participantId: attempt.participantId,
        type: 'TRAINER_WARNING',
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error('monitor send-trainer-warning failed', { err: err.message });
    }
  });

  // ── Trainer force-submits participant ──────────────────────────────────
  socket.on('force-submit', async ({ attemptId, reason }) => {
    try {
      if (!['TRAINER', 'ADMIN'].includes(socket.userRole)) return;

      const attempt = await MonitorAttempt.findByPk(attemptId);
      if (!attempt) return;

      attempt.status = 'submitted';
      attempt.submittedAt = new Date();
      attempt.autoSubmitted = true;
      await attempt.save();

      io.to(`participant_${attemptId}`).emit('force-submit', { reason: reason || 'Force submitted by trainer' });
      io.to(`trainer_${attempt.testId}`).emit('test-submitted', {
        participantId: attempt.participantId,
        score: attempt.score,
        submittedAt: attempt.submittedAt,
        autoSubmitted: true,
      });
    } catch (err) {
      logger.error('monitor force-submit failed', { err: err.message });
    }
  });

  // ── Participant leaves session ─────────────────────────────────────────
  socket.on('leave-session', ({ participantId, attemptId }) => {
    try {
      if (attemptId) socket.leave(`participant_${attemptId}`);
      logger.info('monitor:leave-session', { socketId: socket.id, participantId, attemptId });
    } catch (err) {
      logger.error('monitor leave-session failed', { err: err.message });
    }
  });

  // ── Cleanup on disconnect ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    // No-op: rooms are cleaned up automatically.
  });
};
