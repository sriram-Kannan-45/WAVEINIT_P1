const {
  Training,
  Enrollment,
  Feedback,
  User,
  Notification,
  Course,
  CourseTrainerAssignment,
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
  LiveSession,
  Note,
  AIDocument,
  DiscussionPost,
  RegistrationApplication,
  TrainingTrainerAssignment,
  CodingAssessment,
  CodingProblem,
  CodingTestCase,
  CodingAttempt,
  CodingSubmission,
  CodingResult,
} = require('../models');
const ActivityService = require('../services/activityService');
const logger = require('../utils/logger');

const updateTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, trainerId, trainerIds, startDate, endDate, capacity, sequentialLearning } = req.body;

    const training = await Training.findByPk(id);
    if (!training) return res.status(404).json({ error: 'Training not found' });

    let finalTrainerIds = [];
    if (Array.isArray(trainerIds)) {
      finalTrainerIds = trainerIds.map(tId => parseInt(tId));
    } else if (trainerId) {
      finalTrainerIds = [parseInt(trainerId)];
    }

    if (finalTrainerIds.length > 0) {
      const trainers = await User.findAll({ where: { id: finalTrainerIds, role: 'TRAINER', isDeleted: false, status: 'APPROVED' } });
      if (trainers.length !== finalTrainerIds.length) {
        return res.status(400).json({ error: 'One or more trainer IDs are invalid, inactive, or not trainers' });
      }

      const { TrainingTrainerAssignment } = require('../models');
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
    const training = await Training.findByPk(id);
    if (!training) return res.status(404).json({ error: 'Training not found' });

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
      const codingProblems = await CodingProblem.findAll({ where: { assessmentId: codingAssessmentIds } });
      const codingProblemIds = codingProblems.map(cp => cp.id);
      if (codingProblemIds.length > 0) {
        await CodingTestCase.destroy({ where: { problemId: codingProblemIds } });
        await CodingSubmission.destroy({ where: { problemId: codingProblemIds } });
      }
      await CodingProblem.destroy({ where: { assessmentId: codingAssessmentIds } });

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

const updateTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    const trainer = await User.findOne({ where: { id, role: 'TRAINER', isDeleted: false } });
    if (!trainer) return res.status(404).json({ error: 'Trainer not found' });

    if (email && email !== trainer.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) return res.status(400).json({ error: 'Email already in use' });
    }

    await trainer.update({ name: name || trainer.name, email: email || trainer.email });

    res.json({
      message: 'Trainer updated successfully',
      trainer: { id: trainer.id, name: trainer.name, email: trainer.email, username: trainer.username }
    });
  } catch (error) {
    console.error('Update trainer error:', error.message);
    res.status(500).json({ error: 'Server error updating trainer' });
  }
};

