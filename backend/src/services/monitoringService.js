/**
 * Unified Monitoring Engine Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Single authoritative backend service for monitoring session lifecycle,
 * laptop MediaPipe & mobile YOLO11s coordination, server-side scoring,
 * dynamic configuration, and integrity verification across Quiz, Coding,
 * and Interview modules.
 */

const axios = require('axios');
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  MonitoringSession,
  MonitoringEvent,
  MonitoringConfig,
  User,
  QuizAttempt,
  CodingAttempt,
  Interview,
} = require('../models');
const logger = require('../utils/logger');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// Default Fallback Configurations
const DEFAULT_CONFIGS = {
  global: {
    risk_boundaries: { LOW: 0, MEDIUM: 15, HIGH: 35, CRITICAL: 70 },
    score_weights: {
      GAZE_OFF_SCREEN_LEFT: 2,
      GAZE_OFF_SCREEN_RIGHT: 2,
      GAZE_OFF_SCREEN_UP: 2,
      GAZE_OFF_SCREEN_DOWN: 3,
      HEAD_LOOKING_DOWN: 4,
      HEAD_LOOKING_SIDEWAYS: 4,
      FACE_ABSENT: 5,
      MULTIPLE_FACES: 12,
      MULTIPLE_PERSONS_DETECTED: 15,
      PHONE_DETECTED: 25,
      SPEAKING_DETECTED: 3,
      TAB_SWITCH: 6,
      FULLSCREEN_EXIT: 8,
      WINDOW_BLUR: 4,
      DEVTOOLS_OPENED: 15,
      CAMERA_DISCONNECTED: 10,
      MOBILE_DISCONNECTED: 8,
      COMPOSITION_INVALID: 4,
    },
    duration_thresholds_ms: {
      gaze_deviation: 2500,
      head_pose_deviation: 2000,
      face_absence_grace: 3000,
      mobile_disconnect_grace: 30000,
    },
    cooldowns_ms: {
      gaze: 4000,
      head_pose: 4000,
      face_absence: 5000,
      browser_events: 3000,
      default: 5000,
    },
    grace_counts: {
      gaze: 5,                      // Allow 5 gaze deviations in window before flagging
      head_pose: 5,                 // Allow 5 head pose deviations in window before flagging
      gaze_window_ms: 300000,       // 5-minute rolling window for gaze grace
      head_pose_window_ms: 300000,  // 5-minute rolling window for head pose grace
    },
    fps: {
      laptop: 6,
      mobile: 3,
    },
    calibration: {
      timeout_seconds: 45,
      min_face_height_ratio: 0.14,
      min_brightness: 35,
      max_brightness: 230,
    },
    mobile_pairing: {
      token_expiry_minutes: 3,
    },
  },
  CODING: {
    // Coding assessments tolerate slightly longer looking away (e.g. typing/thinking)
    duration_thresholds_ms: {
      gaze_deviation: 4000,
      head_pose_deviation: 3500,
      face_absence_grace: 4000,
      mobile_disconnect_grace: 45000,
    },
    score_weights: {
      GAZE_OFF_SCREEN_DOWN: 2,
      HEAD_LOOKING_DOWN: 2,
    },
    grace_counts: {
      gaze: 8,                      // Coding tolerates more gaze deviation
      head_pose: 8,                 // Coding tolerates more head movement
    },
  },
  INTERVIEW: {
    // Interview assessments are conversational
    duration_thresholds_ms: {
      gaze_deviation: 3000,
      head_pose_deviation: 3000,
      face_absence_grace: 3000,
    },
    score_weights: {
      SPEAKING_DETECTED: 0, // speaking is normal in an interview
    },
  },
  QUIZ: {},
};

class MonitoringEngineService {
  constructor() {
    this.inMemoryCooldowns = new Map(); // key -> lastTimestamp
  }

  // ── Configuration Resolution ─────────────────────────────────────────────

  async getConfig(contextType = null) {
    try {
      const dbConfigs = await MonitoringConfig.findAll();
      const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIGS.global));

      // Apply module-specific default overrides
      if (contextType && DEFAULT_CONFIGS[contextType]) {
        this._deepMerge(merged, DEFAULT_CONFIGS[contextType]);
      }

      // Apply DB configs (global first, then contextType)
      for (const row of dbConfigs) {
        if (!row.contextType && row.value) {
          merged[row.key] = row.value;
        }
      }
      if (contextType) {
        for (const row of dbConfigs) {
          if (row.contextType === contextType && row.value) {
            merged[row.key] = row.value;
          }
        }
      }

