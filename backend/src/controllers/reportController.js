const {
  User, Training, Lesson, Enrollment, Feedback, AIQuiz, QuizResult,
  AssessmentSubmission, LessonProgress, Certificate, ParticipantTracking,
  LessonAssessment, Course, TrainingTrainerAssignment, CourseTrainerAssignment
} = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

// GET /api/reports/admin
const getAdminReport = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      adminCount,
      trainerCount,
      participantCount,
      totalTrainings,
      totalLessons,
      avgCompletion,
      enrolledParticipantsCount,
      trainerPerformance,
      activeUsersCount
    ] = await Promise.all([
      User.count({ where: { isDeleted: false } }),
      User.count({ where: { role: 'ADMIN', isDeleted: false } }),
      User.count({ where: { role: 'TRAINER', isDeleted: false } }),
      User.count({ where: { role: 'PARTICIPANT', isDeleted: false } }),
      Training.count(),
      Lesson.count(),
      Enrollment.aggregate('progressPercent', 'AVG', { where: { status: 'ENROLLED' } }),
      Enrollment.count({ distinct: true, col: 'participant_id', where: { status: 'ENROLLED' } }),
      Feedback.findAll({
        attributes: [
          [sequelize.col('training->trainer.id'), 'trainerId'],
          [sequelize.col('training->trainer.name'), 'trainerName'],
          [sequelize.fn('AVG', sequelize.col('trainerRating')), 'avgTrainerRating'],
          [sequelize.fn('AVG', sequelize.col('subjectRating')), 'avgSubjectRating'],
          [sequelize.fn('COUNT', sequelize.col('Feedbacks.id')), 'feedbackCount']
        ],
        include: [{
          model: Training,
          as: 'training',
          attributes: [],
          include: [{
            model: User,
            as: 'trainer',
            attributes: []
          }]
        }],
        group: ['training->trainer.id', 'training->trainer.name'],
        raw: true
      }),
      ParticipantTracking.count({
        distinct: true,
        col: 'user_id',
        where: {
          lastActivity: { [Op.gte]: thirtyDaysAgo }
        }
      })
    ]);

    const usersByRole = {
      admin: adminCount,
      trainer: trainerCount,
      participant: participantCount
    };

    const enrollmentRate = participantCount > 0 ? (enrolledParticipantsCount / participantCount) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        usersByRole,
        totalTrainings,
        totalLessons,
        completionRate: Number(Number(avgCompletion || 0).toFixed(1)),
        enrollmentRate: Number(Number(enrollmentRate).toFixed(1)),
        trainerPerformance: trainerPerformance.map(tp => ({
          trainerId: tp.trainerId,
          trainerName: tp.trainerName || 'Unknown',
          avgTrainerRating: Number(Number(tp.avgTrainerRating || 0).toFixed(1)),
          avgSubjectRating: Number(Number(tp.avgSubjectRating || 0).toFixed(1)),
          feedbackCount: tp.feedbackCount
        })),
        activeUsers: activeUsersCount
      }
    });
  } catch (error) {
    console.error('Admin report error:', error.message);
    res.status(500).json({ error: 'Server error generating admin report' });
  }
};

