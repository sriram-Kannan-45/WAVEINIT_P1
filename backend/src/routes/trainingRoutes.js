const express = require('express');
const trainingController = require('../controllers/trainingController');
const authenticateToken = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');

const router = express.Router();

// GET /api/trainings - Public, but auth optional (shows isEnrolled if logged in)
router.get('/', optionalAuth, (req, res) => trainingController.getAllTrainings(req, res));

// GET /api/trainings/:id - Public
router.get('/:id', (req, res) => trainingController.getTrainingById(req, res));

// POST /api/trainings - Admin only (create training)
router.post('/', authenticateToken, (req, res) => trainingController.createTraining(req, res));

// PUT /api/trainings/:id - Admin only
router.put('/:id', authenticateToken, (req, res) => trainingController.updateTraining(req, res));

// DELETE /api/trainings/:id - Admin only
router.delete('/:id', authenticateToken, (req, res) => trainingController.deleteTraining(req, res));

// GET /api/trainings/:id/quizzes (also handles /api/training/:id/quizzes)
router.get('/:id/quizzes', authenticateToken, async (req, res) => {
  try {
    const trainingId = req.params.id;
    const { AIQuiz, Course, Training } = require('../models');
    const { Op } = require('sequelize');

    const quizzes = await AIQuiz.findAll({
      where: {
        [Op.or]: [
          { trainingId },
          { '$course.training_program_id$': trainingId }
        ]
      },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title', 'trainingProgramId'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json({ success: true, quizzes });
  } catch (error) {
    console.error('Error fetching training quizzes:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;