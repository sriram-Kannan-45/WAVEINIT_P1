const express = require('express');
const profileController = require('../controllers/profileController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const upload = require('../middleware/upload');

const router = express.Router();

// Trainer profile — mounted at /api/profile in app.js
router.post('/trainer/profile', authenticateToken, roleMiddleware('TRAINER'), upload.single('profileImage'), profileController.createOrUpdateProfile);
router.put('/trainer/profile', authenticateToken, roleMiddleware('TRAINER'), upload.single('profileImage'), profileController.createOrUpdateProfile);
router.get('/trainer/profile', authenticateToken, roleMiddleware('TRAINER'), profileController.getProfile);

// Public profile (anyone authenticated)
router.get('/public/:userId', authenticateToken, profileController.getPublicProfile);

// Experience
router.post('/trainer/experience', authenticateToken, roleMiddleware('TRAINER'), profileController.addExperience);
router.put('/trainer/experience/:id', authenticateToken, roleMiddleware('TRAINER'), profileController.updateExperience);
router.delete('/trainer/experience/:id', authenticateToken, roleMiddleware('TRAINER'), profileController.deleteExperience);

// Education
router.post('/trainer/education', authenticateToken, roleMiddleware('TRAINER'), profileController.addEducation);
router.put('/trainer/education/:id', authenticateToken, roleMiddleware('TRAINER'), profileController.updateEducation);
router.delete('/trainer/education/:id', authenticateToken, roleMiddleware('TRAINER'), profileController.deleteEducation);

module.exports = router;
