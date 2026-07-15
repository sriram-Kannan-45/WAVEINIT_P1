const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Training, User, Enrollment, Feedback, TrainerProfile } = require('../models');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const upload = require('../middleware/upload');
const { uploadAIQuizMaterial } = require('../middleware/uploadAIQuizMaterial');
const { generateAIQuiz } = require('../controllers/aiQuizGenerationController');

const router = express.Router();

// GET /api/trainer/trainings - trainer sees their assigned trainings
router.get(
  '/trainings',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const trainerId = req.user.id;
      const { TrainingTrainerAssignment, Course, CourseTrainerAssignment } = require('../models');
      const { Op } = require('sequelize');

      // 1. Get training IDs from TrainingTrainerAssignment
      const assignments = await TrainingTrainerAssignment.findAll({
        where: { trainerId },
        attributes: ['trainingId']
      });
      const assignedTrainingIds = assignments.map(a => a.trainingId);

      // 2. Get training IDs from CourseTrainerAssignment
      const courseAssignments = await CourseTrainerAssignment.findAll({
        where: { trainerId },
        attributes: ['courseId']
      });
      const assignedCourseIds = courseAssignments.map(a => a.courseId);

      const courses = await Course.findAll({
        where: {
          [Op.or]: [
            { trainerId },
            { id: { [Op.in]: assignedCourseIds } }
          ]
        },
        attributes: ['trainingProgramId']
      });
      const courseTrainingIds = courses.map(c => c.trainingProgramId);

      // Combine all assigned training IDs
      const allTrainingIds = Array.from(new Set([...assignedTrainingIds, ...courseTrainingIds]));

      const trainings = await Training.findAll({
        where: {
          [Op.or]: [
            { trainerId },
            { id: { [Op.in]: allTrainingIds } }
          ]
        },
        order: [['startDate', 'ASC']]
      });

      const formattedTrainings = await Promise.all(trainings.map(async t => {
        const enrolledCount = await Enrollment.count({ where: { trainingId: t.id, status: 'ENROLLED' } });
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          startDate: t.startDate,
          endDate: t.endDate,
          capacity: t.capacity,
          enrolledCount,
          availableSeats: t.capacity ? (t.capacity - enrolledCount) : null,
          sequentialLearning: t.sequentialLearning || false
        };
      }));

      res.json({ trainings: formattedTrainings });
    } catch (error) {
      console.error('Trainer get trainings error:', error.message);
      res.status(500).json({ error: 'Server error fetching trainings' });
    }
  }
);

// GET /api/trainer/enrollment-requests - trainer views requests for their trainings/courses
router.get(
  '/enrollment-requests',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const trainerId = req.user.id;
      const { TrainingTrainerAssignment, Course, CourseTrainerAssignment } = require('../models');
      const { Op } = require('sequelize');

      // Resolve Course IDs
      const courseAssignments = await CourseTrainerAssignment.findAll({
        where: { trainerId },
        attributes: ['courseId']
      });
      const assignedCourseIds = courseAssignments.map(a => a.courseId);

      const courses = await Course.findAll({
        where: {
          [Op.or]: [
            { trainerId },
            { id: { [Op.in]: assignedCourseIds } }
          ]
        },
        attributes: ['id', 'trainingProgramId']
      });
      const courseIds = courses.map(c => c.id);
      const courseTrainingIds = courses.map(c => c.trainingProgramId);

      // Resolve Training IDs
      const assignments = await TrainingTrainerAssignment.findAll({
        where: { trainerId },
        attributes: ['trainingId']
      });
      const assignedTrainingIds = assignments.map(a => a.trainingId);

      const allTrainingIds = Array.from(new Set([...assignedTrainingIds, ...courseTrainingIds]));

      const trainings = await Training.findAll({
        where: {
          [Op.or]: [
            { trainerId },
            { id: { [Op.in]: allTrainingIds } }
          ]
        },
        attributes: ['id']
      });
      const trainingIds = trainings.map(t => t.id);

      const pendingEnrollments = await Enrollment.findAll({
        where: {
          status: 'PENDING',
          [Op.or]: [
            { trainingId: { [Op.in]: trainingIds } },
            { courseId: { [Op.in]: courseIds } }
          ]
        },
        include: [
          { model: User, as: 'participant', attributes: ['id', 'name', 'email', 'phone'] },
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ]
      });

      res.json({ success: true, pendingRequests: pendingEnrollments });
    } catch (error) {
      console.error('Trainer pending requests error:', error.message);
      res.status(500).json({ error: 'Server error fetching pending requests' });
    }
  }
);

