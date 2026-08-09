/**
 * StatusStrip Component
 * Persistent status bar showing device connection, camera, screen share, and recording status.
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
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
      active
        ? 'bg-primary-50 text-primary-700 border border-primary-200'
        : 'bg-surface-100 text-surface-500 border border-surface-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary-600' : 'bg-surface-400'}`} />
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  )

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border-b border-surface-200 flex-wrap ${className}`}>
      <StatusIndicator label="Laptop" active={devices.laptop} icon="💻" />
      <StatusIndicator label="Mobile" active={devices.mobile} icon="📱" />
      <div className="w-px h-4 bg-surface-200" />
      <StatusIndicator label="Camera" active={isCameraActive} icon="📹" />
      <StatusIndicator label="Screen Share" active={isScreenSharing} icon="🖥️" />
      <StatusIndicator label="Recording" active={isRecording} icon="⏺️" />
      {alertCount > 0 && (
        <>
          <div className="w-px h-4 bg-surface-200" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-danger-50 text-danger-600 border border-danger-200">
            <span>⚠️</span>
            <span>{alertCount} Alert{alertCount !== 1 ? 's' : ''}</span>
          </div>
        </>
      )}
    </div>
  )
}
