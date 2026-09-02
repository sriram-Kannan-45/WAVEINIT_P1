/**
 * Notification Controller
 * Handles all notification-related API endpoints
 */

const { Notification, User } = require('../models');
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { parsePagination, formatPaginationMeta } = require('../utils/paginationHelper');

/**
 * GET /api/notifications - Get user notifications with filtering & pagination
 */
const getNotifications = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, 15, 100);
    const userId = req.user.id;
    const { unreadOnly, category, type } = req.query;

    const result = await NotificationService.getNotifications(userId, {
      limit,
      offset,
      unreadOnly: unreadOnly === 'true' || unreadOnly === true,
      category,
      type,
    });

    const total = result.count || 0;
    const paginationMeta = formatPaginationMeta(total, page, limit);

    res.json({
      success: true,
      data: result.notifications,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
      pagination: paginationMeta,
      total,
      page,
      limit,
      offset,
      totalPages: paginationMeta.totalPages,
    });
  } catch (error) {
    logger.error('[notificationController] Error fetching notifications:', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

/**
 * GET /api/notifications/unread-count or /api/notifications/unread/count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await NotificationService.getUnreadCount(userId);
    res.json({ success: true, unreadCount });
  } catch (error) {
    logger.error('[notificationController] Error fetching unread count:', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
};

/**
 * PUT /api/notifications/:id/read or POST /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const io = req.app?.get('io');

    const notification = await NotificationService.markAsRead(id, userId, io);
    res.json({ success: true, notification, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('[notificationController] Error marking notification as read:', { error: error.message });
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/notifications/read-all or POST /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const io = req.app?.get('io');

    const count = await NotificationService.markAllAsRead(userId, io);
    res.json({
      success: true,
      message: `${count} notification(s) marked as read`,
      count,
    });
  } catch (error) {
    logger.error('[notificationController] Error marking all notifications as read:', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
};

/**
 * DELETE /api/notifications/:id - Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deleted = await NotificationService.deleteNotification(id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('[notificationController] Error deleting notification:', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
};

/**
 * POST /api/notifications/broadcast-announcement (Admin only)
 * Targeted announcement broadcast
 */
const broadcastAnnouncement = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Only administrators can broadcast announcements' });
    }

    const { title, message, audience = 'ALL', courseId, trainingId, recipientUserId, priority = 'NORMAL', actionUrl } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' });
    }

    const io = req.app?.get('io');
    const notifBase = {
      actorUserId: req.user.id,
      type: NotificationService.TYPES.ANNOUNCEMENT,
      title: title.trim(),
      message: message.trim(),
      category: NotificationService.CATEGORIES.ANNOUNCEMENT,
      priority: priority.toUpperCase(),
      actionUrl: actionUrl || null,
      metadata: { audience, broadcastedBy: req.user.name },
    };

    let count = 0;
    if (audience === 'ALL') {
      const allUsers = await User.findAll({ attributes: ['id', 'role'] });
      const created = await NotificationService.notifyUsers(allUsers.map((u) => u.id), notifBase, io);
      count = created.length;
    } else if (audience === 'TRAINERS') {
      const created = await NotificationService.notifyRole('TRAINER', notifBase, io);
      count = created.length;
    } else if (audience === 'PARTICIPANTS') {
      const created = await NotificationService.notifyRole('PARTICIPANT', notifBase, io);
      count = created.length;
    } else if (audience === 'COURSE' && courseId) {
      const created = await NotificationService.notifyCourseParticipants(courseId, notifBase, io);
      count = created.length;
    } else if (audience === 'TRAINING' && trainingId) {
      const created = await NotificationService.notifyTrainingParticipants(trainingId, notifBase, io);
      count = created.length;
    } else if (audience === 'USER' && recipientUserId) {
      const created = await NotificationService.createNotification({ ...notifBase, userId: recipientUserId }, io);
      count = created ? 1 : 0;
    } else {
      return res.status(400).json({ success: false, error: 'Invalid audience target or missing courseId/trainingId' });
    }

    res.json({
      success: true,
      message: `Announcement delivered to ${count} recipient(s)`,
      count,
    });
  } catch (error) {
    logger.error('[notificationController] Error broadcasting announcement:', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/notifications/my (Legacy compatibility)
 */
const getMyNotifications = async (req, res) => {
  return getNotifications(req, res);
};

module.exports = {
  getNotifications,
  getUnreadCount,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  broadcastAnnouncement,
};
