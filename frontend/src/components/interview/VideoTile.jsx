/**
 * VideoTile Component
 * Renders a video stream tile with label overlay and expand/collapse behavior.
 */
import { useRef, useEffect } from 'react'

export default function VideoTile({
  stream,
  label,
  isLocal = false,
  isExpanded = false,
  onToggleExpand,
  isMuted = false,
  isScreenShare = false,
  className = '',
}) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-surface-900 border border-surface-200 shadow-card transition-all duration-300 ${
        isExpanded ? 'col-span-2 row-span-2 z-10' : ''
      } ${className}`}
      onClick={onToggleExpand}
      style={{ cursor: onToggleExpand ? 'pointer' : 'default' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-cover"
        style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
      />

      {/* Label overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-white text-xs font-medium truncate">
          {label || 'Unknown'}
        </span>
        {isScreenShare && (
          <span className="px-2 py-1 bg-primary-600/80 backdrop-blur-sm rounded-lg text-white text-xs font-medium">
            Screen Share
          </span>
        )}
      </div>

      {/* No stream placeholder */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-100">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-white border border-surface-200 flex items-center justify-center shadow-card">
              <svg className="w-8 h-8 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-surface-500 text-xs">{label || 'No Feed'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
