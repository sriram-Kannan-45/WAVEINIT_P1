/**
 * VideoTile Component
 * Renders a video stream tile with label overlay and expand/collapse behavior.
 * Dark theme for video interview context.
 */
import { useRef, useEffect } from 'react'
import { Video } from 'lucide-react'

const reportVideoState = (video, onVideoState) => {
  const ready = video && video.videoWidth > 2 && video.videoHeight > 2 && video.readyState >= 2
  onVideoState?.({
    hasStream: !!video?.srcObject,
    videoWidth: video?.videoWidth || 0,
    videoHeight: video?.videoHeight || 0,
    readyState: video?.readyState || 0,
    ready,
  })
}

export default function VideoTile({
  stream,
  label,
  isLocal = false,
  isExpanded = false,
  onToggleExpand,
  isMuted = false,
  isScreenShare = false,
  className = '',
  style = {},
  onVideoState,
}) {
  const videoRef = useRef(null)
  const onVideoStateRef = useRef(onVideoState)

  useEffect(() => {
    onVideoStateRef.current = onVideoState
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const reportState = () => reportVideoState(video, onVideoStateRef.current)
    video.addEventListener('loadedmetadata', reportState)
    video.addEventListener('loadeddata', reportState)
    video.addEventListener('resize', reportState)
    video.addEventListener('playing', reportState)

    if (stream) {
      if (video.srcObject !== stream) {
        console.log(`[WEBRTC MAIN STAGE] Attaching stream to ${label}:`, {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          tracks: stream.getTracks().map(t => ({
            kind: t.kind,
            label: t.label,
            readyState: t.readyState,
          })),
        })
        video.srcObject = stream
      }

      const attemptPlay = () => {
        if (!video) return
        const playPromise = video.play()
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(() => {
            console.log(`[WEBRTC MAIN STAGE] srcObject set (${label}):`, {
              hasStream: !!video.srcObject,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              readyState: video.readyState,
              paused: video.paused,
            })
            reportState()
          }).catch((e) => {
            if (e.name !== 'AbortError') {
              console.warn(`[VideoTile] ${label} auto-play error, trying muted play:`, e.message)
              video.muted = true
              video.play().catch(err => console.warn(`[VideoTile] ${label} muted play error:`, err.message))
            }
          })
        }
      }

      attemptPlay()

      const onLoadedMetadata = () => {
        console.log(`[WEBRTC MAIN STAGE] ✅ ${label} video ready:`, {
          hasStream: !!video.srcObject,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
        })
        reportState()
        attemptPlay()
      }

      video.addEventListener('loadedmetadata', onLoadedMetadata)
      const t1 = setTimeout(attemptPlay, 1000)
      const t2 = setTimeout(attemptPlay, 3500)

      return () => {
        if (video) {
          video.removeEventListener('loadedmetadata', onLoadedMetadata)
          video.removeEventListener('loadedmetadata', reportState)
          video.removeEventListener('loadeddata', reportState)
          video.removeEventListener('resize', reportState)
          video.removeEventListener('playing', reportState)
        }
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }

    return () => {
      video.removeEventListener('loadedmetadata', reportState)
      video.removeEventListener('loadeddata', reportState)
      video.removeEventListener('resize', reportState)
      video.removeEventListener('playing', reportState)
    }
  }, [stream, label, isLocal])

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-lg transition-all duration-300 aspect-video ${
        isExpanded ? 'col-span-2 row-span-2 z-10' : ''
      } ${className}`}
      onClick={onToggleExpand}
      style={{ cursor: onToggleExpand ? 'pointer' : 'default', width: '100%', height: '100%', ...style }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isMuted}
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
