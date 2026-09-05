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
  MonitoringSession,
  sequelize,
} = require('../models');
const qrGenerator = require('../utils/assessmentQrGenerator');
const logger = require('../utils/logger');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const JWT_SECRET = process.env.JWT_SECRET || 'waveinit-assessment-verif-secret-key-2026';

class AssessmentVerificationService {
  async monitoringFor(session, options = {}) {
    return MonitoringSession.findOne({ ...options, where: {
      participantId: session.participant_id, contextType: session.assessment_type,
      contextId: session.assessment_id, attemptId: session.attempt_id,
    }, order: [['id', 'DESC']] });
  }

  async authorizeSocket({ sessionId, participantId, token = null, mobile = false }) {
    let session = await AssessmentVerificationSession.findOne({ where: {
      session_id: sessionId, participant_id: participantId, ...(mobile ? { token } : {}),
    } });
    // The attempt widget uses the canonical monitoring ID; resolve its exact
    // verification room rather than sending its offers to a different room.
    if (!session && !mobile) {
      const monitor = await MonitoringSession.findOne({ where: { sessionId, participantId } });
      if (monitor) session = await AssessmentVerificationSession.findOne({ where: {
        ...(monitor.metadata?.mobileAdmission?.verificationSessionId ? { session_id: monitor.metadata.mobileAdmission.verificationSessionId } : {}),
        participant_id: participantId, attempt_id: monitor.attemptId,
        assessment_id: monitor.contextId, assessment_type: monitor.contextType,
        status: { [Op.in]: ['PAIRED', 'VERIFIED', 'USED'] },
      }, order: [['created_at', 'DESC']] });
    }
    if (!session || session.status === 'EXPIRED' || (session.status !== 'USED' && new Date(session.expires_at) <= new Date())) throw new Error('Invalid or expired mobile pairing');
    const monitor = await this.monitoringFor(session);
    if (!monitor || ['COMPLETED', 'ABORTED'].includes(monitor.status)) throw new Error('Assessment is not active');
    return { session, monitor };
  }

  freshEvidence(session, monitor) {
    const evidence = monitor?.metadata?.mobileEvidence;
    return evidence?.verificationSessionId === session.session_id && evidence.pairingVersion === crypto.createHash("sha256").update(session.token).digest("hex") &&
      Date.now() - Number(evidence.receivedAt) <= 5000 ? evidence : null;
  }

  async assertAttemptAdmitted({ participantId, assessmentType, attemptId }) {
    const monitor = await MonitoringSession.findOne({ where: {
      participantId, contextType: assessmentType, attemptId,
    }, order: [['id', 'DESC']] });
    if (!monitor || (monitor.mobileEnabled && !monitor.metadata?.mobileAdmission)) {
      throw new Error('Complete mobile person and laptop verification before entering the assessment.');
    }
    return monitor;
  }

  async assertReconnectAllowed(session, monitor = null) {
    monitor = monitor || await this.monitoringFor(session);
    if (session.status !== 'USED' || !monitor || !['ACTIVE', 'PAUSED', 'READY', 'CALIBRATING'].includes(monitor.status) ||
        monitor.metadata?.mobileAdmission?.verificationSessionId !== session.session_id) {
      throw new Error('This assessment is not available for camera reconnection.');
    }
    const Attempt = session.assessment_type === 'CODING' ? CodingAttempt : QuizAttempt;
    const attempt = await Attempt.findOne({ where: { id: session.attempt_id, participantId: session.participant_id,
      [session.assessment_type === 'CODING' ? 'assessmentId' : 'quizId']: session.assessment_id, status: 'IN_PROGRESS' } });
    if (!attempt) throw new Error('This assessment attempt has ended.');
    return monitor;
  }

