/**
 * Proctoring service — pure business logic.
 *
 * Public functions are framework-agnostic (no req/res). Controllers and
 * socket handlers both call into this module so HTTP and WS paths stay
 * consistent. The persistence layer is Sequelize today; swap by editing
 * only this file.
 */
const { Op } = require('sequelize');
const {
  ExamSession,
  Violation,
  DeviceFingerprint,
  ProctorActivity,
  AIQuiz,
  QuizAttempt,
  CodingAssessment,
  CodingAttempt,
  User,
} = require('../models');
const { encrypt, decrypt, newSessionToken } = require('../utils/crypto');
const logger = require('../utils/logger');
const aiQuizService = require('./aiQuizService');

// ── Tunables ────────────────────────────────────────────────────────────────
const DEFAULT_MAX_FULLSCREEN_EXITS = 3;
const DEFAULT_MAX_WARNINGS = 5;
const HEARTBEAT_TIMEOUT_MS = 25_000;
const GRACE_PERIOD_DEFAULT_MINUTES = 2;
const GRACE_PERIOD_REAPER_INTERVAL_MS = 30_000;
const NETWORK_DISCONNECT_TIMEOUT_MS = 30_000;   // 30s grace before storing a NETWORK_DISCONNECTED violation
const VIOLATION_DEBOUNCE_MS = 5_000;             // 5s debounce per type per session

function thresholdsForLevel(level) {
  switch (level) {
    case 'HIGH':
      return { maxFullscreenExits: 2, maxWarnings: 3 };
    case 'LOW':
      return { maxFullscreenExits: 5, maxWarnings: 8 };
    case 'MEDIUM':
    default:
      return { maxFullscreenExits: DEFAULT_MAX_FULLSCREEN_EXITS, maxWarnings: DEFAULT_MAX_WARNINGS };
  }
}

// Violations that are actual cheating events (not monitoring events)
const CHEATING_TYPES = new Set([
  'FULLSCREEN_EXIT',
  'FULLSCREEN_DISABLED',
  'SCREEN_SHARE_STOPPED',
  'SCREEN_SHARE_CHANGED',
  'TAB_SWITCH',
  'BROWSER_LOST_FOCUS',
  'WINDOW_BLUR',
  'RIGHT_CLICK',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'DEVTOOLS_OPENED',
  'MULTIPLE_MONITOR_DETECTED',
  'RECORDING_FAILED',
  'NETWORK_DISCONNECTED',
  'ASSESSMENT_LEFT',
  'MANUAL_SUBMISSION_TIMEOUT',
  'MULTIPLE_FACES',
  'FACE_ABSENT',
  'PHONE_DETECTED',
  'LOOKING_AWAY',
  'VOICE_DETECTED',
  'TRAINER_WARNING',
]);

// Monitoring events that should NEVER appear as user-facing violations
const MONITORING_EVENTS = new Set([
  'HEARTBEAT_LOST',
  'HEARTBEAT_RESTORED',
  'SESSION_STARTED',
  'SESSION_RESUMED',
]);

// Violations that bump the warning counter (user-facing only)
const WARNING_TYPES = new Set([
  'FULLSCREEN_EXIT',
  'TAB_SWITCH',
  'SCREEN_SHARE_STOPPED',
  'WINDOW_BLUR',
  'BROWSER_MINIMIZE',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'BLOCKED_SHORTCUT',
  'DEVTOOLS_OPENED',
  'SCREENSHOT_ATTEMPT',
  'CLIPBOARD_ATTEMPT',
  'TRAINER_WARNING',
  'NETWORK_DISCONNECTED',
]);

const CRITICAL_TYPES = new Set([
  'MULTIPLE_LOGIN',
  'SCREEN_SHARE_DENIED',
  'NETWORK_TIMEOUT',
  'MULTIPLE_FACES',
  'PHONE_DETECTED',
  'RECORDING_FAILED',
]);

// Server-side debounce: map of `sessionId:type` → last timestamp
const lastViolationTimestamps = new Map();