// GET /api/reports/trainer
const getTrainerReport = async (req, res) => {
  try {
    if (req.user.role !== 'TRAINER' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Trainer role required' });
    }

    const trainerId = req.user.id;

    // Resolve course IDs from CourseTrainerAssignment + primary trainerId
    const courseAssignments = await CourseTrainerAssignment.findAll({
      where: { trainerId },
      attributes: ['courseId']
    });
    const assignedCourseIds = courseAssignments.map(a => a.courseId);
    const courses = await Course.findAll({
      where: {
        [Op.or]: [
          { trainerId },
          { id: { [Op.in]: assignedCourseIds } }
        ]
      },
      attributes: ['id', 'title', 'trainingProgramId']
    });
    const courseIds = courses.map(c => c.id);
    const courseTrainingIds = courses.map(c => c.trainingProgramId);

    // Resolve training IDs from TrainingTrainerAssignment + primary trainerId + courseTrainingIds
    const assignments = await TrainingTrainerAssignment.findAll({
      where: { trainerId },
      attributes: ['trainingId']
    });
    const assignedTrainingIds = assignments.map(a => a.trainingId);

    const allTrainingIds = Array.from(new Set([...assignedTrainingIds, ...courseTrainingIds]));

    const trainings = await Training.findAll({
      where: {
        [Op.or]: [
          { trainerId },
          { id: { [Op.in]: allTrainingIds } }
        ]
      },
      attributes: ['id']
    });
    const trainingIds = trainings.map(t => t.id);

    // 1. Participant Progress
    const enrollments = await Enrollment.findAll({
      where: {
        status: 'ENROLLED',
        [Op.or]: [
          { trainingId: { [Op.in]: trainingIds } },
          { courseId: { [Op.in]: courseIds } }
        ]
      },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] }
      ]
    });

    const participantProgress = await Promise.all(enrollments.map(async e => {
      let totalLessons = 0;
      let completedLessons = 0;

      if (e.courseId) {
        totalLessons = await Lesson.count({ where: { courseId: e.courseId } });
        completedLessons = totalLessons > 0 ? await LessonProgress.count({
          where: {
            participantId: e.participantId,
            status: 'COMPLETED',
            lessonId: {
              [Op.in]: sequelize.literal(`(SELECT id FROM lessons WHERE course_id = ${e.courseId})`)
            }
          }
        }) : 0;
      } else if (e.trainingId) {
        totalLessons = await Lesson.count({ where: { trainingId: e.trainingId } });
        completedLessons = totalLessons > 0 ? await LessonProgress.count({
          where: {
            participantId: e.participantId,
            status: 'COMPLETED',
            lessonId: {
              [Op.in]: sequelize.literal(`(SELECT id FROM lessons WHERE training_id = ${e.trainingId})`)
            }
          }
        }) : 0;
      }

      // Average Quiz Score for this enrollment
      const avgQuizScore = await QuizResult.aggregate('percentage', 'AVG', {
        where: {
          participantId: e.participantId,
          quizId: {
            [Op.in]: sequelize.literal(e.courseId
              ? `(SELECT id FROM ai_quizzes WHERE course_id = ${e.courseId})`
              : `(SELECT id FROM ai_quizzes WHERE training_id = ${e.trainingId})`
            )
          }
        }
      }) || 0;

      return {
        participantId: e.participant?.id,
        participantName: e.participant?.name || 'Unknown',
        participantEmail: e.participant?.email,
        title: e.course?.title || e.training?.title || 'Unknown',
        type: e.courseId ? 'Course' : 'Training',
        completedLessons,
        totalLessons,
        progressPercent: Number(Number(e.progressPercent).toFixed(1)),
        avgQuizScore: Number(Number(avgQuizScore).toFixed(1))
      };
    }));

    // 2, 3, 4. Parallelize Quiz Scores, Assessment Scores, and Pending Reviews
    const [quizScores, assessmentScores, pendingReviews] = await Promise.all([
      QuizResult.findAll({
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
          {
            model: AIQuiz,
            as: 'quiz',
            attributes: ['id', 'title'],
            where: {
              [Op.or]: [
                { courseId: { [Op.in]: courseIds } },
                { trainingId: { [Op.in]: trainingIds } }
              ]
            }
          }
        ],
        order: [['created_at', 'DESC']],
        limit: 100
      }),
      AssessmentSubmission.findAll({
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
          {
            model: LessonAssessment,
            as: 'assessment',
            attributes: ['id', 'title', 'maxScore'],
            include: [{
              model: Lesson,
              as: 'lesson',
              attributes: [],
              where: {
                [Op.or]: [
                  { courseId: { [Op.in]: courseIds } },
                  { trainingId: { [Op.in]: trainingIds } }
                ]
              }
            }]
          }
        ],
        where: {
          status: ['REVIEWED', 'PUBLISHED']
        },
        order: [['updated_at', 'DESC']],
        limit: 100
      }),
      AssessmentSubmission.findAll({
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
          {
            model: LessonAssessment,
            as: 'assessment',
            attributes: ['id', 'title', 'maxScore'],
            include: [{
              model: Lesson,
              as: 'lesson',
              attributes: [],
              where: {
                [Op.or]: [
                  { courseId: { [Op.in]: courseIds } },
                  { trainingId: { [Op.in]: trainingIds } }
                ]
              }
            }]
          }
        ],
        where: {
          status: 'SUBMITTED'
        },
        order: [['created_at', 'ASC']]
      })
    ]);

    // 5. Average Completion
    const avgCompletion = enrollments.length > 0
      ? enrollments.reduce((sum, e) => sum + Number(e.progressPercent || 0), 0) / enrollments.length
      : 0;

    res.json({
      success: true,
      data: {
        participantProgress,
        quizScores: quizScores.map(qs => ({
          participantName: qs.participant?.name || 'Unknown',
          quizTitle: qs.quiz?.title || 'Quiz',
          score: Number(Number(qs.percentage).toFixed(1)),
          date: qs.created_at
        })),
        assessmentScores: assessmentScores.map(as => ({
          participantName: as.participant?.name || 'Unknown',
          assessmentTitle: as.assessment?.title || 'Assessment',
          score: as.score,
          maxScore: as.assessment?.maxScore || 100,
          status: as.status,
          date: as.updated_at
        })),
        pendingReviews: pendingReviews.map(pr => ({
          submissionId: pr.id,
          participantName: pr.participant?.name || 'Unknown',
          assessmentTitle: pr.assessment?.title || 'Assessment',
          maxScore: pr.assessment?.maxScore || 100,
          date: pr.created_at
        })),
        averageCompletion: Number(Number(avgCompletion).toFixed(1))
      }
    });
  } catch (error) {
    console.error('Trainer report error:', error.message);
    res.status(500).json({ error: 'Server error generating trainer report' });
  }
};

