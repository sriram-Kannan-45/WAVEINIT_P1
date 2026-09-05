/**
 * MonitoringEngineClient
 * ─────────────────────────────────────────────────────────────────────────────
 * Frontend coordinator for the unified LMS Monitoring Engine.
 * Reusable across Quiz, Coding, and Interview modules.
 *
 * Implements:
 *   1. Laptop Camera Pipeline (MediaPipe metrics + Rolling State Machine)
 *   2. Mobile Camera Pipeline (YOLO11s composition states + Heartbeats)
 *   3. Pre-test Calibration verification
 *   4. Idempotent event reporting to authoritative backend
 */

import { API_BASE, BACKEND_ORIGIN } from '../../api/api';

// Webcam monitoring video is recorded purely for post-test human review. It is
// NOT consumed by the MediaPipe/YOLO inference pipeline, so by default it is
// disabled to avoid unbounded storage growth. Opt back in per-deployment with
// VITE_RECORD_MONITORING_VIDEO=true.
let RECORD_MONITORING_VIDEO = false;
try {
  if (typeof process !== 'undefined' && process.env?.VITE_RECORD_MONITORING_VIDEO === 'true') {
    RECORD_MONITORING_VIDEO = true;
  }
} catch (_) {}

let SEGMENT_DURATION_MIN = 30;
try {
  if (typeof process !== 'undefined' && process.env?.VITE_MONITORING_SEGMENT_DURATION_MIN) {
    SEGMENT_DURATION_MIN = Number(process.env.VITE_MONITORING_SEGMENT_DURATION_MIN);
  }
} catch (_) {}
const SEGMENT_DURATION_MS = Math.max(0, Number(SEGMENT_DURATION_MIN || 30) * 60_000);

class MonitoringEngineClient {
  constructor() {
    this.sessionId = null;
    this.attemptId = null;
    this.participantId = null;
    this.contextType = 'QUIZ';
    this.token = null;
    this.socket = null;

    // Laptop Pipeline State
    this.laptopStream = null;
    this.laptopVideo = null;
    this.laptopCanvas = null;
    this.laptopInterval = null;
    this.laptopFps = 6;
    this.isMonitoringActive = false;
    this.isTestActive = false;
    this.isPaused = false;
    this.isProcessingLaptop = false;
    this.gazeCalibrationSessionId = null;
    this.gazeCalibrationPromise = null;
    this.testStartedAt = null;
    this.onLaptopDetection = null;
    this.onMobileDetection = null;
    this.onEventReported = null;
    this.lastReportedEventTimes = {};
    this._lastEventEmitAt = 0;

    // Recorded-video async segment pipeline state (opt-in, segmented recording)
    this.segmentSequence = 0;
    this.segmentStartedAt = null;
    this.segmentKey = null;
    this.segmentUploadKey = null;
    this.segmentTimer = null;
    this.segmentUploadPromise = null;
    this.segmentRecordStream = null;
    this.segmentUploadInFlight = 0;
    this._visHandler = null;
    this._storageKey = null;

    // Mobile Pipeline State
    this.mobileStream = null;
    this.mobileVideo = null;
    this.mobileCanvas = null;
    this.mobileInterval = null;
    this.mobileFps = 5;
    this.isProcessingMobile = false;

    // Browser event listener references
    this.handleVisibilityChange = null;
    this.handleFullscreenChange = null;
    this.handleWindowBlur = null;
    this.handleWindowFocus = null;

    // Intervals tracking state
    this.gazeIntervalStart = null;
    this.gazeIntervalDirection = null;
    this.gazeRecoveryStartTime = null;
    this.headIntervalStart = null;
    this.headIntervalDirection = null;
    this.headRecoveryStartTime = null;
    this.personCountZeroStartTime = null;
    this.personCountRecoveryStartTime = null;
    this.multiPersonStartTime = null;

    // Config thresholds (Accurate, real-time proctoring metrics)
    this.config = {
      gazeDurationThresholdMs: 1500, // 1.5s continuous lookaway
      headPoseDurationThresholdMs: 1500, // 1.5s continuous head turn
      faceAbsentGraceMs: 1200, // 1.2s absence
      multiPersonDurationThresholdMs: 1500, // 1.5s multi-face
      gazeCooldownMs: 1000,
      headPoseCooldownMs: 1000,
      faceAbsentCooldownMs: 3000,
      multiPersonCooldownMs: 4000,
      browserEventCooldownMs: 3000,
      gazeGraceCount: 3,
      gazeGraceWindowMs: 300000,
      headPoseGraceCount: 3,
      headPoseGraceWindowMs: 300000,
    };

    // Active timing & session state
    this.accumulatedActiveDurationMs = 0;
    this.currentSegmentStartedAt = null;
    this.activeSegments = [];
    this.configuredDurationSeconds = 0;
    this.durationSyncTimer = null;
  }

