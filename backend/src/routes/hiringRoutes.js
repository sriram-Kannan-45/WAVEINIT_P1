/**
 * Hiring Routes
 * All routes prefixed with /api/hire
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const hiringController = require('../controllers/hiringController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const proctoringController = require('../controllers/hireProctoringController');

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB CSV
  fileFilter: (req, file, cb) => {
    const ok = !file || /\.csv$/i.test(file.originalname || '') || (file.mimetype || '').includes('csv');
    cb(null, ok);
  },
});

// All hiring routes require authentication
router.use(authenticateToken);

// Admin: assessment CRUD (hiring assessments are admin-managed only)
router.post('/assessments', roleMiddleware('ADMIN'), hiringController.createAssessment);
router.get('/assessments', roleMiddleware('ADMIN'), hiringController.listAssessments);
router.get('/assessments/:id', roleMiddleware('ADMIN'), hiringController.getAssessment);
router.put('/assessments/:id', roleMiddleware('ADMIN'), hiringController.updateAssessment);
router.delete('/assessments/:id', roleMiddleware('ADMIN'), hiringController.deleteAssessment);
router.post('/assessments/:id/publish', roleMiddleware('ADMIN'), hiringController.publishAssessment);
router.post('/assessments/:id/close', roleMiddleware('ADMIN'), hiringController.closeAssessment);
router.get('/assessments/:id/report', roleMiddleware('ADMIN'), hiringController.getReport);
router.put('/proctoring/policy/:type/:engineId', roleMiddleware('ADMIN'), proctoringController.updatePolicy);

// Admin: candidates / CSV
router.post('/assessments/:id/candidates/upload', roleMiddleware('ADMIN'), csvUpload.single('file'), hiringController.uploadCandidatesCsv);
router.get('/assessments/:id/candidates', roleMiddleware('ADMIN'), hiringController.listCandidates);
router.post('/assessments/:id/candidates/recheck', roleMiddleware('ADMIN'), hiringController.recheckRegistration);
router.get('/assessments/:id/candidates/unregistered/export', roleMiddleware('ADMIN'), hiringController.exportUnregistered);
router.post('/assessments/:id/candidates/assign', roleMiddleware('ADMIN'), hiringController.assignCandidates);
router.post('/assessments/:id/candidates/:cid/toggle-assign', roleMiddleware('ADMIN'), hiringController.toggleAssignCandidate);
router.delete('/assessments/:id/candidates/:cid', roleMiddleware('ADMIN'), hiringController.removeCandidate);

// Participant: hiring assignment discovery only. Attempts are intentionally
// handled by the canonical /api/quizzes and /api/coding engines.
router.get('/my-assessments', roleMiddleware('PARTICIPANT'), hiringController.myAssessments);
router.get('/proctoring/policy/:type/:engineId', roleMiddleware('PARTICIPANT'), proctoringController.getPolicy);
router.post('/proctoring/sessions/:sessionId/challenge', roleMiddleware('PARTICIPANT'), proctoringController.getChallenge);
router.post('/proctoring/sessions/:sessionId/identity/reference', roleMiddleware('PARTICIPANT'), proctoringController.captureIdentity);
router.post('/proctoring/sessions/:sessionId/identity/verify', roleMiddleware('PARTICIPANT'), proctoringController.verifyIdentity);
router.post('/proctoring/sessions/:sessionId/room-scan', roleMiddleware('PARTICIPANT'), proctoringController.inspectRoom);
module.exports = router;