// POST /api/trainer/enrollment-requests/:id/approve
router.post(
  '/enrollment-requests/:id/approve',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const enrollment = await Enrollment.findByPk(id, {
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ]
      });
      if (!enrollment) return res.status(404).json({ error: 'Enrollment request not found' });
      if (enrollment.status !== 'PENDING') {
        return res.status(400).json({ error: 'Enrollment request is not pending' });
      }

      enrollment.status = 'ENROLLED';
      await enrollment.save();

      const io = req.app.get('io');
      const NotificationService = require('../services/notificationService');
      const title = enrollment.course?.title || enrollment.training?.title || 'Training';

      await NotificationService.createNotification({
        userId: enrollment.participantId,
        message: `Your enrollment request for "${title}" has been approved!`,
        type: 'APPROVAL',
        actionUrl: `/participant`,
        relatedEntityId: enrollment.id,
        relatedEntityType: 'Enrollment'
      }, io);

      res.json({ success: true, message: 'Enrollment request approved' });
    } catch (error) {
      console.error('Approve request error:', error.message);
      res.status(500).json({ error: 'Server error approving request' });
    }
  }
);

// POST /api/trainer/enrollment-requests/:id/reject
router.post(
  '/enrollment-requests/:id/reject',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const enrollment = await Enrollment.findByPk(id, {
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ]
      });
      if (!enrollment) return res.status(404).json({ error: 'Enrollment request not found' });
      if (enrollment.status !== 'PENDING') {
        return res.status(400).json({ error: 'Enrollment request is not pending' });
      }

      enrollment.status = 'CANCELLED';
      await enrollment.save();

      const io = req.app.get('io');
      const NotificationService = require('../services/notificationService');
      const title = enrollment.course?.title || enrollment.training?.title || 'Training';

      await NotificationService.createNotification({
        userId: enrollment.participantId,
        message: `Your enrollment request for "${title}" has been rejected.`,
        type: 'APPROVAL',
        actionUrl: `/participant`,
        relatedEntityId: enrollment.id,
        relatedEntityType: 'Enrollment'
      }, io);

      res.json({ success: true, message: 'Enrollment request rejected' });
    } catch (error) {
      console.error('Reject request error:', error.message);
      res.status(500).json({ error: 'Server error rejecting request' });
    }
  }
);

