/**
 * PreExamReadiness — premium dark SaaS pre-exam screen.
 *
 * Route: /participant/exam/:examId   (or :quizId — both supported)
 * Stack: React Router v6 + Express+JWT (project's real stack).
 *
 * Aesthetic: Linear / Vercel / Stripe quality. Zinc-950 surfaces,
 * indigo accents, Sora display, Inter UI, JetBrains Mono numerics.
 *
 * Layout (100vw × 100vh, no scroll on outer):
 *   ┌─ TopBar 48px (border-b) ─────────────────────────────────┐
 *   │ [W] WAVE INIT · PROCTORED EXAM      ● Status text mono   │
 *   ├──────────────────────────┬───────────────────────────────┤
 *   │ LEFT 42% (bg)            │ RIGHT 58% (surface)            │
 *   │  ▸ Eyebrow + title       │  Heading + counter pill        │
 *   │  ▸ Orb visual + chips    │  Checklist (flex-1, scroll)    │
 *   │  ▸ "Before you begin"    │  Sticky footer (consent + btn) │
 *   └──────────────────────────┴───────────────────────────────┘
 *
 * Reliability:
 *  - quizId comes from useParams() exclusively (never undefined when
 *    proctor.start runs — a useEffect redirects if missing).
 *  - Hooks-rule clean: every hook runs before any conditional return.
 *  - Cleanup on unmount stops screen-share tracks.
 *  - 25s loading watchdog flips the button into a Retry / inline error
 *    state so the user is never stuck in an infinite spinner.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Lock, KeyRound, Wifi, MonitorPlay, Maximize2, Eye,
  Check, X as IconX, Loader2, ArrowRight, Info, Clock, FileText,
  AlertCircle, RefreshCw,
} from 'lucide-react';

import { ProctorProvider, useProctor } from '../proctoring';
import useAuthUser from '../proctoring/hooks/useAuthUser';
import useDeviceFingerprint from '../proctoring/hooks/useDeviceFingerprint';
import useProctoringMedia from '../proctoring/hooks/useProctoringMedia';
import useScreenShare from '../proctoring/hooks/useScreenShare';
import useFullscreen from '../proctoring/hooks/useFullscreen';
import useNetworkStatus from '../proctoring/hooks/useNetworkStatus';

// ── Tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: '#09090b',
  surface: '#18181b',
  border: '#27272a',
  muted: '#3f3f46',
  text: '#fafafa',
  subtle: '#a1a1aa',
  indigo: '#0D9488',
  indigoDim: '#0F766E',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

// Card states
const PENDING = 'pending';
const COMPLETE = 'complete';
const ACTION = 'action';
const ERROR = 'error';

const LOADING_TIMEOUT_MS = 25_000;

// ── One-time font + keyframes injection ────────────────────────────────
function ensureAssets() {
  if (typeof document === 'undefined') return;
  // Fonts
  if (!document.getElementById('preexam-fonts')) {
    const link = document.createElement('link');
    link.id = 'preexam-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }
  // Keyframes (scoped to .preexam container so we never leak into the rest of the app)
  if (!document.getElementById('preexam-styles')) {
    const style = document.createElement('style');
    style.id = 'preexam-styles';
    style.textContent = `
      .preexam { font-family: 'Poppins', system-ui, sans-serif; }
      .preexam .display { font-family: 'Poppins', sans-serif; }
      .preexam .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

      @keyframes preexam-fade-slide-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .preexam .fade-in { animation: preexam-fade-slide-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both; }

      @keyframes preexam-orb-pulse-1 {
        0%, 100% { transform: scale(1);    opacity: 0.55; }
        50%      { transform: scale(1.08); opacity: 0.18; }
      }
      @keyframes preexam-orb-pulse-2 {
        0%, 100% { transform: scale(1);    opacity: 0.32; }
        50%      { transform: scale(1.12); opacity: 0.05; }
      }
      .preexam .orb-ring-1 { animation: preexam-orb-pulse-1 3.2s ease-in-out infinite; }
      .preexam .orb-ring-2 { animation: preexam-orb-pulse-2 3.2s ease-in-out 0.6s infinite; }

      @keyframes preexam-status-pulse {
        0%, 100% { transform: scale(1);   opacity: 1; }
        50%      { transform: scale(1.4); opacity: 0.4; }
      }
      .preexam .status-pulse { animation: preexam-status-pulse 2s ease-in-out infinite; }

      @keyframes preexam-complete-flash {
        0%   { background-color: rgba(34, 197, 94, 0.22); }
        100% { background-color: rgba(34, 197, 94, 0.05); }
      }
      .preexam .flash-complete { animation: preexam-complete-flash 700ms ease-out 1; }

      .preexam .scrollbar-hide::-webkit-scrollbar { display: none; }
      .preexam .scrollbar-hide { scrollbar-width: none; }
    `;
    document.head.appendChild(style);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Inner component (lives inside ProctorProvider)
// ──────────────────────────────────────────────────────────────────────
function PreExamInner({ quizId, attemptId, quizData }) {
  const navigate = useNavigate();
  const proctor = useProctor();
  const { userId, ready: authReady } = useAuthUser();
  const fp = useDeviceFingerprint();
  const isOnline = useNetworkStatus();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [stuck, setStuck] = useState(false);

  const streamRef = useRef(null);
  const stuckTimerRef = useRef(null);
  const justActivated = useRef(false);

  const screenShare = useScreenShare({
    onStop: () => proctor.report?.('SCREEN_SHARE_STOPPED'),
    onDenied: () => proctor.report?.('SCREEN_SHARE_DENIED'),
  });
  useEffect(() => {
    streamRef.current = screenShare.stream;
    proctor.setScreenStream(screenShare.stream);
  }, [screenShare.stream, proctor]);

  const fullscreen = useFullscreen({
    onExit: () => proctor.report?.('FULLSCREEN_EXIT'),
  });

  const proctorMedia = useProctoringMedia({ enabled: false });

  // Request camera/mic on mount
  useEffect(() => {
    proctorMedia.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inject fonts + keyframes once
  useEffect(() => { ensureAssets(); }, []);

  // Cleanup on unmount: stop screen share + clear watchdog
  useEffect(() => {
    return () => {
      const s = streamRef.current;
      if (s && !justActivated.current) {
        try { s.getTracks().forEach((t) => t.stop()); } catch { /* swallow */ }
      }
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, []);

  // Auto-redirect once activated — only after user clicked Begin
  useEffect(() => {
    if (justActivated.current && proctor.isActive && proctor.session?.sessionId) {
      navigate(`/exam/${proctor.session.sessionId}`, { replace: true });
    }
  }, [proctor.isActive, proctor.session?.sessionId, navigate]);

  // Build checklist state
  const items = useMemo(() => [
    {
      key: 'auth',
      icon: KeyRound,
      label: 'Authentication verified',
      state: !authReady ? PENDING : userId ? COMPLETE : ERROR,
      hint: !authReady ? 'Resolving your session…'
        : userId ? `Signed in · user ${userId}`
        : 'Please sign in again',
    },
    {
      key: 'fingerprint',
      icon: Lock,
      label: 'Device fingerprint registered',
      state: fp ? COMPLETE : PENDING,
      hint: fp ? 'Device recognised' : 'Generating fingerprint…',
    },
    {
      key: 'camera',
      icon: Eye,
      label: 'Camera & Microphone access',
      state: proctorMedia.error ? ERROR
        : proctorMedia.cameraGranted && proctorMedia.micGranted ? COMPLETE
        : ACTION,
      hint: proctorMedia.error ? proctorMedia.error
        : proctorMedia.cameraGranted && proctorMedia.micGranted ? 'Camera and microphone feeds authorized'
        : 'Action required when you start',
    },
    {
      key: 'network',
      icon: Wifi,
      label: 'Internet connection stable',
      state: isOnline ? COMPLETE : ERROR,
      hint: isOnline ? 'Connection healthy' : 'Offline — reconnect to continue',
    },
    {
      key: 'screen',
      icon: MonitorPlay,
      label: 'Screen sharing active',
      state: screenShare.error ? ERROR
        : screenShare.isSharing ? COMPLETE
        : ACTION,
      hint: screenShare.error ? 'Permission denied — tap retry'
        : screenShare.isSharing ? 'Streaming to your instructor'
        : 'Action required when you start',
    },
    {
      key: 'fullscreen',
      icon: Maximize2,
      label: 'Fullscreen ready',
      state: fullscreen.isFullscreen ? COMPLETE : ACTION,
      hint: fullscreen.isFullscreen ? 'Locked into fullscreen'
        : 'Action required when you start',
    },
  ], [authReady, userId, fp, proctorMedia, isOnline, screenShare, fullscreen.isFullscreen]);

  const passedCount = items.filter((it) => it.state === COMPLETE).length;
  const requiredPass =
    items[0].state === COMPLETE &&
    items[1].state === COMPLETE &&
    items[2].state === COMPLETE &&
    items[3].state === COMPLETE;

  // ── Begin click ───────────────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    if (submitting) return;
    setError(null); setStuck(false);

    if (!requiredPass) {
      setError('Please complete authentication, fingerprint, and connection checks first.');
      return;
    }
    if (!quizId) {
      setError('Missing quiz id — please return to the dashboard and try again.');
      return;
    }

    setSubmitting(true);
    stuckTimerRef.current = setTimeout(() => setStuck(true), LOADING_TIMEOUT_MS);

    try {
      // 1. Screen share (must succeed)
      if (!screenShare.isSharing) {
        const stream = await screenShare.request();
        if (!stream) throw new Error('Screen sharing was denied');
      }
      // 2. Fullscreen — needs the user gesture from this click
      if (!fullscreen.isFullscreen) {
        const ok = await fullscreen.request();
        if (!ok) throw new Error('Fullscreen permission was denied');
      }
      // 3. INSERT exam_sessions row on the server
      const s = await proctor.start({
        quizId, attemptId, fingerprintHash: fp, screenSharing: true,
      });
      // 4. PENDING -> ACTIVE
      justActivated.current = true;
      await proctor.activate(s.sessionId, s.sessionToken);
      // 5. useEffect on proctor.isActive will navigate
    } catch (e) {
      if (stuckTimerRef.current) { clearTimeout(stuckTimerRef.current); stuckTimerRef.current = null; }
      setSubmitting(false);
      setError(e?.message || 'Failed to start exam');
      try { await fullscreen.exit(); } catch { /* swallow */ }
    }
  }, [submitting, requiredPass, quizId, attemptId, fp, screenShare, fullscreen, proctor]);

  const handleRetry = useCallback(() => {
    if (stuckTimerRef.current) { clearTimeout(stuckTimerRef.current); stuckTimerRef.current = null; }
    setSubmitting(false); setStuck(false); setError(null);
  }, []);

  const handleCancel = useCallback(() => {
    navigate('/participant', { replace: true });
  }, [navigate]);

  const sessionStatusLabel = proctor.isActive ? 'Session active'
    : submitting ? 'Preparing secure session'
    : 'Session not started';
  const sessionStatusDot = proctor.isActive ? T.green
    : submitting ? T.amber
    : T.muted;

  return (
    <div
      className="preexam flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: T.bg, color: T.text }}
    >
      <TopBar statusLabel={sessionStatusLabel} statusDot={sessionStatusDot} />

      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: 'minmax(0, 42fr) minmax(0, 58fr)',
          height: 'calc(100vh - 48px)',
        }}
      >
        <LeftPanel
          quizTitle={quizData?.title}
          numQuestions={quizData?.questions?.length ?? quizData?.numQuestions ?? null}
          timeLimit={quizData?.timeLimit ?? null}
          cameraStream={proctorMedia.stream}
          cameraGranted={proctorMedia.cameraGranted}
        />
        <RightPanel
          items={items}
          passedCount={passedCount}
          submitting={submitting}
          stuck={stuck}
          error={error || proctor.errorMessage}
          requiredPass={requiredPass}
          quizId={quizId}
          onBegin={handleBegin}
          onRetry={handleRetry}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Top bar
