/**
 * Interview Notification Service
 * Sends in-app notifications for interview lifecycle events.
 * Socket emission is best-effort — notifications are always persisted to DB.
 */

const { Notification } = require('../models');
const logger = require('../utils/logger');

let _io = null;

class InterviewNotificationService {
  /**
   * Set the Socket.IO instance (called from app.js after server init).
   */
  setIo(ioInstance) {
    _io = ioInstance;
  }

  /**
   * Notify both candidate and interviewer when an interview is created.
   */
  async notifyCreated(interview) {
    const candidateMsg = `You have a new interview scheduled on ${new Date(interview.scheduled_at).toLocaleString()} (${interview.type})`;
    const interviewerMsg = `You have been assigned an interview on ${new Date(interview.scheduled_at).toLocaleString()} (${interview.type})`;

    await Promise.all([
      this._createNotification(interview.candidate_id, 'INTERVIEW_CREATED', 'Interview Scheduled', candidateMsg, { interviewId: interview.id }),
      this._createNotification(interview.interviewer_id, 'INTERVIEW_CREATED', 'Interview Assigned', interviewerMsg, { interviewId: interview.id }),
    ]);

    logger.info('Interview creation notifications sent', { interviewId: interview.id });
  }

  /**
   * Send reminder notifications T-30 min before interview.
   */
  async notifyReminder(interview) {
    const msg = `Your interview starts in 30 minutes. Please prepare to join.`;

    await Promise.all([
      this._createNotification(interview.candidate_id, 'INTERVIEW_REMINDER', 'Interview Reminder', msg, { interviewId: interview.id }),
      this._createNotification(interview.interviewer_id, 'INTERVIEW_REMINDER', 'Interview Reminder', msg, { interviewId: interview.id }),
    ]);

    logger.info('Interview reminder notifications sent', { interviewId: interview.id });
  }

  /**
   * Notify both parties when an interview is rescheduled.
   */
  async notifyRescheduled(interview, oldDate) {
    const newDate = new Date(interview.scheduled_at).toLocaleString();
    const msg = `Interview rescheduled from ${new Date(oldDate).toLocaleString()} to ${newDate}`;

    await Promise.all([
      this._createNotification(interview.candidate_id, 'INTERVIEW_RESCHEDULED', 'Interview Rescheduled', msg, { interviewId: interview.id }),
      this._createNotification(interview.interviewer_id, 'INTERVIEW_RESCHEDULED', 'Interview Rescheduled', msg, { interviewId: interview.id }),
    ]);

    logger.info('Interview reschedule notifications sent', { interviewId: interview.id });
  }

  /**
   * Notify both parties when an interview is cancelled.
   */
  async notifyCancelled(interview) {
    const msg = `Interview scheduled on ${new Date(interview.scheduled_at).toLocaleString()} has been cancelled.`;

    await Promise.all([
      this._createNotification(interview.candidate_id, 'INTERVIEW_CANCELLED', 'Interview Cancelled', msg, { interviewId: interview.id }),
      this._createNotification(interview.interviewer_id, 'INTERVIEW_CANCELLED', 'Interview Cancelled', msg, { interviewId: interview.id }),
    ]);

    logger.info('Interview cancellation notifications sent', { interviewId: interview.id });
  }

  /**
   * Schedule a reminder for T-30 min before the interview.
   */
  scheduleReminder(interview) {
    const interviewTime = new Date(interview.scheduled_at).getTime();
    const reminderTime = interviewTime - 30 * 60 * 1000;
    const delay = reminderTime - Date.now();

    if (delay > 0) {
      setTimeout(() => {
        this.notifyReminder(interview).catch(err => {
          logger.error('Failed to send interview reminder', { error: err.message });
        });
      }, delay);
      logger.info('Interview reminder scheduled', { interviewId: interview.id, delayMs: delay });
    }
  }

  /**
   * Create a notification record and emit via socket if available.
   */
  async _createNotification(userId, type, title, message, data = {}) {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      data: JSON.stringify(data),
      read: false,
    });

    // Best-effort socket emission — no circular deps
    if (_io) {
      try {
        _io.to(`user_${userId}`).emit('notification:new', {
          id: notification.id,
          type,
          title,
          message,
          data,
          createdAt: notification.createdAt,
        });
      } catch (_) {
        // Socket emission failed — notification is still in DB
      }
    }

    return notification;
  }
}

module.exports = new InterviewNotificationService();
