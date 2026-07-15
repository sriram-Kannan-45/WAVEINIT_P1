const {
  Lesson, LessonQuiz, LessonAssessment, AssessmentSubmission,
  QuizProgress, LessonProgress, Enrollment, AIQuiz, User,
} = require('../models');
const NotificationService = require('../services/notificationService');
const { Training, Course } = require('../models');

// ── Helpers ──────────────────────────────────────────────────────────────────

const assignedParticipantIds = async (trainingId) => {
  const rows = await Enrollment.findAll({
    where: { trainingId, status: 'ENROLLED' },
    attributes: ['participantId']
  });
  return rows.map(r => r.participantId);
};

const quizStats = async (lessonQuiz) => {
  const lesson = await Lesson.findByPk(lessonQuiz.lessonId);
  const ids = await assignedParticipantIds(lesson.trainingId);
  const completed = ids.length
    ? await QuizProgress.count({
        where: { lessonQuizId: lessonQuiz.id, participantId: ids, status: 'COMPLETED' }
      })
    : 0;
  return { total: ids.length, completed, pending: ids.length - completed, assignedIds: ids };
};

// ── Trainer: authoring ───────────────────────────────────────────────────────

const createLesson = async (req, res) => {
  try {
    const { trainingId, title, content, orderIndex } = req.body;
    if (!trainingId || !title) return res.status(422).json({ error: 'trainingId and title are required' });
    const lesson = await Lesson.create({
      trainingId, title, content, orderIndex: orderIndex || 0, trainerId: req.user.id
    });
    return res.json({ success: true, lesson });
  } catch (error) {
    console.error('Error creating lesson:', error);
    return res.status(500).json({ error: error.message });
  }
};

