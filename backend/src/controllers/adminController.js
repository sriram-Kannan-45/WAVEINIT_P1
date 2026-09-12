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
  CodingProblemLanguage,
  CodingAttempt,
  CodingSubmission,
  CodingResult,
  QuizAiHelp,
  CodingAiHelp,
  AttendanceRecord,
  AttendanceSession,
  UserBadge,
  AssessmentVerificationSession,
  UserSession,
  RefreshToken,
  AuditLog,
  PasswordResetOtp,
  Interview,
  InterviewSession,
  InterviewDevice,
  InterviewRecording,
  InterviewLog,
  InterviewAlert,
  InterviewFeedback,
  InterviewResult,
  InterviewNotes,
  SurveyAnswer,
  ActivityLog,
  ChatMessage,
  UserProfile,
  ProfileSkill,
  ProfileExperience,
  ProfileEducation,
  ProfileCertificate,
  ProfileProject,
  ProfileContactLink,
  ProfileActivityLog,
  ParticipantProfile,
  TrainerEducation,
  TrainerExperience,
  TrainerProfile,
  Attendance,
  MonitoringSession,
  MonitoringEvent,
  VideoSegment,
  ProcessingJob,
  MonitorAttempt,
  MonitorViolation,
  MonitorScreenshot,
  ProctoringSession,
  ProctoringEvent,
  ProctoringReport,
  DeviceFingerprint
} = require('../models');
const ActivityService = require('../services/activityService');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { validateEmail, validatePassword } = require('../utils/validators');
const { invalidateSummaryCache } = require('./adminSummaryController');
const { parsePagination, formatPaginationMeta, formatPaginatedResponse } = require('../utils/paginationHelper');
const cacheService = require('../services/cacheService');
const { sequelize } = require('../config/db');
const fs = require('fs');
const path = require('path');
const { resolveUploadsPath } = require('../config/paths');

/**
 * Phase 11: Identify and safely unlink all physical files associated with a user
 * before deleting database rows to prevent orphaned files on disk.
 */
