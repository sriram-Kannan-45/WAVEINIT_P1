/**
 * Interview Controller
 * Handles all REST API operations for the interview module.
 */

const { Op } = require('sequelize');
const {
  Interview, InterviewSession, InterviewDevice, InterviewRecording,
  InterviewLog, InterviewAlert, InterviewFeedback, InterviewResult, User,
  InterviewNotes, InterviewParticipant, sequelize,
  RegistrationApplication, Training, Enrollment,
} = require('../models');
const tokenService = require('../services/interviewTokenService');
const recordingService = require('../services/interviewRecordingService');
const notificationService = require('../services/interviewNotificationService');
const qrGenerator = require('../utils/interviewQrGenerator');
const aiMonitorService = require('../services/interviewAiMonitorService');
const logger = require('../utils/logger');

const lifecycle = require('../services/interviewLifecycleService');

const INTERVIEW_TYPES = ['TECHNICAL', 'HR', 'MANAGERIAL', 'CUSTOM'];
const MEETING_TYPES = ['ONLINE', 'IN_PERSON', 'HYBRID', 'IN_PLATFORM'];
const ALLOWED_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EVALUATED'];

/**
 * Valid status transitions for the interview lifecycle.
 * Terminal statuses (COMPLETED / CANCELLED) cannot transition further,
 * EXCEPT Group Discussions: COMPLETED → EVALUATED once every group
 * participant has been individually evaluated.
 */
