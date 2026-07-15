/**
 * ExamProctorShell.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable proctoring wrapper that enforces the same fullscreen and screen-share
 * rules used by QuizTaking, so the coding assessment (and any future assessment
 * type) can share the workflow without duplicating logic.
 *
 * Props:
 *   children              — exam UI rendered underneath overlays
 *   onSubmit({ silent })  — auto-submit handler
 *   screenStream          — MediaStream from the consent gate
 *   examSession           — { sessionId, sessionToken }
 *   onScreenShareResumed  — fn(MediaStream) called after a successful resume
 *   title                 — optional assessment title shown in overlays
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Maximize2,
  MonitorPlay,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { API_BASE } from '../../api/api';
import { getAuthHeaders } from '../../api/request';

const MAX_WARNINGS = 3;
const SCREEN_SHARE_RECONNECT_TIMEOUT_MS = 30000;

const fsApi = {
  request: (el = document.documentElement) =>
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el),
  exit: () =>
    (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
  changeEvents: ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'],
};

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ExamProctorShell({
  children,
  onSubmit,
  screenStream,
  examSession,
  onScreenShareResumed,
  title = 'Assessment',
}) {
  /* ── Fullscreen state ─────────────────────────────────────────────── */
  const [isFullscreen, setIsFullscreen] = useState(!!fsApi.element());
  const [warnings, setWarnings] = useState(0);
  const [warningOpen, setWarningOpen] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const enteredFullscreenOnce = useRef(!!fsApi.element());
  const submittedRef = useRef(false);

  /* ── Screen share state ───────────────────────────────────────────── */
  const [isScreenSharing, setIsScreenSharing] = useState(!!screenStream);
  const [screenShareError, setScreenShareError] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const reconnectTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  /* ── Auto-fullscreen on mount ─────────────────────────────────────── */
  useEffect(() => {
    Promise.resolve(fsApi.request()).catch(() => {});
  }, []);

  /* ── fullscreenchange listener — 3-strike rule ────────────────────── */
  useEffect(() => {
    const onChange = () => {
      const inFs = !!fsApi.element();
      setIsFullscreen(inFs);

      if (inFs) {
        enteredFullscreenOnce.current = true;
        setWarningOpen(false);
        return;
      }

      if (submittedRef.current || terminated) return;
      if (!enteredFullscreenOnce.current) return;

      setWarnings((prev) => {
        const next = prev + 1;
        if (next >= MAX_WARNINGS) {
          setTerminated(true);
          setWarningOpen(false);
          setTimeout(() => {
            onSubmit?.({ silent: true }).finally(() => {
              if (fsApi.element()) {
                try {
                  fsApi.exit();
                } catch {}
              }
              setTimeout(() => onSubmit?.(null), 1800);
            });
          }, 50);
        } else {
          setWarningOpen(true);
        }
        return next;
      });
    };

    fsApi.changeEvents.forEach((evt) => document.addEventListener(evt, onChange));
    return () => {
      fsApi.changeEvents.forEach((evt) => document.removeEventListener(evt, onChange));
    };
  }, [terminated, onSubmit]);

  /* ── Violation reporting ──────────────────────────────────────────── */
  const reportViolation = useCallback(
    async (type, message) => {
      if (!examSession?.sessionId || !examSession?.sessionToken) return;
      console.log('[ExamProctorShell] Reporting violation:', type);
      try {
        await fetch(`${API_BASE}/proctor/sessions/${examSession.sessionId}/violation`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'X-Proctor-Session-Token': examSession.sessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type, message }),
        });
      } catch (e) {
        console.warn('[ExamProctorShell] Violation report failed:', e);
      }
    },
    [examSession]
  );

  /* ── Screen share reconnect / auto-submit ─────────────────────────── */
  const clearReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const startReconnectTimer = useCallback(() => {
    clearReconnect();
    setCountdown(30);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('[ExamProctorShell] Screen share not restored; auto-submitting');
      reportViolation('SCREEN_SHARE_STOPPED', 'Auto-submitted: screen share not restored in time');
      submittedRef.current = true;
      setTerminated(true);
      setIsPaused(false);
      clearReconnect();
      onSubmit?.({ silent: true }).finally(() => {
        if (fsApi.element()) {
          try {
            fsApi.exit();
          } catch {}
        }
        onSubmit?.(null);
      });
    }, SCREEN_SHARE_RECONNECT_TIMEOUT_MS);
  }, [clearReconnect, onSubmit, reportViolation]);

  const resumeScreenShare = useCallback(async () => {
    console.log('[ExamProctorShell] Attempting to resume screen share...');
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
      const track = newStream.getVideoTracks()[0];
      track.addEventListener('ended', () => {
        console.log('[ExamProctorShell] Resumed screen share track ended again');
        setIsScreenSharing(false);
        setIsPaused(true);
        setScreenShareError('Screen sharing stopped again. Please resume.');
        reportViolation('SCREEN_SHARE_STOPPED', 'Participant stopped screen sharing again');
        startReconnectTimer();
      });
      setIsScreenSharing(true);
      setIsPaused(false);
      setScreenShareError(null);
      clearReconnect();
      console.log('[ExamProctorShell] Screen share resumed');
      onScreenShareResumed?.(newStream);
    } catch (err) {
      console.error('[ExamProctorShell] Resume screen share failed:', err);
      setScreenShareError('Screen share required. Retry or the assessment will auto-submit.');
    }
  }, [clearReconnect, onScreenShareResumed, reportViolation, startReconnectTimer]);

  /* ── Watch screen share stream lifecycle ──────────────────────────── */
  useEffect(() => {
    return () => {
      clearReconnect();
    };
  }, [clearReconnect]);

  useEffect(() => {
    if (!screenStream) {
      setIsScreenSharing(false);
      return;
    }
    setIsScreenSharing(true);
    setIsPaused(false);
    setScreenShareError(null);
    clearReconnect();

    const track = screenStream.getVideoTracks()[0];
    if (!track) return;

    const onEnded = () => {
      console.log('[ExamProctorShell] Screen share track ended');
      setIsScreenSharing(false);
      setIsPaused(true);
      setScreenShareError('Screen sharing stopped. Please resume sharing to continue.');
      reportViolation('SCREEN_SHARE_STOPPED', 'Participant stopped screen sharing');
      startReconnectTimer();
    };

    track.addEventListener('ended', onEnded);
    return () => {
      track.removeEventListener('ended', onEnded);
    };
  }, [screenStream, clearReconnect, reportViolation, startReconnectTimer]);

  const reEnterFullscreen = async () => {
    try {
      await fsApi.request();
      setWarningOpen(false);
    } catch {
      // Browser refused fullscreen — keep modal open.
    }
  };

  /* ── Common overlay styles ────────────────────────────────────────── */
  const overlayBg = {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(4px)',
  };

  const modal = {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    borderRadius: 16,
    padding: '28px 24px',
    textAlign: 'center',
    boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
  };

  const btnPrimary = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 18px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnGhost = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 18px',
    background: '#fff',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}

      {/* ── Fullscreen warning modal (strikes 1 & 2) ──────────────── */}
      <AnimatePresence>
        {warningOpen && !terminated && (
          <motion.div
            key="warn-bg"
            style={overlayBg}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="alertdialog"
              aria-labelledby="eps-warn-title"
              style={modal}
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#fffbeb',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <AlertTriangle size={32} />
              </div>
              <h2 id="eps-warn-title" style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                Warning {warnings} of {MAX_WARNINGS}
              </h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                You exited fullscreen mode. Return to fullscreen immediately. After{' '}
                <strong>{MAX_WARNINGS} violations</strong>, your exam will be{' '}
                <strong>automatically terminated</strong>.
              </p>
              <button type="button" style={btnPrimary} onClick={reEnterFullscreen} autoFocus>
                <Maximize2 size={15} /> Return to fullscreen
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Termination overlay (strike 3) ────────────────────────── */}
      <AnimatePresence>
        {terminated && (
          <motion.div
            key="term-bg"
            style={{ ...overlayBg, background: 'rgba(15, 23, 42, 0.9)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              role="alertdialog"
              aria-labelledby="eps-term-title"
              style={modal}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#fef2f2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <XCircle size={32} />
              </div>
              <h2 id="eps-term-title" style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                Exam terminated
              </h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 16px' }}>
                You exited fullscreen {MAX_WARNINGS} times. Your attempt has been automatically submitted with the answers you provided.
              </p>
              <div style={{ color: '#94a3b8', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader2 size={14} className="animate-spin" />
                Returning to your dashboard…
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Screen share paused overlay ───────────────────────────── */}
      <AnimatePresence>
        {isPaused && !terminated && (
          <motion.div
            key="pause-bg"
            style={{ ...overlayBg, background: 'rgba(15, 23, 42, 0.88)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="alertdialog"
              aria-labelledby="eps-pause-title"
              style={{ ...modal, maxWidth: 440 }}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#fef2f2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <MonitorPlay size={32} />
              </div>
              <h2 id="eps-pause-title" style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                Screen sharing paused
              </h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 6px' }}>
                {screenShareError || 'You must share your screen to continue the assessment.'}
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 18px' }}>
                The assessment will auto-submit if screen sharing is not resumed within{' '}
                <strong>{formatTime(countdown)}</strong>.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" style={btnPrimary} onClick={resumeScreenShare} autoFocus>
                  <MonitorPlay size={15} /> Resume Screen Sharing
                </button>
                <button
                  type="button"
                  style={btnGhost}
                  onClick={() => {
                    if (fsApi.element()) {
                      try {
                        fsApi.exit();
                      } catch {}
                    }
                    clearReconnect();
                    onSubmit?.(null);
                  }}
                >
                  Cancel Assessment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status footer ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          borderRadius: 8,
          background: isFullscreen && isScreenSharing ? '#ecfdf5' : '#fffbeb',
          color: isFullscreen && isScreenSharing ? '#15803d' : '#b45309',
          border: `1px solid ${isFullscreen && isScreenSharing ? '#86efac' : '#fde68a'}`,
          fontSize: 11,
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {isFullscreen && isScreenSharing ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
        {isFullscreen && isScreenSharing
          ? 'Proctoring active'
          : isFullscreen
            ? 'Fullscreen active · screen share required'
            : 'Fullscreen required'}
      </div>
    </div>
  );
}
