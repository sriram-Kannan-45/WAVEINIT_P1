/**
 * Interview Notification Service
 * Sends in-app notifications for interview lifecycle events.
 * Notifications and socket emissions are best-effort and non-blocking.
 */

const { Notification } = require('../models');
const logger = require('../utils/logger');

let _io = null;

class InterviewNotificationService {
  async candidateIds(interview) {
    if(interview.mode!=='GROUP_DISCUSSION')return [interview.candidate_id];
    const members=await require('../models').InterviewParticipant.findAll({where:{interview_id:interview.id},attributes:['user_id']});
    return members.map(p=>p.user_id);
  }

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
    try {
      const scheduledDateStr = interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : '';
      const candidateMsg = `Interview Scheduled: You have a new interview scheduled on ${scheduledDateStr} (${interview.type || 'Technical'})`;
      const interviewerMsg = `Interview Assigned: You have been assigned an interview on ${scheduledDateStr} (${interview.type || 'Technical'})`;

      await Promise.allSettled([
        ...(await this.candidateIds(interview)).map(id=>this._createNotification(id,candidateMsg,{interviewId:interview.id})),
        this._createNotification(interview.interviewer_id, interviewerMsg, { interviewId: interview.id }),
      ]);

      logger.info('Interview creation notifications sent', { interviewId: interview.id });
    } catch (err) {
      logger.warn('Failed to send interview created notification', { error: err.message, interviewId: interview?.id });
    }
  }

  /**
   * Send reminder notifications T-30 min before interview.
   */
  async notifyReminder(interview) {
    try {
      const msg = `Interview Reminder: Your interview starts in 30 minutes. Please prepare to join.`;

      await Promise.allSettled([
        ...(await this.candidateIds(interview)).map(id=>this._createNotification(id,msg,{interviewId:interview.id})),
        this._createNotification(interview.interviewer_id, msg, { interviewId: interview.id }),
      ]);

      logger.info('Interview reminder notifications sent', { interviewId: interview.id });
    } catch (err) {
      logger.warn('Failed to send interview reminder notification', { error: err.message, interviewId: interview?.id });
    }
  }

  /**
   * Notify both parties when an interview is rescheduled.
   */
  async notifyRescheduled(interview, oldDate) {
    try {
      const newDate = interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : '';
      const oldDateStr = oldDate ? new Date(oldDate).toLocaleString() : '';
      const msg = `Interview Rescheduled: Interview changed from ${oldDateStr} to ${newDate}`;

      await Promise.allSettled([
        ...(await this.candidateIds(interview)).map(id=>this._createNotification(id,msg,{interviewId:interview.id})),
        this._createNotification(interview.interviewer_id, msg, { interviewId: interview.id }),
      ]);

      logger.info('Interview reschedule notifications sent', { interviewId: interview.id });
    } catch (err) {
      logger.warn('Failed to send interview reschedule notification', { error: err.message, interviewId: interview?.id });
    }
  }

  /**
   * Notify both parties when an interview is cancelled.
   */
  async notifyCancelled(interview) {
    try {
      const scheduledDateStr = interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : '';
      const msg = `Interview Cancelled: Interview scheduled on ${scheduledDateStr} has been cancelled.`;

      await Promise.allSettled([
        ...(await this.candidateIds(interview)).map(id=>this._createNotification(id,msg,{interviewId:interview.id})),
        this._createNotification(interview.interviewer_id, msg, { interviewId: interview.id }),
      ]);

      logger.info('Interview cancellation notifications sent', { interviewId: interview.id });
    } catch (err) {
      logger.warn('Failed to send interview cancellation notification', { error: err.message, interviewId: interview?.id });
    }
  }

  /**
   * Notify candidate when their interview result is published.
   */
  async notifyResultPublished(interview, decision) {
    try {
      const msg = `Interview Result Published: Your interview result for ${interview.type || 'Interview'} has been published: ${decision}.`;

      await this._createNotification(
        interview.candidate_id,
        msg,
        { interviewId: interview.id, decision }
      );

      logger.info('Interview result published notification sent', { interviewId: interview.id, candidateId: interview.candidate_id });
    } catch (err) {
      logger.warn('Failed to send interview result notification', { error: err.message, interviewId: interview?.id });
    }
  }

  /**
   * Schedule a reminder for T-30 min before the interview.
   */
  scheduleReminder(interview) {
    try {
      const interviewTime = new Date(interview.scheduled_at).getTime();
      const reminderTime = interviewTime - 30 * 60 * 1000;
      const delay = reminderTime - Date.now();

      if (delay > 0) {
        setTimeout(() => {
          this.notifyReminder(interview).catch(err => {
            logger.warn('Failed to send interview reminder', { error: err.message });
          });
        }, delay);
        logger.info('Interview reminder scheduled', { interviewId: interview.id, delayMs: delay });
      }
    } catch (err) {
      logger.warn('Failed to schedule interview reminder', { error: err.message, interviewId: interview?.id });
    }
  }

  /**
   * Create a notification record and emit via socket if available.
   * Matches the Notification model schema:
   * { userId, message, type: 'OTHER', isRead: false, actionUrl, relatedEntityId, relatedEntityType }
   */
  async _createNotification(userId, message, data = {}) {
    if (!userId) return null;

    try {
      const actionUrl = data?.interviewId ? `/interview/${data.interviewId}${data.decision?'':'/room'}` : '/interviews';
      const notification = await Notification.create({
        userId,
        message,
        type: 'OTHER',
        isRead: false,
        actionUrl,
        relatedEntityId: data?.interviewId || null,
        relatedEntityType: 'INTERVIEW',
      });

      // Best-effort socket emission
      if (_io) {
        try {
          _io.to(`user_${userId}`).emit('notification:new', {
            id: notification.id,
            userId,
            message: notification.message,
            type: notification.type,
            isRead: notification.isRead,
            createdAt: notification.created_at || new Date(),
            actionUrl: notification.actionUrl,
            data,
          });
        } catch (_) {
          // Socket emission failed — notification is already in DB
        }
      }

      return notification;
    } catch (err) {
      logger.warn('Notification creation error (ignored)', { error: err.message, userId });
      return null;
    }
  }
}

module.exports = new InterviewNotificationService();
