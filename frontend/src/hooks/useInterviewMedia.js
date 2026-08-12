/**
 * useInterviewMedia Hook
 * Single source of truth for local camera and microphone media streams.
 *
 * Handles:
 *  - Secure context verification
 *  - Detailed DOMException mapping for getUserMedia errors
 *  - Acquiring camera and microphone streams
 *  - Post-permission device enumeration with labels
 *  - Real-time AudioContext analyzer for microphone activity detection
 *  - Seamless camera/microphone device switching & track replacement
 *  - Stream cleanup on unmount or leave
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function mapMediaError(err) {
  const name = err?.name || ''
  const message = err?.message || ''

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Secure connection is required. Camera and microphone access is blocked over plain HTTP on LAN IPs. Please access via HTTPS.'
  }

  if (!navigator?.mediaDevices?.getUserMedia || name === 'UnavailableError' || message === 'UNAVAILABLE') {
    return 'Camera and microphone APIs are unavailable in this browser or context. Please use a modern browser over HTTPS or localhost.'
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera and microphone access was denied. Please allow access in your browser settings and click "Try Again".'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone was detected on this device. Please connect a device and try again.'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError' || message === 'IN_USE') {
    return 'Your camera or microphone is currently being used by another application (e.g. Zoom, Teams, Meet). Close it and try again.'
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'No camera or microphone matching the requested constraints was found.'
  }

  if (name === 'SecurityError') {
    return 'Security error: Camera access requires a secure connection (HTTPS or localhost).'
  }

  if (name === 'AbortError') {
    return 'Media access request was aborted. Please try again.'
  }

  if (name === 'TypeError') {
    return 'Invalid media constraints or unsupported parameter.'
  }

  return message || 'Unable to access camera or microphone. Please check device permissions and try again.'
}

export function useInterviewMedia({ onLocalStream } = {}) {
  const localStreamRef = useRef(null)
  const onLocalStreamRef = useRef(onLocalStream)

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  const [mediaState, setMediaState] = useState('idle') // idle | requesting | ready | error
  const [mediaError, setMediaError] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)

  const [devices, setDevices] = useState({ cameras: [], microphones: [] })
  const [selectedCamera, setSelectedCamera] = useState('')
  const [selectedMicrophone, setSelectedMicrophone] = useState('')

  const [cameraPermission, setCameraPermission] = useState('prompt') // 'granted' | 'denied' | 'prompt'
  const [micPermission, setMicPermission] = useState('prompt')
  const [micLevel, setMicLevel] = useState(0) // 0 to 100
  const [isMicDetected, setIsMicDetected] = useState(false)

  useEffect(() => {
    onLocalStreamRef.current = onLocalStream
  }, [onLocalStream])

  // Stop Web Audio API microphone analyzer
  const stopAudioAnalyzer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
        }
      } catch (e) {
        // Ignore audio context close errors
      }
      audioContextRef.current = null
    }
    analyserRef.current = null
    setMicLevel(0)
  }, [])

  // Start real-time audio analyzer for microphone volume meter
  const startAudioAnalyzer = useCallback((stream) => {
    stopAudioAnalyzer()
    if (!stream) return

    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) {
      setIsMicDetected(false)
      return
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      setIsMicDetected(true)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateLevel = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const average = sum / dataArray.length
        const normalized = Math.min(100, Math.round((average / 128) * 100))
        setMicLevel(normalized)
        animFrameRef.current = requestAnimationFrame(updateLevel)
      }

      updateLevel()
    } catch (err) {
      console.warn('AudioContext analyzer could not be initialized:', err)
    }
  }, [stopAudioAnalyzer])

  // Enumerate available camera and microphone devices
  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) {
        return { cameras: [], microphones: [] }
      }
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const cameras = deviceList.filter((d) => d.kind === 'videoinput')
      const microphones = deviceList.filter((d) => d.kind === 'audioinput')

      setDevices({ cameras, microphones })

      // Set default selected devices if none chosen
      if (cameras.length > 0) {
        setSelectedCamera((prev) => prev || cameras[0].deviceId)
      }
      if (microphones.length > 0) {
        setSelectedMicrophone((prev) => prev || microphones[0].deviceId)
      }

      return { cameras, microphones }
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
      return { cameras: [], microphones: [] }
    }
  }, [])

  // Acquire media stream from camera + microphone
  const startLocalMedia = useCallback(async (opts = {}) => {
    if (localStreamRef.current) {
      return localStreamRef.current
    }

    setMediaState('requesting')
    setMediaError(null)

    // Verify Secure Context
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      const errMessage = mapMediaError({ name: 'SecurityError' })
      setMediaError(errMessage)
      setMediaState('error')
      setCameraPermission('denied')
      setMicPermission('denied')
      return null
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      const errMessage = mapMediaError({ name: 'UnavailableError' })
      setMediaError(errMessage)
      setMediaState('error')
      return null
    }

    try {
      const videoConstraints = selectedCamera
        ? { deviceId: { exact: selectedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }

      const audioConstraints = selectedMicrophone
        ? { deviceId: { exact: selectedMicrophone } }
        : true

      const constraints = {
        video: videoConstraints,
        audio: audioConstraints,
        ...opts,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream

      setCameraPermission('granted')
      setMicPermission('granted')
      setIsMuted(false)
      setIsCameraOff(false)
      setMediaState('ready')

      // Notify parent/WebRTC callback
      onLocalStreamRef.current?.(stream)

      // Start audio volume analyzer for mic status indicator
      startAudioAnalyzer(stream)

      // Enumerate devices now that permissions are granted so device labels appear
      await enumerateDevices()

      return stream
    } catch (err) {
      console.error('getUserMedia failed:', err)
      const mappedError = mapMediaError(err)
      setMediaError(mappedError)
      setMediaState('error')

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraPermission('denied')
        setMicPermission('denied')
      }

      return null
    }
  }, [selectedCamera, selectedMicrophone, enumerateDevices, startAudioAnalyzer])

  // Switch to a specific camera device ID
  const switchCamera = useCallback(async (deviceId) => {
    if (!deviceId || deviceId === selectedCamera) return
    setSelectedCamera(deviceId)

    if (!localStreamRef.current) return

    try {
      // Stop existing video track
      localStreamRef.current.getVideoTracks().forEach((t) => t.stop())

      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      const newVideoTrack = newVideoStream.getVideoTracks()[0]
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]

      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack)
      }
      if (newVideoTrack) {
        localStreamRef.current.addTrack(newVideoTrack)
      }

      setIsCameraOff(false)
      onLocalStreamRef.current?.(localStreamRef.current)
    } catch (err) {
      console.error('Failed to switch camera:', err)
      setMediaError(mapMediaError(err))
    }
  }, [selectedCamera])

  // Switch to a specific microphone device ID
  const switchMicrophone = useCallback(async (deviceId) => {
    if (!deviceId || deviceId === selectedMicrophone) return
    setSelectedMicrophone(deviceId)

    if (!localStreamRef.current) return

    try {
      // Stop existing audio track
      localStreamRef.current.getAudioTracks().forEach((t) => t.stop())

      const newAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      })

      const newAudioTrack = newAudioStream.getAudioTracks()[0]
      const oldAudioTrack = localStreamRef.current.getAudioTracks()[0]

      if (oldAudioTrack) {
        localStreamRef.current.removeTrack(oldAudioTrack)
      }
      if (newAudioTrack) {
        newAudioTrack.enabled = !isMuted
        localStreamRef.current.addTrack(newAudioTrack)
      }

      startAudioAnalyzer(localStreamRef.current)
      onLocalStreamRef.current?.(localStreamRef.current)
    } catch (err) {
      console.error('Failed to switch microphone:', err)
      setMediaError(mapMediaError(err))
    }
  }, [selectedMicrophone, isMuted, startAudioAnalyzer])

  const stopLocalMedia = useCallback(() => {
    stopAudioAnalyzer()
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    setMediaState('idle')
  }, [stopAudioAnalyzer])

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const nextMuted = !isMuted
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted
    })
    setIsMuted(nextMuted)
  }, [isMuted])

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return
    const nextOff = !isCameraOff
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !nextOff
    })
    setIsCameraOff(nextOff)
  }, [isCameraOff])

  const resetMediaError = useCallback(() => {
    setMediaError(null)
    setMediaState('idle')
  }, [])

  useEffect(() => {
    return () => {
      stopAudioAnalyzer()
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
    }
  }, [stopAudioAnalyzer])

  return {
    localStreamRef,
    mediaState,
    mediaError,
    isMuted,
    isCameraOff,
    devices,
    selectedCamera,
    selectedMicrophone,
    cameraPermission,
    micPermission,
    micLevel,
    isMicDetected,
    startLocalMedia,
    stopLocalMedia,
    toggleMute,
    toggleCamera,
    resetMediaError,
    enumerateDevices,
    switchCamera,
    switchMicrophone,
    setSelectedCamera,
    setSelectedMicrophone,
  }
}

export default useInterviewMedia