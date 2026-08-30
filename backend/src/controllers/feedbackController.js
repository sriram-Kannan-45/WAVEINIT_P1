const { Feedback, Enrollment, Training, Course, AIQuiz, User, Notification } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const ActivityService = require('../services/activityService');

/**
 * POST /api/feedback
 * Submit student feedback for Course, Trainer, Quiz, or General LMS
 */
const submitFeedback = async (req, res) => {
  try {
    const participantId = req.user.id;
    const {
      trainingId,
      courseId,
      quizId,
      assessmentId,
      feedbackType = 'COURSE',
      trainerRating,
      subjectRating,
      courseRating,
      comments,
      anonymous = false,
      surveyResponses = [],
    } = req.body;

    // Validation: At least one rating is required
    const ratingValue = courseRating || trainerRating || subjectRating;
    if (!ratingValue || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ success: false, error: 'A valid rating between 1 and 5 is required' });
    }

    // Determine target entity
    let targetTrainerId = null;
    let targetTitle = 'LMS';

    if (courseId) {
      const course = await Course.findByPk(courseId);
      if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
      targetTrainerId = course.trainerId;
      targetTitle = course.title;

      // Check enrollment
      const enrollment = await Enrollment.findOne({
        where: { participantId, courseId, status: { [Op.in]: ['ENROLLED', 'COMPLETED'] } }
      });
      if (!enrollment && req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'You must be enrolled in this course to submit feedback' });
      }

      // Check duplicate
      const existing = await Feedback.findOne({ where: { participantId, courseId } });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Feedback has already been submitted for this course' });
      }
    } else if (trainingId) {
      const training = await Training.findByPk(trainingId);
      if (!training) return res.status(404).json({ success: false, error: 'Training not found' });
      targetTrainerId = training.trainerId;
      targetTitle = training.title;

      const existing = await Feedback.findOne({ where: { participantId, trainingId } });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Feedback has already been submitted for this training' });
      }
    } else if (quizId) {
      const quiz = await AIQuiz.findByPk(quizId);
      if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
      targetTrainerId = quiz.trainerId;
      targetTitle = quiz.title;

      const existing = await Feedback.findOne({ where: { participantId, quizId } });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Feedback has already been submitted for this quiz' });
      }
    }

    const feedback = await Feedback.create({
      participantId,
      trainingId: trainingId || null,
      courseId: courseId || null,
      quizId: quizId || null,
      assessmentId: assessmentId || null,
      feedbackType,
      trainerRating: trainerRating || ratingValue,
      subjectRating: subjectRating || ratingValue,
      courseRating: courseRating || ratingValue,
      comments: comments ? comments.trim() : null,
      anonymous: !!anonymous,
      surveyResponses: Array.isArray(surveyResponses) ? surveyResponses : null,
    });

    // Notify trainer & admins
    try {
      const io = req.app.get('io');
      if (targetTrainerId) {
        await Notification.create({
          userId: targetTrainerId,
          message: `New feedback received for "${targetTitle}".`,
          type: 'FEEDBACK_REPLY',
          actionUrl: '/trainer?tab=feedbacks',
        });
      }
      const user = await User.findByPk(participantId);
      await ActivityService.logActivity({
        userId: participantId,
        userName: anonymous ? 'Anonymous' : (user?.name || 'Student'),
        action: 'FEEDBACK_SUBMITTED',
        entityType: feedbackType,
        entityId: courseId || trainingId || quizId,
        details: { targetTitle }
      }, io);
    } catch (_) {}

    res.status(201).json({ success: true, message: 'Feedback submitted successfully', feedback });
  } catch (error) {
    logger.error('Submit feedback error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
};

/**
 * GET /api/feedback/trainer-feedbacks
 * Trainer's feedback list with strict anonymity masking
 */
const getTrainerFeedbacks = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { courseId } = req.query;

    const where = {};
    if (courseId) {
      where.courseId = courseId;
    } else {
      // Find all courses / trainings owned by trainer
      const [courses, trainings] = await Promise.all([
        Course.findAll({ where: { trainerId }, attributes: ['id'] }),
        Training.findAll({ where: { trainerId }, attributes: ['id'] }),
      ]);
      const cIds = courses.map(c => c.id);
      const tIds = trainings.map(t => t.id);

      where[Op.or] = [
        ...(cIds.length > 0 ? [{ courseId: { [Op.in]: cIds } }] : []),
        ...(tIds.length > 0 ? [{ trainingId: { [Op.in]: tIds } }] : []),
      ];
    }

    const feedbacks = await Feedback.findAll({
      where,
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: User, as: 'participant', attributes: ['id', 'name', 'email', 'profilePic'] },
      ],
      order: [['submitted_at', 'DESC']],
    });

    // Mask personally identifiable information for anonymous submissions
    const formatted = feedbacks.map(f => {
      const isAnon = f.anonymous;
      return {
        id: f.id,
        courseId: f.courseId,
        courseTitle: f.course?.title || f.training?.title || 'Course',
        trainingId: f.trainingId,
        feedbackType: f.feedbackType,
        trainerRating: f.trainerRating,
        subjectRating: f.subjectRating,
        courseRating: f.courseRating,
        comments: f.comments,
        anonymous: isAnon,
        trainerResponse: f.trainerResponse,
        participantId: isAnon ? null : f.participantId,
        participantName: isAnon ? 'Anonymous Student' : f.participant?.name,
        participantAvatar: isAnon ? null : f.participant?.profilePic,
        surveyResponses: f.surveyResponses,
        submittedAt: f.submitted_at,
      };
    });

    // Compute rating statistics
    const totalResponses = formatted.length;
    const avgRating = totalResponses > 0
      ? Number((formatted.reduce((s, f) => s + (f.courseRating || f.trainerRating || 0), 0) / totalResponses).toFixed(1))
      : 5.0;

    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    formatted.forEach(f => {
      const r = Math.round(f.courseRating || f.trainerRating || 5);
      if (ratingDistribution[r] !== undefined) ratingDistribution[r]++;
    });

    res.json({
      success: true,
      summary: {
        totalResponses,
        averageRating: avgRating,
        ratingDistribution,
      },
      feedbacks: formatted,
    });
  } catch (error) {
    logger.error('Get trainer feedbacks error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch feedbacks' });
  }
};

