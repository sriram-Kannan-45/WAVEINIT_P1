const { SurveyQuestion } = require('../models');
const { Op } = require('sequelize');

const getQuestions = async (req, res) => {
  try {
    const { trainingId } = req.query;
    let where = {};
    
    if (trainingId) {
      // Get global questions (trainingId = null) AND training-specific questions
      where = {
        [Op.or]: [
          { trainingId: null },
          { trainingId: trainingId }
        ]
      };
    } else {
      // Only global questions
      where.trainingId = null;
    }

    const questions = await SurveyQuestion.findAll({ where });
    res.json({ questions });
  } catch (error) {
    console.error('Get questions error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const getQuestionsByTraining = async (req, res) => {
  try {
    const { trainingId } = req.params;
    
    if (!trainingId) {
      return res.status(400).json({ error: 'Training ID is required' });
    }

    // Get global questions (trainingId = null) AND training-specific questions
    const questions = await SurveyQuestion.findAll({
      where: {
        [require('sequelize').Op.or]: [
          { trainingId: null },
          { trainingId: trainingId }
        ]
      }
    });
    
    res.json({ questions });
  } catch (error) {
    console.error('Get questions by training error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const createQuestion = async (req, res) => {
  try {
    const { trainingId, questionText, questionType, options } = req.body;
    const q = await SurveyQuestion.create({
      trainingId: trainingId || null,
      questionText,
      questionType: questionType || 'TEXT',
      options: options || null
    });
    res.status(201).json({ message: 'Question created', question: q });
  } catch (error) {
    console.error('Create question error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    await SurveyQuestion.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Delete question error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getQuestions,
  getQuestionsByTraining,
  createQuestion,
  deleteQuestion
};
