/**
 * participantCourseRoutes.js
 * ──────────────────────────
 * Course-centric participant endpoints. Mounted under /api/participant
 * BEFORE the existing enrollmentRoutes so the more specific paths
 * (e.g. /courses, /lessons/:lessonId, /quizzes, /assessments) match first.
 *
 * The legacy POST /enroll and DELETE /enroll/:trainingId routes in
 * enrollmentRoutes are still available for backward compat — but the new
 * POST /enroll body now expects { courseId } (not trainingId), and the new
 * DELETE /enroll/:courseId is course-scoped. Where path collisions exist,
 * Express picks the first registered handler — so this file's handlers win.
 */
const express = require('express');
const c = require('../controllers/participantCourseController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');

const router = express.Router();
router.use(authenticateToken);

const participant = roleMiddleware('PARTICIPANT');

// ── Enrollment ───────────────────────────────────────────────────────────
router.post(  '/enroll',                          participant, c.enroll);
router.delete('/enroll/:courseId',                participant, c.unenroll);

// ── Courses ──────────────────────────────────────────────────────────────
router.get(   '/courses',                         participant, c.listMyCourses);
router.get(   '/courses/explore',                 participant, c.explore);
router.get(   '/courses/:courseId',               participant, c.getCourseOverview);
router.get(   '/courses/:courseId/lessons',       participant, c.listCourseLessons);
router.get(   '/courses/:courseId/resources',     participant, c.listCourseResources);
router.get(   '/courses/:courseId/quizzes',       participant, c.listCourseQuizzes);
router.get(   '/courses/:courseId/coding-assessments', participant, c.listCourseCodingAssessments);

// ── Lessons ──────────────────────────────────────────────────────────────
router.get(   '/lessons/:lessonId',               participant, c.getLessonDetail);
router.post(  '/lessons/:lessonId/view',          participant, c.markLessonViewed);

// ── Quizzes ──────────────────────────────────────────────────────────────
router.get(   '/quizzes',                         participant, async (req, res) => {
  try {
    const AIQuizService = require('../services/aiQuizService');
    const { availableQuizzes, completedQuizzes } = await AIQuizService.getParticipantQuizzes(req.user.id);
    return res.json({ success: true, quizzes: availableQuizzes, completedQuizzes });
  } catch (error) {
    console.error('Error fetching participant quizzes:', error);
    return res.status(500).json({ error: error.message });
  }
});
router.post(  '/quizzes/:quizId/start',           participant, c.startQuiz);
router.post(  '/quizzes/:quizId/submit',          participant, c.submitQuiz);
router.get(   '/quizzes/:quizId/result',          participant, c.getQuizResult);
router.get(   '/results',                         participant, async (req, res) => {
  try {
    const { QuizResult, AIQuiz, QuizAttempt } = require('../models');
    const results = await QuizResult.findAll({
      where: { participantId: req.user.id },
      include: [
        {
          model: AIQuiz,
          as: 'quiz',
          where: { isResultPublished: true },
          attributes: ['id', 'title', 'courseId', 'lessonId']
        },
        {
          model: QuizAttempt,
          as: 'attempt',
          attributes: ['submittedAt']
        }
      ],
      order: [['id', 'DESC']]
    });
    return res.json({ success: true, results });
  } catch (error) {
    console.error('Error fetching participant results:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ── Assessments ──────────────────────────────────────────────────────────
router.post(  '/assessments/:assessmentId/submit', participant, c.submitAssessment);
router.get(   '/assessments/:assessmentId/result', participant, c.getAssessmentResult);

// ── Certificates ────────────────────────────────────────────────────────────
router.get(   '/certificates',                    participant, c.listMyCertificates);

// ── Tracking ────────────────────────────────────────────────────────────────
router.post(  '/track-activity',                  participant, c.trackActivity);

module.exports = router;
