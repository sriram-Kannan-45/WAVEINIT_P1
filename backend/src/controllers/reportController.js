const {
  User, Training, Lesson, Enrollment, Feedback, AIQuiz, QuizResult,
  AssessmentSubmission, LessonProgress, Certificate, ParticipantTracking,
  LessonAssessment, Course, TrainingTrainerAssignment, CourseTrainerAssignment
} = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const cacheService = require('../services/cacheService');

// GET /api/reports/admin
const getAdminReport = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    if (req.query.fresh !== 'true') {
      const cached = cacheService.get('report:admin');
      if (cached) return res.json(cached);
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
          [sequelize.fn('AVG', sequelize.col('trainer_rating')), 'avgTrainerRating'],
          [sequelize.fn('AVG', sequelize.col('subject_rating')), 'avgSubjectRating'],
          [sequelize.fn('COUNT', sequelize.col('Feedback.id')), 'feedbackCount']
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
      }).catch(() => []),
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

    const payload = {
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
    };

    cacheService.set('report:admin', payload, 30);
    res.json(payload);
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
    const cacheKey = `report:trainer:${trainerId}`;
    if (req.query.fresh !== 'true') {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }

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

    // 1. Participant Progress (batch pre-fetch to eliminate N+1 queries)
    const eCourseIds = Array.from(new Set(enrollments.map(e => e.courseId).filter(Boolean)));
    const eTrainingIds = Array.from(new Set(enrollments.map(e => e.trainingId).filter(Boolean)));
    const ePartIds = Array.from(new Set(enrollments.map(e => e.participantId).filter(Boolean)));

    const lessonWhere = [];
    if (eCourseIds.length) lessonWhere.push({ courseId: { [Op.in]: eCourseIds } });
    if (eTrainingIds.length) lessonWhere.push({ trainingId: { [Op.in]: eTrainingIds } });

    const [allLessons, allCompletedProgress, allQuizResults] = await Promise.all([
      lessonWhere.length ? Lesson.findAll({
        where: { [Op.or]: lessonWhere },
        attributes: ['id', 'courseId', 'trainingId'],
        raw: true
      }) : [],
      (ePartIds.length && lessonWhere.length) ? LessonProgress.findAll({
        where: {
          participantId: { [Op.in]: ePartIds },
          status: 'COMPLETED'
        },
        attributes: ['participantId', 'lessonId'],
        raw: true
      }) : [],
      (ePartIds.length && lessonWhere.length) ? QuizResult.findAll({
        where: {
          participantId: { [Op.in]: ePartIds }
        },
        include: [{
          model: AIQuiz,
          as: 'quiz',
          attributes: ['id', 'courseId', 'trainingId'],
          where: { [Op.or]: lessonWhere },
          required: true
        }],
        attributes: ['participantId', 'percentage'],
        raw: true
      }) : []
    ]);

    // Build fast in-memory lookup structures
    const courseLessonsMap = new Map();
    const trainingLessonsMap = new Map();
    for (const l of allLessons) {
      if (l.courseId) {
        if (!courseLessonsMap.has(l.courseId)) courseLessonsMap.set(l.courseId, new Set());
        courseLessonsMap.get(l.courseId).add(l.id);
      }
      if (l.trainingId) {
        if (!trainingLessonsMap.has(l.trainingId)) trainingLessonsMap.set(l.trainingId, new Set());
        trainingLessonsMap.get(l.trainingId).add(l.id);
      }
    }

    const participantCompletedLessonsMap = new Map();
    for (const cp of allCompletedProgress) {
      if (!participantCompletedLessonsMap.has(cp.participantId)) {
        participantCompletedLessonsMap.set(cp.participantId, new Set());
      }
      participantCompletedLessonsMap.get(cp.participantId).add(cp.lessonId);
    }

    const participantQuizPercentagesMap = new Map();
    for (const qr of allQuizResults) {
      const cId = qr['quiz.courseId'];
      const tId = qr['quiz.trainingId'];
      const key = cId ? `${qr.participantId}_c${cId}` : `${qr.participantId}_t${tId}`;
      if (!participantQuizPercentagesMap.has(key)) {
        participantQuizPercentagesMap.set(key, []);
      }
      if (qr.percentage != null) {
        participantQuizPercentagesMap.get(key).push(Number(qr.percentage));
      }
    }

    const participantProgress = enrollments.map(e => {
      let totalLessons = 0;
      let completedLessons = 0;
      const completedSet = participantCompletedLessonsMap.get(e.participantId) || new Set();

      if (e.courseId) {
        const lessonIds = courseLessonsMap.get(e.courseId) || new Set();
        totalLessons = lessonIds.size;
        for (const lId of lessonIds) {
          if (completedSet.has(lId)) completedLessons++;
        }
      } else if (e.trainingId) {
        const lessonIds = trainingLessonsMap.get(e.trainingId) || new Set();
        totalLessons = lessonIds.size;
        for (const lId of lessonIds) {
          if (completedSet.has(lId)) completedLessons++;
        }
      }

      const qKey = e.courseId ? `${e.participantId}_c${e.courseId}` : `${e.participantId}_t${e.trainingId}`;
      const scores = participantQuizPercentagesMap.get(qKey) || [];
      const avgQuizScore = scores.length > 0
        ? scores.reduce((sum, val) => sum + val, 0) / scores.length
        : 0;

      return {
        participantId: e.participant?.id,
        participantName: e.participant?.name || 'Unknown',
        participantEmail: e.participant?.email,
        title: e.course?.title || e.training?.title || 'Unknown',
        type: e.courseId ? 'Course' : 'Training',
        completedLessons,
        totalLessons,
        progressPercent: Number(Number(e.progressPercent || 0).toFixed(1)),
        avgQuizScore: Number(Number(avgQuizScore).toFixed(1))
      };
    });

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

    const payload = {
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
    };

    cacheService.set(cacheKey, payload, 30);
    res.json(payload);
  } catch (error) {
    console.error('Trainer report error:', error.message);
    res.status(500).json({ error: 'Server error generating trainer report' });
  }
};

