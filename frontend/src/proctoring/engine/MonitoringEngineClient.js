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
    this.isProcessingLaptop = false;
    this.gazeCalibrationSessionId = null;
    this.gazeCalibrationPromise = null;
    this.testStartedAt = null;
    this.onLaptopDetection = null;
    this.onMobileDetection = null;
    this.onEventReported = null;
    this.lastReportedEventTimes = {};

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
  }

  init({ sessionId, attemptId = null, participantId, contextType = 'QUIZ', token, socket, config = {} }) {
    if (this.sessionId !== sessionId) {
      this.gazeCalibrationSessionId = null;
      this.gazeCalibrationPromise = null;
    }
    this.sessionId = sessionId;
    this.attemptId = attemptId;
    this.participantId = participantId;
    this.contextType = contextType.toUpperCase();
    this.token = token;
    this.socket = socket;
    this.config = { ...this.config, ...config };
    this.isMonitoringActive = true;
    this.lastReportedEventTimes = {};

    this.setupSocketListeners();
    this.setupBrowserEventListeners();
    this._syncActiveTestTimer();
  }

  startActiveTestTimer(attemptId) {
    this.testStartedAt = Date.now();
    if (attemptId) this.attemptId = attemptId;
    this._syncActiveTestTimer();
  }

  _syncActiveTestTimer() {
    if (!this.sessionId || !this.testStartedAt) return;
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const token = this.token || storedUser?.token || localStorage.getItem('token') || sessionStorage.getItem('token');
    fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/start-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ attemptId: this.attemptId, testStartedAt: new Date(this.testStartedAt).toISOString() })
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

  setupBrowserEventListeners() {
    this.cleanupBrowserEventListeners();

    this.tabHiddenTimer = null;
    this.tabHiddenStartTime = null;
    this.windowBlurTimer = null;
    this.windowBlurStartTime = null;
    this.fsExitTimer = null;
    this.fsExitStartTime = null;

    this.handleVisibilityChange = () => {
      if (!this.isMonitoringActive) return;

      if (document.hidden || document.visibilityState === 'hidden') {
        if (!this.tabHiddenTimer) {
          this.tabHiddenStartTime = Date.now();
          this.tabHiddenTimer = setTimeout(() => {
            if (document.hidden || document.visibilityState === 'hidden') {
              const now = Date.now();
              const last = this.lastReportedEventTimes['TAB_SWITCH'] || 0;
              const durationMs = Math.max(2000, now - (this.tabHiddenStartTime || now));
              if (now - last >= (this.config.browserEventCooldownMs || 15000)) {
                this.reportEvent({
                  source: 'LAPTOP',
                  eventType: 'TAB_SWITCH',
                  severity: 'WARNING',
                  durationMs,
                  confidence: 1.0,
                  metadata: {
                    hasFocus: document.hasFocus(),
                    visibilityState: document.visibilityState,
                    isFullscreen: !!document.fullscreenElement,
                    activeElement: document.activeElement?.tagName || 'UNKNOWN',
                    durationMs,
                    trigger: 'confirmed_tab_hidden',
                  },
                });
              }
            }
            this.tabHiddenTimer = null;
            this.tabHiddenStartTime = null;
          }, 2000); // 2.0s confirmation window
        }
      } else {
        // Returned to visible before confirmation duration -> cancel transient flicker
        if (this.tabHiddenTimer) {
          clearTimeout(this.tabHiddenTimer);
          this.tabHiddenTimer = null;
          this.tabHiddenStartTime = null;
        }
      }
    };

    this.handleFullscreenChange = () => {
      if (!this.isMonitoringActive) return;

      const inFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      console.log('[MonitoringEngineClient] Fullscreen event transition:', {
        inFs,
        element: document.fullscreenElement?.tagName || null,
        activeElement: document.activeElement?.tagName || 'UNKNOWN',
        timestamp: new Date().toISOString(),
      });

      if (!inFs) {
        if (!this.fsExitTimer) {
          this.fsExitStartTime = Date.now();
          console.warn('[MonitoringEngineClient] Fullscreen exit detected. Starting 2.0s confirmation window...');
          this.fsExitTimer = setTimeout(() => {
            const stillOutFs = !(
              document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullScreenElement ||
              document.msFullscreenElement
            );
            if (stillOutFs) {
              const now = Date.now();
              const last = this.lastReportedEventTimes['FULLSCREEN_EXIT'] || 0;
              const durationMs = Math.max(2000, now - (this.fsExitStartTime || now));
              if (now - last >= (this.config.browserEventCooldownMs || 15000)) {
                console.warn('[MonitoringEngineClient] Confirmed FULLSCREEN_EXIT after 2.0s. Reporting event...');
                this.reportEvent({
                  source: 'LAPTOP',
                  eventType: 'FULLSCREEN_EXIT',
                  severity: 'HIGH',
                  durationMs,
                  confidence: 1.0,
                  metadata: {
                    hasFocus: document.hasFocus(),
                    visibilityState: document.visibilityState,
                    isFullscreen: false,
                    activeElement: document.activeElement?.tagName || 'UNKNOWN',
                    durationMs,
                    trigger: 'confirmed_fullscreen_exit_2s',
                  },
                });
              }
            } else {
              console.log('[MonitoringEngineClient] Fullscreen restored before timer fired. Violation cancelled.');
            }
            this.fsExitTimer = null;
            this.fsExitStartTime = null;
          }, 2000); // 2.0s confirmation window
        }
      } else {
        // Re-entered fullscreen before confirmation duration -> cancel
        if (this.fsExitTimer) {
          console.log('[MonitoringEngineClient] Re-entered fullscreen before confirmation window elapsed. Violation cancelled.');
          clearTimeout(this.fsExitTimer);
          this.fsExitTimer = null;
          this.fsExitStartTime = null;
        }
      }
    };

    this.handleWindowBlur = () => {
      if (!this.isMonitoringActive) return;

      // If document is already hidden, TAB_SWITCH handles it
      if (document.hidden || document.visibilityState === 'hidden') return;

      if (!this.windowBlurTimer) {
        this.windowBlurStartTime = Date.now();
        this.windowBlurTimer = setTimeout(() => {
          // Verify if window is still not focused and document is not hidden
          if (!document.hasFocus() && !(document.hidden || document.visibilityState === 'hidden')) {
            const now = Date.now();
            const last = this.lastReportedEventTimes['WINDOW_BLUR'] || 0;
            const durationMs = Math.max(2000, now - (this.windowBlurStartTime || now));
            if (now - last >= (this.config.browserEventCooldownMs || 15000)) {
              this.reportEvent({
                source: 'LAPTOP',
                eventType: 'WINDOW_BLUR',
                severity: 'INFO',
                durationMs,
                confidence: 0.9,
                metadata: {
                  hasFocus: document.hasFocus(),
                  visibilityState: document.visibilityState,
                  isFullscreen: !!document.fullscreenElement,
                  activeElement: document.activeElement?.tagName || 'UNKNOWN',
                  durationMs,
                  trigger: 'confirmed_window_blur',
                },
              });
            }
          }
          this.windowBlurTimer = null;
          this.windowBlurStartTime = null;
        }, 2000); // 2.0s confirmation window
      }
    };

    this.handleWindowFocus = () => {
      // Window regained focus -> clear blur timer immediately
      if (this.windowBlurTimer) {
        clearTimeout(this.windowBlurTimer);
        this.windowBlurTimer = null;
        this.windowBlurStartTime = null;
      }
    };

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', this.handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', this.handleFullscreenChange);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
  }

  cleanupBrowserEventListeners() {
    if (this.tabHiddenTimer) {
      clearTimeout(this.tabHiddenTimer);
      this.tabHiddenTimer = null;
    }
    if (this.windowBlurTimer) {
      clearTimeout(this.windowBlurTimer);
      this.windowBlurTimer = null;
    }
    if (this.fsExitTimer) {
      clearTimeout(this.fsExitTimer);
      this.fsExitTimer = null;
    }

    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.handleVisibilityChange = null;
    }
    if (this.handleFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', this.handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', this.handleFullscreenChange);
      this.handleFullscreenChange = null;
    }
    if (this.handleWindowBlur) {
      window.removeEventListener('blur', this.handleWindowBlur);
      this.handleWindowBlur = null;
    }
    if (this.handleWindowFocus) {
      window.removeEventListener('focus', this.handleWindowFocus);
      this.handleWindowFocus = null;
    }
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

  startWebcamRecording(stream) {
    try {
      if (typeof MediaRecorder === 'undefined') return;
      if (!RECORD_MONITORING_VIDEO) return; // video storage disabled
      this.recordedChunks = [];

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

      if (!recordStream) return;

      const mimeTypes = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm',
        'video/mp4',
      ];
      let selectedMime = mimeTypes.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
      const recorder = selectedMime ? new MediaRecorder(recordStream, { mimeType: selectedMime }) : new MediaRecorder(recordStream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      recorder.start(1000); // Record in 1s timeslices
      this.mediaRecorder = recorder;
      console.log('[MonitoringEngine] Started webcam session recording with posture overlays');
    } catch (err) {
      console.warn('[MonitoringEngine] Could not start MediaRecorder:', err.message);
    }
  }

  async stopAndUploadRecording() {
    if (!RECORD_MONITORING_VIDEO) {
      this.recordedChunks = [];
      this.mediaRecorder = null;
      return null;
    }
    if (!this.mediaRecorder) {
      return null;
    }

    const sid = this.sessionId || sessionStorage.getItem('monitoring_session_id') || sessionStorage.getItem('quiz_session_token') || this.attemptId || 'active_session';

    return new Promise((resolve) => {
      try {
        if (this.mediaRecorder.state === 'inactive') {
          // Already stopped, upload what we have if chunks exist
          if (!this.recordedChunks || this.recordedChunks.length === 0) {
            return resolve(null);
          }
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

  startLaptopMonitoring(stream, videoElement, onDetection) {
    this.stopLaptopMonitoring({ stopTracks: false });
    this.laptopStream = stream;
    this.laptopVideo = videoElement;
    this.onLaptopDetection = onDetection;
    this.isMonitoringActive = true;

    // Begin background stream recording for post-test review
    this.startWebcamRecording(stream);

    if (!this.laptopCanvas) {
      this.laptopCanvas = document.createElement('canvas');
      this.laptopCanvas.width = 360;
      this.laptopCanvas.height = 270;
    }

    const intervalMs = Math.floor(1000 / this.laptopFps);
    this.laptopInterval = setInterval(() => this.tickLaptopFrame(), intervalMs);
    console.log(`[MonitoringEngine] Laptop monitoring active (${this.laptopFps} FPS)`);
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

  async finishSession() {
    if (!this.sessionId) return null;
    await this._flushOpenIntervals(Date.now());
    try {
      const response = await fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
      if (!response.ok) console.warn(`Monitoring session finalization notice (${response.status})`);
      return response.json();
    } catch (e) {
      console.warn('[MonitoringEngine] finishSession error:', e.message);
      return null;
    }
  }

  async tickLaptopFrame() {
    if (!this.isMonitoringActive || this.isProcessingLaptop || !this.laptopVideo || this.laptopVideo.readyState < 2) return;

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
    if (!this.isMonitoringActive) return;
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
    if (!this.isMonitoringActive || !eventType) return;

    const now = Date.now();
    const resolvedDurationMs = Math.max(0, Number(durationMs) || 0);
    const resolvedEnd = occurredAt || endedAt || new Date(now).toISOString();
    const resolvedStart = startedAt || metadata.violationStartTime || new Date(new Date(resolvedEnd).getTime() - resolvedDurationMs).toISOString();
    if (!this.lastReportedEventTimes) this.lastReportedEventTimes = {};
    const lastReportTime = this.lastReportedEventTimes[eventType] || 0;
    const isGranularEyeHead = /^GAZE_OFF_SCREEN_(LEFT|RIGHT|UP)$/.test(eventType) || /^HEAD_LOOKING_(LEFT|RIGHT|UP)$/.test(eventType);
    const cooldown = this.config[`${eventType}_cooldown`] || (isGranularEyeHead ? 800 : 12000);
    if (now - lastReportTime < cooldown) {
      return; // Skip duplicate burst
    }
    this.lastReportedEventTimes[eventType] = now;

    const idempotencyKey = this.sessionId
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

  destroy() {
    this.isMonitoringActive = false;
    this.stopLaptopMonitoring({ stopTracks: true });
    this.stopMobileMonitoring({ stopTracks: true });
    this.cleanupBrowserEventListeners();
    if (this.laptopStream) {
      try { this.laptopStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      this.laptopStream = null;
    }
    if (this.mobileStream) {
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
