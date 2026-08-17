/**
 * Assessment Verification Controller
 * Endpoints for initiating QR verification sessions, mobile pairing validation,
 * status polling, and pre-start verification checks.
 */
const verificationService = require('../services/assessmentVerificationService');
const { getIO } = require('../config/socket');
const logger = require('../utils/logger');

class AssessmentVerificationController {
  /**
   * POST /api/assessment-verification/initiate
   * Laptop initiates or restores a verification session for a Quiz or Coding attempt.
   */
  async initiateVerification(req, res) {
    try {
      const participantId = req.user?.id;
      const { assessmentId, assessmentType, attemptId } = req.body;

      if (!assessmentId || !assessmentType || !attemptId) {
        return res.status(400).json({
          error: 'assessmentId, assessmentType (QUIZ or CODING), and attemptId are required',
        });
      }

      const result = await verificationService.createOrGetSession({
        participantId,
        assessmentId: parseInt(assessmentId, 10),
        assessmentType,
        attemptId: parseInt(attemptId, 10),
      });

      return res.json({
        success: true,
        sessionId: result.session.session_id,
        token: result.session.token,
        qrPayload: result.qrPayload,
        status: result.status,
        expiresAt: result.expiresAt,
        laptopVerified: result.session.laptop_verified,
        mobileVerified: result.session.mobile_verified,
      });
    } catch (error) {
      logger.error('Error initiating assessment verification', { error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to initiate verification' });
    }
  }

  /**
   * POST /api/assessment-verification/refresh
   * Laptop refreshes an expired QR code.
   */
  async refreshQr(req, res) {
    try {
      const participantId = req.user?.id;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const result = await verificationService.refreshSession({ sessionId, participantId });

      return res.json({
        success: true,
        sessionId: result.session.session_id,
        token: result.session.token,
        qrPayload: result.qrPayload,
        status: result.status,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Error refreshing assessment QR', { error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to refresh QR code' });
    }
  }

  /**
   * GET /api/assessment-verification/status/:sessionId
   * Laptop polls verification status.
   */
  async getStatus(req, res) {
    try {
      const participantId = req.user?.id;
      const { sessionId } = req.params;

      const status = await verificationService.getSessionStatus({ sessionId, participantId });

      // If session expired, broadcast via socket for real-time update
      if (status.isExpired) {
        const io = getIO();
        if (io && sessionId) {
          io.to(`assessment_verif_${sessionId}`).emit('assessment_verif:session_expired', {
            sessionId,
            status: 'EXPIRED',
            timestamp: Date.now(),
          });
        }
      }

      return res.json({ success: true, ...status });
    } catch (error) {
      logger.error('Error getting assessment verification status', { error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to get verification status' });
    }
  }

  /**
   * POST /api/assessment-verification/mobile-validate
   * Public endpoint called when mobile device scans the QR code.
   */
  async validateMobileToken(req, res) {
    try {
      const { token } = req.body;
      const result = await verificationService.validatePairingToken(token);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Broadcast mobile scan & pairing event immediately to laptop peer
      const io = getIO();
      if (io && result.sessionId) {
        io.to(`assessment_verif_${result.sessionId}`).emit('assessment_verif:mobile_joined', {
          sessionId: result.sessionId,
          status: 'PAIRED',
          timestamp: Date.now(),
        });
      }

      return res.json(result);
    } catch (error) {
      logger.error('Error validating mobile assessment token', { error: error.message });
      return res.status(500).json({ error: 'Failed to validate QR token' });
    }
  }

  /**
   * POST /api/assessment-verification/mobile-connected
   * Public endpoint called when mobile camera stream is live and confirmed.
   */
  async mobileCameraConnected(req, res) {
    try {
      const { token, deviceInfo } = req.body;
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      const result = await verificationService.recordMobileCameraReady({ token, deviceInfo });
      const io = getIO();
      if (io && result.sessionId) {
        // Tell the laptop mobile camera permission was granted — do NOT claim connected or unlocked yet
        io.to(`assessment_verif_${result.sessionId}`).emit('assessment_verif:mobile_status', {
          sessionId: result.sessionId,
          connected: false,
          mobileReady: true,
          timestamp: Date.now(),
        });
      }
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error recording mobile camera connection', { error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to record mobile camera status' });
    }
  }

  /**
   * POST /api/assessment-verification/laptop-connected
   * Laptop confirms its camera/calibration is ready.
   */
  async laptopCameraConnected(req, res) {
    try {
      const participantId = req.user?.id;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const result = await verificationService.recordLaptopCameraReady({ sessionId, participantId });
      const io = getIO();
      if (io && sessionId) {
        io.to(`assessment_verif_${sessionId}`).emit('assessment_verif:laptop_status', {
          sessionId,
          connected: true,
          laptopVerified: true,
          isFullyVerified: result.isFullyVerified,
          timestamp: Date.now(),
        });
        if (result.isFullyVerified) {
          io.to(`assessment_verif_${sessionId}`).emit('assessment_verif:unlocked', {
            sessionId,
            status: 'VERIFIED',
            timestamp: Date.now(),
          });
        }
      }
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error recording laptop camera connection', { error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to record laptop camera status' });
    }
  }

  /**
   * POST /api/assessment-verification/verify-start
   * Backend validation check before starting quiz or coding assessment.
   */
  async verifyAndStart(req, res) {
    try {
      const participantId = req.user?.id;
      const { assessmentType, assessmentId, attemptId, sessionId, token } = req.body;

      const result = await verificationService.verifySessionForStart({
        participantId,
        assessmentType,
        assessmentId: parseInt(assessmentId, 10),
        attemptId: parseInt(attemptId, 10),
        sessionId,
        token,
      });

      if (!result.valid) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, message: 'Verification valid. Assessment unlocked.', data: result });
    } catch (error) {
      logger.error('Error verifying assessment start', { error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to verify assessment' });
    }
  }
}

module.exports = new AssessmentVerificationController();
