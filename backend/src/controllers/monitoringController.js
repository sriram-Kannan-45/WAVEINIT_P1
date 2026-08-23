/**
 * Monitoring Engine HTTP Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * REST endpoints for unified monitoring lifecycle, calibration, frame validation,
 * idempotent event ingestion, and trainer/admin reporting.
 */

const monitoringService = require('../services/monitoringService');
const logger = require('../utils/logger');

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

class MonitoringController {
  /**
   * POST /api/monitoring/sessions/start
   * Start or resume a monitoring session for Quiz, Coding, or Interview.
   */
  async startSession(req, res) {
    try {
      const participantId = req.user?.id;
      const { contextType = 'QUIZ', contextId, attemptId, mobileEnabled } = req.body;

      if (!participantId) return fail(res, 401, 'Unauthorized');

      const result = await monitoringService.startSession({
        participantId,
        contextType,
        contextId,
        attemptId,
        mobileEnabled: !!mobileEnabled,
      });

      return ok(res, {
        session: result.session,
        isResumed: result.isResumed,
      });
    } catch (err) {
      logger.error(`[MonitoringController] startSession error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/calibrate
   * Record pre-test calibration result (face, lighting, shoulders).
   */
  async recordCalibration(req, res) {
    try {
      const participantId = req.user?.id;
      const sessionId = req.params.id;
      const { passed, details, failureReason, frame } = req.body;

      let calibrationPassed = passed;
      let calibrationDetails = details || {};
      let failReason = failureReason;

      // If a frame was supplied, validate it via MediaPipe calibration engine
      if (frame) {
        const valResult = await monitoringService.validateCalibrationFrame({ sessionId, frame });
        calibrationPassed = !!valResult.passed;
        calibrationDetails = valResult.metrics || {};
        failReason = valResult.reason;

        if (!calibrationPassed) {
          await monitoringService.recordCalibration({
            sessionId,
            participantId,
            passed: false,
            details: calibrationDetails,
            failureReason: failReason,
          });
          return res.status(422).json({
            success: false,
            passed: false,
            reason: failReason,
            message: valResult.message,
            metrics: calibrationDetails,
          });
        }
      }

      const session = await monitoringService.recordCalibration({
        sessionId,
        participantId,
        passed: calibrationPassed,
        details: calibrationDetails,
        failureReason: failReason,
      });

      return ok(res, { session, passed: true, message: 'Calibration successful' });
    } catch (err) {
      logger.error(`[MonitoringController] recordCalibration error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/laptop/validate
   * Submit live laptop webcam frame for MediaPipe analysis.
   */
  async validateLaptop(req, res) {
    try {
      const participantId = req.user?.id;
      const sessionId = req.params.id;
      const { frame } = req.body;

      if (!frame) return fail(res, 400, 'Frame data is required');

      const result = await monitoringService.validateLaptop({
        sessionId,
        participantId,
        frame,
      });

      // If violations detected, record them to scoring engine
      if (result?.violations?.length > 0) {
        for (const v of result.violations) {
          await monitoringService.reportEvent({
            sessionId,
            participantId,
            source: 'LAPTOP',
            eventType: v.type,
            severity: v.severity,
            durationMs: 1500,
            confidence: 0.9,
            metadata: { detail: v.detail, head_pose: result.head_pose, gaze: result.gaze_classification },
          });
        }
      }

      return ok(res, result);
    } catch (err) {
      logger.error(`[MonitoringController] validateLaptop error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/mobile/pair
   * Request / Refresh dynamic single-use QR pairing token.
   */
  async getMobilePairingQR(req, res) {
    try {
      const participantId = req.user?.id;
      const sessionId = req.params.id;

      const result = await monitoringService.generateMobilePairingToken({
        sessionId,
        participantId,
      });

      return ok(res, result);
    } catch (err) {
      logger.error(`[MonitoringController] getMobilePairingQR error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/mobile/validate-pair
   * Scanned from mobile phone to consume single-use pairing token.
   */
  async pairMobileToken(req, res) {
    try {
      const sessionId = req.params.id;
      const { token, participantId } = req.body;

      if (!token) return fail(res, 400, 'Pairing token is required');

      const result = await monitoringService.pairMobile({
        sessionId,
        token,
        participantId,
      });

      return ok(res, result);
    } catch (err) {
      logger.warn(`[MonitoringController] pairMobileToken failed: ${err.message}`);
      return fail(res, 400, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/mobile/validate
   * Submit live mobile camera frame for YOLO11s side-view composition analysis.
   */
  async validateMobile(req, res) {
    try {
      const sessionId = req.params.id;
      const { frame, participantId, confidenceThreshold } = req.body;

      if (!frame) return fail(res, 400, 'Frame data is required');

      const result = await monitoringService.validateMobile({
        sessionId,
        participantId: participantId || req.user?.id,
        frame,
        confidenceThreshold: confidenceThreshold || 0.35,
      });

      // If high/warning severity event, record to scoring engine
      if (result?.proctoring_event && ['WARNING', 'VIOLATION'].includes(result.composition_state)) {
        await monitoringService.reportEvent({
          sessionId,
          participantId: participantId || req.user?.id,
          source: 'MOBILE',
          eventType: result.proctoring_event.eventType,
          severity: result.proctoring_event.severity,
          durationMs: 1500,
          confidence: result.proctoring_event.confidence,
          metadata: { composition_state: result.composition_state, user_message: result.user_message },
        });
      }

      return ok(res, result);
    } catch (err) {
      logger.error(`[MonitoringController] validateMobile error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/events
   * Authoritative idempotent proctoring event ingestion endpoint.
   */
  async recordEvent(req, res) {
    try {
      const participantId = req.user?.id;
      const sessionId = req.params.id;
      const {
        source = 'LAPTOP',
        eventType,
        severity = 'INFO',
        durationMs = 0,
        confidence = 1.0,
        evidenceRef = null,
        metadata = {},
        idempotencyKey = null,
      } = req.body;

      if (!eventType) return fail(res, 400, 'eventType is required');

      const result = await monitoringService.reportEvent({
        sessionId,
        participantId,
        source,
        eventType,
        severity,
        durationMs,
        confidence,
        evidenceRef,
        metadata,
        idempotencyKey,
      });

      // Broadcast event update via Socket.IO if available
      const io = req.app.get('io');
      if (io && result.event) {
        if (result.isGraceWarning) {
          const gracePayload = {
            sessionId,
            warningNumber: result.warningNumber,
            maxWarnings: result.maxWarnings || 3,
            eventType: result.event?.eventType || eventType,
            severity: result.event?.severity || severity,
            source: result.event?.source || source,
            message: result.warningMessage || `${(eventType || '').replace(/_/g, ' ')} detected`,
            timestamp: new Date().toISOString(),
          };
          io.to(`proctor_session_${sessionId}`).emit('monitoring:grace_warning', gracePayload);
          io.to(`monitoring_room_${sessionId}`).emit('monitoring:grace_warning', gracePayload);
          io.to(`assessment_verif_${sessionId}`).emit('monitoring:grace_warning', gracePayload);
        }
        io.to(`proctor_session_${sessionId}`).emit('monitoring:event', result);
        io.to(`monitoring_room_${sessionId}`).emit('monitoring:event', result);
      }

      return ok(res, result);
    } catch (err) {
      logger.error(`[MonitoringController] recordEvent error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * GET /api/monitoring/sessions/:id/status
   * Live status snapshot of laptop, mobile, score, and watchdog flags.
   */
  async getStatus(req, res) {
    try {
      const sessionId = req.params.id;
      const status = await monitoringService.getStatus(sessionId);
      return ok(res, status);
    } catch (err) {
      return fail(res, 404, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/end
   * Conclude monitoring session and persist final integrity flags.
   */
  async endSession(req, res) {
    try {
      const participantId = req.user?.id;
      const sessionId = req.params.id;

      const report = await monitoringService.endSession({
        sessionId,
        participantId,
      });

      return ok(res, report);
    } catch (err) {
      logger.error(`[MonitoringController] endSession error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * GET /api/monitoring/sessions/:id/report
   * Full detailed proctoring report for a single session.
   */
  async getReport(req, res) {
    try {
      const sessionId = req.params.id;
      const report = await monitoringService.getReport({ sessionId });
      return ok(res, report);
    } catch (err) {
      return fail(res, 404, err.message);
    }
  }

  /**
   * GET /api/monitoring/reports/attempt/:attemptId
   * Fetch report by attemptId.
   */
  async getAttemptReport(req, res) {
    try {
      const attemptId = req.params.attemptId;
      const report = await monitoringService.getReport({ attemptId });
      return ok(res, report);
    } catch (err) {
      return fail(res, 404, err.message);
    }
  }

  /**
   * GET /api/monitoring/reports
   * Admin / Trainer filterable monitoring sessions view.
   */
  async getReportsList(req, res) {
    try {
      const { contextType, contextId, participantId, riskLevel, limit, offset } = req.query;
      const data = await monitoringService.getReportsList({
        contextType,
        contextId,
        participantId,
        riskLevel,
        limit,
        offset,
      });
      return ok(res, data);
    } catch (err) {
      return fail(res, 500, err.message);
    }
  }

  /**
   * GET /api/monitoring/config
   * Fetch monitoring config for a module context or global defaults.
   */
  async getConfig(req, res) {
    try {
      const { contextType } = req.query;
      const config = await monitoringService.getConfig(contextType);
      return ok(res, config);
    } catch (err) {
      return fail(res, 500, err.message);
    }
  }

  /**
   * PUT /api/monitoring/config
   * Update monitoring thresholds/weights (Admin/Trainer only).
   */
  async updateConfig(req, res) {
    try {
      const userRole = req.user?.role;
      if (!['ADMIN', 'TRAINER'].includes(userRole)) {
        return fail(res, 403, 'Only admins and trainers can modify monitoring configurations');
      }

      const { key, contextType, value } = req.body;
      const updated = await monitoringService.updateConfig({
        key,
        contextType,
        value,
        updatedBy: req.user?.id,
      });
      return ok(res, updated);
    } catch (err) {
      return fail(res, 500, err.message);
    }
  }
}

module.exports = new MonitoringController();