const getTrainerLessons = async (req, res) => {
  try {
    const lessons = await Lesson.findAll({
      where: { trainerId: req.user.id },
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] },
      ],
      order: [['orderIndex', 'ASC']],
    });
    return res.json({ success: true, lessons });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const attachQuiz = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { quizId, isMandatory } = req.body;
    if (!quizId) return res.status(422).json({ error: 'quizId is required' });
    const lessonQuiz = await LessonQuiz.create({ lessonId, quizId, isMandatory: isMandatory ?? false });
    return res.json({ success: true, lessonQuiz });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const createAssessment = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { title, instructions, maxScore, isMandatory } = req.body;
    if (!title || !maxScore) return res.status(422).json({ error: 'title and maxScore are required' });
    const assessment = await LessonAssessment.create({ lessonId, title, instructions, maxScore, isMandatory: isMandatory ?? false });
    return res.json({ success: true, assessment });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getLessonDashboard = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await Lesson.findByPk(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const ids = await assignedParticipantIds(lesson.trainingId);
    const participantCount = ids.length;

    const quizzes = await LessonQuiz.findAll({ where: { lessonId } });
    const assessments = await LessonAssessment.findAll({ where: { lessonId } });

    const quizData = await Promise.all(quizzes.map(async q => {
      const stats = await quizStats(q);
      return { id: q.id, quizId: q.quizId, isMandatory: q.isMandatory, ...stats };
    }));

    const assessmentData = await Promise.all(assessments.map(async a => {
      const submissions = await AssessmentSubmission.findAll({ where: { assessmentId: a.id } });
      const completed = submissions.filter(s => s.status === 'SUBMITTED' || s.status === 'GRADED').length;
      return {
        id: a.id,
        title: a.title,
        maxScore: Number(a.maxScore),
        isMandatory: a.isMandatory,
        total: participantCount,
        completed,
        pending: participantCount - completed,
      };
    }));

    return res.json({
      success: true,
      lesson: { id: lesson.id, title: lesson.title },
      participantCount,
      quizzes: quizData,
      assessments: assessmentData,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const publishQuizResults = async (req, res) => {
  try {
    const { lessonQuizId } = req.params;
    const lessonQuiz = await LessonQuiz.findByPk(lessonQuizId, { include: [{ model: AIQuiz, as: 'quiz' }] });
    if (!lessonQuiz) return res.status(404).json({ error: 'Lesson quiz not found' });
    const quiz = lessonQuiz.quiz;
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    const lesson = await Lesson.findByPk(lessonQuiz.lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const ids = await assignedParticipantIds(lesson.trainingId);

    try {
      const io = req.app?.get('io');
      if (io) {
        ids.forEach(pid => {
          io.to(`user_${pid}`).emit('results:published', {
            lessonQuizId,
            quizId: quiz.id,
            quizTitle: quiz.title,
          });
        });
      }
    } catch (_) {}

    return res.json({ success: true, message: `Results published for ${ids.length} participants` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getAssessmentSubmissions = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const submissions = await AssessmentSubmission.findAll({
      where: { assessmentId },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      order: [['submittedAt', 'DESC']],
    });
    return res.json({ success: true, submissions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const gradeAssessment = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const submission = await AssessmentSubmission.findByPk(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    submission.score = score;
    submission.feedback = feedback || '';
    submission.gradedBy = req.user.id;
    submission.status = 'GRADED';
    submission.gradedAt = new Date();
    await submission.save();
    return res.json({ success: true, submission });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const publishAssessment = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const submission = await AssessmentSubmission.findByPk(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== 'GRADED') return res.status(422).json({ error: 'Submission must be graded before publishing' });
    submission.resultPublished = true;
    await submission.save();
    return res.json({ success: true, submission });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getParticipantLessons = async (req, res) => {
  try {
    const enrollments = await Enrollment.findAll({
      where: { participantId: req.user.id, status: 'ENROLLED' },
    });
    const trainingIds = [...new Set(enrollments.map(e => e.trainingId).filter(Boolean))];
    const courseIds = [...new Set(enrollments.map(e => e.courseId).filter(Boolean))];

    const lessons = await Lesson.findAll({
      where: {
        [require('sequelize').Op.or]: [
          { trainingId: trainingIds },
          { courseId: courseIds },
        ],
      },
      include: [
        { model: Training, as: 'training', attributes: ['id', 'title'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] },
      ],
      order: [['orderIndex', 'ASC']],
    });
    return res.json({ success: true, lessons });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const viewContent = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await Lesson.findByPk(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const [progress] = await LessonProgress.findOrCreate({
      where: { lessonId, participantId: req.user.id },
      defaults: { lessonId, participantId: req.user.id, status: 'IN_PROGRESS', trainingId: lesson.trainingId }
    });
    if (progress.status === 'PENDING' || progress.status === 'NOT_STARTED') {
      progress.status = 'IN_PROGRESS';
      await progress.save();
    }
    return res.json({ success: true, lesson, progress });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const completeQuiz = async (req, res) => {
  try {
    const { lessonQuizId } = req.params;
    const lessonQuiz = await LessonQuiz.findByPk(lessonQuizId);
    if (!lessonQuiz) return res.status(404).json({ error: 'Lesson quiz not found' });
    const [progress] = await QuizProgress.findOrCreate({
      where: { lessonQuizId, participantId: req.user.id },
      defaults: { lessonQuizId, participantId: req.user.id, status: 'COMPLETED' }
    });
    if (progress.status !== 'COMPLETED') {
      progress.status = 'COMPLETED';
      progress.completedAt = new Date();
      await progress.save();
    }
    return res.json({ success: true, progress });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const submitAssessment = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { content } = req.body;
    const assessment = await LessonAssessment.findByPk(assessmentId);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const submission = await AssessmentSubmission.create({
      assessmentId,
      participantId: req.user.id,
      content: content || '',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    return res.json({ success: true, submission });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getQuizResult = async (req, res) => {
  try {
    const { lessonQuizId } = req.params;
    const progress = await QuizProgress.findOne({
      where: { lessonQuizId, participantId: req.user.id },
    });
    if (!progress) return res.status(404).json({ error: 'No progress found' });
    return res.json({ success: true, progress });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getAssessmentResult = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const submission = await AssessmentSubmission.findOne({
      where: { assessmentId, participantId: req.user.id },
    });
    if (!submission) return res.status(404).json({ error: 'No submission found' });
    return res.json({ success: true, submission });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createLesson,
  getTrainerLessons,
  attachQuiz,
  createAssessment,
  getLessonDashboard,
  publishQuizResults,
  getAssessmentSubmissions,
  gradeAssessment,
  publishAssessment,
  getParticipantLessons,
  viewContent,
  completeQuiz,
  submitAssessment,
  getQuizResult,
  getAssessmentResult,
};