// ── Internal helpers ────────────────────────────────────────────────────────
async function populateViolationCounts(session) {
  if (!session) return session;
  const [
    fullscreenExitsCount,
    tabSwitchesCount,
    screenshotsCount,
    devToolsCount,
    windowBlursCount
  ] = await Promise.all([
    Violation.count({ where: { sessionId: session.id, type: 'FULLSCREEN_EXIT' } }),
    Violation.count({ where: { sessionId: session.id, type: 'TAB_SWITCH' } }),
    Violation.count({ where: { sessionId: session.id, type: 'SCREENSHOT_ATTEMPT' } }),
    Violation.count({ where: { sessionId: session.id, type: 'DEVTOOLS_OPENED' } }),
    Violation.count({ where: { sessionId: session.id, type: 'WINDOW_BLUR' } })
  ]);
  session.setDataValue('fullscreenExitsCount', fullscreenExitsCount);
  session.setDataValue('tabSwitchesCount', tabSwitchesCount);
  session.setDataValue('screenshotsCount', screenshotsCount);
  session.setDataValue('devToolsCount', devToolsCount);
  session.setDataValue('windowBlursCount', windowBlursCount);
  return session;
}

function buildClientView(session) {
  if (!session) return null;
  const level = session.proctoringLevel || 'MEDIUM';
  const t = thresholdsForLevel(level);
  return {
    sessionId: session.id,
    sessionToken: session.sessionToken,
    quizId: session.quizId,
    attemptId: session.attemptId,
    codingAttemptId: session.codingAttemptId,
    status: session.status,
    warningsCount: session.warningsCount,
    fullscreenExits: session.fullscreenExits,
    isFullscreen: session.isFullscreen,
    isScreenSharing: session.isScreenSharing,
    isOnline: session.isOnline,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    endedAt: session.endedAt,
    terminationReason: session.terminationReason,
    disconnectedAt: session.disconnectedAt,
    gracePeriodEndsAt: session.gracePeriodEndsAt,
    maxFullscreenExits: t.maxFullscreenExits,
    maxWarnings: t.maxWarnings,
    proctoringLevel: level,
    // Category violation counters
    fullscreenViolations: session.getDataValue('fullscreenExitsCount') ?? session.fullscreenExits ?? 0,
    tabSwitchViolations: session.getDataValue('tabSwitchesCount') ?? 0,
    screenshotViolations: session.getDataValue('screenshotsCount') ?? 0,
    devToolsViolations: session.getDataValue('devToolsCount') ?? 0,
    windowBlurViolations: session.getDataValue('windowBlursCount') ?? 0,
  };
}

async function getQuizOrThrow(quizId) {
  const quiz = await AIQuiz.findByPk(quizId);
  if (!quiz) {
    const err = new Error('Quiz not found');
    err.status = 404;
    throw err;
  }
  return quiz;
}

// ── Device fingerprint ──────────────────────────────────────────────────────
async function registerDevice({ userId, fingerprintHash, label, ipAddress, userAgent }) {
  if (!fingerprintHash) return null;
  const [device] = await DeviceFingerprint.findOrCreate({
    where: { userId, fingerprintHash },
    defaults: {
      userId, fingerprintHash, label, ipAddress, userAgent,
      lastSeenAt: new Date(),
    },
  });
  device.lastSeenAt = new Date();
  device.ipAddress = ipAddress || device.ipAddress;
  device.userAgent = userAgent || device.userAgent;
  await device.save();
  return device;
}

// ── Session management ─────────────────────────────────────────────────────
async function getActiveSessionForUser(userId) {
  const session = await ExamSession.findOne({
    where: { participantId: userId, status: { [Op.in]: ['PENDING', 'ACTIVE'] } },
    order: [['created_at', 'DESC']],
  });
  if (session) {
    await populateViolationCounts(session);
  }
  return session;
}

