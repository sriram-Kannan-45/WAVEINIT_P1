import { useState, useCallback, useEffect } from 'react'

// Module-level singleton so the screen share can survive route navigations.
let globalStream = null
let globalUserStream = null  // webcam + mic stream
let globalExternalStream = false // tracks if screen stream is owned externally

export default function useScreenRecorder({
  assessmentType = 'quiz',
  assessmentId,
  codingAttemptId,
  participantId,
  sessionId,
  userToken,
  autoStop = true,
} = {}) {
  const [, forceUpdate] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (autoStop === false) return
    return () => cleanup()
  }, [autoStop])

  const startUserMedia = useCallback(async () => {
    if (globalUserStream) return globalUserStream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: true,
      })
      globalUserStream = stream
      return stream
    } catch (err) {
      console.warn('[useScreenShare] Could not access camera/mic:', err.message)
      return null
    }
  }, [])

  const startRecording = useCallback(async (existingStream) => {
    try {
      if (!assessmentId) {
        const errMsg = 'Cannot start: assessmentId is missing'
        console.error('[useScreenShare]', errMsg)
        setError(errMsg)
        return false
      }

      if (globalStream) {
        console.log('[useScreenShare] Already sharing screen')
        return true
      }

      const screenStream = existingStream || await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: false
      })
      globalExternalStream = !!existingStream

      const tracks = [...screenStream.getVideoTracks(), ...screenStream.getAudioTracks()]
      globalStream = screenStream
      forceUpdate(n => n + 1)

      const videoTrack = screenStream.getVideoTracks()[0]

      const videoTrackReady = videoTrack
        ? new Promise((resolve) => {
            if (videoTrack.readyState === 'live' && !videoTrack.muted) {
              resolve()
            } else {
              const onUnmute = () => {
                if (videoTrack.readyState === 'live') {
                  videoTrack.removeEventListener('unmute', onUnmute)
                  resolve()
                }
              }
              videoTrack.addEventListener('unmute', onUnmute)
              setTimeout(resolve, 1000)
            }
          })
        : Promise.resolve()

      const [userStream] = await Promise.all([startUserMedia(), videoTrackReady])

      if (userStream) {
        userStream.getTracks().forEach(t => tracks.push(t))
      }

      setError(null)
      forceUpdate(n => n + 1)
      return true
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Screen sharing was denied. Please allow screen sharing for proctored assessments.')
      } else {
        setError(err.message || 'Failed to start screen sharing')
      }
      return false
    }
  }, [startUserMedia])

  const stopRecording = useCallback(async () => {
    if (globalStream) {
      if (!globalExternalStream) {
        globalStream.getTracks().forEach(track => track.stop())
      }
      globalStream = null
    }
    if (globalUserStream) {
      globalUserStream.getTracks().forEach(track => track.stop())
      globalUserStream = null
    }
    forceUpdate(n => n + 1)
    return null
  }, [])

  const cleanup = useCallback(() => {
    if (globalStream) {
      if (!globalExternalStream) {
        globalStream.getTracks().forEach(track => track.stop())
      }
      globalStream = null
    }
    if (globalUserStream) {
      globalUserStream.getTracks().forEach(track => track.stop())
      globalUserStream = null
    }
    forceUpdate(n => n + 1)
  }, [])

  return {
    recording: !!globalStream,
    stream: globalStream,
    error,
    startRecording,
    stopRecording,
    cleanup
  }
}