// GET /api/trainer/feedbacks - trainer sees feedback for their trainings
router.get(
  '/feedbacks',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const trainerId = req.user.id;
      const { TrainingTrainerAssignment, Course, CourseTrainerAssignment } = require('../models');
      const { Op } = require('sequelize');

      // Resolve Course assignments to find training program IDs
      const courseAssignments = await CourseTrainerAssignment.findAll({
        where: { trainerId },
        attributes: ['courseId']
      });
      const assignedCourseIds = courseAssignments.map(a => a.courseId);

      const courses = await Course.findAll({
        where: {
          [Op.or]: [
            { trainerId },
            { id: { [Op.in]: assignedCourseIds } }
          ]
        },
        attributes: ['trainingProgramId']
      });
      const courseTrainingIds = courses.map(c => c.trainingProgramId);

      // Resolve Training assignments
      const assignments = await TrainingTrainerAssignment.findAll({
        where: { trainerId },
        attributes: ['trainingId']
      });
      const assignedTrainingIds = assignments.map(a => a.trainingId);

      const allTrainingIds = Array.from(new Set([...assignedTrainingIds, ...courseTrainingIds]));

      const trainings = await Training.findAll({
        where: {
          [Op.or]: [
            { trainerId },
            { id: { [Op.in]: allTrainingIds } }
          ]
        },
        attributes: ['id']
      });
      const trainingIds = trainings.map(t => t.id);

      if (trainingIds.length === 0) {
        return res.json({ feedbacks: [], averageRating: 0 });
      }

      const feedbacks = await Feedback.findAll({
        where: { trainingId: trainingIds },
        include: [
          { model: Training, as: 'training', attributes: ['id', 'title'] },
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] }
        ],
        order: [['submitted_at', 'DESC']]
      });

      const formattedFeedbacks = feedbacks.map(f => ({
        id: f.id,
        trainingId: f.trainingId,
        trainingTitle: f.training?.title,
        trainerRating: f.trainerRating,
        subjectRating: f.subjectRating,
        comments: f.comments,
        anonymous: f.anonymous,
        participantName: f.anonymous ? 'Anonymous' : f.participant?.name,
        submittedAt: f.submitted_at || f.createdAt
      }));

      const avgTrainerRating = feedbacks.length > 0
        ? (feedbacks.reduce((s, f) => s + f.trainerRating, 0) / feedbacks.length).toFixed(1)
        : 0;
      const avgSubjectRating = feedbacks.length > 0
        ? (feedbacks.reduce((s, f) => s + f.subjectRating, 0) / feedbacks.length).toFixed(1)
        : 0;

      res.json({
        feedbacks: formattedFeedbacks,
        averageTrainerRating: avgTrainerRating,
        averageSubjectRating: avgSubjectRating,
        averageRating: avgTrainerRating
      });
    } catch (error) {
      console.error('Trainer get feedbacks error:', error.message);
      res.status(500).json({ error: 'Server error fetching feedbacks' });
    }
  }
);

