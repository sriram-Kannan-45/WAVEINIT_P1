const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authController = require('../controllers/authController');
const trainingController = require('../controllers/trainingController');
const adminController = require('../controllers/adminController');
const adminBulkImportController = require('../controllers/adminBulkImportController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const { User, TrainerProfile } = require('../models');

const router = express.Router();

// POST /api/admin/create-trainer
router.post(
  '/create-trainer',
  authenticateToken,
  roleMiddleware('ADMIN'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required')
  ],
  (req, res) => authController.createTrainer(req, res)
);

// GET /api/admin/trainers - list all trainers with profile summary
router.get(
  '/trainers',
  authenticateToken,
  roleMiddleware('ADMIN'),
  async (req, res) => {
    try {
      const trainers = await User.findAll({
        where: { role: 'TRAINER', isDeleted: false },
        attributes: ['id', 'name', 'email', 'username'],
        include: [{
          model: TrainerProfile,
          as: 'profile',
          attributes: ['phone', 'dob', 'qualification', 'experience', 'imagePath'],
          required: false
        }]
      });
      res.json({ trainers: trainers.map(t => ({
        id: t.id, name: t.name, email: t.email, username: t.username,
        profile: t.profile || null
      })) });
    } catch (error) {
      console.error('Get trainers error:', error.message);
      res.status(500).json({ error: 'Server error fetching trainers' });
    }
  }
);

// GET /api/admin/trainer/:id - get single trainer with full profile
router.get(
  '/trainer/:id',
  authenticateToken,
  roleMiddleware('ADMIN'),
  async (req, res) => {
    try {
      const trainer = await User.findOne({
        where: { id: req.params.id, role: 'TRAINER', isDeleted: false },
        attributes: ['id', 'name', 'email', 'username', 'phone'],
        include: [{
          model: TrainerProfile,
          as: 'profile',
          attributes: ['phone', 'dob', 'qualification', 'experience', 'imagePath'],
          required: false
        }]
      });
      if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
      res.json({
        trainer: {
          id: trainer.id, name: trainer.name, email: trainer.email,
          username: trainer.username, phone: trainer.phone,
          profile: trainer.profile || null
        }
      });
    } catch (error) {
      console.error('Get trainer error:', error.message);
      res.status(500).json({ error: 'Server error fetching trainer' });
    }
  }
);

// PUT /api/admin/trainers/:id
router.put(
  '/trainers/:id',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.updateTrainer(req, res)
);

// DELETE /api/admin/trainers/:id
router.delete(
  '/trainers/:id',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.deleteTrainer(req, res)
);

// GET /api/admin/trainings
router.get(
  '/trainings',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => trainingController.getAllTrainings(req, res)
);

// POST /api/admin/trainings
router.post(
  '/trainings',
  authenticateToken,
  roleMiddleware('ADMIN'),
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('trainerId').notEmpty().withMessage('Trainer ID is required')
  ],
  (req, res) => trainingController.createTraining(req, res)
);

// PUT /api/admin/trainings/:id
router.put(
  '/trainings/:id',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.updateTraining(req, res)
);

// DELETE /api/admin/trainings/:id
router.delete(
  '/trainings/:id',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.deleteTraining(req, res)
);

// GET /api/admin/stats
router.get(
  '/stats',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.getStats(req, res)
);

// GET /api/admin/participants
router.get(
  '/participants',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.getParticipants(req, res)
);

// POST /api/admin/send-reminders/:trainingId
router.post(
  '/send-reminders/:trainingId',
  authenticateToken,
  roleMiddleware('ADMIN'),
  (req, res) => adminController.sendReminders(req, res)
);

// DELETE /api/admin/participants/:id
router.delete('/participants/:id', authenticateToken, roleMiddleware('ADMIN'), (req, res) => adminController.deleteParticipant(req, res));
// GET /api/admin/export-feedbacks
router.get('/export-feedbacks', authenticateToken, roleMiddleware('ADMIN'), (req, res) => adminController.exportFeedbacksCSV(req, res));
// GET /api/admin/training-stats
router.get('/training-stats', authenticateToken, roleMiddleware('ADMIN'), (req, res) => adminController.getTrainingStats(req, res));

// GET /api/admin/pending-participants
router.get('/pending-participants', authenticateToken, roleMiddleware('ADMIN'), async (req, res) => {
  try {
    const participants = await User.findAll({
      where: { role: 'PARTICIPANT', status: 'PENDING' },
      attributes: ['id', 'name', 'email', 'phone', 'created_at']
    });
    res.json({ participants });
  } catch (error) {
    console.error('Get pending participants error:', error.message);
    res.status(500).json({ error: 'Server error fetching pending participants' });
  }
});

// POST /api/admin/approve-participant/:id
router.post('/approve-participant/:id', authenticateToken, roleMiddleware('ADMIN'), (req, res) => adminController.approveParticipant(req, res));

// POST /api/admin/reject-participant/:id
router.post('/reject-participant/:id', authenticateToken, roleMiddleware('ADMIN'), (req, res) => adminController.rejectParticipant(req, res));

