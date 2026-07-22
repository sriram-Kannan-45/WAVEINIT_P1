const { InterviewNotification } = require('../models');
let io = null;

const interviewNotificationService = {
  setSocketIO(socketIO) {
    io = socketIO;
  },

  async notify(interviewId, userId, type, message) {
    const notification = await InterviewNotification.create({
      interviewId, userId, type, message,
    });
    if (io) {
      io.to(`user_${userId}`).emit('notification:new', {
        id: notification.id,
        type,
        message,
        interviewId,
        createdAt: notification.createdAt,
      });
    }
    return notification;
  },

  async notifyMany(interviewId, userIds, type, message) {
    const results = [];
    for (const userId of userIds) {
      results.push(await this.notify(interviewId, userId, type, message));
    }
    return results;
  },
};

module.exports = interviewNotificationService;