// GET /api/reports/participant
const getParticipantReport = async (req, res) => {
  try {
    const participantId = req.user.id;
    const { LessonQuiz } = require('../models');

    // 1, 2, 3, 4. Fetch all top-level sets in parallel
    const [enrollments, certificates, quizResults, assessmentHistory] = await Promise.all([
      Enrollment.findAll({
        where: { participantId, status: 'ENROLLED' },
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ]
      }),
      Certificate.findAll({
        where: { userId: participantId },
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ],
        order: [['issuedAt', 'DESC']]
      }),
      QuizResult.findAll({
        where: { participantId },
        include: [
          { model: AIQuiz, as: 'quiz', attributes: ['id', 'title'] }
        ],
        order: [['created_at', 'DESC']]
      }),
      AssessmentSubmission.findAll({
        where: { participantId },
        include: [
          { model: LessonAssessment, as: 'assessment', attributes: ['id', 'title', 'maxScore'] }
        ],
        order: [['created_at', 'DESC']]
      })
    ]);

    const certLookupMap = new Map();
    certificates.forEach(c => {
      if (c.courseId) certLookupMap.set(`c_${c.courseId}`, c);
      if (c.trainingId) certLookupMap.set(`t_${c.trainingId}`, c);
    });

    const progress = await Promise.all(enrollments.map(async e => {
      let totalLessons = 0;
      let completedLessons = 0;

      if (e.courseId) {
        totalLessons = await Lesson.count({ where: { courseId: e.courseId } });
        completedLessons = totalLessons > 0 ? await LessonProgress.count({
          where: {
            participantId,
            status: 'COMPLETED',
            lessonId: {
              [Op.in]: sequelize.literal(`(SELECT id FROM lessons WHERE course_id = ${e.courseId})`)
            }
          }
        }) : 0;
      } else if (e.trainingId) {
        totalLessons = await Lesson.count({ where: { trainingId: e.trainingId } });
        completedLessons = totalLessons > 0 ? await LessonProgress.count({
          where: {
            participantId,
            status: 'COMPLETED',
            lessonId: {
              [Op.in]: sequelize.literal(`(SELECT id FROM lessons WHERE training_id = ${e.trainingId})`)
            }
          }
        }) : 0;
      }

      const certKey = e.courseId ? `c_${e.courseId}` : `t_${e.trainingId}`;
      const certificate = certLookupMap.get(certKey);

      return {
        id: e.id,
        title: e.course?.title || e.training?.title || 'Unknown',
        type: e.courseId ? 'Course' : 'Training',
        completedLessons,
        totalLessons,
        progressPercent: Number(Number(e.progressPercent).toFixed(1)),
        certificateAvailable: !!certificate,
        certificateCode: certificate?.certificateCode || null
      };
    }));

    const quizIds = quizResults.map(qr => qr.quizId);
    const lessonQuizzes = quizIds.length > 0 ? await LessonQuiz.findAll({
      where: { quizId: { [Op.in]: quizIds } }
    }) : [];
    const lessonQuizMap = new Map(lessonQuizzes.map(lq => [lq.quizId, lq]));

    const quizHistory = quizResults.map(qr => {
      const lessonQuiz = lessonQuizMap.get(qr.quizId);
      const isPublished = lessonQuiz ? lessonQuiz.resultStatus === 'PUBLISHED' : true;

      return {
        quizId: qr.quizId,
        quizTitle: qr.quiz?.title || 'Quiz',
        score: isPublished ? Number(Number(qr.percentage).toFixed(1)) : null,
        isPublished,
        date: qr.created_at
      };
    });

    res.json({
      success: true,
      data: {
        progress,
        certificates: certificates.map(c => ({
          certificateCode: c.certificateCode,
          title: c.course?.title || c.training?.title || 'Training Program',
          issuedAt: c.issuedAt
        })),
        quizHistory,
        assessmentHistory: assessmentHistory.map(ah => ({
          assessmentTitle: ah.assessment?.title || 'Assessment',
          score: ah.status === 'PUBLISHED' || ah.status === 'REVIEWED' ? ah.score : null,
          maxScore: ah.assessment?.maxScore || 100,
          status: ah.status,
          feedback: ah.status === 'PUBLISHED' ? ah.feedback : null,
          date: ah.updated_at
        }))
      }
    });
  } catch (error) {
    console.error('Participant report error:', error.message);
    res.status(500).json({ error: 'Server error generating participant report' });
  }
};

