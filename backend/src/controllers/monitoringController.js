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
        // A usable face frame is not the same thing as a calibrated iris
        // baseline. MediaPipe needs its full calibration window before live
        // eye-gaze classifications are trustworthy.
        calibrationPassed = !!valResult.passed && !!valResult.ready;
        calibrationDetails = valResult.metrics || {};
        failReason = valResult.reason;

        if (valResult.passed && !valResult.ready) {
          return res.status(202).json({
            success: true,
            data: {
              passed: true,
              ready: false,
              reason: valResult.reason,
              message: valResult.message,
              metrics: calibrationDetails,
            },
          });
        }

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

      return ok(res, {
        session,
        passed: true,
        ready: true,
        message: 'Calibration successful',
        metrics: calibrationDetails,
      });
    } catch (err) {
      logger.error(`[MonitoringController] recordCalibration error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/start-test
   * Lock monitoring start time to the exact second the participant starts answering questions.
   */
  async startTestTimer(req, res) {
    try {
      const sessionId = req.params.id;
      const { attemptId, testStartedAt, configuredDurationSeconds } = req.body;
      const session = await monitoringService.startTestSession({
        sessionId,
        attemptId,
        testStartedAt,
        configuredDurationSeconds,
      });
      return ok(res, { session, success: true, message: 'Test active timer locked' });
    } catch (err) {
      logger.error(`[MonitoringController] startTestTimer error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/pause-test
   * Pause active test timer and exclude break time.
   */
  async pauseTestTimer(req, res) {
    try {
      const sessionId = req.params.id;
      const { pausedAt, reason, activeDurationSeconds } = req.body;
      const session = await monitoringService.pauseTestSession({
        sessionId,
        pausedAt,
        reason,
        activeDurationSeconds,
      });
      return ok(res, { session, success: true, message: 'Test active timer paused' });
    } catch (err) {
      logger.error(`[MonitoringController] pauseTestTimer error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/resume-test
   * Resume active test timer from the current moment.
   */
  async resumeTestTimer(req, res) {
    try {
      const sessionId = req.params.id;
      const { resumedAt, reason } = req.body;
      const session = await monitoringService.resumeTestSession({
        sessionId,
        resumedAt,
        reason,
      });
      return ok(res, { session, success: true, message: 'Test active timer resumed' });
    } catch (err) {
      logger.error(`[MonitoringController] resumeTestTimer error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/sync-duration
   * Synchronize accumulated active test duration from client.
   */
  async syncTestDuration(req, res) {
    try {
      const sessionId = req.params.id;
      const { activeDurationSeconds, activeSegments } = req.body;
      const result = await monitoringService.syncTestDuration({
        sessionId,
        activeDurationSeconds,
        activeSegments,
      });
      return ok(res, result);
    } catch (err) {
      logger.error(`[MonitoringController] syncTestDuration error: ${err.message}`);
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

      // Frame analysis is intentionally detection-only. The browser's interval
      // state machine owns start/continue/end and posts one completed interval;
      // persisting here would turn every frame into a fabricated 1500ms event.

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

      // validateMobile owns remote-camera interval lifecycle and persists only
      // completed incidents; this endpoint must not create polling-duration rows.

      return ok(res, result);
    } catch (err) {
      logger.error(`[MonitoringController] validateMobile error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/video
   * Upload recorded proctoring webcam video file for a session.
   */
  async uploadVideo(req, res) {
    try {
      const sessionId = req.params.id;
      if (!req.file) {
        return fail(res, 400, 'No video file uploaded');
      }

      const relativeUrl = `/uploads/monitoring-videos/${req.file.filename}`;
      const fullPath = req.file.path;
      const attemptId = req.body?.attemptId;
      const participantId = req.body?.participantId || req.user?.id;

      const result = await monitoringService.saveSessionVideo({
        sessionId,
        attemptId,
        participantId,
        videoUrl: relativeUrl,
        filename: req.file.filename,
      });

      return ok(res, {
        message: 'Monitoring video uploaded successfully',
        videoUrl: relativeUrl,
        session: result,
      });
    } catch (err) {
      logger.error(`[MonitoringController] uploadVideo error: ${err.message}`);
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
        occurredAt = null,
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
        occurredAt,
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
   * Conclude monitoring session and persist final integrity flags and active duration.
   */
  async endSession(req, res) {
    try {
      const participantId = req.user?.id;
      const sessionId = req.params.id;
      const { actualTestDurationSeconds, activeSegments } = req.body || {};

      const report = await monitoringService.endSession({
        sessionId,
        participantId,
        actualTestDurationSeconds,
        activeSegments,
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
      const report = await monitoringService.getReport({ attemptId, contextType: req.query.contextType || 'QUIZ', contextId: req.query.contextId || null });
      return ok(res, report);
    } catch (err) {
      return fail(res, 404, err.message);
    }
  }
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

  /**
   * GET /api/monitoring/sessions/:id/excel
   * Download the official 2-sheet Excel report (Monitoring Report + Summary).
   */
  async downloadExcelReport(req, res) {
    try {
      const sessionId = req.params.id;
      const report = await monitoringService.getReport({ sessionId });
      if (!report) return fail(res, 404, 'Monitoring session report not found');

      const events = (report.timeline && report.timeline.length > 0) ? report.timeline : (report.events || []);
      const summaryMetrics = {
        participantId: report.participantId || report.participant?.id || report.session?.participantId || 'Candidate',
        participantName: report.participant?.name || report.session?.participantName || 'Participant',
        startTime: report.startedAt || report.session?.startedAt || null,
        endTime: report.endedAt || report.session?.endedAt || null,
        actualTestDuration: report.actualTestDurationSeconds ?? report.durationSeconds ?? 0,
        configuredDuration: report.configuredDurationSeconds ?? 0,
        testDuration: report.actualTestDurationSeconds ?? report.durationSeconds ?? 0,
        violationSeconds: report.eyeHeadViolationSeconds ?? report.uniqueViolationSeconds ?? 0,
        violationPercentage: report.violationPercentage ?? 0,
        monitoringScore: report.eyeHeadScore ?? report.scoringBreakdown?.eyeHead?.score ?? 0,
        multipleFaceCount: report.multipleFaceCount || (report.multiFaceScore > 0 ? 1 : 0),
        multipleFaceScore: report.multiFaceScore ?? report.scoringBreakdown?.multiPerson?.score ?? 0.0,
        noPersonDetected: Boolean(report.noPersonDetected || report.noPersonScore > 0),
        noPersonScore: report.noPersonScore ?? report.scoringBreakdown?.noPerson?.score ?? 0.0,
        mobileCount: report.phoneViolationCount || report.mobileCount || (report.mobileScore > 0 ? 1 : 0),
        mobileScore: report.mobileScore ?? report.scoringBreakdown?.mobile?.score ?? 0.0,
        tabSwitchCount: report.tabSwitchCount || 0,
        tabSwitchScore: report.tabSwitchScore ?? report.scoringBreakdown?.tabSwitch?.score ?? 0.0,
        finalScore: report.finalScore ?? report.score ?? 0,
        videoUrl: report.videoUrl ? (report.videoUrl.startsWith('http') ? report.videoUrl : `${req.protocol}://${req.get('host')}${report.videoUrl}`) : null,
      };

      const MonitoringExcelService = require('../services/monitoringExcelService');
      const buffer = await MonitoringExcelService.generateReportBuffer(events, summaryMetrics);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="monitoring_report_${sessionId}.xlsx"`);
      return res.send(buffer);
    } catch (err) {
      logger.error(`[MonitoringController] downloadExcelReport error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * GET /api/monitoring/reports/assessment/:contextId/excel
   * Export all participant test attempts and 5-part proctoring marks for a quiz/assessment to Excel.
   */
  async downloadAssessmentExcelReport(req, res) {
    try {
      const contextId = req.params.contextId;
      const contextType = (req.query.contextType || 'QUIZ').toUpperCase();
      const { QuizAttempt, CodingAttempt, CodingResult, AIQuiz, CodingAssessment, User } = require('../models');

      let assessmentTitle = 'Assessment';
      let configuredDuration = '—';
      let attempts = [];

      if (contextType === 'CODING') {
        const ca = await CodingAssessment.findByPk(contextId);
        if (ca) {
          assessmentTitle = ca.title;
          configuredDuration = ca.timeLimit ? `${ca.timeLimit} minutes` : '—';
        }
        attempts = await CodingAttempt.findAll({
          where: { assessmentId: contextId },
          include: [{ model: User, as: 'participant' }, { model: CodingResult, as: 'result', required: false }],
          order: [['id', 'DESC']]
        });
      } else {
        const quiz = await AIQuiz.findByPk(contextId);
        if (quiz) {
          assessmentTitle = quiz.title;
          configuredDuration = quiz.timeLimit ? `${quiz.timeLimit} minutes` : '—';
        }
        attempts = await QuizAttempt.findAll({
          where: { quizId: contextId },
          include: [{ model: User, as: 'participant' }],
          order: [['id', 'DESC']]
        });
      }

      // Populate each participant row with exact 5-component proctoring metrics
      const participants = await Promise.all(attempts.map(async (att) => {
        // Do not turn a failed report calculation into a clean zero-score row.
        const rep = await monitoringService.getReport({ attemptId: att.id, contextType, contextId });

        const userName = att.participant?.name || att.participantName || `Candidate #${att.id}`;
        const userEmail = att.participant?.email || '—';
        const quizScore = contextType === 'CODING' ? (att.result?.percentage ?? null) : (att.percentage ?? att.score ?? null);
        const durSec = rep?.actualTestDurationSeconds || att.timeTaken || (att.submittedAt && att.startedAt ? Math.round((new Date(att.submittedAt) - new Date(att.startedAt)) / 1000) : 0);

        return {
          id: att.id,
          attemptId: att.id,
          name: userName,
          email: userEmail,
          status: att.status,
          submittedAt: att.submittedAt || att.updatedAt,
          actualDurationSeconds: durSec,
          actualDuration: durSec > 0 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : '—',
          quizScore: quizScore,
          eyeHeadScore: rep?.eyeHeadScore ?? rep?.scoringBreakdown?.eyeHead?.score ?? 0.0,
          noPersonScore: rep?.noPersonScore ?? rep?.scoringBreakdown?.noPerson?.score ?? 0.0,
          multiFaceScore: rep?.multiFaceScore ?? rep?.scoringBreakdown?.multiPerson?.score ?? 0.0,
          tabSwitchScore: rep?.tabSwitchScore ?? rep?.scoringBreakdown?.tabSwitch?.score ?? 0.0,
          tabSwitchCount: rep?.tabSwitchCount || 0,
          mobileScore: rep?.mobileScore ?? rep?.scoringBreakdown?.mobile?.score ?? 0.0,
          mobileCount: rep?.phoneViolationCount || 0,
          finalScore: rep?.finalScore ?? rep?.score ?? 0.0,
          riskLevel: rep?.riskLevel || 'LOW',
          videoUrl: rep?.videoUrl ? `${req.protocol}://${req.get('host')}${rep.videoUrl}` : null,
        };
      }));

      const MonitoringExcelService = require('../services/monitoringExcelService');
      const buffer = await MonitoringExcelService.generateAssessmentParticipantsBuffer(participants, {
        title: assessmentTitle,
        configuredDuration,
      });

      const safeTitle = (assessmentTitle || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_Participant_Marks.xlsx"`);
      return res.send(buffer);
    } catch (err) {
      logger.error(`[MonitoringController] downloadAssessmentExcelReport error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/segments/register
   * Idempotently register a recorded-video segment (rotation start). The client
   * owns segmentSequence/startedAt; the backend confirms the canonical
   * segmentKey so zero-gap rotation can never collide.
   */
  async registerSegment(req, res) {
    try {
      const sessionId = req.params.id;
      const participantId = req.user?.id;
      const { segmentSequence = 1, startedAt, durationSec = 0 } = req.body || {};
      const videoService = require('../services/monitoringVideoService');
      const segment = await videoService.registerSegment({
        sessionId,
        participantId,
        segmentSequence: Math.max(1, Number(segmentSequence) || 1),
        startedAt,
        durationSec: Math.max(0, Number(durationSec) || 0),
      });
      return ok(res, { segment });
    } catch (err) {
      logger.error(`[MonitoringController] registerSegment error: ${err.message}`);
      return fail(res, 400, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/segments/:segmentKey/finalize
   * Mark a segment FINALIZING (rotate). Idempotent.
   */
  async finalizeSegment(req, res) {
    try {
      const sessionId = req.params.id;
      const segmentKey = req.params.segmentKey;
      const { endedAt, durationSec } = req.body || {};
      const videoService = require('../services/monitoringVideoService');
      const segment = await videoService.finalizeSegment({
        sessionId,
        segmentKey,
        endedAt,
        durationSec: Math.max(0, Number(durationSec) || 0),
      });
      if (!segment) return fail(res, 404, `Segment ${segmentKey} not found`);
      return ok(res, { segment });
    } catch (err) {
      logger.error(`[MonitoringController] finalizeSegment error: ${err.message}`);
      return fail(res, 400, err.message);
    }
  }

  /**
   * POST /api/monitoring/sessions/:id/segments/:segmentKey/video
   * Upload a segment recording. Idempotent by segmentKey + uploadKey; once the
   * segment is accepted it is queued for AI processing automatically.
   */
  async uploadSegment(req, res) {
    try {
      const sessionId = req.params.id;
      const segmentKey = req.params.segmentKey;
      if (!req.file) return fail(res, 400, 'No video file uploaded');

      const videoService = require('../services/monitoringVideoService');
      const result = await videoService.handleSegmentUpload({
        sessionId,
        segmentKey,
        filePath: req.file.path,
        uploadKey: req.body?.uploadKey || null,
        mimeType: req.file.mimetype || null,
        size: req.file.size || 0,
      });

      const io = req.app.get('io');
      const segment = result.segment;
      if (io && segment) {
        const payload = {
          sessionId,
          segmentKey,
          segmentSequence: segment.segmentSequence,
          status: segment.status,
          message: result.accepted ? 'Segment queued for AI processing' : `Segment already ${result.reason}`,
          timestamp: new Date().toISOString(),
        };
        io.to(`monitoring_${sessionId}`).emit('monitoring:segment-status', payload);
        if (segment.participantId) {
          io.to(`user_${segment.participantId}`).emit('monitoring:segment-status', payload);
        }
      }

      return ok(res, {
        message: result.accepted ? 'Segment uploaded and queued' : `Segment upload idempotent (${result.reason})`,
        accepted: result.accepted,
        segment,
      });
    } catch (err) {
      logger.error(`[MonitoringController] uploadSegment error: ${err.message}`);
      return fail(res, 500, err.message);
    }
  }

  /**
   * GET /api/monitoring/sessions/:id/segments
   * List all segments for a session with their pipeline status (used for
   * client-side crash recovery + trainer review).
   */
  async listSegments(req, res) {
    try {
      const sessionId = req.params.id;
      const videoService = require('../services/monitoringVideoService');
      const segments = await videoService.listSegments(sessionId);
      return ok(res, { segments });
    } catch (err) {
      return fail(res, 500, err.message);
    }
  }

  /**
   * GET /api/monitoring/sessions/:id/pipeline
   * Async monitoring pipeline snapshot: session monitoringStatus, segment
   * counts, and per-segment lifecycle states.
   */
  async getPipelineStatus(req, res) {
    try {
      const sessionId = req.params.id;
      const { MonitoringSession } = require('../models');
      const videoService = require('../services/monitoringVideoService');
      const session = await MonitoringSession.findOne({ where: { sessionId } });
      if (!session) return fail(res, 404, 'Monitoring session not found');
      const segments = await videoService.listSegments(sessionId);
      const jobs = await require('../models').ProcessingJob.findAll({
        where: { monitoringSessionId: sessionId },
        attributes: ['segmentKey', 'status', 'attempts', 'maxAttempts', 'lastError', 'updatedAt'],
      });
      return ok(res, {
        sessionId,
        monitoringStatus: session.monitoringStatus,
        monitoringFinalScore: session.monitoringFinalScore,
        monitoringCompletedAt: session.monitoringCompletedAt,
        totalSegments: session.totalSegments,
        completedSegments: session.completedSegments,
        failedSegments: session.failedSegments,
        segments: segments.map((s) => ({
          segmentKey: s.segmentKey,
          segmentSequence: s.segmentSequence,
          status: s.status,
          durationSec: s.durationSec,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          uploadedAt: s.uploadedAt,
          processedAt: s.processedAt,
          processingRetries: s.processingRetries,
          errorMessage: s.errorMessage,
          results: s.results,
        })),
        jobs: jobs.map((j) => ({
          segmentKey: j.segmentKey,
          status: j.status,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          lastError: j.lastError,
          updatedAt: j.updatedAt,
        })),
      });
    } catch (err) {
      return fail(res, 500, err.message);
    }
  }
}

module.exports = new MonitoringController();