// ──────────────────────────────────────────────────────────────────────
function TopBar({ statusLabel, statusDot }) {
  return (
    <header
      className="sticky top-0 z-50 flex h-12 items-center justify-between px-6"
      style={{
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-7 w-7 items-center justify-center text-[13px] font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${T.indigo} 0%, ${T.indigoDim} 100%)`,
            borderRadius: 7,
            boxShadow: '0 0 0 1px rgba(13,148,136,0.3), 0 4px 16px rgba(13,148,136,0.25)',
          }}
          aria-hidden
        >
          W
        </span>
        <span className="text-[14px] font-semibold tracking-tight" style={{ color: T.text }}>
          WAVE INIT
        </span>
        <span style={{ color: T.muted }} aria-hidden>·</span>
        <span className="text-[12px] font-medium uppercase tracking-[0.2em]" style={{ color: T.subtle }}>
          Proctored Exam
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2">
          <span
            className="status-pulse absolute inline-flex h-full w-full rounded-full"
            style={{ background: statusDot }}
            aria-hidden
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: statusDot }}
            aria-hidden
          />
        </span>
        <span className="mono text-[13px] font-medium" style={{ color: T.subtle }}>
          {statusLabel}
        </span>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Left panel (eyebrow / title / orb / rules)
// ──────────────────────────────────────────────────────────────────────
function LeftPanel({ quizTitle, numQuestions, timeLimit, cameraStream, cameraGranted }) {
  const camRef = useRef(null);
  useEffect(() => {
    if (camRef.current && cameraStream) {
      camRef.current.srcObject = cameraStream;
      camRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

  return (
    <aside
      className="hidden flex-col justify-between overflow-hidden lg:flex"
      style={{
        background: T.bg,
        padding: 48,
        borderRight: `1px solid ${T.border}`,
      }}
    >
      {/* TOP — eyebrow + title + subtitle */}
      <header className="fade-in">
        <p
          className="text-[11px] font-semibold uppercase"
          style={{ color: T.indigo, letterSpacing: '0.2em' }}
        >
          AI Generated
        </p>
        <h1
          className="display mt-3 text-[36px] font-semibold tracking-tight"
          style={{
            color: T.text, lineHeight: 1.15, maxWidth: 380,
            display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
            wordBreak: 'break-word',
          }}
          title={quizTitle || 'AI Generated Quiz'}
        >
          {quizTitle || 'AI Generated Quiz'}
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: T.subtle }}>
          Your secure examination environment is being prepared. Complete the
          readiness checks on the right to begin.
        </p>
      </header>

      {/* MIDDLE — orb visual + camera preview + stat chips */}
      <div className="flex flex-col items-center justify-center py-2">
        <Orb />
        {/* Camera preview */}
        {cameraStream && (
          <div
            className="mt-6 overflow-hidden rounded-2xl border-2 border-zinc-700 bg-black shadow-2xl"
            style={{ width: 200, height: 150 }}
          >
            <video
              ref={camRef}
              muted
              playsInline
              className="h-full w-full scale-x-[-1] object-cover"
            />
          </div>
        )}
        {cameraGranted && !cameraStream && (
          <div
            className="mt-4 flex items-center gap-2 rounded-full px-3 py-1 text-[12px]"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.green }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Camera access granted
          </div>
        )}
        <div className="mt-6 flex items-center gap-2">
          <Chip icon={Clock}>
            {timeLimit != null ? `${timeLimit} min` : '— min'}
          </Chip>
          <Chip icon={FileText}>
            {numQuestions != null ? `${numQuestions} Qs` : '— Qs'}
          </Chip>
          <Chip icon={ShieldCheck}>Proctored</Chip>
        </div>
      </div>

      {/* BOTTOM — fine-print rules list */}
      <section className="fade-in" style={{ animationDelay: '120ms' }}>
        <p
          className="text-[11px] font-semibold uppercase"
          style={{ color: T.subtle, letterSpacing: '0.2em' }}
        >
          Before you begin
        </p>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed" style={{ color: T.subtle }}>
          <Rule>Stay in fullscreen the entire session.</Rule>
          <Rule>Tab switching, copy/paste, and dev-tools are blocked.</Rule>
          <Rule>3 fullscreen exits trigger automatic submission.</Rule>
          <Rule>Your screen is monitored by your instructor.</Rule>
          <Rule>Camera and microphone feeds are recorded for proctoring.</Rule>
          <Rule>Answers autosave continuously to the server.</Rule>
        </ul>
      </section>
    </aside>
  );
}

function Orb() {
  return (
    <div className="relative" style={{ width: 240, height: 240 }}>
      {/* Outermost ring (240px) */}
      <div
        className="orb-ring-2 absolute"
        style={{
          inset: 0,
          borderRadius: '50%',
          border: `1px solid rgba(13,148,136,0.10)`,
        }}
        aria-hidden
      />
      {/* Outer ring (200px) */}
      <div
        className="orb-ring-1 absolute"
        style={{
          inset: 20,
          borderRadius: '50%',
          border: `1px solid rgba(13,148,136,0.20)`,
        }}
        aria-hidden
      />
      {/* Core (160px) */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          inset: 40,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 25%, ${T.indigoDim} 0%, #1e1b4b 100%)`,
          boxShadow: '0 0 60px rgba(13,148,136,0.30), 0 0 0 1px rgba(13,148,136,0.35) inset',
        }}
      >
        <ShieldCheck size={64} color="#ffffff" strokeWidth={1.6} />
      </div>
    </div>
  );
}