async function startSession({ userId, quizId, attemptId, fingerprintHash, ipAddress, userAgent, screenSharing, assessmentType = 'quiz' }) {
  console.log('[proctoringService.startSession]', { userId, quizId, attemptId, screenSharing, assessmentType });

  if (!quizId) {
    const err = new Error('quizId/assessmentId is required to start a proctored session');
    err.status = 400;
    throw err;
  }

  // Single-device enforcement: if any other ACTIVE session for this user, terminate it.
  const existingActive = await ExamSession.findOne({
    where: { participantId: userId, status: { [Op.in]: ['PENDING', 'ACTIVE'] } },
  });

  let assessment = null;
  if (assessmentType === 'coding') {
    assessment = await CodingAssessment.findByPk(quizId);
    if (!assessment) {
      const err = new Error('Coding assessment not found');
      err.status = 404;
      throw err;
    }
  } else {
    assessment = await getQuizOrThrow(quizId);
  }

  const isSame = existingActive && (
    assessmentType === 'coding'
      ? existingActive.assessmentId === Number(quizId)
      : existingActive.quizId === Number(quizId)
  );

  if (existingActive && !isSame) {
    await terminateSession({
      session: existingActive,
      reason: 'Started exam on another device or quiz/assessment',
      type: 'MULTIPLE_LOGIN',
    });
  }

  // Re-entry to same quiz/assessment → reuse if active
  if (existingActive && isSame) {
    await populateViolationCounts(existingActive);
    return { session: existingActive, quiz: assessment, resumed: true };
  }

  const device = await registerDevice({
    userId, fingerprintHash, ipAddress, userAgent,
    label: 'Exam device',
  });

  // Check if already attempted
  let completed = null;
  if (assessmentType === 'coding') {
    completed = await CodingAttempt.findOne({
      where: { assessmentId: quizId, participantId: userId, status: { [Op.in]: ['SUBMITTED', 'EVALUATED'] } }
    });
  } else {
    completed = await QuizAttempt.findOne({
      where: { quizId, participantId: userId, status: { [Op.in]: ['SUBMITTED', 'EVALUATED'] } }
    });
  }
  if (completed) {
    const err = new Error(`You have already attempted this ${assessmentType === 'coding' ? 'assessment' : 'quiz'}.`);
    err.status = 403;
    throw err;
  }

  // Reuse caller-supplied attempt if provided + valid; else create a new one.
  let attempt = null;
  if (assessmentType === 'coding') {
    if (attemptId) {
      attempt = await CodingAttempt.findOne({
        where: { id: attemptId, participantId: userId, assessmentId: quizId },
      });
    }
    if (!attempt) {
      attempt = await CodingAttempt.findOne({
        where: { assessmentId: quizId, participantId: userId, status: 'IN_PROGRESS' }
      });
    }
    if (!attempt) {
      attempt = await CodingAttempt.create({
        assessmentId: quizId,
        participantId: userId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });
    }
  } else {
    if (attemptId) {
      attempt = await QuizAttempt.findOne({
        where: { id: attemptId, participantId: userId, quizId },
      });
    }
    if (!attempt) {
      attempt = await QuizAttempt.findOne({
        where: { quizId, participantId: userId, status: 'IN_PROGRESS' }
      });
    }
    if (!attempt) {
      attempt = await QuizAttempt.create({
        quizId,
        participantId: userId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });
    }
  }

  const startedAt = new Date();
  const endsAt = assessment.timeLimit
    ? new Date(startedAt.getTime() + assessment.timeLimit * 60_000)
    : null;

  const gracePeriodMinutes = assessment.gracePeriodMinutes || GRACE_PERIOD_DEFAULT_MINUTES;

  const session = await ExamSession.create({
    assessmentType,
    quizId: assessmentType === 'coding' ? null : quizId,
    assessmentId: assessmentType === 'coding' ? quizId : null,
    attemptId: assessmentType === 'coding' ? null : attempt.id,
    codingAttemptId: assessmentType === 'coding' ? attempt.id : null,
    participantId: userId,
    sessionToken: newSessionToken(),
    deviceFingerprintId: device ? device.id : null,
    status: 'PENDING',
    isScreenSharing: !!screenSharing,
    ipAddress,
    userAgent,
    startedAt,
    endsAt,
    encryptedPayload: encrypt({ seed: Date.now(), userId, quizId }),
    lastHeartbeatAt: startedAt,
    gracePeriodEndsAt: null,
    disconnectedAt: null,
    proctoringLevel: assessment.proctoringLevel || 'MEDIUM',
    gracePeriodMinutes,
  });

  await populateViolationCounts(session);

  return { session, quiz: assessment, attempt, resumed: false };
}

async function activateSession(session) {
  if (session.status === 'ACTIVE') return session;
  if (session.status !== 'PENDING') {
    const err = new Error(`Cannot activate session in state ${session.status}`);
    err.status = 409;
    throw err;
  }
  session.status = 'ACTIVE';
  session.isFullscreen = true;
  session.lastHeartbeatAt = new Date();
  await session.save();
  await populateViolationCounts(session);
  return session;
}