// GET /api/reports/participant
const getParticipantReport = async (req, res) => {
  try {
    const participantId = req.user.id;
    const cacheKey = `report:participant:${participantId}`;
    if (req.query.fresh !== 'true') {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }

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

    const peCourseIds = Array.from(new Set(enrollments.map(e => e.courseId).filter(Boolean)));
    const peTrainingIds = Array.from(new Set(enrollments.map(e => e.trainingId).filter(Boolean)));

    const pLessonWhere = [];
    if (peCourseIds.length) pLessonWhere.push({ courseId: { [Op.in]: peCourseIds } });
    if (peTrainingIds.length) pLessonWhere.push({ trainingId: { [Op.in]: peTrainingIds } });

    const [pAllLessons, pAllCompletedProgress] = await Promise.all([
      pLessonWhere.length ? Lesson.findAll({
        where: { [Op.or]: pLessonWhere },
        attributes: ['id', 'courseId', 'trainingId'],
        raw: true
      }) : [],
      pLessonWhere.length ? LessonProgress.findAll({
        where: {
          participantId,
          status: 'COMPLETED'
        },
        attributes: ['lessonId'],
        raw: true
      }) : []
    ]);

    const pCourseLessonsMap = new Map();
    const pTrainingLessonsMap = new Map();
    for (const l of pAllLessons) {
      if (l.courseId) {
        if (!pCourseLessonsMap.has(l.courseId)) pCourseLessonsMap.set(l.courseId, new Set());
        pCourseLessonsMap.get(l.courseId).add(l.id);
      }
      if (l.trainingId) {
        if (!pTrainingLessonsMap.has(l.trainingId)) pTrainingLessonsMap.set(l.trainingId, new Set());
        pTrainingLessonsMap.get(l.trainingId).add(l.id);
      }
    }
    const pCompletedSet = new Set(pAllCompletedProgress.map(p => p.lessonId));

    const progress = enrollments.map(e => {
      let totalLessons = 0;
      let completedLessons = 0;

      if (e.courseId) {
        const lessonIds = pCourseLessonsMap.get(e.courseId) || new Set();
        totalLessons = lessonIds.size;
        for (const lId of lessonIds) {
          if (pCompletedSet.has(lId)) completedLessons++;
        }
      } else if (e.trainingId) {
        const lessonIds = pTrainingLessonsMap.get(e.trainingId) || new Set();
        totalLessons = lessonIds.size;
        for (const lId of lessonIds) {
          if (pCompletedSet.has(lId)) completedLessons++;
        }
      }

      const certKey = e.courseId ? `c_${e.courseId}` : `t_${e.trainingId}`;
      const certificate = certLookupMap.get(certKey);

      return {
        id: e.id,
        title: e.course?.title || e.training?.title || 'Unknown',
        type: e.courseId ? 'Course' : 'Training',
        completedLessons,
        totalLessons,
        progressPercent: Number(Number(e.progressPercent || 0).toFixed(1)),
        certificateAvailable: !!certificate,
        certificateCode: certificate?.certificateCode || null
      };
    });

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

    const payload = {
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
    };

    cacheService.set(cacheKey, payload, 30);
    res.json(payload);
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

