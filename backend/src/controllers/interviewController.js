/**
 * Interview Controller
 * Handles all REST API operations for the interview module.
 */

const { Op } = require('sequelize');
const {
  Interview, InterviewSession, InterviewDevice, InterviewRecording,
  InterviewLog, InterviewAlert, InterviewFeedback, InterviewResult, User,
  RegistrationApplication, Training, Enrollment,
} = require('../models');
const tokenService = require('../services/interviewTokenService');
const recordingService = require('../services/interviewRecordingService');
const notificationService = require('../services/interviewNotificationService');
const qrGenerator = require('../utils/interviewQrGenerator');
const aiMonitorService = require('../services/interviewAiMonitorService');
const logger = require('../utils/logger');

const INTERVIEW_TYPES = ['TECHNICAL', 'HR', 'MANAGERIAL', 'CUSTOM'];
const MEETING_TYPES = ['ONLINE', 'IN_PERSON', 'HYBRID', 'IN_PLATFORM'];
const ALLOWED_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/**
 * Valid status transitions for the interview lifecycle.
 * Terminal statuses (COMPLETED / CANCELLED) cannot transition further.
 */
const STATUS_TRANSITIONS = {
  SCHEDULED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function isValidDate(value) {
  if (value === null || value === undefined || value === '') return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function parseInterviewId(raw) {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isTimeOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/**
 * Find any interview that overlaps the given window for the candidate OR interviewer.
 * Compares full [start, end] windows so edge overlaps are never missed.
 */
async function findSchedulingConflict(candidateId, interviewerId, start, end, excludeId = null) {
  const candidate = parseInt(candidateId, 10);
  const interviewer = parseInt(interviewerId, 10);

  const where = {
    [Op.or]: [
      ...(candidate ? [{ candidate_id: candidate }] : []),
      ...(interviewer ? [{ interviewer_id: interviewer }] : []),
    ],
    status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
    scheduled_at: { [Op.lt]: end },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const interviews = await Interview.findAll({ where });
  for (const iv of interviews) {
    const ivStart = new Date(iv.scheduled_at);
    const ivEnd = new Date(ivStart.getTime() + (iv.duration_minutes || 60) * 60 * 1000);
    if (isTimeOverlap(start, end, ivStart, ivEnd)) return iv;
  }
  return null;
}

class InterviewController {
  /**
   * POST /interviews/create
   */
  async createInterview(req, res) {
    try {
      const {
        candidateId, interviewerId, scheduledAt, durationMinutes, type,
        title, description, requireMobilePairing, meetingType, meetingLink, recordInterview,
      } = req.body;

      if (!candidateId || !interviewerId || !scheduledAt) {
        return res.status(400).json({ error: 'candidateId, interviewerId, and scheduledAt are required' });
      }

      if (!isValidDate(scheduledAt)) {
        return res.status(400).json({ error: 'Invalid date/time provided for the interview' });
      }

      const dur = parseInt(durationMinutes, 10);
      if (!Number.isInteger(dur) || dur <= 0 || dur > 600) {
        return res.status(400).json({ error: 'durationMinutes must be a positive number of minutes (max 600)' });
      }
      if (type && !INTERVIEW_TYPES.includes(type)) {
        return res.status(400).json({ error: `Interview type must be one of: ${INTERVIEW_TYPES.join(', ')}` });
      }
      if (meetingType && !MEETING_TYPES.includes(meetingType)) {
        return res.status(400).json({ error: `Meeting type must be one of: ${MEETING_TYPES.join(', ')}` });
      }

      const [candidate, interviewer] = await Promise.all([
        User.findByPk(candidateId),
        User.findByPk(interviewerId),
      ]);

      if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
      if (!interviewer) return res.status(404).json({ error: 'Interviewer not found' });
      if (candidate.role !== 'PARTICIPANT') {
        return res.status(400).json({ error: 'Selected candidate is not an eligible participant' });
      }
      if (!['TRAINER', 'ADMIN'].includes(interviewer.role)) {
        return res.status(400).json({ error: 'Selected interviewer is not an eligible interviewer (Trainer/HR)' });
      }

      const start = new Date(scheduledAt);
      const end = new Date(start.getTime() + dur * 60 * 1000);

      const conflict = await findSchedulingConflict(candidateId, interviewerId, start, end);
      if (conflict) {
        return res.status(409).json({
          error: 'Time conflict — the candidate or interviewer already has an interview in this window',
          conflictId: conflict.id,
        });
      }

      const interview = await Interview.create({
        candidate_id: candidateId,
        interviewer_id: interviewerId,
        created_by: req.user.id,
        scheduled_at: scheduledAt,
        duration_minutes: dur,
        type: type || 'TECHNICAL',
        title,
        description,
        require_mobile_pairing: requireMobilePairing !== false,
        meeting_type: meetingType || 'IN_PLATFORM',
        meeting_link: meetingLink || null,
        record_interview: recordInterview === true,
        status: 'SCHEDULED',
      });

      if (interview.meeting_type === 'IN_PLATFORM' && !interview.meeting_link) {
        const host = req.get('host') || 'localhost:3001';
        const protocol = req.protocol === 'https' ? 'https' : 'http';
        await interview.update({ meeting_link: `${protocol}://${host}/interview/${interview.id}/room` });
      }

      await notificationService.notifyCreated(interview);
      notificationService.scheduleReminder(interview);

      logger.info('Interview created', { interviewId: interview.id, createdBy: req.user.id });
      res.status(201).json({ interview });
    } catch (error) {
      logger.error('Error creating interview', { error: error.message });
      res.status(500).json({ error: 'Failed to create interview' });
    }
  }

  /**
   * GET /interviews
   */
  async listInterviews(req, res) {
    try {
      const { status, type, search, interviewerId, candidateId, page = 1, limit = 20 } = req.query;
      const where = {};
      const userRole = req.user.role;

      const roleScope = [];
      if (userRole === 'PARTICIPANT') {
        where.candidate_id = req.user.id;
      } else if (userRole === 'TRAINER') {
        roleScope.push({ interviewer_id: req.user.id }, { candidate_id: req.user.id });
      }

      if (status) where.status = status;
      if (type) where.type = type;
      if (interviewerId) where.interviewer_id = interviewerId;
      if (candidateId) where.candidate_id = candidateId;

      // Search across candidate name/email/phone, interviewer name/email,
      // interview title and interview type.
      const searchScope = [];
      if (search) {
        const term = `%${search}%`;
        searchScope.push(
          { title: { [Op.like]: term } },
          { type: { [Op.like]: term } },
          { '$candidate.name$': { [Op.like]: term } },
          { '$candidate.email$': { [Op.like]: term } },
          { '$candidate.phone$': { [Op.like]: term } },
          { '$interviewer.name$': { [Op.like]: term } },
          { '$interviewer.email$': { [Op.like]: term } }
        );
      }

      if (roleScope.length && searchScope.length) {
        where[Op.and] = [{ [Op.or]: roleScope }, { [Op.or]: searchScope }];
      } else if (roleScope.length) {
        where[Op.or] = roleScope;
      } else if (searchScope.length) {
        where[Op.or] = searchScope;
      }

      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const { rows: interviews, count } = await Interview.findAndCountAll({
        where,
        include: [
          {
            model: User, as: 'candidate',
            attributes: ['id', 'name', 'email', 'phone'],
          },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email', 'phone'] },
          { model: InterviewSession, as: 'sessions', attributes: ['id', 'status', 'started_at', 'ended_at'] },
          { model: InterviewResult, as: 'result', attributes: ['id', 'decision', 'decided_at'] },
        ],
        order: [['scheduled_at', 'DESC']],
        limit: parseInt(limit, 10),
        offset,
      });

      res.json({
        interviews,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(count / parseInt(limit, 10)),
        },
      });
    } catch (error) {
      logger.error('Error listing interviews', { error: error.message });
      res.status(500).json({ error: 'Failed to list interviews' });
    }
  }

  /**
   * GET /interviews/:id
   */
  async getInterview(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id, {
        include: [
          { model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          { model: InterviewSession, as: 'sessions' },
          { model: InterviewResult, as: 'result' },
          { model: InterviewFeedback, as: 'feedbacks' },
        ],
      });

      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Access check
      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && interview.interviewer_id !== userId && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const interviewData = interview.toJSON();
      if (role === 'PARTICIPANT') {
        // Participants must not see raw internal feedback notes
        delete interviewData.feedbacks;
        // Participants only see result if published
        if (interviewData.result && !interviewData.result.is_published) {
          delete interviewData.result;
        }
      }

      res.json({ interview: interviewData });
    } catch (error) {
      logger.error('Error getting interview', { error: error.message });
      res.status(500).json({ error: 'Failed to get interview' });
    }
  }

  /**
   * POST /interviews/:id/join
   * Candidate joins an interview — creates a session, generates pairing QR.
   */
  async joinInterview(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const userId = req.user.id;
      const role = req.user.role;

      // Access check
      if (role === 'PARTICIPANT' && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && interview.interviewer_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check interview window (scheduled_at ± grace_period_minutes)
      const now = new Date();
      const scheduled = new Date(interview.scheduled_at);
      const graceMs = (interview.grace_period_minutes || 10) * 60 * 1000;
      if (now < new Date(scheduled.getTime() - graceMs)) {
        return res.status(400).json({ error: 'Interview is not yet open for joining' });
      }

      // Create session if none active
      let session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });

      if (!session) {
        session = await InterviewSession.create({
          interview_id: interview.id,
          status: 'WAITING',
        });

        // Log session creation
        await InterviewLog.create({
          session_id: session.id,
          actor_id: userId,
          event_type: 'SESSION_CREATED',
          payload_json: { role },
        });
      }

      // Register the joining device as LAPTOP
      let device = await InterviewDevice.findOne({
        where: { session_id: session.id, user_id: userId, device_type: 'LAPTOP' },
      });

      if (!device) {
        device = await InterviewDevice.create({
          session_id: session.id,
          user_id: userId,
          device_type: 'LAPTOP',
          status: 'CONNECTED',
          connected_at: new Date(),
        });
      } else if (device.status !== 'CONNECTED') {
        await device.update({ status: 'CONNECTED', connected_at: new Date() });
      }

      // Generate QR code for mobile pairing (only for candidate)
      let qrPayload = null;
      if (role === 'PARTICIPANT' && interview.require_mobile_pairing) {
        const tokenResult = await tokenService.generatePairingToken(session.id, userId, 'MOBILE');
        qrPayload = {
          ...qrGenerator.generatePairingPayload({
            interviewId: interview.id,
            sessionId: session.id,
            token: tokenResult.token,
            socketUrl: process.env.SOCKET_URL || `${req.protocol}://${req.get('host')}`,
          }),
          expiresAt: tokenResult.expiresAt,
        };
      }

      // Get current device status
      const devices = await tokenService.getSessionDevices(session.id);
      const interviewPayload = {
        id: interview.id,
        title: interview.title,
        description: interview.description,
        type: interview.type,
        meetingType: interview.meeting_type,
        meetingLink: interview.meeting_link,
        recordInterview: interview.record_interview,
        requireMobilePairing: interview.require_mobile_pairing,
        status: interview.status,
        scheduledAt: interview.scheduled_at,
        durationMinutes: interview.duration_minutes,
      };

      res.json({
        interview: interviewPayload,
        session,
        device,
        qrPayload,
        devices: devices.map(d => ({
          deviceType: d.device_type,
          status: d.status,
          connectedAt: d.connected_at,
        })),
      });
    } catch (error) {
      logger.error('Error joining interview', { error: error.message });
      res.status(500).json({ error: 'Failed to join interview' });
    }
  }

  /**
   * POST /interviews/:id/pair-mobile
   * Mobile device pairs using a one-time token.
   */
  async pairMobile(req, res) {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'Token is required' });

      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Find the active session
      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (!session) return res.status(404).json({ error: 'No active session found' });

      // Validate and consume the token
      const result = await tokenService.consumePairingToken(token, interview.candidate_id);
      if (!result.success) {
        return res.status(result.status).json({ error: result.message });
      }

      // Mark the device as connected
      await result.device.update({
        status: 'CONNECTED',
        connected_at: new Date(),
      });

      // Log the pairing event
      await InterviewLog.create({
        session_id: session.id,
        actor_id: interview.candidate_id,
        event_type: 'MOBILE_PAIRED',
        payload_json: { deviceId: result.device.id },
      });

      // Get updated device list
      const devices = await tokenService.getSessionDevices(session.id);

      res.json({
        success: true,
        message: 'Mobile device paired successfully',
        devices: devices.map(d => ({
          deviceType: d.device_type,
          status: d.status,
          connectedAt: d.connected_at,
        })),
      });
    } catch (error) {
      logger.error('Error pairing mobile', { error: error.message });
      res.status(500).json({ error: 'Failed to pair mobile device' });
    }
  }

  /**
   * POST /interviews/pair-validate
   * Public (no auth) — the phone validates its pairing QR token and receives a
   * short-lived socket token so it can join the WebRTC room as a camera device.
   */
  async validatePairing(req, res) {
    try {
      const { token } = req.body;
      const result = await tokenService.validatePairingToken(token);
      if (!result.success) {
        return res.status(result.status || 400).json({ error: result.message });
      }

      const device = result.device;
      const session = await InterviewSession.findByPk(device.session_id);
      if (!session || session.status === 'ENDED') {
        return res.status(400).json({ error: 'Session is no longer active' });
      }

      const interview = await Interview.findByPk(session.interview_id, {
        include: [
          { model: User, as: 'candidate', attributes: ['id', 'name'] },
          { model: User, as: 'interviewer', attributes: ['id', 'name'] },
        ],
      });
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const socketToken = await tokenService.issueSocketToken(device, interview.id);
      const devices = await tokenService.getSessionDevices(session.id);

      res.json({
        success: true,
        interviewId: interview.id,
        sessionId: session.id,
        interviewType: interview.type,
        interviewTitle: interview.title,
        candidateName: interview.candidate?.name || null,
        interviewerName: interview.interviewer?.name || null,
        socketToken,
        socketUrl: process.env.SOCKET_URL || null,
        expiresAt: device.token_expires_at,
        devices: devices.map(d => ({
          deviceType: d.device_type,
          status: d.status,
          connectedAt: d.connected_at,
        })),
      });
    } catch (error) {
      logger.error('Error validating pairing', { error: error.message });
      res.status(500).json({ error: 'Failed to validate pairing token' });
    }
  }

  /**
   * POST /interviews/:id/start
   * Interviewer starts the interview (both devices must be connected if required).
   */
  async startInterview(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Only interviewer or admin can start
      if (req.user.role === 'PARTICIPANT') {
        return res.status(403).json({ error: 'Only the interviewer can start the interview' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: 'WAITING' },
      });
      if (!session) return res.status(404).json({ error: 'No waiting session found' });

      // Check devices if mobile pairing is required
      if (interview.require_mobile_pairing) {
        const devices = await tokenService.getSessionDevices(session.id);
        const laptop = devices.find(d => d.device_type === 'LAPTOP' && d.status === 'CONNECTED');
        const mobile = devices.find(d => d.device_type === 'MOBILE' && d.status === 'CONNECTED');

        if (!laptop || !mobile) {
          return res.status(400).json({ error: 'Both laptop and mobile devices must be connected before starting' });
        }
      }

      await session.update({ status: 'ACTIVE', started_at: new Date() });
      await interview.update({ status: 'IN_PROGRESS' });

      await InterviewLog.create({
        session_id: session.id,
        actor_id: req.user.id,
        event_type: 'INTERVIEW_STARTED',
      });

      logger.info('Interview started', { interviewId: interview.id, sessionId: session.id });
      res.json({ session });
    } catch (error) {
      logger.error('Error starting interview', { error: error.message });
      res.status(500).json({ error: 'Failed to start interview' });
    }
  }

  /**
   * POST /interviews/:id/end
   */
  async endInterview(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Only interviewer or admin can end
      if (req.user.role === 'PARTICIPANT') {
        return res.status(403).json({ error: 'Only the interviewer can end the interview' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: 'ACTIVE' },
      });
      if (!session) return res.status(404).json({ error: 'No active session found' });

      await session.update({ status: 'ENDED', ended_at: new Date() });
      await interview.update({ status: 'COMPLETED' });

      // Disconnect all devices
      await InterviewDevice.update(
        { status: 'DISCONNECTED', disconnected_at: new Date() },
        { where: { session_id: session.id, status: 'CONNECTED' } }
      );

      await InterviewLog.create({
        session_id: session.id,
        actor_id: req.user.id,
        event_type: 'INTERVIEW_ENDED',
      });

      logger.info('Interview ended', { interviewId: interview.id, sessionId: session.id });
      res.json({ session });
    } catch (error) {
      logger.error('Error ending interview', { error: error.message });
      res.status(500).json({ error: 'Failed to end interview' });
    }
  }

  /**
   * POST /interviews/:id/feedback
   */
  async submitFeedback(req, res) {
    try {
      const { rating, notes } = req.body;
      if (!rating || rating < 1 || rating > 10) {
        return res.status(400).json({ error: 'Rating must be between 1 and 10' });
      }

      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Only assigned interviewer can submit feedback
      if (interview.interviewer_id !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only the assigned interviewer can submit feedback' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id },
        order: [['created_at', 'DESC']],
      });

      const feedback = await InterviewFeedback.create({
        session_id: session?.id,
        interview_id: interview.id,
        interviewer_id: req.user.id,
        rating,
        notes,
      });

      logger.info('Feedback submitted', { interviewId: interview.id, rating });
      res.status(201).json({ feedback });
    } catch (error) {
      logger.error('Error submitting feedback', { error: error.message });
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  /**
   * GET /interviews/:id/status
   */
  async getInterviewStatus(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Access check
      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && interview.interviewer_id !== userId && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id },
        order: [['created_at', 'DESC']],
      });

      let devices = [];
      if (session) {
        devices = await tokenService.getSessionDevices(session.id);
      }

      const alertSummary = session ? await aiMonitorService.getAlertSummary(session.id) : { total: 0 };

      res.json({
        interview: {
          id: interview.id,
          status: interview.status,
          scheduledAt: interview.scheduled_at,
          type: interview.type,
        },
        session: session ? { id: session.id, status: session.status, startedAt: session.started_at } : null,
        devices: devices.map(d => ({
          deviceType: d.device_type,
          status: d.status,
          connectedAt: d.connected_at,
        })),
        alertSummary,
      });
    } catch (error) {
      logger.error('Error getting interview status', { error: error.message });
      res.status(500).json({ error: 'Failed to get status' });
    }
  }

  /**
   * GET /interviews/:id/recordings
   */
  async getRecordings(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Access check
      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && interview.interviewer_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const sessions = await InterviewSession.findAll({ where: { interview_id: interview.id } });
      const sessionIds = sessions.map(s => s.id);

      const recordings = await InterviewRecording.findAll({
        where: { session_id: { [Op.in]: sessionIds } },
        order: [['created_at', 'ASC']],
      });

      // Generate signed URLs for playback
      const recordingsWithUrls = recordings.map(r => ({
        ...r.toJSON(),
        playbackUrl: r.status === 'COMPLETED'
          ? recordingService.generateSignedUrl(r.file_url, userId)
          : null,
      }));

      res.json({ recordings: recordingsWithUrls });
    } catch (error) {
      logger.error('Error getting recordings', { error: error.message });
      res.status(500).json({ error: 'Failed to get recordings' });
    }
  }

  /**
   * POST /interviews/:id/alerts
   * Server-side alert log ingestion.
   */
  async logAlert(req, res) {
    try {
      const { sessionId, alertType, severity, sourceDevice, message, metadata } = req.body;
      if (!sessionId || !alertType) {
        return res.status(400).json({ error: 'sessionId and alertType are required' });
      }

      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && interview.candidate_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && interview.interviewer_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const alert = await aiMonitorService.processAlert(sessionId, {
        alertType, severity, sourceDevice, message, metadata,
      });

      res.status(201).json({ alert });
    } catch (error) {
      logger.error('Error logging alert', { error: error.message });
      res.status(500).json({ error: 'Failed to log alert' });
    }
  }

  /**
   * GET /interviews/:id/feedback
   */
  async getFeedback(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT') {
        if (interview.candidate_id !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        // Participants cannot view raw internal interviewer feedback
        return res.json({ feedbacks: [] });
      }
      if (role === 'TRAINER' && interview.interviewer_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const feedbacks = await InterviewFeedback.findAll({
        where: { interview_id: req.params.id },
        include: [{ model: User, as: 'interviewer', attributes: ['id', 'name'] }],
        order: [['created_at', 'DESC']],
      });
      res.json({ feedbacks });
    } catch (error) {
      logger.error('Error getting feedback', { error: error.message });
      res.status(500).json({ error: 'Failed to get feedback' });
    }
  }

  /**
   * POST /interviews/:id/result
   */
  async submitResult(req, res) {
    try {
      const { decision, notes, isPublished } = req.body;
      if (!decision || !['SELECTED', 'REJECTED', 'ON_HOLD'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be SELECTED, REJECTED, or ON_HOLD' });
      }

      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      if (interview.interviewer_id !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to submit result' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id },
        order: [['created_at', 'DESC']],
      });

      const shouldPublish = isPublished === true;

      const [result, created] = await InterviewResult.findOrCreate({
        where: { interview_id: interview.id },
        defaults: {
          session_id: session?.id,
          decision,
          decided_by: req.user.id,
          notes,
          is_published: shouldPublish,
        },
      });

      if (!created) {
        await result.update({
          decision,
          decided_by: req.user.id,
          decided_at: new Date(),
          notes,
          ...(isPublished !== undefined ? { is_published: shouldPublish } : {}),
        });
      }

      if (result.is_published) {
        await notificationService.notifyResultPublished(interview, result.decision);
      }

      logger.info('Interview result submitted', { interviewId: interview.id, decision, isPublished: result.is_published });
      res.json({ result });
    } catch (error) {
      logger.error('Error submitting result', { error: error.message });
      res.status(500).json({ error: 'Failed to submit result' });
    }
  }

  /**
   * POST /interviews/:id/publish-result
   * Publish evaluation result to candidate.
   */
  async publishResult(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      if (interview.interviewer_id !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to publish result' });
      }

      const result = await InterviewResult.findOne({ where: { interview_id: interview.id } });
      if (!result) {
        return res.status(400).json({ error: 'No interview result found to publish. Please submit evaluation decision first.' });
      }

      await result.update({ is_published: true });
      await notificationService.notifyResultPublished(interview, result.decision);

      logger.info('Interview result published', { interviewId: interview.id, candidateId: interview.candidate_id });
      res.json({ success: true, result });
    } catch (error) {
      logger.error('Error publishing result', { error: error.message });
      res.status(500).json({ error: 'Failed to publish result' });
    }
  }

  /**
   * POST /interviews/:id/refresh-qr
   * Regenerate pairing token/QR for mobile pairing.
   */
  async refreshQr(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const isCandidate = req.user.id === interview.candidate_id;
      const isInterviewer = req.user.id === interview.interviewer_id;
      const isAdmin = req.user.role === 'ADMIN';
      if (!isCandidate && !isInterviewer && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to refresh QR' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (!session) return res.status(404).json({ error: 'No active session' });

      const tokenResult = await tokenService.generatePairingToken(session.id, interview.candidate_id, 'MOBILE');
      const qrPayload = {
        ...qrGenerator.generatePairingPayload({
          interviewId: interview.id,
          sessionId: session.id,
          token: tokenResult.token,
          socketUrl: process.env.SOCKET_URL || `${req.protocol}://${req.get('host')}`,
        }),
        expiresAt: tokenResult.expiresAt,
      };

      res.json({ qrPayload });
    } catch (error) {
      if (error.code === 'RATE_LIMITED') {
        return res.status(429).json({ error: error.message });
      }
      logger.error('Error refreshing QR', { error: error.message });
      res.status(500).json({ error: 'Failed to refresh QR code' });
    }
  }

  /**
   * POST /interviews/upload-chunk
   * Accepts a MediaRecorder chunk for an interview recording.
   */
  async uploadChunk(req, res) {
    try {
      const { sessionId, deviceType = 'LAPTOP', chunkIndex } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'Chunk file is required' });
      }

      const session = await InterviewSession.findByPk(sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      // Reuse the active RECORDING row for this session+device, creating one
      // lazily on the first chunk.
      let recording = await InterviewRecording.findOne({
        where: { session_id: sessionId, device_type: deviceType, status: 'RECORDING' },
      });
      if (!recording) {
        recording = await recordingService.startRecording(sessionId, deviceType, req.user.id);
      }

      const result = await recordingService.uploadChunk(
        recording.id,
        req.file.buffer,
        parseInt(chunkIndex, 10) || 0
      );

      res.json({ success: true, recordingId: recording.id, ...result });
    } catch (error) {
      logger.error('Error uploading recording chunk', { error: error.message });
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  }

  /**
   * POST /interviews/finalize-recording
   * Merges uploaded chunks into the final recording file.
   */
  async finalizeRecording(req, res) {
    try {
      const { recordingId } = req.body;
      if (!recordingId) return res.status(400).json({ error: 'recordingId is required' });

      const recording = await recordingService.finalizeRecording(recordingId);
      res.json({ success: true, recording });
    } catch (error) {
      logger.error('Error finalizing recording', { error: error.message });
      res.status(500).json({ error: 'Failed to finalize recording' });
    }
  }

  /**
   * GET /interviews/candidates
   * Returns approved participants eligible for interview scheduling.
   * Sources from the same User table as Admin → Participants so every
   * participant with an APPROVED status appears in the candidate dropdown.
   */
  async getCandidates(req, res) {
    try {
      const participants = await User.findAll({
        where: { role: 'PARTICIPANT', status: 'APPROVED' },
        attributes: ['id', 'name', 'email', 'phone'],
        include: [
          {
            model: Enrollment,
            as: 'enrollments',
            attributes: [],
            required: false,
            include: [{ model: Training, as: 'training', attributes: ['id', 'title'], required: false }],
          },
        ],
        order: [['name', 'ASC']],
      });

      const candidateIds = participants.map(p => p.id);
      const scheduledInterviews = await Interview.findAll({
        where: {
          candidate_id: { [Op.in]: candidateIds },
          status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        attributes: ['candidate_id'],
      });
      const busyIds = new Set(scheduledInterviews.map(i => i.candidate_id));

      const candidates = participants.map(p => {
        const enrollment = p.enrollments && p.enrollments.find(e => e.training);
        return {
          id: p.id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          applicationId: null,
          applicationNumber: null,
          training: enrollment ? { id: enrollment.training.id, title: enrollment.training.title } : null,
          alreadyScheduled: busyIds.has(p.id),
        };
      });

      res.json({ candidates });
    } catch (error) {
      logger.error('Error fetching candidates', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch candidates' });
    }
  }

  /**
   * GET /interviews/interviewers
   * Returns users with TRAINER role who can conduct interviews.
   */
  async getInterviewers(req, res) {
    try {
      const interviewers = await User.findAll({
        where: { role: 'TRAINER' },
        attributes: ['id', 'name', 'email', 'phone'],
        order: [['name', 'ASC']],
      });

      const interviewerIds = interviewers.map(i => i.id);
      const countMap = {};
      if (interviewerIds.length > 0) {
        const scheduledCounts = await Interview.findAll({
          where: {
            interviewer_id: { [Op.in]: interviewerIds },
            status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
          },
          attributes: ['interviewer_id', [require('sequelize').fn('COUNT', '*'), 'count']],
          group: ['interviewer_id'],
        });
        scheduledCounts.forEach(row => {
          countMap[row.interviewer_id] = parseInt(row.getDataValue('count'));
        });
      }

      const result = interviewers.map(i => ({
        id: i.id,
        name: i.name,
        email: i.email,
        phone: i.phone,
        activeInterviews: countMap[i.id] || 0,
      }));

      res.json({ interviewers: result });
    } catch (error) {
      logger.error('Error fetching interviewers', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch interviewers' });
    }
  }

  /**
   * GET /interviews/stats
   * Returns interview statistics for the current user's scope.
   */
  async getInterviewStats(req, res) {
    try {
      const where = {};
      const userRole = req.user.role;

      if (userRole === 'PARTICIPANT') {
        where.candidate_id = req.user.id;
      } else if (userRole === 'TRAINER') {
        where[Op.or] = [
          { interviewer_id: req.user.id },
          { candidate_id: req.user.id },
        ];
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [total, scheduled, inProgress, completed, cancelled, today] = await Promise.all([
        Interview.count({ where }),
        Interview.count({ where: { ...where, status: 'SCHEDULED' } }),
        Interview.count({ where: { ...where, status: 'IN_PROGRESS' } }),
        Interview.count({ where: { ...where, status: 'COMPLETED' } }),
        Interview.count({ where: { ...where, status: 'CANCELLED' } }),
        Interview.count({
          where: {
            ...where,
            scheduled_at: { [Op.between]: [todayStart, todayEnd] },
          },
        }),
      ]);

      res.json({ total, scheduled, inProgress, completed, cancelled, today });
    } catch (error) {
      logger.error('Error fetching interview stats', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }

  /**
   * PUT /interviews/:id
   * Update interview details. Only SCHEDULED interviews can be edited.
   */
  async updateInterview(req, res) {
    try {
      const interviewId = parseInterviewId(req.params.id);
      if (!interviewId) return res.status(400).json({ error: 'Invalid interview id' });

      const interview = await Interview.findByPk(interviewId);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      if (req.user.role === 'PARTICIPANT') {
        return res.status(403).json({ error: 'Not authorized to update interviews' });
      }
      if (interview.status !== 'SCHEDULED') {
        return res.status(400).json({ error: 'Only scheduled interviews can be edited' });
      }

      const oldDate = interview.scheduled_at;
      const {
        title, description, type, scheduledAt, durationMinutes,
        candidateId, interviewerId, meetingType, meetingLink, recordInterview, requireMobilePairing,
      } = req.body;

      // Status is never updated through the edit endpoint — protects the
      // SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED lifecycle. Use PATCH /:id/status instead.
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (type !== undefined) updates.type = type;
      if (scheduledAt !== undefined) updates.scheduled_at = scheduledAt;
      if (durationMinutes !== undefined) updates.duration_minutes = parseInt(durationMinutes, 10);
      if (candidateId !== undefined && candidateId !== '') updates.candidate_id = parseInt(candidateId, 10);
      if (interviewerId !== undefined && interviewerId !== '') updates.interviewer_id = parseInt(interviewerId, 10);
      if (meetingType !== undefined) updates.meeting_type = meetingType;
      if (meetingLink !== undefined) updates.meeting_link = meetingLink;
      if (recordInterview !== undefined) updates.record_interview = recordInterview;
      if (requireMobilePairing !== undefined) updates.require_mobile_pairing = requireMobilePairing;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      if (updates.type !== undefined && !INTERVIEW_TYPES.includes(updates.type)) {
        return res.status(400).json({ error: `Interview type must be one of: ${INTERVIEW_TYPES.join(', ')}` });
      }
      if (updates.meeting_type !== undefined && !MEETING_TYPES.includes(updates.meeting_type)) {
        return res.status(400).json({ error: `Meeting type must be one of: ${MEETING_TYPES.join(', ')}` });
      }
      if (updates.scheduled_at !== undefined && !isValidDate(updates.scheduled_at)) {
        return res.status(400).json({ error: 'Invalid date/time provided for the interview' });
      }
      if (updates.duration_minutes !== undefined && (!Number.isInteger(updates.duration_minutes) || updates.duration_minutes <= 0 || updates.duration_minutes > 600)) {
        return res.status(400).json({ error: 'durationMinutes must be a positive number of minutes (max 600)' });
      }

      // Validate the (possibly new) candidate / interviewer exist and are eligible.
      const finalCandidateId = updates.candidate_id !== undefined ? updates.candidate_id : interview.candidate_id;
      const finalInterviewerId = updates.interviewer_id !== undefined ? updates.interviewer_id : interview.interviewer_id;
      if (updates.candidate_id !== undefined) {
        const candidate = await User.findByPk(updates.candidate_id);
        if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
        if (candidate.role !== 'PARTICIPANT') {
          return res.status(400).json({ error: 'Selected candidate is not an eligible participant' });
        }
      }
      if (updates.interviewer_id !== undefined) {
        const interviewer = await User.findByPk(updates.interviewer_id);
        if (!interviewer) return res.status(404).json({ error: 'Interviewer not found' });
        if (!['TRAINER', 'ADMIN'].includes(interviewer.role)) {
          return res.status(400).json({ error: 'Selected interviewer is not an eligible interviewer (Trainer/HR)' });
        }
      }

      // Time-conflict check against OTHER interviews using the final values.
      const finalStart = updates.scheduled_at !== undefined ? new Date(updates.scheduled_at) : new Date(interview.scheduled_at);
      const finalDur = updates.duration_minutes !== undefined ? updates.duration_minutes : interview.duration_minutes;
      const finalEnd = new Date(finalStart.getTime() + finalDur * 60 * 1000);

      const conflict = await findSchedulingConflict(finalCandidateId, finalInterviewerId, finalStart, finalEnd, interview.id);
      if (conflict) {
        return res.status(409).json({
          error: 'Time conflict — the candidate or interviewer already has an interview in this window',
          conflictId: conflict.id,
        });
      }

      await interview.update(updates);

      if (updates.meeting_type === 'IN_PLATFORM' && !interview.meeting_link) {
        const host = req.get('host') || 'localhost:3001';
        const protocol = req.protocol === 'https' ? 'https' : 'http';
        await interview.update({ meeting_link: `${protocol}://${host}/interview/${interview.id}/room` });
      }

      if (scheduledAt && new Date(scheduledAt).getTime() !== new Date(oldDate).getTime()) {
        await notificationService.notifyRescheduled(interview, oldDate);
      }

      const fresh = await Interview.findByPk(interview.id, {
        include: [
          { model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email', 'phone'] },
        ],
      });

      logger.info('Interview updated', { interviewId: interview.id, updatedBy: req.user.id });
      res.json({ interview: fresh });
    } catch (error) {
      logger.error('Error updating interview', { error: error.message });
      res.status(500).json({ error: 'Failed to update interview' });
    }
  }

  /**
   * PATCH /interviews/:id/status
   * Change the interview status with lifecycle transition validation.
   * ADMIN can change any interview; TRAINER can change their own assigned interviews.
   */
  async updateInterviewStatus(req, res) {
    try {
      const interviewId = parseInterviewId(req.params.id);
      if (!interviewId) return res.status(400).json({ error: 'Invalid interview id' });

      const interview = await Interview.findByPk(interviewId);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const isAdmin = req.user.role === 'ADMIN';
      const isAssignedTrainer = req.user.role === 'TRAINER' && interview.interviewer_id === req.user.id;
      if (!isAdmin && !isAssignedTrainer) {
        return res.status(403).json({ error: 'Not authorized to change this interview status' });
      }

      const { status: nextStatus } = req.body;
      if (!nextStatus || !ALLOWED_STATUSES.includes(nextStatus)) {
        return res.status(400).json({ error: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }

      const allowedNext = STATUS_TRANSITIONS[interview.status] || [];
      if (!allowedNext.includes(nextStatus)) {
        return res.status(400).json({
          error: `Cannot change interview from ${interview.status} to ${nextStatus}. Allowed transitions: ${allowedNext.length ? allowedNext.join(', ') : 'none'}`,
        });
      }

      await interview.update({ status: nextStatus });

      if (nextStatus === 'CANCELLED') {
        await notificationService.notifyCancelled(interview);
      }

      const fresh = await Interview.findByPk(interview.id, {
        include: [
          { model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          { model: InterviewSession, as: 'sessions', attributes: ['id', 'status', 'started_at', 'ended_at'] },
          { model: InterviewResult, as: 'result', attributes: ['id', 'decision', 'decided_at'] },
          { model: InterviewFeedback, as: 'feedbacks' },
        ],
      });

      logger.info('Interview status changed', { interviewId: interview.id, from: interview.status, to: nextStatus, by: req.user.id });
      res.json({ interview: fresh });
    } catch (error) {
      logger.error('Error changing interview status', { error: error.message });
      res.status(500).json({ error: 'Failed to change interview status' });
    }
  }

  /**
   * DELETE /interviews/:id
   * Permanently delete an interview. Only ADMIN can delete.
   * Related rows (sessions, devices, recordings, logs, alerts, feedback,
   * results, notes) are removed via ON DELETE CASCADE FK constraints.
   */
  async deleteInterview(req, res) {
    try {
      const interviewId = parseInterviewId(req.params.id);
      if (!interviewId) return res.status(400).json({ error: 'Invalid interview id' });

      logger.info('[deleteInterview] DELETE request received', {
        interviewId,
        requestedBy: req.user.id,
        role: req.user.role,
      });

      const interview = await Interview.findByPk(interviewId);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can delete interviews' });
      }
      if (interview.status === 'COMPLETED') {
        return res.status(400).json({ error: 'Cannot delete a completed interview' });
      }

      const candidateId = interview.candidate_id;
      const interviewerId = interview.interviewer_id;
      const scheduledAt = interview.scheduled_at;
      const title = interview.title;

      // Hard-delete: DELETE FROM interviews WHERE id = interviewId.
      // Related rows (sessions, devices, recordings, logs, alerts, feedback,
      // results, notes) are removed via ON DELETE CASCADE FK constraints.
      const affectedRows = await Interview.destroy({ where: { id: interviewId } });
      logger.info('[deleteInterview] DB destroy result', { interviewId, affectedRows });

      if (affectedRows === 0) {
        logger.warn('[deleteInterview] No rows affected — interview was not deleted', { interviewId });
        return res.status(404).json({ error: 'Interview no longer exists' });
      }

      // Best-effort cancellation notifications — must never fail the delete.
      try {
        await notificationService.notifyCancelled(interview);
      } catch (notifErr) {
        logger.warn('[deleteInterview] Cancellation notification failed (ignored)', {
          interviewId,
          error: notifErr.message,
        });
      }

      logger.info('Interview deleted', { interviewId, deletedBy: req.user.id, affectedRows });
      const response = {
        success: true,
        message: 'Interview deleted successfully',
        deleted: { id: interviewId, title, scheduledAt, candidateId, interviewerId },
      };
      logger.info('[deleteInterview] Final response', response);
      res.json(response);
    } catch (error) {
      logger.error('Error deleting interview', {
        error: error.message,
        code: error.original && error.original.code,
      });
      res.status(500).json({ error: 'Failed to delete interview' });
    }
  }
}

module.exports = new InterviewController();