  init({ sessionId, attemptId = null, participantId, contextType = 'QUIZ', token, socket, config = {}, isTestActive = false, testStartedAt = null, configuredDurationSeconds = 0 }) {
    if (this.sessionId !== sessionId) {
      this.gazeCalibrationSessionId = null;
      this.gazeCalibrationPromise = null;
      this.accumulatedActiveDurationMs = 0;
      this.currentSegmentStartedAt = null;
      this.activeSegments = [];
      this.lastReportedEventTimes = {};
      this._lastEventEmitAt = 0;
    }
    this.sessionId = sessionId;
    try { this.browserIncidentCount = Number(sessionStorage.getItem('monitoring_browser_count_' + sessionId)) || 0; } catch (_) {}
    this.restoreBrowserOutbox();
    this.attemptId = attemptId;
    this.participantId = participantId;
    this.contextType = contextType.toUpperCase();
    this.token = token;
    this.socket = socket;
    this.config = { ...this.config, ...config };
    this.configuredDurationSeconds = Number(configuredDurationSeconds || 0);
    this.isMonitoringActive = true;
    this.isTestActive = !!isTestActive;
    this.testStartedAt = testStartedAt ? new Date(testStartedAt).getTime() : null;

    // Hydrate state from sessionStorage if resuming or reloading
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const saved = sessionStorage.getItem(`monitoring_active_state_${sessionId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.accumulatedActiveDurationMs === 'number') {
            this.accumulatedActiveDurationMs = parsed.accumulatedActiveDurationMs;
            this.activeSegments = Array.isArray(parsed.activeSegments) ? parsed.activeSegments : [];
            console.log(`[MonitoringEngine] Restored active duration from session cache: ${Math.round(this.accumulatedActiveDurationMs / 1000)}s`);
          }
        }
      }
    } catch (_) {}

    if (this.isTestActive) {
      if (!this.currentSegmentStartedAt) {
        this.currentSegmentStartedAt = Date.now();
      }
      this.isPaused = false;
    } else {
      this.isPaused = false;
    }

    this.flushBrowserEvents().catch(() => {});
    this.setupSocketListeners();
    this.setupBrowserEventListeners();
    this._startDurationSyncLoop();

    // If a previous tab crashed mid-segment, close the orphan segment so the
    // backend reaper flags the coverage gap.
    if (RECORD_MONITORING_VIDEO && SEGMENT_DURATION_MS > 0) {
      this.recoverOrphanSegment().catch(() => {});
    }

    if (this.isTestActive) {
      this._syncActiveTestTimer();
    }
  }

  setTestActive(isActive = true, startedAt = null) {
    this.isTestActive = !!isActive;
    if (isActive) {
      if (!this.currentSegmentStartedAt || startedAt) {
        this.currentSegmentStartedAt = startedAt ? new Date(startedAt).getTime() : Date.now();
      }
      this.testStartedAt = this.currentSegmentStartedAt;
      this.isPaused = false;
      this._persistActiveDurationState();
      this._syncActiveTestTimer();
    }
  }

  setPaused(isPaused = true, reason = 'PAUSED') {
    if (isPaused) {
      this.pauseActiveTestTimer(reason);
    } else {
      this.resumeActiveTestTimer(reason);
    }
  }

  startActiveTestTimer(attemptId, configuredDurationSeconds) {
    this.isTestActive = true;
    this.isPaused = false;
    if (attemptId) this.attemptId = attemptId;
    if (configuredDurationSeconds) this.configuredDurationSeconds = Number(configuredDurationSeconds);
    if (!this.currentSegmentStartedAt) {
      this.currentSegmentStartedAt = Date.now();
    }
    this.testStartedAt = this.currentSegmentStartedAt;
    this._persistActiveDurationState();
    this._syncActiveTestTimer();
  }

  pauseActiveTestTimer(reason = 'PAUSED') {
    if (!this.isTestActive) return;
    if (this.isPaused) return;

    const now = Date.now();
    if (this.currentSegmentStartedAt) {
      const elapsed = Math.max(0, now - this.currentSegmentStartedAt);
      this.accumulatedActiveDurationMs += elapsed;
      this.activeSegments.push({
        start: new Date(this.currentSegmentStartedAt).toISOString(),
        end: new Date(now).toISOString(),
        durationSec: Math.max(0, Math.round(elapsed / 1000)),
        reason,
      });
      this.currentSegmentStartedAt = null;
    }

    this.isPaused = true;
    this._flushOpenIntervals(now);
    this._persistActiveDurationState();
    this._notifyPause(reason, now);
    console.log(`[MonitoringEngine] Active test timer PAUSED (${reason}). Total active time: ${this.getActiveDurationSeconds()}s`);
  }

  resumeActiveTestTimer(reason = 'RESUMED') {
    if (!this.isTestActive) {
      this.startActiveTestTimer(this.attemptId, this.configuredDurationSeconds);
      return;
    }
    if (!this.isPaused && this.currentSegmentStartedAt) return;

    const now = Date.now();
    this.isPaused = false;
    this.currentSegmentStartedAt = now;
    this._persistActiveDurationState();
    this._notifyResume(reason, now);
    console.log(`[MonitoringEngine] Active test timer RESUMED (${reason}).`);
  }

  getActiveDurationSeconds() {
    let totalMs = this.accumulatedActiveDurationMs || 0;
    if (this.isTestActive && !this.isPaused && this.currentSegmentStartedAt) {
      totalMs += Math.max(0, Date.now() - this.currentSegmentStartedAt);
    }
    return Math.max(0, Math.round(totalMs / 1000));
  }

  _persistActiveDurationState() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage && this.sessionId) {
        sessionStorage.setItem(
          `monitoring_active_state_${this.sessionId}`,
          JSON.stringify({
            sessionId: this.sessionId,
            attemptId: this.attemptId,
            accumulatedActiveDurationMs: this.accumulatedActiveDurationMs,
            activeSegments: this.activeSegments,
            lastSavedAt: Date.now(),
          })
        );
      }
    } catch (_) {}
  }

  _notifyPause(reason, pausedAt) {
    if (!this.sessionId || this.contextType==='INTERVIEW') return;
    const token = this._getToken();
    fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/pause-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        pausedAt: new Date(pausedAt || Date.now()).toISOString(),
        reason,
        activeDurationSeconds: this.getActiveDurationSeconds(),
      })
    }).catch(() => {});
  }

  _notifyResume(reason, resumedAt) {
    if (!this.sessionId || this.contextType==='INTERVIEW') return;
    const token = this._getToken();
    fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/resume-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        resumedAt: new Date(resumedAt || Date.now()).toISOString(),
        reason,
      })
    }).catch(() => {});
  }

  _startDurationSyncLoop() {
    if (typeof setInterval === 'undefined') return;
    if (this.durationSyncTimer) clearInterval(this.durationSyncTimer);
    if (this.contextType==='INTERVIEW') return;
    this.durationSyncTimer = setInterval(() => {
      if (this.isMonitoringActive && this.isTestActive && this.sessionId) {
        this._persistActiveDurationState();
        const token = this._getToken();
        const activeSec = this.getActiveDurationSeconds();
        if (activeSec > 0 && token) {
          fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/sync-duration`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              activeDurationSeconds: activeSec,
              activeSegments: this.activeSegments,
            })
          }).catch(() => {});
        }
      }
    }, 5000);
  }

  _getToken() {
    let token = this.token;
    if (!token && typeof window !== 'undefined') {
      try {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        token = storedUser?.token || localStorage.getItem('token') || sessionStorage.getItem('token');
      } catch (_) {}
    }
    return token;
  }

  _syncActiveTestTimer(configuredDurationSeconds) {
    if (!this.sessionId || this.contextType==='INTERVIEW') return;
    const token = this._getToken();
    const activeStartIso = this.currentSegmentStartedAt
      ? new Date(this.currentSegmentStartedAt).toISOString()
      : (this.testStartedAt ? new Date(this.testStartedAt).toISOString() : new Date().toISOString());

    fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/start-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        attemptId: this.attemptId,
        testStartedAt: activeStartIso,
        configuredDurationSeconds: configuredDurationSeconds || this.configuredDurationSeconds || undefined,
      })
    }).catch(() => {});
  }

  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('monitoring:mobile_composition', (data) => {
      if (data?.sessionId === this.sessionId) {
        this.mobileCompositionState = data.compositionState;
        this.mobileUserMessage = data.userMessage || '';
        this.lastMobileHeartbeat = Date.now();
        this.onMobileDetection?.({
          compositionState: data.compositionState,
          userMessage: data.userMessage,
          detections: data.detections || [],
          event: data.event,
        });
      }
    });

    this.socket.on('monitoring:event', (data) => {
      if (data?.event) {
        this.onEventReported?.(data);
      }
    });
  }

  persistBrowserOutbox() {
    try { sessionStorage.setItem('monitoring_browser_outbox_' + this.sessionId, JSON.stringify(this.browserOutbox || [])); } catch (_) {}
  }

  restoreBrowserOutbox() {
    if (this.browserOutboxSession === this.sessionId) return;
    this.browserOutboxSession = this.sessionId;
    try { this.browserOutbox = JSON.parse(sessionStorage.getItem('monitoring_browser_outbox_' + this.sessionId) || '[]'); }
    catch (_) { this.browserOutbox = []; }
    if (!Array.isArray(this.browserOutbox)) this.browserOutbox = [];
  }

  async flushBrowserEvents() {
    if (this.browserFlushPromise) return this.browserFlushPromise;
    clearTimeout(this.browserRetryTimer);
    const queue = this.browserOutbox || [];
    this.browserFlushPromise = (async () => {
      while (queue.length) {
        const payload = queue[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let res;
        try {
          res = await fetch(`${API_BASE}/monitoring/sessions/${payload.sessionId}/events`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
            body: JSON.stringify(payload), signal: controller.signal,
          });
        } finally { clearTimeout(timeout); }
        if (!res.ok) throw new Error(`Monitoring event ingestion failed (${res.status})`);
        const body = await res.json();
        if (!body.success || (!body.data?.success && body.data?.reason !== 'IDEMPOTENT_DUPLICATE')) {
          throw new Error('Monitoring event was not acknowledged');
        }
        queue.shift();
        // Acknowledged IDs can be removed; failed requests keep their stable ID
        // across retry and refresh. Never drop a switch because another AI event
        // happened within a detector cooldown.
        try { sessionStorage.setItem('monitoring_browser_outbox_' + payload.sessionId, JSON.stringify(queue)); } catch (_) {}
        this.onEventReported?.(body.data);
        if (typeof window !== 'undefined' && body.data?.browserSwitchCount != null) {
          this.browserIncidentCount = body.data.browserSwitchCount + queue.length;
          try { sessionStorage.setItem('monitoring_browser_count_' + payload.sessionId, String(this.browserIncidentCount)); } catch (_) {}
          window.dispatchEvent(new CustomEvent('assessment:browser-count', { detail: { count: this.browserIncidentCount } }));
        }
      }
    })();
    try { return await this.browserFlushPromise; }
    catch (error) {
      if (this.isMonitoringActive) this.browserRetryTimer = setTimeout(() => this.flushBrowserEvents().catch(() => {}), 2000);
      throw error;
    } finally { this.browserFlushPromise = null; }
  }

  setupBrowserEventListeners() {
    this.cleanupBrowserEventListeners();
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    let fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    let focused = document.hasFocus();
    let episode = null;
    let timer = null;
    const active = () => this.isMonitoringActive && this.isTestActive && !this.isPaused;
    const hidden = () => document.hidden || document.visibilityState === 'hidden';
    const finish = () => { clearTimeout(timer); timer = null; episode = null; };
    const confirm = () => {
      timer = null;
      if (!episode || episode.confirmed || !active()) return;
      episode.confirmed = true;
      const eventType = episode.hidden ? 'TAB_SWITCH' : episode.blurred ? 'WINDOW_BLUR' : 'FULLSCREEN_EXIT';
      const endedAt = new Date().toISOString();
      const id = episode.id;
      this.browserIncidentCount = (this.browserIncidentCount || 0) + 1;
      try { sessionStorage.setItem('monitoring_browser_count_' + this.sessionId, String(this.browserIncidentCount)); } catch (_) {}
      window.dispatchEvent(new CustomEvent('assessment:browser-incident', { detail: { eventType, count: this.browserIncidentCount } }));
      this.reportEvent({ source: 'LAPTOP', eventType, severity: eventType === 'FULLSCREEN_EXIT' ? 'HIGH' : 'WARNING',
        durationMs: Math.max(2000, Date.now() - episode.startedAt), confidence: 1,
        startedAt: new Date(episode.startedAt).toISOString(), endedAt, occurredAt: endedAt,
        metadata: { browserIncidentId: id, trigger: 'confirmed_browser_departure',
          signals: { tabHidden: episode.hidden, windowBlur: episode.blurred, fullscreenExit: episode.fullscreen },
        },
      });
    };
    const changed = (event) => {
      const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
      const exitedFs = fullscreen && !inFs;
      fullscreen = inFs;
      if (event.type === 'blur') focused = false;
      if (event.type === 'focus') focused = true;
      if (!active()) { finish(); return; }
      const away = hidden() || !focused;
      if (episode && !away && (episode.hidden || episode.blurred || inFs)) {
        // Background tabs may throttle timers. Confirm elapsed departures on
        // return before clearing them, even if the timeout never got CPU time.
        if (!episode.confirmed && Date.now() - episode.startedAt >= 2000) confirm();
        // A completed away-and-return cycle rearms detection even if the browser
        // does not restore fullscreen automatically. Vendor duplicate events do not.
        finish();
      }
      if (!episode && (away || exitedFs)) {
        episode = { startedAt: Date.now(), id: crypto.randomUUID(), hidden: false, blurred: false, fullscreen: exitedFs, confirmed: false };
        timer = setTimeout(confirm, 2000);
      }
      if (episode) {
        episode.hidden ||= hidden();
        episode.blurred ||= !focused;
        episode.fullscreen ||= exitedFs;
      }
    };
    const documentEvents = ['visibilitychange', 'fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange', 'MSFullscreenChange'];
    documentEvents.forEach(type => document.addEventListener(type, changed));
    window.addEventListener('blur', changed);
    window.addEventListener('focus', changed);
    this.browserCleanup = () => {
      finish();
      documentEvents.forEach(type => document.removeEventListener(type, changed));
      window.removeEventListener('blur', changed);
      window.removeEventListener('focus', changed);
    };
  }

  cleanupBrowserEventListeners() {
    this.browserCleanup?.();
    this.browserCleanup = null;
  }

  // ── Pre-test Calibration ──────────────────────────────────────────────────

  async validateCalibration(videoEl) {
    if (!videoEl || videoEl.readyState < 2) {
      return { passed: false, reason: 'CAMERA_NOT_READY', message: 'Camera feed is initializing. Please wait...' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const b64Frame = canvas.toDataURL('image/jpeg', 0.6);

    try {
      const res = await fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/calibrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          participantId: this.participantId,
          frame: b64Frame,
        }),
      });

      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('[MonitoringEngine] Calibration error:', err);
      return { passed: false, reason: 'NETWORK_ERROR', message: 'Unable to communicate with calibration service.' };
    }
  }

  // ── Laptop Camera Pipeline ────────────────────────────────────────────────

  // ── Laptop Camera Pipeline ────────────────────────────────────────────────

  _getSessionId() {
    return this.sessionId
      || sessionStorage.getItem('monitoring_session_id')
      || sessionStorage.getItem('quiz_session_token')
      || this.attemptId
      || 'active_session';
  }

  _segAuthHeaders() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  _buildRecordStream(stream) {
    let recordStream = stream;
    if (this.laptopCanvas && typeof this.laptopCanvas.captureStream === 'function') {
      try {
        recordStream = this.laptopCanvas.captureStream(15);
        const audioTrack = stream?.getAudioTracks()?.[0];
        if (audioTrack) recordStream.addTrack(audioTrack);
      } catch (_) {
        recordStream = stream;
      }
    }
    return recordStream;
  }

  _createRecorder(stream) {
    const mimeTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
      'video/mp4',
    ];
    const selectedMime = mimeTypes.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    return selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);
  }

  startWebcamRecording(stream) {
    try {
      if (typeof MediaRecorder === 'undefined') return;
      if (!RECORD_MONITORING_VIDEO) return; // video storage disabled

      this.recordedChunks = [];
      const recordStream = this._buildRecordStream(stream);
      if (!recordStream) return;

      if (SEGMENT_DURATION_MS > 0) {
        this._startSegmentRecording(recordStream);
        return;
      }

      // Legacy single-video recording (kept for back-compat).
      const recorder = this._createRecorder(recordStream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
      };
      recorder.start(1000);
      this.mediaRecorder = recorder;
      console.log('[MonitoringEngine] Started webcam session recording (legacy single-video mode)');
    } catch (err) {
      console.warn('[MonitoringEngine] Could not start MediaRecorder:', err.message);
    }
  }

  // ── Zero-gap segmented recording ──────────────────────────────────────────
  // Rotates the MediaRecorder every SEGMENT_DURATION_MS, finalizes + uploads
  // each finished segment in the background, and immediately starts the next
  // segment so no media gap exists.

  _segStorageKey() {
    const sid = this._getSessionId();
    return `monitoring_segment:${sid}`;
  }

  _persistSegmentMarker() {
    try {
      sessionStorage.setItem(this._segStorageKey(), JSON.stringify({
        sequence: this.segmentSequence,
        startedAt: this.segmentStartedAt,
      }));
    } catch (_) {}
  }

  _clearSegmentMarker() {
    try {
      sessionStorage.removeItem(this._segStorageKey());
    } catch (_) {}
  }

  _segmentKeyFor(sid, seg) {
    return `${sid}_seg_${seg?.sequence || this.segmentSequence}`;
  }

  _drainRecordedChunks() {
    const chunks = this.recordedChunks || [];
    this.recordedChunks = [];
    return chunks;
  }

  // Idempotent register; safe to call again if the boot-time register failed or
  // the page reloaded mid-segment.
  async _ensureSegmentRegisteredFor(seg) {
    const sid = this._getSessionId();
    const segmentKey = this._segmentKeyFor(sid, seg);
    try {
      const res = await fetch(`${API_BASE}/monitoring/sessions/${sid}/segments/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._segAuthHeaders() },
        body: JSON.stringify({
          segmentSequence: seg.sequence,
          startedAt: new Date(seg.startedAt).toISOString(),
        }),
      });
      const result = await res.json();
      return result?.success ? (result?.data?.segment?.segmentKey || segmentKey) : segmentKey;
    } catch (err) {
      console.warn('[MonitoringEngine] Segment register failed (will retry on finalize):', err.message);
      return segmentKey;
    }
  }

  _startSegmentRecording(stream) {
    this.segmentSequence += 1;
    this.segmentStartedAt = Date.now();
    this.segmentKey = null;
    this.segmentUploadKey = `uk_${this._getSessionId()}_${this.segmentSequence}_${Date.now().toString(36)}`;
    this.recordedChunks = [];
    this.segmentRecordStream = stream;
    this._persistSegmentMarker();

    // Captured per-segment metadata so background finalize/upload never reads
    // the *next* segment's state after a rotation.
    const meta = {
      sequence: this.segmentSequence,
      startedAt: this.segmentStartedAt,
      uploadKey: this.segmentUploadKey,
    };
    const recorder = this._createRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
    };
    recorder.onstop = () => {
      // Fallback path if the recorder is stopped outside _rotateSegment /
      // stopAndUploadRecording (both replace this handler first).
      const chunkCopy = this._drainRecordedChunks();
      this._finalizeAndUploadSegment(chunkCopy, recorder.mimeType || 'video/webm', meta)
        .catch((err) => console.warn('[MonitoringEngine] Segment background upload failed:', err.message));
    };
    recorder.start(1000);
    this.mediaRecorder = recorder;
    console.log(`[MonitoringEngine] Started segment ${this.segmentSequence} recording`);

    clearInterval(this.segmentTimer);
    this.segmentTimer = setInterval(() => this._rotateSegment(), SEGMENT_DURATION_MS);
    this.segmentTimer.unref?.();

    // Best-effort: rotate on tab hidden/close so long segments don't span
    // a page teardown with zero upload progress.
    if (!this._visHandler) {
      this._visHandler = () => {
        if (document.visibilityState === 'hidden' && this.mediaRecorder?.state === 'recording') {
          this._rotateSegment();
        }
      };
      try {
        document.addEventListener('visibilitychange', this._visHandler);
        window.addEventListener('pagehide', this._visHandler);
      } catch (_) {}
    }
  }

  _rotateSegment() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    const stream = this.segmentRecordStream;
    if (!stream) return;
    try {
      const recorder = this.mediaRecorder;
      const meta = {
        sequence: this.segmentSequence,
        startedAt: this.segmentStartedAt,
        uploadKey: this.segmentUploadKey,
      };
      this.mediaRecorder.onstop = () => {
        const chunkCopy = this._drainRecordedChunks();
        this._finalizeAndUploadSegment(chunkCopy, recorder.mimeType || 'video/webm', meta)
          .catch((err) => console.warn('[MonitoringEngine] Rotated segment upload failed:', err.message));
        this._startSegmentRecording(stream); // zero-gap
      };
      recorder.stop();
    } catch (err) {
      console.warn('[MonitoringEngine] Segment rotation failed:', err.message);
    }
  }

  _finalizeAndUploadSegment(chunks, mimeType, meta = null) {
    return (async () => {
      const sid = this._getSessionId();
      // meta is captured at recorder-stop time so background processing always
      // touches the finished segment, never the one that just started.
      const seg = meta || {
        sequence: this.segmentSequence,
        startedAt: this.segmentStartedAt,
        uploadKey: this.segmentUploadKey,
      };
      const segmentKey = await this._ensureSegmentRegisteredFor(seg);

      const durationSec = chunks.length > 0
        ? Math.max(0, Math.round((Date.now() - (seg.startedAt || Date.now())) / 1000))
        : 0;
      try {
        await fetch(`${API_BASE}/monitoring/sessions/${sid}/segments/${segmentKey}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this._segAuthHeaders() },
          body: JSON.stringify({
            endedAt: new Date().toISOString(),
            durationSec,
          }),
        });
      } catch (err) {
        console.warn('[MonitoringEngine] Segment finalize failed:', err.message);
      }

      if (chunks.length === 0) {
        this._clearSegmentMarker();
        return;
      }
      await this._uploadSegment({ sid, segmentKey, sequence: seg.sequence, startedAt: seg.startedAt, chunks, mimeType, uploadKey: seg.uploadKey });
      this._clearSegmentMarker();
    })();
  }

  async _uploadSegment(args) {
    // Serialize segment uploads so parallel rotation bursts never thrash the
    // connection.
    const p = (this.segmentUploadPromise || Promise.resolve())
      .then(() => this._doUploadSegment(args));
    this.segmentUploadPromise = p.catch(() => {});
    return p;
  }

  async _doUploadSegment({ sid, segmentKey, sequence, startedAt, chunks, mimeType, uploadKey }) {
    this.segmentUploadInFlight += 1;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const blob = new Blob(chunks, { type: mimeType });
        const formData = new FormData();
        formData.append('video', blob, `${segmentKey}.webm`);
        formData.append('uploadKey', uploadKey);
        if (this.attemptId) formData.append('attemptId', String(this.attemptId));
        if (this.participantId) formData.append('participantId', String(this.participantId));
        if (startedAt) formData.append('startedAt', String(startedAt));
        try {
          const res = await fetch(`${API_BASE}/monitoring/sessions/${sid}/segments/${segmentKey}/video`, {
            method: 'POST',
            headers: this._segAuthHeaders(),
            body: formData,
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result?.error || `HTTP ${res.status}`);
          console.log(`[MonitoringEngine] Uploaded segment ${sequence} (${(blob.size / 1048576).toFixed(1)} MB)`);
          return result?.data?.segment?.segmentKey || segmentKey;
        } catch (err) {
          if (attempt === 0) {
            console.warn('[MonitoringEngine] Segment upload error, retrying once:', err.message);
          } else {
            // Backend reaper flags the FINALIZING segment after its grace period.
            console.warn('[MonitoringEngine] Segment upload failed after retry; backend reaper will flag it:', err.message);
            return null;
          }
        }
      }
      return null;
    } finally {
      this.segmentUploadInFlight = Math.max(0, this.segmentUploadInFlight - 1);
    }
  }

  async stopAndUploadRecording() {
    if (!RECORD_MONITORING_VIDEO) {
      this.recordedChunks = [];
      this.mediaRecorder = null;
      return null;
    }
    if (!this.mediaRecorder) return null;

    const sid = this._getSessionId();

    if (SEGMENT_DURATION_MS > 0) {
      // Segmented mode: finalize + upload the current segment, then stop.
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
      if (this._visHandler) {
        try {
          document.removeEventListener('visibilitychange', this._visHandler);
          window.removeEventListener('pagehide', this._visHandler);
        } catch (_) {}
        this._visHandler = null;
      }

      this._clearSegmentMarker();
      const recorder = this.mediaRecorder;
      this.mediaRecorder = null;
      return new Promise((resolve) => {
        try {
          if (!recorder || recorder.state === 'inactive') {
            resolve(null);
            return;
          }
          const meta = {
            sequence: this.segmentSequence,
            startedAt: this.segmentStartedAt,
            uploadKey: this.segmentUploadKey,
          };
          recorder.onstop = async () => {
            try {
              const chunks = this._drainRecordedChunks();
              await this._finalizeAndUploadSegment(chunks, recorder.mimeType || 'video/webm', meta);
            } finally {
              // Wait for any rotated segments still uploading so submit-time
              // teardown doesn't lose them.
              await (this.segmentUploadPromise?.catch(() => {}) || Promise.resolve());
              resolve(null);
            }
          };
          recorder.stop();
        } catch (err) {
          resolve(null);
        }
      });
    }

    // Legacy mode
    return new Promise((resolve) => {
      try {
        if (this.mediaRecorder.state === 'inactive') {
          if (!this.recordedChunks || this.recordedChunks.length === 0) return resolve(null);
          this._uploadChunks(sid, resolve);
          return;
        }
        this.mediaRecorder.onstop = async () => {
          await this._uploadChunks(sid, resolve);
        };
        this.mediaRecorder.stop();
      } catch (err) {
        console.warn('[MonitoringEngine] Stop recording error:', err.message);
        resolve(null);
      }
    });
  }

  // Reconcile state left behind by a crashed tab: if a segment marker is still
  // pending, finalize it so the backend reaper flags it as a coverage gap.
  async recoverOrphanSegment() {
    if (!RECORD_MONITORING_VIDEO || SEGMENT_DURATION_MS <= 0) return;
    try {
      const raw = sessionStorage.getItem(this._segStorageKey());
      if (!raw) return;
      const marker = JSON.parse(raw);
      if (!marker?.sequence || !marker?.startedAt) {
        this._clearSegmentMarker();
        return;
      }
      const ageSec = Math.round((Date.now() - Number(marker.startedAt)) / 1000);
      if (ageSec < 5) return; // a live segment is still recording
      const sid = this._getSessionId();
      const seg = {
        sequence: Number(marker.sequence) || 1,
        startedAt: Number(marker.startedAt),
      };
      const segmentKey = await this._ensureSegmentRegisteredFor(seg);
      await fetch(`${API_BASE}/monitoring/sessions/${sid}/segments/${segmentKey}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._segAuthHeaders() },
        body: JSON.stringify({ endedAt: new Date().toISOString(), durationSec: ageSec }),
      }).catch(() => {});
      this._clearSegmentMarker();
      console.warn(`[MonitoringEngine] Marked orphan segment ${seg.sequence} finalizing (media lost on crash)`);
    } catch (_) {}
  }

  async _uploadChunks(sid, resolve) {
    try {
      if (!this.recordedChunks || this.recordedChunks.length === 0) {
        return resolve(null);
      }
      const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
      const formData = new FormData();
      formData.append('video', blob, `monitoring_${sid}.webm`);
      if (this.attemptId) formData.append('attemptId', String(this.attemptId));
      if (this.participantId) formData.append('participantId', String(this.participantId));

      const res = await fetch(`${API_BASE}/monitoring/sessions/${sid}/video`, {
        method: 'POST',
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: formData,
      });
      const result = await res.json();
      console.log('[MonitoringEngine] Uploaded session video successfully:', result);
      resolve(result?.data?.videoUrl || null);
    } catch (uploadErr) {
      console.warn('[MonitoringEngine] Video upload error:', uploadErr.message);
      resolve(null);
    }
  }

  startLaptopMonitoring(stream, videoElement, onDetection, testStartedAt = null) {
    this.stopLaptopMonitoring({ stopTracks: false });
    this.laptopStream = stream;
    this.laptopVideo = videoElement;
    if (videoElement && stream) {
      videoElement.srcObject = stream;
      videoElement.play().catch(() => {});
    }
    this.onLaptopDetection = onDetection;
    this.isMonitoringActive = true;
    if (testStartedAt) {
      this.testStartedAt = new Date(testStartedAt).getTime();
    }

    // Begin background stream recording for post-test review
    this.startWebcamRecording(stream);

    if (!this.laptopCanvas) {
      this.laptopCanvas = document.createElement('canvas');
      this.laptopCanvas.width = 360;
      this.laptopCanvas.height = 270;
    }

    // In async recorded-video mode the live loop only acts as a degraded
    // safety net: low-FPS occupancy heartbeat (calibration still runs at full
    // precision on demand). The authoritative score comes from processed
    // segments, not from this loop.
    const asyncPipeline = RECORD_MONITORING_VIDEO && SEGMENT_DURATION_MS > 0;
    const intervalMs = asyncPipeline
      ? Math.floor(1000 / 0.2) // one occupancy heartbeat every 5s
      : Math.floor(1000 / this.laptopFps);
    this.laptopInterval = setInterval(() => this.tickLaptopFrame(), intervalMs);
    console.log(`[MonitoringEngine] Laptop monitoring active (${asyncPipeline ? '0.2' : this.laptopFps} FPS, testActive=${this.isTestActive}${asyncPipeline ? ', async-recorded priority' : ''})`);
  }

  stopLaptopMonitoring({ stopTracks = true } = {}) {
    if (this.laptopInterval) {
      clearInterval(this.laptopInterval);
      this.laptopInterval = null;
    }
    // Flush any in-progress Eye/Head deviation interval so the final seconds
    // of a lookaway that runs up to submission are still counted.
    this._flushOpenIntervals(Date.now());
    this.stopAndUploadRecording();
    if (stopTracks && this.laptopStream) {
      try {
        this.laptopStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      this.laptopStream = null;
    }
    if (this.laptopVideo) {
      try {
        this.laptopVideo.srcObject = null;
      } catch (_) {}
      this.laptopVideo = null;
    }
  }

  async calibrateGazeBaseline(videoEl) {
    if (!this.sessionId || !videoEl) return false;
    if (this.gazeCalibrationSessionId === this.sessionId) return true;
    if (this.gazeCalibrationPromise) return this.gazeCalibrationPromise;

    this.gazeCalibrationPromise = (async () => {
      // The MediaPipe detector needs ten centered frames to establish the
      // iris baseline. Without this handshake it learns the first exam frames
      // as neutral, which can hide a genuine eye-only look-away.
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const response = await this.validateCalibration(videoEl);
        const result = response?.data || response || {};
        if (result.ready === true) {
          this.gazeCalibrationSessionId = this.sessionId;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    })();

    try {
      return await this.gazeCalibrationPromise;
    } finally {
      this.gazeCalibrationPromise = null;
    }
  }

  async finishSession(options = {}) {
    if (!this.sessionId) return null;
    const now = Date.now();
    await this._flushOpenIntervals(now);
    await this.flushBrowserEvents();

    // Finalize any open active segment
    if (this.isTestActive && !this.isPaused && this.currentSegmentStartedAt) {
      const elapsed = Math.max(0, now - this.currentSegmentStartedAt);
      this.accumulatedActiveDurationMs += elapsed;
      this.activeSegments.push({
        start: new Date(this.currentSegmentStartedAt).toISOString(),
        end: new Date(now).toISOString(),
        durationSec: Math.max(0, Math.round(elapsed / 1000)),
        reason: 'SESSION_FINISH',
      });
      this.currentSegmentStartedAt = null;
    }
    this.isTestActive = false;
    this._persistActiveDurationState();

    if (this.durationSyncTimer) {
      clearInterval(this.durationSyncTimer);
      this.durationSyncTimer = null;
    }

    const finalActiveDurationSec = options.actualTestDurationSeconds != null
      ? Number(options.actualTestDurationSeconds)
      : this.getActiveDurationSeconds();

    try {
      const token = this._getToken();
      const response = await fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          actualTestDurationSeconds: finalActiveDurationSec,
          activeSegments: this.activeSegments,
        }),
      });
      if (!response.ok) console.warn(`Monitoring session finalization notice (${response.status})`);
      const data = await response.json();
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem(`monitoring_active_state_${this.sessionId}`);
        }
      } catch (_) {}
      return data;
    } catch (e) {
      console.warn('[MonitoringEngine] finishSession error:', e.message);
      return null;
    }
  }

  async tickLaptopFrame() {
    if (!this.isMonitoringActive || !this.isTestActive || this.isPaused || this.isProcessingLaptop || !this.laptopVideo || this.laptopVideo.readyState < 2) return;
    if (this.testStartedAt && Date.now() < this.testStartedAt) return;

    this.isProcessingLaptop = true;
    try {
      const ctx = this.laptopCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.laptopVideo, 0, 0, this.laptopCanvas.width, this.laptopCanvas.height);

      // Draw the latest authoritative MediaPipe state onto the recording.
      const w = this.laptopCanvas.width;
      const h = this.laptopCanvas.height;
      const hudGaze = this.gazeIntervalDirection ? `OFF-${this.gazeIntervalDirection}` : 'ON_SCREEN';
      const hudHead = this.headIntervalDirection ? `${this.headIntervalDirection}` : 'CENTER';
      const isDeviation = this.gazeIntervalDirection != null || this.headIntervalDirection != null;
      const badgeBg = isDeviation ? 'rgba(220, 38, 38, 0.85)' : 'rgba(22, 163, 74, 0.85)';
      const badgeColor = isDeviation ? '#dc2626' : '#16a34a';

      // Face tracking box guide
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.22, h * 0.12, w * 0.56, h * 0.72);

      // Top Gaze & Posture Badge
      ctx.fillStyle = badgeBg;
      ctx.fillRect(8, 8, w - 16, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`GAZE: ${hudGaze}  |  HEAD: ${hudHead}`, 14, 23);

      // Bottom Timestamp Watermark
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(8, h - 20, w - 16, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '9px monospace';
      ctx.fillText(`PROCTORING • ${new Date().toLocaleTimeString()}`, 14, h - 8);

      const b64Frame = this.laptopCanvas.toDataURL('image/jpeg', 0.4);
      const res = await fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/laptop/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          frame: b64Frame,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && data?.data) {
        this.processLaptopMetrics(data.data);
      }
    } catch (err) {
      // Non-blocking frame tick error
    } finally {
      this.isProcessingLaptop = false;
    }
  }

  processLaptopMetrics(metrics) {
    if (!this.isMonitoringActive || !this.isTestActive || this.isPaused) return;
    if (this.testStartedAt && Date.now() < this.testStartedAt) return;
    const now = Date.now();
    const faceCount = Number(metrics.face_count ?? (metrics.faceDetected ? 1 : (metrics.faceCount || 0))) || 0;
    const faceDetected = Boolean(metrics.face_detected ?? metrics.faceDetected ?? (faceCount > 0));
    // Occupant presence can be proven even without facial landmarks (body/person
    // fallback from the AI service). Only a frame with NO face AND NO person is
    // an actual "no person" state.
    const personDetected = metrics.person_detected !== undefined && metrics.person_detected !== null
      ? Boolean(metrics.person_detected)
      : (metrics.personDetected !== undefined && metrics.personDetected !== null
          ? Boolean(metrics.personDetected)
          : faceDetected);

    let gazeClassification = metrics.gaze_classification || metrics.gaze || 'ON_SCREEN';
    if (!metrics.gaze_classification && metrics.gaze_direction) {
      const gd = String(metrics.gaze_direction).toUpperCase();
      gazeClassification = ['STRAIGHT', 'CENTER', 'UNKNOWN', 'ON_SCREEN', 'NOT DETECTED'].includes(gd) ? 'ON_SCREEN' : `OFF_SCREEN_${gd}`;
    }

    const gazeConfidence = Number(metrics.gaze_confidence ?? metrics.gazeConfidence ?? 1.0);

    let headPose = metrics.head_pose || metrics.headPose;
    if (!headPose && (metrics.yaw !== undefined || metrics.pitch !== undefined)) {
      headPose = { yaw: Number(metrics.yaw) || 0, pitch: Number(metrics.pitch) || 0, roll: 0 };
    }
    headPose = headPose || { yaw: 0, pitch: 0, roll: 0 };

    const headDirection = metrics.head_direction || metrics.head_pose_classification;

    this.onLaptopDetection?.({
      faceDetected,
      faceCount,
      personDetected,
      gaze: gazeClassification,
      gazeConfidence,
      gazeAudit: metrics.gaze_audit || null,
      headPose,
    });

    // ── 1. Person Count State Machine ───────────────────────────────────────
    const noPerson = (!faceDetected || faceCount === 0) && !personDetected;
    if (noPerson) {
      if (!this.personCountZeroStartTime) {
        this.personCountZeroStartTime = now;
      }
    } else {
      this._closeAndReportFaceAbsentInterval(now);
    }

    // Multi-person is a single interval, closed when the frame returns to one person.
    if (faceCount > 1) {
      if (!this.multiPersonStartTime) {
        this.multiPersonStartTime = now;
      }
    } else {
      this._closeAndReportMultiPersonInterval(now);
    }

    // ── 2. Eye Gaze: Continuous per-direction interval scoring ─────────────
    const gazeDir = this._classifyGazeDirection(gazeClassification);
    this._closeAndReportGazeInterval(now, gazeDir, gazeConfidence);

    if (gazeDir !== null) {
      if (this.gazeIntervalStart === null) {
        this.gazeIntervalStart = now;
        this.gazeIntervalDirection = gazeDir;
      } else if (this.gazeIntervalDirection !== gazeDir) {
        this.gazeIntervalStart = now;
        this.gazeIntervalDirection = gazeDir;
      }
    }

    // ── 3. Head Pose: Continuous per-direction interval scoring ───────────
    const headDir = this._classifyHeadDirection(headPose, headDirection);
    this._closeAndReportHeadInterval(now, headDir);

    if (headDir !== null) {
      if (this.headIntervalStart === null) {
        this.headIntervalStart = now;
        this.headIntervalDirection = headDir;
      } else if (this.headIntervalDirection !== headDir) {
        this.headIntervalStart = now;
        this.headIntervalDirection = headDir;
      }
    }
  }

  // Map gaze classification to a scored direction (Down is ignored/permitted).
  _classifyGazeDirection(gaze_classification) {
    const g = (gaze_classification || '').toUpperCase();
    if (g.includes('LEFT')) return 'LEFT';
    if (g.includes('RIGHT')) return 'RIGHT';
    if (g.includes('UP')) return 'UP';
    if (g.includes('DOWN')) return 'DOWN'; // ignored downstream (reading)
    return null; // ON_SCREEN / CENTER / unknown
  }

  // Map head pose to a scored direction (Down / pitch-down is ignored).
  _classifyHeadDirection(head_pose, head_direction) {
    if (head_direction) {
      const h = String(head_direction).toUpperCase();
      if (h.includes('LEFT')) return 'LEFT';
      if (h.includes('RIGHT')) return 'RIGHT';
      if (h.includes('UP')) return 'UP';
      if (h.includes('DOWN')) return 'DOWN';
    }
    const yaw = Number(head_pose?.yaw || 0);
    const pitch = Number(head_pose?.pitch || 0);
    if (Math.abs(yaw) >= 14.0) {
      return yaw > 0 ? 'RIGHT' : 'LEFT';
    }
    if (pitch < -15.0) return 'UP'; // looking up (scored)
    if (pitch > 22.0) return 'DOWN'; // looking down (ignored downstream)
    return null; // CENTER
  }

  async _closeAndReportGazeInterval(now, currentDir, gaze_confidence, forceClose = false) {
    if (this.gazeIntervalStart === null) return null;
    const start = this.gazeIntervalStart;
    const dir = this.gazeIntervalDirection;

    if (!forceClose && currentDir === dir) {
      return null;
    }

    const endTimestamp = now;
    const durationMs = Math.max(50, endTimestamp - start);
    this.gazeIntervalStart = null;
    this.gazeIntervalDirection = null;
    this.gazeRecoveryStartTime = null;

    if (durationMs < 50 || dir === null || dir === 'DOWN') return null;

    const eventType = `GAZE_OFF_SCREEN_${dir}`;
    return this.reportEvent({
      source: 'LAPTOP',
      eventType,
      severity: 'WARNING',
      durationMs,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(endTimestamp).toISOString(),
      occurredAt: new Date(endTimestamp).toISOString(),
      confidence: gaze_confidence || 0.9,
      metadata: {
        direction: dir,
        durationMs,
        detail: `Gaze deviated ${dir} for ${(durationMs / 1000).toFixed(2)}s`,
        violationEndTime: new Date(endTimestamp).toISOString(),
      },
    });
  }

  async _closeAndReportHeadInterval(now, currentDir, forceClose = false) {
    if (this.headIntervalStart === null) return null;
    const start = this.headIntervalStart;
    const dir = this.headIntervalDirection;

    if (!forceClose && currentDir === dir) {
      this.headRecoveryStartTime = null;
      return null;
    }

    if (!forceClose && currentDir !== dir) {
      if (this.headRecoveryStartTime === null) {
        this.headRecoveryStartTime = now;
        return null;
      }
      if (now - this.headRecoveryStartTime < 350) {
        return null; // Within noise tolerance
      }
    }

    const endTimestamp = forceClose ? now : (this.headRecoveryStartTime || now);
    const durationMs = Math.max(50, endTimestamp - start);
    this.headIntervalStart = null;
    this.headIntervalDirection = null;
    this.headRecoveryStartTime = null;

    if (durationMs < 50 || dir === null || dir === 'DOWN') return null;

    const eventType = `HEAD_LOOKING_${dir === 'UP' ? 'UP' : dir === 'LEFT' ? 'LEFT' : 'RIGHT'}`;
    return this.reportEvent({
      source: 'LAPTOP',
      eventType,
      severity: 'WARNING',
      durationMs,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(endTimestamp).toISOString(),
      occurredAt: new Date(endTimestamp).toISOString(),
      confidence: 0.85,
      metadata: {
        direction: dir,
        durationMs,
        detail: `Head turned ${dir} for ${(durationMs / 1000).toFixed(2)}s`,
      },
    });
  }

  async _closeAndReportFaceAbsentInterval(now, forceClose = false) {
    if (this.personCountZeroStartTime === null) return null;
    const start = this.personCountZeroStartTime;

    if (!forceClose) {
      if (this.personCountRecoveryStartTime === null) {
        this.personCountRecoveryStartTime = now;
        return null;
      }
      if (now - this.personCountRecoveryStartTime < 300) {
        return null;
      }
    }

    const endTimestamp = forceClose ? now : (this.personCountRecoveryStartTime || now);
    const durationMs = Math.max(0, endTimestamp - start);
    this.personCountZeroStartTime = null;
    this.personCountRecoveryStartTime = null;

    if (durationMs < this.config.faceAbsentGraceMs) return null;
    return this.reportEvent({
      source: 'LAPTOP',
      eventType: 'FACE_ABSENT',
      severity: 'WARNING',
      durationMs,
      confidence: 0.9,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(endTimestamp).toISOString(),
      occurredAt: new Date(endTimestamp).toISOString(),
      metadata: { detail: 'Candidate face absent from camera view' },
    });
  }

  async _closeAndReportMultiPersonInterval(now) {
    if (this.multiPersonStartTime === null) return null;
    const start = this.multiPersonStartTime;
    this.multiPersonStartTime = null;
    const durationMs = Math.max(0, now - start);
    if (durationMs < (this.config.multiPersonDurationThresholdMs || 1500)) return null;
    return this.reportEvent({
      source: 'LAPTOP',
      eventType: 'MULTIPLE_FACES',
      severity: 'HIGH',
      durationMs,
      confidence: 0.92,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(now).toISOString(),
      occurredAt: new Date(now).toISOString(),
      metadata: { detail: 'Multiple persons detected in camera view' },
    });
  }

  async _flushOpenIntervals(now) {
    if (this.sessionId && this.isMonitoringActive) {
      await Promise.all([
        this._closeAndReportGazeInterval(now, null, 0.9, true),
        this._closeAndReportHeadInterval(now, null, true),
        this._closeAndReportFaceAbsentInterval(now, true),
        this._closeAndReportMultiPersonInterval(now),
      ]);
    }
  }

  // ── Mobile Camera Pipeline ────────────────────────────────────────────────

  startMobileMonitoring(stream, videoElement, onDetection) {
    this.stopMobileMonitoring({ stopTracks: false });
    this.mobileStream = stream;
    this.mobileVideo = videoElement;
    this.onMobileDetection = onDetection;
    this.isMonitoringActive = true;

    if (!this.mobileCanvas) {
      this.mobileCanvas = document.createElement('canvas');
      this.mobileCanvas.width = 320;
      this.mobileCanvas.height = 240;
    }

    const intervalMs = Math.floor(1000 / (this.mobileFps || 5));
    this.mobileInterval = setInterval(() => this.tickMobileFrame(), intervalMs);
    console.log(`[MonitoringEngine] Mobile monitoring active (${this.mobileFps || 5} FPS)`);
  }

  stopMobileMonitoring({ stopTracks = true } = {}) {
    if (this.mobileInterval) {
      clearInterval(this.mobileInterval);
      this.mobileInterval = null;
    }
    if (stopTracks && this.mobileStream) {
      try {
        this.mobileStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      this.mobileStream = null;
    }
    if (this.mobileVideo) {
      try {
        this.mobileVideo.srcObject = null;
      } catch (_) {}
      this.mobileVideo = null;
    }
  }

  async tickMobileFrame() {
    if (!this.isMonitoringActive || this.isProcessingMobile || !this.mobileVideo || this.mobileVideo.readyState < 2) return;

    this.isProcessingMobile = true;
    try {
      const ctx = this.mobileCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.mobileVideo, 0, 0, this.mobileCanvas.width, this.mobileCanvas.height);
      const b64Frame = this.mobileCanvas.toDataURL('image/jpeg', 0.4);

      if (this.socket && this.socket.connected) {
        this.socket.emit('monitoring:mobile_frame', {
          sessionId: this.sessionId,
          frame: b64Frame,
          participantId: this.participantId,
        });
      } else {
        // Non-blocking asynchronous HTTP fallback
        fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/mobile/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          body: JSON.stringify({
            sessionId: this.sessionId,
            participantId: this.participantId,
            frame: b64Frame,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data?.success) {
              this.mobileCompositionState = data.composition_state;
              this.mobileUserMessage = data.user_message;
              this.onMobileDetection?.({
                compositionState: data.composition_state,
                userMessage: data.user_message,
                detections: data.detections || [],
              });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      // Non-blocking
    } finally {
      this.isProcessingMobile = false;
    }
  }

  // ── Authoritative Event Reporting ─────────────────────────────────────────

  async reportEvent({ source = 'LAPTOP', eventType, severity = 'INFO', durationMs = 0, confidence = 1.0, metadata = {}, startedAt = null, endedAt = null, occurredAt = null }) {
    if (!this.isMonitoringActive || this.isPaused || !eventType) return;
    if (this.isTestActive && this.testStartedAt && Date.now() < this.testStartedAt) return;

    const now = Date.now();
    const resolvedDurationMs = Math.max(0, Number(durationMs) || 0);
    const resolvedEnd = occurredAt || endedAt || new Date(now).toISOString();
    const resolvedStart = startedAt || metadata.violationStartTime || new Date(new Date(resolvedEnd).getTime() - resolvedDurationMs).toISOString();
    if (!this.lastReportedEventTimes) this.lastReportedEventTimes = {};
    const discreteBrowserIncident = !!metadata.browserIncidentId;
    const lastReportTime = this.lastReportedEventTimes[eventType] || 0;
    // Global 1 event/sec emit cap so detection bursts never flood the socket.
    this._lastEventEmitAt = this._lastEventEmitAt || 0;
    if (!discreteBrowserIncident && now - this._lastEventEmitAt < 1000) return;
    const isGranularEyeHead = /^GAZE_OFF_SCREEN_(LEFT|RIGHT|UP)$/.test(eventType) || /^HEAD_LOOKING_(LEFT|RIGHT|UP)$/.test(eventType);
    const cooldown = this.config[`${eventType}_cooldown`] || (isGranularEyeHead ? 3000 : 12000);
    if (!discreteBrowserIncident && now - lastReportTime < cooldown) {
      return; // Skip duplicate burst
    }
    this.lastReportedEventTimes[eventType] = now;
    this._lastEventEmitAt = now;

    const idempotencyKey = metadata.browserIncidentId ? ('browser_' + metadata.browserIncidentId) : this.sessionId
      ? `${this.sessionId}_${source}_${eventType}_${new Date(resolvedStart).getTime()}_${new Date(resolvedEnd).getTime()}`
      : null;
    const payload = {
      sessionId: this.sessionId,
      monitoringSessionId: this.sessionId,
      attemptId: this.attemptId,
      participantId: this.participantId,
      source,
      eventType,
      severity,
      durationMs: resolvedDurationMs,
      duration: Math.round(resolvedDurationMs / 100) / 10,
      confidence,
      occurredAt: resolvedEnd,
      timestamp: resolvedEnd,
      metadata: {
        ...metadata,
        violationStartTime: resolvedStart,
        violationEndTime: endedAt || metadata.violationEndTime || resolvedEnd,
      },
      idempotencyKey,
    };

    if (discreteBrowserIncident) {
      this.browserOutbox ||= [];
      if (!this.browserOutbox.some(item => item.idempotencyKey === payload.idempotencyKey)) this.browserOutbox.push(payload);
      this.persistBrowserOutbox();
      return this.flushBrowserEvents().catch(() => null);
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      };
      const endpoint = this.sessionId
        ? `${API_BASE}/monitoring/sessions/${this.sessionId}/events`
        : (this.attemptId ? `${API_BASE}/proctoring/events` : null);
      if (!endpoint) return;
      const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Monitoring event ingestion failed (${res.status})`);
      const data = await res.json();
      if (data?.success && data?.data) {
        this.onEventReported?.(data.data);
      }
      return data;
    } catch (err) {
      console.warn('[MonitoringEngine] Failed to submit monitoring event:', err);
    }
  }

  destroy({ stopTracks = true } = {}) {
    clearTimeout(this.browserRetryTimer);
    this.isMonitoringActive = false;
    this.isTestActive = false;
    if (this.durationSyncTimer) {
      clearInterval(this.durationSyncTimer);
      this.durationSyncTimer = null;
    }
    this.stopLaptopMonitoring({ stopTracks });
    this.stopMobileMonitoring({ stopTracks });
    this.cleanupBrowserEventListeners();
    if (stopTracks && this.laptopStream) {
      try { this.laptopStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      this.laptopStream = null;
    }
    if (stopTracks && this.mobileStream) {
      try { this.mobileStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      this.mobileStream = null;
    }
    if (this.socket) {
      this.socket.off('monitoring:mobile_composition');
      this.socket.off('monitoring:event');
    }
  }
}

export default new MonitoringEngineClient();
