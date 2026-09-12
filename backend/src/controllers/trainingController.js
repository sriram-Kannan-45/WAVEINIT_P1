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

    const trainers = await User.findAll({ where: { id: finalTrainerIds, role: { [Op.in]: ['TRAINER', 'ADMIN'] }, isDeleted: false, status: 'APPROVED' } });
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

    if (cacheService?.delByPrefix) {
      cacheService.delByPrefix('trainings:');
    }

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

    const userEnrollmentMap = {};
    if (trainingIds.length > 0) {
      try {
        const counts = await Enrollment.findAll({
          where: { trainingId: { [Op.in]: trainingIds }, status: { [Op.in]: ['APPROVED', 'ENROLLED', 'COMPLETED'] } },
          attributes: ['trainingId', [Training.sequelize.fn('COUNT', Training.sequelize.col('id')), 'count']],
          group: ['trainingId'],
          raw: true
        });
        counts.forEach(c => {
          countMap[c.trainingId] = parseInt(c.count, 10) || 0;
        });

        if (userId && userRole === 'PARTICIPANT') {
          const userEnrollments = await Enrollment.findAll({
            where: {
              participantId: userId,
              trainingId: { [Op.in]: trainingIds },
              status: { [Op.in]: ['APPROVED', 'ENROLLED', 'PENDING_TRAINER_APPROVAL', 'PENDING', 'REJECTED', 'COMPLETED'] }
            },
            attributes: ['trainingId', 'status'],
            raw: true
          });
          userEnrollments.forEach(e => {
            userEnrollmentMap[e.trainingId] = e.status;
            if (['APPROVED', 'ENROLLED', 'COMPLETED'].includes(e.status)) {
              enrolledSet.add(e.trainingId);
            }
          });
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
      const eStatus = userEnrollmentMap[t.id] || null;
      const isEnrolled = enrolledSet.has(t.id);
      const isPending = ['PENDING_TRAINER_APPROVAL', 'PENDING'].includes(eStatus);
      const isApproved = ['APPROVED', 'ENROLLED', 'COMPLETED'].includes(eStatus);
      const isRejected = eStatus === 'REJECTED';
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
        enrollmentStatus: eStatus,
        isApproved,
        isPending,
        isRejected,
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
        const trainers = await User.findAll({ where: { id: finalTrainerIds, role: { [Op.in]: ['TRAINER', 'ADMIN'] }, isDeleted: false, status: 'APPROVED' } });
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

    if (cacheService?.delByPrefix) {
      cacheService.delByPrefix('trainings:');
    }

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
      QuizAiHelp,
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
      CodingProblemLanguage,
      CodingAttempt,
      CodingSubmission,
      CodingResult,
      CodingAiHelp,
      AttendanceRecord,
      AttendanceSession,
      MonitorAttempt,
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

    // Find corresponding Course(s)
    const courses = await Course.findAll({ where: { trainingProgramId: id }, attributes: ['id'] });
    const courseIds = courses.map(c => c.id);

    // 1. Quizzes (both course-scoped and training-scoped)
    const quizWhere = [];
    if (courseIds.length > 0) quizWhere.push({ courseId: { [Op.in]: courseIds } });
    quizWhere.push({ trainingId: id });

    const quizzes = await AIQuiz.findAll({ where: { [Op.or]: quizWhere }, attributes: ['id'] });
    const quizIds = quizzes.map(q => q.id);

    if (quizIds.length > 0) {
      const aiQuestions = await AIQuestion.findAll({ where: { quizId: { [Op.in]: quizIds } }, attributes: ['id'] });
      const aiQuestionIds = aiQuestions.map(q => q.id);

      const attempts = await QuizAttempt.findAll({ where: { quizId: { [Op.in]: quizIds } }, attributes: ['id'] });
      const attemptIds = attempts.map(a => a.id);

      if (QuizAiHelp) {
        await QuizAiHelp.destroy({
          where: {
            [Op.or]: [
              attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
              aiQuestionIds.length > 0 ? { questionId: { [Op.in]: aiQuestionIds } } : null,
            ].filter(Boolean)
          }
        });
      }

      if (QuizAnswer) {
        await QuizAnswer.destroy({
          where: {
            [Op.or]: [
              attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
              aiQuestionIds.length > 0 ? { questionId: { [Op.in]: aiQuestionIds } } : null,
            ].filter(Boolean)
          }
        });
      }

      if (aiQuestionIds.length > 0 && AIQuestionOption) {
        await AIQuestionOption.destroy({ where: { questionId: { [Op.in]: aiQuestionIds } } });
      }
      if (aiQuestionIds.length > 0 && AIQuestion) {
        await AIQuestion.destroy({ where: { id: { [Op.in]: aiQuestionIds } } });
      }

      if (attemptIds.length > 0) {
        if (QuizCopyViolation) await QuizCopyViolation.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });
        if (QuizResult) await QuizResult.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });
        if (AssessmentSession) await AssessmentSession.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });

        if (ExamSession) {
          const examSessions = await ExamSession.findAll({ where: { attemptId: { [Op.in]: attemptIds } }, attributes: ['id'] });
          const sessionIds = examSessions.map(s => s.id);
          if (sessionIds.length > 0) {
            if (Violation) await Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } } });
            if (ProctorActivity) await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } } });
            if (Screenshot) await Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } } });
            await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } } });
          }
        }
        await QuizAttempt.destroy({ where: { id: { [Op.in]: attemptIds } } });
      }

      if (QuizAssignment) await QuizAssignment.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (QuizCopyViolation) await QuizCopyViolation.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (QuizResultsAudit) await QuizResultsAudit.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (QuizRecording) await QuizRecording.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (QuizResult) await QuizResult.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (AssessmentSession) await AssessmentSession.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (MonitorAttempt) await MonitorAttempt.destroy({ where: { testId: { [Op.in]: quizIds } } });
      if (Feedback) await Feedback.destroy({ where: { quizId: { [Op.in]: quizIds } } });
      if (LessonQuiz) await LessonQuiz.destroy({ where: { quizId: { [Op.in]: quizIds } } });

      await AIQuiz.destroy({ where: { id: { [Op.in]: quizIds } } });
    }

    // 2. Coding Assessments (both course and training scoped)
    const caWhere = [];
    if (courseIds.length > 0) caWhere.push({ courseId: { [Op.in]: courseIds } });
    caWhere.push({ trainingId: id });

    if (CodingAssessment) {
      const caList = await CodingAssessment.findAll({ where: { [Op.or]: caWhere }, attributes: ['id'] });
      const caIds = caList.map(c => c.id);

      if (caIds.length > 0) {
        const probs = await CodingProblem.findAll({ where: { assessmentId: { [Op.in]: caIds } }, attributes: ['id'] });
        const probIds = probs.map(p => p.id);

        const attempts = await CodingAttempt.findAll({ where: { assessmentId: { [Op.in]: caIds } }, attributes: ['id'] });
        const attemptIds = attempts.map(a => a.id);

        if (CodingAiHelp) {
          await CodingAiHelp.destroy({
            where: {
              [Op.or]: [
                attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                probIds.length > 0 ? { problemId: { [Op.in]: probIds } } : null,
              ].filter(Boolean)
            }
          });
        }

        if (CodingSubmission) {
          await CodingSubmission.destroy({
            where: {
              [Op.or]: [
                attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                probIds.length > 0 ? { problemId: { [Op.in]: probIds } } : null,
              ].filter(Boolean)
            }
          });
        }

        if (CodingResult) {
          await CodingResult.destroy({
            where: {
              [Op.or]: [
                { assessmentId: { [Op.in]: caIds } },
                attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
              ].filter(Boolean)
            }
          });
        }

        if (attemptIds.length > 0) {
          if (AssessmentSession) await AssessmentSession.destroy({ where: { codingAttemptId: { [Op.in]: attemptIds } } });
          if (ExamSession) await ExamSession.destroy({ where: { codingAttemptId: { [Op.in]: attemptIds } } });
          await CodingAttempt.destroy({ where: { id: { [Op.in]: attemptIds } } });
        }

        if (probIds.length > 0) {
          if (CodingProblemLanguage) await CodingProblemLanguage.destroy({ where: { problemId: { [Op.in]: probIds } } });
          if (CodingTestCase) await CodingTestCase.destroy({ where: { problemId: { [Op.in]: probIds } } });
          await CodingProblem.destroy({ where: { id: { [Op.in]: probIds } } });
        }

        if (AssessmentSession) await AssessmentSession.destroy({ where: { assessmentId: { [Op.in]: caIds } } });
        if (ExamSession) {
          const caExamSessions = await ExamSession.findAll({ where: { assessmentId: { [Op.in]: caIds } }, attributes: ['id'] });
          const caSessionIds = caExamSessions.map(es => es.id);
          if (caSessionIds.length > 0) {
            if (Violation) await Violation.destroy({ where: { sessionId: { [Op.in]: caSessionIds } } });
            if (ProctorActivity) await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: caSessionIds } } });
            if (Screenshot) await Screenshot.destroy({ where: { sessionId: { [Op.in]: caSessionIds } } });
            await ExamSession.destroy({ where: { id: { [Op.in]: caSessionIds } } });
          }
        }

        await CodingAssessment.destroy({ where: { id: { [Op.in]: caIds } } });
      }
    }

    // 3. Lessons & Course Children
    if (courseIds.length > 0) {
      if (CourseTrainerAssignment) await CourseTrainerAssignment.destroy({ where: { courseId: { [Op.in]: courseIds } } });
      if (Certificate) await Certificate.destroy({ where: { courseId: { [Op.in]: courseIds } } });
      if (Enrollment) await Enrollment.destroy({ where: { courseId: { [Op.in]: courseIds } } });
      if (Feedback) await Feedback.destroy({ where: { courseId: { [Op.in]: courseIds } } });
      if (AttendanceRecord) await AttendanceRecord.destroy({ where: { courseId: { [Op.in]: courseIds } } });
      if (AttendanceSession) await AttendanceSession.destroy({ where: { courseId: { [Op.in]: courseIds } } });

      const lessons = await Lesson.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id'] });
      const lessonIds = lessons.map(l => l.id);

      if (lessonIds.length > 0) {
        if (LessonMaterial) await LessonMaterial.destroy({ where: { lessonId: { [Op.in]: lessonIds } } });
        if (QuizProgress) await QuizProgress.destroy({ where: { lessonQuizId: { [Op.in]: lessonIds } } });
        if (LessonQuiz) await LessonQuiz.destroy({ where: { lessonId: { [Op.in]: lessonIds } } });

        if (LessonAssessment) {
          const assessments = await LessonAssessment.findAll({ where: { lessonId: { [Op.in]: lessonIds } }, attributes: ['id'] });
          const assessmentIds = assessments.map(a => a.id);
          if (assessmentIds.length > 0) {
            if (AssessmentSubmission) await AssessmentSubmission.destroy({ where: { assessmentId: { [Op.in]: assessmentIds } } });
            await LessonAssessment.destroy({ where: { id: { [Op.in]: assessmentIds } } });
          }
        }
        if (LessonProgress) await LessonProgress.destroy({ where: { lessonId: { [Op.in]: lessonIds } } });
        if (ParticipantTracking) await ParticipantTracking.destroy({ where: { lessonId: { [Op.in]: lessonIds } } });

        await Lesson.destroy({ where: { id: { [Op.in]: lessonIds } } });
      }

      await Course.destroy({ where: { id: { [Op.in]: courseIds } } });
    }

    // 4. Direct Training Children
    if (DiscussionPost) await DiscussionPost.destroy({ where: { trainingId: id } });
    if (Feedback) await Feedback.destroy({ where: { trainingId: id } });
    if (Enrollment) await Enrollment.destroy({ where: { trainingId: id } });
    if (LiveSession) await LiveSession.destroy({ where: { trainingId: id } });
    if (Note) await Note.destroy({ where: { trainingId: id } });
    if (AIDocument) await AIDocument.destroy({ where: { trainingId: id } });
    if (TrainingTrainerAssignment) await TrainingTrainerAssignment.destroy({ where: { trainingId: id } });
    if (Certificate) await Certificate.destroy({ where: { trainingId: id } });
    if (ParticipantTracking) await ParticipantTracking.destroy({ where: { trainingId: id } });
    if (RegistrationApplication) await RegistrationApplication.destroy({ where: { trainingId: id } });

    // 5. Finally, destroy training
    await Training.destroy({ where: { id } });

    if (cacheService?.delByPrefix) {
      cacheService.delByPrefix('trainings:');
    }

    res.json({ message: 'Training deleted successfully' });
  } catch (error) {
    console.error('Delete training error:', error.message);
    console.error('Delete training stack:', error.stack);
    res.status(500).json({ error: 'Server error deleting training' });
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