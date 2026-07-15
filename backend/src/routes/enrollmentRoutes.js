const express = require('express');
const enrollmentController = require('../controllers/enrollmentController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();

// POST /api/participant/enroll
router.post(
  '/enroll',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => enrollmentController.enrollInTraining(req, res)
);

// GET /api/participant/enrollments  (spec says /enrollments)
router.get(
  '/enrollments',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => enrollmentController.getEnrollments(req, res)
);

// GET /api/participant/my-trainings  (legacy alias)
router.get(
  '/my-trainings',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => enrollmentController.getMyTrainings(req, res)
);

// DELETE /api/participant/enroll/:trainingId
router.delete(
  '/enroll/:trainingId',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => enrollmentController.cancelEnrollment(req, res)
);

// GET /api/participant/feedbacks
const feedbackController = require('../controllers/feedbackController');
router.get(
  '/feedbacks',
  authenticateToken,
  roleMiddleware('PARTICIPANT'),
  (req, res) => feedbackController.getParticipantFeedbacks(req, res)
);

module.exports = router;
