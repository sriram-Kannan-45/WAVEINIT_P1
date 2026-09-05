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
  sequelize,
  MonitoringSession,
  MonitoringEvent,
  MonitoringConfig,
  User,
  QuizAttempt,
  CodingAttempt,
  Interview,
} = require('../models');
const logger = require('../utils/logger');

const BROWSER_EVENT_TYPES = new Set(['TAB_SWITCH', 'FULLSCREEN_EXIT', 'WINDOW_BLUR', 'PAGE_VISIBILITY_HIDDEN']);
const BROWSER_SWITCH_LIMIT = 3;
const BROWSER_SWITCH_PENALTY = 10;

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// ── Exact Eye + Head Duration Scoring Helpers ──────────────────────────────

/**
 * Authoritative Eye + Head Monitoring Score (Max 60 marks)
 * Formula: EyeHeadScore = (TotalUniqueValidEyeHeadViolationSeconds / ActualParticipantTestDurationSeconds) * 60
 * Clamped between 0 and 60.
 */
function calculateEyeHeadScore(totalUniqueViolationSeconds, actualTestDurationSeconds) {
  const duration = Math.max(0, Number(actualTestDurationSeconds) || 0);
  const violation = Math.max(0, Number(totalUniqueViolationSeconds) || 0);
  if (duration <= 0) return 0;
  const clampedViolation = Math.min(violation, duration);
  const score = (clampedViolation / duration) * 60.0;
  return Math.max(0, Math.min(60.0, score));
}

/**
 * Merges overlapping or contiguous violation intervals so overlapping
 * Eye and Head violations are counted only once (union duration).
 *
 * There is NO minimum-duration threshold: every positive-duration interval
 * (e.g. 0.5s, 1s, 2s, 3s, 10s) is accumulated and merged. Only zero-duration
 * or invalid intervals are dropped.
 */
function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const valid = [];
  for (const item of intervals) {
    let start, end;
    if (Array.isArray(item)) {
      start = Number(item[0]);
      end = Number(item[1]);
    } else if (item && typeof item === 'object') {
      start = Number(item.start ?? item.startTime ?? item.startedAt);
      end = Number(item.end ?? item.endTime ?? item.endedAt);
    }
    if (!isNaN(start) && !isNaN(end) && end > start) {
      valid.push([start, end]);
    }
  }

  if (valid.length === 0) return [];
  valid.sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [start, end] of valid) {
    if (merged.length === 0 || start > merged[merged.length - 1][1]) {
      merged.push([start, end]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    }
  }
  return merged;
}

/**
 * Calculates total unique violation seconds from merged valid intervals
 */
function calculateUniqueViolationSeconds(intervals) {
  const merged = mergeIntervals(intervals);
  const sum = merged.reduce((acc, [start, end]) => acc + (end - start), 0);
  return Math.round(sum * 100) / 100;
}

const SEVERITY_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, WARNING: 3, HIGH: 4, CRITICAL: 5 };

function eventIntervalBounds(event) {
  const metadata = event.metadata || {};
  const fallbackEnd = new Date(event.occurredAt || event.timestamp || Date.now()).getTime();
  const end = new Date(metadata.violationEndTime || metadata.endTime || fallbackEnd).getTime();
  const durationMs = Math.max(0, Number(event.durationMs ?? (Number(event.duration) || 0) * 1000) || 0);
  const start = new Date(metadata.violationStartTime || metadata.startTime || (end - durationMs)).getTime();
  const safeEnd = Number.isFinite(end) ? end : fallbackEnd;
  const safeStart = Number.isFinite(start) ? Math.min(start, safeEnd) : safeEnd - durationMs;
  return { start: safeStart, end: safeEnd };
}

/**
 * Collapse transport duplicates and polling fragments into one incident per
 * detector/type/direction. Gaze and head remain distinct, then scoring takes
 * the union of their time ranges so overlap is never counted twice.
 */
