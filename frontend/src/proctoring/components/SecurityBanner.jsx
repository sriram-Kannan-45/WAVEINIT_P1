/**
 * SecurityBanner — pins a high-security visual indicator to the top of the viewport.
 * Shows active restrictions and live category violation counters.
 */
import React from 'react';
import { ShieldAlert, Maximize, RefreshCw, Files, Eye, Cpu, MonitorOff } from 'lucide-react';
import { useProctor } from '../ProctorContext';

export default function SecurityBanner() {
  const proctor = useProctor();
  const session = proctor.session;

  if (!proctor.isActive) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] border-b border-rose-200 bg-rose-50/95 shadow-sm backdrop-blur-md px-4 py-2 text-rose-900 transition-all select-none">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-rose-700">
          <ShieldAlert className="h-4 w-4 animate-pulse text-rose-600" />
          <span>🔒 Secure Assessment Mode Enabled</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium text-rose-800">
          <span className="flex items-center gap-1">
            <Maximize className="h-3 w-3" /> Fullscreen: <strong>{proctor.fullscreenViolations}/3</strong>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> Tab Switches: <strong>{proctor.tabSwitchViolations}/3</strong>
          </span>
          <span className="flex items-center gap-1">
            <MonitorOff className="h-3 w-3" /> Focus Blurs: <strong>{proctor.windowBlurViolations}/3</strong>
          </span>
          <span className="flex items-center gap-1">
            <Files className="h-3 w-3" /> Copy/Paste: <strong>Blocked</strong>
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" /> DevTools: <strong>{proctor.devToolsViolations}/3</strong>
          </span>
          <span className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" /> Screenshots: <strong>{proctor.screenshotViolations}/3</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
            Warnings: {proctor.warningsCount}/5
          </span>
          {session?.isOnline ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Online
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800 animate-pulse">
              Offline
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
