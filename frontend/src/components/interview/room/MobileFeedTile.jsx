/**
 * MobileFeedTile Component (Trainer View)
 * Renders the participant's mobile camera feed with a REAL video-health badge:
 *   - '● Live'                   green  — real frames decoding
 *                                     (videoWidth > 2, videoHeight > 2, readyState >= 2)
 *   - '◐ Connecting camera...'   amber  — stream attached, awaiting first decoded frame
 *   - '✕ Camera unavailable'     red    — media element error / remote track ended
 *   - '○ Not Paired'             slate  — no remote stream yet
 * The badge is never shown as "live" unless an actual video frame has been
 * decoded by the <video> element — it does not rely on stream presence alone.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Smartphone } from 'lucide-react'

const HEALTH = {
  LIVE: 'live',
  CONNECTING: 'connecting',
  UNAVAILABLE: 'unavailable',
  NOT_PAIRED: 'not-paired',
}

const BADGE_STYLES = {
  [HEALTH.LIVE]:         { bg: '#dcfce7', color: '#15803D', border: '#bbf7d0', text: '● Live' },
  [HEALTH.CONNECTING]:   { bg: '#fef3c7', color: '#d97706', border: '#fcd34d', text: '◐ Connecting camera...' },
  [HEALTH.UNAVAILABLE]:  { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', text: '✕ Camera unavailable' },
  [HEALTH.NOT_PAIRED]:   { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', text: '○ Not Paired' },
}

const isVideoHealthy = (video) =>
  !!video && video.videoWidth > 2 && video.videoHeight > 2 && video.readyState >= 2

const PLACEHOLDER_TEXT = {
  [HEALTH.LIVE]: 'Mobile camera connected.',
  [HEALTH.CONNECTING]: 'Mobile camera paired. Establishing video stream...',
  [HEALTH.UNAVAILABLE]: 'Mobile camera unavailable. Ask the participant to reopen the mobile page.',
  [HEALTH.NOT_PAIRED]: 'Waiting for participant to scan QR code on their laptop screen...',
}

export default function MobileFeedTile({ stream, name = 'Participant', onStatusChange }) {
  const videoRef = useRef(null)
  const liveLoggedRef = useRef(false)
  const [health, setHealth] = useState(HEALTH.NOT_PAIRED)
  const [dimensions, setDimensions] = useState(null)

  const report = useCallback((h, dims) => {
    setHealth(h)
    setDimensions(dims)
    onStatusChange?.(h)
  }, [onStatusChange])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!stream) {
      liveLoggedRef.current = false
      report(HEALTH.NOT_PAIRED, null)
      return
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }

    video.muted = true

    console.log('[MOBILE FEED PANEL] srcObject', {
      hasStream: !!video.srcObject,
      trackKinds: video.srcObject?.getTracks().map(t => t.kind),
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      paused: video.paused,
    })

    report(HEALTH.CONNECTING, null)

    const evaluate = () => {
      if (!video) return
      console.log('[MOBILE FEED PANEL] evaluate status', {
        hasStream: !!video.srcObject,
        trackKinds: video.srcObject?.getTracks().map(t => t.kind),
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
      })
      if (isVideoHealthy(video)) {
        if (!liveLoggedRef.current) {
          console.log(`[WEBRTC REMOTE] MobileFeedTile: VIDEO LIVE ${video.videoWidth}x${video.videoHeight} (${name})`)
          liveLoggedRef.current = true
        }
        report(HEALTH.LIVE, `${video.videoWidth}x${video.videoHeight}`)
      } else {
        report(HEALTH.CONNECTING, null)
      }
    }

    const attemptPlay = () => {
      if (!video) return
      video.muted = true
      const playPromise = video.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn(`[MOBILE FEED PANEL] play() retry error (${name}):`, err.message)
          }
        })
      }
      evaluate()
    }

    const onError = () => {
      console.warn(`[WEBRTC REMOTE] MobileFeedTile media error (${name}):`, video.error?.message || 'unknown error')
      report(HEALTH.UNAVAILABLE, null)
    }

    const onTrackEnded = () => {
      console.warn(`[WEBRTC REMOTE] MobileFeedTile remote video track ended (${name})`)
      report(HEALTH.UNAVAILABLE, null)
    }

    video.addEventListener('loadedmetadata', attemptPlay)
    video.addEventListener('loadeddata', attemptPlay)
    video.addEventListener('resize', evaluate)
    video.addEventListener('playing', evaluate)
    video.addEventListener('error', onError)

    const track = stream.getVideoTracks?.()[0]
    if (track) track.addEventListener('ended', onTrackEnded)

    attemptPlay()

    const t1 = setTimeout(attemptPlay, 1000)
    const t2 = setTimeout(attemptPlay, 3000)

    return () => {
      video.removeEventListener('loadedmetadata', attemptPlay)
      video.removeEventListener('loadeddata', attemptPlay)
      video.removeEventListener('resize', evaluate)
      video.removeEventListener('playing', evaluate)
      video.removeEventListener('error', onError)
      if (track) track.removeEventListener('ended', onTrackEnded)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [stream, name, report])

  const badge = BADGE_STYLES[health]

  return (
    <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
          Participant Mobile Feed
        </h4>
        <span className="reg-admin-status" style={{
          background: badge.bg,
          color: badge.color,
          borderColor: badge.border,
          fontSize: 10,
          padding: '2px 8px',
        }}>
          {badge.text}
        </span>
      </div>
      <div style={{
        width: '100%',
        aspectRatio: '4/3',
        background: '#0f172a',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: health === HEALTH.LIVE ? 'block' : 'none' }}
        />
        {health !== HEALTH.LIVE && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: '#94a3b8' }}>
              <Smartphone size={22} />
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
              {PLACEHOLDER_TEXT[health]}
            </p>
          </div>
        )}
        {dimensions && health === HEALTH.LIVE && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#4ade80', fontSize: 10, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4 }}>
            {dimensions}
          </div>
        )}
      </div>
    </div>
  )
}
