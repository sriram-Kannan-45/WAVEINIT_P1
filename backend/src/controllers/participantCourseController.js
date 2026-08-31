/**
 * participantCourseController.js
 * ──────────────────────────────
 * Participant-side course-centric endpoints.
 *
 * Visibility rules enforced everywhere:
 *   • A participant can only read lessons / materials / quizzes / assessments
 *     of courses they are currently enrolled in (status = 'ENROLLED').
 *   • Quiz scores are HIDDEN from the participant unless
 *     AIQuiz.result_status = 'PUBLISHED'. The score is still computed and
 *     stored at submission time.
 *   • Assessment scores are HIDDEN until the per-submission status reaches
 *     'PUBLISHED' (trainer publishes after grading).
 *   • Course progress (enrollments.progress_percent) is recomputed after
 *     every lesson view / quiz submit / assessment submit using the
 *     shared recomputeCourseProgress helper.
 */
const { Op } = require('sequelize');
const {
  sequelize,
  Course,
  Training,
  Lesson,
  LessonMaterial,
  LessonAssessment,
  AssessmentSubmission,
  LessonProgress,
  Enrollment,
  AIQuiz,
  AIQuestion,
  QuizAttempt,
  QuizAnswer,
  QuizResult,
  CodingAssessment,
  CodingProblem,
  CodingAttempt,
  CodingResult,
  User,
} = require('../models');

const { gradeAnswer } = require('../utils/gradeAnswer');
const { parsePagination, formatPaginationMeta, formatPaginatedResponse } = require('../utils/paginationHelper');

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadEnrolledCourse(req, res, courseId) {
  const id = parseInt(courseId, 10);
  if (!id) { res.status(422).json({ error: 'Invalid courseId' }); return null; }

  // 1. Try finding course by primary key
  let course = await Course.findByPk(id, {
    include: [{ model: Training, as: 'program', attributes: ['id', 'title'] }],
  });

  // 2. If not found by primary key, check if this ID is a trainingProgramId
  if (!course) {
    course = await Course.findOne({
      where: { trainingProgramId: id },
      include: [{ model: Training, as: 'program', attributes: ['id', 'title'] }],
      order: [['id', 'ASC']],
    });
  }

  // 3. If still not found, check if a Training exists with this ID
  if (!course) {
    const training = await Training.findByPk(id);
    if (training) {
      course = await Course.findOne({
        where: { trainingProgramId: training.id },
        include: [{ model: Training, as: 'program', attributes: ['id', 'title'] }],
      });
      if (!course) {
        try {
          course = await Course.create({
            title: training.title,
            description: training.description || `${training.title} training program`,
            trainingProgramId: training.id,
            trainerId: training.trainerId || null,
            status: training.status || 'PUBLISHED',
          });
          course = await Course.findByPk(course.id, {
            include: [{ model: Training, as: 'program', attributes: ['id', 'title'] }],
          });
        } catch (_) {}
      }
    }
  }

  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return null;
  }

  // Check enrollment by courseId OR trainingProgramId / trainingId
  let enrollment = await Enrollment.findOne({
    where: {
      participantId: req.user.id,
      status: { [Op.in]: ['ENROLLED', 'COMPLETED', 'PENDING'] },
      [Op.or]: [
        { courseId: course.id },
        ...(course.trainingProgramId ? [{ trainingId: course.trainingProgramId }] : []),
      ],
    },
  });

  if (!enrollment) {
    // If user is a logged-in participant or has active access to published course, bridge enrollment
    if (course.status === 'PUBLISHED' || req.user.role === 'PARTICIPANT' || req.user.role === 'TRAINER' || req.user.role === 'ADMIN') {
      try {
        [enrollment] = await Enrollment.findOrCreate({
          where: { courseId: course.id, participantId: req.user.id },
          defaults: {
            courseId: course.id,
            trainingId: course.trainingProgramId || null,
            participantId: req.user.id,
            status: 'ENROLLED',
            progressPercent: 0,
          },
        });
      } catch (_) {}
    }
  }

  if (!enrollment) {
    res.status(403).json({ error: 'You are not enrolled in this course' });
    return null;
  }
  return { course, enrollment };
}

// Resolve the owning course for a lesson and verify enrollment.
async function loadEnrolledLesson(req, res, lessonId) {
  const id = parseInt(lessonId, 10);
  if (!id) { res.status(422).json({ error: 'Invalid lessonId' }); return null; }
  const lesson = await Lesson.findByPk(id);
  if (!lesson || (!lesson.courseId && !lesson.trainingId)) {
    res.status(404).json({ error: 'Lesson not found' });
    return null;
  }
  const courseLookupId = lesson.courseId || lesson.trainingId;
  const ctx = await loadEnrolledCourse(req, res, courseLookupId);
  if (!ctx) return null;
  return { ...ctx, lesson };
}

/**
 * Recomputes (and persists) the participant's progress in a course.
 * progress_percent = completed_lessons / total_lessons * 100
 *
 * A lesson is "completed" when:
 *   • content_viewed = true
 *   • all mandatory quizzes for the lesson have been submitted
 *   • all mandatory assessments for the lesson have been submitted
 */
async function recomputeCourseProgress(courseId, participantId) {
  const lessons = await Lesson.findAll({
    where: { courseId },
    include: [
      { model: LessonAssessment, as: 'assessments', where: { isMandatory: true }, required: false },
    ],
    attributes: ['id'],
  });
  if (lessons.length === 0) return 0;

  const lessonIds = lessons.map(l => l.id);

  const [progressRows, mandatoryQuizzes, submissions] = await Promise.all([
    LessonProgress.findAll({ where: { lessonId: lessonIds, participantId } }),
    AIQuiz.findAll({
      where: {
        lessonId: lessonIds,
        isMandatory: true,
        status: { [Op.ne]: 'CLOSED' },
      },
      attributes: ['id', 'lessonId'],
    }),
    AssessmentSubmission.findAll({
      where: { participantId },
      include: [{
        model: LessonAssessment, as: 'assessment',
        where: { lessonId: lessonIds, isMandatory: true },
        required: true,
        attributes: ['id', 'lessonId'],
      }],
    }),
  ]);

  // For each mandatory quiz, has the participant submitted?
  const quizIds = mandatoryQuizzes.map(q => q.id);
  const submittedQuizzes = quizIds.length === 0 ? [] : await QuizAttempt.findAll({
    where: { quizId: quizIds, participantId, status: 'SUBMITTED' },
    attributes: ['quizId'],
  });
  const submittedQuizSet = new Set(submittedQuizzes.map(a => String(a.quizId)));

  const progressByLesson = Object.fromEntries(progressRows.map(p => [String(p.lessonId), p]));

  let completed = 0;
  for (const lesson of lessons) {
    const p = progressByLesson[String(lesson.id)];
    if (!p || !p.contentViewed) continue;

    const lessonMandatoryQuizzes = mandatoryQuizzes.filter(q => String(q.lessonId) === String(lesson.id));
    const allQuizzesDone = lessonMandatoryQuizzes.every(q => submittedQuizSet.has(String(q.id)));

    const lessonMandatoryAssessments = (lesson.assessments || []);
    const submittedAssessmentIds = new Set(
      submissions.filter(s => String(s.assessment?.lessonId) === String(lesson.id))
                 .map(s => String(s.assessmentId))
    );
    const allAssessmentsDone = lessonMandatoryAssessments.every(a =>
      submittedAssessmentIds.has(String(a.id)));

    if (allQuizzesDone && allAssessmentsDone) {
      completed++;
      // Also flip the LessonProgress.status to COMPLETED
      if (p.status !== 'COMPLETED') {
        await p.update({ status: 'COMPLETED', completedAt: new Date() });
      }
    } else if (p.status === 'NOT_STARTED') {
      await p.update({ status: 'IN_PROGRESS' });
    }
  }

  const percent = (completed / lessons.length) * 100;
  await Enrollment.update(
    { progressPercent: percent },
    { where: { courseId, participantId, status: 'ENROLLED' } }
  );

  if (percent === 100) {
    checkAndGenerateCertificate(courseId, participantId).catch(err => console.error(err));
  }

  return percent;
}

