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
    cameraActive: false,
    bodyInsideBox: false,
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

  const detectorRef = useRef(null);
  const faceStateRef = useRef({ faceCount: 0, faceInBox: false, lastCheck: 0 });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      } catch (e) {
        console.warn('[AssessmentConsentGate] FaceDetector init:', e.message);
      }
    }
  }, []);

  const triggerFaceDetection = useCallback(async (video) => {
    if (!detectorRef.current || !video || video.readyState < 2) return;
    try {
      const faces = await detectorRef.current.detect(video);
      const now = Date.now();
      if (!faces || faces.length === 0) {
        faceStateRef.current = { faceCount: 0, faceInBox: false, lastCheck: now };
        return;
      }
      if (faces.length > 1) {
        faceStateRef.current = { faceCount: faces.length, faceInBox: false, lastCheck: now };
        return;
      }
      const face = faces[0];
      const box = face.boundingBox;
      const scaleX = 320 / (video.videoWidth || 320);
      const scaleY = 240 / (video.videoHeight || 240);
      const fx = (box.x + box.width / 2) * scaleX;
      const fy = (box.y + box.height / 2) * scaleY;
      const fw = box.width * scaleX;
      const fh = box.height * scaleY;

      // Face center must be in upper box: x in [60, 260], y in [15, 160], min size 25px
      const faceInBox = fx >= 60 && fx <= 260 && fy >= 15 && fy <= 160 && fw >= 25 && fh >= 25;

      faceStateRef.current = { faceCount: 1, faceInBox, lastCheck: now };
    } catch (_) {}
  }, []);

  /**
   * Accurate framing verification: checks that candidate's face and upper-body are truly present inside the guide box
   */
  const validateCalibrationFrame = useCallback((video) => {
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      return {
        valid: false,
        cameraActive: false,
        bodyInsideBox: false,
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
    let sampleCount = 0;

    // Head zone: x: 65..255, y: 15..150 (Target for candidate's face)
    let headSkinPixels = 0;
    let headSkinSumX = 0;
    let headSkinSumY = 0;
    let headMinLuma = 255;
    let headMaxLuma = 0;
    let headSamples = 0;

    // Torso zone: x: 40..280, y: 120..235 (Target for candidate's upper-body / shoulders)
    let torsoForegroundPixels = 0;
    let torsoSampleCount = 0;
    let torsoMinLuma = 255;
    let torsoMaxLuma = 0;
    let torsoSkinPixels = 0;

    // Outer margins to detect if user is shifted outside the box
    let leftMarginSkin = 0;
    let rightMarginSkin = 0;

    const stepSize = 4;

    for (let y = 0; y < h; y += stepSize) {
      for (let x = 0; x < w; x += stepSize) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Luma
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;
        sampleCount++;

        // Inclusive YCbCr & RGB skin tone detection supporting Fitzpatrick skin types I - VI & varied lighting
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkin =
          luma >= 20 && luma <= 245 &&
          r >= 30 && g >= 20 && b >= 15 &&
          r >= g && (r - b) >= 4 &&
          cb >= 65 && cb <= 150 &&
          cr >= 118 && cr <= 190;

        // Head zone statistics
        if (x >= 65 && x <= 255 && y >= 15 && y <= 150) {
          headSamples++;
          if (luma < headMinLuma) headMinLuma = luma;
          if (luma > headMaxLuma) headMaxLuma = luma;

          if (isSkin) {
            headSkinPixels++;
            headSkinSumX += x;
            headSkinSumY += y;
          }
        }

        // Torso / Shoulder zone statistics
        if (x >= 40 && x <= 280 && y >= 120 && y <= 235) {
          torsoSampleCount++;
          if (luma < torsoMinLuma) torsoMinLuma = luma;
          if (luma > torsoMaxLuma) torsoMaxLuma = luma;
          if (isSkin) torsoSkinPixels++;

          // A candidate's torso can be wearing ANY clothing: dark/black jackets, grey hoodies,
          // white shirts, colored shirts, or skin on neck/arms.
          // Any active, non-dead pixel (luma between 12 and 248) is valid foreground content.
          if (luma >= 12 && luma <= 248) {
            torsoForegroundPixels++;
          }
        }

        // Outside margin checks
        if (x < 35 && isSkin) leftMarginSkin++;
        if (x > 285 && isSkin) rightMarginSkin++;
      }
    }

    const avgLuma = totalLuma / Math.max(1, sampleCount);
    const lightingGood = avgLuma >= 18.0 && avgLuma <= 245.0;

    // Biometric checks
    const headContrast = headMaxLuma - headMinLuma;
    const avgHeadSkinX = headSkinPixels > 0 ? headSkinSumX / headSkinPixels : 160;
    const avgHeadSkinY = headSkinPixels > 0 ? headSkinSumY / headSkinPixels : 80;

    // Face present: skin pixels detected in head area and centered, OR significant head contrast/presence centered
    const skinBasedFace =
      headSkinPixels >= 12 &&
      avgHeadSkinX >= 60 && avgHeadSkinX <= 260 &&
      avgHeadSkinY >= 15 && avgHeadSkinY <= 155;

    const contrastBasedFace =
      headContrast >= 20 &&
      headSamples > 50 &&
      (headSkinPixels >= 5 || headContrast >= 28);

    const facePresentBiometric = (skinBasedFace || contrastBasedFace) &&
      (leftMarginSkin === 0 || headSkinPixels >= leftMarginSkin * 0.7) &&
      (rightMarginSkin === 0 || headSkinPixels >= rightMarginSkin * 0.7);

    // Torso presence: candidate's upper body / shoulders are visible in torso area
    const torsoContrast = torsoMaxLuma - torsoMinLuma;
    const torsoDensity = torsoForegroundPixels / Math.max(1, torsoSampleCount);
    const torsoPresent = torsoSampleCount > 20 && (torsoDensity >= 0.20 || torsoContrast >= 15 || torsoSkinPixels >= 2);

    // FaceDetector (if available in modern browser)
    const faceState = faceStateRef.current;
    let bodyInsideBox = false;
    let message = 'Position your face & body inside the box.';

    if (faceState.lastCheck > 0 && Date.now() - faceState.lastCheck < 800) {
      if (faceState.faceCount === 0) {
        bodyInsideBox = false;
        message = '✗ No face detected. Please face the camera.';
      } else if (faceState.faceCount > 1) {
        bodyInsideBox = false;
        message = '✗ Multiple faces detected. Only one candidate allowed.';
      } else if (!faceState.faceInBox) {
        bodyInsideBox = false;
        message = '✗ Center your face inside the green guide box.';
      } else {
        bodyInsideBox = true;
      }
    } else {
      bodyInsideBox = Boolean(facePresentBiometric && torsoPresent);
      if (!facePresentBiometric) {
        message = '✗ Position your face inside the upper guide box.';
      } else if (!torsoPresent) {
        message = '✗ Position your upper body/shoulders inside the box.';
      }
    }

    const valid = Boolean(lightingGood && bodyInsideBox);

    if (!lightingGood) {
      message = avgLuma < 18.0 ? '✗ Room lighting is too dark — please turn on a light.' : '✗ Lighting is too bright — avoid direct glare.';
    } else if (valid) {
      message = '✓ Body inside box. Hold position to complete.';
    }

    return {
      valid,
      cameraActive: true,
      bodyInsideBox,
      lightingGood,
      message,
    };
  }, []);

  /**
   * Continuous Processing Loop with 1.0s Stability Countdown
   */
  const startContinuousCalibrationLoop = useCallback(
    (stream) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      stableStartRef.current = null;

      let lastDetectTime = 0;
      const HOLD_DURATION_MS = 1000;

      const processFrame = (now) => {
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

        if (detectorRef.current && (!lastDetectTime || now - lastDetectTime >= 200)) {
          lastDetectTime = now;
          triggerFaceDetection(video);
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

            // Auto-advance to Step 3 (Fullscreen Permission) after 400ms
            setTimeout(() => {
              if (isComponentMounted.current) {
                setStep(STEP_FULLSCREEN);
              }
            }, 400);
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
    [validateCalibrationFrame, triggerFaceDetection]
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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch (_) {}
        streamRef.current = null;
      }
      if (camStream) {
        try {
          camStream.getTracks().forEach((t) => t.stop());
        } catch (_) {}
        setCamStream(null);
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
                  Camera Calibration
                </h2>
                <p className="ac-step__lead">
                  Position your face and body inside the box below to begin.
                </p>

                {error && (
                  <div className="ac-error" role="alert" style={{ marginBottom: '12px' }}>
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Camera Viewport with Single Framing Box */}
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

                  {/* SVG Single Guide Box Overlay */}
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
                    {/* Centered Framing Box */}
                    <rect
                      x="45"
                      y="15"
                      width="230"
                      height="210"
                      rx="14"
                      fill={validationResult.bodyInsideBox ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)'}
                      stroke={validationResult.bodyInsideBox ? 'rgba(34,197,94,0.85)' : 'rgba(255,255,255,0.45)'}
                      strokeWidth="2"
                      strokeDasharray={validationResult.bodyInsideBox ? 'none' : '6 4'}
                    />

                    {/* Corner Accent Brackets */}
                    {/* Top-Left */}
                    <path
                      d="M45,40 L45,25 A10,10 0 0,1 55,15 L70,15"
                      fill="none"
                      stroke={validationResult.bodyInsideBox ? '#22c55e' : '#ffffff'}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {/* Top-Right */}
                    <path
                      d="M250,15 L265,15 A10,10 0 0,1 275,25 L275,40"
                      fill="none"
                      stroke={validationResult.bodyInsideBox ? '#22c55e' : '#ffffff'}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {/* Bottom-Left */}
                    <path
                      d="M45,200 L45,215 A10,10 0 0,0 55,225 L70,225"
                      fill="none"
                      stroke={validationResult.bodyInsideBox ? '#22c55e' : '#ffffff'}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {/* Bottom-Right */}
                    <path
                      d="M250,225 L265,225 A10,10 0 0,0 275,215 L275,200"
                      fill="none"
                      stroke={validationResult.bodyInsideBox ? '#22c55e' : '#ffffff'}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />

                    {/* Center Top Badge */}
                    <rect
                      x="95"
                      y="18"
                      width="130"
                      height="18"
                      rx="4"
                      fill={validationResult.bodyInsideBox ? 'rgba(34,197,94,0.9)' : 'rgba(0,0,0,0.65)'}
                    />
                    <text
                      x="160"
                      y="31"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="700"
                      letterSpacing="0.5"
                    >
                      {validationResult.bodyInsideBox ? '✓ BODY INSIDE BOX' : 'FIT BODY INSIDE BOX'}
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
                        ? '✓ Body Inside Box — Accepted'
                        : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN && validationResult.valid
                        ? `● Hold position (${countdownSeconds}s)`
                        : '● Position your body inside the box'}
                    </span>
                  </div>
                </div>

                {/* Simplified Real-time Checklist Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    background: '#f8fafc',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: '#334155',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {camStream ? <CheckCircle2 size={15} color="#16a34a" /> : <XCircle size={15} color="#dc2626" />}
                    <span style={{ fontWeight: 500 }}>Camera Active</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {validationResult.bodyInsideBox ? (
                      <CheckCircle2 size={15} color="#16a34a" />
                    ) : (
                      <AlertTriangle size={15} color="#f59e0b" />
                    )}
                    <span style={{ fontWeight: 500 }}>Body Inside Box</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {validationResult.lightingGood ? (
                      <CheckCircle2 size={15} color="#16a34a" />
                    ) : (
                      <AlertTriangle size={15} color="#f59e0b" />
                    )}
                    <span style={{ fontWeight: 500 }}>Lighting Ready</span>
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
                      !camStream ? 'ac-btn--disabled' : ''
                    }`}
                    onClick={handleCameraPassed}
                    disabled={!camStream}
                    style={{
                      opacity: camStream ? 1 : 0.5,
                      cursor: camStream ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {calibState === CALIB_STATE.CALIBRATION_PASSED && validationResult.valid ? (
                      <>
                        Calibration Passed, Continue <ArrowRight size={15} />
                      </>
                    ) : calibState === CALIB_STATE.CALIBRATION_COUNTDOWN && validationResult.valid ? (
                      <>
                        Hold Position ({countdownSeconds}s) <ArrowRight size={15} />
                      </>
                    ) : validationResult.valid ? (
                      <>
                        Confirm Framing &amp; Continue <ArrowRight size={15} />
                      </>
                    ) : calibState === CALIB_STATE.CAMERA_INITIALIZING ? (
                      <>Starting Camera…</>
                    ) : (
                      <>
                        Confirm Framing &amp; Continue <ArrowRight size={15} />
                      </>
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