function Chip({ icon: Icon, children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]"
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        color: T.subtle,
      }}
    >
      <Icon size={12} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

function Rule({ children }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full"
        style={{ background: T.indigo }}
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Right panel (checklist + sticky footer)
// ──────────────────────────────────────────────────────────────────────
function RightPanel({
  items, passedCount, submitting, stuck, error,
  requiredPass, quizId, onBegin, onRetry, onCancel,
}) {
  return (
    <main
      className="flex flex-col"
      style={{
        background: T.surface,
        height: 'calc(100vh - 48px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: '32px 48px 20px' }}
      >
        <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: T.text }}>
          Readiness Checklist
        </h2>
        <span
          className="mono inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold"
          style={{
            background: 'rgba(13,148,136,0.15)',
            color: T.indigo,
            border: '1px solid rgba(13,148,136,0.30)',
          }}
        >
          {passedCount} <span style={{ color: 'rgba(13,148,136,0.6)' }}>/</span> {items.length} verified
        </span>
      </div>

      {/* Checklist */}
      <div
        className="scrollbar-hide flex-1 overflow-y-auto"
        style={{ padding: '0 48px 24px' }}
      >
        <div className="flex flex-col gap-3">
          {items.map((it, i) => (
            <ChecklistCard
              key={it.key}
              index={i}
              label={it.label}
              hint={it.hint}
              state={it.state}
              icon={it.icon}
            />
          ))}
        </div>

        {/* Inline error / warning */}
        <AnimatePresence>
          {!submitting && error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3.5 text-[13px]"
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.35)',
                boxShadow: '0 0 16px rgba(245,158,11,0.10)',
                color: '#fcd34d',
              }}
              role="alert"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: T.amber }} />
              <div className="min-w-0">
                <p className="font-semibold leading-tight" style={{ color: '#fbbf24' }}>
                  Secure session initialization pending
                </p>
                <p className="mt-1 leading-relaxed" style={{ color: '#fcd34d', opacity: 0.85 }}>
                  Fullscreen verification will complete when the exam starts. Complete all checks above and click Begin.
                </p>
              </div>
            </motion.div>
          )}
          {stuck && submitting && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-[13px]"
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.35)',
                boxShadow: '0 0 16px rgba(245,158,11,0.10)',
                color: '#fcd34d',
              }}
              role="alert"
            >
              <span className="leading-relaxed">This is taking longer than expected. Try again?</span>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition"
                style={{ background: 'transparent', border: '1px solid rgba(245,158,11,0.45)', color: '#fcd34d' }}
              >
                <RefreshCw size={12} /> Retry
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky footer (consent + Cancel + Begin) */}
      <StickyFooter
        submitting={submitting}
        disabled={!requiredPass || !quizId || submitting}
        onBegin={onBegin}
        onCancel={onCancel}
      />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Checklist card
