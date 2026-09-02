const { Training, User, Enrollment, Notification, TrainingTrainerAssignment, Course, CourseTrainerAssignment } = require('../models');
const { Op } = require('sequelize');
const { ensureTrainingAttendanceSessions } = require('../services/attendanceAutomationService');
const { calculateTrainingCompletion, batchCalculateTrainingsCompletion } = require('../services/trainingProgressService');
const { parsePagination, formatPaginationMeta, formatPaginatedResponse } = require('../utils/paginationHelper');
const cacheService = require('../services/cacheService');

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

    const trainers = await User.findAll({ where: { id: finalTrainerIds, role: 'TRAINER', isDeleted: false, status: 'APPROVED' } });
    if (trainers.length !== finalTrainerIds.length) {
      return res.status(400).json({ error: 'One or more trainer IDs are invalid, inactive, or not trainers' });
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

    // Automatically generate full duration Morning and Evening attendance sessions
    await ensureTrainingAttendanceSessions(training.id).catch(err => {
      console.warn('[createTraining] Failed to pre-generate attendance sessions:', err.message);
    });

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
    const search = req.query.search || '';
    const status = req.query.status || '';

    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const cacheKey = `trainings:list:${userRole || 'anon'}:${userId || 0}:${search}:${status}:${page}:${limit}:${isPaginated}`;
    const cached = cacheService.get(cacheKey);
    if (cached && req.query.fresh !== 'true') {
      return res.json(cached);
    }

    const where = {};
    if (search && search.trim()) {
      const q = search.trim();
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } }
      ];
    }

    if (status && status !== 'ALL') {
      const now = new Date();
      if (status.toUpperCase() === 'UPCOMING') {
        where.startDate = { [Op.gt]: now };
      } else if (status.toUpperCase() === 'COMPLETED') {
        where.endDate = { [Op.lt]: now };
      } else if (status.toUpperCase() === 'ACTIVE') {
        where.startDate = { [Op.lte]: now };
        where.endDate = { [Op.gte]: now };
      }
    }

    const total = await Training.count({ where });

    let findOptions = {
      where,
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
    };

    if (isPaginated) {
      findOptions.limit = limit;
      findOptions.offset = offset;
    }

    const trainings = await Training.findAll(findOptions);

    const trainingIds = trainings.map(t => t.id);
    const countMap = {};
    const enrolledSet = new Set();

    if (trainingIds.length > 0) {
      try {
        const counts = await Enrollment.findAll({
          where: { trainingId: { [Op.in]: trainingIds }, status: 'ENROLLED' },
          attributes: ['trainingId', [Training.sequelize.fn('COUNT', Training.sequelize.col('id')), 'count']],
          group: ['trainingId'],
          raw: true
        });
        counts.forEach(c => {
          countMap[c.trainingId] = parseInt(c.count, 10) || 0;
        });

        if (userId && userRole === 'PARTICIPANT') {
          const userEnrollments = await Enrollment.findAll({
            where: { participantId: userId, trainingId: { [Op.in]: trainingIds }, status: 'ENROLLED' },
            attributes: ['trainingId'],
            raw: true
          });
          userEnrollments.forEach(e => enrolledSet.add(e.trainingId));
        }
      } catch (countErr) {
        console.error('Batch count error in getAllTrainings:', countErr.message);
      }
    }

    let progressMap = new Map();
    if (trainingIds.length > 0) {
      try {
        progressMap = await batchCalculateTrainingsCompletion(trainingIds);
      } catch (progErr) {
        console.error('Batch progress calculation error in getAllTrainings:', progErr.message);
      }
    }

    const formattedTrainings = trainings.map(t => {
      const enrolledCount = countMap[t.id] || 0;
      const isEnrolled = enrolledSet.has(t.id);
      const progress = progressMap.get(t.id) || {
        totalStructureItems: 0,
        completedStructureItems: 0,
        inProgressStructureItems: 0,
        pendingStructureItems: 0,
        completionPercentage: 0,
        hasStructure: false,
      };

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
        sequentialLearning: t.sequentialLearning || false,
        totalStructureItems: progress.totalStructureItems,
        completedStructureItems: progress.completedStructureItems,
        inProgressStructureItems: progress.inProgressStructureItems,
        pendingStructureItems: progress.pendingStructureItems,
        completionPercentage: progress.completionPercentage,
        trainingProgress: progress
      };
    });

    const paginationMeta = formatPaginationMeta(total, page, limit);

    let result;
    if (isPaginated) {
      result = {
        success: true,
        trainings: formattedTrainings,
        data: formattedTrainings,
        pagination: paginationMeta,
        total,
        page,
        limit,
        totalPages: paginationMeta.totalPages
      };
    } else {
      result = formattedTrainings;
    }

    cacheService.set(cacheKey, result, 15);
    return res.json(result);
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

    const trainingProgress = await calculateTrainingCompletion(training.id);

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
      sequentialLearning: training.sequentialLearning || false,
      totalStructureItems: trainingProgress.totalStructureItems,
      completedStructureItems: trainingProgress.completedStructureItems,
      inProgressStructureItems: trainingProgress.inProgressStructureItems,
      pendingStructureItems: trainingProgress.pendingStructureItems,
      completionPercentage: trainingProgress.completionPercentage,
      trainingProgress
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
    let hasTrainerFields = false;
    if (trainerIds !== undefined) {
      hasTrainerFields = true;
      if (Array.isArray(trainerIds)) {
        finalTrainerIds = trainerIds.map(tId => parseInt(tId, 10)).filter(id => !isNaN(id));
      }
    } else if (trainerId !== undefined) {
      hasTrainerFields = true;
      if (trainerId) {
        const parsed = parseInt(trainerId, 10);
        if (!isNaN(parsed)) finalTrainerIds = [parsed];
      }
    }

    if (hasTrainerFields) {
      if (finalTrainerIds.length > 0) {
        const trainers = await User.findAll({ where: { id: finalTrainerIds, role: 'TRAINER', isDeleted: false, status: 'APPROVED' } });
        if (trainers.length !== finalTrainerIds.length) {
          return res.status(400).json({ error: 'One or more trainer IDs are invalid, inactive, or not trainers' });
        }
      }

      await TrainingTrainerAssignment.destroy({ where: { trainingId: id } });
      if (finalTrainerIds.length > 0) {
        const assignments = finalTrainerIds.map(tId => ({
          trainingId: id,
          trainerId: tId
        }));
        await TrainingTrainerAssignment.bulkCreate(assignments);
      }
    }

    const primaryTrainerId = hasTrainerFields
      ? (finalTrainerIds[0] || null)
      : training.trainerId;

    await training.update({
      title: title || training.title,
      description: description !== undefined ? description : training.description,
      trainerId: primaryTrainerId,
      startDate: startDate ? new Date(startDate) : training.startDate,
      endDate: endDate ? new Date(endDate) : training.endDate,
      capacity: capacity !== undefined ? (capacity ? parseInt(capacity, 10) : null) : training.capacity,
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
    if (hasTrainerFields) {
      await CourseTrainerAssignment.destroy({ where: { courseId: course.id } });
      if (finalTrainerIds.length > 0) {
        const courseAssignments = finalTrainerIds.map(tId => ({
          courseId: course.id,
          trainerId: tId
        }));
        await CourseTrainerAssignment.bulkCreate(courseAssignments);
      }
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
      AIQuestionOption,
      QuizAttempt,
      QuizAnswer,
      QuizResult,
      QuizAssignment,
      QuizCopyViolation,
      QuizResultsAudit,
      QuizRecording,
      AssessmentSession,
      ExamSession,
      Violation,
      ProctorActivity,
      Screenshot,
      Feedback,
      LiveSession,
      Note,
      AIDocument,
      DiscussionPost,
      RegistrationApplication,
      CodingAssessment,
      CodingProblem,
      CodingTestCase,
      CodingAttempt,
      CodingSubmission,
      CodingResult,
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
        // AIQuestion & AIQuestionOption
        const aiQuestions = await AIQuestion.findAll({ where: { quizId: quizIds } });
        const aiQuestionIds = aiQuestions.map(q => q.id);
        if (aiQuestionIds.length > 0) {
          await AIQuestionOption.destroy({ where: { questionId: aiQuestionIds } });
        }
        await AIQuestion.destroy({ where: { quizId: quizIds } });

        // QuizAssignment, QuizCopyViolation, QuizResultsAudit, QuizRecording
        await QuizAssignment.destroy({ where: { quizId: quizIds } });
        await QuizCopyViolation.destroy({ where: { quizId: quizIds } });
        await QuizResultsAudit.destroy({ where: { quizId: quizIds } });
        await QuizRecording.destroy({ where: { quizId: quizIds } });

        // QuizAttempt & answers/results/sessions
        const attempts = await QuizAttempt.findAll({ where: { quizId: quizIds } });
        const attemptIds = attempts.map(a => a.id);
        if (attemptIds.length > 0) {
          await QuizAnswer.destroy({ where: { attemptId: attemptIds } });
          await QuizResult.destroy({ where: { attemptId: attemptIds } });
          await AssessmentSession.destroy({ where: { attemptId: attemptIds } });
          await QuizCopyViolation.destroy({ where: { attemptId: attemptIds } });
          
          const examSessions = await ExamSession.findAll({ where: { attemptId: attemptIds } });
          const sessionIds = examSessions.map(es => es.id);
          if (sessionIds.length > 0) {
            await Violation.destroy({ where: { sessionId: sessionIds } });
            await ProctorActivity.destroy({ where: { sessionId: sessionIds } });
            await Screenshot.destroy({ where: { sessionId: sessionIds } });
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
          await Screenshot.destroy({ where: { sessionId: directSessionIds } });
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
    await DiscussionPost.destroy({ where: { trainingId: id } });
    await Feedback.destroy({ where: { trainingId: id } });
    await Enrollment.destroy({ where: { trainingId: id } });
    await LiveSession.destroy({ where: { trainingId: id } });
    await Note.destroy({ where: { trainingId: id } });
    await AIDocument.destroy({ where: { trainingId: id } });
    await TrainingTrainerAssignment.destroy({ where: { trainingId: id } });
    await Certificate.destroy({ where: { trainingId: id } });
    await ParticipantTracking.destroy({ where: { trainingId: id } });
    await RegistrationApplication.destroy({ where: { trainingId: id } });

    // 10. Legacy AIQuiz (trainingId-scoped, not course-scoped)
    const legacyQuizzes = await AIQuiz.findAll({ where: { trainingId: id } });
    const legacyQuizIds = legacyQuizzes.map(q => q.id);
    if (legacyQuizIds.length > 0) {
      const legacyAiQuestions = await AIQuestion.findAll({ where: { quizId: legacyQuizIds } });
      const legacyAiQuestionIds = legacyAiQuestions.map(q => q.id);
      if (legacyAiQuestionIds.length > 0) {
        await AIQuestionOption.destroy({ where: { questionId: legacyAiQuestionIds } });
      }
      await AIQuestion.destroy({ where: { quizId: legacyQuizIds } });
      await QuizAssignment.destroy({ where: { quizId: legacyQuizIds } });
      await QuizCopyViolation.destroy({ where: { quizId: legacyQuizIds } });
      await QuizResultsAudit.destroy({ where: { quizId: legacyQuizIds } });
      await QuizRecording.destroy({ where: { quizId: legacyQuizIds } });
      await AIQuiz.destroy({ where: { id: legacyQuizIds } });
    }

    // 11. Coding Assessments & their children
    const codingAssessments = await CodingAssessment.findAll({ where: { trainingId: id } });
    const codingAssessmentIds = codingAssessments.map(ca => ca.id);
    if (codingAssessmentIds.length > 0) {
      // CodingProblem → CodingTestCase, CodingSubmission
      const codingProblems = await CodingProblem.findAll({ where: { assessmentId: codingAssessmentIds } });
      const codingProblemIds = codingProblems.map(cp => cp.id);
      if (codingProblemIds.length > 0) {
        await CodingTestCase.destroy({ where: { problemId: codingProblemIds } });
        await CodingSubmission.destroy({ where: { problemId: codingProblemIds } });
      }
      await CodingProblem.destroy({ where: { assessmentId: codingAssessmentIds } });

      // CodingAttempt → CodingSubmission, CodingResult, AssessmentSession, ExamSession
      const codingAttempts = await CodingAttempt.findAll({ where: { assessmentId: codingAssessmentIds } });
      const codingAttemptIds = codingAttempts.map(ca => ca.id);
      if (codingAttemptIds.length > 0) {
        await CodingSubmission.destroy({ where: { attemptId: codingAttemptIds } });
        await CodingResult.destroy({ where: { attemptId: codingAttemptIds } });
        await AssessmentSession.destroy({ where: { codingAttemptId: codingAttemptIds } });
        
        const codingExamSessions = await ExamSession.findAll({ where: { codingAttemptId: codingAttemptIds } });
        const codingSessionIds = codingExamSessions.map(es => es.id);
        if (codingSessionIds.length > 0) {
          await Violation.destroy({ where: { sessionId: codingSessionIds } });
          await ProctorActivity.destroy({ where: { sessionId: codingSessionIds } });
          await Screenshot.destroy({ where: { sessionId: codingSessionIds } });
          await ExamSession.destroy({ where: { id: codingSessionIds } });
        }
        await CodingAttempt.destroy({ where: { id: codingAttemptIds } });
      }

      // Clean up ExamSession/AssessmentSession by assessmentId directly
      await AssessmentSession.destroy({ where: { assessmentId: codingAssessmentIds } });
      const caExamSessions = await ExamSession.findAll({ where: { assessmentId: codingAssessmentIds } });
      const caSessionIds = caExamSessions.map(es => es.id);
      if (caSessionIds.length > 0) {
        await Violation.destroy({ where: { sessionId: caSessionIds } });
        await ProctorActivity.destroy({ where: { sessionId: caSessionIds } });
        await Screenshot.destroy({ where: { sessionId: caSessionIds } });
        await ExamSession.destroy({ where: { id: caSessionIds } });
      }

      await CodingAssessment.destroy({ where: { id: codingAssessmentIds } });
    }

    // 12. Destroy the training itself
    await Training.destroy({ where: { id } });

    res.json({ message: 'Training deleted successfully' });
  } catch (error) {
    console.error('Delete training error:', error.message);
    console.error('Delete training stack:', error.stack);
    res.status(500).json({ error: 'Server error deleting training', details: error.message });
  }
};

const getTrainingProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const training = await Training.findByPk(id, { attributes: ['id', 'title'] });
    if (!training) return res.status(404).json({ error: 'Training not found' });

    const progress = await calculateTrainingCompletion(id);
    res.json({
      success: true,
      trainingId: progress.trainingId,
      totalStructureItems: progress.totalStructureItems,
      completedStructureItems: progress.completedStructureItems,
      inProgressStructureItems: progress.inProgressStructureItems,
      pendingStructureItems: progress.pendingStructureItems,
      completionPercentage: progress.completionPercentage,
      hasStructure: progress.hasStructure,
      progress,
    });
  } catch (error) {
    console.error('getTrainingProgress error:', error.message);
    res.status(500).json({ error: 'Server error fetching training progress' });
  }
};

module.exports = {
  createTraining,
  getAllTrainings,
  getTrainingById,
  getTrainingProgress,
  updateTraining,
  deleteTraining,
};