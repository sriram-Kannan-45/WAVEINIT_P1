const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const authenticateToken = require('../middleware/auth');

// Streaming ticket generation (requires authentication)
router.post('/ticket', authenticateToken, fileController.getFileStreamingTicket);

// Secure file delivery (handles its own auth via header, cookie, or ticket)
router.get('/:category/*', fileController.getFile);
router.get('/:category', fileController.getFile);

module.exports = router;
