const { Enrollment, Training, User, Feedback, Notification, Course } = require('../models');
const ActivityService = require('../services/activityService');

const enrollInTraining = async (req, res) => {
  try {
    const participantId = req.user.id;
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

    const existingEnrollment = await Enrollment.findOne({
      where: { participantId, trainingId, status: 'ENROLLED' }
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Already enrolled in this training' });
    }

    if (training.capacity) {
      const enrolledCount = await Enrollment.count({
        where: { trainingId, status: 'ENROLLED' }
      });
      if (enrolledCount >= training.capacity) {
        return res.status(400).json({ error: 'Training is full' });
      }
    }

    // Find corresponding Course for the training (or create if missing)
    let course = await Course.findOne({ where: { trainingProgramId: trainingId } });
    if (!course) {
      course = await Course.create({
        trainingProgramId: trainingId,
        trainerId: training.trainerId || 0,
        title: training.title,
        description: training.description || null,
        status: 'PUBLISHED'
      });
    }

    const enrollment = await Enrollment.create({
      participantId,
      trainingId,
      courseId: course.id,
      status: 'ENROLLED'
    });

    const io = req.app.get('io');
    const user = await User.findByPk(participantId);

    // Get all trainers for this training/course
    const { TrainingTrainerAssignment, CourseTrainerAssignment } = require('../models');
    const assignments = await TrainingTrainerAssignment.findAll({ where: { trainingId } });
    const trainerIds = new Set(assignments.map(a => a.trainerId));
    if (training.trainerId) trainerIds.add(training.trainerId);

    // Also include trainers assigned to the corresponding course
    const courseAssignments = await CourseTrainerAssignment.findAll({ where: { courseId: course.id } });
    for (const ca of courseAssignments) {
      trainerIds.add(ca.trainerId);
    }

    const NotificationService = require('../services/notificationService');

    // Notify Trainers
    for (const tId of trainerIds) {
      await NotificationService.createNotification({
        userId: tId,
        message: `${user?.name || 'A participant'} has enrolled in training: ${training.title}`,
        type: 'ENROLLMENT',
        actionUrl: `/trainer`,
        relatedEntityId: enrollment.id,
        relatedEntityType: 'Enrollment'
      }, io);
    }

    // Notify Participant
    await NotificationService.createNotification({
      userId: participantId,
      message: `You have been enrolled in training: ${training.title}.`,
      type: 'ENROLLMENT',
      actionUrl: `/participant`,
      relatedEntityId: enrollment.id,
      relatedEntityType: 'Enrollment'
    }, io);

    // Log activity
    await ActivityService.logActivity({
      userId: participantId,
      userName: user?.name || 'Unknown',
      action: 'ENROLLMENT_DONE',
      entityType: 'Training',
      entityId: trainingId,
      details: { trainingName: training.title }
    }, io);

    res.status(201).json({ message: 'Enrolled successfully', enrollment });
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
      where: { participantId, status: 'ENROLLED' },
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
      where: { participantId, status: 'ENROLLED' },
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
      where: { participantId, trainingId, status: 'ENROLLED' }
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
    }, io);

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