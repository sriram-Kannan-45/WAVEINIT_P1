import { useCallback, useEffect, useRef, useState } from 'react'

const isLive = stream => typeof MediaStream !== 'undefined' && stream instanceof MediaStream &&
  stream.getVideoTracks().some(track => track.readyState === 'live')

// Own the camera at the monitoring surface, not in parent render callbacks.
export function useAssessmentCamera(externalStream, onReady) {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [generation, setGeneration] = useState(0)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const retry = useCallback(() => setGeneration(value => value + 1), [])

  useEffect(() => {
    let cancelled = false, owned = false, camera = null, watchdog = null
    let restarting = false
    const recover = () => {
      if (cancelled || restarting) return
      restarting = true
      retry()
    }
    setError(null)
    setStream(null)
    const start = async () => {
      try {
        owned = !isLive(externalStream)
        camera = owned ? await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 15, max: 20 } },
          audio: false,
        }) : externalStream
        if (cancelled) { if (owned) camera.getTracks().forEach(track => track.stop()); return }
        if (!isLive(camera)) throw new Error('The camera did not provide a live video track.')
        camera.getVideoTracks().forEach(track => track.addEventListener('ended', recover))
        watchdog = setInterval(() => { if (!isLive(camera)) recover() }, 1000)
        setStream(camera)
        onReadyRef.current?.(camera)
      } catch (err) {
        if (!cancelled) setError(err.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access and retry.'
          : 'Camera disconnected or unavailable. Reconnect it and retry.')
      }
    }
    start()
    return () => {
      cancelled = true
      clearInterval(watchdog)
      camera?.getVideoTracks().forEach(track => track.removeEventListener('ended', recover))
      if (owned) camera?.getTracks().forEach(track => track.stop())
    }
  }, [externalStream, generation, retry])

  return { stream, error, retry }
}
