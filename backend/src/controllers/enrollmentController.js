const { Enrollment, Training, User, Feedback, Notification, Course, TrainingTrainerAssignment } = require('../models');
const ActivityService = require('../services/activityService');
const { Op } = require('sequelize');

const enrollInTraining = async (req, res) => {
  try {
    const participantId = req.user.id;
    const user = await User.findByPk(participantId);
    if (!user || user.status !== 'APPROVED') {
      return res.status(403).json({
        error: 'Your account must be approved by an administrator before enrolling in courses.'
      });
    }

    const { trainingId } = req.body;

    if (!trainingId) {
      return res.status(422).json({ error: 'Training ID is required' });
    }

    const training = await Training.findByPk(trainingId, {
      include: [{ model: User, as: 'trainer', attributes: ['name'] }]
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    let existingEnrollment = await Enrollment.findOne({
      where: { participantId, trainingId },
      order: [['id', 'DESC']]
    });

    if (existingEnrollment) {
      const currentStatus = (existingEnrollment.status || '').toUpperCase();
      if (['APPROVED', 'ENROLLED', 'COMPLETED'].includes(currentStatus)) {
        return res.status(409).json({ error: 'Already enrolled in this training' });
      }
      if (['PENDING_TRAINER_APPROVAL', 'PENDING'].includes(currentStatus)) {
        return res.status(409).json({ error: 'Enrollment request is already pending trainer approval' });
      }
      // Re-activate previously cancelled or rejected request
      existingEnrollment.status = 'PENDING_TRAINER_APPROVAL';
      existingEnrollment.progressPercent = 0;
      await existingEnrollment.save();
    }

    if (training.capacity) {
      const enrolledCount = await Enrollment.count({
        where: { trainingId, status: { [Op.in]: ['APPROVED', 'ENROLLED'] } }
      });
      if (enrolledCount >= training.capacity) {
        return res.status(400).json({ error: 'Training is full' });
      }
    }

    // Find corresponding Course for the training (or create if missing)
    let course = await Course.findOne({ where: { trainingProgramId: trainingId } });
    if (!course) {
      let trainerId = training.trainerId;
      if (!trainerId) {
        const assignment = await TrainingTrainerAssignment.findOne({ where: { trainingId } });
        trainerId = assignment ? assignment.trainerId : null;
      }
      if (!trainerId) {
        const anyTrainer = await User.findOne({ where: { role: 'TRAINER' }, order: [['id', 'ASC']] });
        trainerId = anyTrainer ? anyTrainer.id : 0;
      }
      course = await Course.create({
        trainingProgramId: trainingId,
        trainerId,
        title: training.title,
        description: training.description || null,
        status: 'PUBLISHED'
      });
    }

    if (!existingEnrollment) {
      existingEnrollment = await Enrollment.create({
        participantId,
        trainingId,
        courseId: course.id,
        status: 'PENDING_TRAINER_APPROVAL'
      });
    }

    const io = req.app.get('io');

    // Get all trainers for this training/course
    const { CourseTrainerAssignment } = require('../models');
    const assignments = await TrainingTrainerAssignment.findAll({ where: { trainingId } });
    const trainerIds = new Set(assignments.map(a => a.trainerId));
    if (training.trainerId) trainerIds.add(training.trainerId);

    // Also include trainers assigned to the corresponding course
    const courseAssignments = await CourseTrainerAssignment.findAll({ where: { courseId: course.id } });
    for (const ca of courseAssignments) {
      trainerIds.add(ca.trainerId);
    }

    const NotificationService = require('../services/notificationService');

    // Notify Trainers of pending request
    for (const tId of trainerIds) {
      await NotificationService.createNotification({
        userId: tId,
        message: `${user?.name || 'A participant'} has requested enrollment in training: ${training.title}. Please review and approve.`,
        type: 'ENROLLMENT',
        actionUrl: `/trainer`,
        relatedEntityId: existingEnrollment.id,
        relatedEntityType: 'Enrollment'
      }, io).catch(() => {});
    }

    // Notify Participant that request is pending
    await NotificationService.createNotification({
      userId: participantId,
      message: `Your enrollment request for training: ${training.title} has been submitted and is pending trainer approval.`,
      type: 'ENROLLMENT',
      actionUrl: `/participant`,
      relatedEntityId: existingEnrollment.id,
      relatedEntityType: 'Enrollment'
    }, io).catch(() => {});

    // Log activity
    await ActivityService.logActivity({
      userId: participantId,
      userName: user?.name || 'Unknown',
      action: 'ENROLLMENT_REQUESTED',
      entityType: 'Training',
      entityId: trainingId,
      details: { trainingName: training.title }
    }, io).catch(() => {});

    res.status(201).json({ message: 'Enrollment request submitted! Pending trainer approval.', enrollment: existingEnrollment });
  } catch (error) {
    console.error('Enroll error:', error.message);
    res.status(500).json({ error: 'Server error during enrollment' });
  }
};

// GET /api/participant/enrollments  - returns enrollment objects with training details
const getEnrollments = async (req, res) => {
  try {
    const participantId = req.user.id;

    const enrollments = await Enrollment.findAll({
      where: {
        participantId,
        status: { [Op.in]: ['APPROVED', 'ENROLLED', 'PENDING_TRAINER_APPROVAL', 'PENDING', 'COMPLETED', 'REJECTED'] }
      },
      include: [{
        model: Training,
        as: 'training',
        include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
      }]
    });

    const formattedEnrollments = enrollments.map(e => ({
      id: e.id,
      trainingId: e.training?.id,
      trainingTitle: e.training?.title,
      trainerName: e.training?.trainer?.name || 'TBA',
      startDate: e.training?.startDate,
      endDate: e.training?.endDate,
      capacity: e.training?.capacity,
      status: e.status,
      enrolledAt: e.enrolled_at || e.createdAt
    }));

    res.json({ enrollments: formattedEnrollments });
  } catch (error) {
    console.error('Get enrollments error:', error.message);
    res.status(500).json({ error: 'Server error fetching enrollments' });
  }
};

// Legacy: returns trainings array format
const getMyTrainings = async (req, res) => {
  try {
    const participantId = req.user.id;

    const enrollments = await Enrollment.findAll({
      where: {
        participantId,
        status: { [Op.in]: ['APPROVED', 'ENROLLED', 'PENDING_TRAINER_APPROVAL', 'PENDING', 'COMPLETED', 'REJECTED'] }
      },
      include: [{
        model: Training,
        as: 'training',
        include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
      }]
    });

    const myTrainings = enrollments.map(e => ({
      id: e.training?.id,
      title: e.training?.title,
      description: e.training?.description,
      startDate: e.training?.startDate,
      endDate: e.training?.endDate,
      capacity: e.training?.capacity,
      trainerId: e.training?.trainerId,
      trainerName: e.training?.trainer?.name || 'TBA',
      status: e.status,
      enrolledAt: e.enrolled_at || e.createdAt
    }));

    res.json({ trainings: myTrainings });
  } catch (error) {
    console.error('Get my trainings error:', error.message);
    res.status(500).json({ error: 'Server error fetching trainings' });
  }
};

const cancelEnrollment = async (req, res) => {
  try {
    const participantId = req.user.id;
    const { trainingId } = req.params;

    const enrollment = await Enrollment.findOne({
      where: {
        participantId,
        trainingId,
        status: { [Op.in]: ['APPROVED', 'ENROLLED', 'PENDING_TRAINER_APPROVAL', 'PENDING'] }
      }
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    enrollment.status = 'CANCELLED';
    await enrollment.save();

    const io = req.app.get('io');
    const user = await User.findByPk(participantId);
    const training = await Training.findByPk(trainingId);

    // Log activity
    await ActivityService.logActivity({
      userId: participantId,
      userName: user?.name || 'Unknown',
      action: 'ENROLLMENT_CANCELLED',
      entityType: 'Training',
      entityId: trainingId,
      details: { trainingName: training?.title }
    }, io).catch(() => {});

    res.json({ message: 'Enrollment cancelled successfully' });
  } catch (error) {
    console.error('Cancel enrollment error:', error.message);
    res.status(500).json({ error: 'Server error cancelling enrollment' });
  }
};

module.exports = {
  enrollInTraining,
  getEnrollments,
  getMyTrainings,
  cancelEnrollment
};