// ──────────────────────────────────────────────────────────────────────
function ChecklistCard({ index, label, hint, state, icon: Icon }) {
  // Track entry into COMPLETE for the brief flash animation
  const wasCompleteRef = useRef(state === COMPLETE);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!wasCompleteRef.current && state === COMPLETE) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 700);
      wasCompleteRef.current = true;
      return () => clearTimeout(id);
    }
    if (state !== COMPLETE) wasCompleteRef.current = false;
  }, [state]);

  const palette = {
    [COMPLETE]: {
      border: 'rgba(34,197,94,0.40)',
      bg: 'rgba(34,197,94,0.05)',
      iconBg: '#14532d',
      iconBorder: '1px solid #22c55e',
      iconColor: '#ffffff',
      title: T.text,
      hint: '#4ade80',
    },
    [PENDING]: {
      border: 'rgba(13,148,136,0.30)',
      bg: 'rgba(13,148,136,0.05)',
      iconBg: 'rgba(13,148,136,0.20)',
      iconBorder: 'none',
      iconColor: T.indigo,
      title: T.text,
      hint: T.indigo,
    },
    [ACTION]: {
      border: 'rgba(13,148,136,0.30)',
      bg: 'rgba(13,148,136,0.05)',
      iconBg: 'rgba(13,148,136,0.20)',
      iconBorder: 'none',
      iconColor: T.indigo,
      title: T.text,
      hint: T.indigo,
    },
    [ERROR]: {
      border: 'rgba(239,68,68,0.40)',
      bg: 'rgba(239,68,68,0.05)',
      iconBg: '#7f1d1d',
      iconBorder: '1px solid #ef4444',
      iconColor: '#ffffff',
      title: '#fca5a5',
      hint: '#f87171',
    },
  }[state];

  return (
    <div
      className={`fade-in flex items-center gap-4 transition-all ${flash ? 'flash-complete' : ''}`}
      style={{
        animationDelay: `${index * 80}ms`,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: '16px 20px',
        transition: 'border-color 200ms ease, background-color 200ms ease',
      }}
    >
      {/* Icon circle */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center"
        style={{
          background: palette.iconBg,
          border: palette.iconBorder !== 'none' ? palette.iconBorder : 'none',
          borderRadius: '50%',
          color: palette.iconColor,
        }}
        aria-hidden
      >
        {state === COMPLETE && <Check size={16} strokeWidth={3} />}
        {state === ERROR && <IconX size={16} strokeWidth={3} />}
        {state === PENDING && (
          <span
            className="block h-4 w-4 animate-spin rounded-full"
            style={{
              border: `2px solid ${T.indigo}`,
              borderTopColor: 'transparent',
            }}
            aria-hidden
          />
        )}
        {state === ACTION && <Icon size={16} />}
      </span>

      {/* Title + hint */}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight" style={{ color: palette.title }}>
          {label}
        </p>
        <p
          className="mt-0.5 text-[13px] leading-snug"
          style={{
            color: palette.hint,
            fontStyle: state === ACTION || state === PENDING ? 'italic' : 'normal',
          }}
        >
          {hint}
        </p>
      </div>

      {/* Right-side affordance */}
      {state === ACTION && (
        <span
          className="ml-auto shrink-0 text-[13px] font-medium"
          style={{ color: T.indigo }}
        >
          Action required →
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sticky footer
// ──────────────────────────────────────────────────────────────────────
function StickyFooter({ submitting, disabled, onBegin, onCancel }) {
  return (
    <footer
      className="relative"
      style={{
        background: T.surface,
        borderTop: `1px solid ${T.border}`,
        padding: '24px 48px',
      }}
    >
      {/* Top fade so scrolling content blends into the footer */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0"
        style={{
          bottom: '100%',
          height: 40,
          background: `linear-gradient(to top, ${T.surface}, rgba(24,24,27,0))`,
        }}
      />

      <p
        className="mb-4 flex items-center justify-center gap-1.5 text-[13px]"
        style={{ color: T.subtle }}
      >
        <Info size={13} aria-hidden />
        <span>By starting, you agree to monitoring for the full session.</span>
      </p>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="text-[15px] font-medium transition-colors"
          style={{ color: T.subtle, background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.subtle; }}
        >
          Cancel
        </button>

        <BeginButton submitting={submitting} disabled={disabled} onClick={onBegin} />
      </div>
    </footer>
  );
}

function BeginButton({ submitting, disabled, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      transition={{ duration: 0.15 }}
      className="inline-flex items-center gap-2 text-[15px] font-semibold text-white"
      style={{
        background: disabled
          ? 'rgba(13,148,136,0.15)'
          : `linear-gradient(135deg, #0D9488 0%, #0F766E 100%)`,
        padding: '12px 28px',
        borderRadius: 10,
        border: disabled ? '1px solid rgba(13,148,136,0.20)' : '1px solid rgba(13,148,136,0.5)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        color: disabled ? 'rgba(255,255,255,0.4)' : '#ffffff',
        boxShadow: disabled
          ? 'none'
          : '0 0 0 1px rgba(13,148,136,0.5), 0 4px 24px rgba(13,148,136,0.45), 0 0 40px rgba(13,148,136,0.20)',
        transition: 'box-shadow 200ms ease, opacity 200ms ease, background 200ms ease',
      }}
    >
      {submitting ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Starting exam…
        </>
      ) : (
        <>
          <ShieldCheck size={16} />
          Begin Secure Exam
          <ArrowRight size={16} />
        </>
      )}
    </motion.button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Top-level route component
// ──────────────────────────────────────────────────────────────────────
export default function PreExamReadiness() {
  // quizId comes ONLY from useParams — accept :quizId or :examId
  const params = useParams();
  const quizIdParam = params.quizId ?? params.examId;
  const quizId = Number(quizIdParam);

  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, ready } = useAuthUser();

  // Direct landing without router state → return to dashboard so the
  // existing /api/ai-quiz/participant/start endpoint can run first.
  useEffect(() => {
    if (ready && (!state?.attemptId || !quizIdParam)) {
      navigate('/participant', { replace: true });
    }
  }, [ready, state?.attemptId, quizIdParam, navigate]);

  // Render guards (no hooks below this point)
  if (!ready) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ background: T.bg }}
      >
        <div
          className="h-9 w-9 animate-spin rounded-full"
          style={{ border: `2px solid ${T.muted}`, borderTopColor: T.indigo }}
        />
      </div>
    );
  }
  if (!user?.id) return <Navigate to="/login" replace />;
  if (!state?.attemptId || !quizIdParam) return null; // useEffect redirects

  return (
    <ProctorProvider>
      <PreExamInner
        quizId={quizId}
        attemptId={state.attemptId}
        quizData={state.quizData}
      />
    </ProctorProvider>
  );
}