const deleteTrainer = async (req, res) => {
  const { id } = req.params;
  console.log('[deleteTrainer] Incoming trainer id:', id);

  const { sequelize } = require('../config/db');
  let t;
  try {
    t = await sequelize.transaction();
  } catch (err) {
    console.error('[deleteTrainer] Transaction error:', err.message);
    return res.status(500).json({ error: 'Server error deleting trainer' });
  }

  try {
    const trainer = await User.findOne({ 
      where: { id, role: 'TRAINER', isDeleted: false }, 
      transaction: t 
    });

    if (!trainer) {
      await t.rollback();
      console.log('[deleteTrainer] Trainer not found or already deleted:', id);
      return res.status(404).json({ error: 'Trainer not found' });
    }

    const {
      TrainerProfile, TrainerEducation, TrainerExperience, UserProfile,
      TrainingTrainerAssignment, CourseTrainerAssignment,
      Course, Lesson, Note, AIDocument, AIQuiz, LiveSession,
      DiscussionPost, Notification, Training, DeviceFingerprint, ChatMessage,
      Attendance, ActivityLog, UserSession, RefreshToken, Interview, CodingAssessment
    } = require('../models');
    const { Op } = require('sequelize');

    // 1. Cleanup assignments and transient user records
    await Promise.all([
      CourseTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t }).catch(() => {}),
      TrainingTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t }).catch(() => {}),
      Training.update({ trainerId: null }, { where: { trainerId: id }, transaction: t }).catch(() => {}),
      Course.update({ trainerId: null }, { where: { trainerId: id }, transaction: t }).catch(() => {}),
      DeviceFingerprint.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      UserSession.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      RefreshToken.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      Notification.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      DiscussionPost.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      ChatMessage.destroy({ where: { senderId: id }, transaction: t }).catch(() => {}),
      Attendance.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      ActivityLog.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      TrainerProfile.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      TrainerEducation.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      TrainerExperience.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      UserProfile.destroy({ where: { userId: id }, transaction: t }).catch(() => {}),
      Interview.destroy({ where: { interviewer_id: id }, transaction: t }).catch(() => {}),
      CodingAssessment.destroy({ where: { trainerId: id }, transaction: t }).catch(() => {}),
    ]);

    // 2. Check if trainer is referenced by permanent educational content (lessons, quizzes, notes, documents, live sessions)
    const [
      referencedLessons,
      referencedQuizzes,
      referencedNotes,
      referencedAIDocuments,
      referencedLiveSessions
    ] = await Promise.all([
      Lesson.findOne({ where: { trainerId: id }, transaction: t }),
      AIQuiz.findOne({
        where: {
          [Op.or]: [
            { trainerId: id },
            { createdBy: id }
          ]
        },
        transaction: t
      }),
      Note.findOne({ where: { trainerId: id }, transaction: t }),
      AIDocument.findOne({ where: { trainerId: id }, transaction: t }),
      LiveSession.findOne({ where: { trainerId: id }, transaction: t })
    ]);

    const hasPermanentReferences =
      referencedLessons ||
      referencedQuizzes ||
      referencedNotes ||
      referencedAIDocuments ||
      referencedLiveSessions;

    if (hasPermanentReferences) {
      console.log('[deleteTrainer] Trainer is referenced by existing content (lessons/quizzes/notes/materials). Soft-deleting and anonymizing trainer id:', id);
      
      const timestamp = Date.now();
      const anonymizedEmail = `${trainer.email}__deleted_${timestamp}`;
      const anonymizedUsername = trainer.username ? `${trainer.username}__deleted_${timestamp}` : null;

      const [affectedRows] = await User.update(
        { 
          isDeleted: true, 
          status: 'INACTIVE', 
          deletedAt: new Date(),
          email: anonymizedEmail,
          username: anonymizedUsername
        },
        { where: { id }, transaction: t }
      );
      console.log('[deleteTrainer] Soft delete completed. Affected rows:', affectedRows);
      
      await t.commit();
      logger.info(`[deleteTrainer] Trainer #${id} soft-deleted and email freed successfully.`);
      return res.json({
        success: true,
        message: 'Trainer deleted successfully.'
      });
    }

    // 3. No permanent content references: perform complete hard delete
    console.log('[deleteTrainer] No permanent references. Hard-deleting trainer id:', id);
    try {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
      const affectedRows = await User.destroy({ where: { id }, transaction: t });
      console.log('[deleteTrainer] Hard delete completed. Rows deleted:', affectedRows);
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t }).catch(() => {});
    }
    
    await t.commit();
    logger.info(`[deleteTrainer] Trainer #${id} hard-deleted successfully.`);
    res.json({
      success: true,
      message: 'Trainer deleted successfully.'
    });
  } catch (error) {
    await t.rollback();
    console.error('[deleteTrainer] Caught exception during deletion:', error);

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Trainer cannot be deleted because related records exist.'
      });
    }

    if (error.name === 'SequelizeDatabaseError' && error.message && error.message.includes('Data truncated')) {
      try {
        const { sequelize } = require('../config/db');
        const [colDef] = await sequelize.query("SHOW COLUMNS FROM `users` WHERE `Field` = 'status'");
        const allowed = colDef.length > 0 ? colDef[0].Type : 'unknown';
        logger.error('[deleteTrainer] Data truncated on users.status — ENUM may not include INACTIVE. Allowed values:', {
          allowedEnum: allowed,
          attemptedValue: 'INACTIVE',
          trainerId: id
        });
      } catch (_) {}
    } else {
      logger.error('Delete trainer error:', {
        method: req.method,
        url: req.originalUrl,
        trainerId: id,
        error: error.message,
        stack: error.stack,
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getStats = async (req, res) => {
  try {
    const totalTrainings = await Training.count();
    const totalTrainers = await User.count({ where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' } });
    const totalParticipants = await User.count({ where: { role: 'PARTICIPANT', isDeleted: false } });
    const totalEnrollments = await Enrollment.count({ where: { status: 'ENROLLED' } });
    const totalFeedbacks = await Feedback.count();
    
    // Pending counts
    const pendingParticipants = await User.count({ 
      where: { role: 'PARTICIPANT', status: 'PENDING', isDeleted: false } 
    });
    const { Note } = require('../models');
    const pendingNotes = await Note.count({ where: { status: 'PENDING' } });
    
    // Completed trainings (trainings that have ended)
    const now = new Date();
    const completedTrainings = await Training.count({
      where: { endDate: { [require('sequelize').Op.lt]: now } }
    });
    const activeTrainings = totalTrainings - completedTrainings;

    // Feedback stats
    const feedbacks = await Feedback.findAll({ 
      attributes: ['trainerRating', 'subjectRating'] 
    });
    const avgTrainerRating = feedbacks.length > 0
      ? (feedbacks.reduce((s, f) => s + f.trainerRating, 0) / feedbacks.length).toFixed(1) : 0;
    const avgSubjectRating = feedbacks.length > 0
      ? (feedbacks.reduce((s, f) => s + f.subjectRating, 0) / feedbacks.length).toFixed(1) : 0;
    const satisfactionScore = feedbacks.length > 0
      ? (((parseFloat(avgTrainerRating) + parseFloat(avgSubjectRating)) / 2)).toFixed(1)
      : 0;

    // Rating distribution (for charts)
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedbacks.forEach(f => {
      ratingDistribution[f.trainerRating] = (ratingDistribution[f.trainerRating] || 0) + 1;
    });

    // Enrollment rate
    const enrollmentRate = totalParticipants > 0 
      ? ((totalEnrollments / totalParticipants) * 100).toFixed(1) 
      : 0;

    res.json({ 
      success: true,
      // Flat properties for backward compatibility
      totalTrainings,
      completedTrainings,
      activeTrainings,
      totalTrainers,
      totalParticipants,
      pendingParticipants,
      totalEnrollments,
      totalFeedbacks,
      pendingNotes,
      pendingApprovals: pendingParticipants,
      avgTrainerRating,
      avgSubjectRating,
      satisfactionScore,
      ratingDistribution,
      enrollmentRate,
      // New data wrapper
      data: {
        totalTrainings,
        completedTrainings,
        activeTrainings,
        totalTrainers,
        totalParticipants,
        pendingParticipants,
        pendingApprovals: pendingParticipants,
        totalEnrollments,
        totalFeedbacks,
        pendingNotes,
        avgTrainerRating,
        avgSubjectRating,
        satisfactionScore,
        ratingDistribution,
        enrollmentRate
      }
    });

  } catch (error) {
    console.error('Get stats error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching stats' 
    });
  }
};

const getParticipants = async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const { search = '', status = '', limit = 50, offset = 0 } = req.query;
    
    const where = { role: 'PARTICIPANT', isDeleted: false };
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Status filter
    if (status) {
      where.status = status;
    }

    const participants = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await User.count({ where });

    const formattedParticipants = participants.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      username: p.username,
      status: p.status,
      joinedAt: p.createdAt || p.dataValues?.created_at
    }));

    res.json({ 
      success: true,
      participants: formattedParticipants,
      total,
      hasMore: parseInt(offset) + parseInt(limit) < total
    });

  } catch (error) {
    console.error('Get participants error:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching participants' 
    });
  }
};

