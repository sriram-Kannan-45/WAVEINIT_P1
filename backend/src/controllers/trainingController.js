const { Training, User, Enrollment, Notification, TrainingTrainerAssignment, Course, CourseTrainerAssignment } = require('../models');
const { Op } = require('sequelize');

const createTraining = async (req, res) => {
  try {
    const { title, description, trainerId, trainerIds, startDate, endDate, capacity, sequentialLearning } = req.body;

    if (!title) return res.status(422).json({ error: 'Title is required' });
    if (!trainerId && (!trainerIds || trainerIds.length === 0)) {
      return res.status(422).json({ error: 'Trainer ID or Trainer IDs is required' });
    }
    if (!startDate || !endDate) return res.status(422).json({ error: 'Start and end dates are required' });

    let finalTrainerIds = [];
    if (Array.isArray(trainerIds)) {
      finalTrainerIds = trainerIds.map(id => parseInt(id));
    } else if (trainerId) {
      finalTrainerIds = [parseInt(trainerId)];
    }

    const trainers = await User.findAll({ where: { id: finalTrainerIds, role: 'TRAINER' } });
    if (trainers.length !== finalTrainerIds.length) {
      return res.status(400).json({ error: 'One or more trainer IDs are invalid' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) return res.status(422).json({ error: 'Invalid start date format' });
    if (isNaN(end.getTime())) return res.status(422).json({ error: 'Invalid end date format' });
    if (end <= start) return res.status(422).json({ error: 'End date must be after start date' });

    const primaryTrainerId = finalTrainerIds[0] || null;

    const training = await Training.create({
      title,
      description: description || null,
      trainerId: primaryTrainerId,
      startDate: start,
      endDate: end,
      capacity: capacity ? parseInt(capacity) : null,
      sequentialLearning: !!sequentialLearning,
      createdBy: req.user.id
    });

    // Create many-to-many trainer assignments
    const assignments = finalTrainerIds.map(tId => ({
      trainingId: training.id,
      trainerId: tId
    }));
    await TrainingTrainerAssignment.bulkCreate(assignments);

    // Automatically create a corresponding Course with 'PUBLISHED' status
    const course = await Course.create({
      trainingProgramId: training.id,
      trainerId: primaryTrainerId,
      title: training.title,
      description: training.description || null,
      status: 'PUBLISHED'
    });

    // Sync trainer assignments in CourseTrainerAssignment
    const courseAssignments = finalTrainerIds.map(tId => ({
      courseId: course.id,
      trainerId: tId
    }));
    await CourseTrainerAssignment.bulkCreate(courseAssignments);

    // Notify Trainers
    const io = req.app.get('io');
    for (const trainer of trainers) {
      await Notification.create({
        userId: trainer.id,
        message: `You have been assigned as the instructor for training: ${training.title}`,
        isRead: false
      });
      if (io) {
        io.to(`user_${trainer.id}`).emit('notification:new', {
          message: `You have been assigned as the instructor for training: ${training.title}`
        });
      }
    }

    console.log('✅ Training saved:', training.id, '-', training.title);

    res.status(201).json({
      id: training.id,
      title: training.title,
      description: training.description,
      trainerId: training.trainerId,
      trainerIds: finalTrainerIds,
      trainerName: trainers.map(t => t.name).join(', '),
      startDate: training.startDate,
      endDate: training.endDate,
      capacity: training.capacity,
      message: 'Training created successfully'
    });
  } catch (error) {
    console.error('Create training error:', error.message);
    res.status(500).json({ error: 'Server error creating training' });
  }
};

const getAllTrainings = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    console.log('📋 getAllTrainings called, user:', userId, 'role:', userRole);

    const trainings = await Training.findAll({
      include: [
        {
          model: User,
          as: 'trainer',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: TrainingTrainerAssignment,
          as: 'trainerAssignments',
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name', 'email'] }]
        }
      ],
      order: [['id', 'DESC']]
    });

    console.log('📋 Raw trainings from DB:', trainings.length);

    const formattedTrainings = await Promise.all(trainings.map(async t => {
      let enrolledCount = 0;
      try {
        enrolledCount = await Enrollment.count({
          where: { trainingId: t.id, status: 'ENROLLED' }
        });
      } catch (e) {
        console.error('Count error for training', t.id, e.message);
      }

      let isEnrolled = false;
      if (userId && userRole === 'PARTICIPANT') {
        try {
          const enrollment = await Enrollment.findOne({
            where: { participantId: userId, trainingId: t.id, status: 'ENROLLED' }
          });
          isEnrolled = !!enrollment;
        } catch (e) {
          console.error('Enrollment check error:', e.message);
        }
      }

      const assignedTrainers = (t.trainerAssignments || []).map(ta => ta.trainer).filter(Boolean);
      const trainerNames = assignedTrainers.length > 0 ? assignedTrainers.map(tr => tr.name).join(', ') : (t.trainer ? t.trainer.name : null);
      const trainerIds = assignedTrainers.length > 0 ? assignedTrainers.map(tr => tr.id) : (t.trainerId ? [t.trainerId] : []);

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        trainerId: t.trainerId,
        trainerIds,
        trainerName: trainerNames,
        trainerEmail: t.trainer ? t.trainer.email : null,
        startDate: t.startDate,
        endDate: t.endDate,
        capacity: t.capacity,
        enrolledCount,
        availableSeats: t.capacity ? (t.capacity - enrolledCount) : null,
        isEnrolled,
        isFull: t.capacity ? enrolledCount >= t.capacity : false,
        sequentialLearning: t.sequentialLearning || false
      };
    }));

    console.log('📋 Returning', formattedTrainings.length, 'trainings');
    res.json(formattedTrainings);
  } catch (error) {
    console.error('Get trainings error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error fetching trainings' });
  }
};

