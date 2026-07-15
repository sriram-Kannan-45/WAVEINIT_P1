const express = require('express');
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Get all notifications with pagination
router.get('/', authenticateToken, notificationController.getNotifications);

// Get legacy endpoint
router.get('/my', authenticateToken, notificationController.getMyNotifications);

// Get unread count
router.get('/unread/count', authenticateToken, notificationController.getUnreadCount);

// Mark specific notification as read
router.put('/:id/read', authenticateToken, notificationController.markAsRead);

// Mark all notifications as read
router.put('/read-all', authenticateToken, notificationController.markAllAsRead);

// Delete notification
router.delete('/:id', authenticateToken, notificationController.deleteNotification);

// Test notification endpoint (development)
router.post('/test', authenticateToken, notificationController.testNotification);

module.exports = router;