/**
 * GET /api/feedback/admin-feedbacks
 * Comprehensive feedback overview for admins
 */
const getAdminFeedbacks = async (req, res) => {
  try {
    const { trainerId, courseId, rating } = req.query;
    const where = {};
    if (courseId) where.courseId = courseId;
    if (rating) where.courseRating = rating;

    const feedbacks = await Feedback.findAll({
      where,
      include: [
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'title', 'trainerId'],
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
        },
        {
          model: Training,
          as: 'training',
          attributes: ['id', 'title', 'trainerId'],
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
        },
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
      ],
      order: [['submitted_at', 'DESC']],
    });

    let filtered = feedbacks;
    if (trainerId) {
      filtered = filtered.filter(f =>
        f.course?.trainerId === parseInt(trainerId, 10) || f.training?.trainerId === parseInt(trainerId, 10)
      );
    }

    const formatted = filtered.map(f => ({
      id: f.id,
      courseId: f.courseId,
      courseTitle: f.course?.title || f.training?.title || 'General',
      trainerName: f.course?.trainer?.name || f.training?.trainer?.name || 'Trainer',
      trainerId: f.course?.trainerId || f.training?.trainerId,
      feedbackType: f.feedbackType,
      trainerRating: f.trainerRating,
      courseRating: f.courseRating,
      subjectRating: f.subjectRating,
      comments: f.comments,
      anonymous: f.anonymous,
      trainerResponse: f.trainerResponse,
      participantName: f.anonymous ? 'Anonymous' : f.participant?.name,
      participantEmail: f.anonymous ? null : f.participant?.email,
      submittedAt: f.submitted_at,
    }));

    const total = formatted.length;
    const avgRating = total > 0
      ? Number((formatted.reduce((s, f) => s + (f.courseRating || f.trainerRating || 0), 0) / total).toFixed(1))
      : 5.0;

    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    formatted.forEach(f => {
      const r = Math.round(f.courseRating || f.trainerRating || 5);
      if (ratingDistribution[r] !== undefined) ratingDistribution[r]++;
    });

    res.json({
      success: true,
      summary: {
        totalResponses: total,
        averageRating: avgRating,
        ratingDistribution,
      },
      feedbacks: formatted,
    });
  } catch (error) {
    logger.error('Get admin feedbacks error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch admin feedbacks' });
  }
};

/**
 * GET /api/feedback/participant-feedbacks
 * Student's submitted feedback history
 */
const getParticipantFeedbacks = async (req, res) => {
  try {
    const participantId = req.user.id;
    const feedbacks = await Feedback.findAll({
      where: { participantId },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] },
      ],
      order: [['submitted_at', 'DESC']],
    });

    const formatted = feedbacks.map(f => ({
      id: f.id,
      courseId: f.courseId,
      courseTitle: f.course?.title || f.training?.title || 'General',
      feedbackType: f.feedbackType,
      courseRating: f.courseRating || f.trainerRating,
      comments: f.comments,
      trainerResponse: f.trainerResponse,
      anonymous: f.anonymous,
      submittedAt: f.submitted_at,
    }));

    res.json({ success: true, feedbacks: formatted });
  } catch (error) {
    logger.error('Get participant feedbacks error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch feedbacks' });
  }
};

/**
 * POST /api/feedback/:id/reply
 * Trainer replies to feedback
 */
const replyToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { trainerResponse } = req.body;
    const trainerId = req.user.id;

    if (!trainerResponse || !trainerResponse.trim()) {
      return res.status(400).json({ success: false, error: 'Reply text is required' });
    }

    const feedback = await Feedback.findByPk(id, {
      include: [
        { model: Course, as: 'course' },
        { model: Training, as: 'training' }
      ]
    });

    if (!feedback) {
      return res.status(404).json({ success: false, error: 'Feedback not found' });
    }

    // Auth check
    if (req.user.role !== 'ADMIN') {
      const isOwner =
        feedback.course?.trainerId === trainerId || feedback.training?.trainerId === trainerId;
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Not authorized to reply to this feedback' });
      }
    }

    await feedback.update({ trainerResponse: trainerResponse.trim() });

    // Notify student if not anonymous
    if (!feedback.anonymous && feedback.participantId) {
      try {
        await Notification.create({
          userId: feedback.participantId,
          message: 'Your trainer responded to your feedback.',
          type: 'FEEDBACK_REPLY',
          actionUrl: '/participant?tab=feedback',
        });
      } catch (_) {}
    }

    res.json({ success: true, message: 'Reply saved successfully', feedback });
  } catch (error) {
    logger.error('Reply to feedback error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save reply' });
  }
};

module.exports = {
  submitFeedback,
  getTrainerFeedbacks,
  getAdminFeedbacks,
  getParticipantFeedbacks,
  replyToFeedback,
};