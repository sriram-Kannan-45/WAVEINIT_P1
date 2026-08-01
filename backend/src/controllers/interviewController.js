/**
 * Interview Controller
 * Handles all REST API operations for the interview module.
 */

const { Op } = require('sequelize');
const {
  Interview, InterviewSession, InterviewDevice, InterviewRecording,
  InterviewLog, InterviewAlert, InterviewFeedback, InterviewResult, User,
  RegistrationApplication, Training,
} = require('../models');
const tokenService = require('../services/interviewTokenService');
const recordingService = require('../services/interviewRecordingService');
const notificationService = require('../services/interviewNotificationService');
const qrGenerator = require('../utils/interviewQrGenerator');
const aiMonitorService = require('../services/interviewAiMonitorService');
const logger = require('../utils/logger');

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

      const [candidate, interviewer] = await Promise.all([
        User.findByPk(candidateId),
        User.findByPk(interviewerId),
      ]);

      if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
      if (!interviewer) return res.status(404).json({ error: 'Interviewer not found' });

      const dur = parseInt(durationMinutes) || 60;
      const start = new Date(scheduledAt);
      const end = new Date(start.getTime() + dur * 60 * 1000);

      const conflict = await Interview.findOne({
        where: {
          [Op.or]: [
            { candidate_id: candidateId },
            { interviewer_id: interviewerId },
          ],
          status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
          scheduled_at: { [Op.lt]: end },
        },
      });
      if (conflict) {
        const endOfConflict = new Date(
          new Date(conflict.scheduled_at).getTime() + conflict.duration_minutes * 60 * 1000
        );
        if (start < endOfConflict) {
          return res.status(409).json({
            error: 'Time conflict — the candidate or interviewer already has an interview in this window',
            conflictId: conflict.id,
          });
        }
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

      if (userRole === 'PARTICIPANT') {
        where.candidate_id = req.user.id;
      } else if (userRole === 'TRAINER') {
        where[Op.or] = [
          { interviewer_id: req.user.id },
          { candidate_id: req.user.id },
        ];
      }

      if (status) where.status = status;
      if (type) where.type = type;
      if (interviewerId) where.interviewer_id = interviewerId;
      if (candidateId) where.candidate_id = candidateId;

      if (search) {
        const term = `%${search}%`;
        const candidateWhere = { [Op.or]: [
          { name: { [Op.like]: term } },
          { email: { [Op.like]: term } },
        ]};
        var candidateSearch = candidateWhere;
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const { rows: interviews, count } = await Interview.findAndCountAll({
        where,
        include: [
          {
            model: User, as: 'candidate',
            attributes: ['id', 'name', 'email', 'phone'],
            ...(candidateSearch ? { where: candidateSearch } : {}),
          },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email'] },
          { model: InterviewSession, as: 'sessions', attributes: ['id', 'status', 'started_at', 'ended_at'] },
          { model: InterviewResult, as: 'result', attributes: ['id', 'decision', 'decided_at'] },
        ],
        order: [['scheduled_at', 'DESC']],
        limit: parseInt(limit),
        offset,
      });

      res.json({
        interviews,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / parseInt(limit)),
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

      res.json({ interview });
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
        qrPayload = qrGenerator.generatePairingPayload({
          interviewId: interview.id,
          sessionId: session.id,
          token: tokenResult.token,
          socketUrl: process.env.SOCKET_URL || 'http://localhost:3001',
        });
      }

      // Get current device status
      const devices = await tokenService.getSessionDevices(session.id);

      res.json({
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
      const { decision, notes } = req.body;
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

      const [result, created] = await InterviewResult.findOrCreate({
        where: { interview_id: interview.id },
        defaults: {
          session_id: session?.id,
          decision,
          decided_by: req.user.id,
          notes,
        },
      });

      if (!created) {
        await result.update({
          decision,
          decided_by: req.user.id,
          decided_at: new Date(),
          notes,
        });
      }

      logger.info('Interview result submitted', { interviewId: interview.id, decision });
      res.json({ result });
    } catch (error) {
      logger.error('Error submitting result', { error: error.message });
      res.status(500).json({ error: 'Failed to submit result' });
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

      if (req.user.id !== interview.candidate_id) {
        return res.status(403).json({ error: 'Only the candidate can refresh QR' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (!session) return res.status(404).json({ error: 'No active session' });

      const tokenResult = await tokenService.generatePairingToken(session.id, req.user.id, 'MOBILE');
      const qrPayload = qrGenerator.generatePairingPayload({
        interviewId: interview.id,
        sessionId: session.id,
        token: tokenResult.token,
        socketUrl: process.env.SOCKET_URL || 'http://localhost:3001',
      });

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
   * GET /interviews/candidates
   * Returns approved participants eligible for interview scheduling.
   */
  async getCandidates(req, res) {
    try {
      const apps = await RegistrationApplication.findAll({
        where: { status: 'APPROVED', userId: { [Op.ne]: null } },
        include: [
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
          { model: Training, as: 'training', attributes: ['id', 'title'], required: false },
        ],
        order: [['created_at', 'DESC']],
      });

      const candidateIds = apps.map(a => a.userId).filter(Boolean);
      const scheduledInterviews = await Interview.findAll({
        where: {
          candidate_id: { [Op.in]: candidateIds },
          status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        attributes: ['candidate_id'],
      });
      const busyIds = new Set(scheduledInterviews.map(i => i.candidate_id));

      const candidates = apps
        .filter(a => a.user)
        .map(a => ({
          id: a.user.id,
          name: a.user.name,
          email: a.user.email,
          phone: a.user.phone,
          applicationId: a.id,
          applicationNumber: a.applicationNumber,
          training: a.training ? { id: a.training.id, title: a.training.title } : null,
          alreadyScheduled: busyIds.has(a.userId),
        }));

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
      const interview = await Interview.findByPk(req.params.id);
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
        interviewerId, meetingType, meetingLink, recordInterview, requireMobilePairing,
      } = req.body;

      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (type !== undefined) updates.type = type;
      if (scheduledAt !== undefined) updates.scheduled_at = scheduledAt;
      if (durationMinutes !== undefined) updates.duration_minutes = parseInt(durationMinutes);
      if (interviewerId !== undefined) updates.interviewer_id = parseInt(interviewerId);
      if (meetingType !== undefined) updates.meeting_type = meetingType;
      if (meetingLink !== undefined) updates.meeting_link = meetingLink;
      if (recordInterview !== undefined) updates.record_interview = recordInterview;
      if (requireMobilePairing !== undefined) updates.require_mobile_pairing = requireMobilePairing;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
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

      logger.info('Interview updated', { interviewId: interview.id, updatedBy: req.user.id });
      res.json({ interview });
    } catch (error) {
      logger.error('Error updating interview', { error: error.message });
      res.status(500).json({ error: 'Failed to update interview' });
    }
  }

  /**
   * DELETE /interviews/:id
   * Cancel an interview. Only ADMIN can delete. Sends cancellation notification.
   */
  async deleteInterview(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can delete interviews' });
      }
      if (interview.status === 'COMPLETED') {
        return res.status(400).json({ error: 'Cannot delete a completed interview' });
      }

      await interview.update({ status: 'CANCELLED' });
      await notificationService.notifyCancelled(interview);

      logger.info('Interview cancelled', { interviewId: interview.id, deletedBy: req.user.id });
      res.json({ success: true, message: 'Interview cancelled successfully' });
    } catch (error) {
      logger.error('Error deleting interview', { error: error.message });
      res.status(500).json({ error: 'Failed to delete interview' });
    }
  }
}

module.exports = new InterviewController();