// GET /api/admin/activity-logs
router.get('/activity-logs', authenticateToken, roleMiddleware('ADMIN'), async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const { limit = 50, offset = 0, action, userId, startDate, endDate } = req.query;
    
    const where = {};
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = new Date(startDate);
      if (endDate) where.created_at[Op.lte] = new Date(endDate);
    }

    const { ActivityLog } = require('../models');
    const logs = await ActivityLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    const total = await ActivityLog.count({ where });
    
    res.json({
      success: true,
      data: {
        logs,
        total,
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('Get activity logs error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/search-participants
router.get('/search-participants', authenticateToken, roleMiddleware('ADMIN'), async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const { q = '', status = '', limit = 20, offset = 0 } = req.query;
    
    const where = { role: 'PARTICIPANT' };
    
    // Search query
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
        { phone: { [Op.like]: `%${q}%` } }
      ];
    }
    
    // Status filter
    if (status) {
      where.status = status;
    }

    const participants = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'phone', 'status', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    const total = await User.count({ where });
    
    res.json({
      success: true,
      data: {
        participants,
        total,
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('Search participants error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// =========================
// ANALYTICS ENDPOINTS
// =========================

const analyticsController = require('../controllers/analyticsController');

// GET /api/admin/analytics - Comprehensive dashboard analytics
router.get('/analytics', authenticateToken, roleMiddleware('ADMIN'), (req, res) => 
  analyticsController.getDashboardAnalytics(req, res)
);

// GET /api/admin/analytics/enrollment-trend - Enrollment trend
router.get('/analytics/enrollment-trend', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getEnrollmentTrend(req, res)
);

// GET /api/admin/analytics/trainer-performance - Trainer performance
router.get('/analytics/trainer-performance', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getTrainerPerformance(req, res)
);

// GET /api/admin/analytics/users - User metrics
router.get('/analytics/users', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getUserMetrics(req, res)
);

// GET /api/admin/analytics/enrollments - Enrollment metrics
router.get('/analytics/enrollments', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getEnrollmentMetrics(req, res)
);

// GET /api/admin/analytics/active-users - Active user count
router.get('/analytics/active-users', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getActiveUsers(req, res)
);

// GET /api/admin/analytics/training-stats - Training statistics
router.get('/analytics/training-stats', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getTrainingStats(req, res)
);

// GET /api/admin/analytics/recent-activities - Recent activities
router.get('/analytics/recent-activities', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  analyticsController.getRecentActivities(req, res)
);

// =========================
// COURSE-CENTRIC ENDPOINTS (Step 2 of the course restructure)
// =========================
//
//   POST   /api/admin/training-programs              create program
//   GET    /api/admin/training-programs              list programs (+ courses count)
//   GET    /api/admin/training-programs/:id          program detail with its courses
//   PUT    /api/admin/training-programs/:id          edit program
//   DELETE /api/admin/training-programs/:id          delete program (cascades courses)
//
//   POST   /api/admin/training-programs/:id/courses  create course under program
//   GET    /api/admin/courses                        list all courses (+ trainer/program/counts)
//   GET    /api/admin/courses/:id                    course detail
//   PUT    /api/admin/courses/:id                    edit course (reassign trainer, status, etc)
//   DELETE /api/admin/courses/:id                    delete course (cascades lessons/quizzes/enrollments)
//
const adminCourseController = require('../controllers/adminCourseController');
const adminAuth = [authenticateToken, roleMiddleware('ADMIN')];

router.post(  '/training-programs',                       adminAuth, [
  body('title').notEmpty().withMessage('Title is required'),
], (req, res) => adminCourseController.createProgram(req, res));

router.get(   '/training-programs',                       adminAuth, (req, res) =>
  adminCourseController.listPrograms(req, res));

router.get(   '/training-programs/:id',                   adminAuth, (req, res) =>
  adminCourseController.getProgram(req, res));

router.put(   '/training-programs/:id',                   adminAuth, (req, res) =>
  adminCourseController.updateProgram(req, res));

router.delete('/training-programs/:id',                   adminAuth, (req, res) =>
  adminCourseController.deleteProgram(req, res));

router.post(  '/training-programs/:id/courses',           adminAuth, [
  body('title').notEmpty().withMessage('Title is required'),
  body('trainerId').notEmpty().withMessage('trainerId is required'),
], (req, res) => adminCourseController.createCourse(req, res));

router.get(   '/courses',                                 adminAuth, (req, res) =>
  adminCourseController.listCourses(req, res));

router.get(   '/courses/:id',                             adminAuth, (req, res) =>
  adminCourseController.getCourse(req, res));

router.put(   '/courses/:id',                             adminAuth, (req, res) =>
  adminCourseController.updateCourse(req, res));

router.delete('/courses/:id',                             adminAuth, (req, res) =>
  adminCourseController.deleteCourse(req, res));

// ── Bulk Participant Import ────────────────────────────────────────────────
const bulkImportDir = path.join(process.cwd(), 'uploads', 'bulk-import');
if (!fs.existsSync(bulkImportDir)) fs.mkdirSync(bulkImportDir, { recursive: true });

const bulkImportUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, bulkImportDir),
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'import').replace(/[^a-zA-Z0-9.\-_]/g, '').slice(-80);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) return cb(null, true);
    cb(new Error('Only .xlsx and .xls files are supported.'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get(  '/participants/bulk-template',  authenticateToken, roleMiddleware('ADMIN'),
  (req, res) => adminBulkImportController.downloadTemplate(req, res));

router.post( '/participants/bulk-validate',  authenticateToken, roleMiddleware('ADMIN'),
  bulkImportUpload.single('file'),
  (req, res) => adminBulkImportController.validateAndPreview(req, res));

router.post( '/participants/bulk-import',    authenticateToken, roleMiddleware('ADMIN'),
  (req, res) => adminBulkImportController.executeImport(req, res));

module.exports = router;
