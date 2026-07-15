/**
 * adminCourseController.js
 * ────────────────────────
 * Admin-side CRUD for the course-centric architecture:
 *
 *   • Training Programs (table: training_programs, exposed via the Training
 *     Sequelize model)
 *   • Courses          (model: Course)
 *   • Trainer assignment to courses (writes Course.trainer_id and a row in
 *     course_trainer_assignments)
 *
 * Existing flat-training admin endpoints in adminController.js / trainingController.js
 * are kept untouched so older clients continue to function.
 */
const { Op } = require('sequelize');
const {
  Training,
  Course,
  CourseTrainerAssignment,
  Lesson,
  AIQuiz,
  Enrollment,
  User,
} = require('../models');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function programDto(p, { coursesCount = 0 } = {}) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    thumbnailUrl: p.thumbnailUrl,
    createdBy: p.createdBy,
    coursesCount,
    createdAt: p.createdAt || p.dataValues?.created_at,
    updatedAt: p.updatedAt || p.dataValues?.updated_at,
  };
}

function courseDto(c, counts = {}) {
  return {
    id: c.id,
    trainingProgramId: c.trainingProgramId,
    programTitle: c.program?.title || null,
    trainerId: c.trainerId,
    trainerName: c.trainer?.name || null,
    title: c.title,
    description: c.description,
    status: c.status,
    thumbnailUrl: c.thumbnailUrl,
    lessonCount: counts.lessonCount ?? 0,
    quizCount: counts.quizCount ?? 0,
    enrolledCount: counts.enrolledCount ?? 0,
    createdAt: c.createdAt || c.dataValues?.created_at,
    updatedAt: c.updatedAt || c.dataValues?.updated_at,
  };
}

