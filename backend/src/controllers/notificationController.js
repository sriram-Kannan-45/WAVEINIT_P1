/**
 * Notification Controller
 * Handles all notification-related API endpoints
 */

const { Notification } = require('../models');
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

/**
 * GET /api/notifications - Get user notifications with pagination
 */
const getNotifications = async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;

    const result = await NotificationService.getNotifications(
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      data: result.notifications,
      unreadCount: result.unreadCount,
      total: result.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error('Error fetching notifications', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

/**
 * GET /api/notifications/unread - Get unread notifications count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await Notification.count({
      where: { userId, isRead: false },
    });

    res.json({ success: true, unreadCount });
  } catch (error) {
    logger.error('Error fetching unread count', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
};

/**
 * PUT /api/notifications/:id/read - Mark notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const io = req.app.get('io');

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await NotificationService.markAsRead(id, io);

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Error marking notification as read', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
};

/**
 * PUT /api/notifications/read-all - Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const io = req.app.get('io');

    const count = await NotificationService.markAllAsRead(userId, io);

    res.json({
      success: true,
      message: `${count} notifications marked as read`,
      count,
    });
  } catch (error) {
    logger.error('Error marking all notifications as read', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to mark all as read',
    });
  }
};

/**
 * DELETE /api/notifications/:id - Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await NotificationService.deleteNotification(id);

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('Error deleting notification', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
};

/**
 * POST /api/notifications/test - Test notification (development only)
 */
const testNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const io = req.app.get('io');

    const notification = await NotificationService.createNotification(
      {
        userId,
        message: 'This is a test notification',
        type: 'OTHER',
      },
      io
    );

    res.json({ success: true, notification });
  } catch (error) {
    logger.error('Error creating test notification', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create test notification',
    });
  }
};

/**
 * GET /api/notifications/my - Get my notifications (legacy endpoint)
 */
const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['created_at', 'DESC']]
    });
    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error.message);
    res.status(500).json({ error: 'Server error fetching notifications' });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  testNotification
};