async function heartbeat(session) {
  const wasOffline = !session.isOnline;
  session.lastHeartbeatAt = new Date();
  session.isOnline = true;
  // If participant reconnects after disconnection, clear the disconnected timestamp
  if (session.disconnectedAt) {
    session.disconnectedAt = null;
  }
  await session.save();
  await populateViolationCounts(session);
  return session;
}

async function terminateSession({ session, reason, type = 'TERMINATED' }) {
  if (['SUBMITTED', 'TERMINATED', 'EXPIRED'].includes(session.status)) {
    return session;
  }
  session.status = 'TERMINATED';
  session.terminationReason = reason || 'Terminated';
  session.endedAt = new Date();
  await session.save();

  console.log('[proctoringService.terminateSession]', {
    sessionId: session.id,
    participantId: session.participantId,
    quizId: session.quizId,
    reason,
    type,
  });

  // Record activity for exam terminated
  await recordActivity({
    session,
    eventType: 'EXAM_TERMINATED',
    payload: { reason, endedAt: session.endedAt }
  });

  await Violation.create({
    sessionId: session.id,
    participantId: session.participantId,
    quizId: session.quizId,
    type,
    severity: 'CRITICAL',
    message: reason,
    metadata: session.assessmentId ? { assessmentId: session.assessmentId, assessmentType: session.assessmentType } : null,
  });

  // Best-effort: auto-submit and grade the linked attempt.
  const attemptId = session.codingAttemptId || session.attemptId;
  if (attemptId) {
    try {
      if (session.assessmentType === 'coding') {
        await CodingAttempt.update(
          { status: 'SUBMITTED', submittedAt: new Date() },
          { where: { id: attemptId, status: 'IN_PROGRESS' } },
        );
      } else {
        const attempt = await QuizAttempt.findOne({
          where: { id: attemptId, status: 'IN_PROGRESS' },
        });
        if (attempt) {
          await aiQuizService.submitAndGradeAttempt(attempt, [], { autoSubmit: true });
        }
      }
    } catch (e) {
      logger.warn('Failed to auto-submit attempt on terminate', { err: e.message });
      try {
        const model = session.assessmentType === 'coding' ? CodingAttempt : QuizAttempt;
        await model.update(
          { status: 'SUBMITTED', submittedAt: new Date() },
          { where: { id: attemptId, status: 'IN_PROGRESS' } },
        );
      } catch (e2) {
        logger.warn('Failed to flag attempt SUBMITTED on terminate', { err: e2.message });
      }
    }
  }

  await populateViolationCounts(session);

  return session;
}

async function submitSession(session) {
  if (['SUBMITTED', 'TERMINATED'].includes(session.status)) return session;
  session.status = 'SUBMITTED';
  session.endedAt = new Date();
  await session.save();

  // Record activity for exam submitted
  await recordActivity({
    session,
    eventType: 'EXAM_SUBMITTED',
    payload: { submittedAt: session.endedAt }
  });

  await populateViolationCounts(session);
  return session;
}

// ── Violation handling ──────────────────────────────────────────────────────
function severityFor(type) {
  if (CRITICAL_TYPES.has(type)) return 'CRITICAL';
  if (type === 'FULLSCREEN_EXIT') return 'MEDIUM';
  if (type === 'SCREEN_SHARE_STOPPED' || type === 'DEVTOOLS_OPENED' || type === 'MULTIPLE_MONITOR_DETECTED' || type === 'SCREEN_SHARE_CHANGED') return 'HIGH';
  if (type === 'COPY_ATTEMPT' || type === 'PASTE_ATTEMPT' || type === 'RIGHT_CLICK') return 'LOW';
  if (CHEATING_TYPES.has(type)) return 'MEDIUM';
  return 'LOW';
}

// Server-side debounce: skip if same type on same session within 5s
function isDebounced(sessionId, type) {
  const key = `${sessionId}:${type}`;
  const now = Date.now();
  const last = lastViolationTimestamps.get(key) || 0;
  if (now - last < VIOLATION_DEBOUNCE_MS) return true;
  lastViolationTimestamps.set(key, now);
  return false;
}

// Periodic cleanup of stale debounce entries (call once a minute)
function cleanDebounceMap() {
  const cutoff = Date.now() - VIOLATION_DEBOUNCE_MS * 2;
  for (const [key, ts] of lastViolationTimestamps) {
    if (ts < cutoff) lastViolationTimestamps.delete(key);
  }
}

