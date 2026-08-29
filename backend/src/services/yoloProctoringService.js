/**
 * YOLO Proctoring Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend coordinator for the shared YOLOv8 proctoring engine.
 * Handles server-side validation, AI microservice inference calls,
 * event throttling/deduplication, database persistence, and Socket.IO emission.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { ProctoringEvent, InterviewAlert, InterviewLog, ExamSession } = require('../models');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// In-memory throttling cache: key -> { lastEventType, lastSavedAt, count }
const throttledEvents = new Map();

class YOLOProctoringService {
  /**
   * Validate session and user metadata before processing camera frames.
   */
  validatePayload({ sessionId, participantId, moduleType, cameraSource }) {
    if (!sessionId) throw new Error('sessionId is required for proctoring monitoring');
    if (!participantId) throw new Error('participantId is required for proctoring monitoring');
    
    const validModules = ['QUIZ', 'CODING', 'INTERVIEW'];
    const validCameras = ['PC_CAMERA', 'MOBILE_CAMERA'];

    const normalizedModule = String(moduleType || 'QUIZ').toUpperCase();
    const normalizedCamera = String(cameraSource || 'PC_CAMERA').toUpperCase();

    if (!validModules.includes(normalizedModule)) {
      throw new Error(`Invalid moduleType: ${moduleType}. Must be one of ${validModules.join(', ')}`);
    }
    if (!validCameras.includes(normalizedCamera)) {
      throw new Error(`Invalid cameraSource: ${cameraSource}. Must be one of ${validCameras.join(', ')}`);
    }

    return {
      sessionId: String(sessionId),
      participantId: Number(participantId) || participantId,
      moduleType: normalizedModule,
      cameraSource: normalizedCamera,
    };
  }

  /**
   * Submit camera frame to Python AI service for YOLOv8 inference.
   */
  async analyzeFrame({ frame, sessionId, participantId, moduleType, cameraSource, confidenceThreshold = 0.35 }) {
    const validated = this.validatePayload({ sessionId, participantId, moduleType, cameraSource });

    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/api/proctoring/yolo/analyze-frame`,
        {
          frame,
          sessionId: validated.sessionId,
          participantId: validated.participantId,
          moduleType: validated.moduleType,
          cameraSource: validated.cameraSource,
          confidenceThreshold,
          timestampMs: Date.now(),
        },
        {
          timeout: 4000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = response.data;
      if (!data?.success) {
        throw new Error(data?.error || 'YOLO inference failed');
      }

      const event = data.proctoring_event;
      await this.processAndPersistEvent(event, data.detections);

      return {
        success: true,
        proctoring_event: event,
        detections: data.detections,
        inferenceTimeMs: data.inference_time_ms,
      };
    } catch (err) {
      logger.warn(`[YOLOProctoringService] Analysis error: ${err.message}`);
      return {
        success: false,
        error: err.response?.data?.detail || err.message,
      };
    }
  }

  /**
   * Event throttling & persistence to database.
   */
  async processAndPersistEvent(event, detections = []) {
    if (!event) return;

    const {
      sessionId,
      participantId,
      moduleType,
      cameraSource,
      eventType,
      severity,
      confidence,
      timestamp,
      detectedClasses,
    } = event;

    const throttleKey = `${sessionId}_${cameraSource}_${eventType}`;
    const now = Date.now();
    const lastRecord = throttledEvents.get(throttleKey);

    // Save only when state changes or after 10s cooldown for repetitive violations (avoid DB flooding)
    const isNewEvent = !lastRecord || (now - lastRecord.lastSavedAt > 10000);
    if (!isNewEvent && severity === 'INFO') {
      return; // Skip repeated INFO events (e.g. continuous PERSON_DETECTED)
    }

    throttledEvents.set(throttleKey, {
      lastEventType: eventType,
      lastSavedAt: now,
      count: (lastRecord?.count || 0) + 1,
    });

    try {
      if (moduleType === 'INTERVIEW') {
        // Save to InterviewAlert
        await InterviewAlert.create({
          session_id: sessionId,
          alert_type: eventType,
          severity: severity || 'LOW',
          source_device: cameraSource === 'MOBILE_CAMERA' ? 'MOBILE' : 'LAPTOP',
          message: `YOLO Detector (${cameraSource}): ${eventType} (${(confidence * 100).toFixed(0)}%)`,
          metadata: {
            detectedClasses,
            detectionsCount: detections.length,
            cameraSource,
            confidence,
          },
          ts: timestamp ? new Date(timestamp) : new Date(),
        });
      } else {
        // Resolve attemptId if missing
        let resolvedAttemptId = event.attemptId;
        let session = null;
        try {
          const monitoringService = require('./monitoringService');
          session = await monitoringService.getSession(sessionId);
          if (session && !resolvedAttemptId) {
            resolvedAttemptId = session.attemptId;
          }
          if (!resolvedAttemptId) {
            const { AssessmentVerificationSession, QuizAttempt, CodingAttempt } = require('../models');
            const verif = await AssessmentVerificationSession.findOne({ where: { sessionId } });
            if (verif?.attemptId) {
              resolvedAttemptId = verif.attemptId;
            } else {
              const qa = await QuizAttempt.findOne({ where: { monitoringSessionId: sessionId } });
              if (qa) {
                resolvedAttemptId = qa.id;
              } else {
                const ca = await CodingAttempt.findOne({ where: { monitoringSessionId: sessionId } });
                if (ca) {
                  resolvedAttemptId = ca.id;
                }
              }
            }
          }

          if (!resolvedAttemptId && (participantId || session?.participantId)) {
            const { QuizAttempt, CodingAttempt } = require('../models');
            const { Op } = require('sequelize');
            const pId = Number(participantId || session?.participantId);
            const qa = await QuizAttempt.findOne({
              where: {
                participantId: pId,
                status: 'IN_PROGRESS',
              },
              order: [['id', 'DESC']],
            });
            if (qa) {
              resolvedAttemptId = qa.id;
            } else {
              const ca = await CodingAttempt.findOne({
                where: {
                  participantId: pId,
                  status: 'IN_PROGRESS',
                },
                order: [['id', 'DESC']],
              });
              if (ca) resolvedAttemptId = ca.id;
            }
          }
        } catch (_) {}

        // Quiz & Coding: Save to ProctoringEvent if ProctoringSession or ExamSession exists
        await ProctoringEvent.create({
          monitoringSessionId: sessionId,
          attemptId: resolvedAttemptId || null,
          participantId,
          eventType,
          severity: severity || 'INFO',
          confidence: confidence || 1.0,
          duration: 0,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          metadata: {
            cameraSource,
            moduleType,
            detectedClasses,
            detectionsCount: detections.length,
          },
        }).catch((e) => {
          // Non-blocking catch if foreign keys / session table not yet synced
          logger.debug(`[YOLOProctoringService] Event log note: ${e.message}`);
        });

        // Also persist to MonitoringEvent & update MonitoringSession if sessionId exists
        try {
          const monitoringService = require('./monitoringService');
          if (session) {
            await monitoringService.reportEvent({
              sessionId: session.sessionId,
              attemptId: resolvedAttemptId || session.attemptId,
              participantId: session.participantId,
              source: cameraSource === 'MOBILE_CAMERA' ? 'MOBILE' : 'LAPTOP',
              eventType,
              severity: severity || 'INFO',
              durationMs: 2000,
              confidence: confidence || 0.9,
              metadata: {
                cameraSource,
                moduleType,
                detectedClasses,
                detectionsCount: detections.length,
              },
            });
          }
        } catch (monErr) {
          logger.debug(`[YOLOProctoringService] MonitoringEvent log note: ${monErr.message}`);
        }
      }
    } catch (e) {
      logger.warn(`[YOLOProctoringService] Persistence error: ${e.message}`);
    }
  }

  /**
   * Broadcast monitoring event to trainer rooms via Socket.IO.
   */
  broadcastEvent(io, event) {
    if (!io || !event) return;

    const { sessionId, moduleType, quizId, assessmentId } = event;

    // Room determination
    if (moduleType === 'INTERVIEW') {
      io.to(`interview_${sessionId}`).emit('interview-alert', {
        sessionId,
        alertType: event.eventType,
        severity: event.severity,
        sourceDevice: event.cameraSource === 'MOBILE_CAMERA' ? 'MOBILE' : 'LAPTOP',
        message: `YOLO Detection: ${event.eventType} (${(event.confidence * 100).toFixed(0)}%)`,
        metadata: {
          detectedClasses: event.detectedClasses,
          confidence: event.confidence,
          cameraSource: event.cameraSource,
        },
        timestamp: event.timestamp,
      });
    } else {
      // Quiz & Coding
      const roomId = quizId || assessmentId || sessionId;
      const payload = {
        type: 'yolo_monitoring',
        monitoring: {
          sessionId: event.sessionId,
          participantId: event.participantId,
          moduleType: event.moduleType,
          cameraSource: event.cameraSource,
          eventType: event.eventType,
          severity: event.severity,
          confidence: event.confidence,
          timestamp: event.timestamp,
          detectedClasses: event.detectedClasses,
        },
      };

      io.to(`proctor_quiz_${roomId}`).emit('proctor:update', payload);
      io.to(`proctor_coding_${roomId}`).emit('proctor:update', payload);
      io.to(`proctor_session_${sessionId}`).emit('proctor:yolo_status', payload.monitoring);
    }
  }
}

module.exports = new YOLOProctoringService();