async function attachCourseCounts(courses) {
  if (courses.length === 0) return [];
  const ids = courses.map(c => c.id);
  const [lessons, quizzes, enrolled] = await Promise.all([
    Lesson.findAll({
      where: { courseId: { [Op.in]: ids } },
      attributes: ['courseId', [Lesson.sequelize.fn('COUNT', '*'), 'cnt']],
      group: ['courseId'],
      raw: true,
    }),
    AIQuiz.findAll({
      where: { courseId: { [Op.in]: ids } },
      attributes: ['courseId', [AIQuiz.sequelize.fn('COUNT', '*'), 'cnt']],
      group: ['courseId'],
      raw: true,
    }),
    Enrollment.findAll({
      where: { courseId: { [Op.in]: ids }, status: 'ENROLLED' },
      attributes: ['courseId', [Enrollment.sequelize.fn('COUNT', '*'), 'cnt']],
      group: ['courseId'],
      raw: true,
    }),
  ]);
  const lookup = (rows) => Object.fromEntries(rows.map(r => [String(r.courseId), Number(r.cnt)]));
  const lc = lookup(lessons);
  const qc = lookup(quizzes);
  const ec = lookup(enrolled);
  return courses.map(c => courseDto(c, {
    lessonCount: lc[String(c.id)] || 0,
    quizCount:   qc[String(c.id)] || 0,
    enrolledCount: ec[String(c.id)] || 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Training Program CRUD
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/training-programs
async function createProgram(req, res) {
  try {
    const { title, description, thumbnailUrl } = req.body;
    if (!title || !title.trim()) {
      return res.status(422).json({ success: false, error: 'Title is required' });
    }
    const program = await Training.create({
      title: title.trim(),
      description: description || null,
      thumbnailUrl: thumbnailUrl || null,
      createdBy: req.user.id,
    });
    return res.status(201).json({
      success: true,
      message: 'Training program created',
      program: programDto(program),
    });
  } catch (e) {
    console.error('createProgram error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to create training program' });
  }
}

// GET /api/admin/training-programs
async function listPrograms(req, res) {
  try {
    const { search = '' } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { title:       { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }
    const programs = await Training.findAll({
      where,
      order: [['id', 'DESC']],
    });

    // Single grouped count to avoid N+1
    const programIds = programs.map(p => p.id);
    let countMap = {};
    if (programIds.length > 0) {
      const counts = await Course.findAll({
        where: { trainingProgramId: { [Op.in]: programIds } },
        attributes: ['trainingProgramId', [Course.sequelize.fn('COUNT', '*'), 'cnt']],
        group: ['trainingProgramId'],
        raw: true,
      });
      countMap = Object.fromEntries(counts.map(r => [String(r.trainingProgramId), Number(r.cnt)]));
    }

    return res.json({
      success: true,
      programs: programs.map(p => programDto(p, { coursesCount: countMap[String(p.id)] || 0 })),
    });
  } catch (e) {
    console.error('listPrograms error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to list training programs' });
  }
}

// GET /api/admin/training-programs/:id
async function getProgram(req, res) {
  try {
    const program = await Training.findByPk(req.params.id);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Training program not found' });
    }
    const courses = await Course.findAll({
      where: { trainingProgramId: program.id },
      include: [{ model: User, as: 'trainer', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
    });
    const courseDtos = await attachCourseCounts(courses);
    return res.json({
      success: true,
      program: programDto(program, { coursesCount: courses.length }),
      courses: courseDtos,
    });
  } catch (e) {
    console.error('getProgram error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch training program' });
  }
}

// PUT /api/admin/training-programs/:id
async function updateProgram(req, res) {
  try {
    const program = await Training.findByPk(req.params.id);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Training program not found' });
    }
    const { title, description, thumbnailUrl } = req.body;
    await program.update({
      title:        title ?? program.title,
      description:  description !== undefined ? description : program.description,
      thumbnailUrl: thumbnailUrl !== undefined ? thumbnailUrl : program.thumbnailUrl,
    });
    return res.json({ success: true, program: programDto(program) });
  } catch (e) {
    console.error('updateProgram error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to update training program' });
  }
}

// DELETE /api/admin/training-programs/:id
async function deleteProgram(req, res) {
  try {
    const program = await Training.findByPk(req.params.id);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Training program not found' });
    }

    // Cascade: delete each child course (which itself cascades into lessons,
    // materials, quizzes, questions, attempts, results, progress, etc.) by
    // calling deleteCourse's logic inline. Doing it course-by-course keeps
    // the cleanup correct even if FK ON DELETE actions vary by table.
    const {
      LessonMaterial, LessonQuiz, LessonAssessment, AssessmentSubmission,
      LessonProgress, QuizProgress, AIQuestion, QuizAttempt, QuizResult,
    } = require('../models');

    const courses = await Course.findAll({ where: { trainingProgramId: program.id }, attributes: ['id'] });
    const courseIds = courses.map(c => c.id);

    if (courseIds.length > 0) {
      const lessons = await Lesson.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id'] });
      const lessonIds = lessons.map(l => l.id);
      const quizzes = await AIQuiz.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id'] });
      const quizIds = quizzes.map(q => q.id);
      const assessments = lessonIds.length === 0 ? [] : await LessonAssessment.findAll({
        where: { lessonId: { [Op.in]: lessonIds } }, attributes: ['id'],
      });
      const assessmentIds = assessments.map(a => a.id);

      if (assessmentIds.length > 0) {
        await AssessmentSubmission.destroy({ where: { assessmentId: { [Op.in]: assessmentIds } } });
      }
      if (lessonIds.length > 0) {
        await Promise.all([
          LessonMaterial.destroy({   where: { lessonId: { [Op.in]: lessonIds } } }),
          LessonAssessment.destroy({ where: { lessonId: { [Op.in]: lessonIds } } }),
          LessonProgress.destroy({   where: { lessonId: { [Op.in]: lessonIds } } }),
          LessonQuiz.destroy({       where: { lessonId: { [Op.in]: lessonIds } } }),
        ]);
      }
      if (quizIds.length > 0) {
        const attempts = await QuizAttempt.findAll({ where: { quizId: { [Op.in]: quizIds } }, attributes: ['id'] });
        const attemptIds = attempts.map(a => a.id);
        const { QuizAnswer, AssessmentSession, ExamSession, Violation, ProctorActivity, Screenshot } = require('../models');

        await AssessmentSession.destroy({
          where: {
            [Op.or]: [
              attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
              { quizId: { [Op.in]: quizIds } }
            ].filter(Boolean)
          }
        });

        const examSessions = await ExamSession.findAll({
          where: {
            [Op.or]: [
              attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
              { quizId: { [Op.in]: quizIds } }
            ].filter(Boolean)
          },
          attributes: ['id']
        });
        const sessionIds = examSessions.map(s => s.id);
        if (sessionIds.length > 0) {
          await Promise.all([
            Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } } }),
            ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } } }),
            Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } } })
          ]);

          const fs = require('fs');
          const path = require('path');
          for (const sessionId of sessionIds) {
            try {
              const screenshotsDir = path.join(__dirname, '../../uploads/screenshots', String(sessionId));
              if (fs.existsSync(screenshotsDir)) {
                fs.rmSync(screenshotsDir, { recursive: true, force: true });
              }
            } catch (fileErr) {
              console.error(`Failed to clean screenshots directory for session ${sessionId}:`, fileErr.message);
            }
          }

          await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } } });
        }

        if (attemptIds.length > 0) {
          await QuizAnswer.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });
          await QuizResult.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });
        }
        await Promise.all([
          QuizAttempt.destroy({ where: { quizId: { [Op.in]: quizIds } } }),
          AIQuestion.destroy({  where: { quizId: { [Op.in]: quizIds } } }),
          LessonQuiz.destroy({  where: { quizId: { [Op.in]: quizIds } } }),
        ]);
      }

      await Promise.all([
        Lesson.destroy({       where: { courseId: { [Op.in]: courseIds } } }),
        AIQuiz.destroy({       where: { courseId: { [Op.in]: courseIds } } }),
        Enrollment.destroy({   where: { courseId: { [Op.in]: courseIds } } }),
        CourseTrainerAssignment.destroy({ where: { courseId: { [Op.in]: courseIds } } }),
      ]);
      await Course.destroy({ where: { id: { [Op.in]: courseIds } } });
    }

    await program.destroy();
    return res.json({ success: true, message: 'Training program deleted' });
  } catch (e) {
    console.error('deleteProgram error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to delete training program' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Course CRUD (admin-scoped — admin creates and reassigns)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/training-programs/:id/courses
async function createCourse(req, res) {
  try {
    const trainingProgramId = parseInt(req.params.id, 10);
    const { trainerId, title, description, thumbnailUrl, status } = req.body;

    if (!title || !title.trim()) {
      return res.status(422).json({ success: false, error: 'Title is required' });
    }
    if (!trainerId) {
      return res.status(422).json({ success: false, error: 'trainerId is required' });
    }

    const program = await Training.findByPk(trainingProgramId);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Training program not found' });
    }

    const trainer = await User.findOne({ where: { id: trainerId, role: 'TRAINER' } });
    if (!trainer) {
      return res.status(400).json({ success: false, error: 'Invalid trainer ID' });
    }

    const course = await Course.create({
      trainingProgramId,
      trainerId: trainer.id,
      title: title.trim(),
      description: description || null,
      thumbnailUrl: thumbnailUrl || null,
      status: status || 'DRAFT',
    });

    // Mirror the assignment into course_trainer_assignments. Idempotent —
    // (course_id, trainer_id) is UNIQUE.
    try {
      await CourseTrainerAssignment.create({
        courseId: course.id,
        trainerId: trainer.id,
      });
    } catch { /* ignore unique violation */ }

    const loaded = await Course.findByPk(course.id, {
      include: [
        { model: User,     as: 'trainer', attributes: ['id', 'name'] },
        { model: Training, as: 'program', attributes: ['id', 'title'] },
      ],
    });
    return res.status(201).json({
      success: true,
      message: 'Course created',
      course: courseDto(loaded),
    });
  } catch (e) {
    console.error('createCourse error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to create course' });
  }
}