/**
 * Record a violation, update counters, decide if termination is required.
 * Returns { violation, session, terminated:boolean }
 *
 * Monitoring events (HEARTBEAT_LOST etc.) are silently skipped — they
 * must never create violation rows or increment counters.
 */
async function recordViolation({ session, type, message, metadata }) {
  if (!type) throw new Error('Violation type required');

  // ── Skip monitoring events entirely ──
  if (MONITORING_EVENTS.has(type)) {
    return { violation: null, session, terminated: false };
  }

  if (!session.quizId && !session.assessmentId) {
    logger.error('[proctoringService.recordViolation] both quizId and assessmentId are null', {
      sessionId: session.id,
      participantId: session.participantId,
      type,
    });
    throw new Error('Cannot record violation: assessment reference is missing from session');
  }

  // ── Server-side debounce: same type on same session within 5s ──
  if (isDebounced(session.id, type)) {
    logger.debug(`[proctoringService] Debounced violation ${type} for session ${session.id}`);
    return { violation: null, session, terminated: false };
  }

  const severity = severityFor(type);
  const violation = await Violation.create({
    sessionId: session.id,
    participantId: session.participantId,
    quizId: session.quizId,
    type, severity, message: message || null,
    metadata: metadata || null,
  });

  let mutated = false;
  if (type === 'FULLSCREEN_EXIT') {
    session.fullscreenExits = (session.fullscreenExits || 0) + 1;
    session.isFullscreen = false;
    mutated = true;
  }
  if (type === 'SCREEN_SHARE_STOPPED' || type === 'SCREEN_SHARE_DENIED') {
    session.isScreenSharing = false;
    mutated = true;
  }
  if (WARNING_TYPES.has(type) || CRITICAL_TYPES.has(type)) {
    session.warningsCount = (session.warningsCount || 0) + 1;
    mutated = true;
  }
  if (mutated) await session.save();

  // Populate category counts to perform policy checks
  await populateViolationCounts(session);

  const fullscreenCount = session.getDataValue('fullscreenExitsCount') ?? 0;
  const tabSwitchesCount = session.getDataValue('tabSwitchesCount') ?? 0;
  const screenshotsCount = session.getDataValue('screenshotsCount') ?? 0;
  const devToolsCount = session.getDataValue('devToolsCount') ?? 0;
  const windowBlursCount = session.getDataValue('windowBlursCount') ?? 0;

  const level = session.proctoringLevel || 'MEDIUM';
  const t = thresholdsForLevel(level);

  // Termination policy
  let terminated = false;
  if (
    fullscreenCount >= t.maxFullscreenExits ||
    tabSwitchesCount >= 3 ||
    screenshotsCount >= 3 ||
    devToolsCount >= 3 ||
    windowBlursCount >= 3 ||
    session.warningsCount >= t.maxWarnings ||
    severity === 'CRITICAL'
  ) {
    let reason = `Auto-terminated after violation: ${type}`;
    if (fullscreenCount >= t.maxFullscreenExits) reason = 'Auto-terminated: Exceeded maximum fullscreen exits';
    else if (tabSwitchesCount >= 3) reason = 'Auto-terminated: Exceeded maximum tab switches';
    else if (screenshotsCount >= 3) reason = 'Auto-terminated: Exceeded maximum screenshot attempts';
    else if (devToolsCount >= 3) reason = 'Auto-terminated: Developer Tools detection limit reached';
    else if (windowBlursCount >= 3) reason = 'Auto-terminated: Exceeded maximum window focus losses';
    else if (session.warningsCount >= t.maxWarnings) reason = 'Auto-terminated: Exceeded maximum warnings limit';
    else if (severity === 'CRITICAL') reason = `Auto-terminated: Critical violation - ${type}`;

    await terminateSession({
      session,
      reason,
      type: 'TERMINATED',
    });
    terminated = true;
  }

  return { violation, session, terminated };
}

async function recordActivity({ session, eventType, payload }) {
  return ProctorActivity.create({
    sessionId: session.id,
    participantId: session.participantId,
    eventType,
    payload: payload || null,
  });
}