async function cleanupUserPhysicalFiles(userId) {
  const filesToUnlink = new Set();

  try {
    // 1. UserProfile & certificates
    const up = await UserProfile.findAll({
      where: { userId },
      attributes: ['resumePath', 'bannerPath', 'profilePath'],
    }).catch(() => []);
    up.forEach(p => {
      if (p.resumePath) filesToUnlink.add(p.resumePath);
      if (p.bannerPath) filesToUnlink.add(p.bannerPath);
      if (p.profilePath) filesToUnlink.add(p.profilePath);
    });

    const certs = await ProfileCertificate.findAll({
      attributes: ['certificateFile'],
      include: [{ model: UserProfile, as: 'profile', where: { userId }, attributes: ['id'] }],
    }).catch(() => []);
    certs.forEach(c => {
      if (c.certificateFile) filesToUnlink.add(c.certificateFile);
    });

    // 2. ParticipantProfile
    const partProfile = await ParticipantProfile.findOne({
      where: { userId },
      attributes: ['avatarUrl'],
    }).catch(() => null);
    if (partProfile?.avatarUrl) filesToUnlink.add(partProfile.avatarUrl);

    // 3. RegistrationApplication
    const regApps = await RegistrationApplication.findAll({
      where: { userId },
      attributes: ['resumeUrl', 'profilePhotoUrl'],
    }).catch(() => []);
    regApps.forEach(r => {
      if (r.resumeUrl) filesToUnlink.add(r.resumeUrl);
      if (r.profilePhotoUrl) filesToUnlink.add(r.profilePhotoUrl);
    });

    // 4. QuizRecordings
    const quizRecs = await QuizRecording.findAll({
      where: { participantId: userId },
      attributes: ['filePath'],
    }).catch(() => []);
    quizRecs.forEach(qr => {
      if (qr.filePath) filesToUnlink.add(qr.filePath);
    });

    // 5. ExamSessions & Screenshots
    const examSessions = await ExamSession.findAll({
      where: { participantId: userId },
      attributes: ['id'],
    }).catch(() => []);
    const examSessionIds = examSessions.map(e => e.id);
    if (examSessionIds.length > 0) {
      const shots = await Screenshot.findAll({
        where: { sessionId: examSessionIds },
        attributes: ['imageUrl'],
      }).catch(() => []);
      shots.forEach(s => {
        if (s.imageUrl) filesToUnlink.add(s.imageUrl);
      });

      const segs = await VideoSegment.findAll({
        where: { sessionId: examSessionIds },
        attributes: ['filePath'],
      }).catch(() => []);
      segs.forEach(v => {
        if (v.filePath) filesToUnlink.add(v.filePath);
      });
    }

    // 6. Monitor attempts & monitor screenshots
    const monAttempts = await MonitorAttempt.findAll({
      where: { participantId: userId },
      attributes: ['id'],
    }).catch(() => []);
    const monAttemptIds = monAttempts.map(m => m.id);
    if (monAttemptIds.length > 0) {
      const monShots = await MonitorScreenshot.findAll({
        where: { attemptId: monAttemptIds },
        attributes: ['imageUrl'],
      }).catch(() => []);
      monShots.forEach(ms => {
        if (ms.imageUrl) filesToUnlink.add(ms.imageUrl);
      });
    }

    // 7. Video segments from MonitoringSessions
    const monSessions = await MonitoringSession.findAll({
      where: { participantId: userId },
      attributes: ['sessionId'],
    }).catch(() => []);
    const monUuids = monSessions.map(m => m.sessionId).filter(Boolean);
    if (monUuids.length > 0) {
      const monSegs = await VideoSegment.findAll({
        where: { monitoringSessionId: monUuids },
        attributes: ['filePath'],
      }).catch(() => []);
      monSegs.forEach(ms => {
        if (ms.filePath) filesToUnlink.add(ms.filePath);
      });
    }
  } catch (collectErr) {
    logger.error(`[DELETE PARTICIPANT FILE SCAN ERROR] ${collectErr.message}`);
  }

  // Safely delete all resolved files from disk
  for (const fileRef of filesToUnlink) {
    try {
      const fullPath = resolveUploadsPath(fileRef);
      if (fullPath && fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        fs.unlinkSync(fullPath);
        logger.info(`[DELETE PARTICIPANT] Unlinked personal file: ${path.basename(fullPath)}`);
      }
    } catch (unlinkErr) {
      logger.warn(`[DELETE PARTICIPANT] Could not unlink ${fileRef}: ${unlinkErr.message}`);
    }
  }
}

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
      const trainers = await User.findAll({ where: { id: finalTrainerIds, role: { [Op.in]: ['TRAINER', 'ADMIN'] }, isDeleted: false, status: 'APPROVED' } });
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
      Attendance, ActivityLog, UserSession, RefreshToken, Interview, CodingAssessment,
      QuizRecording, RegistrationApplication, InterviewNotes, InterviewFeedback,
      InterviewResult, InterviewRecording, InterviewLog, InterviewDevice,
      PasswordResetOtp, AssessmentSession, QuizResultsAudit
    } = require('../models');
    const { Op } = require('sequelize');

    // 1. Check if trainer is referenced by permanent educational / assessment content
    const [
      referencedCourses,
      referencedTrainings,
      referencedLessons,
      referencedQuizzes,
      referencedNotes,
      referencedAIDocuments,
      referencedLiveSessions,
      referencedCodingAssessments
    ] = await Promise.all([
      Course.findOne({ where: { trainerId: id }, transaction: t }),
      Training.findOne({ where: { trainerId: id }, transaction: t }),
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
      LiveSession.findOne({ where: { trainerId: id }, transaction: t }),
      CodingAssessment.findOne({ where: { trainerId: id }, transaction: t })
    ]);

    const hasPermanentReferences =
      referencedCourses ||
      referencedTrainings ||
      referencedLessons ||
      referencedQuizzes ||
      referencedNotes ||
      referencedAIDocuments ||
      referencedLiveSessions ||
      referencedCodingAssessments;

    if (hasPermanentReferences) {
      console.log('[deleteTrainer] Trainer is referenced by existing content. Soft-deleting and anonymizing trainer id:', id);
      
      const timestamp = Date.now();
      const anonymizedEmail = `${trainer.email}__deleted_${timestamp}`;
      const anonymizedUsername = trainer.username ? `${trainer.username}__deleted_${timestamp}` : null;

      // Clean up assignments & transient sessions
      await CourseTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t });
      await TrainingTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t });
      await DeviceFingerprint.destroy({ where: { userId: id }, transaction: t });
      await UserSession.destroy({ where: { userId: id }, transaction: t });
      await RefreshToken.destroy({ where: { userId: id }, transaction: t });
      await Notification.destroy({ where: { userId: id }, transaction: t });

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

    // 2. No permanent content references: perform complete clean hard delete
    console.log('[deleteTrainer] No permanent references. Hard-deleting trainer id:', id);

    // a. Assignments and registration references
    await CourseTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t });
    await TrainingTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t });
    await RegistrationApplication.update({ reviewerId: null }, { where: { reviewerId: id }, transaction: t });
    await RegistrationApplication.update({ trainerId: null }, { where: { trainerId: id }, transaction: t });
    await RegistrationApplication.destroy({ where: { userId: id }, transaction: t });
    await AssessmentSession.update({ resetByAdmin: null }, { where: { resetByAdmin: id }, transaction: t });

    // b. Interviews (notes, feedback, logs, recordings, devices, interviews)
    await InterviewNotes.destroy({ where: { author_id: id }, transaction: t });
    await InterviewFeedback.destroy({ where: { interviewer_id: id }, transaction: t });
    await InterviewResult.destroy({ where: { decided_by: id }, transaction: t });
    await InterviewRecording.update({ uploaded_by: null }, { where: { uploaded_by: id }, transaction: t });
    await InterviewLog.update({ actor_id: null }, { where: { actor_id: id }, transaction: t });
    await InterviewDevice.destroy({ where: { user_id: id }, transaction: t });
    await Interview.destroy({
      where: {
        [Op.or]: [
          { interviewer_id: id },
          { created_by: id },
          { candidate_id: id }
        ]
      },
      transaction: t
    });

    // c. Quiz recordings and audit logs
    await QuizRecording.destroy({
      where: {
        [Op.or]: [
          { trainerId: id },
          { participantId: id }
        ]
      },
      transaction: t
    });
    await QuizResultsAudit.destroy({ where: { performedBy: id }, transaction: t });

    // d. Discussion posts (clear parentId on replies first, then delete)
    const posts = await DiscussionPost.findAll({ where: { userId: id }, attributes: ['id'], transaction: t });
    const postIds = posts.map(p => p.id);
    if (postIds.length > 0) {
      await DiscussionPost.update({ parentId: null }, { where: { parentId: { [Op.in]: postIds } }, transaction: t });
      await DiscussionPost.destroy({ where: { id: { [Op.in]: postIds } }, transaction: t });
    }

    // e. Chat messages, attendance, logs
    await ChatMessage.destroy({ where: { senderId: id }, transaction: t });
    await Attendance.destroy({ where: { userId: id }, transaction: t });
    await ActivityLog.destroy({ where: { userId: id }, transaction: t });

    // f. Profiles and profile children
    await TrainerEducation.destroy({ where: { userId: id }, transaction: t });
    await TrainerExperience.destroy({ where: { userId: id }, transaction: t });
    await TrainerProfile.destroy({ where: { userId: id }, transaction: t });
    await UserProfile.destroy({ where: { userId: id }, transaction: t });

    // g. Auth and security tokens
    await Notification.destroy({ where: { userId: id }, transaction: t });
    await DeviceFingerprint.destroy({ where: { userId: id }, transaction: t });
    await UserSession.destroy({ where: { userId: id }, transaction: t });
    await RefreshToken.destroy({ where: { userId: id }, transaction: t });
    await PasswordResetOtp.destroy({ where: { email: trainer.email }, transaction: t });

    // h. Destroy user (toggling FK checks only if dialect is MySQL)
    const isMySql = sequelize.getDialect() === 'mysql';
    if (isMySql) {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
    }

    const affectedRows = await User.destroy({ where: { id }, transaction: t });
    console.log('[deleteTrainer] Hard delete completed. Rows deleted:', affectedRows);

    if (isMySql) {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t }).catch(() => {});
    }

    await t.commit();
    logger.info(`[deleteTrainer] Trainer #${id} hard-deleted successfully.`);
    return res.json({
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

    logger.error('Delete trainer error:', {
      method: req.method,
      url: req.originalUrl,
      trainerId: id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({ error: 'Internal server error deleting trainer' });
  }
};

const getStats = async (req, res) => {
  try {
    const cacheKey = 'admin:stats';
    const cached = cacheService.get(cacheKey);
    if (cached && req.query.fresh !== 'true') {
      return res.json(cached);
    }

    const now = new Date();
    const { Note } = require('../models');
    const { sequelize } = require('../config/db');

    const [
      totalTrainings,
      totalTrainers,
      totalParticipants,
      totalEnrollments,
      totalFeedbacks,
      pendingParticipants,
      pendingNotes,
      completedTrainings,
      feedbackAgg
    ] = await Promise.all([
      Training.count(),
      User.count({ where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' } }),
      User.count({ where: { role: 'PARTICIPANT', isDeleted: false } }),
      Enrollment.count({ where: { status: { [require('sequelize').Op.in]: ['APPROVED', 'ENROLLED', 'COMPLETED'] } } }),
      Feedback.count(),
      User.count({ where: { role: 'PARTICIPANT', status: 'PENDING', isDeleted: false } }),
      Note.count({ where: { status: 'PENDING' } }),
      Training.count({ where: { endDate: { [require('sequelize').Op.lt]: now } } }),
      Feedback.findAll({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('trainer_rating')), 'avgTrainerRating'],
          [sequelize.fn('AVG', sequelize.col('subject_rating')), 'avgSubjectRating']
        ],
        raw: true
      }).catch(() => ([{}]))
    ]);

    const activeTrainings = totalTrainings - completedTrainings;

    const fStat = (feedbackAgg && feedbackAgg[0]) || {};
    const avgTrainerRating = fStat.avgTrainerRating ? parseFloat(fStat.avgTrainerRating).toFixed(1) : '0.0';
    const avgSubjectRating = fStat.avgSubjectRating ? parseFloat(fStat.avgSubjectRating).toFixed(1) : '0.0';
    const satisfactionScore = (((parseFloat(avgTrainerRating) + parseFloat(avgSubjectRating)) / 2) || 0).toFixed(1);

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // Enrollment rate
    const enrollmentRate = totalParticipants > 0 
      ? ((totalEnrollments / totalParticipants) * 100).toFixed(1) 
      : 0;

    const result = { 
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
    };

    cacheService.set(cacheKey, result, 20);

    res.json(result);
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
    const { search = '', status = '' } = req.query;
    const { page, limit, offset } = parsePagination(req.query, 10, 1000);
    const isPostgres = sequelize.getDialect() === 'postgres';
    const likeOp = isPostgres ? Op.iLike : Op.like;

    const where = { role: 'PARTICIPANT', isDeleted: false };
    
    // Search filter
    if (search && search.trim()) {
      const q = search.trim();
      where[Op.or] = [
        { name: { [likeOp]: `%${q}%` } },
        { email: { [likeOp]: `%${q}%` } },
        { phone: { [likeOp]: `%${q}%` } },
        { username: { [likeOp]: `%${q}%` } }
      ];
    }
    
    // Status filter
    if (status && status !== 'ALL') {
      where.status = status.toUpperCase();
    }

    const total = await User.count({ where });

    const participants = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    const participantIds = participants.map(p => p.id);

    // Fetch quiz scores and progress if participants found
    let avgQuizScoreMap = {};
    let progressMap = {};
    if (participantIds.length > 0) {
      try {
        const { QuizResult, LessonProgress, Lesson } = require('../models');
        const [quizResults, progressRows, totalLessonsCount] = await Promise.all([
          QuizResult
            ? QuizResult.findAll({
                where: { participantId: { [Op.in]: participantIds } },
                attributes: ['participantId', 'percentage', 'totalScore'],
                raw: true
              }).catch(() => [])
            : Promise.resolve([]),
          LessonProgress
            ? LessonProgress.findAll({
                where: { participantId: { [Op.in]: participantIds }, status: 'COMPLETED' },
                attributes: ['participantId', [LessonProgress.sequelize.fn('COUNT', '*'), 'completedCount']],
                group: ['participantId'],
                raw: true
              }).catch(() => [])
            : Promise.resolve([]),
          Lesson ? Lesson.count().catch(() => 1) : Promise.resolve(1)
        ]);

        if (quizResults && quizResults.length > 0) {
          const userScores = {};
          quizResults.forEach(qr => {
            if (!userScores[qr.participantId]) userScores[qr.participantId] = [];
            const val = qr.percentage !== null && qr.percentage !== undefined
              ? Number(qr.percentage)
              : (qr.totalScore !== null && qr.totalScore !== undefined ? Number(qr.totalScore) : null);
            if (val !== null) {
              userScores[qr.participantId].push(val);
            }
          });
          Object.keys(userScores).forEach(uId => {
            const arr = userScores[uId];
            if (arr.length > 0) {
              avgQuizScoreMap[uId] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
            }
          });
        }

        if (progressRows && progressRows.length > 0) {
          const lessonsCount = totalLessonsCount || 1;
          progressRows.forEach(pr => {
            const completed = Number(pr.completedCount) || 0;
            progressMap[String(pr.participantId)] = Math.min(100, Math.round((completed / Math.max(1, lessonsCount)) * 100));
          });
        }
      } catch (err) {
        console.warn('Error computing participant progress/quiz metrics:', err.message);
      }
    }

    const formattedParticipants = participants.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      username: p.username,
      status: p.status,
      joinedAt: p.createdAt || p.dataValues?.created_at,
      created_at: p.createdAt || p.dataValues?.created_at,
      progress: progressMap[String(p.id)] || 0,
      quizScore: avgQuizScoreMap[String(p.id)] || 0
    }));

    const paginationMeta = formatPaginationMeta(total, page, limit);

    res.json({ 
      success: true, 
      participants: formattedParticipants,
      data: formattedParticipants,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages,
      hasMore: offset + formattedParticipants.length < total
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
      where: { trainingId, status: { [require('sequelize').Op.in]: ['APPROVED', 'ENROLLED', 'COMPLETED'] } },
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
  const { Op } = require('sequelize');
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

    const email = participant.email;

    // Pre-deletion: unlink all physical personal files from disk
    await cleanupUserPhysicalFiles(id);

    // 1. Unified Monitoring Sessions & Async Video Pipeline
    const monitoringSessions = await MonitoringSession.findAll({
      where: { participantId: id },
      attributes: ['id', 'sessionId'],
      transaction: t,
    });
    const monSessionUUIDs = monitoringSessions.map(m => m.sessionId).filter(Boolean);
    const monSessionIds = monitoringSessions.map(m => m.id);

    if (monSessionUUIDs.length > 0) {
      const segments = await VideoSegment.findAll({
        where: { monitoringSessionId: { [Op.in]: monSessionUUIDs } },
        attributes: ['id'],
        transaction: t,
      });
      const segmentIds = segments.map(s => s.id);

      if (segmentIds.length > 0) {
        await ProcessingJob.destroy({ where: { segmentId: { [Op.in]: segmentIds } }, transaction: t });
        await MonitoringEvent.destroy({ where: { segmentId: { [Op.in]: segmentIds } }, transaction: t });
        await VideoSegment.destroy({ where: { id: { [Op.in]: segmentIds } }, transaction: t });
      }

      await MonitoringEvent.destroy({
        where: { monitoringSessionId: { [Op.in]: monSessionUUIDs } },
        transaction: t,
      });
    }

    if (monSessionIds.length > 0 || monSessionUUIDs.length > 0) {
      await MonitoringSession.destroy({
        where: {
          [Op.or]: [
            { id: { [Op.in]: monSessionIds } },
            { participantId: id },
          ],
        },
        transaction: t,
      });
    }

    // 2. Quiz attempts & related child records
    const attempts = await QuizAttempt.findAll({
      where: { participantId: id },
      attributes: ['id'],
      transaction: t,
    });
    const attemptIds = attempts.map(a => a.id);

    if (attemptIds.length > 0) {
      await ProctoringReport.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
      await ProctoringEvent.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
      await ProctoringSession.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
      await QuizCopyViolation.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await QuizAnswer.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
      await QuizResult.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await AssessmentSession.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await ExamSession.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await QuizAttempt.destroy({ where: { id: { [Op.in]: attemptIds } }, transaction: t });
    }

    // Direct references
    await QuizResult.destroy({ where: { participantId: id }, transaction: t });
    await QuizCopyViolation.destroy({ where: { participantId: id }, transaction: t });
    await QuizAttempt.destroy({ where: { participantId: id }, transaction: t });
    await AssessmentSession.destroy({ where: { participantId: id }, transaction: t });

    // 3. Exam Sessions, Proctoring Violations, Screenshots, Activities
    const examSessions = await ExamSession.findAll({
      where: { participantId: id },
      attributes: ['id'],
      transaction: t,
    });
    const sessionIds = examSessions.map(e => e.id);

    if (sessionIds.length > 0) {
      await Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
      await Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
      await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
      await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } }, transaction: t });
    }
    await Violation.destroy({ where: { participantId: id }, transaction: t });
    await Screenshot.destroy({ where: { participantId: id }, transaction: t });
    await ProctorActivity.destroy({ where: { participantId: id }, transaction: t });
    await ExamSession.destroy({ where: { participantId: id }, transaction: t });

    // 4. Coding Attempts, Submissions & Results
    const codingAttempts = await CodingAttempt.findAll({
      where: { participantId: id },
      attributes: ['id'],
      transaction: t,
    });
    const codingAttemptIds = codingAttempts.map(ca => ca.id);

    if (codingAttemptIds.length > 0) {
      await CodingSubmission.destroy({ where: { attemptId: { [Op.in]: codingAttemptIds } }, transaction: t });
      await CodingResult.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: codingAttemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await CodingAttempt.destroy({ where: { id: { [Op.in]: codingAttemptIds } }, transaction: t });
    }
    await CodingResult.destroy({ where: { participantId: id }, transaction: t });
    await CodingAttempt.destroy({ where: { participantId: id }, transaction: t });

    // 5. Monitor attempts, violations, screenshots
    const monitorAttempts = await MonitorAttempt.findAll({
      where: { participantId: id },
      attributes: ['id'],
      transaction: t,
    });
    const monitorAttemptIds = monitorAttempts.map(ma => ma.id);

    if (monitorAttemptIds.length > 0) {
      await MonitorViolation.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: monitorAttemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await MonitorScreenshot.destroy({
        where: { [Op.or]: [{ attemptId: { [Op.in]: monitorAttemptIds } }, { participantId: id }] },
        transaction: t,
      });
      await MonitorAttempt.destroy({ where: { id: { [Op.in]: monitorAttemptIds } }, transaction: t });
    }
    await MonitorViolation.destroy({ where: { participantId: id }, transaction: t });
    await MonitorScreenshot.destroy({ where: { participantId: id }, transaction: t });
    await MonitorAttempt.destroy({ where: { participantId: id }, transaction: t });

    // 6. Interview module
    const interviews = await Interview.findAll({
      where: {
        [Op.or]: [
          { candidate_id: id },
          { interviewer_id: id },
          { created_by: id },
        ],
      },
      attributes: ['id'],
      transaction: t,
    });
    const interviewIds = interviews.map(iv => iv.id);

    if (interviewIds.length > 0) {
      await InterviewNotes.destroy({
        where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { author_id: id }] },
        transaction: t,
      });
      await InterviewFeedback.destroy({
        where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { interviewer_id: id }] },
        transaction: t,
      });
      await InterviewResult.destroy({
        where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { decided_by: id }] },
        transaction: t,
      });
      await InterviewRecording.destroy({
        where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { uploaded_by: id }] },
        transaction: t,
      });
      await InterviewLog.destroy({
        where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { actor_id: id }] },
        transaction: t,
      });
      await InterviewAlert.destroy({ where: { interview_id: { [Op.in]: interviewIds } }, transaction: t });
      await InterviewSession.destroy({ where: { interview_id: { [Op.in]: interviewIds } }, transaction: t });
      await InterviewDevice.destroy({
        where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { user_id: id }] },
        transaction: t,
      });
      await Interview.destroy({ where: { id: { [Op.in]: interviewIds } }, transaction: t });
    }
    await InterviewDevice.destroy({ where: { user_id: id }, transaction: t });
    await InterviewNotes.destroy({ where: { author_id: id }, transaction: t });
    await InterviewFeedback.destroy({ where: { interviewer_id: id }, transaction: t });
    await InterviewResult.destroy({ where: { decided_by: id }, transaction: t });
    await Interview.destroy({
      where: {
        [Op.or]: [{ candidate_id: id }, { interviewer_id: id }, { created_by: id }],
      },
      transaction: t,
    });

    // 7. Discussion posts (detach child replies before deletion)
    const posts = await DiscussionPost.findAll({
      where: { userId: id },
      attributes: ['id'],
      transaction: t,
    });
    const postIds = posts.map(p => p.id);
    if (postIds.length > 0) {
      await DiscussionPost.update({ parentId: null }, { where: { parentId: { [Op.in]: postIds } }, transaction: t });
      await DiscussionPost.destroy({ where: { id: { [Op.in]: postIds } }, transaction: t });
    }
    await DiscussionPost.destroy({ where: { userId: id }, transaction: t });

    // 8. Progress, Gating, Submissions, Verifications, Feedbacks & Attendance
    await QuizProgress.destroy({ where: { participantId: id }, transaction: t });
    await LessonProgress.destroy({ where: { participantId: id }, transaction: t });
    await AssessmentSubmission.destroy({ where: { participantId: id }, transaction: t });
    await QuizRecording.destroy({
      where: { [Op.or]: [{ participantId: id }, { trainerId: id }] },
      transaction: t,
    });
    await QuizResultsAudit.destroy({ where: { performedBy: id }, transaction: t });
    await QuizAssignment.destroy({ where: { participantId: id }, transaction: t });
    await AssessmentVerificationSession.destroy({
      where: { participant_id: id },
      transaction: t,
    });
    await AttendanceRecord.destroy({
      where: { [Op.or]: [{ studentId: id }, { markedBy: id }] },
      transaction: t,
    });
    await UserBadge.destroy({ where: { userId: id }, transaction: t });
    await Certificate.destroy({ where: { userId: id }, transaction: t });
    await ParticipantTracking.destroy({ where: { userId: id }, transaction: t });

    // Delete survey answers linked to feedbacks
    const userFeedbacks = await Feedback.findAll({
      where: { participantId: id },
      attributes: ['id'],
      transaction: t,
    });
    const fbIds = userFeedbacks.map(f => f.id);
    if (fbIds.length > 0) {
      await SurveyAnswer.destroy({ where: { feedbackId: { [Op.in]: fbIds } }, transaction: t });
    }
    await Feedback.destroy({ where: { participantId: id }, transaction: t });
    await Enrollment.destroy({ where: { participantId: id }, transaction: t });

    // 9. Profiles
    const userProfiles = await UserProfile.findAll({
      where: { userId: id },
      attributes: ['id'],
      transaction: t,
    });
    const upIds = userProfiles.map(u => u.id);
    if (upIds.length > 0) {
      await ProfileSkill.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await ProfileExperience.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await ProfileEducation.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await ProfileCertificate.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await ProfileProject.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await ProfileContactLink.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await ProfileActivityLog.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t });
      await UserProfile.destroy({ where: { id: { [Op.in]: upIds } }, transaction: t });
    }
    await UserProfile.destroy({ where: { userId: id }, transaction: t });
    await ParticipantProfile.destroy({ where: { userId: id }, transaction: t });
    await TrainerEducation.destroy({ where: { userId: id }, transaction: t });
    await TrainerExperience.destroy({ where: { userId: id }, transaction: t });
    await TrainerProfile.destroy({ where: { userId: id }, transaction: t });
    await CourseTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t });
    await TrainingTrainerAssignment.destroy({ where: { trainerId: id }, transaction: t });

    // 10. Auth, Sessions, Messages, Notifications, Logs
    await RegistrationApplication.destroy({
      where: { [Op.or]: [{ userId: id }, { trainerId: id }, { reviewerId: id }] },
      transaction: t,
    });
    await ChatMessage.destroy({ where: { senderId: id }, transaction: t });
    await Note.destroy({ where: { trainerId: id }, transaction: t });
    await Notification.destroy({ where: { userId: id }, transaction: t });
    await DeviceFingerprint.destroy({ where: { userId: id }, transaction: t });
    await ActivityLog.destroy({ where: { userId: id }, transaction: t });
    await AuditLog.destroy({ where: { userId: id }, transaction: t });
    await UserSession.destroy({ where: { userId: id }, transaction: t });
    await RefreshToken.destroy({ where: { userId: id }, transaction: t });
    if (email) {
      await PasswordResetOtp.destroy({ where: { email }, transaction: t });
    }
    await Attendance.destroy({ where: { userId: id }, transaction: t });

    // 11. Finally destroy User record
    await User.destroy({ where: { id }, transaction: t });

    await t.commit();
    invalidateSummaryCache();
    return res.json({ success: true, message: 'Participant removed successfully' });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    console.error('Delete participant error:', error.stack || error.message);
    res.status(500).json({ success: false, error: 'Server error deleting participant' });
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
      const enrolledCount = await Enrollment.count({ where: { trainingId: t.id, status: { [require('sequelize').Op.in]: ['APPROVED', 'ENROLLED', 'COMPLETED'] } } });
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
    const participant = await User.findOne({ where: { id, role: 'PARTICIPANT', isDeleted: false } });

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
      message: 'Your participant registration has been approved! You can now log in to your account.',
      type: 'APPROVAL',
      isRead: false
    });

    invalidateSummaryCache();

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
    const { reason } = req.body || {};

    const participant = await User.findOne({ where: { id, role: 'PARTICIPANT', isDeleted: false } });

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
      message: 'Your participant registration application has been rejected.',
      type: 'APPROVAL',
      isRead: false
    });

    invalidateSummaryCache();

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