const sendReminders = async (req, res) => {
  try {
    const { trainingId } = req.params;
    const training = await Training.findByPk(trainingId);
    if (!training) return res.status(404).json({ error: 'Training not found' });

    const enrollments = await Enrollment.findAll({
      where: { trainingId, status: 'ENROLLED' },
      attributes: ['participantId']
    });

    const participantIds = enrollments.map(e => e.participantId);
    const feedbacks = await Feedback.findAll({
      where: { trainingId },
      attributes: ['participantId']
    });
    const submittedIds = feedbacks.map(f => f.participantId);
    const pendingIds = participantIds.filter(id => !submittedIds.includes(id));

    if (pendingIds.length === 0) {
      return res.json({ message: 'No pending feedbacks for this training.' });
    }

    const notifications = pendingIds.map(userId => ({
      userId,
      message: `Reminder: Please submit your feedback for the training "${training.title}".`,
      isRead: false
    }));

    await Notification.bulkCreate(notifications);
    res.json({ message: `Sent ${notifications.length} reminders.` });
  } catch (error) {
    console.error('Send reminders error:', error.message);
    res.status(500).json({ error: 'Server error sending reminders' });
  }
};

const deleteParticipant = async (req, res) => {
  const { id } = req.params;
  const { sequelize } = require('../config/db');
  let t;
  try {
    t = await sequelize.transaction();
  } catch (err) {
    console.error('Delete participant transaction error:', err.message);
    return res.status(500).json({ error: 'Server error deleting participant' });
  }

  try {
    const participant = await User.findOne({ where: { id, role: 'PARTICIPANT' }, transaction: t });
    if (!participant) {
      await t.rollback();
      return res.status(404).json({ error: 'Participant not found' });
    }

    const { Op } = require('sequelize');
    const {
      Enrollment, Feedback, Notification, ParticipantProfile,
      DeviceFingerprint, ParticipantTracking, Certificate, Attendance, DiscussionPost,
      LessonProgress, QuizProgress, QuizAttempt, QuizAnswer, QuizResult,
      AssessmentSession, ExamSession, Violation, Screenshot, ProctorActivity,
      QuizCopyViolation, QuizAssignment, AssessmentSubmission,
      MonitorAttempt, MonitorViolation, MonitorScreenshot,
      CodingAttempt, CodingSubmission, CodingResult,
      QuizRecording, QuizResultsAudit,
      ProctoringSession, ProctoringEvent, ProctoringReport
    } = require('../models');

    // 1. Quiz attempt related cleanup — child tables before QuizAttempt
    const attempts = await QuizAttempt.findAll({
      where: { participantId: id }, attributes: ['id'], transaction: t
    });
    const attemptIds = attempts.map(a => a.id);

    if (attemptIds.length > 0) {
      await ProctoringReport.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      }).catch(() => {});
      await ProctoringEvent.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      }).catch(() => {});
      await ProctoringSession.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      }).catch(() => {});
      await QuizCopyViolation.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      });
      await QuizAnswer.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      });
      await QuizResult.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      });
      await AssessmentSession.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      });
      await ExamSession.destroy({
        where: { attemptId: { [Op.in]: attemptIds } }, transaction: t
      });
    }

    // 2. Exam session & proctoring cleanup — children (Violation, Screenshot, ProctorActivity) before ExamSession
    const examSessions = await ExamSession.findAll({
      where: { participantId: id }, attributes: ['id'], transaction: t
    });
    const sessionIds = examSessions.map(e => e.id);

    if (sessionIds.length > 0) {
      await Violation.destroy({
        where: { sessionId: { [Op.in]: sessionIds } }, transaction: t
      });
      await Screenshot.destroy({
        where: { sessionId: { [Op.in]: sessionIds } }, transaction: t
      });
      await ProctorActivity.destroy({
        where: { sessionId: { [Op.in]: sessionIds } }, transaction: t
      });
      await ExamSession.destroy({
        where: { id: { [Op.in]: sessionIds } }, transaction: t
      });
    }
    // Catch any records linked directly to the participant (orphans)
    await Violation.destroy({ where: { participantId: id }, transaction: t });
    await Screenshot.destroy({ where: { participantId: id }, transaction: t });
    await ProctorActivity.destroy({ where: { participantId: id }, transaction: t });
    await AssessmentSession.destroy({ where: { participantId: id }, transaction: t });

    // 3. Discussion posts — detach children first, then delete the user's posts
    const posts = await DiscussionPost.findAll({
      where: { userId: id }, attributes: ['id'], transaction: t
    });
    const postIds = posts.map(p => p.id);
    if (postIds.length > 0) {
      await DiscussionPost.update(
        { parentId: null },
        { where: { parentId: { [Op.in]: postIds } }, transaction: t }
      );
    }
    await DiscussionPost.destroy({ where: { userId: id }, transaction: t });

    // 4. Coding attempt cleanup
    const codingAttempts = await CodingAttempt.findAll({
      where: { participantId: id }, attributes: ['id'], transaction: t
    });
    const codingAttemptIds = codingAttempts.map(ca => ca.id);

    if (codingAttemptIds.length > 0) {
      await CodingSubmission.destroy({
        where: { attemptId: { [Op.in]: codingAttemptIds } }, transaction: t
      });
      await CodingResult.destroy({
        where: { attemptId: { [Op.in]: codingAttemptIds } }, transaction: t
      });
      await CodingAttempt.destroy({
        where: { id: { [Op.in]: codingAttemptIds } }, transaction: t
      });
    }

    // 5. Monitor system cleanup
    const monitorAttempts = await MonitorAttempt.findAll({
      where: { participantId: id }, attributes: ['id'], transaction: t
    });
    const monitorAttemptIds = monitorAttempts.map(ma => ma.id);

    if (monitorAttemptIds.length > 0) {
      await MonitorViolation.destroy({
        where: { attemptId: { [Op.in]: monitorAttemptIds } }, transaction: t
      });
      await MonitorScreenshot.destroy({
        where: { attemptId: { [Op.in]: monitorAttemptIds } }, transaction: t
      });
      await MonitorAttempt.destroy({
        where: { id: { [Op.in]: monitorAttemptIds } }, transaction: t
      });
    }

    // 6. QuizProgress — fix: use participantId (was incorrectly filtering by lessonQuizId)
    await QuizProgress.destroy({ where: { participantId: id }, transaction: t });

    // 7. Other participant-scoped tables
    await AssessmentSubmission.destroy({ where: { participantId: id }, transaction: t });
    await QuizRecording.destroy({ where: { participantId: id }, transaction: t });
    await QuizResultsAudit.destroy({ where: { performedBy: id }, transaction: t });
    await QuizAssignment.destroy({ where: { participantId: id }, transaction: t });

    // 8. General student records (sequentially to avoid FK conflicts)
    await Notification.destroy({ where: { userId: id }, transaction: t });
    await ParticipantProfile.destroy({ where: { userId: id }, transaction: t });
    await DeviceFingerprint.destroy({ where: { userId: id }, transaction: t });
    await ParticipantTracking.destroy({ where: { userId: id }, transaction: t });
    await Certificate.destroy({ where: { userId: id }, transaction: t });
    await Attendance.destroy({ where: { userId: id }, transaction: t });
    await LessonProgress.destroy({ where: { participantId: id }, transaction: t });
    await Feedback.destroy({ where: { participantId: id }, transaction: t });
    await Enrollment.destroy({ where: { participantId: id }, transaction: t });
    await QuizAttempt.destroy({ where: { participantId: id }, transaction: t });

    // 9. Finally destroy the user
    await User.destroy({ where: { id }, transaction: t });

    await t.commit();
    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Delete participant error:', error.stack || error.message);
    res.status(500).json({ error: 'Server error deleting participant' });
  }
};

