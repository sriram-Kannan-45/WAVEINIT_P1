/**
 * StatusStrip Component
 * Persistent status bar showing device connection, camera, screen share, and recording status.
 * Dark theme matching the interview UI.
 */
import { AlertTriangle, Laptop, MonitorUp, Smartphone, Video } from 'lucide-react'

export default function StatusStrip({
  devices,
  isCameraActive,
  isScreenSharing,
  isRecording,
  alertCount = 0,
  className = '',
}) {
  const StatusIndicator = ({ label, active, icon }) => (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
      active
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-slate-800 text-slate-500 border border-slate-700/50'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full transition-all ${active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600'}`} />
      <span className="text-xs">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  )

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700/50 flex-wrap ${className}`}>
      <StatusIndicator
        label="Laptop"
        active={devices.laptop}
        icon={<Laptop size={14} />}
      />
      <StatusIndicator
        label="Mobile"
        active={devices.mobile}
        icon={<Smartphone size={14} />}
      />
      <div className="w-px h-4 bg-slate-700" />
      <StatusIndicator
        label="Camera"
        active={isCameraActive}
        icon={<Video size={14} />}
      />
      <StatusIndicator
        label="Screen Share"
        active={isScreenSharing}
        icon={<MonitorUp size={14} />}
      />
      <StatusIndicator
        label="Recording"
        active={isRecording}
        icon={
          isRecording ? (
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full border-2 border-current" />
          )
        }
      />
      {alertCount > 0 && (
        <>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle size={14} />
            <span className="hidden sm:inline">{alertCount} Alert{alertCount !== 1 ? 's' : ''}</span>
            <span className="sm:hidden">{alertCount}</span>
          </div>
        </>
      )}
    </div>
  )
}
