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
        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
        : 'bg-gray-700/30 text-gray-400 border border-gray-700/20'
    }`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  )

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-gray-800/60 backdrop-blur-sm border-b border-gray-700/50 flex-wrap ${className}`}>
      <StatusIndicator label="Laptop" active={devices.laptop} icon="💻" />
      <StatusIndicator label="Mobile" active={devices.mobile} icon="📱" />
      <div className="w-px h-4 bg-gray-700" />
      <StatusIndicator label="Camera" active={isCameraActive} icon="📹" />
      <StatusIndicator label="Screen Share" active={isScreenSharing} icon="🖥️" />
      <StatusIndicator label="Recording" active={isRecording} icon="⏺️" />
      {alertCount > 0 && (
        <>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            <span>⚠️</span>
            <span>{alertCount} Alert{alertCount !== 1 ? 's' : ''}</span>
          </div>
        </>
      )}
    </div>
  )
}