// ── Trainer queries ─────────────────────────────────────────────────────────
async function getQuizMonitor(assessmentId) {
  const sessions = await ExamSession.findAll({
    where: {
      [Op.or]: [
        { quizId: assessmentId },
        { assessmentId, assessmentType: 'coding' },
      ],
    },
    order: [['created_at', 'DESC']],
  });

  await Promise.all(sessions.map(s => populateViolationCounts(s)));

  const sessionIds = sessions.map(s => s.id);
  const { Screenshot } = require('../models');
  let latestScreenshots = [];
  if (sessionIds.length > 0) {
    latestScreenshots = await Screenshot.findAll({
      where: { sessionId: { [Op.in]: sessionIds } },
      order: [['capturedAt', 'DESC']],
    });
  }
  const screenshotMap = new Map();
  for (const s of latestScreenshots) {
    if (!screenshotMap.has(s.sessionId)) {
      screenshotMap.set(s.sessionId, s.filePath);
    }
  }

  const userIds = [...new Set(sessions.map(s => s.participantId))];
  const users = userIds.length
    ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] })
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  return sessions.map(s => ({
    ...buildClientView(s),
    participant: userMap.get(s.participantId) || { id: s.participantId, name: 'Unknown' },
    lastHeartbeatAt: s.lastHeartbeatAt,
    latestScreenshot: screenshotMap.get(s.id) || null,
  }));
}

async function getSessionViolations(sessionId, { limit = 100 } = {}) {
  return Violation.findAll({
    where: { sessionId },
    order: [['occurredAt', 'DESC']],
    limit,
  });
}

async function exportSessionLogs(sessionId) {
  const session = await ExamSession.findByPk(sessionId);
  if (!session) return null;
  await populateViolationCounts(session);
  const [violations, activities] = await Promise.all([
    Violation.findAll({ where: { sessionId }, order: [['occurredAt', 'ASC']] }),
    ProctorActivity.findAll({ where: { sessionId }, order: [['occurredAt', 'ASC']] }),
  ]);
  return {
    session: buildClientView(session),
    violations,
    activities,
    exportedAt: new Date(),
  };
}

// ── Grace period on disconnect ──────────────────────────────────────────────
async function enterGracePeriod(session) {
  const graceMinutes = session.gracePeriodMinutes || GRACE_PERIOD_DEFAULT_MINUTES;
  session.disconnectedAt = new Date();
  session.gracePeriodEndsAt = new Date(Date.now() + graceMinutes * 60_000);
  session.isOnline = false;
  await session.save();
  await populateViolationCounts(session);
  return session;
}

async function reconnectSession(session) {
  session.disconnectedAt = null;
  session.gracePeriodEndsAt = null;
  session.isOnline = true;
  session.lastHeartbeatAt = new Date();
  await session.save();
  await populateViolationCounts(session);
  return session;
}

async function expireGracePeriodSessions(io) {
  const now = new Date();
  const expired = await ExamSession.findAll({
    where: {
      status: 'ACTIVE',
      gracePeriodEndsAt: { [Op.ne]: null, [Op.lt]: now },
    },
    limit: 50,
  });
  for (const s of expired) {
    await terminateSession({
      session: s,
      reason: 'Auto-terminated: Disconnection grace period expired',
      type: 'NETWORK_TIMEOUT',
    });
    if (io) {
      const roomId = s.quizId || `coding_${s.assessmentId}`;
      io.to(`proctor_quiz_${roomId}`).emit('proctor:update', {
        type: 'terminated',
        session: buildClientView(s),
      });
      io.to(`user_${s.participantId}`).emit('proctor:terminated', {
        sessionId: s.id,
        reason: 'Auto-terminated: Disconnection grace period expired',
      });
    }
  }
  return expired.length;
}