const exportFeedbacksCSV = async (req, res) => {
  try {
    const feedbacks = await Feedback.findAll({
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title'], include: [{ model: User, as: 'trainer', attributes: ['name'] }] },
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] }
      ],
      order: [['submitted_at', 'DESC']]
    });

    const rows = [
      ['ID', 'Training', 'Trainer', 'Participant', 'Trainer Rating', 'Subject Rating', 'Comments', 'Anonymous', 'Date'].join(',')
    ];
    feedbacks.forEach(f => {
      const pName = f.anonymous ? 'Anonymous' : (f.participant?.name || '');
      const row = [
        f.id,
        `"${f.training?.title || ''}"`,
        `"${f.training?.trainer?.name || ''}"`,
        `"${pName}"`,
        f.trainerRating,
        f.subjectRating,
        `"${(f.comments || '').replace(/"/g, "'")}"`,
        f.anonymous ? 'Yes' : 'No',
        f.submitted_at ? new Date(f.submitted_at).toLocaleDateString('en-IN') : ''
      ].join(',');
      rows.push(row);
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="feedback_export.csv"');
    res.send(rows.join('\n'));
  } catch (error) {
    console.error('Export CSV error:', error.message);
    res.status(500).json({ error: 'Server error exporting feedbacks' });
  }
};

