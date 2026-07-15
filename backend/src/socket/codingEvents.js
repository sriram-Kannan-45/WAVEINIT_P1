const logger = require('../utils/logger');

module.exports = (io, socket) => {
  socket.on('submission:subscribe', (data) => {
    const { submissionId } = data;
    if (!submissionId) return;
    socket.join(`submission_${submissionId}`);
    logger.debug(`Socket ${socket.id} subscribed to submission_${submissionId}`);
  });

  socket.on('submission:unsubscribe', (data) => {
    const { submissionId } = data;
    if (!submissionId) return;
    socket.leave(`submission_${submissionId}`);
  });

  socket.on('coding:join', (data) => {
    const { assessmentId, participantId } = data;
    if (participantId) {
      socket.join(`user_${participantId}`);
    }
    if (assessmentId) {
      socket.join(`coding_assessment_${assessmentId}`);
      logger.debug(`Socket ${socket.id} joined coding_assessment_${assessmentId}`);
    }
  });

  socket.on('coding:leave', (data) => {
    const { assessmentId } = data;
    if (assessmentId) {
      socket.leave(`coding_assessment_${assessmentId}`);
    }
  });
};
