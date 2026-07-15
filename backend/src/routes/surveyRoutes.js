const express = require('express');
const surveyController = require('../controllers/surveyController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();

// GET /api/survey - get all survey questions (admin sees all)
// GET /api/survey?trainingId=:id - get questions for specific training
router.get('/', authenticateToken, surveyController.getQuestions);

// GET /api/survey/:trainingId - get questions for specific training (participant uses this)
router.get('/:trainingId', authenticateToken, surveyController.getQuestionsByTraining);

router.post('/', authenticateToken, roleMiddleware('ADMIN'), surveyController.createQuestion);
router.delete('/:id', authenticateToken, roleMiddleware('ADMIN'), surveyController.deleteQuestion);

module.exports = router;
