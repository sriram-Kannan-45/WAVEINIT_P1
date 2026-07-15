/**
 * AssessmentConsentGate.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Three-step modal shown after POST /api/quizzes/:quizId/start succeeds.
 * Blocks the participant from entering <QuizTaking /> until they have:
 *   1. Acknowledged the security/consent notice + quiz protection rules
 *   2. Granted screen sharing permission (mandatory — entire screen or window)
 *   3. Granted fullscreen permission (must come from a user gesture click)
 *
 * Props:
 *   quiz                 The quiz object returned from /start.
 *   attemptId            The attempt id returned from /start.
 *   onConsented          fn(attemptId, quiz) — called once all steps pass.
 *   onCancel             fn() — called when the participant backs out.
 *   onScreenShareReady   fn(stream) — called when screen share succeeds.
 *
 * The modal portals into document.body so it can sit above the rest of the
 * dashboard regardless of overflow rules. ESC = cancel.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Maximize2,
  MonitorPlay,
  ArrowRight,
  ArrowLeft,
  Lock,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';
import useScreenShare from '../../proctoring/hooks/useScreenShare';
import '../../styles/assessment-consent.css';

const STEP_CONSENT = 1;
const STEP_SCREEN_SHARE = 2;
const STEP_FULLSCREEN = 3;

const fsApi = {
  request: (el = document.documentElement) =>
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
};

export default function AssessmentConsentGate({ quiz, attemptId, onConsented, onCancel, onScreenShareReady }) {
  const [step, setStep] = useState(STEP_CONSENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protectionConsentChecked, setProtectionConsentChecked] = useState(false);
  const screenStreamRef = useRef(null);

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

  // ESC = cancel, body scroll lock while open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const handleAgree = () => {
    if (!protectionConsentChecked) return;
    console.log('[AssessmentConsentGate] Security terms accepted');
    setError('');
    setStep(STEP_SCREEN_SHARE);
  };

  const handleBackToConsent = () => {
    setError('');
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
      // The fullscreen API call MUST come from this user gesture.
      const res = fsApi.request();
      if (res && typeof res.then === 'function') await res;
      // Verify we actually entered FS — some browsers silently noop.
      // Give the browser a tick to settle.
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

          {/* Step rail */}
          <div className="ac-rail" aria-hidden>
            <div className={`ac-rail__dot ${step === STEP_CONSENT ? 'ac-rail__dot--current' : 'ac-rail__dot--done'}`}>1</div>
            <div className={`ac-rail__line ${step >= STEP_SCREEN_SHARE ? 'ac-rail__line--done' : ''}`} />
            <div className={`ac-rail__dot ${step === STEP_SCREEN_SHARE ? 'ac-rail__dot--current' : step > STEP_SCREEN_SHARE ? 'ac-rail__dot--done' : 'ac-rail__dot--todo'}`}>2</div>
            <div className={`ac-rail__line ${step >= STEP_FULLSCREEN ? 'ac-rail__line--done' : ''}`} />
            <div className={`ac-rail__dot ${step === STEP_FULLSCREEN ? 'ac-rail__dot--current' : 'ac-rail__dot--todo'}`}>3</div>
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
                  Assessment Security Notice
                </h2>
                <p className="ac-step__lead">
                  For security and anti-malpractice purposes, the following information
                  will be collected and securely stored during this assessment:
                </p>

                <ul className="ac-step__list">
                  <li>Your User ID and session token</li>
                  <li>Your IP address</li>
                  <li>Your browser and device information</li>
                  <li>A device fingerprint</li>
                  <li>Assessment start and activity timestamps</li>
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
                    This quiz is monitored for academic integrity. Copying, right-clicking, taking screenshots, or sharing quiz content is strictly prohibited and will result in warnings and possible disqualification or certification revocation. Your screen will be shared live with your trainer throughout the assessment.
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
                    <span>I understand and agree that my quiz activity and screen will be monitored, and I accept the terms above.</span>
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

            {step === STEP_SCREEN_SHARE && (
              <motion.div
                key="step2"
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
                  <li>Do not select a browser tab.</li>
                  <li>Keep screen sharing active for the entire quiz. Stopping it will pause the quiz and notify your trainer.</li>
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
                    onClick={handleBackToConsent}
                    disabled={busy}
                  >
                    <ArrowLeft size={15} /> Go Back
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
                key="step3"
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
                  <li>After 3 violations, your exam will be automatically submitted.</li>
                  <li>Please close all other tabs and disable notifications.</li>
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
                    <ArrowLeft size={15} /> Go Back
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
                        <Lock size={15} /> Enable Fullscreen &amp; Start Exam
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
