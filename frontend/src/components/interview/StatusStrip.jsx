/**
 * StatusStrip Component
 * Persistent status bar showing device connection, camera, screen share, and recording status.
 * Dark theme matching the interview UI.
 */
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
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />
      <StatusIndicator 
        label="Mobile" 
        active={devices.mobile} 
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        }
      />
      <div className="w-px h-4 bg-slate-700" />
      <StatusIndicator 
        label="Camera" 
        active={isCameraActive} 
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        }
      />
      <StatusIndicator 
        label="Screen Share" 
        active={isScreenSharing} 
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
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
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="hidden sm:inline">{alertCount} Alert{alertCount !== 1 ? 's' : ''}</span>
            <span className="sm:hidden">{alertCount}</span>
          </div>
        </>
      )}
    </div>
  )
}