// GET /api/trainer/profile - fetch own full profile (user + extended profile)
router.get(
  '/profile',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const trainer = await User.findByPk(req.user.id, {
        attributes: ['id', 'name', 'email', 'username', 'phone'],
        include: [{
          model: TrainerProfile,
          as: 'profile',
          attributes: ['id', 'phone', 'dob', 'qualification', 'experience', 'imagePath'],
          required: false
        }]
      });

      if (!trainer) return res.status(404).json({ error: 'Trainer not found' });

      res.json({
        trainer: {
          id: trainer.id,
          name: trainer.name,
          email: trainer.email,
          username: trainer.username,
          phone: trainer.phone,
          profile: trainer.profile ? {
            phone: trainer.profile.phone,
            dob: trainer.profile.dob,
            qualification: trainer.profile.qualification,
            experience: trainer.profile.experience,
            imagePath: trainer.profile.imagePath
          } : null
        }
      });
    } catch (error) {
      console.error('Trainer get profile error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// POST /api/trainer/profile - create or update extended profile with image upload
router.post(
  '/profile',
  authenticateToken,
  roleMiddleware('TRAINER'),
  upload.single('profileImage'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { phone, dob, qualification, experience } = req.body;

      let imagePath = undefined;
      if (req.file) {
        // Store relative path for serving via static files
        imagePath = `/uploads/trainer/${req.file.filename}`;
      }

      const existing = await TrainerProfile.findOne({ where: { userId } });

      if (existing) {
        const updateData = {};
        if (phone !== undefined) updateData.phone = phone;
        if (dob !== undefined) updateData.dob = dob || null;
        if (qualification !== undefined) updateData.qualification = qualification;
        if (experience !== undefined) updateData.experience = experience;
        if (imagePath !== undefined) updateData.imagePath = imagePath;

        await existing.update(updateData);
        res.json({ message: 'Profile updated successfully', profile: existing });
      } else {
        const profile = await TrainerProfile.create({
          userId,
          phone: phone || null,
          dob: dob || null,
          qualification: qualification || null,
          experience: experience || null,
          imagePath: imagePath || null
        });
        res.status(201).json({ message: 'Profile created successfully', profile });
      }
    } catch (error) {
      console.error('Trainer save profile error:', error.message);
      res.status(500).json({ error: 'Server error saving profile' });
    }
  }
);

// PUT /api/trainer/profile - update profile (JSON, no image)
router.put(
  '/profile',
  authenticateToken,
  roleMiddleware('TRAINER'),
  upload.single('profileImage'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      console.log('🔍 UPDATE PROFILE - userId:', userId);
      console.log('🔍 UPDATE PROFILE - body:', JSON.stringify(req.body));
      console.log('🔍 UPDATE PROFILE - file:', req.file ? req.file.originalname : 'no file');

      // SAFE FIELD EXTRACTION - Handle undefined/null gracefully
      const name = req.body.name ? String(req.body.name).trim() : '';
      const phone = req.body.phone ? String(req.body.phone).trim() : '';
      const dob = req.body.dob ? String(req.body.dob).trim() : '';
      const qualification = req.body.qualification ? String(req.body.qualification).trim() : '';
      const experience = req.body.experience ? String(req.body.experience).trim() : '';

      console.log('🔍 Extracted fields - name:', name, 'phone:', phone, 'dob:', dob);

      // Update user base info (User table)
      const trainer = await User.findByPk(userId);
      if (!trainer) {
        console.log('❌ Trainer not found for userId:', userId);
        return res.status(404).json({ error: 'Trainer not found' });
      }

      // Build update object for User table
      const userUpdateData = {};
      if (name) userUpdateData.name = name;
      if (phone) userUpdateData.phone = phone;

      if (Object.keys(userUpdateData).length > 0) {
        await trainer.update(userUpdateData);
        console.log('✅ User table updated');
      }

      // Handle image path
      let imagePath = null;
      if (req.file) {
        imagePath = `/uploads/trainer/${req.file.filename}`;
        console.log('✅ Image uploaded:', imagePath);
      }

      // Build update data for TrainerProfile table
      const profileUpdateData = {};
      if (phone) profileUpdateData.phone = phone;
      if (dob) profileUpdateData.dob = dob;
      if (qualification) profileUpdateData.qualification = qualification;
      if (experience) profileUpdateData.experience = experience;
      if (imagePath) profileUpdateData.imagePath = imagePath;

      console.log('🔍 Profile update data:', profileUpdateData);

      // Check if profile exists
      let profile = await TrainerProfile.findOne({ where: { userId } });
      
      let savedProfile;
      if (profile) {
        // Update existing profile
        await profile.update(profileUpdateData);
        savedProfile = profile;
        console.log('✅ Existing profile updated');
      } else {
        // Create new profile
        savedProfile = await TrainerProfile.create({
          userId,
          ...profileUpdateData
        });
        console.log('✅ New profile created');
      }

      // Return success response
      res.json({
        message: 'Profile updated successfully',
        trainer: { 
          id: trainer.id, 
          name: trainer.name, 
          email: trainer.email, 
          phone: trainer.phone 
        },
        profile: {
          id: savedProfile.id,
          phone: savedProfile.phone,
          dob: savedProfile.dob,
          qualification: savedProfile.qualification,
          experience: savedProfile.experience,
          imagePath: savedProfile.imagePath
        }
      });

    } catch (error) {
      console.error('❌ Trainer update profile ERROR:', error.message, error.stack);
      res.status(500).json({ 
        error: 'Failed to update profile',
        details: error.message 
      });
    }
  }
);

