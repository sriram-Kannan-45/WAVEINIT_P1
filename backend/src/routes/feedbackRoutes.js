const express = require('express');
const { body } = require('express-validator');
const feedbackController = require('../controllers/feedbackController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  [
    body('trainingId').notEmpty().withMessage('Training ID is required'),
    body('trainerRating').isInt({ min: 1, max: 5 }).withMessage('Trainer rating must be between 1 and 5'),
    body('subjectRating').isInt({ min: 1, max: 5 }).withMessage('Subject rating must be between 1 and 5')
  ],
  (req, res) => feedbackController.submitFeedback(req, res)
);

router.get(
  '/',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => feedbackController.getAdminFeedbacks(req, res) // Use admin feedbaks as generic GET
);

router.get(
  '/my-feedbacks',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => feedbackController.getParticipantFeedbacks(req, res)
);

router.get(
  '/trainer-feedbacks',
  authenticateToken,
  roleMiddleware('TRAINER'),
  (req, res) => feedbackController.getTrainerFeedbacks(req, res)
);

router.get(
  '/admin-feedbacks',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => feedbackController.getAdminFeedbacks(req, res)
);

router.post(
  '/:id/reply',
  authenticateToken,
  roleMiddleware('TRAINER'),
  (req, res) => feedbackController.replyToFeedback(req, res)
);

router.put(
  '/:id',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => feedbackController.updateFeedback(req, res)
);

router.delete(
  '/:id',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => feedbackController.deleteFeedback(req, res)
);

module.exports = router;