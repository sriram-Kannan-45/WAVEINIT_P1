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
  }, [onVideoState])

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
      className={`relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-lg transition-all duration-300 ${
        isExpanded ? 'col-span-2 row-span-2 z-10' : ''
      } ${className}`}
      onClick={onToggleExpand}
      style={{
        cursor: onToggleExpand ? 'pointer' : 'default',
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isMuted}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: isScreenShare ? 'contain' : 'cover',
          transform: isLocal ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Gradient overlay at bottom for label readability */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 48,
        background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
        pointerEvents: 'none',
      }} />

      {/* Label overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <span style={{
          padding: '2px 8px',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          borderRadius: 6,
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          maxWidth: '70%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label || 'Unknown'}
        </span>
        {isScreenShare && (
          <span style={{
            padding: '2px 8px',
            background: 'rgba(37,99,235,0.85)',
            backdropFilter: 'blur(4px)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
          }}>
            Screen
          </span>
        )}
      </div>

      {/* No stream placeholder */}
      {!stream && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1e293b',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 44,
              height: 44,
              margin: '0 auto 8px',
              borderRadius: '50%',
              background: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Video size={20} color="#94a3b8" />
            </div>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{label || 'No Feed'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