/**
 * GET /api/certificates/verify/:code (Public verification)
 */
const verifyCertificate = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) {
      return res.status(400).json({ success: false, valid: false, error: 'Certificate code is required' });
    }

    const cert = await Certificate.findOne({
      where: { certificateCode: code.trim().toUpperCase() },
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        {
          model: Course,
          as: 'course',
          attributes: ['id', 'title'],
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
        },
        {
          model: Training,
          as: 'training',
          attributes: ['id', 'title'],
          include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }]
        },
      ]
    });

    if (!cert) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Invalid certificate code. No record found.',
      });
    }

    res.json({
      success: true,
      valid: true,
      certificate: {
        code: cert.certificateCode,
        recipientName: cert.user?.name || 'Learner',
        recipientEmail: cert.user?.email,
        courseTitle: cert.course?.title || cert.training?.title || 'Course of Study',
        trainerName: cert.course?.trainer?.name || cert.training?.trainer?.name || 'WAVE INIT Instructor',
        issuedAt: cert.issuedAt,
        status: 'VERIFIED_OFFICIAL',
      }
    });
  } catch (error) {
    console.error('Verify certificate error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to verify certificate' });
  }
};

module.exports = {
  getAdminReport,
  getTrainerReport,
  getParticipantReport,
  verifyCertificate,
};

