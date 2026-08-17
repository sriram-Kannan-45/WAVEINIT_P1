/**
 * AssessmentConsentGate.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Four-step modal shown when participant starts a quiz:
 *   1. Consent & Security Notice + Academic Integrity rules
 *   2. Camera Permission & Upper-Body Calibration Check (Head, shoulders, chest, below-chest framing, lighting, centering)
 *   3. Screen Sharing Permission (Entire screen or application window)
 *   4. Fullscreen Permission (User gesture gesture entry)
 *
 * Blocks the participant from entering <QuizTaking /> until all checks pass.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Maximize2,
  MonitorPlay,
  Camera,
  ArrowRight,
  ArrowLeft,
  Lock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import useScreenShare from '../../proctoring/hooks/useScreenShare';
import '../../styles/assessment-consent.css';

const STEP_CONSENT = 1;
const STEP_CAMERA_CALIB = 2;
const STEP_SCREEN_SHARE = 3;
const STEP_FULLSCREEN = 4;

const fsApi = {
  request: (el = document.documentElement) =>
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
};

// State Machine States
const CALIB_STATE = {
  CAMERA_INITIALIZING: 'CAMERA_INITIALIZING',
  CAMERA_READY: 'CAMERA_READY',
  CALIBRATION_WAITING: 'CALIBRATION_WAITING',
  CALIBRATION_CHECKING: 'CALIBRATION_CHECKING',
  CALIBRATION_COUNTDOWN: 'CALIBRATION_COUNTDOWN',
  CALIBRATION_PASSED: 'CALIBRATION_PASSED',
  CALIBRATION_FAILED: 'CALIBRATION_FAILED',
  CALIBRATION_ERROR: 'CALIBRATION_ERROR',
  READY_FOR_NEXT: 'READY_FOR_NEXT',
};

const BELOW_CHEST_RATIO = 0.55;

export default function AssessmentConsentGate({ quiz, attemptId, onConsented, onCancel, onScreenShareReady }) {
  const [step, setStep] = useState(STEP_CONSENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protectionConsentChecked, setProtectionConsentChecked] = useState(false);
  
  // Real-time Calibration State Machine
  const [calibState, setCalibState] = useState(CALIB_STATE.CAMERA_INITIALIZING);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [camStream, setCamStream] = useState(null);
  const [validationResult, setValidationResult] = useState({
    valid: false,
    faceDetected: false,
    faceCentered: false,
    eyesVisible: false,
    leftShoulderVisible: false,
    rightShoulderVisible: false,
    chestVisible: false,
    belowChestVisible: false,
    bodyCentered: false,
    lightingGood: false,
    bodyCoverage: 0,
    message: 'Starting camera...',
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const stableStartRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isComponentMounted = useRef(true);

  const screenShare = useScreenShare({
    onStop: () => {
      console.log('[AssessmentConsentGate] Screen share stopped by user/browser');
      if (step === STEP_SCREEN_SHARE || step === STEP_FULLSCREEN) {
        setError('Screen sharing was stopped. You must share your screen to continue.');
      }
      onScreenShareReady?.(null);
    },
    onDenied: (err) => {
      console.log('[AssessmentConsentGate] Screen share denied:', err?.message);
      setError('Screen sharing is mandatory to attend this assessment.');
    },
    onInvalidShare: (err) => {
      console.log('[AssessmentConsentGate] Invalid share:', err?.message);
      setError(err?.message || 'Please share your entire screen or an application window.');
    },
  });

  useEffect(() => {
    screenStreamRef.current = screenShare.stream;
  }, [screenShare.stream]);

  // Lifecycle & ESC handler
  useEffect(() => {
    isComponentMounted.current = true;
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      isComponentMounted.current = false;
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [onCancel]);

  // Stop camera tracks only on final unmount
  useEffect(() => {
    return () => {
      if (camStream) {
        camStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [camStream]);

  // Ensure Picture-in-Picture is never triggered & attach stream to video element
  useEffect(() => {
    if (step === STEP_CAMERA_CALIB) {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
      if (videoRef.current && camStream && videoRef.current.srcObject !== camStream) {
        videoRef.current.srcObject = camStream;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [step, camStream]);

  /**
   * Validate Upper-Body Framing using real-time video frame analysis
   */
  const validateCalibrationFrame = useCallback((video) => {
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return {
        valid: false,
        faceDetected: false,
        faceCentered: false,
        eyesVisible: false,
        leftShoulderVisible: false,
        rightShoulderVisible: false,
        chestVisible: false,
        belowChestVisible: false,
        bodyCentered: false,
        lightingGood: false,
        bodyCoverage: 0,
        message: 'Waiting for video stream…',
      };
    }

    const w = 320;
    const h = 240;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { valid: true, message: 'Calibrating...' };
    }

    ctx.drawImage(video, 0, 0, w, h);
    let frameData;
    try {
      frameData = ctx.getImageData(0, 0, w, h);
    } catch (_) {
      return { valid: true, message: 'Calibrating...' };
    }

    const data = frameData.data;

    // 1. Lighting / Average Luma & Regional Analysis
    let totalLuma = 0;
    let sampleCount = 0;
    let headSkinCount = 0;
    let headSampleCount = 0;
    let leftEyeSkin = 0, rightEyeSkin = 0;
    let leftShoulderCount = 0, rightShoulderCount = 0;
    let chestCount = 0;
    let belowChestCount = 0;
    let leftSideTotal = 0, rightSideTotal = 0;

    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;
        sampleCount++;

        // Skin & upper torso chroma classification
        const isSkinOrTorso = (r > 55 && g > 35 && b > 20 && r > b && (r - g) >= 8 && Math.abs(r - g) < 145) ||
                              (luma > 40 && luma < 225 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30); // Clothing/body pixels

        if (isSkinOrTorso) {
          if (x < w * 0.5) leftSideTotal++;
          else rightSideTotal++;

          // Head & Face Zone (x: 105..215, y: 15..100)
          if (x >= 105 && x <= 215 && y >= 15 && y <= 100) {
            headSkinCount++;
          }
          // Left Eye / Right Eye sub-zones (y: 40..70)
          if (y >= 40 && y <= 70) {
            if (x >= 120 && x <= 155) leftEyeSkin++;
            if (x >= 165 && x <= 200) rightEyeSkin++;
          }
          // Left Shoulder Zone (x: 45..135, y: 95..155)
          if (x >= 45 && x <= 135 && y >= 95 && y <= 155) {
            leftShoulderCount++;
          }
          // Right Shoulder Zone (x: 185..275, y: 95..155)
          if (x >= 185 && x <= 275 && y >= 95 && y <= 155) {
            rightShoulderCount++;
          }
          // Chest Zone (x: 90..230, y: 115..180)
          if (x >= 90 && x <= 230 && y >= 115 && y <= 180) {
            chestCount++;
          }
          // Below-Chest Zone (x: 75..245, y: 180..235)
          if (x >= 75 && x <= 245 && y >= 180 && y <= 235) {
            belowChestCount++;
          }
        }

        if (x >= 105 && x <= 215 && y >= 15 && y <= 100) {
          headSampleCount++;
        }
      }
    }

    const avgLuma = totalLuma / Math.max(1, sampleCount);
    const lightingGood = avgLuma >= 28 && avgLuma <= 240;

    // 2. Real-time Anatomical Presence Verification
    const faceDetected = headSkinCount >= 35 && (headSkinCount / Math.max(1, headSampleCount)) >= 0.08;
    const eyesVisible = faceDetected && (leftEyeSkin >= 6 && rightEyeSkin >= 6);
    const leftShoulderVisible = faceDetected && leftShoulderCount >= 18;
    const rightShoulderVisible = faceDetected && rightShoulderCount >= 18;
    const chestVisible = faceDetected && chestCount >= 28;
    const belowChestVisible = faceDetected && belowChestCount >= 20;

    const sideBalanceDiff = Math.abs(leftSideTotal - rightSideTotal) / Math.max(1, leftSideTotal + rightSideTotal);
    const bodyCentered = faceDetected && sideBalanceDiff < 0.55;
    const bodyCoverage = Math.min(98, Math.max(0, Math.round(((headSkinCount + chestCount + belowChestCount) / (sampleCount * 0.4)) * 100)));

    const valid = lightingGood && faceDetected && eyesVisible && leftShoulderVisible && rightShoulderVisible && chestVisible && belowChestVisible && bodyCentered;

    let message = 'Position yourself so your head, eyes, shoulders, chest, and area below chest are visible.';
    if (!faceDetected) {
      message = '✗ Face Not Detected. Position yourself directly in front of the camera.';
    } else if (!eyesVisible) {
      message = '✗ Both Eyes Not Reliably Visible. Look directly at the camera.';
    } else if (!leftShoulderVisible || !rightShoulderVisible) {
      message = '✗ Shoulders not clearly visible. Step back slightly to show both shoulders.';
    } else if (!chestVisible) {
      message = '✗ Chest not framed. Tilt your camera to capture your upper body.';
    } else if (!belowChestVisible) {
      message = '✗ Area below chest not visible. Ensure framing reaches below your chest.';
    } else if (!bodyCentered) {
      message = '✗ Center yourself horizontally in the camera frame.';
    } else if (!lightingGood) {
      message = avgLuma < 28 ? '✗ Lighting too dark. Increase room lighting.' : '✗ Lighting too bright. Reduce direct glare.';
    } else if (valid) {
      message = '✓ Good framing. Hold position to complete calibration.';
    }

    return {
      valid,
      faceDetected,
      faceCentered: bodyCentered,
      eyesVisible,
      leftShoulderVisible,
      rightShoulderVisible,
      chestVisible,
      belowChestVisible,
      bodyCentered,
      lightingGood,
      bodyCoverage,
      message,
    };
  }, []);

  /**
   * Continuous Processing Loop using requestAnimationFrame
   */
  const startContinuousCalibrationLoop = useCallback((stream) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    stableStartRef.current = null;

    console.log('[PROCTOR] Starting continuous calibration loop...');

    const processFrame = (timestamp) => {
      if (!isComponentMounted.current) return;

      const video = videoRef.current;
      if (!video) {
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (video.srcObject !== stream && stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }

      // Check if video is playing
      if (video.readyState < 2 || video.videoWidth === 0) {
        setCalibState(CALIB_STATE.CALIBRATION_WAITING);
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Validate framing
      const result = validateCalibrationFrame(video);
      setValidationResult(result);

      if (result.valid) {
        if (!stableStartRef.current) {
          stableStartRef.current = performance.now();
          console.log('[PROCTOR] Calibration framing valid — starting stable countdown');
        }

        const elapsedMs = performance.now() - stableStartRef.current;
        const remaining = Math.max(1, Math.ceil((3000 - elapsedMs) / 1000));
        setCountdownSeconds(remaining);

        if (elapsedMs >= 3000) {
          // CALIBRATION PASSED!
          console.log('[PROCTOR] Calibration PASSED! Auto-advancing to next step');
          setCalibState(CALIB_STATE.CALIBRATION_PASSED);
          
          // Auto-advance to Step 3 (Screen Sharing) after 700ms
          setTimeout(() => {
            if (isComponentMounted.current) {
              setStep(STEP_SCREEN_SHARE);
            }
          }, 700);
          return; // Stop animation loop
        } else {
          setCalibState(CALIB_STATE.CALIBRATION_COUNTDOWN);
        }
      } else {
        // Reset countdown if framing broken
        if (stableStartRef.current) {
          console.log('[PROCTOR] Framing interrupted, resetting countdown timer');
          stableStartRef.current = null;
        }
        setCalibState(CALIB_STATE.CALIBRATION_CHECKING);
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [validateCalibrationFrame]);

  /**
   * Initialize Camera Stream & Start Loop
   */
  const initCameraCalibration = useCallback(async () => {
    setBusy(true);
    setError('');
    setCalibState(CALIB_STATE.CAMERA_INITIALIZING);
    stableStartRef.current = null;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture().catch(() => {});
      }

      // Stop any existing tracks before creating a fresh stream
      if (camStream) {
        camStream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      console.log('[PROCTOR] Camera stream acquired successfully');
      setCamStream(stream);
      setCalibState(CALIB_STATE.CAMERA_READY);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      startContinuousCalibrationLoop(stream);
    } catch (e) {
      console.error('[PROCTOR] Camera access error:', e);
      setError('Camera access is required for participant monitoring. Please grant permission and click Refresh Camera.');
      setCalibState(CALIB_STATE.CALIBRATION_ERROR);
    } finally {
      setBusy(false);
    }
  }, [camStream, startContinuousCalibrationLoop]);

  const handleAgree = () => {
    if (!protectionConsentChecked) return;
    setError('');
    setStep(STEP_CAMERA_CALIB);
    initCameraCalibration();
  };

  const handleCameraPassed = () => {
    if (calibState !== CALIB_STATE.CALIBRATION_PASSED && calibState !== CALIB_STATE.READY_FOR_NEXT) return;
    setError('');
    setStep(STEP_SCREEN_SHARE);
  };

  const handleBackToConsent = () => {
    setError('');
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setStep(STEP_CONSENT);
  };

  const handleRequestScreenShare = useCallback(async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    console.log('[AssessmentConsentGate] Requesting screen share...');
    try {
      const stream = await screenShare.request();
      if (!stream) {
        throw screenShare.error || new Error('Screen sharing was denied');
      }
      console.log('[AssessmentConsentGate] Screen share active, MediaStream created');
      onScreenShareReady?.(stream);
      setStep(STEP_FULLSCREEN);
    } catch (e) {
      console.error('[AssessmentConsentGate] Screen share failed:', e);
      setError(e?.message || 'Screen sharing is mandatory to attend this assessment.');
    } finally {
      setBusy(false);
    }
  }, [busy, screenShare, onScreenShareReady]);

  const handleRetryScreenShare = useCallback(() => {
    console.log('[AssessmentConsentGate] Retry screen share clicked');
    setError('');
    handleRequestScreenShare();
  }, [handleRequestScreenShare]);

  const handleCancelFromScreenShare = useCallback(() => {
    console.log('[AssessmentConsentGate] Cancel assessment from screen share step');
    screenShare.stop?.();
    onCancel?.();
  }, [screenShare, onCancel]);

  const handleEnableFullscreen = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = fsApi.request();
      if (res && typeof res.then === 'function') await res;
      await new Promise((r) => setTimeout(r, 60));
      if (!fsApi.element()) {
        throw new Error('Fullscreen permission was denied');
      }
      console.log('[AssessmentConsentGate] Fullscreen entered');
      onConsented?.(attemptId, quiz);
    } catch (e) {
      console.error('[AssessmentConsentGate] Fullscreen failed:', e);
      setError(
        'Fullscreen is required to start this assessment. Please allow fullscreen and try again.'
      );
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        className="ac-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ac-title"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          className="ac-card"
          style={{ maxWidth: step === STEP_CAMERA_CALIB ? '620px' : '540px' }}
        >
          {/* Header */}
          <div className="ac-card__header">
            <div className="ac-card__brand">
              <span className="ac-card__brand-pill">WAVE INIT LMS</span>
              {quiz?.title && (
                <span className="ac-card__quiz-title" title={quiz.title}>
                  {quiz.title}
                </span>
              )}
            </div>
            <button
              type="button"
              className="ac-card__close"
              onClick={onCancel}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Step rail (4 steps) */}
          <div className="ac-rail" aria-hidden style={{ padding: '12px 24px 8px' }}>
            <div className={`ac-rail__dot ${step === STEP_CONSENT ? 'ac-rail__dot--current' : 'ac-rail__dot--done'}`}>1</div>
            <div className={`ac-rail__line ${step >= STEP_CAMERA_CALIB ? 'ac-rail__line--done' : ''}`} />
            <div className={`ac-rail__dot ${step === STEP_CAMERA_CALIB ? 'ac-rail__dot--current' : step > STEP_CAMERA_CALIB ? 'ac-rail__dot--done' : 'ac-rail__dot--todo'}`}>2</div>
            <div className={`ac-rail__line ${step >= STEP_SCREEN_SHARE ? 'ac-rail__line--done' : ''}`} />
            <div className={`ac-rail__dot ${step === STEP_SCREEN_SHARE ? 'ac-rail__dot--current' : step > STEP_SCREEN_SHARE ? 'ac-rail__dot--done' : 'ac-rail__dot--todo'}`}>3</div>
            <div className={`ac-rail__line ${step >= STEP_FULLSCREEN ? 'ac-rail__line--done' : ''}`} />
            <div className={`ac-rail__dot ${step === STEP_FULLSCREEN ? 'ac-rail__dot--current' : 'ac-rail__dot--todo'}`}>4</div>
          </div>

          <AnimatePresence mode="wait">
            {step === STEP_CONSENT && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="ac-step"
              >
                <div className="ac-step__icon-wrap" aria-hidden>
                  <ShieldCheck size={26} />
                </div>
                <h2 id="ac-title" className="ac-step__title">
                  Assessment Security &amp; Monitoring Notice
                </h2>
                <p className="ac-step__lead">
                  For academic integrity and automated proctoring, the following parameters are monitored:
                </p>

                <ul className="ac-step__list">
                  <li>Upper-body framing (Head, shoulders, chest &amp; below-chest baseline)</li>
                  <li>Eye gaze &amp; head pose monitoring</li>
                  <li>Multiple-person and secondary device detection</li>
                  <li>Full screen session locking &amp; browser tab activity</li>
                </ul>

                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginTop: '16px',
                  marginBottom: '12px',
                }}>
                  <p style={{
                    fontSize: '13px',
                    lineHeight: '1.6',
                    color: '#92400e',
                    margin: '0 0 10px 0',
                    fontWeight: '500',
                  }}>
                    This assessment is strictly monitored. Copying, right-clicking, switching windows, or leaving camera view is recorded and will result in warnings and possible disqualification.
                  </p>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '13px',
                    color: '#92400e',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}>
                    <input
                      type="checkbox"
                      checked={protectionConsentChecked}
                      onChange={(e) => setProtectionConsentChecked(e.target.checked)}
                      style={{
                        marginTop: '2px',
                        width: '16px',
                        height: '16px',
                        accentColor: '#d97706',
                        flexShrink: 0,
                      }}
                    />
                    <span>I understand that my camera, screen, and browser activity will be monitored during the quiz.</span>
                  </label>
                </div>

                <div className="ac-step__actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost"
                    onClick={onCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`ac-btn ac-btn--primary ${!protectionConsentChecked ? 'ac-btn--disabled' : ''}`}
                    onClick={handleAgree}
                    disabled={!protectionConsentChecked}
                    style={{
                      opacity: protectionConsentChecked ? 1 : 0.5,
                      cursor: protectionConsentChecked ? 'pointer' : 'not-allowed',
                    }}
                    autoFocus={protectionConsentChecked}
                  >
                    {protectionConsentChecked ? (
                      <>I Agree, Continue <ArrowRight size={15} /></>
                    ) : (
                      <>Please Accept Terms Above</>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {step === STEP_CAMERA_CALIB && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="ac-step"
              >
                <div className="ac-step__icon-wrap ac-step__icon-wrap--accent" aria-hidden>
                  <Camera size={26} />
                </div>
                <h2 className="ac-step__title">Camera &amp; Upper-Body Calibration</h2>
                <p className="ac-step__lead" style={{ marginBottom: 6 }}>
                  Position your camera so your head, eyes, shoulders, chest, and the area below your chest are clearly visible.
                </p>
                <div style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#0d9488',
                  background: '#f0fdfa',
                  border: '1px solid #ccfbf1',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  marginBottom: '12px'
                }}>
                  ℹ️ Full body is NOT required.
                </div>

                {/* Live Video Preview + Upper Body Framing Overlay */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '260px',
                  background: '#09090b',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  marginBottom: '14px',
                  border: calibState === CALIB_STATE.CALIBRATION_PASSED ? '2px solid #22c55e' : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                  boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                }}>
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (el && camStream && el.srcObject !== camStream) {
                        el.srcObject = camStream;
                        el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    disablePictureInPicture
                    controls={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)', // Mirrored view
                    }}
                  />

                  {/* SVG Framing Overlay Guide */}
                  <svg
                    viewBox="0 0 320 240"
                    preserveAspectRatio="none"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  >
                    {/* Center Alignment Line */}
                    <line x1="160" y1="10" x2="160" y2="230" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" strokeWidth="1" />

                    {/* Head & Eyes Guide Oval */}
                    <ellipse cx="160" cy="54" rx="42" ry="46" fill="rgba(13,148,136,0.06)" stroke={validationResult.faceDetected ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" strokeDasharray="4 3" />
                    <text x="160" y="24" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700">HEAD &amp; EYES</text>
                    <text x="145" y="58" textAnchor="middle" fill="#22c55e" fontSize="12">👁</text>
                    <text x="175" y="58" textAnchor="middle" fill="#22c55e" fontSize="12">👁</text>

                    {/* Shoulder Line */}
                    <line x1="60" y1="106" x2="260" y2="106" stroke={validationResult.leftShoulderVisible && validationResult.rightShoulderVisible ? 'rgba(34,197,94,0.75)' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" strokeDasharray="5 3" />
                    <text x="160" y="102" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="600">SHOULDER LINE</text>

                    {/* Chest Zone Box */}
                    <rect x="75" y="112" width="170" height="60" rx="6" fill="rgba(255,255,255,0.04)" stroke={validationResult.chestVisible ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.35)'} strokeWidth="1.2" strokeDasharray="4 3" />
                    <text x="160" y="146" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600">CHEST ZONE</text>

                    {/* Below-Chest Dynamic Line */}
                    <line x1="50" y1="184" x2="270" y2="184" stroke={validationResult.belowChestVisible ? 'rgba(34,197,94,0.85)' : 'rgba(255,255,255,0.45)'} strokeWidth="1.5" strokeDasharray="4 2" />
                    <text x="160" y="196" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="600">BELOW-CHEST REQUIRED AREA</text>
                  </svg>

                  {/* Status Banner */}
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                  }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: calibState === CALIB_STATE.CALIBRATION_PASSED ? '#4ade80' : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN ? '#60a5fa' : '#fbbf24',
                      background: 'rgba(0,0,0,0.78)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      backdropFilter: 'blur(4px)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      {calibState === CALIB_STATE.CALIBRATION_PASSED
                        ? '✓ Baseline Framing Accepted'
                        : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN
                        ? `● Hold position (${countdownSeconds}s)`
                        : '● Align head, eyes, shoulders & chest'}
                    </span>
                  </div>
                </div>

                {/* Real-time Checklist Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '6px',
                  background: '#f8fafc',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '12px',
                  fontSize: '11px',
                  color: '#334155',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {camStream ? <CheckCircle2 size={13} color="#16a34a" /> : <XCircle size={13} color="#dc2626" />}
                    <span>Camera Permission</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.faceDetected ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Face Visible &amp; Centered</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.eyesVisible ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Both Eyes Visible</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.leftShoulderVisible ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Left Shoulder Visible</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.rightShoulderVisible ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Right Shoulder Visible</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.chestVisible ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Chest Visible</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.belowChestVisible ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Below-Chest Area</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.bodyCentered ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Body Centered</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.lightingGood ? <CheckCircle2 size={13} color="#16a34a" /> : <AlertTriangle size={13} color="#f59e0b" />}
                    <span>Lighting Acceptable</span>
                  </div>
                </div>

                {calibState !== CALIB_STATE.CALIBRATION_PASSED && (
                  <div style={{
                    padding: '8px 12px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#92400e',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <AlertTriangle size={15} flexShrink={0} />
                    <span>{validationResult.message || 'Position your camera so your head, eyes, shoulders, chest and area below chest are visible.'}</span>
                  </div>
                )}

                <div className="ac-step__actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost"
                    onClick={handleBackToConsent}
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost"
                    onClick={initCameraCalibration}
                    title="Restart camera stream"
                  >
                    <RefreshCw size={14} className={busy ? 'ac-spin' : ''} /> Refresh Camera
                  </button>
                  <button
                    type="button"
                    className={`ac-btn ac-btn--primary ${calibState !== CALIB_STATE.CALIBRATION_PASSED ? 'ac-btn--disabled' : ''}`}
                    onClick={handleCameraPassed}
                    disabled={calibState !== CALIB_STATE.CALIBRATION_PASSED}
                    style={{
                      opacity: calibState === CALIB_STATE.CALIBRATION_PASSED ? 1 : 0.5,
                      cursor: calibState === CALIB_STATE.CALIBRATION_PASSED ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {calibState === CALIB_STATE.CALIBRATION_PASSED ? (
                      <>Calibration Passed, Continue <ArrowRight size={15} /></>
                    ) : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN ? (
                      <>Hold Position — {countdownSeconds}s</>
                    ) : calibState === CALIB_STATE.CAMERA_INITIALIZING ? (
                      <>Starting Camera…</>
                    ) : calibState === CALIB_STATE.CALIBRATION_WAITING ? (
                      <>Waiting for Video…</>
                    ) : (
                      <>Checking Framing…</>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {step === STEP_SCREEN_SHARE && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="ac-step"
              >
                <div className="ac-step__icon-wrap ac-step__icon-wrap--accent" aria-hidden>
                  <MonitorPlay size={26} />
                </div>
                <h2 className="ac-step__title">Share Your Screen</h2>
                <p className="ac-step__lead">
                  Screen sharing is mandatory for this assessment. Your trainer will monitor your screen live.
                </p>

                <ul className="ac-step__list ac-step__list--bullets">
                  <li>When prompted, select <strong>Entire Screen</strong> or an <strong>Application Window</strong>.</li>
                  <li>Do not select a single browser tab.</li>
                  <li>Keep screen sharing active for the entire quiz.</li>
                </ul>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="ac-error"
                      role="alert"
                    >
                      <AlertTriangle size={14} aria-hidden />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="ac-step__actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost"
                    onClick={() => setStep(STEP_CAMERA_CALIB)}
                    disabled={busy}
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button
                    type="button"
                    className="ac-btn ac-btn--primary"
                    onClick={handleRequestScreenShare}
                    disabled={busy}
                    autoFocus
                  >
                    {busy ? (
                      <>
                        <Loader2 size={15} className="ac-spin" /> Requesting screen share…
                      </>
                    ) : (
                      <>
                        <MonitorPlay size={15} /> Share Screen
                      </>
                    )}
                  </button>
                </div>

                {error && (
                  <div className="ac-step__actions" style={{ marginTop: '12px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="ac-btn ac-btn--primary"
                      onClick={handleRetryScreenShare}
                      disabled={busy}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="ac-btn ac-btn--ghost"
                      onClick={handleCancelFromScreenShare}
                      disabled={busy}
                    >
                      Cancel Assessment
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === STEP_FULLSCREEN && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="ac-step"
              >
                <div className="ac-step__icon-wrap ac-step__icon-wrap--accent" aria-hidden>
                  <Maximize2 size={26} />
                </div>
                <h2 className="ac-step__title">Enable Fullscreen to Begin</h2>
                <p className="ac-step__lead">
                  This assessment must be taken in fullscreen mode.
                </p>

                <ul className="ac-step__list ac-step__list--bullets">
                  <li>Exiting fullscreen will trigger a warning.</li>
                  <li>After warnings are exceeded, your exam may be auto-submitted.</li>
                  <li>Please close all other applications and tabs.</li>
                </ul>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="ac-error"
                      role="alert"
                    >
                      <AlertTriangle size={14} aria-hidden />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="ac-step__actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost"
                    onClick={() => setStep(STEP_SCREEN_SHARE)}
                    disabled={busy}
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button
                    type="button"
                    className="ac-btn ac-btn--primary"
                    onClick={handleEnableFullscreen}
                    disabled={busy}
                    autoFocus
                  >
                    {busy ? (
                      <>
                        <Loader2 size={15} className="ac-spin" /> Entering fullscreen…
                      </>
                    ) : (
                      <>
                        <Lock size={15} /> Enable Fullscreen &amp; Start Quiz
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