const getTrainingStats = async (req, res) => {
  try {
    const trainings = await Training.findAll({
      include: [{ model: User, as: 'trainer', attributes: ['name'], required: false }],
      order: [['id', 'DESC']]
    });

    const result = await Promise.all(trainings.map(async t => {
      const enrolledCount = await Enrollment.count({ where: { trainingId: t.id, status: 'ENROLLED' } });
      const feedbackCount = await Feedback.count({ where: { trainingId: t.id } });
      const feedbacks = await Feedback.findAll({ where: { trainingId: t.id }, attributes: ['trainerRating', 'subjectRating'] });
      const avgTrainer = feedbacks.length > 0 ? (feedbacks.reduce((s, f) => s + f.trainerRating, 0) / feedbacks.length).toFixed(1) : null;
      const avgSubject = feedbacks.length > 0 ? (feedbacks.reduce((s, f) => s + f.subjectRating, 0) / feedbacks.length).toFixed(1) : null;
      const now = new Date();
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      const status = now < start ? 'Upcoming' : now > end ? 'Completed' : 'Ongoing';
      return {
        id: t.id, title: t.title, trainerName: t.trainer?.name || 'Unassigned',
        startDate: t.startDate, endDate: t.endDate, capacity: t.capacity,
        enrolledCount, feedbackCount, avgTrainerRating: avgTrainer, avgSubjectRating: avgSubject, status
      };
    }));

    res.json({ trainings: result });
  } catch (error) {
    console.error('Training stats error:', error.message);
    res.status(500).json({ error: 'Server error fetching training stats' });
  }
};