// ── Reaper for stale sessions ───────────────────────────────────────────────
// Heartbeat is an internal monitoring event.
// It must NEVER create violation rows or appear in user-facing UI.
//
// Instead:
//   1. Mark the participant offline (isOnline = false)
//   2. Set disconnectedAt on first detection
//   3. If still disconnected after NETWORK_DISCONNECT_TIMEOUT_MS (30s),
//      create ONE NETWORK_DISCONNECTED violation (debounced per session)
//   4. On reconnect (next heartbeat), clear disconnectedAt and emit status
async function expireStaleSessions(io) {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const stale = await ExamSession.findAll({
    where: {
      status: 'ACTIVE',
      lastHeartbeatAt: { [Op.lt]: cutoff },
      disconnectedAt: { [Op.eq]: null },
    },
    limit: 50,
  });

  const now = new Date();
  for (const s of stale) {
    s.isOnline = false;
    s.disconnectedAt = s.disconnectedAt || now;
    await s.save();

    // Check if 30s grace has elapsed since first disconnection
    const disconnectedSince = new Date(s.disconnectedAt).getTime();
    if ((s.quizId || s.assessmentId) && (now.getTime() - disconnectedSince) >= NETWORK_DISCONNECT_TIMEOUT_MS) {
      const netKey = `net:${s.id}`;
      const lastNet = lastViolationTimestamps.get(netKey) || 0;
      const alreadyViolated = lastNet > disconnectedSince;

      if (!alreadyViolated) {
        lastViolationTimestamps.set(netKey, now.getTime());
        const violation = await Violation.create({
          sessionId: s.id,
          participantId: s.participantId,
          quizId: s.quizId,
          type: 'NETWORK_DISCONNECTED',
          severity: 'MEDIUM',
          message: `Participant disconnected for ${Math.round((now.getTime() - disconnectedSince) / 1000)}s`,
          metadata: { disconnectedAt: s.disconnectedAt, reconnectedAt: null, downtimeMs: now.getTime() - disconnectedSince, assessmentId: s.assessmentId, assessmentType: s.assessmentType },
        });

        s.warningsCount = (s.warningsCount || 0) + 1;
        await s.save();

        if (io) {
          const roomId = s.quizId || `coding_${s.assessmentId}`;
          io.to(`proctor_quiz_${roomId}`).emit('proctor:update', {
            type: 'violation',
            session: buildClientView(s),
            violation,
          });
        }
      }
    }

    // Always emit online=false status to trainer
    const roomId = s.quizId || `coding_${s.assessmentId}`;
    if (io && (s.quizId || s.assessmentId)) {
      io.to(`proctor_quiz_${roomId}`).emit('proctor:update', {
        type: 'state',
        session: buildClientView(s),
        heartbeatLost: true,
      });
    }
  }
  // Periodically clean old entries from the debounce map
  cleanDebounceMap();
  return stale.length;
}

// ── Reaper for endsAt timers ────────────────────────────────────────────────
async function autoSubmitExpiredSessions(io) {
  const now = new Date();
  const expired = await ExamSession.findAll({
    where: {
      status: 'ACTIVE',
      endsAt: { [Op.lt]: now }
    },
    limit: 50
  });

  for (const s of expired) {
    try {
      await submitSession(s);

      const attemptId = s.codingAttemptId || s.attemptId;
      if (attemptId) {
        const model = s.assessmentType === 'coding' ? CodingAttempt : QuizAttempt;
        await model.update(
          { status: 'SUBMITTED', submittedAt: new Date() },
          { where: { id: attemptId, status: 'IN_PROGRESS' } }
        );
      }

      if (io) {
        const roomId = s.quizId || `coding_${s.assessmentId}`;
        io.to(`proctor_quiz_${roomId}`).emit('proctor:update', {
          type: 'submitted',
          session: buildClientView(s)
        });
        io.to(`user_${s.participantId}`).emit('proctor:terminated', {
          sessionId: s.id,
          reason: 'Time limit reached'
        });
      }
    } catch (err) {
      logger.error(`Failed to auto-submit expired session ${s.id}`, { err: err.message });
    }
  }

  return expired.length;
}

/**
 * getQuizReport — aggregated monitoring report for all participants in a quiz.
 * Used by the trainer's post-assessment report page.
 */
