/**
 * VideoTile Component
 * Renders a video stream tile with label overlay and expand/collapse behavior.
 * Dark theme for video interview context.
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
      className={`relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-lg transition-all duration-300 aspect-video ${
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
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
      />

      {/* Gradient overlay at bottom for label readability */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Label overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between z-10">
        <span className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded-md text-white text-xs font-medium truncate max-w-[70%]">
          {label || 'Unknown'}
        </span>
        {isScreenShare && (
          <span className="px-2 py-0.5 bg-violet-500/80 backdrop-blur-sm rounded-md text-white text-xs font-medium">
            Screen
          </span>
        )}
      </div>

      {/* No stream placeholder */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-slate-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-slate-400 text-xs">{label || 'No Feed'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
