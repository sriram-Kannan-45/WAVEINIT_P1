const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid') || { v4: () => crypto.randomUUID() };
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const {
  Interview, InterviewCandidate, InterviewTrainer, InterviewRoom,
  InterviewLog, InterviewDevice, InterviewNotification, User
} = require('../models');

const interviewService = {
  // Create interview with trainers and candidates
  async createInterview(data, createdBy) {
    const roomId = 'interview_' + crypto.randomBytes(12).toString('hex');
    let hashedPassword = null;
    if (data.meetingPassword) {
      hashedPassword = await bcrypt.hash(data.meetingPassword, 10);
    }

    const interview = await Interview.create({
      title: data.title,
      description: data.description,
      interviewType: data.interviewType,
      createdBy,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes || 60,
      timezone: data.timezone || 'Asia/Kolkata',
      meetingPassword: hashedPassword,
      instructions: data.instructions,
      recordingEnabled: data.recordingEnabled || false,
      mobileCameraEnabled: data.mobileCameraEnabled || false,
      qrVerificationEnabled: data.qrVerificationEnabled || false,
      screenShareEnabled: data.screenShareEnabled !== false,
      whiteboardEnabled: data.whiteboardEnabled || false,
      chatEnabled: data.chatEnabled !== false,
      resumeViewerEnabled: data.resumeViewerEnabled !== false,
      notesEnabled: data.notesEnabled !== false,
      aiSummaryEnabled: data.aiSummaryEnabled || false,
      antiCopyEnabled: data.antiCopyEnabled || false,
      antiTabSwitchEnabled: data.antiTabSwitchEnabled || false,
      fullscreenModeEnabled: data.fullscreenModeEnabled || false,
      roomId,
      status: 'SCHEDULED',
    });

    // Assign trainers
    if (data.trainerIds && data.trainerIds.length > 0) {
      const trainerRecords = data.trainerIds.map((trainerId, idx) => ({
        interviewId: interview.id,
        trainerId,
        role: idx === 0 ? 'PRIMARY' : 'SECONDARY',
      }));
      await InterviewTrainer.bulkCreate(trainerRecords);
    }

    // Assign candidates
    if (data.participantIds && data.participantIds.length > 0) {
      const candidateRecords = data.participantIds.map(participantId => ({
        interviewId: interview.id,
        participantId,
        status: 'ASSIGNED',
      }));
      await InterviewCandidate.bulkCreate(candidateRecords);
    }

    // Create room
    await InterviewRoom.create({
      interviewId: interview.id,
      roomId,
      status: 'WAITING',
      maxParticipants: data.maxParticipants || 10,
    });

    // Log creation
    await this.logActivity(interview.id, createdBy, 'CREATED', { title: interview.title });

    // Create notifications
    await this.notifyTrainers(interview.id, 'INTERVIEW_SCHEDULED', `You have been assigned as interviewer for "${interview.title}"`);
    await this.notifyCandidates(interview.id, 'INVITATION_RECEIVED', `You have been invited to an interview: "${interview.title}"`);

    return interview;
  },

  // Get interview by ID with all relations
  async getInterviewById(id) {
    return Interview.findByPk(id, {
      include: [
        { model: InterviewCandidate, as: 'candidates', include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email', 'role'] }] },
        { model: InterviewTrainer, as: 'trainers', include: [{ model: User, as: 'trainer', attributes: ['id', 'name', 'email', 'role'] }] },
        { model: InterviewRoom, as: 'room' },
      ],
    });
  },

  // List interviews with filters
  async listInterviews(filters = {}) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.interviewType) where.interviewType = filters.interviewType;
    if (filters.createdBy) where.createdBy = filters.createdBy;
    if (filters.scheduledAfter) where.scheduledAt = { [Op.gte]: filters.scheduledAfter };
    if (filters.scheduledBefore) where.scheduledAt = { [Op.lte]: filters.scheduledBefore };

    return Interview.findAll({
      where,
      include: [
        { model: InterviewCandidate, as: 'candidates', include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }] },
        { model: InterviewTrainer, as: 'trainers', include: [{ model: User, as: 'trainer', attributes: ['id', 'name', 'email'] }] },
      ],
      order: [['scheduledAt', 'DESC']],
    });
  },

  // Get interviews for a specific participant
  async getParticipantInterviews(participantId) {
    return InterviewCandidate.findAll({
      where: { participantId },
      include: [{
        model: Interview, as: 'interview',
        include: [
          { model: InterviewTrainer, as: 'trainers', include: [{ model: User, as: 'trainer', attributes: ['id', 'name', 'email'] }] },
        ],
      }],
      order: [[{ model: Interview, as: 'interview' }, 'scheduledAt', 'DESC']],
    });
  },

  // Get interviews for a specific trainer
  async getTrainerInterviews(trainerId) {
    return InterviewTrainer.findAll({
      where: { trainerId },
      include: [{
        model: Interview, as: 'interview',
        include: [
          { model: InterviewCandidate, as: 'candidates', include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }] },
        ],
      }],
      order: [[{ model: Interview, as: 'interview' }, 'scheduledAt', 'DESC']],
    });
  },

  // Update interview
  async updateInterview(id, data) {
    const interview = await Interview.findByPk(id);
    if (!interview) throw new Error('Interview not found');
    await interview.update(data);
    return interview;
  },

  // Cancel interview
  async cancelInterview(id, userId) {
    const interview = await this.updateInterview(id, { status: 'CANCELLED' });
    await this.logActivity(id, userId, 'CANCELLED', {});
    await this.notifyCandidates(id, 'INTERVIEW_CANCELLED', `Interview "${interview.title}" has been cancelled`);
    return interview;
  },

  // Start interview (change status to LIVE)
  async startInterview(id, userId) {
    const interview = await this.updateInterview(id, { status: 'LIVE', startedAt: new Date() });
    const room = await InterviewRoom.findOne({ where: { interviewId: id } });
    if (room) await room.update({ status: 'ACTIVE', startedAt: new Date() });
    await this.logActivity(id, userId, 'INTERVIEWER_JOINED', {});
    return interview;
  },

  // End interview (change status to COMPLETED)
  async endInterview(id, userId) {
    const interview = await this.updateInterview(id, { status: 'COMPLETED', endedAt: new Date() });
    const room = await InterviewRoom.findOne({ where: { interviewId: id } });
    if (room) await room.update({ status: 'ENDED', endedAt: new Date() });
    await this.logActivity(id, userId, 'CANDIDATE_LEFT', {});
    return interview;
  },

  // Dashboard stats
  async getDashboardStats(userId, role) {
    let where = {};
    if (role === 'ADMIN') {
      where.createdBy = userId;
    }

    const total = await Interview.count({ where });
    const scheduled = await Interview.count({ where: { ...where, status: 'SCHEDULED' } });
    const live = await Interview.count({ where: { ...where, status: 'LIVE' } });
    const completed = await Interview.count({ where: { ...where, status: 'COMPLETED' } });
    const cancelled = await Interview.count({ where: { ...where, status: 'CANCELLED' } });

    return { total, scheduled, live, completed, cancelled };
  },

  // Verify meeting password
  async verifyPassword(interviewId, password) {
    const interview = await Interview.findByPk(interviewId);
    if (!interview) throw new Error('Interview not found');
    if (!interview.meetingPassword) return true;
    return bcrypt.compare(password, interview.meetingPassword);
  },

  // Generate QR token for verification
  async generateQRToken(interviewId, participantId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await InterviewDevice.create({
      interviewId,
      participantId,
      deviceToken: token,
      deviceInfo: { type: 'QR_VERIFY', generatedAt: new Date().toISOString() },
    });
    await this.logActivity(interviewId, participantId, 'QR_GENERATED', { token });
    return { token, expiresAt: expires };
  },

  // Verify QR token
  async verifyQRToken(interviewId, participantId, token) {
    const device = await InterviewDevice.findOne({
      where: { interviewId, participantId, deviceToken: token, isActive: true },
    });
    if (!device) throw new Error('Invalid QR token');
    await this.logActivity(interviewId, participantId, 'QR_VERIFIED', {});
    return true;
  },

  // Connect mobile device
  async connectMobileDevice(interviewId, participantId, deviceInfo) {
    const deviceToken = crypto.randomBytes(24).toString('hex');
    const device = await InterviewDevice.create({
      interviewId,
      participantId,
      deviceToken,
      deviceInfo,
      cameraStatus: 'CONNECTED',
      connectedAt: new Date(),
      isActive: true,
    });
    await this.logActivity(interviewId, participantId, 'MOBILE_CAMERA_CONNECTED', { deviceToken });
    return device;
  },

  // Update device status
  async updateDeviceStatus(deviceToken, status) {
    const device = await InterviewDevice.findOne({ where: { deviceToken } });
    if (device) {
      await device.update({ ...status });
    }
    return device;
  },

  // Log activity
  async logActivity(interviewId, userId, eventType, metadata) {
    return InterviewLog.create({ interviewId, userId, eventType, metadata });
  },

  // Create notification
  async createNotification(interviewId, userId, type, message) {
    const notification = await InterviewNotification.create({ interviewId, userId, type, message });
    return notification;
  },

  // Notify all trainers for an interview
  async notifyTrainers(interviewId, type, message) {
    const trainers = await InterviewTrainer.findAll({ where: { interviewId } });
    for (const trainer of trainers) {
      await this.createNotification(interviewId, trainer.trainerId, type, message);
    }
  },

  // Notify all candidates for an interview
  async notifyCandidates(interviewId, type, message) {
    const candidates = await InterviewCandidate.findAll({ where: { interviewId } });
    for (const candidate of candidates) {
      await this.createNotification(interviewId, candidate.participantId, type, message);
    }
  },

  // Get activity log for an interview
  async getActivityLog(interviewId) {
    return InterviewLog.findAll({
      where: { interviewId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });
  },

  // Record candidate join
  async recordJoin(interviewId, participantId) {
    const candidate = await InterviewCandidate.findOne({ where: { interviewId, participantId } });
    if (candidate) {
      await candidate.update({ status: 'JOINED', joinedAt: new Date() });
    }
    await this.logActivity(interviewId, participantId, 'CANDIDATE_JOINED', {});
  },

  // Record candidate leave
  async recordLeave(interviewId, participantId) {
    const candidate = await InterviewCandidate.findOne({ where: { interviewId, participantId } });
    if (candidate && candidate.joinedAt) {
      const durationSeconds = Math.round((Date.now() - new Date(candidate.joinedAt).getTime()) / 1000);
      await candidate.update({ status: 'COMPLETED', leftAt: new Date(), durationSeconds });
    }
    await this.logActivity(interviewId, participantId, 'CANDIDATE_LEFT', {});
  },
};

module.exports = interviewService;
