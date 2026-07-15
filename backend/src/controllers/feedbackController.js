const { Feedback, Enrollment, Training, User, SurveyAnswer, Notification } = require('../models');
const ActivityService = require('../services/activityService');

const submitFeedback = async (req, res) => {
  try {
    console.log("Feedback request:", req.body);
    const participantId = req.user.id;
    const { trainingId, trainerRating, subjectRating, comments, anonymous, surveyAnswers } = req.body;

    if (!trainingId || !trainerRating || !subjectRating) {
      return res.status(400).json({ error: 'Training ID and both ratings are required' });
    }

    if (trainerRating < 1 || trainerRating > 5 || subjectRating < 1 || subjectRating > 5) {
      return res.status(400).json({ error: 'Ratings must be between 1 and 5' });
    }

    const training = await Training.findByPk(trainingId);
    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Allow feedback during or after training
    const now = new Date();
    const startDate = new Date(training.startDate);
    
    if (now < startDate) {
      return res.status(400).json({ error: 'Feedback not allowed before training starts' });
    }

    const enrollment = await Enrollment.findOne({
      where: { participantId, trainingId, status: 'ENROLLED' }
    });
    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this training' });
    }

    const existingFeedback = await Feedback.findOne({
      where: { participantId, trainingId }
    });
    if (existingFeedback) {
      return res.status(400).json({ error: 'Feedback already submitted' });
    }

    const feedback = await Feedback.create({
      participantId: req.user.id,
      trainingId,
      trainerRating,
      subjectRating,
      comments: comments || null,
      anonymous: anonymous || false
    });
    console.log("Saved feedback:", feedback);

    try {
      if (surveyAnswers && surveyAnswers.length > 0) {
        const answersData = surveyAnswers.map(ans => ({
          feedbackId: feedback.id,
          questionId: ans.questionId,
          answerText: ans.answerText || null,
          answerRating: ans.answerRating || null
        }));
        await SurveyAnswer.bulkCreate(answersData);
      }

      // Notify Admins
      const admins = await User.findAll({ where: { role: 'ADMIN' } });
      const notifications = admins.map(a => ({
        userId: a.id,
        message: `New feedback submitted for training: ${training.title}`,
        isRead: false
      }));
      if (notifications.length > 0) {
        await Notification.bulkCreate(notifications);
      }

      // Notify Trainer
      if (training.trainerId) {
        await Notification.create({
          userId: training.trainerId,
          message: `You received new feedback for ${training.title}`,
          isRead: false
        });
      }

      // Log activity
      const io = req.app.get('io');
      const user = await User.findByPk(participantId);
      await ActivityService.logActivity({
        userId: participantId,
        userName: anonymous ? 'Anonymous' : (user?.name || 'Unknown'),
        action: 'FEEDBACK_SUBMITTED',
        entityType: 'Training',
        entityId: trainingId,
        details: { trainingName: training.title }
      }, io);
    } catch (extraErr) {
      console.error("Non-critical error adding survey/notifications:", extraErr.message);
    }

    res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (error) {
    console.error('Submit feedback error:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

const getTrainerFeedbacks = async (req, res) => {
  try {
    const trainerId = req.user.id;

    const trainings = await Training.findAll({
      where: { trainerId },
      attributes: ['id']
    });
    const trainingIds = trainings.map(t => t.id);

    const feedbacks = await Feedback.findAll({
      where: { trainingId: trainingIds },
      include: [{
        model: Training,
        as: 'training',
        attributes: ['id', 'title']
      }, {
        model: User,
        as: 'participant',
        attributes: ['id', 'name', 'email']
      }]
    });

    const formattedFeedbacks = feedbacks.map(f => ({
      id: f.id,
      trainingId: f.trainingId,
      trainingTitle: f.training?.title,
      trainerRating: f.trainerRating,
      subjectRating: f.subjectRating,
      comments: f.comments,
      anonymous: f.anonymous,
      trainerResponse: f.trainerResponse,
      participantId: f.participantId,
      participantName: f.anonymous ? 'Anonymous' : f.participant?.name,
      submittedAt: f.submitted_at
    }));

    res.json({ 
      success: true,
      feedbacks: formattedFeedbacks 
    });
  } catch (error) {
    console.error('Get trainer feedbacks error:', error.message);
    res.status(500).json({ success: false, error: 'Server error fetching feedbacks' });
  }
};

const getAdminFeedbacks = async (req, res) => {
  try {
    const { trainerId, trainingId, rating } = req.query;

    const where = {};
    if (trainingId) where.trainingId = trainingId;

    const feedbacks = await Feedback.findAll({
      where,
      include: [{
        model: Training,
        as: 'training',
        attributes: ['id', 'title', 'startDate', 'endDate'],
        include: [{
          model: User,
          as: 'trainer',
          attributes: ['id', 'name']
        }]
      }, {
        model: User,
        as: 'participant',
        attributes: ['id', 'name', 'email']
      }],
      order: [['submitted_at', 'DESC']]
    });

    let filtered = feedbacks;
    if (trainerId) {
      filtered = filtered.filter(f => f.training?.trainerId === parseInt(trainerId));
    }

    const formattedFeedbacks = filtered.map(f => ({
      id: f.id,
      trainingId: f.trainingId,
      trainingTitle: f.training?.title,
      trainerName: f.training?.trainer?.name || 'Unknown',
      trainerId: f.training?.trainerId,
      trainerRating: f.trainerRating,
      subjectRating: f.subjectRating,
      comments: f.comments,
      trainerResponse: f.trainerResponse,
      anonymous: f.anonymous,
      participantName: f.anonymous ? 'Anonymous' : f.participant?.name,
      submittedAt: f.submitted_at
    }));

    const avgTrainerRating = formattedFeedbacks.length > 0
      ? (formattedFeedbacks.reduce((sum, f) => sum + f.trainerRating, 0) / formattedFeedbacks.length).toFixed(1)
      : 0;
      
    const avgSubjectRating = formattedFeedbacks.length > 0
      ? (formattedFeedbacks.reduce((sum, f) => sum + f.subjectRating, 0) / formattedFeedbacks.length).toFixed(1)
      : 0;

    const avgRating = ((parseFloat(avgTrainerRating) + parseFloat(avgSubjectRating)) / 2).toFixed(1);

    res.json({
      summary: {
        totalResponses: formattedFeedbacks.length,
        averageTrainerRating: parseFloat(avgTrainerRating),
        averageSubjectRating: parseFloat(avgSubjectRating),
        overallRating: parseFloat(avgRating)
      },
      feedbacks: formattedFeedbacks
    });
  } catch (error) {
    console.error('Get admin feedbacks error:', error.message);
    res.status(500).json({ error: 'Server error fetching feedbacks' });
  }
};

const getParticipantFeedbacks = async (req, res) => {
  try {
    const participantId = req.user.id;

    const feedbacks = await Feedback.findAll({
      where: { participantId },
      include: [{
        model: Training,
        as: 'training',
        attributes: ['id', 'title']
      }]
    });

    const formattedFeedbacks = feedbacks.map(f => ({
      id: f.id,
      trainingId: f.trainingId,
      trainingTitle: f.training?.title,
      trainerRating: f.trainerRating,
      subjectRating: f.subjectRating,
      comments: f.comments,
      trainerResponse: f.trainerResponse,
      anonymous: f.anonymous,
      submittedAt: f.submitted_at || f.createdAt
    }));

    res.json({ feedbacks: formattedFeedbacks });
  } catch (error) {
    console.error('Get participant feedbacks error:', error.message);
    res.status(500).json({ error: 'Server error fetching feedbacks' });
  }
};

const replyToFeedback = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { id } = req.params;
    const { trainerResponse } = req.body;

    if (!trainerResponse || trainerResponse.trim() === '') {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const feedback = await Feedback.findByPk(id, {
      include: [{ model: Training, as: 'training' }]
    });

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    if (!feedback.training || parseInt(feedback.training.trainerId) !== parseInt(trainerId)) {
      return res.status(403).json({ error: 'Not authorized to reply to this feedback' });
    }

    await feedback.update({ trainerResponse });

    // Safely attempt to log activity without failing the main response
    try {
      const io = req.app.get('io');
      const user = await User.findByPk(trainerId);
      await ActivityService.logActivity({
        userId: trainerId,
        userName: user?.name || 'Unknown',
        action: 'FEEDBACK_REPLIED',
        entityType: 'Feedback',
        entityId: feedback.id,
        details: { trainingName: feedback.training?.title }
      }, io);
    } catch (activityErr) {
      console.error('Non-fatal error logging activity:', activityErr.message);
    }

    return res.status(200).json({ success: true, message: 'Reply saved' });
  } catch (error) {
    console.error('Reply feedback error:', error.message);
    return res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const updateFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { trainerRating, subjectRating, comments, anonymous } = req.body;
    const feedback = await Feedback.findByPk(id);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
    
    // Check if participant owns it
    if (feedback.participantId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await feedback.update({
      trainerRating: trainerRating || feedback.trainerRating,
      subjectRating: subjectRating || feedback.subjectRating,
      comments: comments !== undefined ? comments : feedback.comments,
      anonymous: anonymous !== undefined ? anonymous : feedback.anonymous
    });
    res.json({ message: 'Feedback updated successfully', feedback });
  } catch (error) {
    console.error('Update feedback error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findByPk(id);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
    
    await feedback.destroy();
    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Delete feedback error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  submitFeedback,
  getTrainerFeedbacks,
  getAdminFeedbacks,
  getParticipantFeedbacks,
  replyToFeedback,
  updateFeedback,
  deleteFeedback
};