  async getReconnectQr({ sessionId, participantId }) {
    const { session, monitor } = await this.authorizeSocket({ sessionId, participantId });
    await this.assertReconnectAllowed(session, monitor);
    // Reuse the admitted room and credential. Never rotate admission, restart
    // the attempt, reset its timer, or clear accumulated monitoring scores.
    return { sessionId: session.session_id, status: session.status,
      qrPayload: qrGenerator.generatePairingPayload({ assessmentType: session.assessment_type,
        assessmentId: session.assessment_id, attemptId: session.attempt_id,
        participantId: session.participant_id, sessionId: session.session_id, token: session.token }) };
  }
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
  async createOrGetSession({ participantId, assessmentId, assessmentType, attemptId, transaction = null }) {
    if (!transaction) return sequelize.transaction(transaction => this.createOrGetSession({
      participantId, assessmentId, assessmentType, attemptId, transaction,
    }));
    const normType = assessmentType.toUpperCase();
    if (!['QUIZ', 'CODING'].includes(normType)) {
      throw new Error('Invalid assessment type. Must be QUIZ or CODING');
    }
    const Attempt = normType === 'CODING' ? CodingAttempt : QuizAttempt;
    const attempt = await Attempt.findOne({ transaction, lock: transaction.LOCK.UPDATE, where: { id: attemptId, participantId,
      [normType === 'CODING' ? 'assessmentId' : 'quizId']: assessmentId, status: 'IN_PROGRESS' } });
    if (!attempt) throw new Error('Active assessment attempt not found');

    const now = new Date();

    // Check for existing active session that hasn't expired or been used
    const existing = await AssessmentVerificationSession.findOne({
      transaction,
      where: {
        participant_id: participantId,
        assessment_id: assessmentId,
        assessment_type: normType,
        attempt_id: attemptId,
        status: { [Op.in]: ['PENDING', 'PAIRED', 'VERIFIED', 'USED'] },
        expires_at: { [Op.gt]: now },
      },
      // Prefer the already paired phone if an older server created duplicates.
      order: [[sequelize.literal("CASE WHEN status = 'USED' THEN 0 WHEN status IN ('PAIRED', 'VERIFIED') THEN 1 ELSE 2 END"), 'ASC'], ['created_at', 'DESC']],
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
    }, { transaction });

    const socketToken = this._issueSocketToken(session);
    await session.update({ socket_token: socketToken }, { transaction });

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
      try { await this.assertReconnectAllowed(session); }
      catch (error) { return { success: false, error: error.message }; }
    } else if (session.status === 'EXPIRED' || new Date() > new Date(session.expires_at)) {
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

    // A reconnect may happen after the original socket JWT's one-hour expiry.
    const socketToken = this._issueSocketToken(session);

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
      isAssessmentStarted: session.status === 'USED',
    };
  }

  /**
   * Record that mobile camera has connected and permission was granted.
   */
  async recordMobileCameraReady({ token, deviceInfo }) {
    const session = await AssessmentVerificationSession.findOne({ where: { token } });
    if (!session || session.status === 'EXPIRED' || (session.status !== 'USED' && new Date(session.expires_at) <= new Date())) {
      throw new Error('Invalid verification token');
    }

    await session.update({
      status: session.status === 'USED' ? 'USED' : 'PAIRED',
      mobile_device_info: deviceInfo ? JSON.stringify(deviceInfo) : session.mobile_device_info,
    });

    return {
      sessionId: session.session_id,
      status: session.status,
      mobileCameraReady: true,
      isFullyVerified: false,
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

    const isExpired = session.status !== 'USED' && new Date() > new Date(session.expires_at);
    if (isExpired && session.status !== 'USED') {
      await session.update({ status: 'EXPIRED' });
    }

    const evidence = this.freshEvidence(session, await this.monitoringFor(session));
    const isFullyVerified = !!evidence?.eligible && session.status !== 'EXPIRED';

    return {
      sessionId: session.session_id,
      token: session.token,
      status: session.status,
      mobileVerified: isFullyVerified,
      mobileCameraReady: !!session.mobile_device_info || !!evidence,
      mobileStreamActive: !!evidence,
      mobileEvidence: evidence,
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
    if (!participantId || !assessmentType || !assessmentId || !attemptId || (!sessionId && !token)) return { valid: false, error: 'Exact assessment and verification session are required.' };
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


    if (!session) {
      return {
        valid: false,
        error: 'Verification session not found. Please complete QR verification first.',
      };
    }

    if (session.status !== 'USED' && new Date() > new Date(session.expires_at)) {
      await session.update({ status: 'EXPIRED' });
      return {
        valid: false,
        error: 'Verification session has expired. Please re-verify before starting.',
      };
    }

    const admitted = await sequelize.transaction(async transaction => {
      const monitor = await this.monitoringFor(session, { transaction, lock: transaction.LOCK.UPDATE });
      if (!monitor || ['COMPLETED', 'ABORTED'].includes(monitor.status) || !this.freshEvidence(session, monitor)?.eligible) return false;
      await monitor.update({ metadata: { ...monitor.metadata, mobileAdmission: {
        verificationSessionId: session.session_id, admittedAt: new Date().toISOString(),
      } } }, { transaction });
      await session.update({ mobile_verified: true, status: 'USED' }, { transaction });
      return true;
    });
    if (!admitted) return { valid: false, error: 'Keep the mobile stream active with both person and laptop visible until verification completes.' };

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
  async endSession({ sessionId, token, participantId, attemptId, assessmentType } = {}) {
    if (!participantId || (!sessionId && !token && !(attemptId && assessmentType))) return { success: false };
    const where = { participant_id: participantId,
      ...(sessionId ? { session_id: sessionId } : token ? { token } : { attempt_id: attemptId, assessment_type: assessmentType }) };
    const sessions = await AssessmentVerificationSession.findAll({ where });
    const io = require('../config/socket').getIO();
    const closed = [];
    for (const session of sessions) {
      const Attempt = session.assessment_type === 'CODING' ? CodingAttempt : QuizAttempt;
      const attempt = await Attempt.findOne({ where: { id: session.attempt_id, participantId } });
      if (!attempt || attempt.status === 'IN_PROGRESS') continue;
      await session.update({ status: 'EXPIRED' });
      closed.push(session.session_id);
      io?.to(`assessment_verif_${session.session_id}`).emit('assessment_verif:session_ended', {
        sessionId: session.session_id, status: 'COMPLETED', reason: 'ASSESSMENT_COMPLETED',
      });
    }
    return { success: true, sessionId: closed[0] || null, status: closed.length ? 'COMPLETED' : 'IN_PROGRESS' };
  }

}

module.exports = new AssessmentVerificationService();
