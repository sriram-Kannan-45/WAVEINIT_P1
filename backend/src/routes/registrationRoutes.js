/**
 * registrationRoutes.js
 * ─────────────────────
 * Routes for the participant registration workflow.
 * Public: POST /apply (no auth)
 * Admin:  GET, PATCH, POST for review/approve/reject/assign/send
 * Trainer: GET for pending credentials
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const registrationController = require('../controllers/registrationController');

const router = express.Router();

// ─── File Upload Config ───────────────────────────────────────────────────

const regUploadDir = path.join(process.cwd(), 'uploads', 'registrations');
if (!fs.existsSync(regUploadDir)) fs.mkdirSync(regUploadDir, { recursive: true });

const regStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, regUploadDir),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'upload').replace(/[^a-zA-Z0-9.\-_]/g, '').slice(-60);
    cb(null, `${Date.now()}-${safe}`);
  },
});

const regUpload = multer({
  storage: regStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'resume') {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.pdf', '.doc', '.docx'].includes(ext)) return cb(null, true);
      cb(new Error('Resume must be PDF, DOC, or DOCX.'));
    } else if (file.fieldname === 'profilePhoto') {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return cb(null, true);
      cb(new Error('Profile photo must be JPG, PNG, or WebP.'));
    } else {
      cb(null, true);
    }
  },
});

const regFields = [
  { name: 'resume', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 },
];

// ─── Public Routes ────────────────────────────────────────────────────────

router.post('/apply', (req, res) => {
  regUpload.fields(regFields)(req, res, (err) => {
    if (err) {
      const msg = err.message || 'File upload failed.';
      const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
      return res.status(code).json({ error: msg });
    }
    registrationController.submitApplication(req, res);
  });
});

// ─── Admin Routes ─────────────────────────────────────────────────────────

router.get('/applications', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.getApplications(req, res)
);

router.get('/applications/stats', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.getApplicationStats(req, res)
);

router.get('/applications/export', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.exportApplications(req, res)
);

router.get('/trainers', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.getAvailableTrainers(req, res)
);

router.patch('/applications/:id/approve', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.approveApplication(req, res)
);

router.patch('/applications/:id/reject', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.rejectApplication(req, res)
);

router.patch('/applications/:id/assign-trainer', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.assignTrainer(req, res)
);

router.post('/applications/:id/send-credentials', authenticateToken, roleMiddleware('ADMIN'), (req, res) =>
  registrationController.sendCredentials(req, res)
);

// ─── Trainer Routes ───────────────────────────────────────────────────────

router.get('/credentials', authenticateToken, roleMiddleware('TRAINER'), (req, res) =>
  registrationController.getTrainerCredentials(req, res)
);

router.post('/credentials/:id/send', authenticateToken, roleMiddleware('TRAINER'), (req, res) =>
  registrationController.sendCredentials(req, res)
);

module.exports = router;
