/**
 * VideoTile Component
 * Renders a video stream tile with label overlay and expand/collapse behavior.
 * Dark theme for video interview context.
 */
import { useRef, useEffect } from 'react'
import { Video } from 'lucide-react'

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
      console.log(`[VideoTile] Attaching stream to ${label}:`, {
        streamId: stream.id,
        trackCount: stream.getTracks().length,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          readyState: t.readyState,
        })),
      })
      videoRef.current.srcObject = stream
      videoRef.current.play().catch((e) => {
        console.warn(`[VideoTile] ${label} auto-play error:`, e.message)
      })

      const onLoadedMetadata = () => {
        console.log(`[VideoTile] ✅ ${label} video ready:`, {
          videoWidth: videoRef.current.videoWidth,
          videoHeight: videoRef.current.videoHeight,
        })
      }
      videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata)

      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('loadedmetadata', onLoadedMetadata)
        }
      }
    }
  }, [stream, label])

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
          <span className="px-2 py-0.5 bg-primary-500/80 backdrop-blur-sm rounded-md text-white text-xs font-medium">
            Screen
          </span>
        )}
      </div>

      {/* No stream placeholder */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-slate-700 flex items-center justify-center">
              <Video size={22} className="text-slate-500" />
            </div>
            <span className="text-slate-400 text-xs">{label || 'No Feed'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