// GET /api/admin/courses
async function listCourses(req, res) {
  try {
    const { search = '', status = '', programId = '', trainerId = '' } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { title:       { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }
    if (status)    where.status            = status;
    if (programId) where.trainingProgramId = programId;
    if (trainerId) where.trainerId         = trainerId;

    const courses = await Course.findAll({
      where,
      include: [
        { model: User,     as: 'trainer', attributes: ['id', 'name'] },
        { model: Training, as: 'program', attributes: ['id', 'title'] },
      ],
      order: [['id', 'DESC']],
    });
    const dtos = await attachCourseCounts(courses);
    return res.json({ success: true, courses: dtos });
  } catch (e) {
    console.error('listCourses error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to list courses' });
  }
}

// GET /api/admin/courses/:id
async function getCourse(req, res) {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: [
        { model: User,     as: 'trainer', attributes: ['id', 'name', 'email'] },
        { model: Training, as: 'program', attributes: ['id', 'title'] },
      ],
    });
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    const [withCounts] = await attachCourseCounts([course]);
    return res.json({ success: true, course: withCounts });
  } catch (e) {
    console.error('getCourse error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch course' });
  }
}

// PUT /api/admin/courses/:id
async function updateCourse(req, res) {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    const { title, description, thumbnailUrl, status, trainerId, trainingProgramId } = req.body;

    // Trainer reassignment — validate and mirror into the assignments table.
    let newTrainerId = course.trainerId;
    if (trainerId !== undefined && trainerId !== null && trainerId !== course.trainerId) {
      const trainer = await User.findOne({ where: { id: trainerId, role: 'TRAINER' } });
      if (!trainer) {
        return res.status(400).json({ success: false, error: 'Invalid trainer ID' });
      }
      newTrainerId = trainer.id;
      // Add new assignment row. Old one is left in place — by spec, this
      // table represents history and supports future multi-trainer mode.
      try {
        await CourseTrainerAssignment.create({
          courseId: course.id,
          trainerId: newTrainerId,
        });
      } catch { /* unique — already there */ }
    }

    if (trainingProgramId !== undefined && trainingProgramId !== null && trainingProgramId !== course.trainingProgramId) {
      const program = await Training.findByPk(trainingProgramId);
      if (!program) {
        return res.status(400).json({ success: false, error: 'Invalid training program ID' });
      }
    }

    if (status && !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      return res.status(422).json({ success: false, error: 'Invalid status' });
    }

    await course.update({
      title:             title ?? course.title,
      description:       description !== undefined ? description : course.description,
      thumbnailUrl:      thumbnailUrl !== undefined ? thumbnailUrl : course.thumbnailUrl,
      status:            status ?? course.status,
      trainerId:         newTrainerId,
      trainingProgramId: trainingProgramId ?? course.trainingProgramId,
    });

    const loaded = await Course.findByPk(course.id, {
      include: [
        { model: User,     as: 'trainer', attributes: ['id', 'name'] },
        { model: Training, as: 'program', attributes: ['id', 'title'] },
      ],
    });
    const [withCounts] = await attachCourseCounts([loaded]);
    return res.json({ success: true, course: withCounts });
  } catch (e) {
    console.error('updateCourse error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to update course' });
  }
}