const getTrainingById = async (req, res) => {
  try {
    const { id } = req.params;

    const training = await Training.findByPk(id, {
      include: [
        { model: User, as: 'trainer', attributes: ['id', 'name', 'email'], required: false },
        {
          model: TrainingTrainerAssignment,
          as: 'trainerAssignments',
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name', 'email'] }]
        }
      ]
    });

    if (!training) return res.status(404).json({ error: 'Training not found' });

    const assignedTrainers = (training.trainerAssignments || []).map(ta => ta.trainer).filter(Boolean);
    const trainerNames = assignedTrainers.length > 0 ? assignedTrainers.map(tr => tr.name).join(', ') : (training.trainer ? training.trainer.name : null);
    const trainerIds = assignedTrainers.length > 0 ? assignedTrainers.map(tr => tr.id) : (training.trainerId ? [training.trainerId] : []);

    res.json({
      id: training.id,
      title: training.title,
      description: training.description,
      trainerId: training.trainerId,
      trainerIds,
      trainerName: trainerNames,
      startDate: training.startDate,
      endDate: training.endDate,
      capacity: training.capacity,
      sequentialLearning: training.sequentialLearning || false
    });
  } catch (error) {
    console.error('Get training by ID error:', error.message);
    res.status(500).json({ error: 'Server error fetching training' });
  }
};

const updateTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { title, description, trainerId, trainerIds, startDate, endDate, capacity, sequentialLearning } = req.body;

    const training = await Training.findByPk(id);
    if (!training) return res.status(404).json({ error: 'Training not found' });

    // Permissions check: ADMIN can update any; TRAINER can update if assigned
    if (userRole !== 'ADMIN') {
      if (userRole === 'TRAINER') {
        const isAssigned = await TrainingTrainerAssignment.findOne({
          where: { trainingId: id, trainerId: userId }
        });
        if (!isAssigned && training.trainerId !== userId) {
          return res.status(403).json({ error: 'You are not authorized to update this training' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    let finalTrainerIds = [];
    if (Array.isArray(trainerIds)) {
      finalTrainerIds = trainerIds.map(tId => parseInt(tId));
    } else if (trainerId) {
      finalTrainerIds = [parseInt(trainerId)];
    }

    if (finalTrainerIds.length > 0) {
      const trainers = await User.findAll({ where: { id: finalTrainerIds, role: 'TRAINER' } });
      if (trainers.length !== finalTrainerIds.length) {
        return res.status(400).json({ error: 'One or more trainer IDs are invalid or not trainers' });
      }

      await TrainingTrainerAssignment.destroy({ where: { trainingId: id } });
      const assignments = finalTrainerIds.map(tId => ({
        trainingId: id,
        trainerId: tId
      }));
      await TrainingTrainerAssignment.bulkCreate(assignments);
    }

    const primaryTrainerId = finalTrainerIds.length > 0 ? finalTrainerIds[0] : (trainerId ? parseInt(trainerId) : training.trainerId);

    await training.update({
      title: title || training.title,
      description: description !== undefined ? description : training.description,
      trainerId: primaryTrainerId,
      startDate: startDate ? new Date(startDate) : training.startDate,
      endDate: endDate ? new Date(endDate) : training.endDate,
      capacity: capacity !== undefined ? (capacity ? parseInt(capacity) : null) : training.capacity,
      sequentialLearning: sequentialLearning !== undefined ? !!sequentialLearning : training.sequentialLearning
    });

    // Automatically find/create/update corresponding Course
    let course = await Course.findOne({ where: { trainingProgramId: id } });
    if (!course) {
      course = await Course.create({
        trainingProgramId: id,
        trainerId: primaryTrainerId,
        title: title || training.title,
        description: description !== undefined ? description : training.description,
        status: 'PUBLISHED'
      });
    } else {
      await course.update({
        title: title || training.title,
        description: description !== undefined ? description : training.description,
        trainerId: primaryTrainerId
      });
    }

    // Sync CourseTrainerAssignment
    if (finalTrainerIds.length > 0) {
      await CourseTrainerAssignment.destroy({ where: { courseId: course.id } });
      const courseAssignments = finalTrainerIds.map(tId => ({
        courseId: course.id,
        trainerId: tId
      }));
      await CourseTrainerAssignment.bulkCreate(courseAssignments);
    }

    const updatedTraining = await Training.findByPk(id, {
      include: [
        { model: User, as: 'trainer', attributes: ['id', 'name'], required: false },
        {
          model: TrainingTrainerAssignment,
          as: 'trainerAssignments',
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
        }
      ]
    });

    const assignedTrainers = (updatedTraining.trainerAssignments || []).map(ta => ta.trainer).filter(Boolean);
    const trainerNames = assignedTrainers.length > 0 ? assignedTrainers.map(tr => tr.name).join(', ') : (updatedTraining.trainer ? updatedTraining.trainer.name : null);
    const resTrainerIds = assignedTrainers.length > 0 ? assignedTrainers.map(tr => tr.id) : (updatedTraining.trainerId ? [updatedTraining.trainerId] : []);

    res.json({
      message: 'Training updated successfully',
      training: {
        id: updatedTraining.id,
        title: updatedTraining.title,
        description: updatedTraining.description,
        trainerId: updatedTraining.trainerId,
        trainerIds: resTrainerIds,
        trainerName: trainerNames,
        startDate: updatedTraining.startDate,
        endDate: updatedTraining.endDate,
        capacity: updatedTraining.capacity,
        sequentialLearning: updatedTraining.sequentialLearning
      }
    });
  } catch (error) {
    console.error('Update training error:', error.message);
    res.status(500).json({ error: 'Server error updating training' });
  }
};

const deleteTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const {
      Certificate,
      Lesson,
      LessonMaterial,
      LessonQuiz,
      QuizProgress,
      LessonAssessment,
      AssessmentSubmission,
      LessonProgress,
      ParticipantTracking,
      AIQuiz,
      AIQuestion,
      QuizAttempt,
      QuizAnswer,
      QuizResult,
      AssessmentSession,
      ExamSession,
      Violation,
      ProctorActivity,
      Feedback,
      LiveSession,
      Note,
      AIDocument
    } = require('../models');

    const training = await Training.findByPk(id);
    if (!training) return res.status(404).json({ error: 'Training not found' });

    // Permissions check: ADMIN can delete any; TRAINER can delete if assigned
    if (userRole !== 'ADMIN') {
      if (userRole === 'TRAINER') {
        const isAssigned = await TrainingTrainerAssignment.findOne({
          where: { trainingId: id, trainerId: userId }
        });
        if (!isAssigned && training.trainerId !== userId) {
          return res.status(403).json({ error: 'You are not authorized to delete this training' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Find corresponding Course
    const course = await Course.findOne({ where: { trainingProgramId: id } });
    if (course) {
      // 1. CourseTrainerAssignment
      await CourseTrainerAssignment.destroy({ where: { courseId: course.id } });

      // 2. Certificate
      await Certificate.destroy({ where: { courseId: course.id } });

      // 3. Enrollment (course-scoped)
      await Enrollment.destroy({ where: { courseId: course.id } });

      // 4. Lessons & their child models
      const lessons = await Lesson.findAll({ where: { courseId: course.id } });
      const lessonIds = lessons.map(l => l.id);
      if (lessonIds.length > 0) {
        // LessonMaterial
        await LessonMaterial.destroy({ where: { lessonId: lessonIds } });

        // LessonQuiz & QuizProgress
        const lessonQuizzes = await LessonQuiz.findAll({ where: { lessonId: lessonIds } });
        const lessonQuizIds = lessonQuizzes.map(lq => lq.id);
        if (lessonQuizIds.length > 0) {
          await QuizProgress.destroy({ where: { lessonQuizId: lessonQuizIds } });
          await LessonQuiz.destroy({ where: { id: lessonQuizIds } });
        }

        // LessonAssessment & AssessmentSubmission
        const lessonAssessments = await LessonAssessment.findAll({ where: { lessonId: lessonIds } });
        const assessmentIds = lessonAssessments.map(la => la.id);
        if (assessmentIds.length > 0) {
          await AssessmentSubmission.destroy({ where: { assessmentId: assessmentIds } });
          await LessonAssessment.destroy({ where: { id: assessmentIds } });
        }

        // LessonProgress
        await LessonProgress.destroy({ where: { lessonId: lessonIds } });

        // ParticipantTracking
        await ParticipantTracking.destroy({ where: { lessonId: lessonIds } });
      }

      // 5. AIQuiz & its attempts/questions/sessions/results
      const quizzes = await AIQuiz.findAll({ where: { courseId: course.id } });
      const quizIds = quizzes.map(q => q.id);
      if (quizIds.length > 0) {
        // AIQuestion
        await AIQuestion.destroy({ where: { quizId: quizIds } });

        // QuizAttempt & answers/results/sessions
        const attempts = await QuizAttempt.findAll({ where: { quizId: quizIds } });
        const attemptIds = attempts.map(a => a.id);
        if (attemptIds.length > 0) {
          await QuizAnswer.destroy({ where: { attemptId: attemptIds } });
          await QuizResult.destroy({ where: { attemptId: attemptIds } });
          await AssessmentSession.destroy({ where: { attemptId: attemptIds } });
          
          const examSessions = await ExamSession.findAll({ where: { attemptId: attemptIds } });
          const sessionIds = examSessions.map(es => es.id);
          if (sessionIds.length > 0) {
            await Violation.destroy({ where: { sessionId: sessionIds } });
            await ProctorActivity.destroy({ where: { sessionId: sessionIds } });
            await ExamSession.destroy({ where: { id: sessionIds } });
          }
          await QuizAttempt.destroy({ where: { id: attemptIds } });
        }

        // Direct QuizResult, AssessmentSession, ExamSession
        await QuizResult.destroy({ where: { quizId: quizIds } });
        await AssessmentSession.destroy({ where: { quizId: quizIds } });
        
        const directExamSessions = await ExamSession.findAll({ where: { quizId: quizIds } });
        const directSessionIds = directExamSessions.map(es => es.id);
        if (directSessionIds.length > 0) {
          await Violation.destroy({ where: { sessionId: directSessionIds } });
          await ProctorActivity.destroy({ where: { sessionId: directSessionIds } });
          await ExamSession.destroy({ where: { id: directSessionIds } });
        }

        await AIQuiz.destroy({ where: { id: quizIds } });
      }

      // 6. Lessons themselves
      if (lessonIds.length > 0) {
        await Lesson.destroy({ where: { id: lessonIds } });
      }

      // 8. Finally, destroy the Course
      await Course.destroy({ where: { id: course.id } });
    }

    // 9. Legacy / Training-scoped child models
    await Feedback.destroy({ where: { trainingId: id } });
    await Enrollment.destroy({ where: { trainingId: id } });
    await LiveSession.destroy({ where: { trainingId: id } });
    await Note.destroy({ where: { trainingId: id } });
    await AIDocument.destroy({ where: { trainingId: id } });
    await TrainingTrainerAssignment.destroy({ where: { trainingId: id } });

    // 10. Destroy the training itself
    await Training.destroy({ where: { id } });

    res.json({ message: 'Training deleted successfully' });
  } catch (error) {
    console.error('Delete training error:', error.message);
    res.status(500).json({ error: 'Server error deleting training' });
  }
};

module.exports = { createTraining, getAllTrainings, getTrainingById, updateTraining, deleteTraining };