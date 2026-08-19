/**
 * YOLO Proctoring Service (Frontend)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable camera-monitoring and YOLOv8 inference client.
 * Captures live frames from PC camera or Mobile WebRTC/canvas stream at controlled
 * frame rates (5–8 FPS), submits them for inference asynchronously without blocking the UI,
 * and maintains active monitoring state.
 */

class YOLOClientProctoringService {
  constructor() {
    this.monitors = new Map(); // monitorId -> { intervalId, canvas, video, active }
  }

  /**
   * Start proctoring on a video stream or element.
   *
   * @param {Object} config
   * @param {MediaStream|HTMLVideoElement} config.source - MediaStream or Video element
   * @param {Object} config.socket - Active Socket.IO instance
   * @param {string} config.sessionId - Unique session identifier
   * @param {string|number} config.participantId - Participant ID
   * @param {string} config.moduleType - 'QUIZ' | 'CODING' | 'INTERVIEW'
   * @param {string} config.cameraSource - 'PC_CAMERA' | 'MOBILE_CAMERA'
   * @param {number} [config.fps=5] - Inference frequency in frames per second
   * @param {Function} [config.onDetection] - Callback when detections arrive
   * @param {Function} [config.onStatusChange] - Callback for camera / connection state
   * @returns {string} monitorId
   */
  startMonitoring({
    source,
    socket,
    sessionId,
    participantId,
    moduleType = 'QUIZ',
    cameraSource = 'PC_CAMERA',
    fps = 5,
    quizId = null,
    assessmentId = null,
    interviewId = null,
    onDetection = null,
    onStatusChange = null,
  }) {
    if (!source || !sessionId) {
      console.warn('[YOLOProctoring] Missing source or sessionId');
      return null;
    }

    const monitorId = `${sessionId}_${cameraSource}_${moduleType}`;
    this.stopMonitoring(monitorId);

    // Setup hidden video element if source is MediaStream
    let videoEl;
    if (source instanceof MediaStream) {
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.srcObject = source;
      videoEl.play().catch(() => {});
    } else if (source instanceof HTMLVideoElement) {
      videoEl = source;
    } else {
      console.warn('[YOLOProctoring] Invalid video source provided');
      return null;
    }

    // Setup canvas for resizing and JPEG extraction (320x240 for optimal transmission)
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let isProcessing = false;
    const intervalMs = Math.max(120, Math.floor(1000 / fps));

    const checkFrame = () => {
      if (isProcessing) return; // Skip frame if previous inference still running

      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
        onStatusChange?.({
          status: cameraSource === 'PC_CAMERA' ? 'PC camera unavailable' : 'Mobile camera disconnected',
          active: false,
        });
        return;
      }

      onStatusChange?.({ status: 'Monitoring', active: true });

      try {
        isProcessing = true;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const b64Frame = canvas.toDataURL('image/jpeg', 0.5);

        const payload = {
          frame: b64Frame,
          sessionId,
          participantId,
          moduleType: moduleType.toUpperCase(),
          cameraSource: cameraSource.toUpperCase(),
          quizId,
          assessmentId,
          interviewId,
          timestampMs: Date.now(),
        };

        if (socket && socket.connected) {
          const eventName = moduleType.toUpperCase() === 'INTERVIEW' ? 'interview:yolo_frame' : 'proctor:yolo_frame';
          socket.emit(eventName, payload, (response) => {
            isProcessing = false;
            if (response?.ok && response?.event) {
              onDetection?.({
                event: response.event,
                detections: response.detections || [],
                cameraSource,
                timestamp: new Date().toLocaleTimeString(),
              });
            }
          });

          // Safety timeout to reset isProcessing in case ACK never returns
          setTimeout(() => {
            isProcessing = false;
          }, 2500);
        } else {
          isProcessing = false;
        }
      } catch (err) {
        isProcessing = false;
        console.warn('[YOLOProctoring] Frame capture error:', err.message);
      }
    };

    const intervalId = setInterval(checkFrame, intervalMs);

    this.monitors.set(monitorId, {
      intervalId,
      videoEl,
      canvas,
      active: true,
      cameraSource,
    });

    console.log(`[YOLOProctoring] Monitoring started: ${monitorId} (${fps} FPS)`);
    return monitorId;
  }

  /**
   * Stop active monitoring by monitorId.
   */
  stopMonitoring(monitorId) {
    if (!monitorId) return;
    const monitor = this.monitors.get(monitorId);
    if (monitor) {
      if (monitor.intervalId) clearInterval(monitor.intervalId);
      if (monitor.videoEl && monitor.videoEl.srcObject && !(monitor.videoEl instanceof HTMLVideoElement)) {
        try {
          monitor.videoEl.pause();
          monitor.videoEl.srcObject = null;
        } catch (_) {}
      }
      this.monitors.delete(monitorId);
      console.log(`[YOLOProctoring] Monitoring stopped: ${monitorId}`);
    }
  }

  /**
   * Stop all active monitoring instances.
   */
  stopAll() {
    for (const monitorId of this.monitors.keys()) {
      this.stopMonitoring(monitorId);
    }
  }
}

export const yoloProctoringService = new YOLOClientProctoringService();
export default yoloProctoringService;