// DELETE /api/admin/courses/:id
async function deleteCourse(req, res) {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    // Full cascade: lesson_materials, lesson_quizzes, lesson_assessments,
    // assessment_submissions, lesson_progress, ai_questions, quiz_attempts,
    // quiz_results — then lessons, quizzes, enrollments, trainer assignments,
    // then the course itself.
    const {
      LessonMaterial, LessonQuiz, LessonAssessment, AssessmentSubmission,
      LessonProgress, QuizProgress, AIQuestion, QuizAttempt, QuizResult,
    } = require('../models');

    const lessons = await Lesson.findAll({ where: { courseId: course.id }, attributes: ['id'] });
    const lessonIds = lessons.map(l => l.id);
    const quizzes = await AIQuiz.findAll({ where: { courseId: course.id }, attributes: ['id'] });
    const quizIds = quizzes.map(q => q.id);
    const assessments = lessonIds.length === 0 ? [] : await LessonAssessment.findAll({
      where: { lessonId: { [Op.in]: lessonIds } }, attributes: ['id'],
    });
    const assessmentIds = assessments.map(a => a.id);

    if (assessmentIds.length > 0) {
      await AssessmentSubmission.destroy({ where: { assessmentId: { [Op.in]: assessmentIds } } });
    }
    if (lessonIds.length > 0) {
      await Promise.all([
        LessonMaterial.destroy({   where: { lessonId:   { [Op.in]: lessonIds } } }),
        LessonAssessment.destroy({ where: { lessonId:   { [Op.in]: lessonIds } } }),
        LessonProgress.destroy({   where: { lessonId:   { [Op.in]: lessonIds } } }),
        LessonQuiz.destroy({       where: { lessonId:   { [Op.in]: lessonIds } } }),
      ]);
    }
    if (quizIds.length > 0) {
      // Quiz results / attempts have a unique attemptId FK; clean both before
      // dropping AIQuestion + AIQuiz.
      const attempts = await QuizAttempt.findAll({ where: { quizId: { [Op.in]: quizIds } }, attributes: ['id'] });
      const attemptIds = attempts.map(a => a.id);
      const { QuizAnswer, AssessmentSession, ExamSession, Violation, ProctorActivity, Screenshot } = require('../models');

      await AssessmentSession.destroy({
        where: {
          [Op.or]: [
            attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
            { quizId: { [Op.in]: quizIds } }
          ].filter(Boolean)
        }
      });

      const examSessions = await ExamSession.findAll({
        where: {
          [Op.or]: [
            attemptIds.length > 0 ? { attemptId: { [Op.in]: attemptIds } } : null,
            { quizId: { [Op.in]: quizIds } }
          ].filter(Boolean)
        },
        attributes: ['id']
      });
      const sessionIds = examSessions.map(s => s.id);
      if (sessionIds.length > 0) {
        await Promise.all([
          Violation.destroy({ where: { sessionId: { [Op.in]: sessionIds } } }),
          ProctorActivity.destroy({ where: { sessionId: { [Op.in]: sessionIds } } }),
          Screenshot.destroy({ where: { sessionId: { [Op.in]: sessionIds } } })
        ]);

        const fs = require('fs');
        const path = require('path');
        for (const sessionId of sessionIds) {
          try {
            const screenshotsDir = path.join(__dirname, '../../uploads/screenshots', String(sessionId));
            if (fs.existsSync(screenshotsDir)) {
              fs.rmSync(screenshotsDir, { recursive: true, force: true });
            }
          } catch (fileErr) {
            console.error(`Failed to clean screenshots directory for session ${sessionId}:`, fileErr.message);
          }
        }

        await ExamSession.destroy({ where: { id: { [Op.in]: sessionIds } } });
      }

      if (attemptIds.length > 0) {
        await QuizAnswer.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });
        await QuizResult.destroy({ where: { attemptId: { [Op.in]: attemptIds } } });
        await QuizProgress.destroy({ where: { lessonQuizId: { [Op.in]: attemptIds } } }).catch(() => {});
      }
      await Promise.all([
        QuizAttempt.destroy({ where: { quizId: { [Op.in]: quizIds } } }),
        AIQuestion.destroy({  where: { quizId: { [Op.in]: quizIds } } }),
        LessonQuiz.destroy({  where: { quizId: { [Op.in]: quizIds } } }),
      ]);
    }

    await Promise.all([
      Lesson.destroy({       where: { courseId: course.id } }),
      AIQuiz.destroy({       where: { courseId: course.id } }),
      Enrollment.destroy({   where: { courseId: course.id } }),
      CourseTrainerAssignment.destroy({ where: { courseId: course.id } }),
    ]);
    await course.destroy();

    return res.json({ success: true, message: 'Course deleted' });
  } catch (e) {
    console.error('deleteCourse error:', e.message);
    return res.status(500).json({ success: false, error: 'Failed to delete course' });
  }
}

module.exports = {
  // Programs
  createProgram,
  listPrograms,
  getProgram,
  updateProgram,
  deleteProgram,
  // Courses
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  deleteCourse,
};