const getPendingParticipants = async (req, res) => {
  try {
    const pendingParticipants = await User.findAll({
      where: { role: 'PARTICIPANT', status: 'PENDING', isDeleted: false },
      attributes: { exclude: ['password'] },
      order: [['id', 'DESC']]
    });

    const formattedParticipants = pendingParticipants.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      username: p.username,
      appliedAt: p.created_at,
      created_at: p.created_at,
      createdAt: p.created_at
    }));

    res.json({ participants: formattedParticipants, total: formattedParticipants.length });
  } catch (error) {
    console.error('Get pending participants error:', error.message);
    res.status(500).json({ error: 'Server error fetching pending participants' });
  }
};

const approveParticipant = async (req, res) => {
  try {
    const { id } = req.params;
    const participant = await User.findOne({ where: { id, role: 'PARTICIPANT' } });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    if (participant.status !== 'PENDING') {
      return res.status(409).json({ error: 'Participant status has already been updated.' });
    }

    await participant.update({ status: 'APPROVED' });

    // Keep the linked application (if any) in sync.
    try {
      const { RegistrationApplication } = require('../models');
      await RegistrationApplication.update(
        { status: 'APPROVED', reviewerId: req.user.id, reviewedAt: new Date() },
        { where: { userId: participant.id, status: 'PENDING' } }
      );
    } catch (e) { logger.warn('Sync application on approve failed:', { error: e.message }); }

    const io = req.app.get('io');

    // Log activity
    await ActivityService.logActivity({
      userId: req.user.id,
      userName: req.user.name || 'Admin',
      action: 'USER_APPROVED',
      entityType: 'User',
      entityId: participant.id,
      details: { targetUserName: participant.name }
    }, io);

    // Notify user
    await Notification.create({
      userId: participant.id,
      message: 'Your participant application has been approved.',
      type: 'APPROVAL',
      isRead: false
    });

    res.json({
      success: true,
      message: 'Participant approved successfully',
      participant: {
        id: participant.id,
        name: participant.name,
        email: participant.email,
        status: participant.status
      }
    });
  } catch (error) {
    console.error('Approve participant error:', error.message);
    res.status(500).json({ error: 'Unable to update participant status. Please try again.' });
  }
};

