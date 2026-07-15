/**
 * ProctoredExamShell — wraps any exam UI with all proctoring behaviour.
 *
 *   - Anti-cheat key/event blockers
 *   - Tab visibility / window-blur reporting
 *   - Fullscreen-exit auto-report
 *   - Synced timer overlay
 *   - Live status pills
 *   - Violation overlay
 *   - Auto-handoff to TerminatedScreen on auto-submit
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

import { useProctor } from '../ProctorContext';
import useAntiCheat from '../hooks/useAntiCheat';
import useTabVisibility from '../hooks/useTabVisibility';
import useFullscreen from '../hooks/useFullscreen';
import useNetworkStatus from '../hooks/useNetworkStatus';
import useExamTimer, { formatRemaining } from '../hooks/useExamTimer';

import ViolationOverlay from './ViolationOverlay';
import TerminatedScreen from './TerminatedScreen';
import { StatusDot } from './ui';

export default function ProctoredExamShell({ children, onTerminated, onExpire }) {
  const proctor = useProctor();
  const session = proctor.session;
  const isOnline = useNetworkStatus();

  const fs = useFullscreen({
    enabled: !!session && proctor.isActive,
    onExit: () => {
      proctor.report('FULLSCREEN_EXIT');
      proctor.pushState({ isFullscreen: false });
    },
    onEnter: () => proctor.pushState({ isFullscreen: true }),
  });

  useTabVisibility({
    enabled: proctor.isActive,
    onHidden: () => proctor.report('TAB_SWITCH'),
    onBlur: () => proctor.report('WINDOW_BLUR'),
  });

  useAntiCheat({
    enabled: proctor.isActive,
    onViolation: (type, meta) => proctor.report(type, undefined, meta),
  });

  useEffect(() => {
    if (!proctor.isActive) return;
    proctor.pushState({ isOnline });
    if (!isOnline) proctor.report('NETWORK_LOST');
  }, [isOnline, proctor.isActive]);

  const remaining = useExamTimer(session?.endsAt, {
    onExpire: () => {
      onExpire?.();
      proctor.submit().catch(() => {});
    },
  });

  useEffect(() => {
    if (proctor.isTerminated) onTerminated?.(session?.terminationReason);
  }, [proctor.isTerminated, session?.terminationReason, onTerminated]);

  const warningPct = useMemo(() => {
    return Math.min(100, ((session?.warningsCount || 0) / (session?.maxWarnings || 5)) * 100);
  }, [session?.warningsCount, session?.maxWarnings]);

  if (proctor.isTerminated) {
    return <TerminatedScreen reason={session?.terminationReason} onExit={onTerminated} />;
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40 text-slate-900">
      {/* Top status bar — always visible during exam */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Live Exam
            </span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Session #{session?.sessionId}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <StatusDot ok={fs.isFullscreen} label={fs.isFullscreen ? 'Fullscreen' : 'Windowed'} />
            <StatusDot ok={!!session?.isScreenSharing} label={session?.isScreenSharing ? 'Sharing' : 'No share'} />
            <StatusDot ok={isOnline} label={isOnline ? 'Online' : 'Offline'} />
            <span className="hidden items-center gap-1 text-slate-600 sm:flex">
              <Clock className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                {formatRemaining(remaining)}
              </span>
            </span>
          </div>
        </div>

        {/* Warning bar */}
        <div className="h-0.5 bg-slate-100">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-400 to-rose-500"
            animate={{ width: `${warningPct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </motion.header>

      {/* Mobile timer — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-30 sm:hidden">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-md">
          <Clock className="h-3.5 w-3.5 text-blue-600" />
          <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
            {formatRemaining(remaining)}
          </span>
        </div>
      </div>

      {/* Exam body */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>

      <ViolationOverlay />
    </div>
  );
}