const createParticipant = async (req, res) => {
  try {
    const { name, email, password, phone, status } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Participant name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Participant email is required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address (e.g. user@example.com)' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check duplicate email
    const existing = await User.findOne({
      where: { email: trimmedEmail, isDeleted: false }
    });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Auto-generate clean username
    const baseName = name.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 4) || 'user';
    let username = baseName + Math.floor(1000 + Math.random() * 9000);
    let userExists = await User.findOne({ where: { username } });
    while (userExists) {
      username = baseName + Math.floor(1000 + Math.random() * 9000);
      userExists = await User.findOne({ where: { username } });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const participantStatus = (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(String(status).toUpperCase()))
      ? String(status).toUpperCase()
      : 'APPROVED';

    const newParticipant = await User.create({
      name: name.trim(),
      email: trimmedEmail,
      username,
      password: hashedPassword,
      phone: phone ? phone.trim() : null,
      role: 'PARTICIPANT',
      status: participantStatus,
      passwordVersion: 2,
      isDeleted: false,
      deletedAt: null
    });

    // Create linked registration application
    try {
      const nameParts = (name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || name || 'Participant';
      const lastName = nameParts.slice(1).join(' ') || '-';
      const appCount = await RegistrationApplication.count();
      await RegistrationApplication.create({
        applicationNumber: `APP${new Date().getFullYear()}${String(appCount + 1).padStart(4, '0')}`,
        firstName,
        lastName,
        email: trimmedEmail,
        phone: phone ? phone.trim() : null,
        status: participantStatus,
        userId: newParticipant.id,
        reviewerId: req.user?.id || null,
        reviewedAt: new Date()
      });
    } catch (appErr) {
      logger.warn('Could not create RegistrationApplication for admin-added participant:', { error: appErr.message });
    }

    const io = req.app.get('io');
    await ActivityService.logActivity({
      userId: req.user.id,
      userName: req.user.name || 'Admin',
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: newParticipant.id,
      details: { targetUserName: newParticipant.name, targetRole: 'PARTICIPANT', status: participantStatus }
    }, io);

    res.status(201).json({
      success: true,
      message: 'Participant created successfully',
      participant: {
        id: newParticipant.id,
        name: newParticipant.name,
        email: newParticipant.email,
        username: newParticipant.username,
        phone: newParticipant.phone,
        role: newParticipant.role,
        status: newParticipant.status,
        created_at: newParticipant.created_at || newParticipant.createdAt
      }
    });
  } catch (error) {
    console.error('Create participant error:', error.message);
    res.status(500).json({ error: 'Server error creating participant' });
  }
};

const bulkDeleteParticipants = async (req, res) => {
  const { ids, force = false } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide an array of participant IDs to delete.' });
  }

  const validIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
  if (validIds.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid participant IDs provided.' });
  }

  const { Op } = require('sequelize');
  const {
    User, Enrollment, Feedback, Notification, ParticipantProfile,
    DeviceFingerprint, ParticipantTracking, Certificate, Attendance, DiscussionPost,
    LessonProgress, QuizProgress, QuizAttempt, QuizAnswer, QuizResult,
    AssessmentSession, ExamSession, Violation, Screenshot, ProctorActivity,
    QuizCopyViolation, QuizAssignment, AssessmentSubmission,
    MonitorAttempt, MonitorViolation, MonitorScreenshot,
    CodingAttempt, CodingSubmission, CodingResult,
    QuizRecording, QuizResultsAudit,
    ProctoringSession, ProctoringEvent, ProctoringReport,
    Training, Course
  } = require('../models');

  const { sequelize } = require('../config/db');

  try {
    const participants = await User.findAll({
      where: { id: { [Op.in]: validIds }, role: 'PARTICIPANT' }
    });

    if (participants.length === 0) {
      return res.status(404).json({ success: false, error: 'No matching participants found.' });
    }

    const failed = [];
    const eligibleIds = [];

    // Check dependencies for each participant
    for (const participant of participants) {
      const pId = participant.id;

      if (!force) {
        // 1. Check active enrollments
        const enrollments = await Enrollment.findAll({
          where: { participantId: pId, status: { [require('sequelize').Op.in]: ['APPROVED', 'ENROLLED', 'COMPLETED'] } },
          include: [
            { model: Training, as: 'training', attributes: ['title'], required: false },
            { model: Course, as: 'course', attributes: ['title'], required: false }
          ]
        }).catch(() => []);

        // 2. Check quiz / exam attempts & certificates
        const [quizAttemptsCount, codingAttemptsCount, certificatesCount] = await Promise.all([
          QuizAttempt.count({ where: { participantId: pId } }).catch(() => 0),
          CodingAttempt.count({ where: { participantId: pId } }).catch(() => 0),
          Certificate.count({ where: { userId: pId } }).catch(() => 0)
        ]);

        const hasActiveEnrollments = enrollments.length > 0;
        const hasSubmissions = quizAttemptsCount > 0 || codingAttemptsCount > 0 || certificatesCount > 0;

        if (hasActiveEnrollments || hasSubmissions) {
          const reasons = [];
          if (hasActiveEnrollments) {
            const courseTitles = enrollments.map(e => e.training?.title || e.course?.title).filter(Boolean);
            reasons.push(`Enrolled in ${enrollments.length} active course/training${courseTitles.length > 0 ? ` (${courseTitles.slice(0, 2).join(', ')}${courseTitles.length > 2 ? '...' : ''})` : ''}`);
          }
          if (quizAttemptsCount > 0) reasons.push(`${quizAttemptsCount} quiz attempt(s)`);
          if (codingAttemptsCount > 0) reasons.push(`${codingAttemptsCount} coding attempt(s)`);
          if (certificatesCount > 0) reasons.push(`${certificatesCount} certificate(s)`);

          failed.push({
            id: pId,
            name: participant.name || participant.email,
            reason: `Participant has active records: ${reasons.join(', ')}`
          });
          continue;
        }
      }

      eligibleIds.push(pId);
    }

    // If no participants are eligible for deletion
    if (eligibleIds.length === 0) {
      return res.json({
        success: false,
        message: 'None of the selected participants could be deleted due to active dependencies.',
        summary: {
          total: validIds.length,
          deleted: 0,
          failed: failed.length
        },
        deletedIds: [],
        failed
      });
    }

    // Execute deletion in a single database transaction
    const t = await sequelize.transaction();
    try {
      // Pre-deletion: unlink physical files for all eligible participants
      for (const pId of eligibleIds) {
        await cleanupUserPhysicalFiles(pId);
      }

      // 1. Unified Monitoring Sessions & Async Video Pipeline
      const monitoringSessions = await MonitoringSession.findAll({
        where: { participantId: { [Op.in]: eligibleIds } },
        attributes: ['id', 'sessionId'],
        transaction: t,
      }).catch(() => []);
      const monSessionUUIDs = monitoringSessions.map(m => m.sessionId).filter(Boolean);
      const monSessionIds = monitoringSessions.map(m => m.id);

      if (monSessionUUIDs.length > 0) {
        const segments = await VideoSegment.findAll({
          where: { monitoringSessionId: { [Op.in]: monSessionUUIDs } },
          attributes: ['id'],
          transaction: t,
        }).catch(() => []);
        const segmentIds = segments.map(s => s.id);

        if (segmentIds.length > 0) {
          await ProcessingJob.destroy({ where: { segmentId: { [Op.in]: segmentIds } }, transaction: t }).catch(() => {});
          await MonitoringEvent.destroy({ where: { segmentId: { [Op.in]: segmentIds } }, transaction: t }).catch(() => {});
          await VideoSegment.destroy({ where: { id: { [Op.in]: segmentIds } }, transaction: t }).catch(() => {});
        }

        await MonitoringEvent.destroy({
          where: { monitoringSessionId: { [Op.in]: monSessionUUIDs } },
          transaction: t,
        }).catch(() => {});
      }

      if (monSessionIds.length > 0 || monSessionUUIDs.length > 0) {
        await MonitoringSession.destroy({
          where: {
            [Op.or]: [
              { id: { [Op.in]: monSessionIds } },
              { participantId: { [Op.in]: eligibleIds } },
            ],
          },
          transaction: t,
        }).catch(() => {});
      }

      // 2. Quiz attempts & related child records
      const attempts = await QuizAttempt.findAll({
        where: { participantId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const attemptIds = attempts.map(a => a.id);

      if (attemptIds.length > 0) {
        await ProctoringReport.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t }).catch(() => {});
        await ProctoringEvent.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t }).catch(() => {});
        await ProctoringSession.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t }).catch(() => {});
        await QuizCopyViolation.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await QuizAnswer.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t }).catch(() => {});
        await QuizResult.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await AssessmentSession.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await ExamSession.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: attemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await QuizAttempt.destroy({ where: { id: { [Op.in]: attemptIds } }, transaction: t }).catch(() => {});
      }

      // Direct references
      await QuizResult.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await QuizCopyViolation.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await QuizAttempt.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await AssessmentSession.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 3. Exam Sessions, Proctoring Violations, Screenshots, Activities
      const examSessions = await ExamSession.findAll({
        where: { participantId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const sessionIds = examSessions.map(e => e.id);

      if (sessionIds.length > 0) {
        await Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t }).catch(() => {});
        await Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t }).catch(() => {});
        await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t }).catch(() => {});
        await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } }, transaction: t }).catch(() => {});
      }
      await Violation.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await Screenshot.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await ProctorActivity.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await ExamSession.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 4. Coding Attempts, Submissions & Results
      const codingAttempts = await CodingAttempt.findAll({
        where: { participantId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const codingAttemptIds = codingAttempts.map(ca => ca.id);

      if (codingAttemptIds.length > 0) {
        await CodingSubmission.destroy({ where: { attemptId: { [Op.in]: codingAttemptIds } }, transaction: t }).catch(() => {});
        await CodingResult.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: codingAttemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await CodingAttempt.destroy({ where: { id: { [Op.in]: codingAttemptIds } }, transaction: t }).catch(() => {});
      }
      await CodingResult.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await CodingAttempt.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 5. Monitor attempts, violations, screenshots
      const monitorAttempts = await MonitorAttempt.findAll({
        where: { participantId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const monitorAttemptIds = monitorAttempts.map(ma => ma.id);

      if (monitorAttemptIds.length > 0) {
        await MonitorViolation.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: monitorAttemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await MonitorScreenshot.destroy({
          where: { [Op.or]: [{ attemptId: { [Op.in]: monitorAttemptIds } }, { participantId: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await MonitorAttempt.destroy({ where: { id: { [Op.in]: monitorAttemptIds } }, transaction: t }).catch(() => {});
      }
      await MonitorViolation.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await MonitorScreenshot.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await MonitorAttempt.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 6. Interview module
      const interviews = await Interview.findAll({
        where: {
          [Op.or]: [
            { candidate_id: { [Op.in]: eligibleIds } },
            { interviewer_id: { [Op.in]: eligibleIds } },
            { created_by: { [Op.in]: eligibleIds } },
          ],
        },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const interviewIds = interviews.map(iv => iv.id);

      if (interviewIds.length > 0) {
        await InterviewNotes.destroy({
          where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { author_id: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await InterviewFeedback.destroy({
          where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { interviewer_id: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await InterviewResult.destroy({
          where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { decided_by: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await InterviewRecording.destroy({
          where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { uploaded_by: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await InterviewLog.destroy({
          where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { actor_id: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await InterviewAlert.destroy({ where: { interview_id: { [Op.in]: interviewIds } }, transaction: t }).catch(() => {});
        await InterviewSession.destroy({ where: { interview_id: { [Op.in]: interviewIds } }, transaction: t }).catch(() => {});
        await InterviewDevice.destroy({
          where: { [Op.or]: [{ interview_id: { [Op.in]: interviewIds } }, { user_id: { [Op.in]: eligibleIds } }] },
          transaction: t,
        }).catch(() => {});
        await Interview.destroy({ where: { id: { [Op.in]: interviewIds } }, transaction: t }).catch(() => {});
      }
      await InterviewDevice.destroy({ where: { user_id: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await InterviewNotes.destroy({ where: { author_id: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await InterviewFeedback.destroy({ where: { interviewer_id: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await InterviewResult.destroy({ where: { decided_by: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await Interview.destroy({
        where: {
          [Op.or]: [
            { candidate_id: { [Op.in]: eligibleIds } },
            { interviewer_id: { [Op.in]: eligibleIds } },
            { created_by: { [Op.in]: eligibleIds } }
          ],
        },
        transaction: t,
      }).catch(() => {});

      // 7. Discussion posts
      const posts = await DiscussionPost.findAll({
        where: { userId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const postIds = posts.map(p => p.id);
      if (postIds.length > 0) {
        await DiscussionPost.update({ parentId: null }, { where: { parentId: { [Op.in]: postIds } }, transaction: t }).catch(() => {});
        await DiscussionPost.destroy({ where: { id: { [Op.in]: postIds } }, transaction: t }).catch(() => {});
      }
      await DiscussionPost.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 8. Progress, Gating, Submissions, Verifications, Feedbacks & Attendance
      await QuizProgress.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await LessonProgress.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await AssessmentSubmission.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await QuizRecording.destroy({
        where: { [Op.or]: [{ participantId: { [Op.in]: eligibleIds } }, { trainerId: { [Op.in]: eligibleIds } }] },
        transaction: t,
      }).catch(() => {});
      await QuizResultsAudit.destroy({ where: { performedBy: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await QuizAssignment.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await AssessmentVerificationSession.destroy({
        where: { participant_id: { [Op.in]: eligibleIds } },
        transaction: t,
      }).catch(() => {});
      await AttendanceRecord.destroy({
        where: { [Op.or]: [{ studentId: { [Op.in]: eligibleIds } }, { markedBy: { [Op.in]: eligibleIds } }] },
        transaction: t,
      }).catch(() => {});
      await UserBadge.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await Certificate.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await ParticipantTracking.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // Survey answers linked to feedbacks
      const userFeedbacks = await Feedback.findAll({
        where: { participantId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const fbIds = userFeedbacks.map(f => f.id);
      if (fbIds.length > 0) {
        await SurveyAnswer.destroy({ where: { feedbackId: { [Op.in]: fbIds } }, transaction: t }).catch(() => {});
      }
      await Feedback.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await Enrollment.destroy({ where: { participantId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 9. Profiles
      const userProfiles = await UserProfile.findAll({
        where: { userId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t,
      }).catch(() => []);
      const upIds = userProfiles.map(u => u.id);
      if (upIds.length > 0) {
        await ProfileSkill.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await ProfileExperience.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await ProfileEducation.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await ProfileCertificate.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await ProfileProject.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await ProfileContactLink.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await ProfileActivityLog.destroy({ where: { profileId: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
        await UserProfile.destroy({ where: { id: { [Op.in]: upIds } }, transaction: t }).catch(() => {});
      }
      await UserProfile.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await ParticipantProfile.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await TrainerEducation.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await TrainerExperience.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await TrainerProfile.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await CourseTrainerAssignment.destroy({ where: { trainerId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await TrainingTrainerAssignment.destroy({ where: { trainerId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 10. Auth, Sessions, Messages, Notifications, Logs
      await RegistrationApplication.destroy({
        where: { [Op.or]: [{ userId: { [Op.in]: eligibleIds } }, { trainerId: { [Op.in]: eligibleIds } }, { reviewerId: { [Op.in]: eligibleIds } }] },
        transaction: t,
      }).catch(() => {});
      await ChatMessage.destroy({ where: { senderId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await Note.destroy({ where: { trainerId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await Notification.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await DeviceFingerprint.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await ActivityLog.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await AuditLog.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await UserSession.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      await RefreshToken.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
      const emails = participants.map(p => p.email).filter(Boolean);
      if (emails.length > 0) {
        await PasswordResetOtp.destroy({ where: { email: { [Op.in]: emails } }, transaction: t }).catch(() => {});
      }
      await Attendance.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

      // 11. Finally destroy User records
      await User.destroy({ where: { id: { [Op.in]: eligibleIds } }, transaction: t });

      await t.commit();
      invalidateSummaryCache();

      return res.json({
        success: true,
        message: `Successfully deleted ${eligibleIds.length} participant(s).${failed.length > 0 ? ` ${failed.length} participant(s) could not be deleted due to dependencies.` : ''}`,
        summary: {
          total: validIds.length,
          deleted: eligibleIds.length,
          failed: failed.length
        },
        deletedIds: eligibleIds,
        failed
      });

    } catch (err) {
      if (t && !t.finished) await t.rollback();
      console.error('Bulk delete participants transaction error:', err);
      return res.status(500).json({ success: false, error: 'Database error during participant bulk delete.' });
    }

  } catch (error) {
    console.error('bulkDeleteParticipants error:', error.message);
    res.status(500).json({ success: false, error: 'Server error bulk deleting participants' });
  }
};

const bulkDeleteTrainers = async (req, res) => {
  const { ids, force = false } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide an array of trainer IDs to delete.' });
  }

  const validIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
  if (validIds.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid trainer IDs provided.' });
  }

  const { Op } = require('sequelize');
  const {
    User, TrainerProfile, TrainerEducation, TrainerExperience, UserProfile,
    TrainingTrainerAssignment, CourseTrainerAssignment,
    Course, Lesson, Note, AIDocument, AIQuiz, LiveSession,
    DiscussionPost, Notification, Training, DeviceFingerprint, ChatMessage,
    Attendance, ActivityLog, UserSession, RefreshToken, CodingAssessment,
    QuizRecording, RegistrationApplication, PasswordResetOtp, AssessmentSession,
    QuizResultsAudit
  } = require('../models');

  const { sequelize } = require('../config/db');

  try {
    const trainers = await User.findAll({
      where: { id: { [Op.in]: validIds }, role: 'TRAINER', isDeleted: false }
    });

    if (trainers.length === 0) {
      return res.status(404).json({ success: false, error: 'No matching active trainers found.' });
    }

    const failed = [];
    const eligibleIds = [];
    const softDeleteIds = [];

    for (const trainer of trainers) {
      const trId = trainer.id;

      // Check referenced content
      const [courses, trainingsList, lessons, quizzes, liveSessions, codingAssessments] = await Promise.all([
        Course.findAll({ where: { trainerId: trId }, attributes: ['title'] }).catch(() => []),
        Training.findAll({ where: { trainerId: trId }, attributes: ['title'] }).catch(() => []),
        Lesson.findAll({ where: { trainerId: trId }, attributes: ['title'] }).catch(() => []),
        AIQuiz.findAll({ where: { [Op.or]: [{ trainerId: trId }, { createdBy: trId }] }, attributes: ['title'] }).catch(() => []),
        LiveSession.findAll({ where: { trainerId: trId }, attributes: ['title'] }).catch(() => []),
        CodingAssessment.findAll({ where: { trainerId: trId }, attributes: ['title'] }).catch(() => [])
      ]);

      const hasContent = courses.length > 0 || trainingsList.length > 0 || lessons.length > 0 || quizzes.length > 0 || liveSessions.length > 0 || codingAssessments.length > 0;

      if (hasContent && !force) {
        const assignedItems = [];
        if (courses.length > 0) assignedItems.push(`${courses.length} course(s) (${courses.map(c => c.title).slice(0, 2).join(', ')})`);
        if (trainingsList.length > 0) assignedItems.push(`${trainingsList.length} training program(s) (${trainingsList.map(t => t.title).slice(0, 2).join(', ')})`);
        if (lessons.length > 0) assignedItems.push(`${lessons.length} lesson(s)`);
        if (quizzes.length > 0) assignedItems.push(`${quizzes.length} quiz(zes)`);

        failed.push({
          id: trId,
          name: trainer.name || trainer.email,
          reason: `Trainer is assigned to active LMS content: ${assignedItems.join('; ')}`
        });
        continue;
      }

      if (hasContent && force) {
        softDeleteIds.push(trId);
      } else {
        eligibleIds.push(trId);
      }
    }

    if (eligibleIds.length === 0 && softDeleteIds.length === 0) {
      return res.json({
        success: false,
        message: 'None of the selected trainers could be deleted due to active course/training assignments.',
        summary: { total: validIds.length, deleted: 0, failed: failed.length },
        deletedIds: [],
        failed
      });
    }

    const t = await sequelize.transaction();
    try {
      const allDeletingIds = [...eligibleIds, ...softDeleteIds];

      // Clean assignments & auth sessions for all deleting trainers
      if (CourseTrainerAssignment) await CourseTrainerAssignment.destroy({ where: { trainerId: { [Op.in]: allDeletingIds } }, transaction: t }).catch(() => {});
      if (TrainingTrainerAssignment) await TrainingTrainerAssignment.destroy({ where: { trainerId: { [Op.in]: allDeletingIds } }, transaction: t }).catch(() => {});
      if (DeviceFingerprint) await DeviceFingerprint.destroy({ where: { userId: { [Op.in]: allDeletingIds } }, transaction: t }).catch(() => {});
      if (UserSession) await UserSession.destroy({ where: { userId: { [Op.in]: allDeletingIds } }, transaction: t }).catch(() => {});
      if (RefreshToken) await RefreshToken.destroy({ where: { userId: { [Op.in]: allDeletingIds } }, transaction: t }).catch(() => {});
      if (Notification) await Notification.destroy({ where: { userId: { [Op.in]: allDeletingIds } }, transaction: t }).catch(() => {});

      // For soft-delete candidates (have content references)
      for (const sId of softDeleteIds) {
        const tr = trainers.find(item => item.id === sId);
        const timestamp = Date.now();
        const anonymizedEmail = `${tr.email}__deleted_${timestamp}`;
        const anonymizedUsername = tr.username ? `${tr.username}__deleted_${timestamp}` : null;
        await User.update(
          { isDeleted: true, status: 'INACTIVE', deletedAt: new Date(), email: anonymizedEmail, username: anonymizedUsername },
          { where: { id: sId }, transaction: t }
        );
      }

      // For hard-delete candidates (no permanent references)
      if (eligibleIds.length > 0) {
        if (RegistrationApplication) {
          await RegistrationApplication.update({ reviewerId: null }, { where: { reviewerId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
          await RegistrationApplication.update({ trainerId: null }, { where: { trainerId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
          await RegistrationApplication.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        }
        if (AssessmentSession) await AssessmentSession.update({ resetByAdmin: null }, { where: { resetByAdmin: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (QuizRecording) await QuizRecording.destroy({ where: { trainerId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (QuizResultsAudit) await QuizResultsAudit.destroy({ where: { performedBy: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (ChatMessage) await ChatMessage.destroy({ where: { senderId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (Attendance) await Attendance.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (ActivityLog) await ActivityLog.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (TrainerEducation) await TrainerEducation.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (TrainerExperience) await TrainerExperience.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (TrainerProfile) await TrainerProfile.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});
        if (UserProfile) await UserProfile.destroy({ where: { userId: { [Op.in]: eligibleIds } }, transaction: t }).catch(() => {});

        const isMySql = sequelize.getDialect() === 'mysql';
        if (isMySql) await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t }).catch(() => {});
        await User.destroy({ where: { id: { [Op.in]: eligibleIds } }, transaction: t });
        if (isMySql) await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t }).catch(() => {});
      }

      await t.commit();

      const deletedCount = allDeletingIds.length;
      return res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} trainer(s).${failed.length > 0 ? ` ${failed.length} trainer(s) were protected due to active content.` : ''}`,
        summary: {
          total: validIds.length,
          deleted: deletedCount,
          failed: failed.length
        },
        deletedIds: allDeletingIds,
        failed
      });

    } catch (err) {
      await t.rollback();
      console.error('Bulk delete trainers transaction error:', err);
      return res.status(500).json({ success: false, error: 'Database transaction error during trainer bulk delete.' });
    }

    } catch (error) {
    console.error('bulkDeleteTrainers error:', error.message);
    res.status(500).json({ success: false, error: 'Server error bulk deleting trainers' });
  }
};
const bulkDeleteTrainings = async (req, res) => {
  const { ids, force = false } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide an array of training IDs to delete.' });
  }

  const validIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
  if (validIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Please provide valid training IDs.' });
  }

  const { Op } = require('sequelize');
  const {
    Training, Course, CourseTrainerAssignment, Certificate, Enrollment,
    Lesson, LessonMaterial, LessonQuiz, QuizProgress, LessonAssessment,
    AssessmentSubmission, LessonProgress, ParticipantTracking, AIQuiz,
    AIQuestion, AIQuestionOption, QuizAttempt, QuizAnswer, QuizResult,
    QuizAssignment, QuizCopyViolation, QuizResultsAudit, QuizRecording,
    AssessmentSession, ExamSession, Violation, ProctorActivity, Screenshot,
    LiveSession, Note, AIDocument, DiscussionPost, RegistrationApplication,
    TrainingTrainerAssignment, CodingAssessment, CodingProblem, CodingTestCase,
    CodingAttempt, CodingSubmission, CodingResult, Feedback,
    QuizAiHelp, CodingAiHelp, CodingProblemLanguage, MonitorAttempt,
    AttendanceRecord, AttendanceSession
  } = require('../models');

  const { sequelize } = require('../config/db');

  try {
    const trainings = await Training.findAll({
      where: {
        [Op.or]: [
          { id: { [Op.in]: validIds } },
          { id: { [Op.in]: ids.map(String) } }
        ]
      }
    });

    if (trainings.length === 0) {
      if (cacheService?.delByPrefix) {
        cacheService.delByPrefix('trainings:');
      }
      return res.json({
        success: true,
        message: 'The selected training session(s) have already been removed.',
        summary: { total: validIds.length, deleted: validIds.length, failed: 0 },
        deletedIds: validIds,
        failed: []
      });
    }

    const failed = [];
    const eligibleIds = [];

    for (const training of trainings) {
      const trId = training.id;

      if (!force) {
        const enrolledCount = await Enrollment.count({ where: { trainingId: trId, status: { [require('sequelize').Op.in]: ['APPROVED', 'ENROLLED', 'COMPLETED'] } } }).catch(() => 0);
        const feedbackCount = await Feedback.count({ where: { trainingId: trId } }).catch(() => 0);
        const quizCount = await AIQuiz.count({ where: { trainingId: trId } }).catch(() => 0);

        if (enrolledCount > 0 || (feedbackCount > 0 && quizCount > 0)) {
          const reasons = [];
          if (enrolledCount > 0) reasons.push(`${enrolledCount} enrolled participant(s)`);
          if (feedbackCount > 0) reasons.push(`${feedbackCount} feedback response(s)`);
          if (quizCount > 0) reasons.push(`${quizCount} active quiz(zes)`);

          failed.push({
            id: trId,
            title: training.title,
            reason: `Training has active records: ${reasons.join(', ')}`
          });
          continue;
        }
      }

      eligibleIds.push(trId);
    }

    if (eligibleIds.length === 0) {
      return res.json({
        success: false,
        message: 'None of the selected trainings could be deleted due to enrolled participants or dependent records.',
        summary: { total: validIds.length, deleted: 0, failed: failed.length },
        deletedIds: [],
        failed
      });
    }

    // Cascade deletion of eligible trainings in managed transaction
    const t = await sequelize.transaction();
    try {
      // Find all associated courses
      const courses = await Course.findAll({
        where: { trainingProgramId: { [Op.in]: eligibleIds } },
        attributes: ['id'],
        transaction: t
      });
      const courseIds = courses.map(c => c.id);

      // 1. Quizzes (both course-scoped and training-scoped)
      const quizWhere = [];
      if (courseIds.length > 0) quizWhere.push({ courseId: { [Op.in]: courseIds } });
      quizWhere.push({ trainingId: { [Op.in]: eligibleIds } });

      const quizzes = await AIQuiz.findAll({ where: { [Op.or]: quizWhere }, attributes: ['id'], transaction: t });
      const quizIds = quizzes.map(q => q.id);

      if (quizIds.length > 0) {
        const aiQuestions = await AIQuestion.findAll({ where: { quizId: { [Op.in]: quizIds } }, attributes: ['id'], transaction: t });
        const aiQuestionIds = aiQuestions.map(q => q.id);

        const attempts = await QuizAttempt.findAll({ where: { quizId: { [Op.in]: quizIds } }, attributes: ['id'], transaction: t });
        const attemptIds = attempts.map(a => a.id);

        // A. Delete quiz_ai_help first (references both attemptId and questionId)
        if (QuizAiHelp) {
          await QuizAiHelp.destroy({
            where: {
              [Op.or]: [
                attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                aiQuestionIds.length > 0 ? { questionId: { [Op.in]: aiQuestionIds } } : null,
              ].filter(Boolean)
            },
            transaction: t
          });
        }

        // B. Delete quiz answers (references both attemptId and questionId)
        if (QuizAnswer) {
          await QuizAnswer.destroy({
            where: {
              [Op.or]: [
                attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                aiQuestionIds.length > 0 ? { questionId: { [Op.in]: aiQuestionIds } } : null,
              ].filter(Boolean)
            },
            transaction: t
          });
        }

        // C. Delete question options, then questions
        if (aiQuestionIds.length > 0 && AIQuestionOption) {
          await AIQuestionOption.destroy({ where: { questionId: { [Op.in]: aiQuestionIds } }, transaction: t });
        }
        if (aiQuestionIds.length > 0 && AIQuestion) {
          await AIQuestion.destroy({ where: { id: { [Op.in]: aiQuestionIds } }, transaction: t });
        }

        // D. Attempt children (sessions, violations, results, proctoring)
        if (attemptIds.length > 0) {
          if (QuizCopyViolation) await QuizCopyViolation.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
          if (QuizResult) await QuizResult.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
          if (AssessmentSession) await AssessmentSession.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });

          if (ExamSession) {
            const examSessions = await ExamSession.findAll({ where: { attemptId: { [Op.in]: attemptIds } }, attributes: ['id'], transaction: t });
            const sessionIds = examSessions.map(s => s.id);
            if (sessionIds.length > 0) {
              if (Violation) await Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
              if (ProctorActivity) await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
              if (Screenshot) await Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
              await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } }, transaction: t });
            }
          }
          await QuizAttempt.destroy({ where: { id: { [Op.in]: attemptIds } }, transaction: t });
        }

        // Direct quiz references
        if (QuizAssignment) await QuizAssignment.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (QuizCopyViolation) await QuizCopyViolation.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (QuizResultsAudit) await QuizResultsAudit.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (QuizRecording) await QuizRecording.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (QuizResult) await QuizResult.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (AssessmentSession) await AssessmentSession.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (MonitorAttempt) await MonitorAttempt.destroy({ where: { testId: { [Op.in]: quizIds } }, transaction: t });
        if (Feedback) await Feedback.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });
        if (LessonQuiz) await LessonQuiz.destroy({ where: { quizId: { [Op.in]: quizIds } }, transaction: t });

        await AIQuiz.destroy({ where: { id: { [Op.in]: quizIds } }, transaction: t });
      }

      // 2. Coding Assessments (both course and training scoped)
      const caWhere = [];
      if (courseIds.length > 0) caWhere.push({ courseId: { [Op.in]: courseIds } });
      caWhere.push({ trainingId: { [Op.in]: eligibleIds } });

      if (CodingAssessment) {
        const caList = await CodingAssessment.findAll({ where: { [Op.or]: caWhere }, attributes: ['id'], transaction: t });
        const caIds = caList.map(c => c.id);

        if (caIds.length > 0) {
          const probs = await CodingProblem.findAll({ where: { assessmentId: { [Op.in]: caIds } }, attributes: ['id'], transaction: t });
          const probIds = probs.map(p => p.id);

          const attempts = await CodingAttempt.findAll({ where: { assessmentId: { [Op.in]: caIds } }, attributes: ['id'], transaction: t });
          const attemptIds = attempts.map(a => a.id);

          // A. Coding AI Help (references problemId and attemptId)
          if (CodingAiHelp) {
            await CodingAiHelp.destroy({
              where: {
                [Op.or]: [
                  attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                  probIds.length > 0 ? { problemId: { [Op.in]: probIds } } : null,
                ].filter(Boolean)
              },
              transaction: t
            });
          }

          // B. Coding Submissions (references problemId and attemptId)
          if (CodingSubmission) {
            await CodingSubmission.destroy({
              where: {
                [Op.or]: [
                  attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                  probIds.length > 0 ? { problemId: { [Op.in]: probIds } } : null,
                ].filter(Boolean)
              },
              transaction: t
            });
          }

          // C. Coding Results
          if (CodingResult) {
            await CodingResult.destroy({
              where: {
                [Op.or]: [
                  { assessmentId: { [Op.in]: caIds } },
                  attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
                ].filter(Boolean)
              },
              transaction: t
            });
          }

          // D. Sessions referencing codingAttemptId
          if (attemptIds.length > 0) {
            if (AssessmentSession) {
              await AssessmentSession.destroy({ where: { codingAttemptId: { [Op.in]: attemptIds } }, transaction: t });
            }
            if (ExamSession) {
              await ExamSession.destroy({ where: { codingAttemptId: { [Op.in]: attemptIds } }, transaction: t });
            }
            await CodingAttempt.destroy({ where: { id: { [Op.in]: attemptIds } }, transaction: t });
          }

          // E. Problem languages & test cases, then problems
          if (probIds.length > 0) {
            if (CodingProblemLanguage) {
              await CodingProblemLanguage.destroy({ where: { problemId: { [Op.in]: probIds } }, transaction: t });
            }
            if (CodingTestCase) {
              await CodingTestCase.destroy({ where: { problemId: { [Op.in]: probIds } }, transaction: t });
            }
            await CodingProblem.destroy({ where: { id: { [Op.in]: probIds } }, transaction: t });
          }

          // F. Assessment Sessions and Exam Sessions
          if (AssessmentSession) {
            await AssessmentSession.destroy({ where: { assessmentId: { [Op.in]: caIds } }, transaction: t });
          }
          if (ExamSession) {
            const caExamSessions = await ExamSession.findAll({ where: { assessmentId: { [Op.in]: caIds } }, attributes: ['id'], transaction: t });
            const caSessionIds = caExamSessions.map(es => es.id);
            if (caSessionIds.length > 0) {
              if (Violation) await Violation.destroy({ where: { sessionId: { [Op.in]: caSessionIds } }, transaction: t });
              if (ProctorActivity) await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: caSessionIds } }, transaction: t });
              if (Screenshot) await Screenshot.destroy({ where: { sessionId: { [Op.in]: caSessionIds } }, transaction: t });
              await ExamSession.destroy({ where: { id: { [Op.in]: caSessionIds } }, transaction: t });
            }
          }

          await CodingAssessment.destroy({ where: { id: { [Op.in]: caIds } }, transaction: t });
        }
      }

      // 3. Lessons & Course Children
      if (courseIds.length > 0) {
        if (CourseTrainerAssignment) await CourseTrainerAssignment.destroy({ where: { courseId: { [Op.in]: courseIds } }, transaction: t });
        if (Certificate) await Certificate.destroy({ where: { courseId: { [Op.in]: courseIds } }, transaction: t });
        if (Enrollment) await Enrollment.destroy({ where: { courseId: { [Op.in]: courseIds } }, transaction: t });
        if (Feedback) await Feedback.destroy({ where: { courseId: { [Op.in]: courseIds } }, transaction: t });
        if (AttendanceRecord) await AttendanceRecord.destroy({ where: { courseId: { [Op.in]: courseIds } }, transaction: t });
        if (AttendanceSession) await AttendanceSession.destroy({ where: { courseId: { [Op.in]: courseIds } }, transaction: t });

        const lessons = await Lesson.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id'], transaction: t });
        const lessonIds = lessons.map(l => l.id);

        if (lessonIds.length > 0) {
          if (LessonMaterial) await LessonMaterial.destroy({ where: { lessonId: { [Op.in]: lessonIds } }, transaction: t });
          if (QuizProgress) await QuizProgress.destroy({ where: { lessonQuizId: { [Op.in]: lessonIds } }, transaction: t });
          if (LessonQuiz) await LessonQuiz.destroy({ where: { lessonId: { [Op.in]: lessonIds } }, transaction: t });

          if (LessonAssessment) {
            const assessments = await LessonAssessment.findAll({ where: { lessonId: { [Op.in]: lessonIds } }, attributes: ['id'], transaction: t });
            const assessmentIds = assessments.map(a => a.id);
            if (assessmentIds.length > 0) {
              if (AssessmentSubmission) await AssessmentSubmission.destroy({ where: { assessmentId: { [Op.in]: assessmentIds } }, transaction: t });
              await LessonAssessment.destroy({ where: { id: { [Op.in]: assessmentIds } }, transaction: t });
            }
          }
          if (LessonProgress) await LessonProgress.destroy({ where: { lessonId: { [Op.in]: lessonIds } }, transaction: t });
          if (ParticipantTracking) await ParticipantTracking.destroy({ where: { lessonId: { [Op.in]: lessonIds } }, transaction: t });

          await Lesson.destroy({ where: { id: { [Op.in]: lessonIds } }, transaction: t });
        }

        await Course.destroy({ where: { id: { [Op.in]: courseIds } }, transaction: t });
      }

      // 4. Direct Training Children
      if (DiscussionPost) await DiscussionPost.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (Feedback) await Feedback.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (Enrollment) await Enrollment.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (LiveSession) await LiveSession.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (Note) await Note.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (AIDocument) await AIDocument.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (TrainingTrainerAssignment) await TrainingTrainerAssignment.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (Certificate) await Certificate.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (ParticipantTracking) await ParticipantTracking.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });
      if (RegistrationApplication) await RegistrationApplication.destroy({ where: { trainingId: { [Op.in]: eligibleIds } }, transaction: t });

      // 5. Finally, destroy trainings
      await Training.destroy({ where: { id: { [Op.in]: eligibleIds } }, transaction: t });

      await t.commit();

      if (cacheService?.delByPrefix) {
        cacheService.delByPrefix('trainings:');
      }

      return res.json({
        success: true,
        message: `Successfully deleted ${eligibleIds.length} training session(s).${failed.length > 0 ? ` ${failed.length} training(s) could not be deleted due to dependencies.` : ''}`,
        summary: {
          total: validIds.length,
          deleted: eligibleIds.length,
          failed: failed.length
        },
        deletedIds: eligibleIds,
        failed
      });

    } catch (err) {
      await t.rollback();
      console.error('Bulk delete trainings transaction error:', err);
      return res.status(500).json({ success: false, error: 'Database transaction error during training bulk delete.' });
    }

  } catch (error) {
    console.error('bulkDeleteTrainings error:', error.message);
    res.status(500).json({ success: false, error: 'Server error bulk deleting trainings' });
  }
};

module.exports = {
  updateTraining,
  deleteTraining,
  updateTrainer,
  deleteTrainer,
  getStats,
  getParticipants,
  createParticipant,
  sendReminders,
  deleteParticipant,
  bulkDeleteParticipants,
  bulkDeleteTrainers,
  bulkDeleteTrainings,
  exportFeedbacksCSV,
  getTrainingStats,
  getPendingParticipants,
  approveParticipant,
  rejectParticipant,
  approveTrainer,
  rejectTrainer,
  getPendingTrainers
};