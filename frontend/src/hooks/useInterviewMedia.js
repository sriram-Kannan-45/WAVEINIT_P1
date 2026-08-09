/**
 * useInterviewMedia Hook
 * Single source of truth for the local camera/microphone stream shared across
 * the interview room flow (invitation → device check → waiting → live room).
 *
 * Responsibilities:
 *  - Request camera + mic exactly once and keep the stream in localStreamRef
 *  - Surface a machine-readable mediaState + human mediaError
 *  - Mute / unmute, camera on/off, full cleanup on leave/unmount
 *
 * The optional onLocalStream callback receives every freshly acquired stream so
 * callers can register it with the WebRTC layer / shared context.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function mapMediaError(err) {
  const name = err?.name
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || err?.message === 'UNAVAILABLE') {
    return 'Camera and microphone are not available in this browser, or this page is not served over a secure connection (HTTPS or localhost).'
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera and microphone access was denied. Allow both in your browser, then try again.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone was found on this device.'
  }
  if (name === 'NotReadableError') {
    return 'Camera or microphone is in use by another application. Close it and try again.'
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'No camera matching the requested settings was found.'
  }
  if (err?.message === 'IN_USE') {
    return 'Camera or microphone is already in use. Close the other application and try again.'
  }
  return 'Camera and microphone are not ready. Please check your devices and try again.'
}

export function useInterviewMedia({ onLocalStream } = {}) {
  const localStreamRef = useRef(null)
  const onLocalStreamRef = useRef(onLocalStream)

  const [mediaState, setMediaState] = useState('idle') // idle | requesting | ready | error
  const [mediaError, setMediaError] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)

  useEffect(() => { onLocalStreamRef.current = onLocalStream }, [onLocalStream])

  const startLocalMedia = useCallback(async (opts = {}) => {
    if (localStreamRef.current) return localStreamRef.current
    setMediaState('requesting')
    setMediaError(null)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw Object.assign(new Error('UNAVAILABLE'), { name: 'UnavailableError' })
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
        ...opts,
      })
      localStreamRef.current = stream
      onLocalStreamRef.current?.(stream)
      setIsMuted(false)
      setIsCameraOff(false)
      setMediaState('ready')
      return stream
    } catch (err) {
      setMediaError(mapMediaError(err))
      setMediaState('error')
      return null
    }
  }, [])

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setMediaState('idle')
  }, [])

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const nextMuted = !isMuted
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !nextMuted })
    setIsMuted(nextMuted)
  }, [isMuted])

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return
    const nextOff = !isCameraOff
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !nextOff })
    setIsCameraOff(nextOff)
  }, [isCameraOff])

  const resetMediaError = useCallback(() => {
    setMediaError(null)
    setMediaState('idle')
  }, [])

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
  }, [])

  return {
    localStreamRef,
    mediaState,
    mediaError,
    isMuted,
    isCameraOff,
    startLocalMedia,
    stopLocalMedia,
    toggleMute,
    toggleCamera,
    resetMediaError,
  }
}

export default useInterviewMedia