// Also allow POST for profile update (simpler than PUT for JSON)
router.post(
  '/profile',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      console.log('🔍 POST PROFILE UPDATE - userId:', userId);
      console.log('🔍 POST PROFILE UPDATE - body:', JSON.stringify(req.body));

      const { name, phone, dob, qualification, experience } = req.body;

      // Update User table
      const trainer = await User.findByPk(userId);
      if (!trainer) {
        return res.status(404).json({ error: 'Trainer not found' });
      }

      const userUpdate = {};
      if (name) userUpdate.name = name;
      if (phone) userUpdate.phone = phone;
      
      if (Object.keys(userUpdate).length > 0) {
        await trainer.update(userUpdate);
      }

      // Update/Create TrainerProfile
      const profileData = {};
      if (phone) profileData.phone = phone;
      if (dob) profileData.dob = dob;
      if (qualification) profileData.qualification = qualification;
      if (experience) profileData.experience = experience;

      let profile = await TrainerProfile.findOne({ where: { userId } });
      
      if (profile) {
        await profile.update(profileData);
      } else {
        profile = await TrainerProfile.create({ userId, ...profileData });
      }

      console.log('✅ POST Profile updated successfully');

      res.json({
        message: 'Profile updated',
        trainer,
        profile
      });

    } catch (error) {
      console.error('❌ POST Profile update error:', error.message);
      res.status(500).json({ error: 'Server error: ' + error.message });
    }
  }
);
router.get('/notifications', authenticateToken, roleMiddleware('TRAINER'), async (req, res) => {
  try {
    const { Notification } = require('../models');
    const notifications = await Notification.findAll({ where: { userId: req.user.id }, order: [['created_at', 'DESC']] });
    res.json({ notifications });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/trainer/notifications/read
router.put('/notifications/read', authenticateToken, roleMiddleware('TRAINER'), async (req, res) => {
  try {
    const { Notification } = require('../models');
    await Notification.update({ isRead: true }, { where: { userId: req.user.id, isRead: false } });
    res.json({ message: 'Marked as read' });
  } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/trainer/change-password - trainer changes their own password
router.put(
  '/change-password',
  authenticateToken,
  roleMiddleware('TRAINER'),
  async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!oldPassword || !newPassword) {
        return res.status(422).json({ error: 'Old and new password are required' });
      }

      if (newPassword.length < 6) {
        return res.status(422).json({ error: 'Password must be at least 6 characters' });
      }

      const trainer = await User.findByPk(userId);
      if (!trainer) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isValid = await bcrypt.compare(oldPassword, trainer.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await trainer.update({ password: hashedPassword, passwordVersion: 2 });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Trainer change password error:', error.message);
      res.status(500).json({ error: 'Server error changing password' });
    }
  }
);

// ─── PUT /api/trainer/update ─────────────────────────────────────────────────
// Primary profile-update endpoint used by TrainerForm (multipart/form-data)
router.put(
  '/update',
  authenticateToken,
  roleMiddleware('TRAINER'),
  upload.single('profileImage'),
  async (req, res) => {
    try {
      // ── Debug logging ──────────────────────────────────────────────────────
      console.log('📥 [PUT /trainer/update] req.body :', req.body);
      console.log('📥 [PUT /trainer/update] req.file :', req.file ? req.file.filename : 'none');

      const trainerId = req.user?.id;
      if (!trainerId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // ── Safe field extraction ──────────────────────────────────────────────
      const phone         = req.body.phone         ? String(req.body.phone).trim()         : '';
      const rawDob        = req.body.dob           ? String(req.body.dob).trim()           : '';
      const qualification = req.body.qualification ? String(req.body.qualification).trim() : '';
      const experience    = req.body.experience    ? String(req.body.experience).trim()    : '';
      const name          = req.body.name          ? String(req.body.name).trim()          : '';

      // ── Validation ─────────────────────────────────────────────────────────
      const validationErrors = [];

      if (phone && !/^[\d\s\+\-\(\)]{7,15}$/.test(phone)) {
        validationErrors.push('Phone must contain only digits, spaces, +, -, (, )');
      }

      let dob = null;
      if (rawDob) {
        // Normalize to YYYY-MM-DD regardless of what the browser sends
        const parsed = new Date(rawDob);
        if (isNaN(parsed.getTime())) {
          validationErrors.push('Date of birth is not a valid date');
        } else {
          // Format: YYYY-MM-DD
          dob = parsed.toISOString().split('T')[0];
        }
      }

      if (validationErrors.length > 0) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }

      // Require at least one field
      if (!phone && !dob && !qualification && !experience && !name && !req.file) {
        return res.status(400).json({ success: false, message: 'No data provided to update' });
      }

      // ── Update User table (name, phone) ────────────────────────────────────
      const trainer = await User.findByPk(trainerId);
      if (!trainer) {
        return res.status(404).json({ success: false, message: 'Trainer not found' });
      }

      const userUpdate = {};
      if (name)  userUpdate.name  = name;
      if (phone) userUpdate.phone = phone;
      if (Object.keys(userUpdate).length > 0) {
        await trainer.update(userUpdate);
        console.log('✅ User table updated:', userUpdate);
      }

      // ── Build TrainerProfile update payload ────────────────────────────────
      const profileData = {};
      if (phone)         profileData.phone         = phone;
      if (dob)           profileData.dob           = dob;
      if (qualification) profileData.qualification = qualification;
      if (experience)    profileData.experience    = experience;

      // File stored on disk → save URL-accessible path
      if (req.file) {
        profileData.imagePath = `/uploads/trainer/${req.file.filename}`;
        console.log('✅ Image saved:', profileData.imagePath);
      }

      // ── Upsert TrainerProfile ──────────────────────────────────────────────
      let profile = await TrainerProfile.findOne({ where: { userId: trainerId } });
      if (profile) {
        await profile.update(profileData);
        console.log('✅ Existing profile updated');
      } else {
        profile = await TrainerProfile.create({ userId: trainerId, ...profileData });
        console.log('✅ New profile created');
      }

      // ── Reload to return the freshest data ─────────────────────────────────
      await trainer.reload();

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id:       trainer.id,
            name:     trainer.name,
            email:    trainer.email,
            username: trainer.username,
            phone:    trainer.phone
          },
          profile: {
            phone:         profile.phone,
            dob:           profile.dob,
            qualification: profile.qualification,
            experience:    profile.experience,
            imagePath:     profile.imagePath
          }
        }
      });

    } catch (error) {
      console.error('❌ [PUT /trainer/update] ERROR:', error.message);
      console.error(error.stack);
      return res.status(500).json({
        success: false,
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  }
);

// Reports and Certificates
const reportController = require('../controllers/reportController');
const participantCourseController = require('../controllers/participantCourseController');
router.get('/reports', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), reportController.getTrainerReport);
router.post('/certificates/regenerate', authenticateToken, roleMiddleware('TRAINER', 'ADMIN'), participantCourseController.forceRegenerateCertificate);

// POST /api/trainer/generate-ai-quiz
// Multipart request: training_id/trainingId, difficulty, numberOfQuestions, questionType, file or url
router.post(
  '/generate-ai-quiz',
  authenticateToken,
  roleMiddleware('TRAINER'),
  uploadAIQuizMaterial.single('file'),
  generateAIQuiz
);

// POST /api/trainer/quiz/generate-from-prompt
// Request: { trainingId, prompt, questionCount, difficulty }
router.post(
  '/quiz/generate-from-prompt',
  authenticateToken,
  roleMiddleware('TRAINER', 'ADMIN'),
  async (req, res) => {
    try {
      const { prompt, questionCount, difficulty } = req.body;

      // 1. Validation
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(422).json({ error: 'Prompt/Topic cannot be empty.' });
      }

      const count = parseInt(questionCount, 10);
      if (isNaN(count) || count < 1 || count > 50) {
        return res.status(422).json({ error: 'Number of questions must be between 1 and 50.' });
      }

      if (!difficulty || typeof difficulty !== 'string') {
        return res.status(422).json({ error: 'Difficulty is required.' });
      }

      // Convert difficulty to Title Case (Easy, Medium, Hard)
      const diffCoerced = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
      if (!['Easy', 'Medium', 'Hard'].includes(diffCoerced)) {
        return res.status(422).json({ error: 'Difficulty must be Easy, Medium, or Hard.' });
      }

      const aiService = require('../services/aiService');
      console.log(`[trainerRoutes] Requesting prompt-quiz generation from AI for: "${prompt}"`);
      const questions = await aiService.generateQuizFromPrompt(prompt.trim(), count, diffCoerced);

      return res.json({
        success: true,
        questions: questions
      });

    } catch (error) {
      console.error('❌ [POST /trainer/quiz/generate-from-prompt] ERROR:', error.message);
      return res.status(500).json({
        error: error.message || 'Failed to generate quiz from prompt'
      });
    }
  }
);

// GET /api/trainer/quizzes
router.get(
  '/quizzes',
  authenticateToken,
  roleMiddleware('TRAINER', 'ADMIN'),
  async (req, res) => {
    try {
      const { AIQuiz, Course, Training } = require('../models');
      const quizzes = await AIQuiz.findAll({
        where: { trainerId: req.user.id },
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'] },
          { model: Training, as: 'training', attributes: ['id', 'title'] }
        ],
        order: [['created_at', 'DESC']]
      });
      return res.json({ success: true, quizzes });
    } catch (error) {
      console.error('Error fetching trainer quizzes:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
