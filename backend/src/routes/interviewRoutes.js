/**
 * Interview Routes
 * All routes prefixed with /api/interviews
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const authenticateToken = require('../middleware/auth');
const roleMiddleware = require('../middleware/roles');
const { Interview, InterviewSession, InterviewDevice } = require('../models');
const tokenService = require('../services/interviewTokenService');
const logger = require('../utils/logger');

// Multer for interview recording chunks (kept in memory, written by service).
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per chunk
});

// Public endpoint: mobile device validates a pairing token and receives a
// short-lived socket token (no auth required).
router.post('/pair-validate', interviewController.validatePairing);

// Public endpoint: mobile device pairs using token (no auth required)
router.post('/pair-by-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    // Find device by pairing token
    const device = await InterviewDevice.findOne({
      where: { pairing_token: token, token_status: 'PENDING' },
    });
    if (!device) {
      return res.status(404).json({ error: 'Invalid or expired pairing token' });
    }

    // Check expiry
    if (device.token_expires_at && new Date(device.token_expires_at) < new Date()) {
      await device.update({ token_status: 'EXPIRED' });
      return res.status(410).json({ error: 'Pairing token has expired' });
    }

    // Find the active session
    const session = await InterviewSession.findByPk(device.session_id);
    if (!session || session.status === 'ENDED') {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    // Find the interview to get candidate_id
    const interview = await Interview.findByPk(session.interview_id);
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Consume the token
    const result = await tokenService.consumePairingToken(token, interview.candidate_id);
    if (!result.success) {
      return res.status(result.status || 400).json({ error: result.message });
    }

    await result.device.update({
      status: 'CONNECTED',
      connected_at: new Date(),
    });

    res.json({
      success: true,
      message: 'Mobile device paired successfully',
    });
  } catch (error) {
    logger.error('Error pairing by token', { error: error.message });
    res.status(500).json({ error: 'Failed to pair device' });
  }
});

// All interview routes below require authentication
router.use(authenticateToken);

// Lookup data for scheduling (MUST be before /:id to avoid param capture)
router.get('/candidates', roleMiddleware('ADMIN', 'TRAINER'), interviewController.getCandidates);
router.get('/interviewers', roleMiddleware('ADMIN', 'TRAINER'), interviewController.getInterviewers);
router.get('/stats', interviewController.getInterviewStats);

// CRUD
router.post('/create', roleMiddleware('ADMIN', 'TRAINER'), interviewController.createInterview);
router.get('/', interviewController.listInterviews);
router.get('/:id', interviewController.getInterview);

// Update & Delete
router.put('/:id', roleMiddleware('ADMIN', 'TRAINER'), interviewController.updateInterview);
router.patch('/:id/status', roleMiddleware('ADMIN', 'TRAINER'), interviewController.updateInterviewStatus);
router.delete('/:id', roleMiddleware('ADMIN'), interviewController.deleteInterview);

// Session lifecycle
router.post('/:id/join', interviewController.joinInterview);
router.post('/:id/consent', interviewController.recordConsent);
router.post('/:id/pair-mobile', interviewController.pairMobile);
router.post('/:id/refresh-qr', interviewController.refreshQr);
router.post('/:id/start', roleMiddleware('ADMIN', 'TRAINER'), interviewController.startInterview);
router.post('/:id/end', roleMiddleware('ADMIN', 'TRAINER'), interviewController.endInterview);

// Feedback & Results
router.post('/:id/feedback', roleMiddleware('ADMIN', 'TRAINER'), interviewController.submitFeedback);
router.get('/:id/feedback', interviewController.getFeedback);
router.post('/:id/result', roleMiddleware('ADMIN', 'TRAINER'), interviewController.submitResult);
router.post('/:id/publish-result', roleMiddleware('ADMIN', 'TRAINER'), interviewController.publishResult);

// Status & Recordings
router.get('/:id/status', interviewController.getInterviewStatus);
router.get('/:id/recordings', interviewController.getRecordings);

// Notes (shared, live interview scratchpad)
router.get('/:id/notes', interviewController.getNotes);
router.post('/:id/notes', interviewController.createNote);

// AI Monitoring alerts
router.post('/:id/alerts', interviewController.logAlert);

// Recording chunk upload + finalize (MediaRecorder → chunks → merged webm)
router.post(
  '/upload-chunk',
  roleMiddleware('TRAINER', 'ADMIN'),
  chunkUpload.single('chunk'),
  interviewController.uploadChunk
);
router.post(
  '/finalize-recording',
  roleMiddleware('TRAINER', 'ADMIN'),
  interviewController.finalizeRecording
);

module.exports = router;
