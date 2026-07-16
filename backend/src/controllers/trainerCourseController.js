/**
 * trainerCourseController.js
 * ──────────────────────────
 * Course-centric trainer endpoints. Each handler verifies that the requesting
 * user owns the resource (Course.trainer_id === req.user.id, with admin
 * override) before reading/writing.
 *
 * Endpoints are grouped:
 *   • Courses               — list / detail / stats
 *   • Lessons               — CRUD + reorder
 *   • Lesson Materials      — CRUD + reorder (uploads handled by route)
 *   • Quizzes (course)      — manual create, edit, list, delete, publish, dashboard
 *   • Participants          — list / detail
 *   • Analytics             — completion donut, quiz scores, engagement
 *   • Assessments           — create / list / edit / submissions / grade / publish
 *
 * Existing /api/lessons routes (lessonController.js) continue to function for
 * backward compatibility — those are training-scoped. The course-scoped flow
 * is the new canonical path.
 */
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  sequelize,
  Course,
  CourseTrainerAssignment,
  Training,
  Lesson,
  LessonMaterial,
  LessonQuiz,
  LessonAssessment,
  AssessmentSubmission,
  QuizProgress,
  LessonProgress,
  Enrollment,
  AIQuiz,
  AIQuestion,
  AIQuestionOption,
  QuizAttempt,
  QuizAnswer,
  QuizResult,
  ExamSession,
  Violation,
  ProctorActivity,
  AssessmentSession,
  User,
} = require('../models');
const { TYPE_LIMITS, ROOT: MATERIALS_ROOT } = require('../middleware/uploadMaterial');
const NotificationService = require('../services/notificationService');
const aiService = require('../services/aiService');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAdmin(user) { return user?.role === 'ADMIN'; }

/** Loads a course AND verifies ownership. Returns 404 / 403 via res, or course on success. */
async function loadOwnedCourse(req, res, courseId) {
  const id = parseInt(courseId, 10);
  if (!id) { res.status(422).json({ error: 'Invalid courseId' }); return null; }
  const course = await Course.findByPk(id);
  if (!course) { res.status(404).json({ error: 'Course not found' }); return null; }
  if (!isAdmin(req.user) && course.trainerId !== req.user.id) {
    // Check many-to-many assignment
    const assigned = await CourseTrainerAssignment.findOne({
      where: { courseId: course.id, trainerId: req.user.id }
    });
    if (!assigned) {
      res.status(403).json({ error: 'You are not assigned to this course' });
      return null;
    }
  }
  return course;
}

async function loadOwnedLesson(req, res, lessonId) {
  const id = parseInt(lessonId, 10);
  if (!id) { res.status(422).json({ error: 'Invalid lessonId' }); return null; }
  const lesson = await Lesson.findByPk(id);
  if (!lesson) { res.status(404).json({ error: 'Lesson not found' }); return null; }
  // Lesson is course-scoped now; if no course_id, fall back to legacy training_id check.
  if (lesson.courseId) {
    const course = await Course.findByPk(lesson.courseId);
    if (!course) {
      res.status(403).json({ error: 'You do not own the parent course' });
      return null;
    }
    if (!isAdmin(req.user) && course.trainerId !== req.user.id) {
      const assigned = await CourseTrainerAssignment.findOne({
        where: { courseId: course.id, trainerId: req.user.id }
      });
      if (!assigned) {
        res.status(403).json({ error: 'You do not own the parent course' });
        return null;
      }
    }
  } else if (!isAdmin(req.user) && lesson.trainerId !== req.user.id) {
    res.status(403).json({ error: 'You do not own this lesson' });
    return null;
  }
  return lesson;
}

