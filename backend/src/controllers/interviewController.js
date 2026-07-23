const interviewService = require('../services/interviewService');
const interviewNotificationService = require('../services/interviewNotificationService');
const { Interview, InterviewCandidate, InterviewTrainer, InterviewEvaluation, InterviewRoom, InterviewRecording, InterviewLog, User } = require('../models');
const { Op } = require('sequelize');

const interviewController = {
  async create(req, res) {
    try {
      const { title, description, interviewType, trainerIds, participantIds, scheduledAt, durationMinutes, timezone, meetingPassword, instructions, ...features } = req.body;
      if (!title || !interviewType || !scheduledAt) {
        return res.status(400).json({ message: 'Title, interview type, and scheduled time are required' });
      }
      const interview = await interviewService.createInterview({
        title, description, interviewType, trainerIds, participantIds,
        scheduledAt, durationMinutes, timezone, meetingPassword, instructions,
        ...features,
      }, req.user.id);
      res.status(201).json({ message: 'Interview created successfully', interview });
    } catch (error) {
      res.status(500).json({ message: 'Failed to create interview' });
    }
  },

  async list(req, res) {
    try {
      const { status, interviewType } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (interviewType) filters.interviewType = interviewType;
      const interviews = await interviewService.listInterviews(filters);
      res.json({ interviews, total: interviews.length });
    } catch (error) {
      res.status(500).json({ message: 'Failed to list interviews' });
    }
  },

  async dashboardStats(req, res) {
    try {
      const stats = await interviewService.getDashboardStats(req.user.id, req.user.role);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get dashboard stats' });
    }
  },

  async getOne(req, res) {
    try {
      const interview = await interviewService.getInterviewById(req.params.id);
      if (!interview) return res.status(404).json({ message: 'Interview not found' });
      res.json(interview);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get interview' });
    }
  },

  async update(req, res) {
    try {
      const interview = await interviewService.updateInterview(req.params.id, req.body);
      res.json({ message: 'Interview updated', interview });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update interview' });
    }
  },

  async cancel(req, res) {
    try {
      const interview = await interviewService.cancelInterview(req.params.id, req.user.id);
      res.json({ message: 'Interview cancelled', interview });
    } catch (error) {
      res.status(500).json({ message: 'Failed to cancel interview' });
    }
  },

  async start(req, res) {
    try {
      const interview = await interviewService.startInterview(req.params.id, req.user.id);
      res.json({ message: 'Interview started', interview });
    } catch (error) {
      res.status(500).json({ message: 'Failed to start interview' });
    }
  },

  async end(req, res) {
    try {
      const interview = await interviewService.endInterview(req.params.id, req.user.id);
      res.json({ message: 'Interview ended', interview });
    } catch (error) {
      res.status(500).json({ message: 'Failed to end interview' });
    }
  },

  async join(req, res) {
    try {
      const { password } = req.body;
      const interview = await interviewService.getInterviewById(req.params.id);
      if (!interview) return res.status(404).json({ message: 'Interview not found' });
      if (interview.meetingPassword) {
        const valid = await interviewService.verifyPassword(req.params.id, password);
        if (!valid) return res.status(403).json({ message: 'Invalid meeting password' });
      }
      const isCandidate = req.user.role === 'PARTICIPANT';
      if (isCandidate) {
        await interviewService.recordJoin(req.params.id, req.user.id);
      }
      await interviewService.logActivity(req.params.id, req.user.id, isCandidate ? 'CANDIDATE_JOINED' : 'INTERVIEWER_JOINED', {});
      const room = await InterviewRoom.findOne({ where: { interviewId: req.params.id } });
      res.json({ message: 'Joined room', room, interview });
    } catch (error) {
      res.status(500).json({ message: 'Failed to join interview' });
    }
  },

  async leave(req, res) {
    try {
      const isCandidate = req.user.role === 'PARTICIPANT';
      if (isCandidate) {
        await interviewService.recordLeave(req.params.id, req.user.id);
      }
      await interviewService.logActivity(req.params.id, req.user.id, isCandidate ? 'CANDIDATE_LEFT' : 'INTERVIEWER_LEFT', {});
      res.json({ message: 'Left room' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to leave interview' });
    }
  },

  async assignParticipants(req, res) {
    try {
      const { participantIds } = req.body;
      const existing = await InterviewCandidate.findAll({ where: { interviewId: req.params.id } });
      const existingIds = existing.map(e => e.participantId);
      const newIds = participantIds.filter(id => !existingIds.includes(id));
      for (const pid of newIds) {
        await InterviewCandidate.create({ interviewId: req.params.id, participantId: pid, status: 'ASSIGNED' });
      }
      await interviewService.notifyCandidates(req.params.id, 'INVITATION_RECEIVED', 'You have been invited to an interview');
      res.json({ message: 'Participants assigned', added: newIds.length });
    } catch (error) {
      res.status(500).json({ message: 'Failed to assign participants' });
    }
  },

  async assignTrainers(req, res) {
    try {
      const { trainerIds } = req.body;
      const existing = await InterviewTrainer.findAll({ where: { interviewId: req.params.id } });
      const existingIds = existing.map(e => e.trainerId);
      const newIds = trainerIds.filter(id => !existingIds.includes(id));
      for (const tid of newIds) {
        await InterviewTrainer.create({ interviewId: req.params.id, trainerId: tid, role: 'PRIMARY' });
      }
      await interviewService.notifyTrainers(req.params.id, 'INTERVIEW_SCHEDULED', 'You have been assigned as interviewer');
      res.json({ message: 'Trainers assigned', added: newIds.length });
    } catch (error) {
      res.status(500).json({ message: 'Failed to assign trainers' });
    }
  },

  async myInterviews(req, res) {
    try {
      const records = await interviewService.getParticipantInterviews(req.user.id);
      const interviews = records.map(r => ({ ...r.Interview?.toJSON(), candidateStatus: r.status, joinedAt: r.joinedAt }));
      res.json({ interviews });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get your interviews' });
    }
  },

  async trainerInterviews(req, res) {
    try {
      const records = await interviewService.getTrainerInterviews(req.user.id);
      const interviews = records.map(r => r.Interview?.toJSON());
      res.json({ interviews });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get interviews' });
    }
  },

  async getActivityLog(req, res) {
    try {
      const logs = await interviewService.getActivityLog(req.params.id);
      res.json({ logs });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get activity log' });
    }
  },

  async getNotifications(req, res) {
    try {
      const notifications = await InterviewNotification.findAll({
        where: { interviewId: req.params.id, userId: req.user.id },
        order: [['createdAt', 'DESC']],
      });
      res.json({ notifications });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get notifications' });
    }
  },

  async verifyPassword(req, res) {
    try {
      const { password } = req.body;
      const valid = await interviewService.verifyPassword(req.params.id, password);
      res.json({ valid });
    } catch (error) {
      res.status(500).json({ message: 'Failed to verify password' });
    }
  },

  async generateQR(req, res) {
    try {
      const result = await interviewService.generateQRToken(req.params.id, req.user.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: 'Failed to generate QR' });
    }
  },

  async verifyQR(req, res) {
    try {
      const { token } = req.body;
      await interviewService.verifyQRToken(req.params.id, req.user.id, token);
      res.json({ verified: true });
    } catch (error) {
      res.status(400).json({ message: error.message || 'QR verification failed' });
    }
  },

  async connectMobile(req, res) {
    try {
      const device = await interviewService.connectMobileDevice(req.params.id, req.user.id, req.body);
      res.json({ message: 'Mobile connected', device });
    } catch (error) {
      res.status(500).json({ message: 'Failed to connect mobile device' });
    }
  },

  async submitEvaluation(req, res) {
    try {
      const { participantId, communicationRating, technicalRating, codingRating, problemSolvingRating, confidenceRating, behaviorRating, recommendation, remarks } = req.body;
      const overallRating = ((communicationRating || 0) + (technicalRating || 0) + (codingRating || 0) + (problemSolvingRating || 0) + (confidenceRating || 0) + (behaviorRating || 0)) / 6;
      const evaluation = await InterviewEvaluation.upsert({
        interviewId: req.params.id,
        participantId,
        evaluatorId: req.user.id,
        communicationRating, technicalRating, codingRating,
        problemSolvingRating, confidenceRating, behaviorRating,
        overallRating: overallRating.toFixed(2),
        recommendation, remarks,
        submittedAt: new Date(),
      });
      await interviewService.logActivity(req.params.id, req.user.id, 'EVALUATION_SUBMITTED', { participantId, recommendation });
      res.json({ message: 'Evaluation submitted', evaluation });
    } catch (error) {
      res.status(500).json({ message: 'Failed to submit evaluation' });
    }
  },

  async getEvaluations(req, res) {
    try {
      const evaluations = await InterviewEvaluation.findAll({
        where: { interviewId: req.params.id },
        include: [
          { model: User, as: 'evaluator', attributes: ['id', 'name'] },
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        ],
      });
      res.json({ evaluations });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get evaluations' });
    }
  },

  async publishResults(req, res) {
    try {
      await interviewService.logActivity(req.params.id, req.user.id, 'RESULT_PUBLISHED', {});
      await interviewService.notifyCandidates(req.params.id, 'RESULT_PUBLISHED', 'Your interview results have been published');
      res.json({ message: 'Results published' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to publish results' });
    }
  },

  async getReport(req, res) {
    try {
      const interview = await interviewService.getInterviewById(req.params.id);
      const evaluations = await InterviewEvaluation.findAll({
        where: { interviewId: req.params.id },
        include: [
          { model: User, as: 'evaluator', attributes: ['id', 'name'] },
          { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
        ],
      });
      const logs = await interviewService.getActivityLog(req.params.id);
      const recordings = await InterviewRecording.findAll({ where: { interviewId: req.params.id } });
      res.json({ interview, evaluations, logs, recordings });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get report' });
    }
  },

  async listTrainers(req, res) {
    try {
      const trainers = await User.findAll({ where: { role: 'TRAINER', status: 'APPROVED', isDeleted: false }, attributes: ['id', 'name', 'email', 'phone'] });
      res.json({ trainers });
    } catch (error) {
      res.status(500).json({ message: 'Failed to list trainers' });
    }
  },

  async listParticipants(req, res) {
    try {
      const participants = await User.findAll({ where: { role: 'PARTICIPANT', status: 'APPROVED', isDeleted: false }, attributes: ['id', 'name', 'email', 'phone'] });
      res.json({ participants });
    } catch (error) {
      res.status(500).json({ message: 'Failed to list participants' });
    }
  },
};

module.exports = interviewController;
