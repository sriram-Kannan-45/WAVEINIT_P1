const express = require('express');
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Get paginated notifications (supports ?page=&limit=&unreadOnly=&category=&type=)
router.get('/', authenticateToken, notificationController.getNotifications);
router.get('/my', authenticateToken, notificationController.getMyNotifications);

// Get unread notification count
router.get('/unread-count', authenticateToken, notificationController.getUnreadCount);
router.get('/unread/count', authenticateToken, notificationController.getUnreadCount);

// Mark specific notification as read (supports both PUT and POST)
router.put('/:id/read', authenticateToken, notificationController.markAsRead);
router.post('/:id/read', authenticateToken, notificationController.markAsRead);

// Mark all notifications as read (supports both PUT and POST)
router.put('/read-all', authenticateToken, notificationController.markAllAsRead);
router.post('/read-all', authenticateToken, notificationController.markAllAsRead);

// Delete notification
router.delete('/:id', authenticateToken, notificationController.deleteNotification);

// Admin Broadcast Announcements
router.post('/broadcast-announcement', authenticateToken, notificationController.broadcastAnnouncement);
router.post('/announcement', authenticateToken, notificationController.broadcastAnnouncement);

module.exports = router;
