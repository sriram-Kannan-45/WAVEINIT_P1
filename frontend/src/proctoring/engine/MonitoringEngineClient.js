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
    this.lastReportedEventTimes = {};
    this.multiPersonStartTime = null;

    // Laptop Rolling State Machine
    this.currentGaze = 'ON_SCREEN';
    this.gazeStartTime = null;
    this.lastGazeEventTime = 0;
    this.gazeDeviationsWindow = []; // timestamps of sustained deviations

    this.currentHeadPose = 'CENTER';
    this.headPoseStartTime = null;
    this.lastHeadPoseEventTime = 0;
    this.headPoseDeviationsWindow = []; // timestamps of sustained deviations

    this.personCountZeroStartTime = null;
    this.lastPersonCountZeroEventTime = 0;
    this.lastMultiPersonEventTime = 0;

    // Grace model: track whether grace threshold has been exceeded this window
    this.gazeGraceExceeded = false;
    this.headPoseGraceExceeded = false;

    // Mobile Pipeline State
    this.mobileStream = null;
    this.mobileVideo = null;
    this.mobileCanvas = null;
    this.mobileInterval = null;
    this.mobileFps = 3;
    this.isProcessingMobile = false;
    this.mobileCompositionState = 'DISABLED';
    this.mobileUserMessage = '';
    this.lastMobileHeartbeat = Date.now();
    this.pendingMobileFrame = null; // Latest-frame-only buffer for latency optimization

    // Callbacks
    this.onStatusUpdate = null;
    this.onLaptopDetection = null;
    this.onMobileDetection = null;
    this.onEventReported = null;

    // Browser event listener references
    this.handleVisibilityChange = null;
    this.handleFullscreenChange = null;
    this.handleWindowBlur = null;

    // Config thresholds (Robust real-world values preventing false positives)
    this.config = {
      gazeDurationThresholdMs: 3500, // Require 3.5s continuous lookaway before counting
      headPoseDurationThresholdMs: 3500, // Require 3.5s continuous head turn before counting
      faceAbsentGraceMs: 4000, // Require 4s continuous absence before alert
      multiPersonDurationThresholdMs: 3500, // Require 3.5s continuous multi-face before alert
      gazeCooldownMs: 15000, // 15s cooldown between consecutive gaze alerts
      headPoseCooldownMs: 15000, // 15s cooldown between consecutive head pose alerts
      faceAbsentCooldownMs: 15000, // 15s cooldown between face absent alerts
      multiPersonCooldownMs: 20000, // 20s cooldown between multi-person alerts
      browserEventCooldownMs: 15000, // 15s cooldown for browser events (Addendum #7)
      // Grace model config (Bug 18 / Addendum #8)
      gazeGraceCount: 5, // Allow 5 sustained deviations before flagging
      gazeGraceWindowMs: 300000, // 5-minute rolling window
      headPoseGraceCount: 5, // Allow 5 sustained deviations before flagging
      headPoseGraceWindowMs: 300000, // 5-minute rolling window
    };
  }

  init({ sessionId, attemptId = null, participantId, contextType = 'QUIZ', token, socket, config = {} }) {
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

      if (!inFs) {
        if (!this.fsExitTimer) {
          this.fsExitStartTime = Date.now();
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
              const durationMs = Math.max(1500, now - (this.fsExitStartTime || now));
              if (now - last >= (this.config.browserEventCooldownMs || 15000)) {
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
                    trigger: 'confirmed_fullscreen_exit',
                  },
                });
              }
            }
            this.fsExitTimer = null;
            this.fsExitStartTime = null;
          }, 1500); // 1.5s confirmation window
        }
      } else {
        // Re-entered fullscreen before confirmation duration -> cancel
        if (this.fsExitTimer) {
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

  startLaptopMonitoring(stream, videoElement, onDetection) {
    this.stopLaptopMonitoring();
    this.laptopStream = stream;
    this.laptopVideo = videoElement;
    this.onLaptopDetection = onDetection;
    this.isMonitoringActive = true;

    if (!this.laptopCanvas) {
      this.laptopCanvas = document.createElement('canvas');
      this.laptopCanvas.width = 360;
      this.laptopCanvas.height = 270;
    }

    const intervalMs = Math.floor(1000 / this.laptopFps);
    this.laptopInterval = setInterval(() => this.tickLaptopFrame(), intervalMs);
    console.log(`[MonitoringEngine] Laptop monitoring active (${this.laptopFps} FPS)`);
  }

  stopLaptopMonitoring() {
    if (this.laptopInterval) {
      clearInterval(this.laptopInterval);
      this.laptopInterval = null;
    }
  }

  analyzeCanvasMetrics(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const w = width;
    const h = height;

    let headSkinPixels = 0;
    let totalSkinPixels = 0;
    let skinCentroidX = 0;
    let skinCentroidY = 0;

    const step = 4;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // YCbCr Skin Tone Segmentation
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkin =
          r > 45 &&
          g > 30 &&
          b > 25 &&
          r > g &&
          r > b &&
          Math.abs(r - g) > 15 &&
          cb >= 80 &&
          cb <= 130 &&
          cr >= 135 &&
          cr <= 175;

        if (isSkin) {
          totalSkinPixels++;
          skinCentroidX += x;
          skinCentroidY += y;

          // Head zone (central 60% of frame)
          if (x >= w * 0.20 && x <= w * 0.80 && y >= h * 0.08 && y <= h * 0.85) {
            headSkinPixels++;
          }
        }
      }
    }

    const faceDetected = headSkinPixels >= 40 || totalSkinPixels >= 70;
    // Client-side heuristic detects 1 candidate face; multi-person detection is handled strictly via AI model
    const faceCount = faceDetected ? 1 : 0;

    let gazeClassification = 'ON_SCREEN';
    let gazeConfidence = 0.9;
    let headPose = { yaw: 0, pitch: 0, roll: 0 };

    if (faceDetected && totalSkinPixels > 0) {
      const avgX = (skinCentroidX / totalSkinPixels) / w;
      const avgY = (skinCentroidY / totalSkinPixels) / h;

      const yaw = Math.round((avgX - 0.5) * 80);
      const pitch = Math.round((avgY - 0.45) * 70);
      headPose = { yaw, pitch, roll: 0 };

      // Conservative thresholds to prevent false positives when reading wide questions
      if (avgX < 0.20) {
        gazeClassification = 'OFF_SCREEN_LEFT';
      } else if (avgX > 0.80) {
        gazeClassification = 'OFF_SCREEN_RIGHT';
      } else if (avgY > 0.82) {
        gazeClassification = 'OFF_SCREEN_DOWN';
      } else if (avgY < 0.15) {
        gazeClassification = 'OFF_SCREEN_UP';
      }
    }

    return {
      face_detected: faceDetected,
      face_count: faceCount,
      gaze_classification: gazeClassification,
      gaze_confidence: gazeConfidence,
      head_pose: headPose,
    };
  }

  async tickLaptopFrame() {
    if (!this.isMonitoringActive || this.isProcessingLaptop || !this.laptopVideo || this.laptopVideo.readyState < 2) return;

    this.isProcessingLaptop = true;
    try {
      const ctx = this.laptopCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.laptopVideo, 0, 0, this.laptopCanvas.width, this.laptopCanvas.height);

      // 1. Instant local Computer Vision analysis (guaranteed real-time detection without network dependency)
      const localMetrics = this.analyzeCanvasMetrics(ctx, this.laptopCanvas.width, this.laptopCanvas.height);
      this.processLaptopMetrics(localMetrics);

      // 2. Asynchronous backend AI validation (optimized 0.4 quality for fast transport)
      const b64Frame = this.laptopCanvas.toDataURL('image/jpeg', 0.4);
      fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/laptop/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          frame: b64Frame,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data?.data) {
            this.processLaptopMetrics(data.data);
          }
        })
        .catch(() => {});
    } catch (err) {
      // Non-blocking frame tick error
    } finally {
      this.isProcessingLaptop = false;
    }
  }

  processLaptopMetrics(metrics) {
    if (!this.isMonitoringActive) return;
    const now = Date.now();
    const {
      face_detected = false,
      face_count = 0,
      gaze_classification = 'ON_SCREEN',
      gaze_confidence = 1.0,
      head_pose = { yaw: 0, pitch: 0, roll: 0 },
    } = metrics;

    this.onLaptopDetection?.({
      faceDetected: face_detected,
      faceCount: face_count,
      gaze: gaze_classification,
      gazeConfidence: gaze_confidence,
      headPose: head_pose,
    });

    // ── 1. Person Count State Machine ───────────────────────────────────────
    if (!face_detected || face_count === 0) {
      if (!this.personCountZeroStartTime) {
        this.personCountZeroStartTime = now;
      } else if (now - this.personCountZeroStartTime >= this.config.faceAbsentGraceMs) {
        if (now - this.lastPersonCountZeroEventTime >= this.config.faceAbsentCooldownMs) {
          this.reportEvent({
            source: 'LAPTOP',
            eventType: 'FACE_ABSENT',
            severity: 'WARNING',
            durationMs: now - this.personCountZeroStartTime,
            confidence: 0.9,
            metadata: { detail: 'Candidate face absent from camera view' },
          });
          this.lastPersonCountZeroEventTime = now;
        }
      }
    } else {
      this.personCountZeroStartTime = null;
    }

    // Multi-Person: Requires sustained presence across consecutive frames (min 3.5s) and cooldown
    if (face_count > 1) {
      if (!this.multiPersonStartTime) {
        this.multiPersonStartTime = now;
      } else if (now - this.multiPersonStartTime >= (this.config.multiPersonDurationThresholdMs || 3500)) {
        if (now - this.lastMultiPersonEventTime >= (this.config.multiPersonCooldownMs || 20000)) {
          this.reportEvent({
            source: 'LAPTOP',
            eventType: 'MULTIPLE_FACES',
            severity: 'HIGH',
            durationMs: now - this.multiPersonStartTime,
            confidence: 0.92,
            metadata: { face_count, detail: 'Multiple persons detected in camera view' },
          });
          this.lastMultiPersonEventTime = now;
        }
      }
    } else {
      this.multiPersonStartTime = null;
    }

    // ── 2. Eye Gaze Rolling State Machine with Grace Model ────────────────
    if (gaze_classification !== 'ON_SCREEN' && gaze_confidence > 0.70) {
      if (this.currentGaze === gaze_classification) {
        const duration = now - this.gazeStartTime;
        if (duration >= this.config.gazeDurationThresholdMs) {
          if (now - this.lastGazeEventTime >= this.config.gazeCooldownMs) {
            this.lastGazeEventTime = now;

            // Record this sustained deviation in the rolling window
            const windowMs = this.config.gazeGraceWindowMs || 300000;
            this.gazeDeviationsWindow.push(now);
            this.gazeDeviationsWindow = this.gazeDeviationsWindow.filter(t => now - t <= windowMs);

            const graceCount = this.config.gazeGraceCount || 5;
            const count = this.gazeDeviationsWindow.length;

            if (count > graceCount) {
              // Grace exceeded — log ONE escalation event summarizing the pattern
              this.reportEvent({
                source: 'LAPTOP',
                eventType: 'REPEATED_GAZE_DEVIATION',
                severity: 'WARNING',
                durationMs: windowMs,
                confidence: gaze_confidence,
                metadata: {
                  gaze_classification,
                  deviationsInWindow: count,
                  graceCount,
                  windowMinutes: Math.round(windowMs / 60000),
                  detail: `Repeated gaze deviation: ${count} occurrences in ${Math.round(windowMs / 60000)} minutes (grace: ${graceCount})`,
                },
              });
              // Reset window after escalation
              this.gazeDeviationsWindow = [];
              this.gazeGraceExceeded = false;
            }
            // Within grace count: NO event logged, no score impact
          }
          // Reset start so the same continuous deviation isn't re-counted
          this.gazeStartTime = now;
        }
      } else {
        this.currentGaze = gaze_classification;
        this.gazeStartTime = now;
      }
    } else {
      this.currentGaze = 'ON_SCREEN';
      this.gazeStartTime = null;
    }

    // ── 3. Head Pose Rolling State Machine with Grace Model ──────────────
    let activeHeadPose = 'CENTER';
    if (Math.abs(head_pose?.yaw || 0) > 35.0) {
      activeHeadPose = 'HEAD_LOOKING_SIDEWAYS';
    } else if ((head_pose?.pitch || 0) > 30.0) {
      activeHeadPose = 'HEAD_LOOKING_DOWN';
    }

    if (activeHeadPose !== 'CENTER') {
      if (this.currentHeadPose === activeHeadPose) {
        const duration = now - this.headPoseStartTime;
        if (duration >= this.config.headPoseDurationThresholdMs) {
          if (now - this.lastHeadPoseEventTime >= this.config.headPoseCooldownMs) {
            this.lastHeadPoseEventTime = now;

            // Record this sustained deviation in the rolling window
            const windowMs = this.config.headPoseGraceWindowMs || 300000;
            this.headPoseDeviationsWindow.push(now);
            this.headPoseDeviationsWindow = this.headPoseDeviationsWindow.filter(t => now - t <= windowMs);

            const graceCount = this.config.headPoseGraceCount || 5;
            const count = this.headPoseDeviationsWindow.length;

            if (count > graceCount) {
              // Grace exceeded — log ONE escalation event
              this.reportEvent({
                source: 'LAPTOP',
                eventType: 'REPEATED_HEAD_POSE_DEVIATION',
                severity: 'WARNING',
                durationMs: windowMs,
                confidence: 0.85,
                metadata: {
                  head_pose,
                  activeHeadPose,
                  deviationsInWindow: count,
                  graceCount,
                  windowMinutes: Math.round(windowMs / 60000),
                  detail: `Repeated head pose deviation: ${count} occurrences in ${Math.round(windowMs / 60000)} minutes (grace: ${graceCount})`,
                },
              });
              // Reset window after escalation
              this.headPoseDeviationsWindow = [];
              this.headPoseGraceExceeded = false;
            }
            // Within grace count: NO event logged, no score impact
          }
          // Reset start so the same continuous deviation isn't re-counted
          this.headPoseStartTime = now;
        }
      } else {
        this.currentHeadPose = activeHeadPose;
        this.headPoseStartTime = now;
      }
    } else {
      this.currentHeadPose = 'CENTER';
      this.headPoseStartTime = null;
    }
  }

  // ── Mobile Camera Pipeline ────────────────────────────────────────────────

  startMobileMonitoring(stream, videoElement, onDetection) {
    this.stopMobileMonitoring();
    this.mobileStream = stream;
    this.mobileVideo = videoElement;
    this.onMobileDetection = onDetection;
    this.isMonitoringActive = true;

    if (!this.mobileCanvas) {
      this.mobileCanvas = document.createElement('canvas');
      this.mobileCanvas.width = 320;
      this.mobileCanvas.height = 240;
    }

    const intervalMs = Math.floor(1000 / this.mobileFps);
    this.mobileInterval = setInterval(() => this.tickMobileFrame(), intervalMs);
    console.log(`[MonitoringEngine] Mobile monitoring active (${this.mobileFps} FPS)`);
  }

  stopMobileMonitoring() {
    if (this.mobileInterval) {
      clearInterval(this.mobileInterval);
      this.mobileInterval = null;
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

  async reportEvent({ source = 'LAPTOP', eventType, severity = 'INFO', durationMs = 0, confidence = 1.0, metadata = {} }) {
    if (!this.isMonitoringActive || !this.sessionId || !eventType) return;

    const now = Date.now();
    const lastReportTime = this.lastReportedEventTimes[eventType] || 0;
    const cooldown = this.config[`${eventType}_cooldown`] || 12000;
    if (now - lastReportTime < cooldown) {
      return; // Skip duplicate burst
    }
    this.lastReportedEventTimes[eventType] = now;

    const idempotencyKey = `${this.sessionId}_${source}_${eventType}_${Math.floor(now / 15000)}`;

    try {
      const res = await fetch(`${API_BASE}/monitoring/sessions/${this.sessionId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          participantId: this.participantId,
          source,
          eventType,
          severity,
          durationMs,
          confidence,
          metadata,
          idempotencyKey,
        }),
      });

      // Also post to legacy proctoring events endpoint if attemptId exists
      if (this.attemptId || this.sessionId) {
        fetch(`${API_BASE}/proctoring/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          body: JSON.stringify({
            monitoringSessionId: this.sessionId,
            attemptId: this.attemptId,
            participantId: this.participantId,
            eventType,
            severity,
            confidence,
            duration: Math.round(Number(durationMs) / 100) / 10,
            timestamp: new Date(),
            metadata,
            idempotencyKey,
          }),
        }).catch(() => {});
      }

      const data = await res.json();
      if (data?.success && data?.data) {
        this.onEventReported?.(data.data);
      }
      return data;
    } catch (err) {
      console.warn('[MonitoringEngine] Failed to submit proctoring event:', err);
    }
  }

  destroy() {
    this.isMonitoringActive = false;
    this.stopLaptopMonitoring();
    this.stopMobileMonitoring();
    this.cleanupBrowserEventListeners();
    if (this.socket) {
      this.socket.off('monitoring:mobile_composition');
      this.socket.off('monitoring:event');
    }
  }
}

export default new MonitoringEngineClient();