async function getQuizReport(assessmentId) {
  const sessions = await ExamSession.findAll({
    where: {
      [Op.or]: [
        { quizId: assessmentId },
        { assessmentId, assessmentType: 'coding' },
      ],
    },
    order: [['created_at', 'DESC']],
    include: [
      { model: Violation, as: 'violations', required: false },
    ],
  });

  const userIds = [...new Set(sessions.map(s => s.participantId))];
  const users = userIds.length
    ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] })
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  const firstSession = sessions[0];
  let quiz = null;
  if (firstSession?.assessmentType === 'coding') {
    quiz = await CodingAssessment.findByPk(assessmentId, { attributes: ['id', 'title', 'timeLimit'] });
  } else {
    quiz = await AIQuiz.findByPk(assessmentId, { attributes: ['id', 'title', 'timeLimit'] });
  }

  const report = sessions.map(s => {
    const allViolations = s.violations || [];
    // Filter out monitoring events from user-facing counts
    const violations = allViolations.filter(v => !MONITORING_EVENTS.has(v.type));
    const violationCounts = {};
    const tabSwitchCount = violations.filter(v => v.type === 'TAB_SWITCH').length;
    const fullscreenExitCount = violations.filter(v => v.type === 'FULLSCREEN_EXIT').length;
    const screenShareInterruptions = violations.filter(v =>
      v.type === 'SCREEN_SHARE_STOPPED' || v.type === 'SCREEN_SHARE_DENIED'
    ).length;
    const webcamViolations = violations.filter(v =>
      v.type === 'FACE_ABSENT' || v.type === 'FACE_MULTIPLE' || v.type === 'LOOKING_AWAY' || v.type === 'FACE_NOT_VISIBLE' || v.type === 'CAMERA_OFF' || v.type === 'MIC_MUTED'
    ).length;
    const devtoolsCount = violations.filter(v => v.type === 'DEVTOOLS_OPENED').length;
    const copyPasteCount = violations.filter(v =>
      v.type === 'COPY_ATTEMPT' || v.type === 'PASTE_ATTEMPT'
    ).length;

    violations.forEach(v => {
      violationCounts[v.type] = (violationCounts[v.type] || 0) + 1;
    });

    const duration = s.startedAt && s.endedAt
      ? Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 1000)
      : null;

    return {
      sessionId: s.id,
      participant: userMap.get(s.participantId) || { id: s.participantId, name: 'Unknown', email: '' },
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      duration,
      durationMinutes: duration ? Math.round(duration / 60) : null,
      warningsCount: s.warningsCount || 0,
      fullscreenExits: s.fullscreenExits || 0,
      isFullscreen: s.isFullscreen,
      isScreenSharing: s.isScreenSharing,
      isOnline: s.isOnline,
      violationCount: violations.length,
      totalViolationCount: allViolations.length,
      tabSwitchCount,
      fullscreenExitCount,
      screenShareInterruptions,
      webcamViolations,
      devtoolsCount,
      copyPasteCount,
      violationCounts,
      proctoringLevel: s.proctoringLevel || 'MEDIUM',
      terminationReason: s.terminationReason,
    };
  });

  return {
    quiz: quiz ? { id: quiz.id, title: quiz.title, timeLimit: quiz.timeLimit } : { id: quizId },
    totalParticipants: sessions.length,
    sessions: report,
    generatedAt: new Date(),
  };
}

/**
 * getQuizReportCSV — returns CSV string of the monitoring report.
 */
async function getQuizReportCSV(quizId) {
  const report = await getQuizReport(quizId);
  const rows = [['Participant Name', 'Email', 'Status', 'Duration (min)', 'Total Violations',
    'Tab Switches', 'Fullscreen Exits', 'Screen Share Interruptions', 'Webcam Violations',
    'DevTools Attempts', 'Copy/Paste Attempts', 'Warnings', 'Proctoring Level', 'Termination Reason']];

  for (const s of report.sessions) {
    rows.push([
      s.participant.name || 'Unknown',
      s.participant.email || '',
      s.status,
      s.durationMinutes != null ? String(s.durationMinutes) : '',
      String(s.violationCount),
      String(s.tabSwitchCount),
      String(s.fullscreenExitCount),
      String(s.screenShareInterruptions),
      String(s.webcamViolations),
      String(s.devtoolsCount),
      String(s.copyPasteCount),
      String(s.warningsCount),
      s.proctoringLevel,
      s.terminationReason || '',
    ]);
  }

  return rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}

module.exports = {
  // constants
  DEFAULT_MAX_FULLSCREEN_EXITS,
  DEFAULT_MAX_WARNINGS,
  thresholdsForLevel,
  // session lifecycle
  startSession,
  activateSession,
  heartbeat,
  submitSession,
  terminateSession,
  getActiveSessionForUser,
  // violations & activity
  recordViolation,
  recordActivity,
  // grace period
  enterGracePeriod,
  reconnectSession,
  expireGracePeriodSessions,
  // queries
  getQuizMonitor,
  getSessionViolations,
  exportSessionLogs,
  getQuizReport,
  getQuizReportCSV,
  // misc
  registerDevice,
  buildClientView,
  expireStaleSessions,
  autoSubmitExpiredSessions,
  cleanDebounceMap,
  CHEATING_TYPES,
  MONITORING_EVENTS,
};
