const router = require('express').Router();
const auth = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const interviewController = require('../controllers/interviewController');

// === Interview CRUD ===
router.post('/', auth, roleMiddleware('ADMIN'), interviewController.create);
router.get('/', auth, interviewController.list);
router.get('/dashboard', auth, interviewController.dashboardStats);
router.get('/users/trainers', auth, interviewController.listTrainers);
router.get('/users/participants', auth, interviewController.listParticipants);

// === Participant & Trainer lists ===
router.get('/participant/my', auth, roleMiddleware('PARTICIPANT'), interviewController.myInterviews);
router.get('/trainer/my', auth, roleMiddleware('TRAINER'), interviewController.trainerInterviews);

// === Single interview operations ===
router.get('/:id', auth, interviewController.getOne);
router.put('/:id', auth, roleMiddleware('ADMIN'), interviewController.update);
router.put('/:id/cancel', auth, roleMiddleware('ADMIN'), interviewController.cancel);
router.put('/:id/start', auth, roleMiddleware('TRAINER', 'ADMIN'), interviewController.start);
router.put('/:id/end', auth, roleMiddleware('TRAINER', 'ADMIN'), interviewController.end);

// === Room join/leave ===
router.post('/:id/join', auth, interviewController.join);
router.post('/:id/leave', auth, interviewController.leave);

// === Participant & Trainer assignment ===
router.post('/:id/participants', auth, roleMiddleware('ADMIN'), interviewController.assignParticipants);
router.post('/:id/trainers', auth, roleMiddleware('ADMIN'), interviewController.assignTrainers);

// === Password verification ===
router.post('/:id/verify-password', auth, interviewController.verifyPassword);

// === QR Verification ===
router.post('/:id/qr/generate', auth, interviewController.generateQR);
router.post('/:id/qr/verify', auth, interviewController.verifyQR);

// === Mobile Camera ===
router.post('/:id/mobile/connect', auth, interviewController.connectMobile);

// === Evaluation ===
router.post('/:id/evaluation', auth, roleMiddleware('TRAINER'), interviewController.submitEvaluation);
router.get('/:id/evaluations', auth, interviewController.getEvaluations);

// === Results ===
router.post('/:id/publish-results', auth, roleMiddleware('ADMIN'), interviewController.publishResults);
router.get('/:id/report', auth, interviewController.getReport);

// === Activity & Notifications ===
router.get('/:id/activity', auth, interviewController.getActivityLog);
router.get('/:id/notifications', auth, interviewController.getNotifications);

module.exports = router;
