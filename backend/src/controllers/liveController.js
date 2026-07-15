const { LiveSession, Attendance, User, Training } = require('../models');
const { v4: uuidv4 } = require('uuid');

const createSession = async (req, res) => {
  try {
    const { title, description, trainingId, maxParticipants } = req.body;
    const trainerId = req.user.id;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const roomId = uuidv4();

    const session = await LiveSession.create({
      title,
      description,
      trainerId,
      trainingId: trainingId || null,
      roomId,
      maxParticipants: maxParticipants || 50,
      status: 'scheduled'
    });

    res.status(201).json({
      success: true,
      message: 'Live session created successfully',
      data: session
    });
  } catch (error) {
    console.error('Create Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create live session',
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};

const getTrainerSessions = async (req, res) => {
  try {
    const sessions = await LiveSession.findAll({
      where: { trainerId: req.user.id },
      include: [{ model: Training, as: 'training', attributes: ['title'] }],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getParticipantSessions = async (req, res) => {
  try {
    // Basic implementation: fetch all active/scheduled sessions
    // In a real app, this would be filtered by user's enrolled courses
    const sessions = await LiveSession.findAll({
      where: { status: ['scheduled', 'live'] },
      include: [
        { model: User, as: 'trainer', attributes: ['name'] },
        { model: Training, as: 'training', attributes: ['title'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSessionDetails = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const session = await LiveSession.findOne({
      where: { roomId },
      include: [
        { model: User, as: 'trainer', attributes: ['id', 'name'] },
        { model: Training, as: 'training', attributes: ['title'] }
      ]
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createSession,
  getTrainerSessions,
  getParticipantSessions,
  getSessionDetails
};