// Participant IDs assigned to a course = enrolled in it.
async function courseParticipantIds(courseId) {
  const rows = await Enrollment.findAll({
    where: { courseId, status: 'ENROLLED' },
    attributes: ['participantId'],
  });
  return rows.map(r => r.participantId);
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/trainer/courses
async function listMyCourses(req, res) {
  try {
    let where = {};
    if (!isAdmin(req.user)) {
      const assignments = await CourseTrainerAssignment.findAll({
        where: { trainerId: req.user.id },
        attributes: ['courseId']
      });
      const assignedCourseIds = assignments.map(a => a.courseId);
      where = {
        [Op.or]: [
          { trainerId: req.user.id },
          { id: { [Op.in]: assignedCourseIds } }
        ]
      };
    }
    const courses = await Course.findAll({
      where,
      include: [
        { model: Training, as: 'program', attributes: ['id', 'title'] },
      ],
      order: [['id', 'DESC']],
    });
    if (courses.length === 0) return res.json({ success: true, courses: [] });

    const ids = courses.map(c => c.id);
    const [lessons, quizzes, enrolled] = await Promise.all([
      Lesson.findAll({ where: { courseId: ids }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }),
      AIQuiz.findAll({ where: { courseId: ids }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }),
      Enrollment.findAll({ where: { courseId: ids, status: 'ENROLLED' }, attributes: ['courseId', [sequelize.fn('COUNT', '*'), 'cnt']], group: ['courseId'], raw: true }),
    ]);
    const lc = Object.fromEntries(lessons.map(r => [String(r.courseId), Number(r.cnt)]));
    const qc = Object.fromEntries(quizzes.map(r => [String(r.courseId), Number(r.cnt)]));
    const ec = Object.fromEntries(enrolled.map(r => [String(r.courseId), Number(r.cnt)]));

    const out = courses.map(c => ({
      id: c.id,
      trainingProgramId: c.trainingProgramId,
      programTitle: c.program?.title || null,
      title: c.title,
      description: c.description,
      status: c.status,
      thumbnailUrl: c.thumbnailUrl,
      lessonCount:   lc[String(c.id)] || 0,
      quizCount:     qc[String(c.id)] || 0,
      enrolledCount: ec[String(c.id)] || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    res.json({ success: true, courses: out });
  } catch (e) {
    console.error('listMyCourses:', e.message);
    res.status(500).json({ error: 'Failed to list courses' });
  }
}

// POST /api/trainer/courses
async function createCourse(req, res) {
  try {
    const { title, description, trainingProgramId, status, thumbnailUrl } = req.body;
    if (!title || !title.trim()) return res.status(422).json({ error: 'Title is required' });
    if (!trainingProgramId) return res.status(422).json({ error: 'Training Program is required' });

    const program = await Training.findByPk(trainingProgramId);
    if (!program) return res.status(404).json({ error: 'Training Program not found' });

    const course = await Course.create({
      trainingProgramId,
      trainerId: req.user.id,
      title: title.trim(),
      description: description || null,
      status: status || 'DRAFT',
      thumbnailUrl: thumbnailUrl || null,
    });

    // Also create the mapping in CourseTrainerAssignment
    await CourseTrainerAssignment.create({
      courseId: course.id,
      trainerId: req.user.id,
    });

    res.status(201).json({ success: true, course });
  } catch (e) {
    console.error('createCourse:', e.message);
    res.status(500).json({ error: 'Failed to create course' });
  }
}

// GET /api/trainer/programs
async function listAllPrograms(req, res) {
  try {
    const programs = await Training.findAll({
      attributes: ['id', 'title', 'description'],
      order: [['title', 'ASC']],
    });
    res.json({ success: true, programs });
  } catch (e) {
    console.error('listAllPrograms:', e.message);
    res.status(500).json({ error: 'Failed to list programs' });
  }
}

// GET /api/trainer/courses/:courseId
async function getCourseDetail(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const [program, lessonCount, quizCount, enrolledCount] = await Promise.all([
      Training.findByPk(course.trainingProgramId, { attributes: ['id', 'title'] }),
      Lesson.count({ where: { courseId: course.id } }),
      AIQuiz.count({ where: { courseId: course.id } }),
      Enrollment.count({ where: { courseId: course.id, status: 'ENROLLED' } }),
    ]);

    res.json({
      success: true,
      course: {
        id: course.id,
        trainingProgramId: course.trainingProgramId,
        programTitle: program?.title || null,
        trainerId: course.trainerId,
        title: course.title,
        description: course.description,
        status: course.status,
        thumbnailUrl: course.thumbnailUrl,
        lessonCount,
        quizCount,
        enrolledCount,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      },
    });
  } catch (e) {
    console.error('getCourseDetail:', e.message);
    res.status(500).json({ error: 'Failed to load course' });
  }
}

// PUT /api/trainer/courses/:courseId  — limited self-edit (status/description/thumbnail)
async function updateOwnCourse(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const { description, thumbnailUrl, status } = req.body;
    if (status && !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      return res.status(422).json({ error: 'Invalid status' });
    }
    await course.update({
      description:  description  !== undefined ? description  : course.description,
      thumbnailUrl: thumbnailUrl !== undefined ? thumbnailUrl : course.thumbnailUrl,
      status:       status       ?? course.status,
    });
    res.json({ success: true, course });
  } catch (e) {
    console.error('updateOwnCourse:', e.message);
    res.status(500).json({ error: 'Failed to update course' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/trainer/courses/:courseId/lessons
async function createLesson(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const { title, description, content, orderIndex } = req.body;
    if (!title || !title.trim()) return res.status(422).json({ error: 'Title is required' });

    const next = orderIndex != null
      ? parseInt(orderIndex, 10)
      : ((await Lesson.max('orderIndex', { where: { courseId: course.id } })) ?? -1) + 1;

    const lesson = await Lesson.create({
      courseId: course.id,
      trainerId: course.trainerId,
      title: title.trim(),
      description: description || null,
      content: content || null,
      orderIndex: next,
    });
    res.status(201).json({ success: true, lesson });
  } catch (e) {
    console.error('createLesson:', e.message);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
}

// GET /api/trainer/courses/:courseId/lessons
async function listLessons(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const lessons = await Lesson.findAll({
      where: { courseId: course.id },
      include: [
        { model: LessonMaterial,   as: 'materials',   attributes: ['id', 'materialType'] },
        { model: LessonAssessment, as: 'assessments', attributes: ['id', 'title'] },
      ],
      order: [['orderIndex', 'ASC'], ['id', 'ASC']],
    });

    const out = lessons.map(l => {
      const tally = { NOTE: 0, VIDEO: 0, IMAGE: 0, LINK: 0, PDF: 0, PPT: 0 };
      (l.materials || []).forEach(m => { tally[m.materialType] = (tally[m.materialType] || 0) + 1; });
      return {
        id: l.id,
        courseId: l.courseId,
        title: l.title,
        description: l.description,
        orderIndex: l.orderIndex,
        materialCounts: tally,
        hasAssessment: (l.assessments || []).length > 0,
        createdAt: l.createdAt,
      };
    });
    res.json({ success: true, lessons: out });
  } catch (e) {
    console.error('listLessons:', e.message);
    res.status(500).json({ error: 'Failed to list lessons' });
  }
}

// GET /api/trainer/courses/:courseId/lessons/:lessonId
async function getLesson(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const lesson = await Lesson.findOne({
      where: { id: req.params.lessonId, courseId: course.id },
      include: [
        { model: LessonMaterial,   as: 'materials',   separate: true, order: [['orderIndex', 'ASC']] },
        { model: LessonAssessment, as: 'assessments' },
      ],
    });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ success: true, lesson });
  } catch (e) {
    console.error('getLesson:', e.message);
    res.status(500).json({ error: 'Failed to load lesson' });
  }
}

// PUT /api/trainer/courses/:courseId/lessons/:lessonId
async function updateLesson(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const lesson = await Lesson.findOne({ where: { id: req.params.lessonId, courseId: course.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const { title, description, content, orderIndex } = req.body;
    await lesson.update({
      title:       title       ?? lesson.title,
      description: description !== undefined ? description : lesson.description,
      content:     content     !== undefined ? content     : lesson.content,
      orderIndex:  orderIndex  != null ? parseInt(orderIndex, 10) : lesson.orderIndex,
    });
    res.json({ success: true, lesson });
  } catch (e) {
    console.error('updateLesson:', e.message);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
}

// DELETE /api/trainer/courses/:courseId/lessons/:lessonId
async function deleteLesson(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const lesson = await Lesson.findOne({ where: { id: req.params.lessonId, courseId: course.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Cascade in code (FKs may not have ON DELETE CASCADE on every table).
    await Promise.all([
      LessonMaterial.destroy({   where: { lessonId: lesson.id } }),
      LessonQuiz.destroy({       where: { lessonId: lesson.id } }),
      LessonAssessment.destroy({ where: { lessonId: lesson.id } }),
      LessonProgress.destroy({   where: { lessonId: lesson.id } }),
    ]);
    await lesson.destroy();
    res.json({ success: true, message: 'Lesson deleted' });
  } catch (e) {
    console.error('deleteLesson:', e.message);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
}

// PUT /api/trainer/courses/:courseId/lessons/reorder  { orderedIds: [3, 7, 5] }
async function reorderLessons(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const ordered = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : null;
    if (!ordered) return res.status(422).json({ error: 'orderedIds[] is required' });

    // Make sure every id belongs to this course.
    const lessons = await Lesson.findAll({ where: { id: ordered, courseId: course.id } });
    if (lessons.length !== ordered.length) {
      return res.status(400).json({ error: 'One or more lessons do not belong to this course' });
    }
    await sequelize.transaction(async t => {
      for (let i = 0; i < ordered.length; i++) {
        await Lesson.update({ orderIndex: i }, { where: { id: ordered[i] }, transaction: t });
      }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('reorderLessons:', e.message);
    res.status(500).json({ error: 'Failed to reorder lessons' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LESSON MATERIALS
// ─────────────────────────────────────────────────────────────────────────────

function publicUrlForUploaded(file) {
  if (!file) return null;
  // file.path is absolute; convert to /uploads/... relative URL.
  const rel = path.relative(path.join(process.cwd(), 'uploads'), file.path).replace(/\\/g, '/');
  return `/uploads/${rel}`;
}

function safeUnlink(absPath) {
  try { if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch { /* ignore */ }
}

// POST /api/trainer/lessons/:lessonId/materials
//   Multipart form fields: materialType, title, content (NOTE/LINK), linkUrl (LINK), file (PDF/PPT/VIDEO/IMAGE)
async function createMaterial(req, res) {
  let uploadedAbsPath = req.file?.path || null;
  try {
    const lesson = await loadOwnedLesson(req, res, req.params.lessonId);
    if (!lesson) { safeUnlink(uploadedAbsPath); return; }

    const { materialType, title, content, linkUrl, thumbnailUrl } = req.body;
    const t = String(materialType || '').toUpperCase();
    const VALID = ['NOTE', 'VIDEO', 'IMAGE', 'LINK', 'PDF', 'PPT'];
    if (!VALID.includes(t)) {
      safeUnlink(uploadedAbsPath);
      return res.status(422).json({ error: 'Invalid materialType' });
    }
    if (!title || !title.trim()) {
      safeUnlink(uploadedAbsPath);
      return res.status(422).json({ error: 'Title is required' });
    }

    // Validate per-type requirements
    if (['PDF', 'PPT'].includes(t) && !req.file) {
      return res.status(422).json({ error: `${t} material requires a file upload` });
    }
    if (t === 'VIDEO' && !req.file && !linkUrl) {
      return res.status(422).json({ error: 'VIDEO requires a file upload or external linkUrl' });
    }
    if (t === 'IMAGE' && !req.file) {
      return res.status(422).json({ error: 'IMAGE material requires a file upload' });
    }
    if (t === 'LINK' && !linkUrl) {
      return res.status(422).json({ error: 'LINK material requires linkUrl' });
    }
    if (t === 'NOTE' && !content) {
      return res.status(422).json({ error: 'NOTE material requires content (rich-text HTML)' });
    }

    // Per-type size cap on uploaded file
    if (req.file && TYPE_LIMITS[t] && req.file.size > TYPE_LIMITS[t]) {
      safeUnlink(uploadedAbsPath);
      return res.status(413).json({
        error: `File too large for ${t}. Max ${(TYPE_LIMITS[t] / 1024 / 1024).toFixed(0)} MB.`,
      });
    }

    const next = ((await LessonMaterial.max('orderIndex', { where: { lessonId: lesson.id } })) ?? -1) + 1;

    const material = await LessonMaterial.create({
      lessonId:     lesson.id,
      materialType: t,
      title:        title.trim(),
      content:      t === 'NOTE' ? content : (t === 'LINK' ? (content || null) : null),
      fileUrl:      req.file ? publicUrlForUploaded(req.file) : null,
      linkUrl:      t === 'LINK' ? linkUrl : (t === 'VIDEO' && !req.file ? linkUrl : null),
      fileName:     req.file?.originalname || null,
      fileSize:     req.file?.size || null,
      thumbnailUrl: thumbnailUrl || null,
      orderIndex:   next,
    });
    res.status(201).json({ success: true, material });
  } catch (e) {
    console.error('createMaterial:', e.message);
    safeUnlink(uploadedAbsPath);
    res.status(500).json({ error: 'Failed to create material' });
  }
}

// GET /api/trainer/lessons/:lessonId/materials
async function listMaterials(req, res) {
  try {
    const lesson = await loadOwnedLesson(req, res, req.params.lessonId);
    if (!lesson) return;
    const materials = await LessonMaterial.findAll({
      where: { lessonId: lesson.id },
      order: [['orderIndex', 'ASC'], ['id', 'ASC']],
    });
    res.json({ success: true, materials });
  } catch (e) {
    console.error('listMaterials:', e.message);
    res.status(500).json({ error: 'Failed to list materials' });
  }
}

// PUT /api/trainer/lessons/:lessonId/materials/:id
async function updateMaterial(req, res) {
  try {
    const lesson = await loadOwnedLesson(req, res, req.params.lessonId);
    if (!lesson) return;
    const material = await LessonMaterial.findOne({ where: { id: req.params.id, lessonId: lesson.id } });
    if (!material) return res.status(404).json({ error: 'Material not found' });

    const { title, content, linkUrl, orderIndex, thumbnailUrl } = req.body;
    await material.update({
      title:        title        ?? material.title,
      content:      content      !== undefined ? content      : material.content,
      linkUrl:      linkUrl      !== undefined ? linkUrl      : material.linkUrl,
      thumbnailUrl: thumbnailUrl !== undefined ? thumbnailUrl : material.thumbnailUrl,
      orderIndex:   orderIndex   != null ? parseInt(orderIndex, 10) : material.orderIndex,
    });
    res.json({ success: true, material });
  } catch (e) {
    console.error('updateMaterial:', e.message);
    res.status(500).json({ error: 'Failed to update material' });
  }
}

// DELETE /api/trainer/lessons/:lessonId/materials/:id
async function deleteMaterial(req, res) {
  try {
    const lesson = await loadOwnedLesson(req, res, req.params.lessonId);
    if (!lesson) return;
    const material = await LessonMaterial.findOne({ where: { id: req.params.id, lessonId: lesson.id } });
    if (!material) return res.status(404).json({ error: 'Material not found' });

    // Best-effort: delete the underlying file if it lives in our uploads tree.
    if (material.fileUrl && material.fileUrl.startsWith('/uploads/')) {
      const abs = path.join(process.cwd(), material.fileUrl.replace(/^\//, ''));
      safeUnlink(abs);
    }
    await material.destroy();
    res.json({ success: true, message: 'Material deleted' });
  } catch (e) {
    console.error('deleteMaterial:', e.message);
    res.status(500).json({ error: 'Failed to delete material' });
  }
}

// PUT /api/trainer/lessons/:lessonId/materials/reorder  { orderedIds }
async function reorderMaterials(req, res) {
  try {
    const lesson = await loadOwnedLesson(req, res, req.params.lessonId);
    if (!lesson) return;
    const ordered = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : null;
    if (!ordered) return res.status(422).json({ error: 'orderedIds[] is required' });

    const materials = await LessonMaterial.findAll({ where: { id: ordered, lessonId: lesson.id } });
    if (materials.length !== ordered.length) {
      return res.status(400).json({ error: 'One or more materials do not belong to this lesson' });
    }
    await sequelize.transaction(async t => {
      for (let i = 0; i < ordered.length; i++) {
        await LessonMaterial.update({ orderIndex: i }, { where: { id: ordered[i] }, transaction: t });
      }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('reorderMaterials:', e.message);
    res.status(500).json({ error: 'Failed to reorder materials' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZZES (course-scoped)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/trainer/courses/:courseId/quiz/manual
//   { title, lessonId?, isMandatory?, questions: [{question, options:[a,b,c,d], correctIndex}] }
async function createManualQuiz(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const { title, lessonId, isMandatory, questions } = req.body;
    if (!title || !title.trim()) return res.status(422).json({ error: 'Title is required' });
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(422).json({ error: 'At least one question is required' });
    }

    if (lessonId) {
      const lesson = await Lesson.findOne({ where: { id: lessonId, courseId: course.id } });
      if (!lesson) return res.status(400).json({ error: 'lessonId does not belong to this course' });
    }

    const quiz = await sequelize.transaction(async t => {
      const q = await AIQuiz.create({
        courseId:    course.id,
        lessonId:    lessonId || null,
        trainerId:   req.user.id,
        title:       title.trim(),
        numQuestions: questions.length,
        difficulty:  'MIXED',
        status:      'DRAFT',
        resultStatus: 'HIDDEN',
        isMandatory: isMandatory !== false,
      }, { transaction: t });

      for (let i = 0; i < questions.length; i++) {
        const qd = questions[i];
        if (!qd.question || !Array.isArray(qd.options) || qd.options.length !== 4) {
          throw new Error(`Question ${i + 1} must have a question text and exactly 4 options`);
        }
        const correctIdx = parseInt(qd.correctIndex, 10);
        if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx > 3) {
          throw new Error(`Question ${i + 1} has invalid correctIndex (must be 0–3)`);
        }
        await AIQuestion.create({
          quizId:        q.id,
          questionText:  qd.question,
          questionType:  'MCQ',
          options:       qd.options,
          correctAnswer: qd.options[correctIdx],
          explanation:   qd.explanation || '',
          difficulty:    qd.difficulty || 'MEDIUM',
          order:         i,
        }, { transaction: t });
      }
      return q;
    });

    res.status(201).json({ success: true, quiz: { id: quiz.id, title: quiz.title, status: quiz.status } });
  } catch (e) {
    console.error('createManualQuiz:', e.message);
    res.status(400).json({ error: e.message || 'Failed to create quiz' });
  }
}

// GET /api/trainer/courses/:courseId/quizzes
async function listCourseQuizzes(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const quizzes = await AIQuiz.findAll({
      where: { courseId: course.id },
      include: [
        { model: Lesson,    as: 'lesson',    attributes: ['id', 'title'], required: false },
        { model: AIQuestion, as: 'questions', attributes: ['id'], required: false },
      ],
      order: [['id', 'DESC']],
    });
    const out = quizzes.map(q => ({
      id: q.id,
      title: q.title,
      lessonId: q.lessonId,
      lessonTitle: q.lesson?.title || null,
      questionCount: (q.questions || []).length,
      status: q.status,
      resultStatus: q.resultStatus,
      isMandatory: q.isMandatory,
      createdAt: q.createdAt,
    }));
    res.json({ success: true, quizzes: out });
  } catch (e) {
    console.error('listCourseQuizzes:', e.message);
    res.status(500).json({ error: 'Failed to list quizzes' });
  }
}

// GET /api/trainer/courses/:courseId/quizzes/:quizId
async function getCourseQuiz(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const quiz = await AIQuiz.findOne({
      where: { id: req.params.quizId, courseId: course.id },
      include: [
        { model: Lesson, as: 'lesson', attributes: ['id', 'title'], required: false },
        { model: AIQuestion, as: 'questions' },
      ],
    });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json({ success: true, quiz });
  } catch (e) {
    console.error('getCourseQuiz:', e.message);
    res.status(500).json({ error: 'Failed to load quiz' });
  }
}

// PUT /api/trainer/courses/:courseId/quizzes/:quizId
async function updateCourseQuiz(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const quiz = await AIQuiz.findOne({ where: { id: req.params.quizId, courseId: course.id } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    const {
      title, lessonId, isMandatory, status, questions,
      showResultImmediately, showCorrectAnswersOnResult, shuffleQuestions,
      allowMultipleAttempts, maxAttempts, difficulty, timeLimit,
      copyProtectionEnabled, maxCopyWarnings, copyViolationActions,
      copyWarningMessage, copyDisqualifyAction,
      proctoringEnabled, proctoringLevel, gracePeriodMinutes
    } = req.body;

    if (status && !['DRAFT', 'PUBLISHED', 'CLOSED'].includes(status)) {
      return res.status(422).json({ error: 'Invalid status' });
    }
    if (lessonId !== undefined && lessonId !== null) {
      const lesson = await Lesson.findOne({ where: { id: lessonId, courseId: course.id } });
      if (!lesson) return res.status(400).json({ error: 'lessonId does not belong to this course' });
    }

    await sequelize.transaction(async t => {
      await quiz.update({
        title:                      title                      ?? quiz.title,
        lessonId:                   lessonId                   !== undefined ? lessonId : quiz.lessonId,
        isMandatory:                isMandatory                !== undefined ? isMandatory : quiz.isMandatory,
        status:                     status                     ?? quiz.status,
        showResultImmediately:      showResultImmediately      !== undefined ? showResultImmediately : quiz.showResultImmediately,
        showCorrectAnswersOnResult: showCorrectAnswersOnResult !== undefined ? showCorrectAnswersOnResult : quiz.showCorrectAnswersOnResult,
        shuffleQuestions:           shuffleQuestions           !== undefined ? shuffleQuestions : quiz.shuffleQuestions,
        allowMultipleAttempts:      allowMultipleAttempts      !== undefined ? allowMultipleAttempts : quiz.allowMultipleAttempts,
        maxAttempts:                maxAttempts                !== undefined ? maxAttempts : quiz.maxAttempts,
        difficulty:                 difficulty                 ?? quiz.difficulty,
        timeLimit:                  timeLimit                  !== undefined ? timeLimit : quiz.timeLimit,
        copyProtectionEnabled:      copyProtectionEnabled      !== undefined ? copyProtectionEnabled : quiz.copyProtectionEnabled,
        maxCopyWarnings:            maxCopyWarnings            !== undefined ? maxCopyWarnings : quiz.maxCopyWarnings,
        copyViolationActions:       copyViolationActions       !== undefined ? copyViolationActions : quiz.copyViolationActions,
        copyWarningMessage:         copyWarningMessage         !== undefined ? copyWarningMessage : quiz.copyWarningMessage,
        copyDisqualifyAction:       copyDisqualifyAction       !== undefined ? copyDisqualifyAction : quiz.copyDisqualifyAction,
        proctoringEnabled:          proctoringEnabled          !== undefined ? proctoringEnabled : quiz.proctoringEnabled,
        proctoringLevel:            proctoringLevel            !== undefined ? proctoringLevel : quiz.proctoringLevel,
        gracePeriodMinutes:         gracePeriodMinutes         !== undefined ? gracePeriodMinutes : quiz.gracePeriodMinutes,
      }, { transaction: t });
      if (questions) {
        // Replace all questions atomically — simplest correct semantics for
        // a JSON PUT.
        await AIQuestion.destroy({ where: { quizId: quiz.id }, transaction: t });
        for (let i = 0; i < questions.length; i++) {
          const qd = questions[i];
          const correctIdx = parseInt(qd.correctIndex, 10);
          await AIQuestion.create({
            quizId:        quiz.id,
            questionText:  qd.question,
            questionType:  'MCQ',
            options:       qd.options,
            correctAnswer: qd.options[correctIdx],
            explanation:   qd.explanation || '',
            difficulty:    qd.difficulty || 'MEDIUM',
            order:         i,
          }, { transaction: t });
        }
        await quiz.update({ numQuestions: questions.length }, { transaction: t });
      }
    });

    res.json({ success: true, quiz });
  } catch (e) {
    console.error('updateCourseQuiz:', e.message);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
}

// DELETE /api/trainer/courses/:courseId/quizzes/:quizId
async function deleteCourseQuiz(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const quiz = await AIQuiz.findOne({ where: { id: req.params.quizId, courseId: course.id } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const quizId = quiz.id;

    await sequelize.transaction(async (t) => {
      // 1. Find all dependent entity IDs to handle deep child records
      const attempts = await QuizAttempt.findAll({ where: { quizId }, transaction: t });
      const attemptIds = attempts.map(a => a.id);

      const examSessions = await ExamSession.findAll({ where: { quizId }, transaction: t });
      const examSessionIds = examSessions.map(es => es.id);

      const questions = await AIQuestion.findAll({ where: { quizId }, transaction: t });
      const questionIds = questions.map(q => q.id);

      const lessonQuizzes = await LessonQuiz.findAll({ where: { quizId }, transaction: t });
      const lessonQuizIds = lessonQuizzes.map(lq => lq.id);

      // 2. Delete leaf nodes and child records in order of dependency constraints
      if (examSessionIds.length > 0) {
        await ProctorActivity.destroy({ where: { sessionId: { [Op.in]: examSessionIds } }, transaction: t });
        await Violation.destroy({ where: { sessionId: { [Op.in]: examSessionIds } }, transaction: t });
      }

      await AssessmentSession.destroy({ where: { quizId }, transaction: t });
      await ExamSession.destroy({ where: { quizId }, transaction: t });

      if (lessonQuizIds.length > 0) {
        await QuizProgress.destroy({ where: { lessonQuizId: { [Op.in]: lessonQuizIds } }, transaction: t });
      }
      await LessonQuiz.destroy({ where: { quizId }, transaction: t });

      if (attemptIds.length > 0) {
        await QuizAnswer.destroy({ where: { attemptId: { [Op.in]: attemptIds } }, transaction: t });
      }
      await QuizResult.destroy({ where: { quizId }, transaction: t });
      await QuizAttempt.destroy({ where: { quizId }, transaction: t });

      if (questionIds.length > 0) {
        await AIQuestionOption.destroy({ where: { questionId: { [Op.in]: questionIds } }, transaction: t });
      }
      await AIQuestion.destroy({ where: { quizId }, transaction: t });

      // 3. Delete the parent quiz
      await quiz.destroy({ transaction: t });
    });

    res.json({ success: true, message: 'Quiz deleted successfully' });
  } catch (e) {
    console.error('deleteCourseQuiz error:', e);
    res.status(500).json({
      error: 'Failed to delete quiz',
      message: e.message || 'Failed to delete quiz'
    });
  }
}

// POST /api/trainer/courses/:courseId/quizzes/:quizId/publish
async function publishQuizResults(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const quiz = await AIQuiz.findOne({ where: { id: req.params.quizId, courseId: course.id } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const force = req.body.force === true || req.body.override === true || req.query.force === 'true';
    const reason = req.body.reason || null;
    const participantIds = await courseParticipantIds(course.id);

    // ✅ FIX: Use QuizResult.count — a result row only exists when a participant
    // fully completes and is graded, regardless of QuizAttempt.status enum value.
    // The old code counted QuizAttempt{ status:'SUBMITTED' } which missed
    // attempts stored as 'EVALUATED' or 'AUTO_SUBMITTED'.
    const completed = participantIds.length === 0 ? 0 : await QuizResult.count({
      where: { quizId: quiz.id, participantId: participantIds },
    });
    const pending = participantIds.length - completed;

    if (pending > 0 && !force) {
      return res.status(409).json({
        error: 'Not all participants have completed the quiz',
        enrolled: participantIds.length,
        completed,
        pending,
      });
    }

    const now = new Date();
    const trainerId = req.user.id;

    // Mark every QuizResult for this quiz as published
    await QuizResult.update(
      { resultPublished: true, publishedAt: now, publishedBy: trainerId },
      { where: { quizId: quiz.id } }
    );

    await quiz.update({
      resultStatus: 'PUBLISHED',
      status: 'PUBLISHED',
      isResultPublished: true,
      resultPublishedAt: now,
    });

    // Write audit log
    try {
      const { QuizResultsAudit } = require('../models');
      await QuizResultsAudit.create({
        quizId: quiz.id,
        action: pending > 0 ? 'override_used' : 'published',
        performedBy: trainerId,
        enrolledCount: participantIds.length,
        completedCount: completed,
        pendingCount: pending,
        reason: pending > 0 ? (reason || 'Override used without reason') : null,
      });
    } catch (auditErr) {
      console.warn('[publishQuizResults] Audit log failed (non-fatal):', auditErr.message);
    }

    // Notify all enrolled participants
    const io = req.app.get('io');
    await Promise.all(participantIds.map(pid =>
      NotificationService.createNotification({
        userId: pid,
        message: `Quiz results published for "${quiz.title}"`,
        type: 'OTHER',
        actionUrl: `/participant/courses/${course.id}`,
        relatedEntityId: quiz.id,
        relatedEntityType: 'AIQuiz',
      }, io).catch(() => {}),
    ));

    // Emit real-time leaderboard update
    if (io) {
      io.emit('quiz:results:published', { quizId: quiz.id, courseId: course.id });
    }

    res.json({ success: true, message: 'Quiz results published', enrolled: participantIds.length, completed, published_at: now });
  } catch (e) {
    console.error('publishQuizResults:', e.message);
    res.status(500).json({ error: 'Failed to publish quiz results' });
  }
}

// GET /api/trainer/courses/:courseId/quizzes/:quizId/dashboard
async function quizDashboard(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const quiz = await AIQuiz.findOne({ where: { id: req.params.quizId, courseId: course.id } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const participantIds = await courseParticipantIds(course.id);

    // ✅ FIX: Count participants who have a QuizResult row (fully graded) instead of
    // counting QuizAttempt{ status:'SUBMITTED' }. The AI quiz flow writes EVALUATED
    // attempts, which were never counted by the old query — making everyone look PENDING.
    const completed = participantIds.length === 0 ? 0 : await QuizResult.count({
      where: { quizId: quiz.id, participantId: participantIds },
    });
    const pending = participantIds.length - completed;

    // Average score and pass rate (only meaningful once some results exist)
    let averageScore = null;
    let passRate = null;
    if (completed > 0) {
      const { fn, col } = require('sequelize');
      const agg = await QuizResult.findOne({
        where: { quizId: quiz.id, participantId: participantIds },
        attributes: [
          [fn('AVG', col('percentage')), 'avg'],
        ],
        raw: true,
      });
      averageScore = agg?.avg != null ? parseFloat(parseFloat(agg.avg).toFixed(1)) : null;
      // Pass rate: % who scored >= 50 (configurable later via quiz.passScore)
      const passThreshold = quiz.passScore || 50;
      const passed = await QuizResult.count({
        where: {
          quizId: quiz.id,
          participantId: participantIds,
          percentage: { [Op.gte]: passThreshold }
        },
      });
      passRate = completed > 0 ? parseFloat(((passed / completed) * 100).toFixed(1)) : null;
    }

    res.json({
      success: true,
      enrolled: participantIds.length,
      completed,
      pending,
      averageScore,
      passRate,
      canPublish: participantIds.length > 0 && pending === 0 && quiz.resultStatus === 'HIDDEN',
      resultStatus: quiz.resultStatus,
      quizTitle: quiz.title,
    });
  } catch (e) {
    console.error('quizDashboard:', e.message);
    res.status(500).json({ error: 'Failed to load quiz dashboard' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICIPANTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/trainer/courses/:courseId/participants
async function listParticipants(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const enrollments = await Enrollment.findAll({
      where: {
        courseId: course.id,
        status: { [Op.in]: ['ENROLLED', 'PENDING'] }
      },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      order: [['enrolled_at', 'DESC']],
    });
    const totalLessons = await Lesson.count({ where: { courseId: course.id } });

    // Fetch lesson progress + quiz attempts in bulk
    const participantIds = enrollments.map(e => e.participantId);
    const lessons = await Lesson.findAll({ where: { courseId: course.id }, attributes: ['id'] });
    const lessonIds = lessons.map(l => l.id);

    const [doneRows, resultRows] = await Promise.all([
      lessonIds.length === 0 || participantIds.length === 0 ? [] : LessonProgress.findAll({
        where: { lessonId: lessonIds, participantId: participantIds, status: 'COMPLETED' },
        attributes: ['participantId', [sequelize.fn('COUNT', '*'), 'cnt']],
        group: ['participantId'],
        raw: true,
      }),
      participantIds.length === 0 ? [] : QuizResult.findAll({
        where: { participantId: participantIds },
        include: [{
          model: AIQuiz, as: 'quiz',
          attributes: ['id', 'courseId'],
          where: { courseId: course.id },
          required: true,
        }],
        attributes: ['participantId', 'percentage'],
      }),
    ]);
    const doneMap = Object.fromEntries((doneRows || []).map(r => [String(r.participantId), Number(r.cnt)]));
    const scoreMap = {};
    resultRows.forEach(r => {
      const pid = String(r.participantId);
      scoreMap[pid] = scoreMap[pid] || [];
      if (r.percentage != null) scoreMap[pid].push(Number(r.percentage));
    });

    const out = enrollments.map(e => {
      const pid = String(e.participantId);
      const lessonsDone = doneMap[pid] || 0;
      const scores = scoreMap[pid] || [];
      const avgScore = scores.length ? (scores.reduce((s, x) => s + x, 0) / scores.length) : null;
      return {
        participantId: e.participantId,
        name: e.participant?.name || 'Unknown',
        email: e.participant?.email || '',
        enrolledAt: e.enrolled_at || e.createdAt,
        lessonsDone,
        totalLessons,
        avgQuizScore: avgScore != null ? Number(avgScore.toFixed(2)) : null,
        progressPercent: Number(e.progressPercent || 0),
        status: e.status,
      };
    });
    res.json({ success: true, participants: out });
  } catch (e) {
    console.error('listParticipants:', e.message);
    res.status(500).json({ error: 'Failed to list participants' });
  }
}

// GET /api/trainer/courses/:courseId/participants/:userId
async function getParticipantDetail(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const userId = parseInt(req.params.userId, 10);

    const [enrollment, user] = await Promise.all([
      Enrollment.findOne({ where: { courseId: course.id, participantId: userId } }),
      User.findByPk(userId, { attributes: ['id', 'name', 'email'] }),
    ]);
    if (!enrollment) return res.status(404).json({ error: 'Participant not enrolled in this course' });

    const lessons = await Lesson.findAll({
      where: { courseId: course.id },
      attributes: ['id', 'title', 'orderIndex'],
      order: [['orderIndex', 'ASC']],
    });
    const lessonIds = lessons.map(l => l.id);
    const [progress, quizzes, results, submissions] = await Promise.all([
      LessonProgress.findAll({ where: { lessonId: lessonIds, participantId: userId } }),
      AIQuiz.findAll({ where: { courseId: course.id }, attributes: ['id', 'title', 'lessonId', 'resultStatus'] }),
      QuizResult.findAll({
        where: { participantId: userId },
        include: [{ model: AIQuiz, as: 'quiz', where: { courseId: course.id }, required: true }],
      }),
      AssessmentSubmission.findAll({
        where: { participantId: userId },
        include: [{ model: LessonAssessment, as: 'assessment', where: { lessonId: lessonIds }, required: true }],
      }),
    ]);

    const progByLesson = Object.fromEntries(progress.map(p => [String(p.lessonId), p]));
    res.json({
      success: true,
      participant: { id: user?.id, name: user?.name, email: user?.email },
      enrollment: {
        enrolledAt: enrollment.enrolled_at || enrollment.createdAt,
        progressPercent: Number(enrollment.progressPercent || 0),
        status: enrollment.status,
      },
      lessons: lessons.map(l => ({
        lessonId: l.id,
        title: l.title,
        contentViewed:  progByLesson[String(l.id)]?.contentViewed || false,
        status:         progByLesson[String(l.id)]?.status || 'NOT_STARTED',
        completedAt:    progByLesson[String(l.id)]?.completedAt || null,
      })),
      quizzes: quizzes.map(q => {
        const result = results.find(r => r.quizId === q.id);
        return {
          quizId: q.id,
          title: q.title,
          submitted: !!result,
          score: result?.percentage != null ? Number(result.percentage) : null,
          resultPublished: q.resultStatus === 'PUBLISHED',
        };
      }),
      assessments: submissions.map(s => ({
        submissionId: s.id,
        assessmentId: s.assessmentId,
        title: s.assessment?.title,
        status: s.status,
        score: s.score != null ? Number(s.score) : null,
        feedback: s.feedback,
      })),
    });
  } catch (e) {
    console.error('getParticipantDetail:', e.message);
    res.status(500).json({ error: 'Failed to load participant detail' });
  }
}

// PUT /api/trainer/courses/:courseId/participants/:userId/approve
async function approveParticipant(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const userId = parseInt(req.params.userId, 10);
    const enrollment = await Enrollment.findOne({
      where: { courseId: course.id, participantId: userId, status: 'PENDING' },
    });
    if (!enrollment) {
      return res.status(404).json({ error: 'Pending enrollment request not found' });
    }

    await enrollment.update({ status: 'ENROLLED' });

    // Send notification to participant
    NotificationService.createNotification({
      userId: userId,
      message: `Your enrollment in course "${course.title}" has been approved!`,
      type: 'OTHER',
      actionUrl: `/participant/courses/${course.id}`,
      relatedEntityId: course.id,
      relatedEntityType: 'Course',
    }, req.app.get('io')).catch(() => {});

    res.json({ success: true, message: 'Participant approved successfully' });
  } catch (e) {
    console.error('approveParticipant:', e.message);
    res.status(500).json({ error: 'Failed to approve participant' });
  }
}

// PUT /api/trainer/courses/:courseId/participants/:userId/reject
async function rejectParticipant(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const userId = parseInt(req.params.userId, 10);
    const enrollment = await Enrollment.findOne({
      where: { courseId: course.id, participantId: userId, status: 'PENDING' },
    });
    if (!enrollment) {
      return res.status(404).json({ error: 'Pending enrollment request not found' });
    }

    await enrollment.update({ status: 'CANCELLED' });

    // Send notification to participant
    NotificationService.createNotification({
      userId: userId,
      message: `Your enrollment request for "${course.title}" was rejected.`,
      type: 'OTHER',
      actionUrl: `/participant/courses/explore`,
      relatedEntityId: course.id,
      relatedEntityType: 'Course',
    }, req.app.get('io')).catch(() => {});

    res.json({ success: true, message: 'Participant enrollment request rejected' });
  } catch (e) {
    console.error('rejectParticipant:', e.message);
    res.status(500).json({ error: 'Failed to reject participant' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/trainer/courses/:courseId/analytics
async function courseAnalytics(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const enrollments = await Enrollment.findAll({
      where: { courseId: course.id, status: 'ENROLLED' },
      attributes: ['participantId', 'progressPercent'],
    });
    const totalEnrolled = enrollments.length;
    let completed = 0, inProgress = 0, notStarted = 0;
    enrollments.forEach(e => {
      const p = Number(e.progressPercent || 0);
      if      (p >= 100) completed++;
      else if (p > 0)    inProgress++;
      else               notStarted++;
    });

    // Per-quiz average score (uses quiz_results.percentage as the canonical score)
    const quizzes = await AIQuiz.findAll({ where: { courseId: course.id }, attributes: ['id', 'title'] });
    const quizScoreRows = quizzes.length === 0 ? [] : await QuizResult.findAll({
      where: { quizId: quizzes.map(q => q.id) },
      attributes: [
        'quizId',
        [sequelize.fn('AVG', sequelize.col('percentage')), 'avgScore'],
        [sequelize.fn('COUNT', '*'), 'attempts'],
      ],
      group: ['quizId'],
      raw: true,
    });
    const scoreLookup = Object.fromEntries(quizScoreRows.map(r => [String(r.quizId), { avg: Number(r.avgScore || 0), attempts: Number(r.attempts || 0) }]));

    // Per-lesson completion rate
    const lessons = await Lesson.findAll({ where: { courseId: course.id }, attributes: ['id', 'title'] });
    const lessonCompRows = lessons.length === 0 || totalEnrolled === 0 ? [] : await LessonProgress.findAll({
      where: { lessonId: lessons.map(l => l.id), status: 'COMPLETED' },
      attributes: ['lessonId', [sequelize.fn('COUNT', '*'), 'cnt']],
      group: ['lessonId'],
      raw: true,
    });
    const lessonComp = Object.fromEntries(lessonCompRows.map(r => [String(r.lessonId), Number(r.cnt)]));

    // Engagement over time (last 14 days) — lessons completed per day
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const engagement = lessons.length === 0 ? [] : await LessonProgress.findAll({
      where: {
        lessonId: lessons.map(l => l.id),
        status: 'COMPLETED',
        completedAt: { [Op.gte]: since },
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('completed_at')), 'day'],
        [sequelize.fn('COUNT', '*'), 'cnt'],
      ],
      group: [sequelize.fn('DATE', sequelize.col('completed_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('completed_at')), 'ASC']],
      raw: true,
    });

    res.json({
      success: true,
      completion: {
        completed,
        inProgress,
        notStarted,
        totalEnrolled,
      },
      quizScores: quizzes.map(q => ({
        quizId: q.id,
        title: q.title,
        avgScore:   scoreLookup[String(q.id)]?.avg || 0,
        attempts:   scoreLookup[String(q.id)]?.attempts || 0,
      })),
      lessonCompletion: lessons.map(l => ({
        lessonId: l.id,
        title: l.title,
        completedCount: lessonComp[String(l.id)] || 0,
        completionRate: totalEnrolled > 0
          ? Number(((lessonComp[String(l.id)] || 0) / totalEnrolled * 100).toFixed(1))
          : 0,
      })),
      engagement: engagement.map(r => ({ day: r.day, lessonsCompleted: Number(r.cnt) })),
    });
  } catch (e) {
    console.error('courseAnalytics:', e.message);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSMENTS (course-scoped wrappers; reuse existing grading semantics)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/trainer/courses/:courseId/lessons/:lessonId/assessments
async function createAssessment(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const lesson = await Lesson.findOne({ where: { id: req.params.lessonId, courseId: course.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const { title, instructions, maxScore, isMandatory } = req.body;
    if (!title || !title.trim()) return res.status(422).json({ error: 'Title is required' });
    const a = await LessonAssessment.create({
      lessonId: lesson.id,
      title: title.trim(),
      instructions: instructions || null,
      maxScore: maxScore || 100,
      isMandatory: isMandatory !== false,
    });
    res.status(201).json({ success: true, assessment: a });
  } catch (e) {
    console.error('createAssessment:', e.message);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
}

// GET /api/trainer/courses/:courseId/lessons/:lessonId/assessments
async function listAssessments(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;
    const lesson = await Lesson.findOne({ where: { id: req.params.lessonId, courseId: course.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const items = await LessonAssessment.findAll({ where: { lessonId: lesson.id }, order: [['id', 'ASC']] });
    res.json({ success: true, assessments: items });
  } catch (e) {
    console.error('listAssessments:', e.message);
    res.status(500).json({ error: 'Failed to list assessments' });
  }
}

// PUT /api/trainer/assessments/:assessmentId
async function updateAssessment(req, res) {
  try {
    const a = await LessonAssessment.findByPk(req.params.assessmentId, {
      include: [{ model: Lesson, as: 'lesson' }],
    });
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    const lesson = await loadOwnedLesson(req, res, a.lessonId);
    if (!lesson) return;

    const { title, instructions, maxScore, isMandatory } = req.body;
    await a.update({
      title:        title        ?? a.title,
      instructions: instructions !== undefined ? instructions : a.instructions,
      maxScore:     maxScore     != null ? maxScore : a.maxScore,
      isMandatory:  isMandatory  !== undefined ? isMandatory : a.isMandatory,
    });
    res.json({ success: true, assessment: a });
  } catch (e) {
    console.error('updateAssessment:', e.message);
    res.status(500).json({ error: 'Failed to update assessment' });
  }
}

// GET /api/trainer/assessments/:assessmentId/submissions
async function listSubmissions(req, res) {
  try {
    const a = await LessonAssessment.findByPk(req.params.assessmentId);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    const lesson = await loadOwnedLesson(req, res, a.lessonId);
    if (!lesson) return;
    const submissions = await AssessmentSubmission.findAll({
      where: { assessmentId: a.id },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      order: [['id', 'DESC']],
    });
    res.json({ success: true, submissions });
  } catch (e) {
    console.error('listSubmissions:', e.message);
    res.status(500).json({ error: 'Failed to list submissions' });
  }
}

// PUT /api/trainer/submissions/:submissionId/grade
async function gradeSubmission(req, res) {
  try {
    const s = await AssessmentSubmission.findByPk(req.params.submissionId, {
      include: [{ model: LessonAssessment, as: 'assessment' }],
    });
    if (!s) return res.status(404).json({ error: 'Submission not found' });
    const lesson = await loadOwnedLesson(req, res, s.assessment.lessonId);
    if (!lesson) return;

    const { score, feedback } = req.body;
    await s.update({
      score:      score != null ? Number(score) : s.score,
      feedback:   feedback !== undefined ? feedback : s.feedback,
      status:     'REVIEWED',
      reviewedAt: new Date(),
    });
    res.json({ success: true, submission: s });
  } catch (e) {
    console.error('gradeSubmission:', e.message);
    res.status(500).json({ error: 'Failed to grade submission' });
  }
}

// POST /api/trainer/submissions/:submissionId/publish
async function publishSubmission(req, res) {
  try {
    const s = await AssessmentSubmission.findByPk(req.params.submissionId, {
      include: [{ model: LessonAssessment, as: 'assessment' }],
    });
    if (!s) return res.status(404).json({ error: 'Submission not found' });
    const lesson = await loadOwnedLesson(req, res, s.assessment.lessonId);
    if (!lesson) return;

    if (s.status !== 'REVIEWED') {
      return res.status(409).json({ error: 'Submission must be REVIEWED before publishing' });
    }
    await s.update({ status: 'PUBLISHED' });

    NotificationService.createNotification({
      userId: s.participantId,
      message: `Assessment result published: "${s.assessment.title}"`,
      type: 'OTHER',
      actionUrl: `/participant/lessons/${s.assessment.lessonId}`,
      relatedEntityId: s.id,
      relatedEntityType: 'AssessmentSubmission',
    }, req.app.get('io')).catch(() => {});

    res.json({ success: true, submission: s });
  } catch (e) {
    console.error('publishSubmission:', e.message);
    res.status(500).json({ error: 'Failed to publish submission' });
  }
}

// GET /api/trainer/courses/:courseId/available-participants
async function getAvailableParticipants(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    // Find all participants already enrolled or pending in this course
    const enrollments = await Enrollment.findAll({
      where: {
        courseId: course.id,
        status: { [Op.in]: ['ENROLLED', 'PENDING', 'COMPLETED'] }
      },
      attributes: ['participantId'],
    });
    const enrolledIds = enrollments.map(e => e.participantId);

    // Fetch all users with role 'PARTICIPANT' who are not in enrolledIds
    const whereClause = { role: 'PARTICIPANT' };
    if (enrolledIds.length > 0) {
      whereClause.id = { [Op.notIn]: enrolledIds };
    }

    const participants = await User.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']],
    });

    res.json({ success: true, participants });
  } catch (e) {
    console.error('getAvailableParticipants:', e.message);
    res.status(500).json({ error: 'Failed to list available participants' });
  }
}

// POST /api/trainer/courses/:courseId/participants
async function addParticipant(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const participantId = parseInt(req.body.participantId, 10);
    if (!participantId) return res.status(422).json({ error: 'participantId is required' });

    const participant = await User.findOne({ where: { id: participantId, role: 'PARTICIPANT' } });
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    // Check if there is already an enrollment
    const [enrollment, created] = await Enrollment.findOrCreate({
      where: { courseId: course.id, participantId },
      defaults: {
        courseId: course.id,
        participantId,
        trainingId: course.trainingProgramId, // copy trainingProgramId to trainingId for legacy compat
        status: 'ENROLLED',
        progressPercent: 0,
      }
    });

    if (!created && enrollment.status !== 'ENROLLED') {
      await enrollment.update({ status: 'ENROLLED', progressPercent: 0 });
    }

    // Send notification
    const io = req.app.get('io');
    NotificationService.createNotification({
      userId: participantId,
      message: `You have been enrolled in course "${course.title}"!`,
      type: 'OTHER',
      actionUrl: `/participant/courses/${course.id}`,
      relatedEntityId: course.id,
      relatedEntityType: 'Course',
    }, io).catch(() => {});

    // Log activity
    try {
      const ActivityService = require('../services/activityService');
      await ActivityService.logActivity({
        userId: req.user.id, // the trainer who added the participant
        userName: req.user.name || 'Trainer',
        action: 'ENROLLMENT_DONE',
        entityType: 'Course',
        entityId: course.id,
        details: { courseName: course.title, participantName: participant.name }
      }, io);
    } catch (actError) {
      console.error('logActivity failed:', actError.message);
    }

    res.status(created ? 201 : 200).json({ success: true, message: 'Participant added successfully', enrollment });
  } catch (e) {
    console.error('addParticipant:', e.message);
    res.status(500).json({ error: 'Failed to add participant' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI COURSE STRUCTURE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/trainer/courses/:courseId/generate-structure
async function generateCourseStructure(req, res) {
  try {
    const course = await loadOwnedCourse(req, res, req.params.courseId);
    if (!course) return;

    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(422).json({ error: 'Prompt is required' });
    }

    const payload = { prompt: prompt.trim() };

    // If a file was uploaded, pass its path to the Python service for extraction
    if (req.file) {
      payload.file_path = req.file.path;
      payload.mime_type = req.file.mimetype;
    }

    const result = await aiService.generateCourseStructure(payload);

    // Clean up uploaded temp file
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }

    res.json({ success: true, structure: result.structure });
  } catch (e) {
    // Clean up uploaded temp file on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    console.error('generateCourseStructure:', e.message);
    res.status(500).json({ error: e.message || 'Failed to generate course structure' });
  }
}

module.exports = {
  // Courses
  listMyCourses,
  createCourse,
  listAllPrograms,
  getCourseDetail,
  updateOwnCourse,
  // Lessons
  createLesson,
  listLessons,
  getLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  // Materials
  createMaterial,
  listMaterials,
  updateMaterial,
  deleteMaterial,
  reorderMaterials,
  // Quizzes
  createManualQuiz,
  listCourseQuizzes,
  getCourseQuiz,
  updateCourseQuiz,
  deleteCourseQuiz,
  publishQuizResults,
  quizDashboard,
  // Participants
  listParticipants,
  getParticipantDetail,
  approveParticipant,
  rejectParticipant,
  getAvailableParticipants,
  addParticipant,
  // Analytics
  courseAnalytics,
  // Assessments
  createAssessment,
  listAssessments,
  updateAssessment,
  listSubmissions,
  gradeSubmission,
  publishSubmission,
  // AI Course Structure
  generateCourseStructure,
};