      return merged;
    } catch (err) {
      logger.warn(`[MonitoringEngine] Error loading configs: ${err.message}`);
      const fallback = JSON.parse(JSON.stringify(DEFAULT_CONFIGS.global));
      if (contextType && DEFAULT_CONFIGS[contextType]) {
        this._deepMerge(fallback, DEFAULT_CONFIGS[contextType]);
      }
      return fallback;
    }
  }

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target) {
        Object.assign(source[key], this._deepMerge(target[key], source[key]));
      }
    }
    Object.assign(target || {}, source);
    return target;
  }

  async updateConfig({ key, contextType = null, value, updatedBy = null }) {
    if (!key || value === undefined) {
      throw new Error('key and value are required');
    }
    const [row] = await MonitoringConfig.findOrCreate({
      where: {
        config_key: key,
        context_type: contextType || null,
      },
      defaults: {
        key,
        contextType: contextType || null,
        value,
        updatedBy,
      },
    });

    await row.update({ value, updatedBy });
    return row;
  }

  // ── Session Lifecycle ────────────────────────────────────────────────────

  async startSession({
    participantId,
    contextType = 'QUIZ',
    contextId = null,
    attemptId = null,
    mobileEnabled = false,
  }) {
    if (!participantId) throw new Error('participantId is required');

    const normalizedContext = String(contextType).toUpperCase();
    const sessionId = `ms_${normalizedContext.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Check if an active session already exists for this attempt/context
    if (attemptId) {
      const existing = await MonitoringSession.findOne({
        where: {
          participantId,
          contextType: normalizedContext,
          attemptId,
          status: { [Op.in]: ['CALIBRATING', 'READY', 'ACTIVE', 'PAUSED'] },
        },
      });
      if (existing) {
        return { session: existing, isResumed: true };
      }
    }

    const session = await MonitoringSession.create({
      sessionId,
      participantId,
      contextType: normalizedContext,
      contextId: contextId ? Number(contextId) : null,
      attemptId: attemptId ? Number(attemptId) : null,
      laptopStatus: 'CALIBRATING',
      mobileStatus: mobileEnabled ? 'PAIRING' : 'DISABLED',
      mobileEnabled: !!mobileEnabled,
      calibrationPassed: false,
      score: 0.0,
      riskLevel: 'LOW',
      status: 'CALIBRATING',
      startedAt: new Date(),
      integrityFlags: [],
    });

    // If mobile is enabled, pre-generate single-use pairing token
    if (mobileEnabled) {
      await this.generateMobilePairingToken({ sessionId: session.sessionId, participantId });
      await session.reload();
    }

    logger.info(`[MonitoringEngine] Started session ${sessionId} for participant ${participantId} (${normalizedContext})`);
    return { session, isResumed: false };
  }

  async getSession(sessionId) {
    if (!sessionId) return null;
    return MonitoringSession.findOne({
      where: { sessionId: String(sessionId) },
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
    });
  }

  async getStatus(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');

    const config = await this.getConfig(session.contextType);

    // Watchdog check for missed heartbeats
    const now = Date.now();
    const graceMs = config.duration_thresholds_ms?.mobile_disconnect_grace || 30000;

    let isMobileDegraded = false;
    if (session.mobileEnabled && session.status === 'ACTIVE' && session.lastMobileHeartbeatAt) {
      const diff = now - new Date(session.lastMobileHeartbeatAt).getTime();
      if (diff > graceMs && session.mobileStatus !== 'DISCONNECTED') {
        session.mobileStatus = 'DISCONNECTED';
        const flags = Array.isArray(session.integrityFlags) ? [...session.integrityFlags] : [];
        if (!flags.includes('MOBILE_CAMERA_DISCONNECTED_MID_TEST')) {
          flags.push('MOBILE_CAMERA_DISCONNECTED_MID_TEST');
        }
        session.integrityFlags = flags;
        await session.save();
        isMobileDegraded = true;
      }
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      laptopStatus: session.laptopStatus,
      mobileStatus: session.mobileStatus,
      mobileEnabled: session.mobileEnabled,
      calibrationPassed: session.calibrationPassed,
      score: session.score,
      riskLevel: session.riskLevel,
      totalEvents: session.totalEvents,
      warningEvents: session.warningEvents,
      highEvents: session.highEvents,
      criticalEvents: session.criticalEvents,
      integrityFlags: session.integrityFlags || [],
      isMobileDegraded,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  // ── Calibration & Laptop Validation ──────────────────────────────────────

  async recordCalibration({ sessionId, participantId, passed, details = {}, failureReason = null }) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');
    if (session.participantId !== Number(participantId)) {
      throw new Error('Unauthorized for this monitoring session');
    }

    session.calibrationPassed = !!passed;
    session.calibrationDetails = details;
    if (passed) {
      session.laptopStatus = 'READY';
      if (!session.mobileEnabled || ['VALID', 'DISABLED'].includes(session.mobileStatus)) {
        session.status = 'READY';
      }
    } else {
      session.laptopStatus = 'CALIBRATING';
      if (failureReason) {
        const flags = Array.isArray(session.integrityFlags) ? [...session.integrityFlags] : [];
        flags.push(`CALIBRATION_FAILED_${failureReason}`);
        session.integrityFlags = flags;
      }
    }

    await session.save();
    return session;
  }

  async validateLaptop({ sessionId, participantId, frame }) {
    if (!frame) throw new Error('frame data is required');

    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/api/proctoring/analyze-frame`,
        {
          frame,
          sessionId: String(sessionId),
          timestampMs: Date.now(),
        },
        { timeout: 4000, headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data;
      const violations = [];

      if (data?.success) {
        const session = await this.getSession(sessionId);
        if (session) {
          session.lastLaptopHeartbeatAt = new Date();
          await session.save();
        }

        // Check face absence / multiple persons
        if (data.face_count === 0) {
          violations.push({
            type: 'FACE_ABSENT',
            severity: 'WARNING',
            detail: 'Candidate face absent from laptop camera view',
          });
        } else if (data.face_count > 1) {
          violations.push({
            type: 'MULTIPLE_FACES',
            severity: 'HIGH',
            detail: `Multiple persons detected (${data.face_count} faces in view)`,
          });
        }

        // Check gaze deviation
        if (data.gaze_direction && data.gaze_direction !== 'CENTER' && data.gaze_direction !== 'UNKNOWN') {
          violations.push({
            type: `GAZE_${data.gaze_direction}`,
            severity: 'WARNING',
            detail: `Gaze deviated (${data.gaze_direction.replace(/_/g, ' ')})`,
          });
        }

        // Check head pose deviation
        if (data.head_pose_classification && data.head_pose_classification !== 'CENTER' && data.head_pose_classification !== 'UNKNOWN') {
          violations.push({
            type: `HEAD_${data.head_pose_classification}`,
            severity: 'WARNING',
            detail: `Head turned away (${data.head_pose_classification.replace(/_/g, ' ')})`,
          });
        }
      }

      return {
        ...data,
        violations,
      };
    } catch (err) {
      logger.warn(`[MonitoringEngine] Laptop validation error: ${err.message}`);
      return {
        success: false,
        error: err.response?.data?.detail || err.message,
        violations: [],
      };
    }
  }

  async validateCalibrationFrame({ sessionId, frame }) {
    if (!frame) throw new Error('frame data is required');

    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/api/proctoring/validate-calibration`,
        {
          frame,
          sessionId: String(sessionId),
        },
        { timeout: 4000, headers: { 'Content-Type': 'application/json' } }
      );
      return response.data;
    } catch (err) {
      logger.warn(`[MonitoringEngine] Calibration validation error: ${err.message}`);
      return {
        passed: false,
        reason: 'AI_SERVICE_UNAVAILABLE',
        message: 'Camera calibration service is unreachable. Please retry.',
      };
    }
  }

  // ── Mobile QR Pairing & Composition Validation ───────────────────────────

  async generateMobilePairingToken({ sessionId, participantId }) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');

    const config = await this.getConfig(session.contextType);
    const expiryMinutes = config.mobile_pairing?.token_expiry_minutes || 3;

    const token = `mpt_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    session.mobilePairingToken = token;
    session.mobilePairingExpiresAt = expiresAt;
    session.mobileStatus = 'PAIRING';
    await session.save();

    const qrPayload = JSON.stringify({
      sessionId: session.sessionId,
      token,
      participantId: session.participantId,
      contextType: session.contextType,
      contextId: session.contextId,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      token,
      expiresAt,
      qrPayload,
    };
  }

  async pairMobile({ sessionId, token, participantId }) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');

    if (!session.mobilePairingToken || session.mobilePairingToken !== token) {
      throw new Error('Invalid or expired pairing token');
    }

    if (new Date() > new Date(session.mobilePairingExpiresAt)) {
      session.mobileStatus = 'PAIRING';
      await session.save();
      throw new Error('Pairing QR code has expired. Please refresh the QR code on your laptop.');
    }

    // Single-use consumption: clear token on successful pair
    session.mobilePairingToken = null;
    session.mobilePairingExpiresAt = null;
    session.mobileStatus = 'CONNECTING';
    session.lastMobileHeartbeatAt = new Date();
    await session.save();

    logger.info(`[MonitoringEngine] Mobile paired successfully for session ${sessionId}`);
    return { success: true, session };
  }

  async validateMobile({ sessionId, participantId, frame, confidenceThreshold = 0.35 }) {
    if (!frame) throw new Error('frame data is required');

    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/api/proctoring/yolo/analyze-frame`,
        {
          frame,
          sessionId: String(sessionId),
          participantId: Number(participantId) || participantId,
          cameraSource: 'MOBILE_CAMERA',
          confidenceThreshold,
          timestampMs: Date.now(),
        },
        { timeout: 4000, headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data;
      if (data?.success) {
        const session = await this.getSession(sessionId);
        if (session) {
          if (data.composition_state && session.mobileStatus !== data.composition_state) {
            session.mobileStatus = data.composition_state;
            session.lastMobileHeartbeatAt = new Date();
            await session.save();
          }

          // ── Aggressive attemptId resolution (Bug 17 fix) ──────────────
          // If session.attemptId is null, resolve it NOW before any event reporting
          let resolvedAttemptId = session.attemptId;
          if (!resolvedAttemptId) {
            try {
              const { AssessmentVerificationSession } = require('../models');
              // Try verification session first
              const verif = await AssessmentVerificationSession.findOne({
                where: { sessionId: session.sessionId }
              });
              if (verif?.attemptId) {
                resolvedAttemptId = verif.attemptId;
              }
            } catch (_) {}

            if (!resolvedAttemptId) {
              try {
                // Try QuizAttempt by monitoringSessionId
                const qa = await QuizAttempt.findOne({
                  where: { monitoringSessionId: session.sessionId }
                });
                if (qa) {
                  resolvedAttemptId = qa.id;
                }
              } catch (_) {}
            }

            if (!resolvedAttemptId) {
              try {
                // Try CodingAttempt by monitoringSessionId
                const ca = await CodingAttempt.findOne({
                  where: { monitoringSessionId: session.sessionId }
                });
                if (ca) {
                  resolvedAttemptId = ca.id;
                }
              } catch (_) {}
            }

            if (!resolvedAttemptId && session.participantId) {
              try {
                // Last resort: find any in-progress attempt for this participant
                const qa = await QuizAttempt.findOne({
                  where: {
                    participantId: session.participantId,
                    status: { [Op.in]: ['IN_PROGRESS', 'STARTED', 'in_progress', 'started'] }
                  },
                  order: [['id', 'DESC']],
                });
                if (qa) {
                  resolvedAttemptId = qa.id;
                } else {
                  const ca = await CodingAttempt.findOne({
                    where: {
                      participantId: session.participantId,
                      status: { [Op.in]: ['IN_PROGRESS', 'STARTED', 'in_progress', 'started'] }
                    },
                    order: [['id', 'DESC']],
                  });
                  if (ca) resolvedAttemptId = ca.id;
                }
              } catch (_) {}
            }

            // Backfill the session so future calls don't need to re-resolve
            if (resolvedAttemptId) {
              session.attemptId = resolvedAttemptId;
              await session.save();
              logger.info(`[MonitoringEngine] Backfilled attemptId=${resolvedAttemptId} on session ${session.sessionId}`);
            }
          }

          // Check for detected objects: Phone, Multiple Persons, Secondary Screens, Books/Notes
          const detections = data.detections || [];
          const hasPhone = (data.phone_count > 0) || detections.some(d => (d.class_name || '').toLowerCase().includes('phone'));

          // Bug 19 fix: Mobile camera multi-person detection uses > 2 threshold
          // (candidate + candidate's screen reflection = 2, so only flag 3+)
          // Also filter out small bounding boxes (< 5% frame area) as screen reflections
          const significantPersonDetections = detections.filter(d => {
            if (!(d.class_name || '').toLowerCase().includes('person')) return false;
            // Filter out small bounding boxes that are likely screen reflections
            if (d.bbox_area !== undefined && d.bbox_area < 0.05) return false;
            if (d.width !== undefined && d.height !== undefined) {
              const relArea = (d.width * d.height);
              if (relArea < 0.05) return false;
            }
            return true;
          });
          const mobilePersonCount = data.person_count || significantPersonDetections.length;
          const hasMultiPerson = mobilePersonCount > 2;

          const hasSecondaryScreen = (data.laptop_count > 1) || detections.filter(d => ['laptop', 'tv', 'monitor', 'screen'].some(s => (d.class_name || '').toLowerCase().includes(s))).length > 1;
          const hasBookNotes = (data.book_count > 0) || detections.some(d => ['book', 'paper', 'notes'].some(s => (d.class_name || '').toLowerCase().includes(s)));

          if (hasPhone) {
            await this.reportEvent({
              sessionId: session.sessionId,
              attemptId: resolvedAttemptId,
              participantId: session.participantId,
              source: 'MOBILE',
              eventType: 'PHONE_DETECTED',
              severity: 'CRITICAL',
              durationMs: 2000,
              confidence: data.proctoring_event?.confidence || 0.92,
              metadata: {
                composition_state: data.composition_state,
                user_message: data.user_message,
                detections,
              },
            });

            const flags = Array.isArray(session.integrityFlags) ? [...session.integrityFlags] : [];
            if (!flags.includes('UNAUTHORIZED_PHONE_DETECTED')) {
              flags.push('UNAUTHORIZED_PHONE_DETECTED');
              session.integrityFlags = flags;
              await session.save();
            }
          } else if (hasMultiPerson) {
            await this.reportEvent({
              sessionId: session.sessionId,
              attemptId: resolvedAttemptId,
              participantId: session.participantId,
              source: 'MOBILE',
              eventType: 'MULTIPLE_FACES',
              severity: 'HIGH',
              durationMs: 2000,
              confidence: data.proctoring_event?.confidence || 0.90,
              metadata: {
                composition_state: data.composition_state,
                user_message: data.user_message,
                person_count: mobilePersonCount,
                detections,
              },
            });
          } else if (hasSecondaryScreen) {
            await this.reportEvent({
              sessionId: session.sessionId,
              attemptId: resolvedAttemptId,
              participantId: session.participantId,
              source: 'MOBILE',
              eventType: 'SECONDARY_DEVICE',
              severity: 'HIGH',
              durationMs: 2000,
              confidence: 0.88,
              metadata: {
                composition_state: data.composition_state,
                user_message: data.user_message,
                detections,
              },
            });
          } else if (hasBookNotes) {
            await this.reportEvent({
              sessionId: session.sessionId,
              attemptId: resolvedAttemptId,
              participantId: session.participantId,
              source: 'MOBILE',
              eventType: 'BOOK_NOTES_DETECTED',
              severity: 'HIGH',
              durationMs: 2000,
              confidence: 0.85,
              metadata: {
                composition_state: data.composition_state,
                user_message: data.user_message,
                detections,
              },
            });
          }
        }
      }

      return data;
    } catch (err) {
      logger.warn(`[MonitoringEngine] Mobile validation error: ${err.message}`);
      return {
        success: false,
        composition_state: 'DISCONNECTED',
        error: err.response?.data?.detail || err.message,
      };
    }
  }

  // ── Authoritative Server-Side Scoring & Event Ingestion ──────────────────

  async reportEvent({
    sessionId,
    attemptId = null,
    participantId,
    source = 'LAPTOP',
    eventType,
    severity = 'INFO',
    durationMs = 0,
    confidence = 1.0,
    evidenceRef = null,
    metadata = {},
    idempotencyKey = null,
  }) {
    if (!sessionId || !eventType) {
      throw new Error('sessionId and eventType are required');
    }

    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');

    // Ensure session.attemptId is resolved if not present
    let resolvedAttemptId = attemptId || session.attemptId;
    if (!resolvedAttemptId) {
      try {
        const { AssessmentVerificationSession } = require('../models');
        const verif = await AssessmentVerificationSession.findOne({ where: { sessionId: session.sessionId } });
        if (verif?.attemptId) {
          resolvedAttemptId = verif.attemptId;
          session.attemptId = resolvedAttemptId;
          await session.save();
        } else {
          const qa = await QuizAttempt.findOne({ where: { monitoringSessionId: session.sessionId } });
          if (qa) {
            resolvedAttemptId = qa.id;
            session.attemptId = resolvedAttemptId;
            await session.save();
          } else {
            const ca = await CodingAttempt.findOne({ where: { monitoringSessionId: session.sessionId } });
            if (ca) {
              resolvedAttemptId = ca.id;
              session.attemptId = resolvedAttemptId;
              await session.save();
            }
          }
        }
      } catch (_) {}

      // Final fallback: find any in-progress attempt for this participant
      if (!resolvedAttemptId && session.participantId) {
        try {
          const qa = await QuizAttempt.findOne({
            where: {
              participantId: session.participantId,
              status: { [Op.in]: ['IN_PROGRESS', 'STARTED', 'in_progress', 'started'] },
            },
            order: [['id', 'DESC']],
          });
          if (qa) {
            resolvedAttemptId = qa.id;
          } else {
            const ca = await CodingAttempt.findOne({
              where: {
                participantId: session.participantId,
                status: { [Op.in]: ['IN_PROGRESS', 'STARTED', 'in_progress', 'started'] },
              },
              order: [['id', 'DESC']],
            });
            if (ca) resolvedAttemptId = ca.id;
          }
          if (resolvedAttemptId) {
            session.attemptId = resolvedAttemptId;
            await session.save();
            logger.info(`[MonitoringEngine] reportEvent: backfilled attemptId=${resolvedAttemptId} for session ${session.sessionId}`);
          }
        } catch (_) {}
      }
    }

    const config = await this.getConfig(session.contextType);
    const normalizedSource = String(source).toUpperCase() === 'MOBILE' ? 'MOBILE' : 'LAPTOP';
    const normalizedSeverity = (severity || 'INFO').toUpperCase();

    // 1. Debounce Check
    const cooldowns = config.cooldowns_ms || {};
    const defaultCooldown = cooldowns.default || 4000;
    const cooldownMs =
      eventType.includes('GAZE') ? (cooldowns.gaze || defaultCooldown)
      : eventType.includes('HEAD') ? (cooldowns.head_pose || defaultCooldown)
      : eventType.includes('FACE') ? (cooldowns.face_absence || defaultCooldown)
      : defaultCooldown;

    const cooldownKey = `${sessionId}_${normalizedSource}_${eventType}`;
    const now = Date.now();
    const lastTriggered = this.inMemoryCooldowns.get(cooldownKey) || 0;

    if (now - lastTriggered < cooldownMs && normalizedSeverity !== 'CRITICAL') {
      return { skipped: true, reason: 'DEBOUNCED', session };
    }

    // 2. Idempotency Key Generation / Verification
    const timeBucket = Math.floor(now / cooldownMs);
    const finalIdempotencyKey = idempotencyKey || `${sessionId}_${normalizedSource}_${eventType}_${timeBucket}`;

    // 3. Authoritative Score Delta Computation
    const weights = config.score_weights || {};
    let baseWeight = weights[eventType];
    if (baseWeight === undefined) {
      const sevWeights = { INFO: 0, LOW: 2, MEDIUM: 5, HIGH: 12, CRITICAL: 25 };
      baseWeight = sevWeights[normalizedSeverity] || 0;
    }

    const conf = Math.max(0.3, Math.min(1.0, Number(confidence) || 1.0));
    const durSeconds = Math.max(0.5, Number(durationMs) / 1000.0 || 1.0);
    const durationMultiplier = Math.min(2.5, 1.0 + Math.log10(durSeconds + 1.0));

    const scoreDelta = Math.round(baseWeight * conf * durationMultiplier * 10) / 10;

    // 4. Grace Warnings Check (First 3 Alerts are Live Warnings Only & Unscored)
    const existingEventsCount = await MonitoringEvent.count({
      where: {
        [Op.or]: [
          { monitoringSessionId: session.sessionId },
          ...(session.attemptId ? [{ attemptId: session.attemptId }] : []),
        ],
      },
    });

    const isGraceWarning = existingEventsCount < 3;
    const warningNumber = existingEventsCount + 1;
    const effectiveScoreDelta = isGraceWarning ? 0.0 : scoreDelta;

    const warningMessages = {
      FACE_ABSENT: 'Participant face absent — please look directly at your screen',
      FACE_NOT_DETECTED: 'Face not detected — please stay centered in front of the camera',
      FACE_NOT_VISIBLE: 'Face not clearly visible in frame',
      PARTICIPANT_ABSENT: 'Candidate absent from camera view',
      GAZE_OFF_SCREEN: 'Eyes looking away — please keep your focus on your assessment',
      GAZE_DEVIATION: 'Gaze directed away from exam window',
      HEAD_POSE_DEVIATION: 'Head turned away from camera',
      MULTIPLE_FACES: 'Multiple people detected in camera frame',
      MULTIPLE_PERSONS_DETECTED: 'Unauthorized person detected in testing area',
      PHONE_DETECTED: 'Mobile device detected in testing space',
      SECONDARY_DEVICE: 'Secondary screen or unauthorized device detected',
      BOOK_NOTES_DETECTED: 'Unauthorized books or notes detected',
      FULLSCREEN_EXIT: 'Exited fullscreen mode — please return to fullscreen immediately',
      TAB_SWITCH: 'Switched browser tab — please stay on the assessment tab',
      WINDOW_BLUR: 'Exam window lost focus — please click back into your assessment',
      WINDOW_FOCUS_LOST: 'Browser window lost focus',
    };
    const warningMessage = warningMessages[eventType] || `${(eventType || '').replace(/_/g, ' ')} detected — please follow exam guidelines`;

    let event = null;
    let created = false;

    try {
      const [ev, wasCreated] = await MonitoringEvent.findOrCreate({
        where: { idempotencyKey: finalIdempotencyKey },
        defaults: {
          monitoringSessionId: session.sessionId,
          attemptId: resolvedAttemptId || session.attemptId,
          participantId: session.participantId,
          contextType: session.contextType,
          source: normalizedSource,
          eventType,
          severity: normalizedSeverity,
          scoreDelta: effectiveScoreDelta,
          durationMs: Number(durationMs) || 0,
          occurredAt: new Date(),
          confidence: conf,
          evidenceRef,
          metadata: {
            ...metadata,
            isGraceWarning,
            warningNumber,
            warningMessage,
          },
        },
      });
      event = ev;
      created = wasCreated;
    } catch (concurrencyErr) {
      event = await MonitoringEvent.findOne({ where: { idempotencyKey: finalIdempotencyKey } });
      created = false;
    }

    if (!created && event) {
      return { skipped: true, reason: 'IDEMPOTENT_DUPLICATE', event, session };
    }

    try {
      this.inMemoryCooldowns.set(cooldownKey, now);

      // 4. Update Session Cumulative Score & Risk Level (Grace warnings do NOT add penalty score)
      const newScore = Math.min(100, Math.round((session.score + effectiveScoreDelta) * 10) / 10);
      const boundaries = config.risk_boundaries || { LOW: 0, MEDIUM: 15, HIGH: 35, CRITICAL: 70 };

      let newRiskLevel = 'LOW';
      if (newScore >= boundaries.CRITICAL) newRiskLevel = 'CRITICAL';
      else if (newScore >= boundaries.HIGH) newRiskLevel = 'HIGH';
      else if (newScore >= boundaries.MEDIUM) newRiskLevel = 'MEDIUM';

      const updateData = {
        score: newScore,
        riskLevel: newRiskLevel,
        totalEvents: session.totalEvents + 1,
      };

      if (!isGraceWarning) {
        if (normalizedSeverity === 'WARNING' || normalizedSeverity === 'LOW') {
          updateData.warningEvents = session.warningEvents + 1;
        } else if (normalizedSeverity === 'HIGH') {
          updateData.highEvents = session.highEvents + 1;
        } else if (normalizedSeverity === 'CRITICAL') {
          updateData.criticalEvents = session.criticalEvents + 1;
        }
      }

      await session.update(updateData);

      // Cross-persist to ProctoringEvent for complete report compatibility
      try {
        const { ProctoringEvent } = require('../models');
        if (ProctoringEvent && (resolvedAttemptId || session.attemptId || session.sessionId)) {
          await ProctoringEvent.findOrCreate({
            where: { idempotencyKey: finalIdempotencyKey },
            defaults: {
              monitoringSessionId: session.sessionId,
              attemptId: resolvedAttemptId || session.attemptId,
              participantId: session.participantId,
              quizId: session.contextId,
              eventType,
              severity: normalizedSeverity,
              confidence: conf,
              duration: Math.round(Number(durationMs) / 100) / 10,
              timestamp: new Date(),
              metadata: {
                ...metadata,
                isGraceWarning,
                warningNumber,
                warningMessage,
              },
              idempotencyKey: finalIdempotencyKey,
            },
          });
        }
      } catch (_) {}

      logger.info(
        `[MonitoringEngine] Recorded event: ${eventType} [${normalizedSeverity}] (grace: ${isGraceWarning}, scoreDelta: +${effectiveScoreDelta}) for session: ${session.sessionId}, attemptId: ${resolvedAttemptId || session.attemptId}`
      );

      return {
        success: true,
        event,
        isGraceWarning,
        warningNumber,
        maxWarnings: 3,
        warningMessage,
        scoreDelta: effectiveScoreDelta,
        currentScore: newScore,
        riskLevel: newRiskLevel,
        session,
      };
    } catch (err) {
      logger.error(`[MonitoringEngine] Error persisting event: ${err.message}`);
      throw err;
    }
  }

  async heartbeat({ sessionId, source = 'LAPTOP' }) {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const now = new Date();
    if (source.toUpperCase() === 'MOBILE') {
      session.lastMobileHeartbeatAt = now;
      if (session.mobileStatus === 'DISCONNECTED') {
        session.mobileStatus = 'CONNECTING';
      }
    } else {
      session.lastLaptopHeartbeatAt = now;
      if (session.laptopStatus === 'FAILED') {
        session.laptopStatus = 'ACTIVE';
      }
    }

    await session.save();
    return { ok: true, timestamp: now };
  }

  // ── Session Finalization & Report Generation ─────────────────────────────

  async endSession({ sessionId, participantId }) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');

    const flags = Array.isArray(session.integrityFlags) ? [...session.integrityFlags] : [];

    // Integrity Check 1: Was candidate calibrated?
    if (!session.calibrationPassed) {
      flags.push('SUBMITTED_WITHOUT_CALIBRATION');
    }

    // Integrity Check 2: Was mobile enabled but dropped?
    if (session.mobileEnabled && ['DISCONNECTED', 'PAIRING'].includes(session.mobileStatus)) {
      if (!flags.includes('MOBILE_CAMERA_INCOMPLETE_OR_DROPPED')) {
        flags.push('MOBILE_CAMERA_INCOMPLETE_OR_DROPPED');
      }
    }

    // Integrity Check 3: Was laptop camera active throughout?
    if (session.laptopStatus === 'FAILED' || session.status === 'CALIBRATING') {
      flags.push('MONITORING_PIPELINE_NOT_ACTIVE');
    }

    session.integrityFlags = flags;
    session.status = 'COMPLETED';
    session.endedAt = new Date();
    await session.save();

    logger.info(`[MonitoringEngine] Ended session ${sessionId} with ${flags.length} integrity flags`);
    return this.getReport({ sessionId: session.sessionId });
  }

  async getReport({ sessionId, attemptId = null }) {
    let session = null;
    if (sessionId) {
      session = await this.getSession(sessionId);
    } else if (attemptId) {
      session = await MonitoringSession.findOne({
        where: { attemptId: Number(attemptId) },
        order: [['id', 'DESC']],
        include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      });
      if (!session) {
        // Check if QuizAttempt or CodingAttempt exists
        const qa = await QuizAttempt.findByPk(attemptId, {
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
        });
        const ca = !qa ? await CodingAttempt.findByPk(attemptId, {
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
        }) : null;
        const att = qa || ca;
        if (att) {
          session = await MonitoringSession.findOne({
            where: {
              [Op.or]: [
                { attemptId: Number(attemptId) },
                ...(att.monitoringSessionId ? [{ sessionId: att.monitoringSessionId }] : []),
              ],
            },
            order: [['id', 'DESC']],
            include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
          });
        }
      }
    }

    if (!session) throw new Error('Monitoring report / session not found');

    // Query from both MonitoringEvent and ProctoringEvent to guarantee 0 missing events
    const { ProctoringEvent } = require('../models');
    const monitoringEvents = await MonitoringEvent.findAll({
      where: {
        [Op.or]: [
          { monitoringSessionId: session.sessionId },
          ...(session.attemptId ? [{ attemptId: session.attemptId }] : []),
        ],
      },
      order: [['occurredAt', 'ASC']],
    });

    let proctoringEvents = [];
    if (ProctoringEvent && session.attemptId) {
      try {
        proctoringEvents = await ProctoringEvent.findAll({
          where: {
            [Op.or]: [
              { attemptId: session.attemptId },
              { monitoringSessionId: session.sessionId },
            ],
          },
          order: [['timestamp', 'ASC']],
        });
      } catch (_) {}
    }

    // Merge and deduplicate events
    const seenKeys = new Set();
    const mergedEvents = [];

    for (const me of monitoringEvents) {
      const key = me.idempotencyKey || `${me.source}_${me.eventType}_${new Date(me.occurredAt).getTime()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        mergedEvents.push({
          id: me.id,
          source: me.source || 'LAPTOP',
          eventType: me.eventType,
          severity: me.severity,
          scoreDelta: me.scoreDelta || 0,
          durationMs: me.durationMs || 0,
          duration: Math.round((me.durationMs || 0) / 100) / 10,
          occurredAt: me.occurredAt,
          timestamp: me.occurredAt,
          confidence: me.confidence,
          evidenceRef: me.evidenceRef,
          metadata: me.metadata,
        });
      }
    }

    for (const pe of proctoringEvents) {
      const key = pe.idempotencyKey || `PROCTOR_${pe.eventType}_${new Date(pe.timestamp).getTime()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        mergedEvents.push({
          id: `pe_${pe.id}`,
          source: 'LAPTOP',
          eventType: pe.eventType,
          severity: pe.severity,
          scoreDelta: 0,
          durationMs: Math.round((Number(pe.duration) || 0) * 1000),
          duration: Number(pe.duration) || 0,
          occurredAt: pe.timestamp,
          timestamp: pe.timestamp,
          confidence: pe.confidence,
          evidenceRef: null,
          metadata: pe.metadata,
        });
      }
    }

    mergedEvents.sort((a, b) => new Date(a.occurredAt || a.timestamp) - new Date(b.occurredAt || b.timestamp));

    // Separate into Live Pre-Warnings (Grace 1-3) and Scored Incident Timeline (4+)
    const warningMessages = {
      FACE_ABSENT: 'Participant face absent — please look directly at your screen',
      FACE_NOT_DETECTED: 'Face not detected — please stay centered in front of the camera',
      FACE_NOT_VISIBLE: 'Face not clearly visible in frame',
      PARTICIPANT_ABSENT: 'Candidate absent from camera view',
      GAZE_OFF_SCREEN: 'Eyes looking away — please keep your focus on your assessment',
      GAZE_DEVIATION: 'Gaze directed away from exam window',
      HEAD_POSE_DEVIATION: 'Head turned away from camera',
      MULTIPLE_FACES: 'Multiple people detected in camera frame',
      MULTIPLE_PERSONS_DETECTED: 'Unauthorized person detected in testing area',
      PHONE_DETECTED: 'Mobile device detected in testing space',
      SECONDARY_DEVICE: 'Secondary screen or unauthorized device detected',
      BOOK_NOTES_DETECTED: 'Unauthorized books or notes detected',
      FULLSCREEN_EXIT: 'Exited fullscreen mode — please return to fullscreen immediately',
      TAB_SWITCH: 'Switched browser tab — please stay on the assessment tab',
      WINDOW_BLUR: 'Exam window lost focus — please click back into your assessment',
      WINDOW_FOCUS_LOST: 'Browser window lost focus',
    };

    const graceWarnings = [];
    const scoredEvents = [];

    let eventCounter = 0;
    for (const ev of mergedEvents) {
      eventCounter++;
      const isGrace = ev.metadata?.isGraceWarning === true || (eventCounter <= 3 && ev.scoreDelta === 0);
      if (isGrace) {
        graceWarnings.push({
          ...ev,
          warningNumber: ev.metadata?.warningNumber || eventCounter,
          isGraceWarning: true,
          scoreDelta: 0,
          warningMessage: ev.metadata?.warningMessage || warningMessages[ev.eventType] || `${(ev.eventType || '').replace(/_/g, ' ')} detected`,
        });
      } else {
        scoredEvents.push({
          ...ev,
          warningNumber: ev.metadata?.warningNumber || eventCounter,
          isGraceWarning: false,
        });
      }
    }

    const laptopEvents = scoredEvents.filter((e) => e.source === 'LAPTOP');
    const mobileEvents = scoredEvents.filter((e) => e.source === 'MOBILE');

    const categoryBreakdown = {
      face: scoredEvents.filter((e) => ['FACE_ABSENT', 'FACE_NOT_DETECTED', 'FACE_NOT_VISIBLE', 'PARTICIPANT_ABSENT'].includes(e.eventType)).length,
      gaze: scoredEvents.filter((e) => e.eventType.includes('GAZE') || e.eventType.includes('EYES_LOOKING')).length,
      headPose: scoredEvents.filter((e) => e.eventType.includes('HEAD')).length,
      facePresence: scoredEvents.filter((e) => e.eventType.includes('FACE')).length,
      persons: scoredEvents.filter((e) => ['MULTIPLE_PERSONS_DETECTED', 'MULTIPLE_FACES'].includes(e.eventType)).length,
      devices: scoredEvents.filter((e) => e.eventType.includes('PHONE') || e.eventType.includes('DEVICE') || e.eventType.includes('CELL_PHONE')).length,
      objects: scoredEvents.filter((e) => e.eventType.includes('PHONE') || e.eventType.includes('DEVICE') || e.eventType.includes('CELL_PHONE') || e.eventType.includes('BOOK') || e.eventType.includes('LAPTOP_DETECTED')).length,
      browserSecurity: scoredEvents.filter((e) =>
        ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'WINDOW_BLUR', 'DEVTOOLS_OPENED', 'WINDOW_FOCUS_LOST'].includes(e.eventType)
      ).length,
      composition: scoredEvents.filter((e) => e.eventType.includes('COMPOSITION')).length,
    };

    const totalDurationSec = session.endedAt && session.startedAt
      ? Math.max(1, Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 1000))
      : Math.max(1, Math.round((Date.now() - new Date(session.startedAt || session.createdAt).getTime()) / 1000));

    // Dynamic Real Tracking Coverage Calculations (derived from actual test detection data)
    const faceAbsentSec = scoredEvents
      .filter((e) => ['FACE_ABSENT', 'FACE_NOT_DETECTED', 'FACE_NOT_VISIBLE', 'PARTICIPANT_ABSENT'].includes(e.eventType))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 2), 0);

    const gazeDeviationSec = scoredEvents
      .filter((e) => e.eventType.includes('GAZE') || e.eventType.includes('EYES_LOOKING'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 2), 0);

    const headDeviationSec = mergedEvents
      .filter((e) => e.eventType.includes('HEAD'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 2), 0);

    const bodyFramingSec = mergedEvents
      .filter((e) => e.eventType.includes('BODY') || e.eventType.includes('SHOULDER'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 2), 0);

    const camDropSec = mergedEvents
      .filter((e) => e.eventType.includes('CAMERA_DISCONNECTED') || e.eventType.includes('MOBILE_DISCONNECTED'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 10), 0);

    const phoneViolations = mergedEvents.filter((e) =>
      e.eventType === 'PHONE_DETECTED' || e.eventType === 'CELL_PHONE_DETECTED'
    );

    const coverage = {
      faceDetection: `${Math.max(0, Math.min(100, Math.round(100 - (faceAbsentSec / totalDurationSec) * 100)))}%`,
      eyeTracking: `${Math.max(0, Math.min(100, Math.round(100 - (gazeDeviationSec / totalDurationSec) * 100)))}%`,
      headPose: `${Math.max(0, Math.min(100, Math.round(100 - (headDeviationSec / totalDurationSec) * 100)))}%`,
      bodyFraming: `${Math.max(0, Math.min(100, Math.round(100 - (bodyFramingSec / totalDurationSec) * 100)))}%`,
      audioCheck: `${Math.max(0, Math.min(100, 100 - mergedEvents.filter((e) => e.eventType.includes('SPEAKING')).length * 10))}%`,
      deviceCheck: phoneViolations.length > 0
        ? `FLAGGED (${phoneViolations.length} Phone Incident${phoneViolations.length > 1 ? 's' : ''})`
        : '100% CLEAN',
      cameraAvailability: `${Math.max(0, Math.min(100, Math.round(100 - (camDropSec / totalDurationSec) * 100)))}%`,
    };

    // Safeguard: Internal check for suspicious long-duration zero-violation sessions
    const flags = Array.isArray(session.integrityFlags) ? [...session.integrityFlags] : [];
    if (totalDurationSec >= 300 && mergedEvents.length === 0) {
      if (!flags.includes('SUSPICIOUS_ZERO_VIOLATIONS_LONG_SESSION')) {
        flags.push('SUSPICIOUS_ZERO_VIOLATIONS_LONG_SESSION');
      }
    }

    const warningCount = mergedEvents.filter((e) => ['WARNING', 'LOW', 'MEDIUM'].includes(e.severity)).length;
    const highCount = mergedEvents.filter((e) => e.severity === 'HIGH').length;
    const criticalCount = mergedEvents.filter((e) => e.severity === 'CRITICAL').length;
    const totalEventsCount = mergedEvents.length;

    const friendlyTimeline = scoredEvents.map((e) => {
      const evDate = new Date(e.occurredAt || e.timestamp || Date.now());
      const timeStr = evDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const friendlyName = e.eventType
        ? e.eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Monitoring Event';
      return {
        id: e.id,
        source: e.source,
        eventType: e.eventType,
        event: friendlyName,
        time: timeStr,
        severity: e.severity,
        scoreDelta: e.scoreDelta,
        durationMs: e.durationMs,
        duration: e.duration || (e.durationMs ? Math.round(e.durationMs / 100) / 10 : 0),
        occurredAt: e.occurredAt,
        timestamp: e.timestamp,
        confidence: e.confidence != null ? Math.round(Number(e.confidence) <= 1 ? Number(e.confidence) * 100 : Number(e.confidence)) : 100,
        evidenceRef: e.evidenceRef,
        metadata: e.metadata,
      };
    });

    const friendlyGraceWarnings = graceWarnings.map((gw) => {
      const evDate = new Date(gw.occurredAt || gw.timestamp || Date.now());
      const timeStr = evDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const friendlyName = gw.eventType
        ? gw.eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Pre-Warning';
      return {
        id: gw.id,
        warningNumber: gw.warningNumber || 1,
        source: gw.source,
        eventType: gw.eventType,
        event: friendlyName,
        time: timeStr,
        severity: gw.severity,
        scoreDelta: 0,
        isGraceWarning: true,
        message: gw.warningMessage || `${friendlyName} (Live Warning Only)`,
        durationMs: gw.durationMs,
        duration: gw.duration || (gw.durationMs ? Math.round(gw.durationMs / 100) / 10 : 0),
        occurredAt: gw.occurredAt,
        timestamp: gw.timestamp,
        confidence: gw.confidence != null ? Math.round(Number(gw.confidence) <= 1 ? Number(gw.confidence) * 100 : Number(gw.confidence)) : 100,
      };
    });

    const summary = {
      totalEvents: scoredEvents.length,
      graceWarningsCount: graceWarnings.length,
      maxGraceWarnings: 3,
      graceWarnings: friendlyGraceWarnings,
      counts: {
        info: scoredEvents.filter((e) => e.severity === 'INFO').length,
        warning: scoredEvents.filter((e) => ['WARNING', 'LOW', 'MEDIUM'].includes(e.severity)).length,
        high: scoredEvents.filter((e) => e.severity === 'HIGH').length,
        critical: scoredEvents.filter((e) => e.severity === 'CRITICAL').length,
      },
      categories: {
        face: categoryBreakdown.face,
        eyes: categoryBreakdown.gaze,
        head: categoryBreakdown.headPose,
        body: categoryBreakdown.body,
        multiplePerson: categoryBreakdown.persons,
        objects: categoryBreakdown.objects,
        browser: categoryBreakdown.browserSecurity,
        camera: categoryBreakdown.composition,
      },
      coverage,
      objectMonitoring: {
        phoneEvents: phoneViolations.length,
        mobileDetected: phoneViolations.length > 0,
        mobileDetectionCount: phoneViolations.length,
        laptopEvents: scoredEvents.filter((e) => e.eventType.includes('LAPTOP')).length,
        bookEvents: scoredEvents.filter((e) => e.eventType.includes('BOOK')).length,
        status: phoneViolations.length > 0 ? 'VIOLATION_FLAGGED' : 'CLEAR',
      },
      mobilePhoneViolation: {
        detected: phoneViolations.length > 0,
        count: phoneViolations.length,
        severity: phoneViolations.length > 0 ? 'HIGH' : 'NONE',
        firstDetected: phoneViolations[0]?.occurredAt || null,
        message: phoneViolations.length > 0
          ? 'Unauthorized mobile phone detected in camera view during test.'
          : 'No unauthorized mobile device detected.',
      },
      monitoringDuration: `${Math.floor(totalDurationSec / 60)}m ${totalDurationSec % 60}s`,
      monitoringDurationSeconds: totalDurationSec,
    };

    return {
      sessionId: session.sessionId,
      attemptId: session.attemptId,
      participantId: session.participantId,
      participant: session.participant,
      contextType: session.contextType,
      contextId: session.contextId,
      status: session.status,
      laptopStatus: session.laptopStatus,
      mobileStatus: session.mobileStatus,
      mobileEnabled: session.mobileEnabled,
      calibrationPassed: session.calibrationPassed,
      calibrationDetails: session.calibrationDetails,
      score: session.score,
      riskScore: session.score,
      riskLevel: session.riskLevel,
      totalEvents: scoredEvents.length,
      warningEvents: summary.counts.warning,
      highEvents: summary.counts.high,
      criticalEvents: summary.counts.critical,
      graceWarningsCount: graceWarnings.length,
      maxGraceWarnings: 3,
      graceWarnings: friendlyGraceWarnings,
      hasPhoneViolation: phoneViolations.length > 0 || flags.includes('UNAUTHORIZED_PHONE_DETECTED'),
      phoneViolationCount: phoneViolations.length,
      integrityFlags: flags,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: totalDurationSec,
      categoryBreakdown,
      coverage,
      summary,
      proctoring: {
        summary,
        timeline: friendlyTimeline,
        graceWarnings: friendlyGraceWarnings,
        riskScore: session.score,
        riskLevel: session.riskLevel,
      },
      eventsCount: {
        total: scoredEvents.length,
        grace: graceWarnings.length,
        laptop: laptopEvents.length,
        mobile: mobileEvents.length,
      },
      timeline: friendlyTimeline,
    };
  }

  async getReportsList({ contextType, contextId, participantId, riskLevel, limit = 50, offset = 0 }) {
    const where = {};
    if (contextType) where.contextType = String(contextType).toUpperCase();
    if (contextId) where.contextId = Number(contextId);
    if (participantId) where.participantId = Number(participantId);
    if (riskLevel) where.riskLevel = String(riskLevel).toUpperCase();

    const { count, rows } = await MonitoringSession.findAndCountAll({
      where,
      limit: Math.min(100, Number(limit) || 50),
      offset: Number(offset) || 0,
      order: [['id', 'DESC']],
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
    });

    return {
      total: count,
      sessions: rows,
    };
  }
}

module.exports = new MonitoringEngineService();