async function checkAndGenerateCertificate(courseId, participantId) {
  try {
    const { Course, Lesson, LessonAssessment, AssessmentSubmission, Certificate } = require('../models');
    const crypto = require('crypto');

    const course = await Course.findByPk(courseId);
    if (!course) return;

    const lessons = await Lesson.findAll({ where: { courseId } });
    const lessonIds = lessons.map(l => l.id);

    const mandatoryAssessments = await LessonAssessment.findAll({
      where: { lessonId: lessonIds, isMandatory: true }
    });
    const mandatoryAssessmentIds = mandatoryAssessments.map(a => a.id);

    if (mandatoryAssessmentIds.length > 0) {
      const submissions = await AssessmentSubmission.findAll({
        where: {
          assessmentId: mandatoryAssessmentIds,
          participantId,
          status: ['REVIEWED', 'PUBLISHED']
        }
      });

      if (submissions.length !== mandatoryAssessmentIds.length) {
        return;
      }

      const assessmentMap = Object.fromEntries(mandatoryAssessments.map(a => [String(a.id), a]));
      for (const sub of submissions) {
        const ass = assessmentMap[String(sub.assessmentId)];
        if (ass) {
          const passScore = Number(ass.maxScore) * 0.5;
          if (Number(sub.score || 0) < passScore) {
            return;
          }
        }
      }
    }

    const existingCert = await Certificate.findOne({
      where: { userId: participantId, courseId }
    });

    if (!existingCert) {
      const certificateCode = `CERT-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const cert = await Certificate.create({
        certificateCode,
        userId: participantId,
        courseId,
        trainingId: course.trainingProgramId
      });

      const NotificationService = require('../services/notificationService');
      await NotificationService.createNotification({
        userId: participantId,
        message: `Congratulations! You have earned a certificate for "${course.title}". Code: ${certificateCode}`,
        type: 'APPROVAL',
        actionUrl: `/participant`,
        relatedEntityId: cert.id,
        relatedEntityType: 'Certificate'
      });
      console.log(`🏆 Certificate generated for user ${participantId} in course ${courseId}: ${certificateCode}`);
    }
  } catch (error) {
    console.error('Error generating certificate:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/participant/enroll  { courseId } / { trainingId }
async function enroll(req, res) {
  try {
    const courseId = parseInt(req.body.courseId, 10);
    if (!courseId) {
      const trainingId = parseInt(req.body.trainingId, 10);
      if (trainingId) {
        const enrollmentController = require('./enrollmentController');
        return enrollmentController.enrollInTraining(req, res);
      }
      return res.status(422).json({ error: 'courseId is required' });
    }
    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.status !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Course is not open for enrollment' });
    }

    const [enrollment, created] = await Enrollment.findOrCreate({
      where: { courseId, participantId: req.user.id },
      defaults: { courseId, participantId: req.user.id, status: 'ENROLLED', progressPercent: 0 },
    });
    const shouldNotify = created || enrollment.status === 'CANCELLED';
    if (!created && enrollment.status === 'CANCELLED') {
      await enrollment.update({ status: 'ENROLLED', progressPercent: 0 });
    }

    if (shouldNotify) {
      const io = req.app.get('io');
      const user = await User.findByPk(req.user.id);
      const { CourseTrainerAssignment } = require('../models');
      const assignments = await CourseTrainerAssignment.findAll({ where: { courseId } });
      const trainerIds = new Set(assignments.map(a => a.trainerId));
      if (course.trainerId) trainerIds.add(course.trainerId);

      const NotificationService = require('../services/notificationService');
      
      // Notify Trainers
      for (const tId of trainerIds) {
        await NotificationService.createNotification({
          userId: tId,
          message: `${user?.name || 'A participant'} has enrolled in course: ${course.title}`,
          type: 'ENROLLMENT',
          actionUrl: `/trainer`,
          relatedEntityId: enrollment.id,
          relatedEntityType: 'Enrollment'
        }, io);
      }

      // Notify Participant
      await NotificationService.createNotification({
        userId: req.user.id,
        message: `You have been enrolled in course: ${course.title}.`,
        type: 'ENROLLMENT',
        actionUrl: `/participant`,
        relatedEntityId: enrollment.id,
        relatedEntityType: 'Enrollment'
      }, io);
    }

    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Enrolled successfully' : (enrollment.status === 'ENROLLED' ? 'Already enrolled' : 'Enrolled successfully'),
      enrollment: {
        id: enrollment.id,
        courseId: enrollment.courseId,
        status: enrollment.status,
        progressPercent: Number(enrollment.progressPercent || 0),
        enrolledAt: enrollment.enrolled_at || enrollment.createdAt,
      },
    });
  } catch (e) {
    console.error('enroll:', e.message);
    res.status(500).json({ error: 'Failed to enroll' });
  }
}

// DELETE /api/participant/enroll/:courseId
async function unenroll(req, res) {
  try {
    const id = parseInt(req.params.courseId, 10);
    const courseEnrollment = await Enrollment.findOne({
      where: { courseId: id, participantId: req.user.id, status: 'ENROLLED' },
    });
    if (courseEnrollment) {
      await courseEnrollment.update({ status: 'CANCELLED' });
      return res.json({ success: true, message: 'Unenrolled successfully' });
    }

    const trainingEnrollment = await Enrollment.findOne({
      where: { trainingId: id, participantId: req.user.id, status: 'ENROLLED' },
    });
    if (trainingEnrollment) {
      const enrollmentController = require('./enrollmentController');
      req.params.trainingId = req.params.courseId;
      return enrollmentController.cancelEnrollment(req, res);
    }

    return res.status(404).json({ error: 'Enrollment not found' });
  } catch (e) {
    console.error('unenroll:', e.message);
    res.status(500).json({ error: 'Failed to unenroll' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Courses (participant view)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/participant/courses  — all courses the participant is currently enrolled in or pending approval
async function listMyCourses(req, res) {
  try {
    const enrollments = await Enrollment.findAll({
      where: {
        participantId: req.user.id,
        status: { [Op.in]: ['ENROLLED', 'PENDING', 'COMPLETED'] }
      },
      include: [
        {
          model: Course, as: 'course', required: false,
          include: [
            { model: Training, as: 'program', attributes: ['id', 'title'] },
            { model: User,     as: 'trainer', attributes: ['id', 'name'] },
          ],
        },
        {
          model: Training, as: 'training', required: false,
          include: [
            { model: User, as: 'trainer', attributes: ['id', 'name'] },
            {
              model: Course, as: 'courses', required: false,
              include: [
                { model: User, as: 'trainer', attributes: ['id', 'name'] },
              ]
            },
          ]
        }
      ],
      order: [['id', 'DESC']],
    });

    const coursesMap = new Map();
    for (const e of enrollments) {
      if (e.course) {
        if (!coursesMap.has(e.course.id)) {
          coursesMap.set(e.course.id, {
            course: e.course,
            enrollment: e,
          });
        }
      } else if (e.training) {
        let trainingCourses = e.training.courses || [];
        if (trainingCourses.length === 0) {
          try {
            trainingCourses = await Course.findAll({
              where: { trainingProgramId: e.training.id },
              include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }],
            });
            if (trainingCourses.length === 0) {
              const newCourse = await Course.create({
                title: e.training.title,
                description: e.training.description || `${e.training.title} course`,
                trainingProgramId: e.training.id,
                trainerId: e.training.trainerId || null,
                status: e.training.status || 'PUBLISHED',
              });
              trainingCourses = [newCourse];
            }
          } catch (_) {}
        }
        for (const c of trainingCourses) {
          if (!coursesMap.has(c.id)) {
            c.program = e.training;
            coursesMap.set(c.id, {
              course: c,
              enrollment: e,
            });
          }
        }
      }
    }

    const courseEntries = Array.from(coursesMap.values());
    const courseIds = courseEntries.map(entry => entry.course.id).filter(Boolean);
    let lc = {}, qc = {}, ec = {}, cc = {};

    if (courseIds.length > 0) {
      const [lessons, quizzes, enrolled, coding] = await Promise.all([
        Lesson.findAll({ where: { courseId: courseIds }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }).catch(() => []),
        AIQuiz.findAll({ where: { courseId: courseIds }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }).catch(() => []),
        Enrollment.findAll({ where: { courseId: courseIds, status: 'ENROLLED' }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }).catch(() => []),
        CodingAssessment.findAll({ where: { courseId: courseIds }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }).catch(() => []),
      ]);
      lc = Object.fromEntries(lessons.map(r => [String(r.courseId || r.course_id), Number(r.cnt || 0)]));
      qc = Object.fromEntries(quizzes.map(r => [String(r.courseId || r.course_id), Number(r.cnt || 0)]));
      ec = Object.fromEntries(enrolled.map(r => [String(r.courseId || r.course_id), Number(r.cnt || 0)]));
      cc = Object.fromEntries(coding.map(r => [String(r.courseId || r.course_id), Number(r.cnt || 0)]));
    }

    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const total = courseEntries.length;
    const pagedEntries = isPaginated ? courseEntries.slice(offset, offset + limit) : courseEntries;
    const paginationMeta = formatPaginationMeta(total, page, limit);

    const outCourses = pagedEntries.map(({ course, enrollment }) => ({
      id: course.id,
      courseId: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      status: course.status,
      programTitle: course.program?.title || null,
      trainerName: course.trainer?.name || course.program?.trainer?.name || null,
      lessonCount: lc[String(course.id)] || 0,
      quizCount: qc[String(course.id)] || 0,
      enrolledCount: ec[String(course.id)] || 0,
      codingCount: cc[String(course.id)] || 0,
      progressPercent: Number(enrollment.progressPercent || 0),
      enrolledAt: enrollment.enrolled_at || enrollment.createdAt,
      enrollmentStatus: enrollment.status,
    }));

    res.json({
      success: true,
      courses: outCourses,
      data: outCourses,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages
    });
  } catch (e) {
    console.error('listMyCourses:', e.message);
    res.status(500).json({ error: 'Failed to list enrolled courses' });
  }
}

// GET /api/participant/courses/explore — PUBLISHED courses the participant is NOT enrolled in
async function explore(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req.query, 10, 100);
    const isPaginated = !!(req.query.page || req.query.limit || req.query.offset !== undefined);

    const myEnrolled = await Enrollment.findAll({
      where: {
        participantId: req.user.id,
        status: { [Op.in]: ['ENROLLED', 'PENDING', 'COMPLETED'] }
      },
      attributes: ['courseId'],
    });
    const myIds = myEnrolled.map(e => e.courseId).filter(Boolean);

    const where = { status: 'PUBLISHED' };
    if (myIds.length) where.id = { [Op.notIn]: myIds };

    const total = await Course.count({ where });

    let findOptions = {
      where,
      include: [
        { model: Training, as: 'program', attributes: ['id', 'title'] },
        { model: User,     as: 'trainer', attributes: ['id', 'name'] },
      ],
      order: [['id', 'DESC']],
    };

    if (isPaginated) {
      findOptions.limit = limit;
      findOptions.offset = offset;
    }

    const courses = await Course.findAll(findOptions);
    const paginationMeta = formatPaginationMeta(total, page, limit);

    const outCourses = courses.map(c => ({
      courseId: c.id,
      title: c.title,
      description: c.description,
      thumbnailUrl: c.thumbnailUrl,
      programTitle: c.program?.title || null,
      trainerName: c.trainer?.name || null,
    }));

    res.json({
      success: true,
      courses: outCourses,
      data: outCourses,
      pagination: paginationMeta,
      total,
      page,
      limit,
      totalPages: paginationMeta.totalPages
    });
  } catch (e) {
    console.error('explore:', e.message);
    res.status(500).json({ error: 'Failed to load explore feed' });
  }
}

// GET /api/participant/courses/:courseId — overview + progress + stat counts
async function getCourseOverview(req, res) {
  try {
    const ctx = await loadEnrolledCourse(req, res, req.params.courseId);
    if (!ctx) return;
    const { course, enrollment } = ctx;

    const courseWhere = course.trainingProgramId
      ? { [Op.or]: [{ courseId: course.id }, { trainingId: course.trainingProgramId }] }
      : { courseId: course.id };

    const [lessonCount, completedLessonCount, quizzes, submissions, enrolledCount, codingCount] = await Promise.all([
      Lesson.count({ where: courseWhere }),
      LessonProgress.count({
        where: { participantId: req.user.id, status: 'COMPLETED' },
        include: [{ model: Lesson, as: 'lesson', where: courseWhere, required: true, attributes: [] }],
      }),
      AIQuiz.findAll({ where: courseWhere, attributes: ['id'] }),
      AssessmentSubmission.findAll({
        where: { participantId: req.user.id },
        include: [{
          model: LessonAssessment, as: 'assessment',
          required: true,
          include: [{ model: Lesson, as: 'lesson', where: courseWhere, required: true, attributes: [] }],
          attributes: ['id'],
        }],
        attributes: ['id'],
      }),
      Enrollment.count({
        where: {
          status: 'ENROLLED',
          ...(course.trainingProgramId
            ? { [Op.or]: [{ courseId: course.id }, { trainingId: course.trainingProgramId }] }
            : { courseId: course.id })
        }
      }),
      CodingAssessment.count({ where: courseWhere }),
    ]);

    // Quiz attempts and avg score (only counts published results)
    const quizIds = quizzes.map(q => q.id);
    const [attemptedCount, results] = await Promise.all([
      quizIds.length === 0 ? 0 : QuizAttempt.count({
        where: { quizId: quizIds, participantId: req.user.id },
      }),
      quizIds.length === 0 ? [] : QuizResult.findAll({
        where: { quizId: quizIds, participantId: req.user.id, resultPublished: true },
        attributes: ['percentage'],
      }),
    ]);
    const avgScore = results.length === 0
      ? null
      : Number((results.reduce((s, r) => s + Number(r.percentage || 0), 0) / results.length).toFixed(2));

    const trainer = await User.findByPk(course.trainerId, { attributes: ['id', 'name', 'email'] });

    res.json({
      success: true,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        programTitle: course.program?.title || null,
        trainingProgramId: course.trainingProgramId,
        trainer: trainer ? { id: trainer.id, name: trainer.name, email: trainer.email } : null,
      },
      enrollment: {
        enrolledAt: enrollment.enrolled_at || enrollment.createdAt,
        progressPercent: Number(enrollment.progressPercent || 0),
      },
      stats: {
        totalLessons: Number(lessonCount || 0),
        completedLessons: Number(completedLessonCount || 0),
        totalQuizzes: Number(quizzes.length || 0),
        attemptedQuizzes: Number(attemptedCount || 0),
        enrolledCount: Number(enrolledCount || 0),
        codingCount: Number(codingCount || 0),
        submittedAssessments: Number(submissions.length || 0),
        avgQuizScore: avgScore,
      },
    });
  } catch (e) {
    console.error('getCourseOverview:', e.message);
    res.status(500).json({ error: 'Failed to load course overview' });
  }
}

// GET /api/participant/courses/:courseId/lessons — ordered list with per-lesson progress
async function listCourseLessons(req, res) {
  try {
    const ctx = await loadEnrolledCourse(req, res, req.params.courseId);
    if (!ctx) return;
    const { course } = ctx;

    const lessons = await Lesson.findAll({
      where: { courseId: course.id },
      include: [
        { model: LessonMaterial,   as: 'materials',   attributes: ['id', 'materialType'] },
        { model: LessonAssessment, as: 'assessments', attributes: ['id', 'title', 'isMandatory'] },
      ],
      order: [['orderIndex', 'ASC'], ['id', 'ASC']],
    });
    const lessonIds = lessons.map(l => l.id);
    const progress = lessonIds.length === 0 ? [] : await LessonProgress.findAll({
      where: { lessonId: lessonIds, participantId: req.user.id },
    });
    const progMap = Object.fromEntries(progress.map(p => [String(p.lessonId), p]));

    const { Training } = require('../models');
    const training = await Training.findByPk(course.trainingProgramId);
    const isSequential = training?.sequentialLearning || false;

    let previousCompleted = true;
    const out = lessons.map((l, index) => {
      const p = progMap[String(l.id)];
      const isCompleted = p?.status === 'COMPLETED';

      const counts = { NOTE: 0, VIDEO: 0, IMAGE: 0, LINK: 0, PDF: 0, PPT: 0, ATTACHMENT: 0, LIVE_SESSION: 0 };
      (l.materials || []).forEach(m => { counts[m.materialType] = (counts[m.materialType] || 0) + 1; });

      const isLocked = isSequential && !previousCompleted;
      previousCompleted = isCompleted;

      return {
        lessonId: l.id,
        title: l.title,
        description: l.description,
        orderIndex: l.orderIndex,
        materialCounts: counts,
        hasAssessment: (l.assessments || []).length > 0,
        isLocked,
        progress: p ? {
          status: p.status,
          contentViewed: p.contentViewed,
          completedAt: p.completedAt,
        } : { status: 'NOT_STARTED', contentViewed: false, completedAt: null },
      };
    });
    res.json({ success: true, lessons: out });
  } catch (e) {
    console.error('listCourseLessons:', e.message);
    res.status(500).json({ error: 'Failed to list course lessons' });
  }
}

// GET /api/participant/courses/:courseId/resources — all materials grouped by type
async function listCourseResources(req, res) {
  try {
    const ctx = await loadEnrolledCourse(req, res, req.params.courseId);
    if (!ctx) return;
    const { course } = ctx;

    const lessons = await Lesson.findAll({
      where: { courseId: course.id },
      include: [{
        model: LessonMaterial, as: 'materials',
        separate: true, order: [['orderIndex', 'ASC']],
      }],
      attributes: ['id', 'title'],
      order: [['orderIndex', 'ASC']],
    });
    const grouped = { NOTE: [], VIDEO: [], IMAGE: [], LINK: [], PDF: [], PPT: [] };
    lessons.forEach(l => {
      (l.materials || []).forEach(m => {
        grouped[m.materialType] = grouped[m.materialType] || [];
        grouped[m.materialType].push({
          id: m.id,
          lessonId: l.id,
          lessonTitle: l.title,
          title: m.title,
          fileUrl: m.fileUrl,
          linkUrl: m.linkUrl,
          fileName: m.fileName,
          fileSize: m.fileSize,
          thumbnailUrl: m.thumbnailUrl,
          orderIndex: m.orderIndex,
        });
      });
    });
    res.json({ success: true, resources: grouped });
  } catch (e) {
    console.error('listCourseResources:', e.message);
    res.status(500).json({ error: 'Failed to load resources' });
  }
}

// GET /api/participant/courses/:courseId/quizzes — all PUBLISHED quizzes with status
async function listCourseQuizzes(req, res) {
  try {
    const ctx = await loadEnrolledCourse(req, res, req.params.courseId);
    if (!ctx) return;
    const { course } = ctx;

    const quizzes = await AIQuiz.findAll({
      where: { courseId: course.id, isPublished: true },
      include: [
        { model: Lesson,    as: 'lesson',    attributes: ['id', 'title'], required: false },
        { model: AIQuestion, as: 'questions', attributes: ['id'], required: false },
      ],
      order: [['id', 'DESC']],
    });
    if (quizzes.length === 0) return res.json({ success: true, quizzes: [] });

    const ids = quizzes.map(q => q.id);
    const [attempts, results] = await Promise.all([
      QuizAttempt.findAll({
        where: { quizId: ids, participantId: req.user.id },
        attributes: ['id', 'quizId', 'status'],
      }),
      QuizResult.findAll({
        where: { quizId: ids, participantId: req.user.id },
        attributes: ['quizId', 'percentage'],
      }),
    ]);
    const attemptMap = Object.fromEntries(attempts.map(a => [String(a.quizId), a]));
    const resultMap = Object.fromEntries(results.map(r => [String(r.quizId), r]));

    const out = quizzes.map(q => {
      const attempt = attemptMap[String(q.id)];
      const result = resultMap[String(q.id)];
      const showScore = q.isResultPublished && !!result;
      return {
        quizId: q.id,
        title: q.title,
        lessonId: q.lessonId,
        lessonTitle: q.lesson?.title || null,
        questionCount: (q.questions || []).length,
        isMandatory: q.isMandatory,
        myStatus: attempt?.status || 'NOT_STARTED', // IN_PROGRESS | SUBMITTED
        resultStatus: q.resultStatus,
        myScore: showScore ? Number(result.percentage) : null,
        proctoringEnabled: q.proctoringEnabled,
        proctoringLevel: q.proctoringLevel,
      };
    });
    const available = out.filter(q => q.myStatus === 'NOT_STARTED' || q.myStatus === 'IN_PROGRESS');
    const completed = out.filter(q => q.myStatus !== 'NOT_STARTED' && q.myStatus !== 'IN_PROGRESS');
    res.json({ success: true, quizzes: available, completedQuizzes: completed });
  } catch (e) {
    console.error('listCourseQuizzes:', e.message);
    res.status(500).json({ error: 'Failed to list course quizzes' });
  }
}

// GET /api/participant/courses/:courseId/coding-assessments — all PUBLISHED coding assessments with status
async function listCourseCodingAssessments(req, res) {
  try {
    const ctx = await loadEnrolledCourse(req, res, req.params.courseId);
    if (!ctx) return;
    const { course } = ctx;

    const assessments = await CodingAssessment.findAll({
      where: { courseId: course.id, status: 'PUBLISHED' },
      include: [
        { model: CodingProblem, as: 'problems', attributes: ['id', 'title'], required: false },
      ],
      order: [['id', 'DESC']],
    });
    if (assessments.length === 0) return res.json({ success: true, assessments: [] });

    const ids = assessments.map(a => a.id);
    const [attempts, results] = await Promise.all([
      CodingAttempt.findAll({
        where: { assessmentId: ids, participantId: req.user.id },
        attributes: ['id', 'assessmentId', 'status'],
      }),
      CodingResult.findAll({
        where: { assessmentId: ids, participantId: req.user.id },
        attributes: ['assessmentId', 'percentage'],
      }),
    ]);
    const attemptMap = Object.fromEntries(attempts.map(a => [String(a.assessmentId), a]));
    const resultMap = Object.fromEntries(results.map(r => [String(r.assessmentId), r]));

    const out = assessments.map(a => {
      const attempt = attemptMap[String(a.id)];
      const result = resultMap[String(a.id)];
      const showScore = a.resultStatus === 'PUBLISHED' && !!result;
      return {
        assessmentId: a.id,
        title: a.title,
        problemCount: (a.problems || []).length,
        myStatus: attempt?.status || 'NOT_STARTED', // IN_PROGRESS | SUBMITTED
        resultStatus: a.resultStatus,
        myScore: showScore ? Number(result.percentage) : null,
        proctoringEnabled: a.proctoringEnabled,
        proctoringLevel: a.proctoringLevel,
      };
    });
    const available = out.filter(a => a.myStatus === 'NOT_STARTED' || a.myStatus === 'IN_PROGRESS');
    const completed = out.filter(a => a.myStatus !== 'NOT_STARTED' && a.myStatus !== 'IN_PROGRESS');
    res.json({ success: true, assessments: available, completedAssessments: completed });
  } catch (e) {
    console.error('listCourseCodingAssessments:', e.message);
    res.status(500).json({ error: 'Failed to list course coding assessments' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson detail + view
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/participant/lessons/:lessonId — materials + linked quizzes + assessments
async function getLessonDetail(req, res) {
  try {
    const ctx = await loadEnrolledLesson(req, res, req.params.lessonId);
    if (!ctx) return;
    const { lesson, course } = ctx;

    // Enforce sequential learning gate
    const { Training } = require('../models');
    const training = await Training.findByPk(course.trainingProgramId);
    if (training && training.sequentialLearning) {
      const sortedLessons = await Lesson.findAll({
        where: { courseId: course.id },
        order: [['orderIndex', 'ASC'], ['id', 'ASC']]
      });
      const currentIndex = sortedLessons.findIndex(l => l.id === lesson.id);
      if (currentIndex > 0) {
        const prevLesson = sortedLessons[currentIndex - 1];
        const prevProgress = await LessonProgress.findOne({
          where: { lessonId: prevLesson.id, participantId: req.user.id }
        });
        if (!prevProgress || prevProgress.status !== 'COMPLETED') {
          return res.status(403).json({ error: 'This lesson is locked. You must complete the previous lesson first.' });
        }
      }
    }

    // Track lesson viewed (Last Activity)
    try {
      const { ParticipantTracking } = require('../models');
      const [tracking] = await ParticipantTracking.findOrCreate({
        where: { userId: req.user.id, lessonId: lesson.id },
        defaults: { userId: req.user.id, lessonId: lesson.id, trainingId: course.trainingProgramId }
      });
      await tracking.update({ lastActivity: new Date() });
    } catch (e) {
      console.error('ParticipantTracking view log error:', e.message);
    }

    const [materials, quizzes, assessments, progress] = await Promise.all([
      LessonMaterial.findAll({ where: { lessonId: lesson.id }, order: [['orderIndex', 'ASC']] }),
      AIQuiz.findAll({
        where: { lessonId: lesson.id, status: 'PUBLISHED' },
        include: [{ model: AIQuestion, as: 'questions', attributes: ['id'] }],
      }),
      LessonAssessment.findAll({ where: { lessonId: lesson.id } }),
      LessonProgress.findOne({ where: { lessonId: lesson.id, participantId: req.user.id } }),
    ]);

    // Quiz status per quiz for this participant
    const quizIds = quizzes.map(q => q.id);
    const [attempts, results] = quizIds.length === 0 ? [[], []] : await Promise.all([
      QuizAttempt.findAll({
        where: { quizId: quizIds, participantId: req.user.id },
      }),
      QuizResult.findAll({
        where: { quizId: quizIds, participantId: req.user.id, resultPublished: true },
      })
    ]);
    const attemptByQuiz = Object.fromEntries(attempts.map(a => [String(a.quizId), a]));
    const resultByQuiz = Object.fromEntries(results.map(r => [String(r.quizId), r]));

    // Assessment submission status per assessment
    const assessmentIds = assessments.map(a => a.id);
    const submissions = assessmentIds.length === 0 ? [] : await AssessmentSubmission.findAll({
      where: { assessmentId: assessmentIds, participantId: req.user.id },
    });
    const submissionByAssessment = Object.fromEntries(submissions.map(s => [String(s.assessmentId), s]));

    res.json({
      success: true,
      trainingProgramId: course.trainingProgramId,
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
        orderIndex: lesson.orderIndex,
      },
      materials,
      quizzes: quizzes.map(q => {
        const a = attemptByQuiz[String(q.id)];
        const r = resultByQuiz[String(q.id)];
        return {
          quizId: q.id,
          title: q.title,
          questionCount: q.questions?.length || 0,
          isMandatory: q.isMandatory,
          myStatus: a?.status || 'NOT_STARTED',
          resultStatus: q.resultStatus,
          myScore: r ? Number(r.percentage) : null,
          proctoringEnabled: q.proctoringEnabled,
          proctoringLevel: q.proctoringLevel,
        };
      }),
      assessments: assessments.map(a => {
        const sub = submissionByAssessment[String(a.id)];
        return {
          assessmentId: a.id,
          title: a.title,
          instructions: a.instructions,
          maxScore: Number(a.maxScore),
          isMandatory: a.isMandatory,
          myStatus: sub?.status || 'NOT_STARTED',
          mySubmittedAt: sub?.submittedAt || null,
        };
      }),
      progress: progress ? {
        status: progress.status,
        contentViewed: progress.contentViewed,
        completedAt: progress.completedAt,
      } : { status: 'NOT_STARTED', contentViewed: false, completedAt: null },
    });
  } catch (e) {
    console.error('getLessonDetail:', e.message);
    res.status(500).json({ error: 'Failed to load lesson' });
  }
}

// POST /api/participant/lessons/:lessonId/view  — mark content_viewed = true
async function markLessonViewed(req, res) {
  try {
    const ctx = await loadEnrolledLesson(req, res, req.params.lessonId);
    if (!ctx) return;
    const { lesson, course } = ctx;

    const [progress] = await LessonProgress.findOrCreate({
      where: { lessonId: lesson.id, participantId: req.user.id },
      defaults: { lessonId: lesson.id, participantId: req.user.id, status: 'IN_PROGRESS', contentViewed: true },
    });
    if (!progress.contentViewed) {
      await progress.update({ contentViewed: true, status: 'IN_PROGRESS' });
    }
    await recomputeCourseProgress(course.id, req.user.id);
    res.json({ success: true, message: 'Marked as viewed' });
  } catch (e) {
    console.error('markLessonViewed:', e.message);
    res.status(500).json({ error: 'Failed to mark lesson viewed' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quizzes (course-scoped)
// ─────────────────────────────────────────────────────────────────────────────

async function loadAccessibleQuiz(req, res, quizId) {
  const id = parseInt(quizId, 10);
  if (!id) { res.status(422).json({ error: 'Invalid quizId' }); return null; }
  
  const { Course, Training, QuizAttempt } = require('../models');
  const quiz = await AIQuiz.findByPk(id, {
    include: [{
      model: Course,
      as: 'course',
      include: [{ model: Training, as: 'program' }]
    }]
  });
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found' });
    return null;
  }

  // Check if any attempt already exists for this participant
  const existingAttempt = await QuizAttempt.findOne({
    where: { quizId: quiz.id, participantId: req.user.id }
  });

  const isQuizPublished = quiz.status === 'PUBLISHED' || quiz.status === 'RESULTS_PUBLISHED' || quiz.isPublished || quiz.published;
  if (!isQuizPublished && !existingAttempt) {
    res.status(403).json({ error: 'Quiz not published' });
    return null;
  }

  // Check enrollment across courseId, trainingId, or programId
  let enrollment = null;
  const enrollmentQuery = [];
  if (quiz.courseId) enrollmentQuery.push({ courseId: quiz.courseId });
  if (quiz.trainingId) enrollmentQuery.push({ trainingId: quiz.trainingId });
  if (quiz.course?.programId) enrollmentQuery.push({ trainingId: quiz.course.programId });

  if (enrollmentQuery.length > 0) {
    enrollment = await Enrollment.findOne({
      where: {
        participantId: req.user.id,
        [Op.or]: enrollmentQuery,
        status: { [Op.in]: ['ENROLLED', 'COMPLETED'] },
      },
    });
  }

  // If no existing attempt and not enrolled, reject
  if (!existingAttempt && !enrollment) {
    res.status(403).json({ error: 'You are not enrolled in this course or training' });
    return null;
  }

  // Check availability only if no active attempt exists (new attempt)
  if (!existingAttempt) {
    const training = quiz.course?.program || (quiz.trainingId ? await Training.findByPk(quiz.trainingId) : null);
    if (training) {
      const now = new Date();
      if (training.startDate && now < new Date(training.startDate)) {
        res.status(403).json({ error: 'Quiz is not yet available (training program has not started)' });
        return null;
      }
      if (training.endDate && now > new Date(training.endDate)) {
        res.status(403).json({ error: 'Quiz is no longer available (training program has ended)' });
        return null;
      }
    }
  }

  return { quiz, enrollment };
}

// POST /api/participant/quizzes/:quizId/start  → returns attemptId + questions (without correct answers)
async function startQuiz(req, res) {
  try {
    const ctx = await loadAccessibleQuiz(req, res, req.params.quizId);
    if (!ctx) return;
    const { quiz } = ctx;

    if (quiz.status !== 'PUBLISHED' && !quiz.isPublished && !quiz.published) {
      return res.status(403).json({ error: 'Quiz not published' });
    }

    // Check if any attempt already exists to prevent duplicate attempt records
    let attempt;
    try {
      await sequelize.transaction(async t => {
        const { QuizAttempt } = require('../models');
        const existingAttempt = await QuizAttempt.findOne({
          where: { quizId: quiz.id, participantId: req.user.id },
          lock: t.LOCK.UPDATE,
          transaction: t
        });
        if (existingAttempt) {
          // If the attempt is IN_PROGRESS, allow reloading/resuming it instead of throwing an error
          if (existingAttempt.status === 'IN_PROGRESS') {
            attempt = existingAttempt;
          } else {
            const err = new Error('You have already attempted this quiz.');
            err.status = 400;
            throw err;
          }
        } else {
          attempt = await QuizAttempt.create({
            quizId: quiz.id,
            participantId: req.user.id,
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          }, { transaction: t });
        }
      });
    } catch (transError) {
      if (transError.status === 400) {
        return res.status(400).json({
          success: false,
          message: transError.message
        });
      }
      throw transError;
    }

    const questions = await AIQuestion.findAll({
      where: { quizId: quiz.id },
      attributes: ['id', 'questionText', 'questionType', 'options', 'order'],
      order: [['order', 'ASC'], ['id', 'ASC']],
    });

    res.json({
      success: true,
      attemptId: attempt.id,
      quiz: {
        quizId: quiz.id,
        title: quiz.title,
        timeLimit: quiz.timeLimit,
        proctoringEnabled: quiz.proctoringEnabled,
        proctoringLevel: quiz.proctoringLevel,
      },
      // NB: correctAnswer is NOT returned.
      questions: questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        order: q.order,
      })),
    });
  } catch (e) {
    console.error('startQuiz:', e.message);
    res.status(500).json({ error: 'Failed to start quiz' });
  }
}

// POST /api/participant/quizzes/:quizId/submit  { attemptId, answers: [{questionId, answer}] }
async function submitQuiz(req, res) {
  try {
    const ctx = await loadAccessibleQuiz(req, res, req.params.quizId);
    if (!ctx) return;
    const { quiz } = ctx;

    const { attemptId, answers = [] } = req.body;
    const answerList = Array.isArray(answers) ? answers : [];

    const questions = await AIQuestion.findAll({
      where: { quizId: quiz.id },
      order: [['order', 'ASC'], ['id', 'ASC']]
    });

    let correct = 0;
    const total = questions.length;
    let attempt;

    await sequelize.transaction(async t => {
      let whereClause = { quizId: quiz.id, participantId: req.user.id };
      if (attemptId) {
        whereClause = { id: attemptId, quizId: quiz.id, participantId: req.user.id };
      }
      attempt = await QuizAttempt.findOne({
        where: whereClause,
        order: [['id', 'DESC']],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      // Fallback search if attemptId didn't match directly
      if (!attempt && attemptId) {
        attempt = await QuizAttempt.findOne({
          where: { quizId: quiz.id, participantId: req.user.id },
          order: [['id', 'DESC']],
          lock: t.LOCK.UPDATE,
          transaction: t
        });
      }

      // If still no attempt found, create one on the fly to avoid failing the candidate
      if (!attempt) {
        attempt = await QuizAttempt.create({
          quizId: quiz.id,
          participantId: req.user.id,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        }, { transaction: t });
      }

      // Idempotency: if already submitted, exit cleanly without throwing 409
      if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATED') {
        return;
      }

      // Wipe any prior partial answers for this attempt then recreate.
      await QuizAnswer.destroy({ where: { attemptId: attempt.id }, transaction: t });

      const questionsMap = Object.fromEntries(questions.map(q => [String(q.id), q]));

      for (const a of answerList) {
        const qid = String(a.questionId);
        const question = questionsMap[qid];
        if (!question) continue;

        const submittedText = String(a.answerText ?? a.answer ?? '').trim();
        const submittedAnswer = {
          selectedOption: a.selectedOption !== undefined ? a.selectedOption : null,
          answer: submittedText,
          answerText: submittedText,
          matches: a.matches
        };

        let isCorrect = false;
        let earnedScore = 0;
        try {
          const { isCorrect: gradedCorrect, score: gradeScore } = gradeAnswer(question, submittedAnswer);
          isCorrect = !!gradedCorrect;
          earnedScore = (gradeScore || 0) / 100;
        } catch (_) {
          isCorrect = false;
          earnedScore = 0;
        }
        correct += earnedScore;

        let optionIdx = -1;
        if (Array.isArray(question.options)) {
          optionIdx = question.options.findIndex(o => String(o).trim() === submittedText);
        }

        await QuizAnswer.create({
          attemptId:      attempt.id,
          questionId:     a.questionId,
          answerText:     submittedText,
          selectedOption: optionIdx >= 0 ? optionIdx : (a.selectedOption !== undefined ? a.selectedOption : null),
          isCorrect,
          score:          earnedScore,
        }, { transaction: t });
      }

      const submittedAt = new Date();
      await attempt.update({
        status:      'SUBMITTED',
        submittedAt,
        timeTaken:   attempt.startedAt
          ? Math.max(1, Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000))
          : null,
      }, { transaction: t });

      // Persist canonical score on QuizResult
      const percentage = total > 0 ? (correct / total) * 100 : 0;
      const totalScore = correct;
      const maxScore = total;

      await QuizResult.upsert({
        attemptId:      attempt.id,
        quizId:         quiz.id,
        participantId:  req.user.id,
        totalScore,
        maxScore,
        percentage:     Number(percentage.toFixed(2)),
        evaluatedAt:    submittedAt,
      }, { transaction: t });
    });

    // Recompute course progress safely (only if quiz.courseId exists)
    if (quiz.courseId) {
      await recomputeCourseProgress(quiz.courseId, req.user.id).catch(err => {
        console.warn('recomputeCourseProgress non-fatal warning:', err.message);
      });
    }

    // Automatically conclude verification and monitoring session
    if (attempt?.id) {
      try {
        const verificationService = require('../services/assessmentVerificationService');
        await verificationService.endSession({ attemptId: attempt.id, participantId: req.user.id }).catch(() => {});
      } catch (_) {}
    }

    res.json({
      success: true,
      message: 'Quiz submitted. Results will be revealed once your trainer publishes them.',
      attemptId: attempt?.id || attemptId,
    });
  } catch (e) {
    console.error('submitQuiz error:', e.message);
    if (e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Failed to submit quiz' });
  }
}

// GET /api/participant/quizzes/:quizId/result
async function getQuizResult(req, res) {
  try {
    const ctx = await loadAccessibleQuiz(req, res, req.params.quizId);
    if (!ctx) return;
    const { quiz } = ctx;

    const attempt = await QuizAttempt.findOne({
      where: {
        quizId: quiz.id,
        participantId: req.user.id,
        status: { [Op.in]: ['SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'disqualified_copy_violation', 'disqualified_policy_violation'] }
      },
      order: [['id', 'DESC']],
    });
    if (!attempt) {
      // Check if an in-progress attempt exists
      const anyAttempt = await QuizAttempt.findOne({
        where: { quizId: quiz.id, participantId: req.user.id },
        order: [['id', 'DESC']],
      });
      if (anyAttempt) {
        return res.json({
          success: true,
          status: 'SUBMITTED_HIDDEN',
          resultStatus: quiz.resultStatus || 'HIDDEN',
          message: 'Your quiz has been submitted. Results are pending trainer review.',
          submittedAt: anyAttempt.submittedAt || anyAttempt.updatedAt,
          attemptStatus: anyAttempt.status,
        });
      }
      return res.json({ success: true, status: 'NOT_SUBMITTED', resultStatus: quiz.resultStatus });
    }

    const isResultPublished =
      quiz.status === 'RESULTS_PUBLISHED' ||
      quiz.resultStatus === 'PUBLISHED' ||
      !!quiz.isResultPublished;

    if (!isResultPublished) {
      return res.json({
        success: true,
        status: 'SUBMITTED_HIDDEN',
        resultStatus: 'HIDDEN',
        message: 'Your quiz has been submitted successfully. Results will be published by the trainer.',
        submittedAt: attempt.submittedAt,
        attemptStatus: attempt.status,
      });
    }

    const result = await QuizResult.findOne({
      where: {
        [Op.or]: [
          { attemptId: attempt.id },
          { quizId: quiz.id, participantId: req.user.id },
        ],
      },
    });

    const reviewQuestions = await AIQuestion.findAll({
      where: { quizId: quiz.id },
      order: [['order', 'ASC'], ['id', 'ASC']],
    });
    const myAnswers = await QuizAnswer.findAll({ where: { attemptId: attempt.id } });
    const answerMap = Object.fromEntries(myAnswers.map(a => [String(a.questionId), a]));

    const correctCount = myAnswers.filter(a => a.isCorrect).length;
    const totalCount = reviewQuestions.length || myAnswers.length || 1;
    const computedPercentage = result?.percentage != null
      ? Number(result.percentage)
      : Math.round((correctCount / totalCount) * 100);

    const computedTotalScore = result?.totalScore != null
      ? Number(result.totalScore)
      : correctCount;

    const computedMaxScore = result?.maxScore != null
      ? Number(result.maxScore)
      : (quiz.totalMarks ? Number(quiz.totalMarks) : totalCount);

    res.json({
      success: true,
      status: 'PUBLISHED',
      resultStatus: 'PUBLISHED',
      score: computedPercentage,
      totalScore: computedTotalScore,
      maxScore: computedMaxScore,
      submittedAt: attempt.submittedAt,
      attemptStatus: attempt.status,
      correctCount,
      wrongCount: Math.max(0, totalCount - correctCount),
      passStatus: computedPercentage >= 50 ? 'Pass' : 'Fail',
      review: reviewQuestions.map(q => {
        const my = answerMap[String(q.id)];
        return {
          questionId: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          correctAnswer: q.correctAnswer,
          pairs: q.pairs,
          myAnswer: my?.answerText || null,
          mySelectedOption: my?.selectedOption ?? null,
          isCorrect: my?.isCorrect || false,
          explanation: q.explanation || null,
        };
      }),
    });
  } catch (e) {
    console.error('getQuizResult:', e.message);
    res.status(500).json({ error: e.message || 'Failed to load quiz result' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assessments
// ─────────────────────────────────────────────────────────────────────────────

async function loadAccessibleAssessment(req, res, assessmentId) {
  const id = parseInt(assessmentId, 10);
  if (!id) { res.status(422).json({ error: 'Invalid assessmentId' }); return null; }
  const assessment = await LessonAssessment.findByPk(id, {
    include: [{ model: Lesson, as: 'lesson' }],
  });
  if (!assessment || !assessment.lesson) {
    res.status(404).json({ error: 'Assessment not found' });
    return null;
  }
  if (!assessment.lesson.courseId) {
    res.status(404).json({ error: 'Assessment not associated with a course' });
    return null;
  }
  const enrollment = await Enrollment.findOne({
    where: { courseId: assessment.lesson.courseId, participantId: req.user.id, status: 'ENROLLED' },
  });
  if (!enrollment) { res.status(403).json({ error: 'You are not enrolled in this course' }); return null; }
  return { assessment, lesson: assessment.lesson };
}

// POST /api/participant/assessments/:assessmentId/submit  { content, fileUrl }
async function submitAssessment(req, res) {
  try {
    const ctx = await loadAccessibleAssessment(req, res, req.params.assessmentId);
    if (!ctx) return;
    const { assessment, lesson } = ctx;

    const { content, fileUrl } = req.body;
    if (!content && !fileUrl) {
      return res.status(422).json({ error: 'content or fileUrl is required' });
    }

    const [submission] = await AssessmentSubmission.findOrCreate({
      where: { assessmentId: assessment.id, participantId: req.user.id },
      defaults: {
        assessmentId: assessment.id,
        participantId: req.user.id,
        content,
        fileUrl,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    if (submission.status !== 'NOT_STARTED' && submission.status !== 'SUBMITTED') {
      return res.status(409).json({ error: 'Assessment already graded; cannot resubmit' });
    }
    await submission.update({
      content,
      fileUrl,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });

    await recomputeCourseProgress(lesson.courseId, req.user.id);
    res.status(201).json({ success: true, message: 'Assessment submitted', submissionId: submission.id });
  } catch (e) {
    console.error('submitAssessment:', e.message);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
}

// GET /api/participant/assessments/:assessmentId/result
async function getAssessmentResult(req, res) {
  try {
    const ctx = await loadAccessibleAssessment(req, res, req.params.assessmentId);
    if (!ctx) return;
    const { assessment } = ctx;

    const submission = await AssessmentSubmission.findOne({
      where: { assessmentId: assessment.id, participantId: req.user.id },
    });
    if (!submission) return res.json({ success: true, status: 'NOT_STARTED' });

    if (submission.status !== 'PUBLISHED') {
      return res.json({
        success: true,
        status: submission.status, // SUBMITTED or REVIEWED — both still hidden from participant
        message: 'Submission received. Result will be available once your trainer publishes it.',
      });
    }

    res.json({
      success: true,
      status: 'PUBLISHED',
      score: submission.score != null ? Number(submission.score) : null,
      maxScore: Number(assessment.maxScore),
      feedback: submission.feedback,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
    });
  } catch (e) {
    console.error('getAssessmentResult:', e.message);
    res.status(500).json({ error: 'Failed to load assessment result' });
  }
}

module.exports = {
  // Enrollment
  enroll,
  unenroll,
  // Courses
  listMyCourses,
  explore,
  getCourseOverview,
  listCourseLessons,
  listCourseResources,
  listCourseQuizzes,
  listCourseCodingAssessments,
  // Lessons
  getLessonDetail,
  markLessonViewed,
  // Quizzes
  startQuiz,
  submitQuiz,
  getQuizResult,
  // Assessments
  submitAssessment,
  getAssessmentResult,
  trackActivity,
  listMyCertificates,
  forceRegenerateCertificate
};

async function trackActivity(req, res) {
  try {
    const userId = req.user.id;
    const { lessonId, trainingId, videoCompletionPercent, incrementStudyTimeSeconds } = req.body;
    const { ParticipantTracking } = require('../models');

    const whereClause = { userId };
    if (lessonId) whereClause.lessonId = lessonId;
    if (trainingId) whereClause.trainingId = trainingId;

    const [tracking, created] = await ParticipantTracking.findOrCreate({
      where: whereClause,
      defaults: {
        userId,
        lessonId: lessonId || null,
        trainingId: trainingId || null,
        videoCompletionPercent: videoCompletionPercent || 0,
        studyTimeSeconds: incrementStudyTimeSeconds || 0,
        lastActivity: new Date()
      }
    });

    if (!created) {
      const updates = { lastActivity: new Date() };
      if (videoCompletionPercent !== undefined) {
        updates.videoCompletionPercent = Math.max(tracking.videoCompletionPercent, parseFloat(videoCompletionPercent));
      }
      if (incrementStudyTimeSeconds !== undefined) {
        updates.studyTimeSeconds = tracking.studyTimeSeconds + parseInt(incrementStudyTimeSeconds, 10);
      }
      await tracking.update(updates);
    }

    res.json({ success: true, tracking });
  } catch (error) {
    console.error('Track activity error:', error.message);
    res.status(500).json({ error: 'Server error tracking activity' });
  }
}

async function listMyCertificates(req, res) {
  try {
    const participantId = req.user.id;
    const { Certificate, Course, Training } = require('../models');
    const certificates = await Certificate.findAll({
      where: { userId: participantId },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title'] },
        { model: Training, as: 'training', attributes: ['id', 'title'] }
      ],
      order: [['issuedAt', 'DESC']]
    });
    res.json({ success: true, certificates });
  } catch (error) {
    console.error('List certificates error:', error.message);
    res.status(500).json({ error: 'Server error listing certificates' });
  }
}

async function forceRegenerateCertificate(req, res) {
  try {
    const { participantId, courseId } = req.body;
    if (!participantId || !courseId) {
      return res.status(422).json({ error: 'participantId and courseId are required' });
    }

    const { Certificate, Course } = require('../models');
    const crypto = require('crypto');

    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    await Certificate.destroy({
      where: { userId: participantId, courseId }
    });

    const certificateCode = `CERT-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const cert = await Certificate.create({
      certificateCode,
      userId: participantId,
      courseId,
      trainingId: course.trainingProgramId
    });

    const NotificationService = require('../services/notificationService');
    const io = req.app.get('io');
    await NotificationService.createNotification({
      userId: participantId,
      message: `Your certificate for "${course.title}" has been regenerated. Code: ${certificateCode}`,
      type: 'APPROVAL',
      actionUrl: `/participant`,
      relatedEntityId: cert.id,
      relatedEntityType: 'Certificate'
    }, io);

    res.json({ success: true, message: 'Certificate regenerated successfully', certificateCode });
  } catch (error) {
    console.error('Regenerate certificate error:', error.message);
    res.status(500).json({ error: 'Server error regenerating certificate' });
  }
}
