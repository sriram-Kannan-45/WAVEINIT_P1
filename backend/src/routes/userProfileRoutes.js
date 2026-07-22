const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { profileUpload, bannerUpload, resumeUpload, certificateUpload } = require('../middleware/profileUpload');
const ctrl = require('../controllers/userProfileController');

router.get('/', authenticateToken, ctrl.getMyProfile);
router.get('/:id', authenticateToken, ctrl.getProfileById);
router.put('/', authenticateToken, ctrl.updateProfile);

router.post('/banner', authenticateToken, bannerUpload.single('banner'), ctrl.uploadBanner);
router.delete('/banner', authenticateToken, ctrl.deleteBanner);
router.post('/avatar', authenticateToken, profileUpload.single('avatar'), ctrl.uploadAvatar);
router.post('/resume', authenticateToken, resumeUpload.single('resume'), ctrl.uploadResume);
router.delete('/resume', authenticateToken, ctrl.deleteResume);
router.delete('/avatar', authenticateToken, ctrl.deleteAvatar);

router.post('/skills', authenticateToken, ctrl.addSkill);
router.delete('/skills/:id', authenticateToken, ctrl.deleteSkill);

router.post('/experience', authenticateToken, ctrl.addExperience);
router.put('/experience/:id', authenticateToken, ctrl.updateExperience);
router.delete('/experience/:id', authenticateToken, ctrl.deleteExperience);

router.post('/education', authenticateToken, ctrl.addEducation);
router.put('/education/:id', authenticateToken, ctrl.updateEducation);
router.delete('/education/:id', authenticateToken, ctrl.deleteEducation);

router.post('/certificates', authenticateToken, certificateUpload.single('certificate'), ctrl.addCertificate);
router.put('/certificates/:id', authenticateToken, certificateUpload.single('certificate'), ctrl.updateCertificate);
router.delete('/certificates/:id', authenticateToken, ctrl.deleteCertificate);

router.post('/projects', authenticateToken, ctrl.addProject);
router.put('/projects/:id', authenticateToken, ctrl.updateProject);
router.delete('/projects/:id', authenticateToken, ctrl.deleteProject);

router.put('/contact-links', authenticateToken, ctrl.updateContactLinks);
router.delete('/contact-links', authenticateToken, ctrl.deleteContactLinks);

module.exports = router;