const STATUS_TRANSITIONS = {
  SCHEDULED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['EVALUATED'],
  CANCELLED: [],
  EVALUATED: [],
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

  const memberships=candidate?await InterviewParticipant.findAll({where:{user_id:candidate},attributes:['interview_id']}):[];
  const where = {
    [Op.or]: [
      ...(memberships.length?[{id:{[Op.in]:memberships.map(p=>p.interview_id)}}]:[]),
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
      let {
        candidateId, interviewerId, scheduledAt, durationMinutes, type,
        title, description, requireMobilePairing, meetingType, meetingLink, recordInterview,
      } = req.body;

      const mode=req.body.mode||'INTERVIEW';
      const context=String(req.body.context || 'TRAINING').toUpperCase();
      if(!['TRAINING','HIRE'].includes(context)) return res.status(400).json({error:'Invalid interview context'});
      if(context==='HIRE' && req.user.role!=='ADMIN') return res.status(403).json({error:'Only an administrator can schedule hiring sessions.'});
      if(!['INTERVIEW','GROUP_DISCUSSION'].includes(mode)) return res.status(400).json({error:'Invalid session mode'});
      if(mode==='GROUP_DISCUSSION'&&!Array.isArray(req.body.candidateIds)) return res.status(400).json({error:'candidateIds must be an array'});
      const ids=mode==='GROUP_DISCUSSION'?(req.body.candidateIds||[]).map(Number):[Number(candidateId)];
      const invalidCount=mode==='GROUP_DISCUSSION' ? (context==='HIRE' ? ids.length!==6 : ids.length<2 || ids.length>6) : ids.length!==1;
      if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length||invalidCount) return res.status(400).json({error:context==='HIRE'?'Hire GD requires exactly 6 distinct candidates. An interview requires one candidate.':'Choose 2–6 distinct candidates for Group Discussion, or one for an interview.'});
      if (!Number.isSafeInteger(Number(interviewerId)) || Number(interviewerId)<=0 || Array.isArray(interviewerId)) return res.status(400).json({error:'Select exactly one interviewer/moderator.'});
      candidateId=ids[0];
      const evaluationCriteria=mode==='GROUP_DISCUSSION'?lifecycle.normalizeCriteria(req.body.evaluationCriteria):null;
      if(mode==='GROUP_DISCUSSION' && meetingType && meetingType!=='IN_PLATFORM') return res.status(400).json({error:'Group Discussion uses the in-platform room.'});
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
        User.findOne({ where: { id: candidateId, role: 'PARTICIPANT', isDeleted: false, status: 'APPROVED' } }),
        User.findOne({ where: { id: interviewerId, isDeleted: false, status: { [Op.ne]: 'INACTIVE' } } }),
      ]);

      if (!candidate) return res.status(404).json({ error: 'Eligible candidate not found or inactive' });
      if (!interviewer) return res.status(404).json({ error: 'Eligible interviewer not found or inactive' });
      if (!['TRAINER', 'ADMIN'].includes(interviewer.role)) {
        return res.status(400).json({ error: 'Selected interviewer is not an eligible interviewer (Trainer/HR)' });
      }

      const eligible=await User.count({where:{id:{[Op.in]:ids},role:'PARTICIPANT',isDeleted:false,status:'APPROVED'}});
      if (context==='HIRE' && mode==='GROUP_DISCUSSION' && (interviewer.role!=='TRAINER' || interviewer.status!=='APPROVED')) {
        return res.status(400).json({error:'Hire GD requires exactly one approved trainer as HR/Moderator.'});
      }
      if(eligible!==ids.length) return res.status(400).json({error:'All candidates must be approved participants.'});
      const start = new Date(scheduledAt);
      const end = new Date(start.getTime() + dur * 60 * 1000);

      let conflict=null;
      for(const id of ids) { conflict=await findSchedulingConflict(id,interviewerId,start,end); if(conflict) break; }
      if (conflict) {
        return res.status(409).json({
          error: 'Time conflict — the candidate or interviewer already has an interview in this window',
          conflictId: conflict.id,
        });
      }

      const interview = await sequelize.transaction(async transaction=>{
        const created=await Interview.create({
        mode, context, evaluation_criteria:evaluationCriteria,
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
      },{transaction});
      await InterviewParticipant.bulkCreate(ids.map(user_id=>({interview_id:created.id,user_id})),{transaction});
      return created;
      });

      if (interview.meeting_type === 'IN_PLATFORM' && !interview.meeting_link) {
        const host = req.get('host') || 'localhost:3001';
        const protocol = req.protocol === 'https' ? 'https' : 'http';
        await interview.update({ meeting_link: `${protocol}://${host}/interview/${interview.id}/room` });
      }

      // Best-effort notification delivery — secondary operation must never fail the interview creation
      try {
        await notificationService.notifyCreated(interview);
        notificationService.scheduleReminder(interview);
      } catch (notifErr) {
        logger.warn('Failed to send interview creation notifications (ignored)', {
          interviewId: interview.id,
          error: notifErr.message,
        });
      }

      logger.info('Interview created', { interviewId: interview.id, createdBy: req.user.id });
      res.status(201).json({
        success: true,
        message: 'Interview scheduled successfully',
        interview,
      });
    } catch (error) {
      logger.error('Error creating interview', { error: error.message });
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to create interview' });
    }
  }

  /**
   * GET /interviews
   */
  async listInterviews(req, res) {
    try {
      const { status, type, mode, search, interviewerId, candidateId, page = 1, limit = 20 } = req.query;
      const where = {};
      if (['TRAINING','HIRE'].includes(String(req.query.context || '').toUpperCase())) where.context=String(req.query.context).toUpperCase();
      const userRole = (req.user.role || '').toUpperCase();

      const roleScope = [];
      if (['PARTICIPANT', 'STUDENT', 'LEARNER', 'CANDIDATE'].includes(userRole)) {
        const memberships=await InterviewParticipant.findAll({where:{user_id:req.user.id},attributes:['interview_id']});
        where[Op.and]=[{[Op.or]:[{candidate_id:req.user.id},{id:{[Op.in]:memberships.map(row=>row.interview_id)}}]}];
      } else if (['TRAINER', 'INTERVIEWER'].includes(userRole)) {
        roleScope.push({ interviewer_id: req.user.id }, { created_by:req.user.id }, { candidate_id: req.user.id });
      }

      const validStatuses = ['SCHEDULED', 'CONFIRMED', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'EVALUATED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'];
      const validModes = ['INTERVIEW', 'GROUP_DISCUSSION'];
      if (status && status !== 'ALL' && status !== 'undefined' && validStatuses.includes(String(status).toUpperCase())) {
        where.status = String(status).toUpperCase();
      }
      if (type && type !== 'ALL' && type !== 'undefined') where.type = type;
      if (mode && mode !== 'ALL' && mode !== 'undefined' && validModes.includes(String(mode).toUpperCase())) {
        where.mode = String(mode).toUpperCase();
      }
      if (interviewerId && interviewerId !== 'undefined') where.interviewer_id = interviewerId;
      if (candidateId && candidateId !== 'undefined') where.candidate_id = candidateId;

      // Search across candidate name/email/phone, interviewer name/email,
      // interview title and interview type.
      const searchScope = [];
      if (search && String(search).trim() && String(search).trim() !== 'undefined') {
        const term = `%${String(search).trim()}%`;
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
        where[Op.and] = [...(where[Op.and]||[]),{ [Op.or]: roleScope }, { [Op.or]: searchScope }];
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
          { model: InterviewResult, as: 'result', attributes: ['id', 'decision', 'decided_at', 'is_published'] },
          { model: InterviewParticipant, as: 'participants', attributes: ['id', 'user_id', 'status', 'joined_at', 'evaluation'] },
        ],
        order: [['scheduled_at', 'DESC']],
        limit: parseInt(limit, 10),
        offset,
        distinct: true,
        subQuery: search ? false : undefined,
      });

      res.json({
        interviews:interviews.map(row=>{
          const data=row.toJSON();
          if(userRole==='PARTICIPANT') {
            if(!data.result?.is_published) delete data.result;
            data.participants=(data.participants||[]).map(p=>{
              if(String(p.user_id)!==String(req.user.id)||!p.evaluation?.isPublished) delete p.evaluation;
              return p;
            });
          }
          return data;
        }),
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
          {model:InterviewParticipant,as:'participants',attributes:['id','user_id','status','joined_at','evaluation'],include:[{model:User,as:'user',attributes:['id','name']}]},
        ],
      });

      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      // Access check
      await lifecycle.access(interview.id, req.user);
      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const interviewData = interview.toJSON();
      if (role === 'PARTICIPANT') {
        // Participants must not see raw internal feedback notes
        delete interviewData.feedbacks;
        interviewData.participants=(interviewData.participants||[]).map(p=>{
          if(String(p.user_id)!==String(userId)||!p.evaluation?.isPublished) delete p.evaluation;
          return p;
        });
        // Participants only see result if published
        if (interviewData.result && !interviewData.result.is_published) {
          delete interviewData.result;
        }
      }

      res.json({ interview: interviewData });
    } catch (error) {
      logger.error('Error getting interview', { error: error.message });
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to get interview' });
    }
  }

  /**
   * POST /interviews/:id/join
   * Candidate joins an interview — creates a session, generates pairing QR.
   */
  async joinInterview(req,res) {
    try { const result=await lifecycle.join(req.params.id,req.user); res.json(result); }
    catch(error) { logger.error('joinInterview failed',{error:error.message}); res.status(error.status||500).json({error: error.status ? error.message : 'Failed to join interview'}); }
  }

  /**
   * POST /interviews/:id/consent
   * Record recording & AI monitoring consent for the user in the interview session.
   */
  async recordConsent(req, res) {
    try {
      const interviewId = parseInterviewId(req.params.id);
      if (!interviewId) return res.status(400).json({ error: 'Invalid interview id' });

      const interview = await Interview.findByPk(interviewId);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const userId = req.user.id;
      const role = req.user.role;

      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      let session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
        order: [['created_at', 'DESC']],
      });

      if (!session) {
        session = await lifecycle.session(interview.id);
      }

      await InterviewLog.create({
        session_id: session.id,
        actor_id: userId,
        event_type: 'CONSENT_GRANTED',
        payload_json: { role, grantedAt: new Date().toISOString() },
      });

      logger.info('Interview consent recorded', { interviewId: interview.id, sessionId: session.id, userId, role });
      res.json({ success: true, consentGivenAt: new Date().toISOString(), sessionId: session.id });
    } catch (error) {
      logger.error('Error recording consent', { error: error.message });
      res.status(500).json({ error: 'Failed to record consent' });
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
      const validated=await tokenService.validatePairingToken(token);
      if(!validated.success||String(validated.device.session_id)!==String(session.id)||String(validated.device.user_id)!==String(req.user.id)) return res.status(403).json({error:'Pairing belongs to a different candidate or session'});
      const result = await tokenService.consumePairingToken(token,req.user.id);
      if (!result.success) {
        return res.status(result.status).json({ error: result.message });
      }

      // Mark the device as connected
      await result.device.update({
        status: 'PAIRED',
        connected_at: new Date(),
      });

      // Log the pairing event
      await InterviewLog.create({
        session_id: session.id,
        actor_id: req.user.id,
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
        candidateId: device.user_id,
        candidateName: (await User.findByPk(device.user_id))?.name || null,
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
  async startInterview(req,res) {
    try { const session=await lifecycle.start(req.params.id,req.user);
      const io=require('../config/socket').getIO();
      io?.to(`interview_${req.params.id}`).emit('interview-started',{startedAt:session.started_at});
      res.json({session}); }
    catch(error) { logger.error('startInterview failed',{error:error.message}); res.status(error.status||500).json({error: error.status ? error.message : 'Failed to start interview'}); }
  }

  /**
   * POST /interviews/:id/end
   */
  async endInterview(req,res) {
    try { const session=await lifecycle.end(req.params.id,req.user);
      const io=require('../config/socket').getIO();
      io?.to(`interview_${req.params.id}`).emit('interview-ended',{endedByName:req.user.name,endedAt:session.ended_at});
      res.json({session}); }
    catch(error) { logger.error('endInterview failed',{error:error.message}); res.status(error.status||500).json({error: error.status ? error.message : 'Failed to end interview'}); }
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
      if (String(interview.interviewer_id) !== String(req.user.id) && req.user.role !== 'ADMIN') {
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
      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && !lifecycle.isManager(interview,req.user) && !(await lifecycle.member(interview,userId))) {
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

      if(!lifecycle.isManager(interview,req.user))devices=devices.filter(d=>String(d.user_id)===String(userId));
      const alertSummary = session && lifecycle.isManager(interview,req.user) ? await aiMonitorService.getAlertSummary(session.id) : { total: 0 };

      res.json({
        interview: {
          id: interview.id,
          status: interview.status,
          scheduledAt: interview.scheduled_at,
          type: interview.type,
        },
        session: session ? { id: session.id, status: session.status, startedAt: session.started_at } : null,
        devices: devices.map(d => ({
          userId:d.user_id,
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
      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && !lifecycle.isManager(interview,req.user)) {
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
   * GET /interviews/:id/notes
   * List notes for an interview. Participants only see public notes (or their
   * own private ones); interviewers/admins see everything.
   */
  async getNotes(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && !lifecycle.isManager(interview,req.user)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const where = { interview_id: interview.id };
      if (role === 'PARTICIPANT') {
        where[Op.or] = [{ is_private: false }, { author_id: userId }];
      }

      const notes = await InterviewNotes.findAll({
        where,
        order: [['created_at', 'ASC']],
        include: [{ model: User, as: 'author', attributes: ['id', 'name', 'role', 'profile_image_path'] }],
      });

      res.json({ notes: notes.map(n => n.toJSON()) });
    } catch (error) {
      logger.error('Error getting interview notes', { error: error.message });
      res.status(500).json({ error: 'Failed to get notes' });
    }
  }

  /**
   * POST /interviews/:id/notes
   * Create a note for an interview. Attaches to the active session when one
   * exists, otherwise leaves session_id null.
   */
  async createNote(req, res) {
    try {
      const interview = await Interview.findByPk(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Interview not found' });

      const userId = req.user.id;
      const role = req.user.role;
      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && !lifecycle.isManager(interview,req.user)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { content, noteType, timestampSeconds, isPrivate } = req.body;
      if (!content || !String(content).trim()) {
        return res.status(400).json({ error: 'Note content is required' });
      }

      const activeSession = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
        order: [['created_at', 'DESC']],
      });

      const note = await InterviewNotes.create({
        interview_id: interview.id,
        session_id: activeSession ? activeSession.id : null,
        author_id: userId,
        note_type: noteType || 'GENERAL',
        content: String(content).trim(),
        timestamp_seconds: Number.isInteger(timestampSeconds) ? timestampSeconds : null,
        is_private: Boolean(isPrivate),
      });

      const created = await InterviewNotes.findByPk(note.id, {
        include: [{ model: User, as: 'author', attributes: ['id', 'name', 'role', 'profile_image_path'] }],
      });

      res.status(201).json({ note: created.toJSON() });
    } catch (error) {
      logger.error('Error creating interview note', { error: error.message });
      res.status(500).json({ error: 'Failed to create note' });
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
      if (role === 'PARTICIPANT' && !(await lifecycle.member(interview,userId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (role === 'TRAINER' && !lifecycle.isManager(interview,req.user)) {
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
        if (String(interview.candidate_id) !== String(userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        // Participants cannot view raw internal interviewer feedback
        return res.json({ feedbacks: [] });
      }
      if (role === 'TRAINER' && !lifecycle.isManager(interview,req.user)) {
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

      if (String(interview.interviewer_id) !== String(req.user.id) && req.user.role !== 'ADMIN' && req.user.role !== 'TRAINER') {
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
        try {
          await notificationService.notifyResultPublished(interview, result.decision);
        } catch (notifErr) {
          logger.warn('Failed to send result published notification (ignored)', {
            interviewId: interview.id,
            error: notifErr.message,
          });
        }
      }

      logger.info('Interview result submitted', { interviewId: interview.id, decision, isPublished: result.is_published });
      res.json({ success: true, result });
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

      if (String(interview.interviewer_id) !== String(req.user.id) && req.user.role !== 'ADMIN' && req.user.role !== 'TRAINER') {
        return res.status(403).json({ error: 'Not authorized to publish result' });
      }

      const result = await InterviewResult.findOne({ where: { interview_id: interview.id } });
      if (!result) {
        return res.status(400).json({ error: 'No interview result found to publish. Please submit evaluation decision first.' });
      }

      await result.update({ is_published: true });
      try {
        await notificationService.notifyResultPublished(interview, result.decision);
      } catch (notifErr) {
        logger.warn('Failed to send result published notification (ignored)', {
          interviewId: interview.id,
          error: notifErr.message,
        });
      }

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

      const ownMember = await lifecycle.member(interview,req.user.id);
      const isCandidate = !!ownMember;
      const isInterviewer = req.user.id === interview.interviewer_id;
      const isStaff = req.user.role === 'ADMIN' || req.user.role === 'TRAINER';
      if (!isCandidate && !isInterviewer && !isStaff) {
        return res.status(403).json({ error: 'Not authorized to refresh QR' });
      }

      const session = await InterviewSession.findOne({
        where: { interview_id: interview.id, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (!session) return res.status(404).json({ error: 'No active session' });

      const tokenResult = await tokenService.generatePairingToken(session.id, ownMember ? req.user.id : interview.candidate_id, 'MOBILE');
      const qrPayload = {
        reusable:tokenResult.reusable,
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
        where: { role: 'PARTICIPANT', status: 'APPROVED', isDeleted: false },
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
   * Returns active users with TRAINER role who can conduct interviews.
   */
  async getInterviewers(req, res) {
    try {
      const interviewers = await User.findAll({
        where: { role: 'TRAINER', isDeleted: false, status: 'APPROVED' },
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

      if (['INTERVIEW', 'GROUP_DISCUSSION'].includes(String(req.query.mode || '').toUpperCase())) {
        where.mode = String(req.query.mode).toUpperCase();
      }
      if (['TRAINING','HIRE'].includes(String(req.query.context || '').toUpperCase())) where.context=String(req.query.context).toUpperCase();

      if (userRole === 'PARTICIPANT') {
        const memberships=await InterviewParticipant.findAll({where:{user_id:req.user.id},attributes:['interview_id']});
        where[Op.or]=[{candidate_id:req.user.id},{id:{[Op.in]:memberships.map(p=>p.interview_id)}}];
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

      const [total, scheduled, inProgress, completed, evaluated, cancelled, today] = await Promise.all([
        Interview.count({ where }),
        Interview.count({ where: { ...where, status: 'SCHEDULED' } }),
        Interview.count({ where: { ...where, status: 'IN_PROGRESS' } }),
        Interview.count({ where: { ...where, status: 'COMPLETED' } }),
        Interview.count({ where: { ...where, status: 'EVALUATED' } }),
        Interview.count({ where: { ...where, status: 'CANCELLED' } }),
        Interview.count({
          where: {
            ...where,
            scheduled_at: { [Op.between]: [todayStart, todayEnd] },
          },
        }),
      ]);

      res.json({ total, scheduled, inProgress, completed, evaluated, cancelled, today });
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
      const existing=await Interview.findByPk(req.params.id);
      if(existing?.mode==='GROUP_DISCUSSION') return res.status(409).json({error:'Group Discussion configuration is fixed after scheduling. Cancel and schedule a new session to change participants or criteria.'});
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
        const candidate = await User.findOne({
          where: { id: updates.candidate_id, role: 'PARTICIPANT', isDeleted: false, status: 'APPROVED' },
        });
        if (!candidate) return res.status(404).json({ error: 'Eligible candidate not found or inactive' });
      }
      if (updates.interviewer_id !== undefined) {
        const interviewer = await User.findOne({
          where: { id: updates.interviewer_id, isDeleted: false, status: { [Op.ne]: 'INACTIVE' } },
        });
        if (!interviewer) return res.status(404).json({ error: 'Eligible interviewer not found or inactive' });
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

      await sequelize.transaction(async transaction=>{
        await Interview.findByPk(interview.id,{transaction,lock:transaction.LOCK.UPDATE});
        const joined=await InterviewSession.findOne({where:{interview_id:interview.id},transaction});
        if(joined)throw Object.assign(new Error('Candidates have already joined. Cancel and schedule a new interview to change its configuration.'),{status:409});
        await interview.update(updates,{transaction});
        await InterviewParticipant.destroy({where:{interview_id:interview.id,user_id:{[Op.ne]:finalCandidateId}},transaction});
        await InterviewParticipant.findOrCreate({where:{interview_id:interview.id,user_id:finalCandidateId},transaction});
      });

      if (updates.meeting_type === 'IN_PLATFORM' && !interview.meeting_link) {
        const host = req.get('host') || 'localhost:3001';
        const protocol = req.protocol === 'https' ? 'https' : 'http';
        await interview.update({ meeting_link: `${protocol}://${host}/interview/${interview.id}/room` });
      }

      if (scheduledAt && new Date(scheduledAt).getTime() !== new Date(oldDate).getTime()) {
        try {
          await notificationService.notifyRescheduled(interview, oldDate);
        } catch (notifErr) {
          logger.warn('Failed to send reschedule notification (ignored)', {
            interviewId: interview.id,
            error: notifErr.message,
          });
        }
      }

      const fresh = await Interview.findByPk(interview.id, {
        include: [
          { model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email', 'phone'] },
        ],
      });

      logger.info('Interview updated', { interviewId: interview.id, updatedBy: req.user.id });
      res.json({ success: true, message: 'Interview updated successfully', interview: fresh });
    } catch (error) {
      logger.error('Error updating interview', { error: error.message });
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to update interview' });
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
      const isAssignedTrainer = req.user.role === 'TRAINER' && String(interview.interviewer_id) === String(req.user.id);
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

      if (nextStatus === 'EVALUATED') {
        if (interview.mode !== 'GROUP_DISCUSSION') {
          return res.status(400).json({ error: 'Only Group Discussions can be marked EVALUATED.' });
        }
        const participants = await InterviewParticipant.findAll({ where: { interview_id: interview.id } });
        if (!participants.length) {
          return res.status(400).json({ error: 'Group Discussion has no participants to evaluate.' });
        }
        const unevaluated = participants.filter((p) => !(p.evaluation && typeof p.evaluation === 'object' && (p.evaluation.scores || p.evaluation.rating !== undefined || p.evaluation.feedback)));
        if (unevaluated.length > 0) {
          return res.status(400).json({
            error: `Cannot mark EVALUATED yet: ${unevaluated.length} of ${participants.length} participants are still missing evaluations.`,
            unevaluatedCount: unevaluated.length,
            totalCount: participants.length,
          });
        }
      }

      if(nextStatus==='IN_PROGRESS') {
        let session = await InterviewSession.findOne({
          where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
        });
        if (!session) {
          session = await InterviewSession.create({ interview_id: interviewId, status: 'ACTIVE', started_at: new Date() });
        } else if (session.status === 'WAITING') {
          await session.update({ status: 'ACTIVE', started_at: session.started_at || new Date() });
        }
        await interview.update({ status: 'IN_PROGRESS' });
        try {
          await InterviewLog.create({ session_id: session.id, actor_id: req.user.id, event_type: 'INTERVIEW_STARTED' });
        } catch (logErr) {
          logger.warn('Failed to record interview started log', { error: logErr.message });
        }
        require('../config/socket').getIO()?.to(`interview_${interviewId}`).emit('interview-started', { startedAt: session.started_at });
      } else {
        const session = await InterviewSession.findOne({ where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } } });
        if (session && ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(nextStatus)) {
          await session.update({ status: 'ENDED', ended_at: new Date() });
          try {
            await InterviewParticipant.update({ status: 'DISCONNECTED', left_at: new Date() }, { where: { interview_id: interviewId, status: 'CONNECTED' } });
            await InterviewLog.create({ session_id: session.id, actor_id: req.user.id, event_type: 'INTERVIEW_ENDED' });
          } catch (e) {}
          require('../config/socket').getIO()?.to(`interview_${interviewId}`).emit('interview-ended', { endedByName: req.user.name || 'the interviewer' });
        }
        await interview.update({ status: nextStatus });
      }

      if (nextStatus === 'CANCELLED') {
        try {
          await notificationService.notifyCancelled(interview);
        } catch (notifErr) {
          logger.warn('Failed to send status cancellation notification (ignored)', {
            interviewId: interview.id,
            error: notifErr.message,
          });
        }
      }

      const fresh = await Interview.findByPk(interview.id, {
        include: [
          { model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'interviewer', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
          { model: InterviewSession, as: 'sessions', attributes: ['id', 'status', 'started_at', 'ended_at'] },
          { model: InterviewResult, as: 'result', attributes: ['id', 'decision', 'decided_at', 'is_published'] },
          { model: InterviewFeedback, as: 'feedbacks' },
        ],
      });

      logger.info('Interview status changed', { interviewId: interview.id, from: interview.status, to: nextStatus, by: req.user.id });
      res.json({ success: true, message: 'Interview status changed successfully', interview: fresh });
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

  /**
   * Bulk delete interviews. Only ADMIN can bulk delete.
   * Supports Safe Mode (blocks COMPLETED/IN_PROGRESS interviews) and Force Mode (cascades everything).
   */
  async bulkDeleteInterviews(req, res) {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Only admins can delete interviews' });
      }

      const { ids, force = false } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Please provide an array of interview IDs to delete.' });
      }

      const validIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
      if (validIds.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid interview IDs provided.' });
      }

      const interviews = await Interview.findAll({
        where: { id: { [Op.in]: validIds } },
      });

      if (interviews.length === 0) {
        return res.json({
          success: true,
          message: 'The selected interview(s) have already been removed.',
          summary: { total: validIds.length, deleted: validIds.length, failed: 0 },
          deletedIds: validIds,
          failed: [],
        });
      }

      const failed = [];
      const eligibleIds = [];

      for (const iv of interviews) {
        if (!force) {
          const reasons = [];
          if (iv.status === 'COMPLETED') {
            reasons.push('Interview session is completed');
          } else if (iv.status === 'IN_PROGRESS') {
            reasons.push('Interview is currently in progress with active participants');
          }

          // Check if any sessions have recordings, results, or feedback
          const sessions = await InterviewSession.findAll({
            where: { interview_id: iv.id },
            attributes: ['id'],
          }).catch(() => []);
          const sIds = sessions.map(s => s.id);

          const [recordingsCount, feedbackCount, resultsCount] = await Promise.all([
            sIds.length > 0 && InterviewRecording ? InterviewRecording.count({ where: { session_id: { [Op.in]: sIds } } }).catch(() => 0) : 0,
            InterviewFeedback ? InterviewFeedback.count({
              where: {
                [Op.or]: [{ interview_id: iv.id }, ...(sIds.length ? [{ session_id: { [Op.in]: sIds } }] : [])],
              },
            }).catch(() => 0) : 0,
            InterviewResult ? InterviewResult.count({
              where: {
                [Op.or]: [{ interview_id: iv.id }, ...(sIds.length ? [{ session_id: { [Op.in]: sIds } }] : [])],
              },
            }).catch(() => 0) : 0,
          ]);

          if (recordingsCount > 0) reasons.push(`${recordingsCount} session video recording(s)`);
          if (feedbackCount > 0) reasons.push(`${feedbackCount} candidate evaluation(s)`);
          if (resultsCount > 0) reasons.push('official decision result recorded');

          if (reasons.length > 0) {
            failed.push({
              id: iv.id,
              name: iv.title || `Interview #${iv.id}`,
              reason: `Interview has protected content: ${reasons.join('; ')}. Use Force Delete to override.`,
            });
            continue;
          }
        }
        eligibleIds.push(iv.id);
      }

      // If in Safe Mode and none are eligible
      if (eligibleIds.length === 0) {
        return res.json({
          success: false,
          message: 'None of the selected interviews could be deleted in Safe Mode due to active dependencies.',
          error: 'None of the selected interviews could be deleted in Safe Mode due to active dependencies.',
          summary: { total: validIds.length, deleted: 0, failed: failed.length },
          deletedIds: [],
          failed,
        });
      }

      const t = await sequelize.transaction();
      try {
        // 1. Find all session IDs for eligible interviews
        const sessions = await InterviewSession.findAll({
          where: { interview_id: { [Op.in]: eligibleIds } },
          attributes: ['id'],
          transaction: t,
        });
        const sessionIds = sessions.map(s => s.id);

        // 2. Cascade session-level children
        if (sessionIds.length > 0) {
          if (InterviewDevice) await InterviewDevice.destroy({ where: { session_id: { [Op.in]: sessionIds } }, transaction: t });
          if (InterviewRecording) await InterviewRecording.destroy({ where: { session_id: { [Op.in]: sessionIds } }, transaction: t });
          if (InterviewLog) await InterviewLog.destroy({ where: { session_id: { [Op.in]: sessionIds } }, transaction: t });
          if (InterviewAlert) await InterviewAlert.destroy({ where: { session_id: { [Op.in]: sessionIds } }, transaction: t });
        }

        // 3. Child tables that reference interview_id or session_id
        const interviewOrSessionWhere = sessionIds.length > 0
          ? { [Op.or]: [{ interview_id: { [Op.in]: eligibleIds } }, { session_id: { [Op.in]: sessionIds } }] }
          : { interview_id: { [Op.in]: eligibleIds } };

        if (InterviewResult) await InterviewResult.destroy({ where: interviewOrSessionWhere, transaction: t });
        if (InterviewFeedback) await InterviewFeedback.destroy({ where: interviewOrSessionWhere, transaction: t });
        if (InterviewNotes) await InterviewNotes.destroy({ where: interviewOrSessionWhere, transaction: t });
        if (InterviewParticipant) await InterviewParticipant.destroy({ where: { interview_id: { [Op.in]: eligibleIds } }, transaction: t });

        // 4. Delete sessions
        if (InterviewSession) await InterviewSession.destroy({ where: { interview_id: { [Op.in]: eligibleIds } }, transaction: t });

        // 5. Delete interviews
        await Interview.destroy({ where: { id: { [Op.in]: eligibleIds } }, transaction: t });

        await t.commit();

        logger.info('[bulkDeleteInterviews] Successfully deleted interviews', {
          deletedCount: eligibleIds.length,
          requestedBy: req.user.id,
        });

        return res.json({
          success: true,
          message: `Successfully deleted ${eligibleIds.length} interview(s).${failed.length > 0 ? ` ${failed.length} interview(s) protected.` : ''}`,
          summary: {
            total: validIds.length,
            deleted: eligibleIds.length,
            failed: failed.length,
          },
          deletedIds: eligibleIds,
          failed,
        });
      } catch (dbErr) {
        await t.rollback();
        logger.error('[bulkDeleteInterviews] Transaction error during bulk delete', {
          error: dbErr.message,
          stack: dbErr.stack,
        });
        return res.status(500).json({ success: false, error: 'Database transaction error during interview bulk delete.' });
      }
    } catch (error) {
      logger.error('[bulkDeleteInterviews] Unexpected error', { error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to bulk delete interviews.' });
    }
  }
}

module.exports = new InterviewController();
