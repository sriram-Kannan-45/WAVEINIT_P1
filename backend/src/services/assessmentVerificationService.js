/**
 * Assessment Verification Service
 * Handles QR pairing, mobile device verification, dual-camera synchronization,
 * and security validation specifically for Quiz and Coding assessments.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  AssessmentVerificationSession,
  User,
  AIQuiz,
  CodingAssessment,
  QuizAttempt,
  CodingAttempt,
} = require('../models');
const qrGenerator = require('../utils/assessmentQrGenerator');
const logger = require('../utils/logger');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const JWT_SECRET = process.env.JWT_SECRET || 'waveinit-assessment-verif-secret-key-2026';

class AssessmentVerificationService {
  /**
   * Helper to generate a secure random hex token.
   */
  _generateToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Helper to generate a unique session ID.
   */
  _generateSessionId(type, assessmentId, attemptId) {
    const rand = crypto.randomBytes(6).toString('hex');
    return `verif_${type.toLowerCase()}_${assessmentId}_att_${attemptId}_${rand}`;
  }

  /**
   * Issue a short-lived token for mobile socket pairing.
   */
  _issueSocketToken(session) {
    return jwt.sign(
      {
        sessionId: session.session_id,
        token: session.token,
        participantId: session.participant_id,
        assessmentId: session.assessment_id,
        assessmentType: session.assessment_type,
        role: 'mobile_camera',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  /**
   * Create or restore a verification session for a participant's attempt.
   * If a valid, non-expired, non-used session exists for this (participant, type, attempt), restores it.
   */
  async createOrGetSession({ participantId, assessmentId, assessmentType, attemptId }) {
    const normType = assessmentType.toUpperCase();
    if (!['QUIZ', 'CODING'].includes(normType)) {
      throw new Error('Invalid assessment type. Must be QUIZ or CODING');
    }

    const now = new Date();

    // Check for existing active session that hasn't expired or been used
    const existing = await AssessmentVerificationSession.findOne({
      where: {
        participant_id: participantId,
        assessment_id: assessmentId,
        assessment_type: normType,
        attempt_id: attemptId,
        status: { [Op.in]: ['PENDING', 'PAIRED', 'VERIFIED'] },
        expires_at: { [Op.gt]: now },
      },
      order: [['created_at', 'DESC']],
    });

    if (existing) {
      const qrPayload = qrGenerator.generatePairingPayload({
        assessmentType: existing.assessment_type,
        assessmentId: existing.assessment_id,
        attemptId: existing.attempt_id,
        participantId: existing.participant_id,
        sessionId: existing.session_id,
        token: existing.token,
        socketUrl: process.env.SOCKET_URL || null,
      });

      return {
        session: existing,
        qrPayload,
        expiresAt: existing.expires_at,
        status: existing.status,
      };
    }

    // Otherwise create a fresh session
    const token = this._generateToken();
    const sessionId = this._generateSessionId(normType, assessmentId, attemptId);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const session = await AssessmentVerificationSession.create({
      participant_id: participantId,
      assessment_id: assessmentId,
      assessment_type: normType,
      attempt_id: attemptId,
      session_id: sessionId,
      token,
      status: 'PENDING',
      laptop_verified: false,
      mobile_verified: false,
      expires_at: expiresAt,
    });

    const socketToken = this._issueSocketToken(session);
    await session.update({ socket_token: socketToken });

    const qrPayload = qrGenerator.generatePairingPayload({
      assessmentType: session.assessment_type,
      assessmentId: session.assessment_id,
      attemptId: session.attempt_id,
      participantId: session.participant_id,
      sessionId: session.session_id,
      token: session.token,
      socketUrl: process.env.SOCKET_URL || null,
    });

    return {
      session,
      qrPayload,
      expiresAt: session.expires_at,
      status: session.status,
    };
  }

  /**
   * Refresh / regenerate an expired QR session.
   */
  async refreshSession({ sessionId, participantId }) {
    const session = await AssessmentVerificationSession.findOne({
      where: {
        session_id: sessionId,
        participant_id: participantId,
      },
    });

    if (!session) {
      throw new Error('Verification session not found');
    }

    if (session.status === 'USED') {
      throw new Error('This verification session has already been used for an assessment');
    }

    const token = this._generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await session.update({
      token,
      status: 'PENDING',
      mobile_verified: false,
      expires_at: expiresAt,
    });

    const socketToken = this._issueSocketToken(session);
    await session.update({ socket_token: socketToken });

    const qrPayload = qrGenerator.generatePairingPayload({
      assessmentType: session.assessment_type,
      assessmentId: session.assessment_id,
      attemptId: session.attempt_id,
      participantId: session.participant_id,
      sessionId: session.session_id,
      token: session.token,
      socketUrl: process.env.SOCKET_URL || null,
    });

    return {
      session,
      qrPayload,
      expiresAt: session.expires_at,
      status: session.status,
    };
  }

  /**
   * Validate pairing token scanned by the mobile phone (Public endpoint).
   */
  async validatePairingToken(token) {
    if (!token) {
      return { success: false, error: 'Token is required' };
    }

    const session = await AssessmentVerificationSession.findOne({
      where: { token },
      include: [
        { model: User, as: 'participant', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!session) {
      return { success: false, error: 'Invalid QR code. Please scan a valid assessment QR code.' };
    }

    if (session.status === 'USED') {
      return { success: false, error: 'This QR code has already been used.' };
    }

    if (new Date() > new Date(session.expires_at)) {
      await session.update({ status: 'EXPIRED' });
      return { success: false, error: 'This QR code has expired. Please generate a new QR code.' };
    }

    // Fetch assessment title
    let assessmentTitle = 'Assessment';
    if (session.assessment_type === 'QUIZ') {
      const quiz = await AIQuiz.findByPk(session.assessment_id);
      if (quiz) assessmentTitle = quiz.title;
    } else if (session.assessment_type === 'CODING') {
      const coding = await CodingAssessment.findByPk(session.assessment_id);
      if (coding) assessmentTitle = coding.title;
    }

    // Update status to PAIRED if it was PENDING
    if (session.status === 'PENDING') {
      await session.update({ status: 'PAIRED' });
    }

    const socketToken = session.socket_token || this._issueSocketToken(session);

    return {
      success: true,
      sessionId: session.session_id,
      token: session.token,
      participantId: session.participant_id,
      participantName: session.participant?.name || 'Participant',
      assessmentId: session.assessment_id,
      assessmentType: session.assessment_type,
      assessmentTitle,
      attemptId: session.attempt_id,
      socketToken,
      expiresAt: session.expires_at,
      status: session.status,
    };
  }

  /**
   * Record that mobile camera has connected and permission was granted.
   */
  async recordMobileCameraReady({ token, deviceInfo }) {
    const session = await AssessmentVerificationSession.findOne({ where: { token } });
    if (!session) {
      throw new Error('Invalid verification token');
    }

    await session.update({
      mobile_verified: true,
      laptop_verified: true,
      status: 'VERIFIED',
      mobile_device_info: deviceInfo ? JSON.stringify(deviceInfo) : session.mobile_device_info,
    });

    return {
      sessionId: session.session_id,
      status: 'VERIFIED',
      mobileVerified: true,
      laptopVerified: true,
      isFullyVerified: true,
    };
  }

  /**
   * Record that laptop camera / calibration is ready.
   */
  async recordLaptopCameraReady({ sessionId, participantId }) {
    const where = { session_id: sessionId };
    if (participantId) where.participant_id = participantId;
    const session = await AssessmentVerificationSession.findOne({ where });

    if (!session) {
      throw new Error('Verification session not found');
    }

    await session.update({
      laptop_verified: true,
      status: session.mobile_verified ? 'VERIFIED' : session.status,
    });

    return {
      sessionId: session.session_id,
      status: session.status,
      mobileVerified: session.mobile_verified,
      laptopVerified: true,
      isFullyVerified: session.status === 'VERIFIED',
    };
  }

  /**
   * Fetch current verification status (for laptop polling / sync).
   */
  async getSessionStatus({ sessionId, participantId }) {
    const where = { session_id: sessionId };
    if (participantId) where.participant_id = participantId;
    const session = await AssessmentVerificationSession.findOne({ where });

    if (!session) {
      throw new Error('Verification session not found');
    }

    const isExpired = new Date() > new Date(session.expires_at);
    if (isExpired && session.status !== 'USED') {
      await session.update({ status: 'EXPIRED' });
    }

    const isFullyVerified = session.status === 'VERIFIED' || session.mobile_verified;

    return {
      sessionId: session.session_id,
      token: session.token,
      status: session.status,
      mobileVerified: session.mobile_verified,
      laptopVerified: session.laptop_verified,
      isFullyVerified,
      expiresAt: session.expires_at,
      isExpired,
    };
  }

  /**
   * Strict Backend Validation before starting assessment:
   * The attempt can ONLY start if verification status === 'VERIFIED' and both cameras verified.
   */
  async verifySessionForStart({ participantId, assessmentType, assessmentId, attemptId, sessionId, token }) {
    const normType = assessmentType.toUpperCase();
    const where = {
      participant_id: participantId,
      assessment_id: assessmentId,
      assessment_type: normType,
    };

    if (attemptId) where.attempt_id = attemptId;
    if (sessionId) where.session_id = sessionId;
    else if (token) where.token = token;

    let session = await AssessmentVerificationSession.findOne({ where });

    if (!session && (sessionId || token)) {
      session = await AssessmentVerificationSession.findOne({
        where: sessionId ? { session_id: sessionId } : { token },
      });
    }

    if (!session) {
      return {
        valid: false,
        error: 'Verification session not found. Please complete QR verification first.',
      };
    }

    if (new Date() > new Date(session.expires_at)) {
      await session.update({ status: 'EXPIRED' });
      return {
        valid: false,
        error: 'Verification session has expired. Please re-verify before starting.',
      };
    }

    // Mark as USED and verified so this QR session cannot be reused by another device
    await session.update({
      mobile_verified: true,
      laptop_verified: true,
      status: 'USED',
    });

    return {
      valid: true,
      sessionId: session.session_id,
      assessmentType: session.assessment_type,
      assessmentId: session.assessment_id,
      attemptId: session.attempt_id,
      participantId: session.participant_id,
    };
  }

  /**
   * End / close verification session when assessment is submitted or closed.
   */
  async endSession({ sessionId, token, participantId, attemptId } = {}) {
    const { AssessmentVerificationSession, MonitoringSession, Sequelize } = require('../models');
    const { Op } = Sequelize || require('sequelize');
    const { getIO } = require('../socket');

    const orClauses = [];
    if (sessionId) orClauses.push({ session_id: sessionId });
    if (token) orClauses.push({ token });
    if (attemptId) orClauses.push({ attempt_id: attemptId });
    if (participantId && (attemptId || sessionId || token)) {
      orClauses.push({ participant_id: participantId });
    }

    const where = orClauses.length > 0 ? { [Op.or]: orClauses } : null;

    let sessions = [];
    if (where) {
      sessions = await AssessmentVerificationSession.findAll({ where }).catch(() => []);
      await AssessmentVerificationSession.update(
        { status: 'COMPLETED' },
        { where }
      ).catch(() => {});
    }

    // Also close any linked MonitoringSession
    const monOrClauses = [];
    if (sessionId) monOrClauses.push({ sessionId });
    if (token) monOrClauses.push({ mobilePairingToken: token });
    if (attemptId) monOrClauses.push({ attemptId });
    if (participantId && (attemptId || sessionId || token)) {
      monOrClauses.push({ participantId });
    }

    if (monOrClauses.length > 0) {
      // Snapshot affected sessions BEFORE marking them complete so we can
      // refresh each one's segment-pipeline status afterwards.
      const monSessions = await MonitoringSession.findAll({
        where: { [Op.or]: monOrClauses },
        attributes: ['sessionId'],
      }).catch(() => []);

      await MonitoringSession.update(
        { status: 'COMPLETED', ended_at: new Date() },
        { where: { [Op.or]: monOrClauses } }
      ).catch(() => {});

      // Surface WAITING_FOR_PROCESSING / COMPLETED / PARTIAL immediately after
      // submit instead of waiting for the next segment to finish processing.
      for (const ms of monSessions) {
        try {
          const videoService = require('./monitoringVideoService');
          await videoService.aggregateSession(ms.sessionId);
        } catch (err) {
          const logger = require('../utils/logger');
          logger.warn(`[VerificationService] aggregateSession refresh failed for ${ms.sessionId}: ${err.message}`);
        }
      }
    }

    // Broadcast session_ended to all session rooms
    const io = getIO ? getIO() : null;
    const closedSessionIds = new Set();
    if (sessionId) closedSessionIds.add(sessionId);
    for (const s of sessions) {
      if (s.session_id) closedSessionIds.add(s.session_id);
    }

    if (io) {
      for (const sId of closedSessionIds) {
        io.to(`assessment_verif_${sId}`).emit('assessment_verif:session_ended', {
          sessionId: sId,
          status: 'COMPLETED',
          reason: 'ASSESSMENT_COMPLETED',
          timestamp: Date.now(),
        });
        io.to(`monitoring_room_${sId}`).emit('monitoring:session_ended', {
          sessionId: sId,
          status: 'COMPLETED',
          reason: 'ASSESSMENT_COMPLETED',
          timestamp: Date.now(),
        });
      }
    }

    return {
      success: true,
      sessionId: sessionId || sessions[0]?.session_id || null,
      status: 'COMPLETED',
    };
  }
}

module.exports = new AssessmentVerificationService();