const rejectParticipant = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const participant = await User.findOne({ where: { id, role: 'PARTICIPANT' } });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    if (participant.status !== 'PENDING') {
      return res.status(409).json({ error: 'Participant status has already been updated.' });
    }

    await participant.update({ status: 'REJECTED' });

    // Keep the linked application (if any) in sync.
    try {
      const { RegistrationApplication } = require('../models');
      await RegistrationApplication.update(
        { status: 'REJECTED', rejectionReason: reason || null, reviewerId: req.user.id, reviewedAt: new Date() },
        { where: { userId: participant.id, status: 'PENDING' } }
      );
    } catch (e) { logger.warn('Sync application on reject failed:', { error: e.message }); }

    const io = req.app.get('io');

    await ActivityService.logActivity({
      userId: req.user.id,
      userName: req.user.name || 'Admin',
      action: 'USER_REJECTED',
      entityType: 'User',
      entityId: participant.id,
      details: { targetUserName: participant.name, targetRole: 'PARTICIPANT', reason: reason || null }
    }, io);

    await Notification.create({
      userId: participant.id,
      message: 'Your participant application has been rejected.',
      type: 'APPROVAL',
      isRead: false
    });

    res.json({
      success: true,
      message: 'Participant rejected successfully',
      participant: {
        id: participant.id,
        name: participant.name,
        email: participant.email,
        status: participant.status
      }
    });
  } catch (error) {
    console.error('Reject participant error:', error.message);
    res.status(500).json({ error: 'Unable to update participant status. Please try again.' });
  }
};

// ── Trainer Approval ─────────────────────────────────────────────────────────

const approveTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    const trainer = await User.findOne({ where: { id, role: 'TRAINER', status: 'PENDING' } });
    
    if (!trainer) {
      return res.status(404).json({ error: 'Pending trainer not found' });
    }

    await trainer.update({ status: 'APPROVED' });

    const io = req.app.get('io');

    await ActivityService.logActivity({
      userId: req.user.id,
      userName: req.user.name || 'Admin',
      action: 'USER_APPROVED',
      entityType: 'User',
      entityId: trainer.id,
      details: { targetUserName: trainer.name, targetRole: 'TRAINER' }
    }, io);

    await Notification.create({
      userId: trainer.id,
      message: 'Your trainer account has been approved. You can now log in.',
      type: 'APPROVAL',
      isRead: false
    });

    res.json({
      message: 'Trainer approved successfully',
      trainer: {
        id: trainer.id,
        name: trainer.name,
        email: trainer.email,
        status: trainer.status
      }
    });
  } catch (error) {
    console.error('Approve trainer error:', error.message);
    res.status(500).json({ error: 'Server error approving trainer' });
  }
};

const rejectTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    const trainer = await User.findOne({ where: { id, role: 'TRAINER', status: 'PENDING' } });
    
    if (!trainer) {
      return res.status(404).json({ error: 'Pending trainer not found' });
    }

    await trainer.update({ status: 'INACTIVE' });

    const io = req.app.get('io');

    await ActivityService.logActivity({
      userId: req.user.id,
      userName: req.user.name || 'Admin',
      action: 'USER_REJECTED',
      entityType: 'User',
      entityId: trainer.id,
      details: { targetUserName: trainer.name, targetRole: 'TRAINER' }
    }, io);

    res.json({
      message: 'Trainer rejected successfully',
      trainer: {
        id: trainer.id,
        name: trainer.name,
        email: trainer.email,
        status: trainer.status
      }
    });
  } catch (error) {
    console.error('Reject trainer error:', error.message);
    res.status(500).json({ error: 'Server error rejecting trainer' });
  }
};

const getPendingTrainers = async (req, res) => {
  try {
    const trainers = await User.findAll({
      where: { role: 'TRAINER', status: 'PENDING', isDeleted: false },
      attributes: ['id', 'name', 'email', 'phone', 'created_at']
    });
    res.json({ trainers });
  } catch (error) {
    console.error('Get pending trainers error:', error.message);
    res.status(500).json({ error: 'Server error fetching pending trainers' });
  }
};

module.exports = { updateTraining, deleteTraining, updateTrainer, deleteTrainer, getStats, getParticipants, sendReminders, deleteParticipant, exportFeedbacksCSV, getTrainingStats, getPendingParticipants, approveParticipant, rejectParticipant, approveTrainer, rejectTrainer, getPendingTrainers };