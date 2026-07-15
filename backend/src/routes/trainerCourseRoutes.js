/**
 * trainerCourseRoutes.js
 * ──────────────────────
 * Route table for the course-centric trainer module. Mounted under /api/trainer
 * alongside the existing trainerRoutes.js (which keeps the legacy
 * training-scoped paths). Path prefixes used here (/courses, /lessons/:lessonId,
 * /assessments, /submissions) do not collide with the existing routes.
 */
const express = require('express');
const c = require('../controllers/trainerCourseController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const { uploadAny } = require('../middleware/uploadMaterial');

const router = express.Router();
router.use(authenticateToken);

// Trainer or admin can hit every course-scoped endpoint; ownership is enforced
// inside each controller.
const trainerOrAdmin = roleMiddleware('TRAINER', 'ADMIN');

// ── Courses ────────────────────────────────────────────────────────────────
router.get(  '/programs',                         trainerOrAdmin, c.listAllPrograms);
router.post( '/courses',                          trainerOrAdmin, c.createCourse);
router.get(  '/courses',                          trainerOrAdmin, c.listMyCourses);
router.get(  '/courses/:courseId',                trainerOrAdmin, c.getCourseDetail);
router.put(  '/courses/:courseId',                trainerOrAdmin, c.updateOwnCourse);

// ── Lessons (NB: /reorder must come before the :lessonId routes so Express
//                doesn't capture 'reorder' as the lesson id) ─────────────
router.put(  '/courses/:courseId/lessons/reorder',           trainerOrAdmin, c.reorderLessons);
router.post( '/courses/:courseId/lessons',                   trainerOrAdmin, c.createLesson);
router.get(  '/courses/:courseId/lessons',                   trainerOrAdmin, c.listLessons);
router.get(  '/courses/:courseId/lessons/:lessonId',         trainerOrAdmin, c.getLesson);
router.put(  '/courses/:courseId/lessons/:lessonId',         trainerOrAdmin, c.updateLesson);
router.delete('/courses/:courseId/lessons/:lessonId',        trainerOrAdmin, c.deleteLesson);

// ── Lesson Materials (uploads on POST) ─────────────────────────────────────
router.put(  '/lessons/:lessonId/materials/reorder',         trainerOrAdmin, c.reorderMaterials);
router.post( '/lessons/:lessonId/materials',                 trainerOrAdmin, uploadAny.single('file'), c.createMaterial);
router.get(  '/lessons/:lessonId/materials',                 trainerOrAdmin, c.listMaterials);
router.put(  '/lessons/:lessonId/materials/:id',             trainerOrAdmin, c.updateMaterial);
router.delete('/lessons/:lessonId/materials/:id',            trainerOrAdmin, c.deleteMaterial);

// ── Quizzes (course-scoped) ────────────────────────────────────────────────
router.post( '/courses/:courseId/quiz/manual',               trainerOrAdmin, c.createManualQuiz);
router.get(  '/courses/:courseId/quizzes',                   trainerOrAdmin, c.listCourseQuizzes);
router.get(  '/courses/:courseId/quizzes/:quizId',           trainerOrAdmin, c.getCourseQuiz);
router.put(  '/courses/:courseId/quizzes/:quizId',           trainerOrAdmin, c.updateCourseQuiz);
router.delete('/courses/:courseId/quizzes/:quizId',          trainerOrAdmin, c.deleteCourseQuiz);
router.post( '/courses/:courseId/quizzes/:quizId/publish',   trainerOrAdmin, c.publishQuizResults);
router.get(  '/courses/:courseId/quizzes/:quizId/dashboard', trainerOrAdmin, c.quizDashboard);

// ── Participants ───────────────────────────────────────────────────────────
router.get(  '/courses/:courseId/participants',              trainerOrAdmin, c.listParticipants);
router.get(  '/courses/:courseId/available-participants',    trainerOrAdmin, c.getAvailableParticipants);
router.post( '/courses/:courseId/participants',              trainerOrAdmin, c.addParticipant);
router.get(  '/courses/:courseId/participants/:userId',      trainerOrAdmin, c.getParticipantDetail);
router.put(  '/courses/:courseId/participants/:userId/approve', trainerOrAdmin, c.approveParticipant);
router.put(  '/courses/:courseId/participants/:userId/reject',  trainerOrAdmin, c.rejectParticipant);

// ── Analytics ──────────────────────────────────────────────────────────────
router.get(  '/courses/:courseId/analytics',                 trainerOrAdmin, c.courseAnalytics);

// ── Assessments ────────────────────────────────────────────────────────────
router.post( '/courses/:courseId/lessons/:lessonId/assessments', trainerOrAdmin, c.createAssessment);
router.get(  '/courses/:courseId/lessons/:lessonId/assessments', trainerOrAdmin, c.listAssessments);
router.put(  '/assessments/:assessmentId',                   trainerOrAdmin, c.updateAssessment);
router.get(  '/assessments/:assessmentId/submissions',       trainerOrAdmin, c.listSubmissions);
router.put(  '/submissions/:submissionId/grade',             trainerOrAdmin, c.gradeSubmission);
router.post( '/submissions/:submissionId/publish',           trainerOrAdmin, c.publishSubmission);

module.exports = router;
