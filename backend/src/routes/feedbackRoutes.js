const express = require('express');
const feedbackController = require('../controllers/feedbackController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();

router.use(authenticateToken);

// Participant routes
router.post('/', roleMiddleware('PARTICIPANT', 'ADMIN'), feedbackController.submitFeedback);
router.get('/my-feedbacks', roleMiddleware('PARTICIPANT'), feedbackController.getParticipantFeedbacks);
router.get('/participant-feedbacks', roleMiddleware('PARTICIPANT'), feedbackController.getParticipantFeedbacks);

// Trainer routes
router.get('/trainer-feedbacks', roleMiddleware('TRAINER', 'ADMIN'), feedbackController.getTrainerFeedbacks);
router.post('/:id/reply', roleMiddleware('TRAINER', 'ADMIN'), feedbackController.replyToFeedback);

// Admin routes
router.get('/admin-feedbacks', roleMiddleware('ADMIN'), feedbackController.getAdminFeedbacks);
router.get('/', roleMiddleware('ADMIN'), feedbackController.getAdminFeedbacks);

module.exports = router;