function aggregateMonitoringEvents(events, maxGapMs = 750) {
  const grouped = new Map();
  for (const event of events || []) {
    const direction = String(event.metadata?.direction || event.direction || '').toUpperCase();
    const browser = BROWSER_EVENT_TYPES.has(event.eventType);
    const key = browser
      ? `BROWSER|${event.metadata?.browserIncidentId || 'legacy'}`
      : `${event.source || 'LAPTOP'}|${event.eventType}|${direction}`;
    const item = { ...event, ...eventIntervalBounds(event) };
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  const incidents = [];
  for (const items of grouped.values()) {
    items.sort((a, b) => a.start - b.start || a.end - b.end);
    let current = null;
    for (const item of items) {
      if (!current || (item.metadata?.browserIncidentId ? item.metadata.browserIncidentId !== current.metadata?.browserIncidentId : item.start > current.end + (BROWSER_EVENT_TYPES.has(item.eventType) ? 0 : maxGapMs))) {
        if (current) incidents.push(current);
        current = { ...item, rawEventIds: [item.id] };
        continue;
      }
      current.end = Math.max(current.end, item.end);
      if (BROWSER_EVENT_TYPES.has(item.eventType)) {
        const rank = { TAB_SWITCH: 3, PAGE_VISIBILITY_HIDDEN: 3, WINDOW_BLUR: 2, FULLSCREEN_EXIT: 1 };
        if (rank[item.eventType] > rank[current.eventType]) current.eventType = item.eventType;
      }
      current.confidence = Math.max(Number(current.confidence) || 0, Number(item.confidence) || 0);
      if ((SEVERITY_RANK[item.severity] || 0) > (SEVERITY_RANK[current.severity] || 0)) current.severity = item.severity;
      current.rawEventIds.push(item.id);
    }
    if (current) incidents.push(current);
  }

  return incidents.map((incident) => ({
    ...incident,
    id: incident.rawEventIds.length === 1 ? incident.id : `incident_${incident.rawEventIds.join('_')}`,
    durationMs: Math.max(0, incident.end - incident.start),
    duration: Math.round(Math.max(0, incident.end - incident.start) / 100) / 10,
    occurredAt: new Date(incident.end),
    timestamp: new Date(incident.end),
    metadata: {
      ...(incident.metadata || {}),
      violationStartTime: new Date(incident.start).toISOString(),
      violationEndTime: new Date(incident.end).toISOString(),
      aggregatedEventIds: incident.rawEventIds,
    },
  })).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
}

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
    this.pendingEventWrites = new Map();
    this.inMemoryCooldowns = new Map(); // key -> lastTimestamp
    this.activeMobileViolations = new Map(); // sessionId -> current remote-camera interval
    this.pendingSessionStarts = new Map(); // attempt key -> in-flight session creation
  }

  // ── Configuration Resolution ─────────────────────────────────────────────

  async getConfig(contextType = null) {
    // Coding inherits Quiz policy, including persisted overrides and fallback.
    contextType = contextType ? String(contextType).toUpperCase() : null;
    if (contextType === 'CODING') contextType = 'QUIZ';
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
    contextType = contextType ? String(contextType).toUpperCase() : null;
    if (contextType === 'CODING') contextType = 'QUIZ';
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
    const startKey = attemptId
      ? `${participantId}:${String(contextType).toUpperCase()}:${Number(attemptId)}`
      : null;
    if (!startKey) {
      return this._startSession({ participantId, contextType, contextId, attemptId, mobileEnabled });
    }

    const pending = this.pendingSessionStarts.get(startKey);
    if (pending) return pending;

    const operation = this._startSession({ participantId, contextType, contextId, attemptId, mobileEnabled });
    this.pendingSessionStarts.set(startKey, operation);
    try {
      return await operation;
    } finally {
      if (this.pendingSessionStarts.get(startKey) === operation) {
        this.pendingSessionStarts.delete(startKey);
      }
    }
  }

  async _startSession({
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
        await this._linkAttemptToMonitoringSession(existing, normalizedContext, attemptId);
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
    await this._linkAttemptToMonitoringSession(session, normalizedContext, attemptId);
    return { session, isResumed: false };
  }

  async _linkAttemptToMonitoringSession(session, contextType, attemptId) {
    if (!session?.sessionId || !attemptId) return;
    const AttemptModel = contextType === 'CODING' ? CodingAttempt : contextType === 'QUIZ' ? QuizAttempt : null;
    if (!AttemptModel) return;

    const attempt = await AttemptModel.findByPk(Number(attemptId));
    if (attempt && attempt.monitoringSessionId !== session.sessionId) {
      await attempt.update({ monitoringSessionId: session.sessionId });
    }
  }

  async getSession(sessionId, options = {}) {
    if (!sessionId) return null;
    return MonitoringSession.findOne({
      ...options,
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
      startedAt: session.startedAt || session.createdAt || null,
      endedAt: session.endedAt || null,
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

  async startTestSession({ sessionId, attemptId = null, testStartedAt = null, configuredDurationSeconds = null, transaction = null }) {
    if (!transaction) return sequelize.transaction(transaction => this.startTestSession({ sessionId, attemptId, testStartedAt, configuredDurationSeconds, transaction }));
    const session = await MonitoringSession.findOne({
      where: { sessionId: String(sessionId) }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!session) throw new Error('Monitoring session not found');
    if (['COMPLETED', 'ABORTED'].includes(session.status)) return session;

    if (session.mobileEnabled && ['QUIZ', 'CODING'].includes(session.contextType) && !session.metadata?.mobileAdmission) {
      throw new Error('Complete mobile person and laptop verification before starting the test.');
    }

    const startTime = testStartedAt ? new Date(testStartedAt) : new Date();
    const validStartedAt = Number.isNaN(startTime.getTime()) ? new Date() : startTime;

    const existingMeta = session.metadata || {};
    const initialActiveSegments = existingMeta.activeSegments || [];
    
    // If no active segments or starting fresh, initialize first active segment
    const activeSegments = initialActiveSegments.length > 0 ? initialActiveSegments : [
      { start: validStartedAt.toISOString(), end: null, durationSec: 0, reason: 'INITIAL_START' }
    ];

    const updatedMetadata = {
      ...existingMeta,
      testStartedAt: existingMeta.testStartedAt || validStartedAt.toISOString(),
      currentSegmentStartedAt: validStartedAt.toISOString(),
      activeSegments,
      activeDurationSeconds: Number(existingMeta.activeDurationSeconds || 0),
      isPaused: false,
      ...(configuredDurationSeconds ? { configuredDurationSeconds: Number(configuredDurationSeconds) } : {})
    };

    if (!session.startedAt || ['CALIBRATING', 'READY'].includes(session.status)) {
      session.startedAt = validStartedAt;
    }
    session.status = 'ACTIVE';
    session.laptopStatus = 'ACTIVE';
    if (attemptId && !session.attemptId) {
      session.attemptId = Number(attemptId);
    }
    session.metadata = updatedMetadata;
    await session.save({ transaction });

    logger.info(`[MonitoringEngine] Test officially started for session ${sessionId} at ${validStartedAt.toISOString()}`);
    return session;
  }

  async pauseTestSession({ sessionId, pausedAt = null, reason = 'PAUSED', activeDurationSeconds = null, transaction = null }) {
    if (!transaction) return sequelize.transaction(transaction => this.pauseTestSession({ sessionId, pausedAt, reason, activeDurationSeconds, transaction }));
    const session = await this.getSession(sessionId, { transaction, lock: { level: transaction.LOCK.UPDATE, of: MonitoringSession } });
    if (!session) throw new Error('Monitoring session not found');
    if (['COMPLETED', 'ABORTED'].includes(session.status)) return session;

    const pauseTime = pausedAt ? new Date(pausedAt) : new Date();
    const validPausedAt = Number.isNaN(pauseTime.getTime()) ? new Date() : pauseTime;
    const existingMeta = session.metadata || {};

    let activeDuration = Number(activeDurationSeconds != null ? activeDurationSeconds : (existingMeta.activeDurationSeconds || 0));

    // Close any open active segment
    const activeSegments = Array.isArray(existingMeta.activeSegments) ? [...existingMeta.activeSegments] : [];
    const openSegment = activeSegments.find(s => !s.end);
    if (openSegment) {
      openSegment.end = validPausedAt.toISOString();
      const segStart = new Date(openSegment.start).getTime();
      const segDuration = Math.max(0, Math.round((validPausedAt.getTime() - segStart) / 1000));
      openSegment.durationSec = segDuration;
      if (activeDurationSeconds == null) {
        activeDuration = activeSegments.reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0);
      }
    }

    const pauseEvents = Array.isArray(existingMeta.pauseEvents) ? [...existingMeta.pauseEvents] : [];
    pauseEvents.push({
      pausedAt: validPausedAt.toISOString(),
      resumedAt: null,
      reason,
    });

    session.status = 'PAUSED';
    session.laptopStatus = 'PAUSED';
    session.metadata = {
      ...existingMeta,
      isPaused: true,
      lastPausedAt: validPausedAt.toISOString(),
      activeDurationSeconds: activeDuration,
      activeSegments,
      pauseEvents,
    };
    await session.save({ transaction });

    logger.info(`[MonitoringEngine] Test paused for session ${sessionId} at ${validPausedAt.toISOString()} (accumulated active: ${activeDuration}s)`);
    return session;
  }

  async resumeTestSession({ sessionId, resumedAt = null, reason = 'RESUMED', transaction = null }) {
    if (!transaction) return sequelize.transaction(transaction => this.resumeTestSession({ sessionId, resumedAt, reason, transaction }));
    const session = await this.getSession(sessionId, { transaction, lock: { level: transaction.LOCK.UPDATE, of: MonitoringSession } });
    if (!session) throw new Error('Monitoring session not found');
    if (['COMPLETED', 'ABORTED'].includes(session.status)) return session;

    const resumeTime = resumedAt ? new Date(resumedAt) : new Date();
    const validResumedAt = Number.isNaN(resumeTime.getTime()) ? new Date() : resumeTime;
    const existingMeta = session.metadata || {};

    // Close the latest open pause event
    const pauseEvents = Array.isArray(existingMeta.pauseEvents) ? [...existingMeta.pauseEvents] : [];
    const openPause = pauseEvents.slice().reverse().find(p => !p.resumedAt);
    if (openPause) {
      openPause.resumedAt = validResumedAt.toISOString();
      const pStart = new Date(openPause.pausedAt).getTime();
      openPause.breakDurationSec = Math.max(0, Math.round((validResumedAt.getTime() - pStart) / 1000));
    }

    // Start new active segment
    const activeSegments = Array.isArray(existingMeta.activeSegments) ? [...existingMeta.activeSegments] : [];
    // Ensure previous open segments are closed
    activeSegments.forEach(s => {
      if (!s.end) {
        s.end = validResumedAt.toISOString();
        s.durationSec = Math.max(0, Math.round((validResumedAt.getTime() - new Date(s.start).getTime()) / 1000));
      }
    });
    activeSegments.push({
      start: validResumedAt.toISOString(),
      end: null,
      durationSec: 0,
      reason,
    });

    session.status = 'ACTIVE';
    session.laptopStatus = 'ACTIVE';
    session.metadata = {
      ...existingMeta,
      isPaused: false,
      lastResumedAt: validResumedAt.toISOString(),
      currentSegmentStartedAt: validResumedAt.toISOString(),
      activeSegments,
      pauseEvents,
    };
    await session.save({ transaction });

    logger.info(`[MonitoringEngine] Test resumed for session ${sessionId} at ${validResumedAt.toISOString()}`);
    return session;
  }

  async syncTestDuration({ sessionId, activeDurationSeconds = 0, activeSegments = null, transaction = null }) {
    if (!transaction) return sequelize.transaction(transaction => this.syncTestDuration({ sessionId, activeDurationSeconds, activeSegments, transaction }));
    const session = await this.getSession(sessionId, { transaction, lock: { level: transaction.LOCK.UPDATE, of: MonitoringSession } });
    if (!session) throw new Error('Monitoring session not found');
    if (['COMPLETED', 'ABORTED'].includes(session.status)) return { success: true, activeDurationSeconds: session.metadata?.activeDurationSeconds || 0 };

    const existingMeta = session.metadata || {};
    const updatedSec = Math.max(Number(existingMeta.activeDurationSeconds || 0), Number(activeDurationSeconds || 0));

    session.metadata = {
      ...existingMeta,
      activeDurationSeconds: updatedSec,
      ...(activeSegments ? { activeSegments } : {}),
      lastDurationSyncAt: new Date().toISOString(),
    };
    await session.save({ transaction });
    return { success: true, activeDurationSeconds: updatedSec };
  }

  async validateLaptop({ sessionId, participantId, frame }) {
    if (!frame) throw new Error('frame data is required');

    const session = await this.getSession(sessionId);
    const configuredDuration = Number(session?.metadata?.configuredDurationSeconds) || 600;

    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/api/proctoring/analyze-frame`,
        {
          frame,
          sessionId: String(sessionId),
          timestampMs: Date.now(),
          configuredDuration,
        },
        { timeout: 4000, headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data;
      const violations = [];

      if (data?.success) {
        if (session) {
          session.lastLaptopHeartbeatAt = new Date();
          await session.save();
        }

        const faceCount = Number(data.face_count) || 0;
        const faceDetected = Boolean(data.face_detected ?? faceCount > 0);
        // Occupant presence can be proven even without facial landmarks (e.g.
        // the body/person fallback). "No person" only applies when neither the
        // face nor the body is detected.
        const personDetected = Boolean(data.person_detected ?? faceDetected);

        // Normalize gaze
        let rawGaze = String(data.gaze_direction || data.gaze_classification || '').toUpperCase();
        if (rawGaze.startsWith('OFF_SCREEN_')) rawGaze = rawGaze.replace('OFF_SCREEN_', '');
        const normGaze = ['STRAIGHT', 'CENTER', 'NOT DETECTED', 'NOT_DETECTED', 'UNKNOWN', 'ON_SCREEN'].includes(rawGaze)
          ? 'CENTER'
          : rawGaze;

        // Normalize head
        let rawHead = String(data.head_pose_classification || data.head_direction || '').toUpperCase();
        if (rawHead.startsWith('HEAD_LOOKING_')) rawHead = rawHead.replace('HEAD_LOOKING_', '');
        const normHead = ['STRAIGHT', 'CENTER', 'NOT DETECTED', 'NOT_DETECTED', 'UNKNOWN'].includes(rawHead)
          ? 'CENTER'
          : rawHead;

        const yaw = Number(data.head_pose?.yaw ?? data.yaw ?? 0);
        const pitch = Number(data.head_pose?.pitch ?? data.pitch ?? 0);
        const headPose = { yaw, pitch, roll: 0 };

        // 1. Face absence / Multiple persons
        if ((!faceDetected || faceCount === 0) && !personDetected) {
          violations.push({
            type: 'FACE_ABSENT',
            severity: 'WARNING',
            detail: 'Candidate face absent from laptop camera view',
          });
        } else if (faceCount > 1) {
          violations.push({
            type: 'MULTIPLE_FACES',
            severity: 'HIGH',
            detail: `Multiple persons detected (${faceCount} faces in view)`,
          });
        }

        // 2. Gaze deviation (Down is ignored/permitted for reading)
        if (normGaze !== 'CENTER' && normGaze !== 'DOWN') {
          violations.push({
            type: `GAZE_OFF_SCREEN_${normGaze}`,
            severity: 'WARNING',
            detail: `Gaze deviated ${normGaze}`,
          });
        }

        // 3. Head pose deviation (Down is ignored/permitted for reading)
        if (normHead !== 'CENTER' && normHead !== 'DOWN') {
          violations.push({
            type: `HEAD_LOOKING_${normHead}`,
            severity: 'WARNING',
            detail: `Head turned ${normHead}`,
          });
        }

        return {
          ...data,
          face_detected: faceDetected,
          face_count: faceCount,
          person_detected: personDetected,
          gaze_direction: normGaze,
          gaze_classification: normGaze === 'CENTER' ? 'ON_SCREEN' : `OFF_SCREEN_${normGaze}`,
          gaze_confidence: Number(data.gaze_confidence) || 0.9,
          head_direction: normHead,
          head_pose_classification: normHead,
          head_pose: headPose,
          head_confidence: Number(data.head_confidence) || 0.85,
          violations,
        };
      }

      return {
        ...data,
        violations: [],
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

    let session = null;
    try { session = await this.getSession(sessionId); } catch (_) { session = null; }
    const configuredDuration = Number(session?.metadata?.configuredDurationSeconds) || 600;

    try {
      const response = await axios.post(
        `${AI_SERVICE_URL}/api/proctoring/validate-calibration`,
        {
          frame,
          sessionId: String(sessionId),
          configuredDuration,
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

  async validateMobile({ sessionId, participantId, frame, confidenceThreshold = 0.35, verificationSession = null }) {
    if (!frame) throw new Error('frame data is required');
    const ownedSession = await this.getSession(sessionId);
    if (!ownedSession || Number(ownedSession.participantId) !== Number(participantId)) throw new Error('Monitoring session not found');
    if (['QUIZ', 'CODING'].includes(ownedSession.contextType)) {
      if (!verificationSession || Number(verificationSession.attempt_id) !== Number(ownedSession.attemptId) ||
          verificationSession.assessment_type !== ownedSession.contextType ||
          Number(verificationSession.participant_id) !== Number(participantId)) {
        throw new Error('A paired mobile camera is required');
      }
      return this.validateAssessmentMobile({ session: ownedSession, verificationSession, frame });
    }

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
                    status: 'IN_PROGRESS'
                  },
                  order: [['id', 'DESC']],
                });
                if (qa) {
                  resolvedAttemptId = qa.id;
                } else {
                  const ca = await CodingAttempt.findOne({
                    where: {
                      participantId: session.participantId,
                      status: 'IN_PROGRESS'
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

          const commonMetadata = {
            composition_state: data.composition_state,
            user_message: data.user_message,
            detections,
          };
          const mobileViolation = hasPhone
            ? { eventType: 'PHONE_DETECTED', severity: 'CRITICAL', confidence: data.proctoring_event?.confidence || 0.92 }
            : hasMultiPerson
              ? { eventType: 'MULTIPLE_FACES', severity: 'HIGH', confidence: data.proctoring_event?.confidence || 0.90, metadata: { person_count: mobilePersonCount } }
              : hasSecondaryScreen
                ? { eventType: 'SECONDARY_DEVICE', severity: 'HIGH', confidence: 0.88 }
                : hasBookNotes
                  ? { eventType: 'BOOK_NOTES_DETECTED', severity: 'HIGH', confidence: 0.85 }
                  : null;

          await this.trackMobileViolation({
            session,
            attemptId: resolvedAttemptId,
            participantId: session.participantId,
            violation: mobileViolation,
            metadata: { ...commonMetadata, ...(mobileViolation?.metadata || {}) },
          });

          if (hasPhone) {
            const flags = Array.isArray(session.integrityFlags) ? [...session.integrityFlags] : [];
            if (!flags.includes('UNAUTHORIZED_PHONE_DETECTED')) {
              flags.push('UNAUTHORIZED_PHONE_DETECTED');
              session.integrityFlags = flags;
              await session.save();
            }
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

  async validateAssessmentMobile({ session, verificationSession, frame }) {
    this.mobileFrameJobs ||= new Set();
    if (this.mobileFrameJobs.has(session.sessionId)) return { success: false, busy: true };
    this.mobileFrameJobs.add(session.sessionId);
    try {
      if (['COMPLETED', 'ABORTED'].includes(session.status)) return { success: false, ended: true };
      const receivedAt = Date.now();
      const { data } = await axios.post(`${AI_SERVICE_URL}/api/proctoring/yolo/analyze-frame`, {
        frame, sessionId: verificationSession.session_id + ':' + crypto.createHash('sha256').update(verificationSession.token).digest('hex').slice(0, 16) + (session.status === 'ACTIVE' && verificationSession.status === 'USED' ? ':active' : ':verification'), participantId: session.participantId,
        moduleType: session.contextType, cameraSource: 'MOBILE_CAMERA', confidenceThreshold: 0.35,
        timestampMs: receivedAt,
      }, { timeout: 10000 }); // CPU cold inference can exceed four seconds; never queue a second frame.
      if (!data?.success || !data.mobile_evidence) return { success: false, composition_state: 'DISCONNECTED' };
      const evidence = { ...data.mobile_evidence, receivedAt, verificationSessionId: verificationSession.session_id, pairingVersion: crypto.createHash('sha256').update(verificationSession.token).digest('hex') };
      // Save a bounded freshness lease, not a frame history. Transitions save
      // immediately; unchanged evidence saves at most once every two seconds.
      await sequelize.transaction(async transaction => {
        const current = await MonitoringSession.findOne({ where: { sessionId: session.sessionId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!current || ['COMPLETED', 'ABORTED'].includes(current.status)) return;
        const prior = current.metadata?.mobileEvidence || {};
        if (prior.eligible !== evidence.eligible || prior.verificationSessionId !== evidence.verificationSessionId || prior.pairingVersion !== evidence.pairingVersion || receivedAt - (prior.receivedAt || 0) >= 2000) {
          await current.update({ mobileStatus: data.composition_state, lastMobileHeartbeatAt: new Date(receivedAt),
            metadata: { ...current.metadata, mobileEvidence: evidence } }, { transaction });
        }
      });
      // Pre-entry observations never award marks. The database unique key is
      // scoped to the attempt and survives process restarts and repeat sessions.
      if (session.status === 'ACTIVE' && evidence.phone_stable && verificationSession.status === 'USED' && !session.metadata?.mobile_phone_score_awarded) {
        await this.reportEvent({ sessionId: session.sessionId, participantId: session.participantId,
          source: 'MOBILE', eventType: 'PHONE_DETECTED', severity: 'HIGH',
          confidence: evidence.phone_confidence, serverMobileDetection: true,
          metadata: { mobileEvidence: evidence, detector: 'YOLO', cameraSource: 'MOBILE_CAMERA' } });
      }
      if (session.status === 'ACTIVE' && verificationSession.status === 'USED') {
        await this.trackMobileViolation({ session, attemptId: session.attemptId, participantId: session.participantId,
          violation: evidence.other_violation ? { eventType: evidence.other_violation, severity: 'HIGH', confidence: evidence.other_confidence } : null,
          metadata: { composition_state: data.composition_state, detections: data.detections } });
      }
      return { ...data, mobile_evidence: evidence };
    } catch (err) {
      logger.warn(`[MonitoringEngine] Mobile inference unavailable: ${err.message}`);
      return { success: false, composition_state: 'DISCONNECTED', user_message: 'Mobile detection unavailable. Keep the camera open and retry.' };
    } finally {
      this.mobileFrameJobs.delete(session.sessionId);
    }
  }

  async trackMobileViolation({ session, attemptId, participantId, violation, metadata = {}, now = Date.now() }) {
    const key = session.sessionId;
    const active = this.activeMobileViolations.get(key);
    if (active && (!violation || active.eventType !== violation.eventType)) {
      const durationMs = Math.max(0, now - active.startedAt);
      await this.reportEvent({
        sessionId: key,
        attemptId: active.attemptId,
        participantId: active.participantId,
        source: 'MOBILE',
        eventType: active.eventType,
        severity: active.severity,
        durationMs,
        occurredAt: new Date(now).toISOString(),
        confidence: active.confidence,
        metadata: {
          ...active.metadata,
          violationStartTime: new Date(active.startedAt).toISOString(),
          violationEndTime: new Date(now).toISOString(),
        },
      });
      this.activeMobileViolations.delete(key);
    }

    if (violation && (!active || active.eventType !== violation.eventType)) {
      this.activeMobileViolations.set(key, {
        ...violation,
        metadata,
        attemptId,
        participantId,
        startedAt: now,
      });
    }
  }

  // ── Authoritative Server-Side Scoring & Event Ingestion ──────────────────

  async reportEvent(args) {
    // Serialize counts and counter updates for events in the same session.
    const previous = this.pendingEventWrites.get(args.sessionId) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => sequelize.transaction(transaction => this._reportEvent({ ...args, transaction })));
    this.pendingEventWrites.set(args.sessionId, operation);
    try { return await operation; }
    finally { if (this.pendingEventWrites.get(args.sessionId) === operation) this.pendingEventWrites.delete(args.sessionId); }
  }

  async _reportEvent({
    sessionId,
    transaction,
    attemptId = null,
    participantId,
    source = 'LAPTOP',
    eventType,
    severity = 'INFO',
    durationMs = 0,
    occurredAt = null,
    confidence = 1.0,
    evidenceRef = null,
    metadata = {},
    idempotencyKey = null,
    serverMobileDetection = false,
  }) {
    if (!sessionId || !eventType) {
      throw new Error('sessionId and eventType are required');
    }

    const session = await this.getSession(sessionId, { transaction, lock: { level: transaction.LOCK.UPDATE, of: MonitoringSession } });
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
          await session.save({ transaction });
        } else {
          const qa = await QuizAttempt.findOne({ where: { monitoringSessionId: session.sessionId } });
          if (qa) {
            resolvedAttemptId = qa.id;
            session.attemptId = resolvedAttemptId;
            await session.save({ transaction });
          } else {
            const ca = await CodingAttempt.findOne({ where: { monitoringSessionId: session.sessionId } });
            if (ca) {
              resolvedAttemptId = ca.id;
              session.attemptId = resolvedAttemptId;
              await session.save({ transaction });
            }
          }
        }
      } catch (_) {}

      if (!resolvedAttemptId && session.participantId && session.contextId) {
        const Attempt = session.contextType === 'CODING' ? CodingAttempt : session.contextType === 'QUIZ' ? QuizAttempt : null;
        if (Attempt) {
          const att = await Attempt.findOne({
            where: { participantId: session.participantId, status: 'IN_PROGRESS',
              [session.contextType === 'CODING' ? 'assessmentId' : 'quizId']: session.contextId },
            order: [['id', 'DESC']],
          });
          if (att) { resolvedAttemptId = att.id; session.attemptId = att.id; await session.save({ transaction }); }
        }
      }
    }

    const config = await this.getConfig(session.contextType);
    const normalizedSource = String(source).toUpperCase() === 'MOBILE' ? 'MOBILE' : 'LAPTOP';
    const mobilePhone = ['QUIZ', 'CODING'].includes(session.contextType) && normalizedSource === 'MOBILE' && ['PHONE_DETECTED', 'CELL_PHONE_DETECTED'].includes(eventType);
    if (mobilePhone && !serverMobileDetection) return { skipped: true, reason: 'SERVER_MOBILE_DETECTION_REQUIRED', session };
    const normalizedSeverity = (severity || 'INFO').toUpperCase();

    const now = Date.now();
    const reportedAt = occurredAt ? new Date(occurredAt) : new Date(now);
    const validReportedAt = Number.isNaN(reportedAt.getTime()) ? new Date(now) : reportedAt;

    const browserEvent = BROWSER_EVENT_TYPES.has(eventType);
    const discreteBrowserIncident = browserEvent && typeof metadata.browserIncidentId === 'string' && metadata.browserIncidentId.length <= 128 && Number(durationMs) >= 2000;

    // Ensure test is active and event is not from pre-test calibration
    if (session.status !== 'ACTIVE' && session.status !== 'PAUSED' && !(discreteBrowserIncident && session.status === 'COMPLETED' && session.endedAt && validReportedAt <= new Date(session.endedAt))) {
      logger.info(`[MonitoringEngine] Dropping pre-test event ${eventType} for session ${sessionId} (status=${session.status})`);
      return { skipped: true, reason: 'TEST_NOT_ACTIVE', session };
    }
    if (session.startedAt && validReportedAt < new Date(session.startedAt)) {
      logger.info(`[MonitoringEngine] Dropping event ${eventType} prior to test start for session ${sessionId}`);
      return { skipped: true, reason: 'BEFORE_TEST_START', session };
    }

    // 1. Debounce Check
    const cooldowns = config.cooldowns_ms || {};
    const isGranularEyeHead = /^GAZE_OFF_SCREEN_(LEFT|RIGHT|UP)$/.test(eventType) || /^HEAD_LOOKING_(LEFT|RIGHT|UP)$/.test(eventType);
    const defaultCooldown = isGranularEyeHead ? 600 : (cooldowns.default || 4000);
    const cooldownMs =
      eventType.includes('GAZE') ? (isGranularEyeHead ? 600 : (cooldowns.gaze || defaultCooldown))
      : eventType.includes('HEAD') ? (isGranularEyeHead ? 600 : (cooldowns.head_pose || defaultCooldown))
      : eventType.includes('FACE') ? (cooldowns.face_absence || defaultCooldown)
      : defaultCooldown;

    const cooldownKey = `${sessionId}_${normalizedSource}_${eventType}`;
    const lastTriggered = this.inMemoryCooldowns.get(cooldownKey) || 0;

    if (!discreteBrowserIncident && now - lastTriggered < cooldownMs && normalizedSeverity !== 'CRITICAL') {
      return { skipped: true, reason: 'DEBOUNCED', session };
    }

    // 2. Idempotency Key Generation / Verification
    const finalIdempotencyKey = mobilePhone ? `mobile_phone_${session.contextType}_${session.participantId}_${session.attemptId || session.sessionId}` : discreteBrowserIncident ? ('browser_' + crypto.createHash('sha256').update(sessionId + ':' + metadata.browserIncidentId).digest('hex')) : idempotencyKey || `${sessionId}_${normalizedSource}_${eventType}_${validReportedAt.getTime()}_${Number(durationMs) || 0}`;
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
      transaction,
      where: { monitoringSessionId: session.sessionId },
    });

    const priorBrowserEvents = browserEvent ? await MonitoringEvent.findAll({
      transaction,
      where: { monitoringSessionId: session.sessionId, eventType: { [Op.in]: [...BROWSER_EVENT_TYPES] } },
    }) : [];
    const browserSwitchCount = aggregateMonitoringEvents(priorBrowserEvents.map(row => row.toJSON ? row.toJSON() : row)).length + 1;
    const isGraceWarning = mobilePhone ? false : browserEvent ? browserSwitchCount <= BROWSER_SWITCH_LIMIT : existingEventsCount < 3;
    const warningNumber = browserEvent ? browserSwitchCount : existingEventsCount + 1;
    const effectiveScoreDelta = mobilePhone ? 10 : browserEvent
      ? (browserSwitchCount === BROWSER_SWITCH_LIMIT + 1 ? BROWSER_SWITCH_PENALTY : 0)
      : (isGraceWarning ? 0 : scoreDelta);

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
        transaction,
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
          occurredAt: validReportedAt,
          confidence: conf,
          evidenceRef,
          metadata: {
            ...metadata,
            violationStartTime: metadata?.violationStartTime || new Date(validReportedAt.getTime() - (Number(durationMs) || 0)).toISOString(),
            violationEndTime: metadata?.violationEndTime || validReportedAt.toISOString(),
            isGraceWarning,
            warningNumber,
            warningMessage,
          },
        },
      });
      event = ev;
      created = wasCreated;
    } catch (concurrencyErr) {
      event = await MonitoringEvent.findOne({ transaction, where: { idempotencyKey: finalIdempotencyKey } });
      created = false;
    }

    if (!created && event) {
      return { skipped: true, reason: 'IDEMPOTENT_DUPLICATE', event, session, browserSwitchCount: session.metadata?.browserSwitchCount };
    }
    if (!event) {
      throw new Error('Monitoring event persistence failed');
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
        ...(mobilePhone ? { metadata: { ...session.metadata, mobile_phone_detected: true, mobile_phone_score_awarded: true } } : {}),
        ...(browserEvent ? { metadata: { ...session.metadata, browserSwitchCount,
          tabSwitchScore: browserSwitchCount > BROWSER_SWITCH_LIMIT ? BROWSER_SWITCH_PENALTY : 0 } } : {}),
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

      await session.update(updateData, { transaction });

      // Cross-persist to ProctoringEvent for complete report compatibility
      try {
        const { ProctoringEvent } = require('../models');
        if (ProctoringEvent && (resolvedAttemptId || session.attemptId || session.sessionId)) {
          await ProctoringEvent.findOrCreate({
            transaction,
            where: { idempotencyKey: finalIdempotencyKey },
            defaults: {
              monitoringSessionId: session.sessionId,
              attemptId: resolvedAttemptId || session.attemptId,
              participantId: session.participantId,
              quizId: session.contextType === 'QUIZ' ? session.contextId : null,
              eventType,
              severity: normalizedSeverity,
              confidence: conf,
              duration: Math.round(Number(durationMs) / 100) / 10,
              timestamp: validReportedAt,
              metadata: {
                ...metadata,
                violationStartTime: metadata?.violationStartTime || new Date(validReportedAt.getTime() - (Number(durationMs) || 0)).toISOString(),
                violationEndTime: metadata?.violationEndTime || validReportedAt.toISOString(),
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
      if (session.status === 'COMPLETED') await this.persistFinalAudit(session.sessionId, transaction);

      return {
        success: true,
        event,
        isGraceWarning,
        warningNumber,
        maxWarnings: 3,
        warningMessage,
        scoreDelta: effectiveScoreDelta,
        currentScore: newScore,
        ...(browserEvent ? { browserSwitchCount, tabSwitchScore: browserSwitchCount > BROWSER_SWITCH_LIMIT ? BROWSER_SWITCH_PENALTY : 0 } : {}),
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

  async saveSessionVideo({ sessionId, attemptId, participantId, videoUrl, filename }) {
    let session = null;
    const finalUrl = videoUrl || (filename ? `/uploads/monitoring-videos/${filename}` : null);

    if (sessionId) {
      session = await this.getSession(sessionId);
      if (!session) {
        session = await MonitoringSession.findOne({
          where: {
            [Op.or]: [
              { sessionId: String(sessionId) },
              ...(Number(sessionId) ? [{ attemptId: Number(sessionId) }] : []),
            ]
          },
          order: [['id', 'DESC']]
        });
      }
    }
    if (!session && attemptId) {
      session = await MonitoringSession.findOne({
        where: { attemptId: Number(attemptId) },
        order: [['id', 'DESC']]
      });
    }
    if (!session && participantId) {
      session = await MonitoringSession.findOne({
        where: { participantId },
        order: [['id', 'DESC']]
      });
    }

    if (session && finalUrl) {
      session.videoUrl = finalUrl;
      await session.save();
      logger.info(`[MonitoringEngine] Saved monitoring video for session ${session.sessionId}: ${finalUrl}`);
    } else {
      logger.warn(`[MonitoringEngine] No active MonitoringSession found to associate video (${sessionId || attemptId}), saved at ${finalUrl}`);
    }

    return {
      success: true,
      sessionId: session?.sessionId || sessionId,
      videoUrl: finalUrl,
    };
  }

  async endSession({ sessionId, participantId, actualTestDurationSeconds = null, activeSegments = null }) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Monitoring session not found');

    await this.trackMobileViolation({
      session,
      attemptId: session.attemptId,
      participantId: participantId || session.participantId,
      violation: null,
    });

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

    const endTime = new Date();
    const existingMeta = session.metadata || {};

    // Finalize open active segment if any
    let finalActiveSegments = activeSegments || (Array.isArray(existingMeta.activeSegments) ? [...existingMeta.activeSegments] : []);
    const openSegment = finalActiveSegments.find(s => !s.end);
    if (openSegment) {
      openSegment.end = endTime.toISOString();
      const segStart = new Date(openSegment.start).getTime();
      openSegment.durationSec = Math.max(0, Math.round((endTime.getTime() - segStart) / 1000));
    }

    let finalActiveDurationSec = null;
    if (actualTestDurationSeconds != null && Number(actualTestDurationSeconds) > 0) {
      finalActiveDurationSec = Number(actualTestDurationSeconds);
    } else if (finalActiveSegments.length > 0) {
      finalActiveDurationSec = finalActiveSegments.reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0);
    } else if (existingMeta.activeDurationSeconds != null && Number(existingMeta.activeDurationSeconds) > 0) {
      finalActiveDurationSec = Number(existingMeta.activeDurationSeconds);
    }

    session.integrityFlags = flags;
    session.status = 'COMPLETED';
    session.laptopStatus = 'COMPLETED';
    session.endedAt = endTime;
    session.metadata = {
      ...existingMeta,
      isPaused: false,
      endedAt: endTime.toISOString(),
      activeSegments: finalActiveSegments,
      ...(finalActiveDurationSec != null ? {
        actualTestDurationSeconds: finalActiveDurationSec,
        activeDurationSeconds: finalActiveDurationSec,
      } : {}),
    };
    await session.save();

    logger.info(`[MonitoringEngine] Ended session ${sessionId} (actual active test duration: ${finalActiveDurationSec}s) with ${flags.length} integrity flags`);

    // Refresh the segment pipeline status: if segments are still uploading or
    // queued for the AI service, surface WAITING_FOR_PROCESSING immediately so
    // trainers see results arrive asynchronously instead of stalling.
    try {
      const videoService = require('./monitoringVideoService');
      await videoService.aggregateSession(sessionId);
    } catch (err) {
      logger.warn(`[MonitoringEngine] aggregateSession after endSession failed: ${err.message}`);
    }

    return this.persistFinalAudit(session.sessionId);
  }

  async persistFinalAudit(sessionId, transaction = null) {
    if (!transaction) return sequelize.transaction(transaction => this.persistFinalAudit(sessionId, transaction));
    const session = await this.getSession(sessionId, { transaction, lock: { level: transaction.LOCK.UPDATE, of: MonitoringSession } });
    const report = await this.getReport({ sessionId, transaction });
    await session.update({ score: report.finalScore, riskLevel: report.riskLevel,
      metadata: { ...session.metadata, browserSwitchCount: report.tabSwitchCount, tabSwitchScore: report.tabSwitchScore,
        finalAudit: { score: report.finalScore, scoringBreakdown: report.scoringBreakdown, totalEvents: report.totalEvents } } }, { transaction });
    return report;
  }

  async getReport({ sessionId, attemptId = null, contextType = 'QUIZ', contextId = null, transaction = null }) {
    contextType = String(contextType).toUpperCase();
    if (!['QUIZ', 'CODING', 'INTERVIEW'].includes(contextType)) throw new Error('Invalid monitoring context type');
    let session = null;
    if (sessionId) {
      session = await this.getSession(sessionId, transaction ? { transaction } : {});
    }
    if (!session && attemptId) {
      session = await MonitoringSession.findOne({
        where: { attemptId: Number(attemptId), contextType, ...(contextId ? { contextId: Number(contextId) } : {}) },
        order: [['id', 'DESC']],
        include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
      });
    }

    // Bridge lookup: If not found in MonitoringSession, resolve from QuizAttempt, CodingAttempt, or ProctoringSession
    if (!session) {
      const { QuizAttempt, CodingAttempt, ProctoringSession } = require('../models');
      let att = null;
      let isQuiz = true;

      if (attemptId) {
        isQuiz = contextType === 'QUIZ';
        if (!['QUIZ', 'CODING'].includes(contextType)) throw new Error('Monitoring session not found');
        const Attempt = isQuiz ? QuizAttempt : CodingAttempt;
        att = await Attempt.findOne({
          where: { id: Number(attemptId), ...(contextId ? { [isQuiz ? 'quizId' : 'assessmentId']: Number(contextId) } : {}) },
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
        });
      } else if (sessionId) {
        att = await QuizAttempt.findOne({
          where: { monitoringSessionId: sessionId },
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
        });
        if (!att) {
          att = await CodingAttempt.findOne({
            where: { monitoringSessionId: sessionId },
            include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
          });
          if (att) isQuiz = false;
        }
      }

      if (att) {
        const sId = att.monitoringSessionId || sessionId || `ms_${isQuiz ? 'quiz' : 'coding'}_${att.id}_${Date.now()}`;
        const [monSess] = await MonitoringSession.findOrCreate({
          where: { sessionId: sId, contextType: isQuiz ? 'QUIZ' : 'CODING' },
          defaults: {
            sessionId: sId,
            attemptId: att.id,
            participantId: att.participantId,
            contextType: isQuiz ? 'QUIZ' : 'CODING',
            contextId: isQuiz ? att.quizId : att.assessmentId,
            status: att.status === 'SUBMITTED' ? 'COMPLETED' : 'ACTIVE',
            startedAt: att.startedAt || new Date(),
            endedAt: att.submittedAt || null,
            submittedAt: att.submittedAt || null,
          },
        });
        session = await MonitoringSession.findByPk(monSess.id, {
          include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
        });
      }
    }

    if (!session) throw new Error('Monitoring report / session not found');

    // Query from both MonitoringEvent and ProctoringEvent to guarantee 0 missing events
    const { ProctoringEvent } = require('../models');
    const monitoringEvents = await MonitoringEvent.findAll({
      ...(transaction ? { transaction } : {}),
      where: { monitoringSessionId: session.sessionId },
      order: [['occurredAt', 'ASC']],
    });
    if (['QUIZ', 'CODING'].includes(session.contextType) && session.attemptId) {
      const award = await MonitoringEvent.findOne({ ...(transaction ? { transaction } : {}), where: {
        idempotencyKey: `mobile_phone_${session.contextType}_${session.participantId}_${session.attemptId}`,
      } });
      if (award && !monitoringEvents.some(e => e.id === award.id)) monitoringEvents.push(award);
    }

    let proctoringEvents = [];
    if (ProctoringEvent && session.attemptId) {
      try {
        proctoringEvents = await ProctoringEvent.findAll({
          ...(transaction ? { transaction } : {}),
          where: { monitoringSessionId: session.sessionId },
          order: [['timestamp', 'ASC']],
        });
      } catch (_) {}
    }

    // Merge and deduplicate events
    const seenKeys = new Set();
    const rawEvents = [];

    for (const me of monitoringEvents) {
      const key = me.idempotencyKey || `${me.source}_${me.eventType}_${new Date(me.occurredAt).getTime()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        rawEvents.push({
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
        rawEvents.push({
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

    const mergedEvents = aggregateMonitoringEvents(rawEvents);

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
      const isGrace = ev.metadata?.isGraceWarning === true;
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
      face: mergedEvents.filter((e) => ['FACE_ABSENT', 'FACE_NOT_DETECTED', 'FACE_NOT_VISIBLE', 'PARTICIPANT_ABSENT'].includes(e.eventType)).length,
      gaze: mergedEvents.filter((e) => e.eventType.includes('GAZE') || e.eventType.includes('EYES_LOOKING')).length,
      headPose: mergedEvents.filter((e) => e.eventType.includes('HEAD')).length,
      facePresence: mergedEvents.filter((e) => e.eventType.includes('FACE')).length,
      persons: mergedEvents.filter((e) => ['MULTIPLE_PERSONS_DETECTED', 'MULTIPLE_FACES'].includes(e.eventType)).length,
      devices: mergedEvents.filter((e) => e.eventType.includes('PHONE') || e.eventType.includes('DEVICE') || e.eventType.includes('CELL_PHONE')).length,
      objects: mergedEvents.filter((e) => e.eventType.includes('PHONE') || e.eventType.includes('DEVICE') || e.eventType.includes('CELL_PHONE') || e.eventType.includes('BOOK') || e.eventType.includes('LAPTOP_DETECTED')).length,
      browserSecurity: mergedEvents.filter((e) =>
        ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'WINDOW_BLUR', 'DEVTOOLS_OPENED', 'WINDOW_FOCUS_LOST'].includes(e.eventType)
      ).length,
      composition: mergedEvents.filter((e) => e.eventType.includes('COMPOSITION')).length,
    };

    let sessionEndedAt = session.endedAt;
    let sessionStartedAt = session.startedAt || session.createdAt;
    let configuredDurationSec = Number(session.metadata?.configuredDurationSeconds || session.metadata?.duration || 0);
    let attemptTimeTakenSec = null;

    // Authoritative ACTIVE test duration calculation:
    // Exclude break, pause, inactive, disconnected periods.
    let authoritativeActiveDurationSec = null;

    // 1. Check metadata.actualTestDurationSeconds or metadata.activeDurationSeconds
    if (session.metadata?.actualTestDurationSeconds != null && Number(session.metadata.actualTestDurationSeconds) > 0) {
      authoritativeActiveDurationSec = Number(session.metadata.actualTestDurationSeconds);
    } else if (session.metadata?.activeDurationSeconds != null && Number(session.metadata.activeDurationSeconds) > 0) {
      authoritativeActiveDurationSec = Number(session.metadata.activeDurationSeconds);
    }

    // 2. If activeSegments exist, sum completed valid active segments
    if (authoritativeActiveDurationSec == null && Array.isArray(session.metadata?.activeSegments) && session.metadata.activeSegments.length > 0) {
      const sumSegs = session.metadata.activeSegments.reduce((sum, seg) => {
        if (seg.durationSec != null && seg.durationSec > 0) return sum + Number(seg.durationSec);
        if (seg.start && seg.end) {
          return sum + Math.max(0, Math.round((new Date(seg.end).getTime() - new Date(seg.start).getTime()) / 1000));
        }
        return sum;
      }, 0);
      if (sumSegs > 0) authoritativeActiveDurationSec = sumSegs;
    }

    // Fallback: If attemptId exists, check QuizAttempt or CodingAttempt for exact submission time & quiz limit
    if (session.attemptId) {
      try {
        const { QuizAttempt, CodingAttempt, AIQuiz, CodingAssessment } = require('../models');
        const qa = session.contextType === 'QUIZ' ? await QuizAttempt.findByPk(session.attemptId, {
          include: [{ model: AIQuiz, as: 'quiz' }]
        }) : null;
        if (qa) {
          if (qa.timeTaken && qa.timeTaken > 0) attemptTimeTakenSec = Number(qa.timeTaken);
          if (!sessionEndedAt && qa.submittedAt) sessionEndedAt = qa.submittedAt;
          if (!configuredDurationSec && qa.quiz?.timeLimit) {
            configuredDurationSec = Number(qa.quiz.timeLimit) * 60;
          }
        } else if (session.contextType === 'CODING') {
          const ca = await CodingAttempt.findByPk(session.attemptId, {
            include: [{ model: CodingAssessment, as: 'assessment' }]
          });
          if (ca) {
            if (ca.timeTaken && ca.timeTaken > 0) attemptTimeTakenSec = Number(ca.timeTaken);
            if (!sessionEndedAt && ca.submittedAt) sessionEndedAt = ca.submittedAt;
            if (!configuredDurationSec && ca.assessment?.timeLimit) {
              configuredDurationSec = Number(ca.assessment.timeLimit) * 60;
            }
          }
        }
      } catch (err) {
        logger.warn(`[getReport] Attempt metadata lookup note: ${err.message}`);
      }
    }

    // Also check session.contextId if configuredDurationSec is not yet found
    if (!configuredDurationSec && session.contextId) {
      try {
        const { AIQuiz, CodingAssessment } = require('../models');
        if (session.contextType === 'CODING') {
          const ca = await CodingAssessment.findByPk(session.contextId);
          if (ca?.timeLimit) configuredDurationSec = Number(ca.timeLimit) * 60;
        } else {
          const q = await AIQuiz.findByPk(session.contextId);
          if (q?.timeLimit) configuredDurationSec = Number(q.timeLimit) * 60;
        }
      } catch (_) {}
    }

    if (!configuredDurationSec) configuredDurationSec = 600;

    // Actual participant test duration (elapsed time strictly from real active test time)
    let totalDurationSec;
    if (authoritativeActiveDurationSec != null && authoritativeActiveDurationSec > 0) {
      totalDurationSec = authoritativeActiveDurationSec;
      logger.info(
        `[getReport] Actual test duration ${totalDurationSec}s derived from authoritative active test duration. ` +
        `attemptId=${session.attemptId}`
      );
    } else if (attemptTimeTakenSec != null && attemptTimeTakenSec > 0) {
      totalDurationSec = attemptTimeTakenSec;
    } else if (sessionEndedAt && sessionStartedAt) {
      totalDurationSec = Math.max(1, Math.round((new Date(sessionEndedAt) - new Date(sessionStartedAt)) / 1000));
    } else {
      totalDurationSec = Math.max(1, Math.round((Date.now() - new Date(sessionStartedAt).getTime()) / 1000));
    }

    // Safety cap: If no active segments were recorded and totalDurationSec exceeds configuredDuration + 2 min grace,
    // prevent unbounded disconnected/break inflation if attempt had a configured limit.
    if (authoritativeActiveDurationSec == null && configuredDurationSec > 0 && totalDurationSec > (configuredDurationSec + 120)) {
      totalDurationSec = configuredDurationSec;
    }

    // Dynamic Real Tracking Coverage Calculations (derived from actual test detection data)
    const faceAbsentSec = scoredEvents
      .filter((e) => ['FACE_ABSENT', 'FACE_NOT_DETECTED', 'FACE_NOT_VISIBLE', 'PARTICIPANT_ABSENT'].includes(e.eventType))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 0), 0);

    const gazeDeviationSec = scoredEvents
      .filter((e) => e.eventType.includes('GAZE') || e.eventType.includes('EYES_LOOKING'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 0), 0);

    const headDeviationSec = scoredEvents
      .filter((e) => e.eventType.includes('HEAD'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 0), 0);

    const bodyFramingSec = scoredEvents
      .filter((e) => e.eventType.includes('BODY') || e.eventType.includes('SHOULDER'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 0), 0);

    const camDropSec = scoredEvents
      .filter((e) => e.eventType.includes('CAMERA_DISCONNECTED') || e.eventType.includes('MOBILE_DISCONNECTED'))
      .reduce((acc, c) => acc + (c.durationMs ? c.durationMs / 1000 : Number(c.duration) || 10), 0);

    const phoneViolations = scoredEvents.filter((e) =>
      (e.eventType === 'PHONE_DETECTED' || e.eventType === 'CELL_PHONE_DETECTED') &&
      (session.contextType === 'INTERVIEW' || (e.source === 'MOBILE' && e.metadata?.mobileEvidence?.phone_stable))
    );

    // ── Exact Eye + Head Violation Duration & Interval Merging ──────────────
    // Collect intervals for 6 categories (Head Left, Right, Up; Eye Left, Right, Up)
    // Ignored direction: Down (permitted for reading/coding)
    // NOTE: No 3.0s minimum. Every positive-duration interval is accumulated.
    const eyeHeadIntervals = [];
    const sessionStartMs = new Date(sessionStartedAt).getTime();

    for (const ev of scoredEvents) {
      const typeStr = (ev.eventType || '').toUpperCase();
      const dirStr = (ev.metadata?.direction || ev.direction || '').toUpperCase();

      const isEyeOrHead = (
        typeStr.includes('GAZE') ||
        typeStr.includes('EYE') ||
        typeStr.includes('HEAD') ||
        ev.source === 'LAPTOP' && (dirStr.includes('LEFT') || dirStr.includes('RIGHT') || dirStr.includes('UP'))
      );
      const isIgnoredDown = typeStr.includes('DOWN') || dirStr.includes('DOWN');

      if (isEyeOrHead && !isIgnoredDown) {
        const durSec = ev.durationMs ? ev.durationMs / 1000 : (Number(ev.duration) || 0);
        const bounds = eventIntervalBounds(ev);
        const startSec = Math.max(0, (bounds.start - sessionStartMs) / 1000);
        const endSec = Math.max(startSec, (bounds.end - sessionStartMs) / 1000);

        // No minimum-duration validation here — short violations must count.
        if (durSec > 0) {
          eyeHeadIntervals.push([startSec, endSec]);
        }
      }
    }

    // Diagnostic: make a true "0 Eye+Head" distinguishable from a missing AI result.
    // A 0 that results from zero Eye/Head events arriving is logged as a pipeline gap,
    // while a 0 that results from real (empty) intervals is expected.
    if (eyeHeadIntervals.length === 0) {
      const eyeHeadEventCount = mergedEvents.filter((e) => {
        const t = (e.eventType || '').toUpperCase();
        return t.includes('GAZE') || t.includes('EYE') || t.includes('HEAD');
      }).length;
      logger.warn(
        `[getReport] Eye+Head contribution is 0: computed ${eyeHeadIntervals.length} interval(s) from ${mergedEvents.length} merged events (${eyeHeadEventCount} Eye/Head-typed). ` +
        `If Eye/Head events existed but produced no intervals, the duration denominator (` +
        `${totalDurationSec}s) or event timestamp/duration mapping may be off. attemptId=${session.attemptId}`
      );
    }

    // ── Exact 5-Part 100-Mark Audit Scoring Architecture ───────────────────────
    // 1. Eye + Head Tracking (6 Categories): Max 60 Marks
    const uniqueEyeHeadSec = calculateUniqueViolationSeconds(eyeHeadIntervals);
    const eyeHeadScore = calculateEyeHeadScore(uniqueEyeHeadSec, totalDurationSec);

    // 2. Mobile Phone Violation: Max 10 Marks
    const mobileScore = phoneViolations.length > 0 ? 10.0 : 0.0;

    // 3. Multiple Persons / Multi Face: Max 10 Marks
    const multiFaceScore = (categoryBreakdown.persons > 0 || scoredEvents.some(e => ['MULTIPLE_PERSONS', 'MULTIPLE_FACES', 'EXTRA_FACE'].includes(e.eventType))) ? 10.0 : 0.0;

    // 4. No Person / Face Absence: Max 10 Marks
    const noPersonScore = faceAbsentSec > 0 ? 10.0 : 0.0;

    // 5. Tab Switch / Fullscreen Exit (> 3 attempts): Max 10 Marks
    const tabSwitchEvents = mergedEvents.filter(e => BROWSER_EVENT_TYPES.has(e.eventType));
    const tabSwitchCount = tabSwitchEvents.length;
    const tabSwitchScore = tabSwitchCount > BROWSER_SWITCH_LIMIT ? BROWSER_SWITCH_PENALTY : 0;

    // Total Malpractice Audit Score out of 100 Marks
    const finalScore = Math.min(100.0, Math.max(0.0, eyeHeadScore + mobileScore + multiFaceScore + noPersonScore + tabSwitchScore));

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

    const friendlyTimeline = mergedEvents.map((e) => {
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
      totalEvents: mergedEvents.length,
      graceWarningsCount: graceWarnings.length,
      maxGraceWarnings: 3,
      graceWarnings: friendlyGraceWarnings,
      counts: {
        info: mergedEvents.filter((e) => e.severity === 'INFO').length,
        warning: mergedEvents.filter((e) => ['WARNING', 'LOW', 'MEDIUM'].includes(e.severity)).length,
        high: mergedEvents.filter((e) => e.severity === 'HIGH').length,
        critical: mergedEvents.filter((e) => e.severity === 'CRITICAL').length,
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
      eyeHeadMonitoring: {
        configuredDurationSeconds: configuredDurationSec,
        actualTestDurationSeconds: totalDurationSec,
        configuredDurationFormatted: `${Math.floor(configuredDurationSec / 60).toString().padStart(2, '0')}:${(configuredDurationSec % 60).toString().padStart(2, '0')}`,
        actualTestDurationFormatted: `${Math.floor(totalDurationSec / 60).toString().padStart(2, '0')}:${(totalDurationSec % 60).toString().padStart(2, '0')}`,
        violationSeconds: uniqueEyeHeadSec,
        violationPercentage: (uniqueEyeHeadSec / totalDurationSec) * 100,
        score: eyeHeadScore,
        maxScore: 60,
        scoreDisplay: `${eyeHeadScore.toFixed(2)} / 60`,
      },
      objectMonitoring: {
        phoneEvents: phoneViolations.length,
        mobileDetected: phoneViolations.length > 0,
        mobileDetectionCount: phoneViolations.length,
        laptopEvents: mergedEvents.filter((e) => e.eventType.includes('LAPTOP')).length,
        bookEvents: mergedEvents.filter((e) => e.eventType.includes('BOOK')).length,
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

    let finalVideoUrl = session.videoUrl || null;
    if (!finalVideoUrl && session.attemptId) {
      try {
        const otherSession = await MonitoringSession.findOne({
          where: {
            attemptId: session.attemptId,
            participantId: session.participantId,
            contextType: session.contextType,
            contextId: session.contextId,
            videoUrl: { [Op.ne]: null }
          },
          order: [['id', 'DESC']]
        });
        if (otherSession?.videoUrl) {
          finalVideoUrl = otherSession.videoUrl;
        }
      } catch (_) {}
    }

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
      score: finalScore,
      riskScore: finalScore,
      riskLevel: finalScore >= 70 ? 'CRITICAL' : (finalScore >= 35 ? 'HIGH' : (finalScore >= 15 ? 'MEDIUM' : 'LOW')),
      configuredDurationSeconds: configuredDurationSec,
      actualTestDurationSeconds: totalDurationSec,
      configuredDurationFormatted: `${Math.floor(configuredDurationSec / 60).toString().padStart(2, '0')}:${(configuredDurationSec % 60).toString().padStart(2, '0')}`,
      actualTestDurationFormatted: `${Math.floor(totalDurationSec / 60).toString().padStart(2, '0')}:${(totalDurationSec % 60).toString().padStart(2, '0')}`,
      eyeHeadViolationSeconds: uniqueEyeHeadSec,
      eyeHeadScore: eyeHeadScore,
      eyeHeadScoreDisplay: `${eyeHeadScore.toFixed(2)} / 60`,
      noPersonScore: noPersonScore,
      noPersonScoreDisplay: `${noPersonScore.toFixed(2)} / 10`,
      multiFaceScore: multiFaceScore,
      multiFaceScoreDisplay: `${multiFaceScore.toFixed(2)} / 10`,
      tabSwitchScore: tabSwitchScore,
      tabSwitchScoreDisplay: `${tabSwitchScore.toFixed(2)} / 10`,
      tabSwitchCount: tabSwitchCount,
      mobileScore: mobileScore,
      mobilePhoneDetected: mobileScore > 0,
      mobilePhoneScore: mobileScore,
      mobileScoreDisplay: `${mobileScore.toFixed(2)} / 10`,
      scoringBreakdown: {
        eyeHead: { score: eyeHeadScore, max: 60, violationSeconds: uniqueEyeHeadSec },
        noPerson: { score: noPersonScore, max: 10, faceAbsentSeconds: faceAbsentSec },
        multiPerson: { score: multiFaceScore, max: 10, detected: multiFaceScore > 0 },
        tabSwitch: { score: tabSwitchScore, max: 10, count: tabSwitchCount, limit: BROWSER_SWITCH_LIMIT, exceeded: tabSwitchCount > BROWSER_SWITCH_LIMIT },
        mobile: { score: mobileScore, max: 10, count: phoneViolations.length },
        total: finalScore,
      },
      finalScore: finalScore,
      finalScoreDisplay: `${finalScore.toFixed(2)} / 100`,
      totalEvents: mergedEvents.length,
      warningEvents: summary.counts.warning,
      highEvents: summary.counts.high,
      criticalEvents: summary.counts.critical,
      graceWarningsCount: graceWarnings.length,
      maxGraceWarnings: 3,
      graceWarnings: friendlyGraceWarnings,
      hasPhoneViolation: phoneViolations.length > 0 || (session.contextType === 'INTERVIEW' && flags.includes('UNAUTHORIZED_PHONE_DETECTED')),
      phoneViolationCount: phoneViolations.length,
      integrityFlags: flags,
      videoUrl: finalVideoUrl,
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
        riskScore: finalScore,
        riskLevel: finalScore >= 70 ? 'CRITICAL' : (finalScore >= 35 ? 'HIGH' : (finalScore >= 15 ? 'MEDIUM' : 'LOW')),
      },
      events: friendlyTimeline,
      timeline: friendlyTimeline,
      session: {
        sessionId: session.sessionId,
        attemptId: session.attemptId,
        participantId: session.participantId,
        status: session.status,
        laptopStatus: session.laptopStatus,
        mobileStatus: session.mobileStatus,
        score: finalScore,
        startedAt: sessionStartedAt,
        endedAt: sessionEndedAt || new Date(),
        durationSeconds: totalDurationSec,
        videoUrl: finalVideoUrl,
      },
      monitoringScore: eyeHeadScore,
      uniqueViolationSeconds: uniqueEyeHeadSec,
      violationSeconds: uniqueEyeHeadSec,
      violationPercentage: totalDurationSec > 0 ? (uniqueEyeHeadSec / totalDurationSec) * 100 : 0,
      multipleFaceCount: (categoryBreakdown?.persons || 0) || (multiFaceScore > 0 ? 1 : 0),
      noPersonDetected: faceAbsentSec > 0,
      mobileCount: phoneViolations.length,
    };
  }

  async getReportsList({ contextType, contextId, participantId, riskLevel, limit = 50, offset = 0 }) {
    const where = {};
    if (contextType) where.contextType = String(contextType).toUpperCase();
    if (contextId) where.contextId = Number(contextId);
    if (participantId) where.participantId = Number(participantId);

    const pageLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const pageOffset = Math.max(0, Number(offset) || 0);

    const { count, rows } = await MonitoringSession.findAndCountAll({
      where,
      // Stored session.score is the live event accumulator. Filter on the
      // authoritative final audit below, not on that provisional score.
      ...(riskLevel ? {} : { limit: pageLimit, offset: pageOffset }),
      order: [['id', 'DESC']],
      include: [{ model: User, as: 'participant', attributes: ['id', 'name', 'email'] }],
    });

    const reports = await Promise.all(rows.map(async row => ({
      ...(row.toJSON ? row.toJSON() : row),
      ...await this.getReport({ sessionId: row.sessionId }),
    })));
    const filtered = riskLevel
      ? reports.filter(report => report.riskLevel === String(riskLevel).toUpperCase())
      : reports;
    return {
      total: riskLevel ? filtered.length : count,
      sessions: riskLevel ? filtered.slice(pageOffset, pageOffset + pageLimit) : filtered,
    };
  }
}

const serviceInstance = new MonitoringEngineService();
serviceInstance.calculateEyeHeadScore = calculateEyeHeadScore;
serviceInstance.mergeIntervals = mergeIntervals;
serviceInstance.calculateUniqueViolationSeconds = calculateUniqueViolationSeconds;
serviceInstance.aggregateMonitoringEvents = aggregateMonitoringEvents;

module.exports = serviceInstance;
