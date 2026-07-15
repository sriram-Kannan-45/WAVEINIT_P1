/**
 * ParticipantMonitorCard — single tile in the trainer dashboard grid.
 *
 * Shows live screen thumbnail when observed, plus controls to
 * observe/unobserve and force-terminate.
 *
 * Theme: white surface, slate borders, blue accents.
 */
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Download, Power, Eye, EyeOff } from 'lucide-react';

import { proctorApi } from '../api';
import { GlassCard, StatusDot } from './ui';

function timeAgo(d) {
  if (!d) return '—';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 5_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function statusColor(status) {
  switch (status) {
    case 'ACTIVE':     return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'PENDING':    return 'bg-blue-50 text-blue-700 ring-blue-200';
    case 'SUBMITTED':  return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'TERMINATED': return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'EXPIRED':    return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:           return 'bg-slate-50 text-slate-600 ring-slate-200';
  }
}

export default function ParticipantMonitorCard({
  session,
  onTerminate,
  onObserve,
  onUnobserve,
  isObserved,
  liveStream,
}) {
  const p = session.participant || {};
  const maxW = session.maxWarnings || 5;
  const maxFS = session.maxFullscreenExits || 3;
  const warningPct = Math.min(100, ((session.warningsCount || 0) / maxW) * 100);
  const exitsPct = Math.min(100, ((session.fullscreenExits || 0) / maxFS) * 100);
  const liveDanger = session.warningsCount >= maxW - 1 || session.fullscreenExits >= maxFS - 1;
  const isDisconnected = !!session.disconnectedAt && !!session.gracePeriodEndsAt;
  const isGraceExpired = isDisconnected && new Date(session.gracePeriodEndsAt) < new Date();

  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && liveStream) {
      const stream = liveStream.screen || liveStream;
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [liveStream]);

  return (
    <GlassCard className="p-4">
      {/* Live screen stream or latest screenshot thumbnail */}
      {isObserved && liveStream ? (
        <div className="mb-3 overflow-hidden rounded-lg bg-black aspect-video">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-contain"
          />
        </div>
      ) : session.latestScreenshot ? (
        <div className="mb-3 overflow-hidden rounded-lg bg-slate-900 border border-slate-200 aspect-video relative group flex items-center justify-center">
          <img
            src={session.latestScreenshot}
            alt={`${p.name || 'Participant'}'s screen`}
            className="h-full w-full object-contain"
          />
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-[10px] text-white bg-slate-900/80 px-2 py-1 rounded shadow-sm uppercase tracking-wider font-semibold flex items-center gap-1">
              <Eye className="h-3 w-3" /> Latest Snapshot
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-sky-400 text-sm font-bold text-white shadow-sm">
              {p.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{p.name || 'Unknown'}</p>
              <p className="truncate text-[11px] text-slate-500">{p.email}</p>
            </div>
          </div>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${statusColor(isGraceExpired ? 'TERMINATED' : isDisconnected ? 'PENDING' : session.status)}`}>
          {isGraceExpired ? 'DISCONNECTED' : isDisconnected ? 'RECONNECTING' : session.status}
        </span>
      </div>

      {/* status pills */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
        <StatusDot ok={session.isOnline} label={session.isOnline ? 'Online' : 'Offline'} />
        <StatusDot ok={session.isFullscreen} label="FS" />
        <StatusDot ok={session.isScreenSharing} label="Share" />
        {isObserved && <StatusDot ok label="Live" />}
      </div>

      {/* meters */}
      <div className="mt-3 space-y-2">
        <Meter label="Warnings" value={session.warningsCount || 0} max={maxW} pct={warningPct} />
        <Meter label="FS exits" value={session.fullscreenExits || 0} max={maxFS} pct={exitsPct} danger />
      </div>

      {/* footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(session.lastHeartbeatAt || session.startedAt)}
        </span>
        <div className="flex gap-1.5">
          {/* Observe/Unobserve toggle */}
          {session.isScreenSharing && session.status === 'ACTIVE' && (
            <button
              onClick={() => isObserved ? onUnobserve?.(session.sessionId) : onObserve?.(session.sessionId)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${
                isObserved
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title={isObserved ? 'Stop observing' : 'Observe screen'}
            >
              {isObserved ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {isObserved ? 'Live' : 'Observe'}
            </button>
          )}

          <a
            href={proctorApi.exportLogsUrl(session.sessionId)}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
            title="Export session logs"
          >
            <Download className="h-3 w-3" /> Logs
          </a>
          {(session.status === 'ACTIVE' || session.status === 'PENDING') && (
            <button
              onClick={() => onTerminate?.(session)}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 transition hover:bg-rose-100"
              title="Force terminate"
            >
              <Power className="h-3 w-3" /> End
            </button>
          )}
        </div>
      </div>

      {/* grace period indicator */}
      {isDisconnected && (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-700">
          Disconnected — grace period until {new Date(session.gracePeriodEndsAt).toLocaleTimeString()}
        </div>
      )}

      {/* danger flash */}
      {liveDanger && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.0, 0.5, 0.0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-rose-300"
        />
      )}
    </GlassCard>
  );
}

function Meter({ label, value, max, pct, danger }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span className="uppercase tracking-wider">{label}</span>
        <span className="font-mono">{value}/{max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
          className={
            'h-full rounded-full ' +
            (danger
              ? 'bg-gradient-to-r from-amber-400 to-rose-500'
              : 'bg-gradient-to-r from-blue-500 to-sky-400')
          }
        />
      </div>
    </div>
  );
}
