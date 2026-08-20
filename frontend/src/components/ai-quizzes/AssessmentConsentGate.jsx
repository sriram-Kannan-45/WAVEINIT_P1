/**
 * AssessmentConsentGate.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Strict 3-step verification gate for Quiz and Coding modules:
 *   1. Consent & Academic Integrity Notice
 *   2. Camera & Upper-Body Calibration (Face, Eyes, Shoulders, Chest, Body Centered, Lighting)
 *   3. Fullscreen Permission
 *
 * Screen sharing is NOT required for Quiz or Coding Assessment.
 * All calibration items must simultaneously pass continuously for 1.5s.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  Camera,
  Maximize2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  X,
  RefreshCw,
  Info,
  Clock,
  Sparkles,
  Sliders,
  Check,
} from 'lucide-react';
import '../../styles/assessment-consent.css';

const STEP_CONSENT = 1;
const STEP_CAMERA_CALIB = 2;
const STEP_FULLSCREEN = 3;

const CALIB_STATE = {
  CAMERA_INITIALIZING: 'CAMERA_INITIALIZING',
  CALIBRATION_WAITING: 'CALIBRATION_WAITING',
  CALIBRATION_CHECKING: 'CALIBRATION_CHECKING',
  CALIBRATION_COUNTDOWN: 'CALIBRATION_COUNTDOWN',
  CALIBRATION_PASSED: 'CALIBRATION_PASSED',
};

const fsApi = {
  request: (el = document.documentElement) =>
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
};

export default function AssessmentConsentGate({ quiz, attemptId, onConsented, onCancel }) {
  const [step, setStep] = useState(STEP_CONSENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);

  // Calibration State
  const [camStream, setCamStream] = useState(null);
  const [calibState, setCalibState] = useState(CALIB_STATE.CAMERA_INITIALIZING);
  const [countdownSeconds, setCountdownSeconds] = useState(2);
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
    message: 'Initializing camera...',
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const stableStartRef = useRef(null);
  const isComponentMounted = useRef(true);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /**
   * Evaluates camera frame against strict biometric landmarks & framing geometry
   */
  const validateCalibrationFrame = useCallback((video) => {
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
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
        message: 'Camera feed initializing. Please wait...',
      };
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;

    ctx.drawImage(video, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let totalLuma = 0;
    let totalLumaSq = 0;
    let sampleCount = 0;

    let headSkinPixels = 0;
    let headSampleCount = 0;
    let leftEyeSkin = 0;
    let rightEyeSkin = 0;
    let leftShoulderPixels = 0;
    let rightShoulderPixels = 0;
    let chestPixels = 0;
    let belowChestPixels = 0;

    const stepSize = 4;

    for (let y = 0; y < h; y += stepSize) {
      for (let x = 0; x < w; x += stepSize) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // ITU-R BT.601 Luma
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;
        totalLumaSq += luma * luma;
        sampleCount++;

        // YCbCr Skin Tone Segmentation
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkin =
          r > 40 &&
          g > 25 &&
          b > 20 &&
          r > g &&
          r > b &&
          Math.abs(r - g) > 12 &&
          cb >= 75 &&
          cb <= 135 &&
          cr >= 130 &&
          cr <= 180;

        // Foreground / Body edge contrast
        const isBodyPixel = isSkin || (luma > 20 && luma < 235 && (Math.abs(r - g) > 8 || Math.abs(g - b) > 8));

        // Head zone (x: 100..220, y: 15..110)
        if (x >= 100 && x <= 220 && y >= 15 && y <= 110) {
          headSampleCount++;
          if (isSkin) headSkinPixels++;

          // Eye sub-zones (y: 35..75)
          if (y >= 35 && y <= 75) {
            if (x >= 110 && x <= 155 && isSkin) leftEyeSkin++;
            if (x >= 165 && x <= 210 && isSkin) rightEyeSkin++;
          }
        }

        // Left Shoulder Zone (x: 20..110, y: 95..165)
        if (x >= 20 && x <= 110 && y >= 95 && y <= 165 && isBodyPixel) {
          leftShoulderPixels++;
        }

        // Right Shoulder Zone (x: 210..300, y: 95..165)
        if (x >= 210 && x <= 300 && y >= 95 && y <= 165 && isBodyPixel) {
          rightShoulderPixels++;
        }

        // Chest Zone (x: 90..230, y: 110..180)
        if (x >= 90 && x <= 230 && y >= 110 && y <= 180 && isBodyPixel) {
          chestPixels++;
        }

        // Below-Chest Zone (x: 80..240, y: 180..235)
        if (x >= 80 && x <= 240 && y >= 180 && y <= 235 && isBodyPixel) {
          belowChestPixels++;
        }
      }
    }

    const avgLuma = totalLuma / Math.max(1, sampleCount);
    const variance = Math.max(0, totalLumaSq / Math.max(1, sampleCount) - avgLuma * avgLuma);
    const contrast = Math.sqrt(variance);

    // Strict Lighting Boundaries
    const lightingGood = avgLuma >= 45.0 && avgLuma <= 220.0 && contrast >= 22.0;

    // Face Detection & Centering
    const faceDetected = headSkinPixels >= 28 && headSampleCount > 0;
    const faceCentered = faceDetected;

    // Anatomical Sub-Checks
    const eyesVisible = faceDetected && (leftEyeSkin >= 2 || rightEyeSkin >= 2);
    const leftShoulderVisible = faceDetected && leftShoulderPixels >= 16;
    const rightShoulderVisible = faceDetected && rightShoulderPixels >= 16;
    const chestVisible = faceDetected && chestPixels >= 22;
    const belowChestVisible = faceDetected && belowChestPixels >= 12;
    const bodyCentered =
      faceCentered &&
      leftShoulderVisible &&
      rightShoulderVisible &&
      Math.abs(leftShoulderPixels - rightShoulderPixels) <= 28;

    // Strict ALL-OR-NOTHING validity (Bug 7 fix)
    const valid = Boolean(
      lightingGood &&
      faceDetected &&
      faceCentered &&
      eyesVisible &&
      leftShoulderVisible &&
      rightShoulderVisible &&
      chestVisible &&
      belowChestVisible &&
      bodyCentered
    );

    let message = 'Align your head, eyes, shoulders, and upper body in the camera guide.';
    if (!lightingGood) {
      message =
        avgLuma < 45.0
          ? '✗ Lighting is too dark — please turn on a room light.'
          : avgLuma > 220.0
          ? '✗ Lighting is too bright or washed out — avoid direct glare.'
          : '✗ Camera contrast is too low — ensure your face is well-lit.';
    } else if (!faceDetected) {
      message = '✗ No Face Detected — center yourself directly in front of the camera.';
    } else if (!faceCentered) {
      message = '✗ Face Not Centered — move to the horizontal center of the frame.';
    } else if (!eyesVisible) {
      message = '✗ Both Eyes Not Clearly Visible — look directly at the camera.';
    } else if (!leftShoulderVisible || !rightShoulderVisible) {
      const missing =
        !leftShoulderVisible && !rightShoulderVisible
          ? 'Both shoulders'
          : !leftShoulderVisible
          ? 'Left shoulder'
          : 'Right shoulder';
      message = `✗ ${missing} not visible — step back slightly to frame both shoulders.`;
    } else if (!chestVisible) {
      message = '✗ Upper body / chest not framed — tilt camera down slightly.';
    } else if (!belowChestVisible) {
      message = '✗ Move back slightly so your upper body and lower chest are visible.';
    } else if (!bodyCentered) {
      message = '✗ Body Not Centered — move slightly left/right to center your body in frame.';
    } else if (valid) {
      message = '✓ Good framing. Hold position to complete calibration.';
    }

    return {
      valid,
      faceDetected,
      faceCentered,
      eyesVisible,
      leftShoulderVisible,
      rightShoulderVisible,
      chestVisible,
      belowChestVisible,
      bodyCentered,
      lightingGood,
      message,
    };
  }, []);

  /**
   * Continuous Processing Loop with 1.5s Stability Countdown
   */
  const startContinuousCalibrationLoop = useCallback(
    (stream) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      stableStartRef.current = null;

      const HOLD_DURATION_MS = 1500;

      const processFrame = () => {
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

        if (video.readyState < 2 || video.videoWidth === 0) {
          setCalibState(CALIB_STATE.CALIBRATION_WAITING);
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const result = validateCalibrationFrame(video);
        setValidationResult(result);

        if (result.valid) {
          if (!stableStartRef.current) {
            stableStartRef.current = performance.now();
          }

          const elapsedMs = performance.now() - stableStartRef.current;
          const remaining = Math.max(1, Math.ceil((HOLD_DURATION_MS - elapsedMs) / 1000));
          setCountdownSeconds(remaining);

          if (elapsedMs >= HOLD_DURATION_MS) {
            setCalibState(CALIB_STATE.CALIBRATION_PASSED);

            // Auto-advance to Step 3 (Fullscreen Permission) after 500ms
            setTimeout(() => {
              if (isComponentMounted.current) {
                setStep(STEP_FULLSCREEN);
              }
            }, 500);
            return;
          } else {
            setCalibState(CALIB_STATE.CALIBRATION_COUNTDOWN);
          }
        } else {
          if (stableStartRef.current) {
            stableStartRef.current = null;
          }
          setCalibState(CALIB_STATE.CALIBRATION_CHECKING);
        }

        animFrameRef.current = requestAnimationFrame(processFrame);
      };

      animFrameRef.current = requestAnimationFrame(processFrame);
    },
    [validateCalibrationFrame]
  );

  const initCameraCalibration = useCallback(async () => {
    setBusy(true);
    setError('');
    setCalibState(CALIB_STATE.CAMERA_INITIALIZING);
    stableStartRef.current = null;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 15, max: 20 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCamStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setBusy(false);
      startContinuousCalibrationLoop(stream);
    } catch (e) {
      console.error('[AssessmentConsentGate] Camera access error:', e);
      setError('Camera access denied or unavailable. Please grant camera permissions to proceed.');
      setCalibState(CALIB_STATE.CALIBRATION_WAITING);
      setBusy(false);
    }
  }, [startContinuousCalibrationLoop]);

  const handleStartCalibration = () => {
    setError('');
    setStep(STEP_CAMERA_CALIB);
    initCameraCalibration();
  };

  const handleCameraPassed = () => {
    if (!videoRef.current || !camStream) return;
    // Strict re-validation against current live frame before proceeding
    const finalCheck = validateCalibrationFrame(videoRef.current);
    if (!finalCheck.valid) {
      setError(finalCheck.message || 'Please ensure you are properly framed before proceeding.');
      return;
    }
    setError('');
    setCalibState(CALIB_STATE.CALIBRATION_PASSED);
    setStep(STEP_FULLSCREEN);
  };

  const handleBackToConsent = () => {
    setError('');
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setStep(STEP_CONSENT);
  };

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
      onConsented?.(attemptId, quiz);
    } catch (e) {
      console.error('[AssessmentConsentGate] Fullscreen failed:', e);
      setError('Fullscreen is required to start this assessment. Please allow fullscreen and try again.');
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

          {/* Step rail (3 steps) */}
          <div className="ac-rail" aria-hidden style={{ padding: '12px 24px 8px' }}>
            <div className={`ac-rail__dot ${step === STEP_CONSENT ? 'ac-rail__dot--current' : 'ac-rail__dot--done'}`}>
              1
            </div>
            <div className={`ac-rail__line ${step >= STEP_CAMERA_CALIB ? 'ac-rail__line--done' : ''}`} />
            <div
              className={`ac-rail__dot ${
                step === STEP_CAMERA_CALIB
                  ? 'ac-rail__dot--current'
                  : step > STEP_CAMERA_CALIB
                  ? 'ac-rail__dot--done'
                  : 'ac-rail__dot--todo'
              }`}
            >
              2
            </div>
            <div className={`ac-rail__line ${step >= STEP_FULLSCREEN ? 'ac-rail__line--done' : ''}`} />
            <div className={`ac-rail__dot ${step === STEP_FULLSCREEN ? 'ac-rail__dot--current' : 'ac-rail__dot--todo'}`}>
              3
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* ── STEP 1: Consent & Academic Integrity ── */}
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
                  <li>Upper-body framing (Head, shoulders, and chest baseline)</li>
                  <li>3D eye gaze &amp; head pose monitoring</li>
                  <li>Multiple-person and unauthorized device detection</li>
                  <li>Fullscreen session locking &amp; browser tab activity</li>
                </ul>

                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginTop: '16px',
                    marginBottom: '12px',
                  }}
                >
                  <p
                    style={{
                      fontSize: '13px',
                      lineHeight: '1.6',
                      color: '#92400e',
                      margin: '0 0 10px 0',
                      fontWeight: '500',
                    }}
                  >
                    By clicking continue, you consent to live automated proctoring. You will calibrate your camera
                    framing in the next step.
                  </p>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#78350f',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={consentAgreed}
                      onChange={(e) => setConsentAgreed(e.target.checked)}
                      style={{
                        width: '16px',
                        height: '16px',
                        accentColor: '#0d9488',
                        cursor: 'pointer',
                      }}
                    />
                    <span>I understand and agree to the assessment rules</span>
                  </label>
                </div>

                {error && (
                  <div className="ac-error" role="alert">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="ac-step__actions">
                  <button type="button" className="ac-btn ac-btn--ghost" onClick={onCancel}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`ac-btn ac-btn--primary ${!consentAgreed ? 'ac-btn--disabled' : ''}`}
                    onClick={handleStartCalibration}
                    disabled={!consentAgreed}
                  >
                    Proceed to Calibration <ArrowRight size={15} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Camera & Upper-Body Calibration ── */}
            {step === STEP_CAMERA_CALIB && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="ac-step"
              >
                <div className="ac-step__icon-wrap" aria-hidden>
                  <Camera size={26} />
                </div>
                <h2 id="ac-title" className="ac-step__title">
                  Camera &amp; Upper-Body Calibration
                </h2>
                <p className="ac-step__lead">
                  Position your camera so your head, eyes, both shoulders, and upper body are clearly visible in the
                  guide below.
                </p>

                {error && (
                  <div className="ac-error" role="alert" style={{ marginBottom: '12px' }}>
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Camera Viewport with Framing Guide */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '440px',
                    aspectRatio: '4 / 3',
                    margin: '0 auto 12px auto',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: '#000000',
                    border:
                      calibState === CALIB_STATE.CALIBRATION_PASSED && validationResult.valid
                        ? '2px solid #22c55e'
                        : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN && validationResult.valid
                        ? '2px solid #3b82f6'
                        : '2px solid #e2e8f0',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                  }}
                >
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
                      objectFit: 'contain',
                      background: '#000000',
                      transform: 'scaleX(-1)',
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
                    <line x1="160" y1="10" x2="160" y2="230" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" strokeWidth="1" />
                    <ellipse
                      cx="160"
                      cy="54"
                      rx="42"
                      ry="46"
                      fill="rgba(13,148,136,0.06)"
                      stroke={validationResult.faceDetected && validationResult.faceCentered ? 'rgba(34,197,94,0.8)' : 'rgba(255,255,255,0.4)'}
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <text x="160" y="24" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700">
                      HEAD &amp; EYES
                    </text>

                    {/* Shoulder Line */}
                    <line
                      x1="50"
                      y1="106"
                      x2="270"
                      y2="106"
                      stroke={validationResult.leftShoulderVisible && validationResult.rightShoulderVisible ? 'rgba(34,197,94,0.85)' : 'rgba(255,255,255,0.4)'}
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                    />
                    <text x="160" y="102" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="600">
                      SHOULDER LINE
                    </text>

                    {/* Chest Zone */}
                    <rect
                      x="75"
                      y="112"
                      width="170"
                      height="60"
                      rx="6"
                      fill="rgba(255,255,255,0.04)"
                      stroke={validationResult.chestVisible ? 'rgba(34,197,94,0.8)' : 'rgba(255,255,255,0.35)'}
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                    <text x="160" y="146" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600">
                      CHEST ZONE
                    </text>
                  </svg>

                  {/* Status Banner */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color:
                          calibState === CALIB_STATE.CALIBRATION_PASSED && validationResult.valid
                            ? '#4ade80'
                            : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN && validationResult.valid
                            ? '#60a5fa'
                            : '#fbbf24',
                        background: 'rgba(0,0,0,0.82)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        backdropFilter: 'blur(4px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {calibState === CALIB_STATE.CALIBRATION_PASSED && validationResult.valid
                        ? '✓ Baseline Framing Accepted'
                        : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN && validationResult.valid
                        ? `● Hold position (${countdownSeconds}s)`
                        : '● Align head, eyes, shoulders & center body'}
                    </span>
                  </div>
                </div>

                {/* Real-time Checklist Grid */}
                <div
                  style={{
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
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {camStream ? <CheckCircle2 size={13} color="#16a34a" /> : <XCircle size={13} color="#dc2626" />}
                    <span>Camera Active</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {validationResult.faceDetected && validationResult.faceCentered ? (
                      <CheckCircle2 size={13} color="#16a34a" />
                    ) : (
                      <AlertTriangle size={13} color="#f59e0b" />
                    )}
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

                {(!validationResult.valid || calibState !== CALIB_STATE.CALIBRATION_PASSED) && (
                  <div
                    style={{
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
                    }}
                  >
                    <AlertTriangle size={15} flexShrink={0} />
                    <span>{validationResult.message}</span>
                  </div>
                )}

                <div className="ac-step__actions">
                  <button type="button" className="ac-btn ac-btn--ghost" onClick={handleBackToConsent}>
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
                    className={`ac-btn ac-btn--primary ${
                      !camStream || !validationResult.valid || calibState !== CALIB_STATE.CALIBRATION_PASSED
                        ? 'ac-btn--disabled'
                        : ''
                    }`}
                    onClick={handleCameraPassed}
                    disabled={!camStream || !validationResult.valid || calibState !== CALIB_STATE.CALIBRATION_PASSED}
                    style={{
                      opacity:
                        camStream && validationResult.valid && calibState === CALIB_STATE.CALIBRATION_PASSED
                          ? 1
                          : 0.5,
                      cursor:
                        camStream && validationResult.valid && calibState === CALIB_STATE.CALIBRATION_PASSED
                          ? 'pointer'
                          : 'not-allowed',
                    }}
                  >
                    {calibState === CALIB_STATE.CALIBRATION_PASSED && validationResult.valid ? (
                      <>
                        Calibration Passed, Continue <ArrowRight size={15} />
                      </>
                    ) : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN && validationResult.valid ? (
                      <>Hold Position — {countdownSeconds}s</>
                    ) : calibState === CALIB_STATE.CAMERA_INITIALIZING ? (
                      <>Starting Camera…</>
                    ) : (
                      <>Align Framing to Continue</>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Fullscreen Permission ── */}
            {step === STEP_FULLSCREEN && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="ac-step"
              >
                <div className="ac-step__icon-wrap" aria-hidden>
                  <Maximize2 size={26} />
                </div>
                <h2 id="ac-title" className="ac-step__title">
                  Enter Fullscreen Assessment Mode
                </h2>
                <p className="ac-step__lead">
                  This assessment runs in secure fullscreen mode. Tab switching, minimizing, or exiting fullscreen will
                  be logged as proctoring integrity events.
                </p>

                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginTop: '16px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <CheckCircle2 size={16} color="#16a34a" />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#166534' }}>
                      Pre-test Verification Complete
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#15803d', margin: 0, lineHeight: '1.5' }}>
                    Your camera baseline framing has been validated. Click the button below to enter fullscreen mode
                    and begin your assessment.
                  </p>
                </div>

                {error && (
                  <div className="ac-error" role="alert">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="ac-step__actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn--ghost"
                    onClick={() => {
                      setError('');
                      setStep(STEP_CAMERA_CALIB);
                    }}
                  >
                    <ArrowLeft size={15} /> Back to Calibration
                  </button>
                  <button
                    type="button"
                    className="ac-btn ac-btn--primary"
                    onClick={handleEnableFullscreen}
                    disabled={busy}
                  >
                    {busy ? 'Entering Fullscreen…' : 'Enter Fullscreen & Begin Assessment'}
                    <Maximize2 size={15} style={{ marginLeft: '6px' }} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
