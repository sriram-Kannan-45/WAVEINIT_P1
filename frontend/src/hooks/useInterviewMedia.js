/**
 * useInterviewMedia Hook
 * Single source of truth for the local camera/microphone stream shared across
 * the interview room flow (invitation → device check → waiting → live room).
 *
 * Responsibilities:
 *  - Request camera + mic exactly once and keep the stream in localStreamRef
 *  - Surface a machine-readable mediaState + human mediaError
 *  - Mute / unmute, camera on/off, full cleanup on leave/unmount
 *  - Enumerate and select specific camera/microphone devices
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
  const [devices, setDevices] = useState({ cameras: [], microphones: [] })
  const [selectedCamera, setSelectedCamera] = useState(null)
  const [selectedMicrophone, setSelectedMicrophone] = useState(null)

  useEffect(() => { onLocalStreamRef.current = onLocalStream }, [onLocalStream])

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { cameras: [], microphones: [] }
      }
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const cameras = deviceList.filter(d => d.kind === 'videoinput')
      const microphones = deviceList.filter(d => d.kind === 'audioinput')
      
      setDevices({ cameras, microphones })
      
      // Set defaults if not already selected
      if (!selectedCamera && cameras.length > 0) {
        setSelectedCamera(cameras[0].deviceId)
      }
      if (!selectedMicrophone && microphones.length > 0) {
        setSelectedMicrophone(microphones[0].deviceId)
      }
      
      return { cameras, microphones }
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
      return { cameras: [], microphones: [] }
    }
  }, [selectedCamera, selectedMicrophone])

  // Switch to a different camera device
  const switchCamera = useCallback(async (deviceId) => {
    if (deviceId === selectedCamera) return
    
    try {
      // Stop current video track
      localStreamRef.current?.getVideoTracks().forEach(track => track.stop())
      
      // Get new video stream with selected camera
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
        audio: false
      })
      
      // Replace video track in existing stream
      if (localStreamRef.current) {
        const newVideoTrack = newVideoStream.getVideoTracks()[0]
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
        
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack)
        }
        localStreamRef.current.addTrack(newVideoTrack)
        
        // Notify WebRTC layer of track replacement
        onLocalStreamRef.current?.(localStreamRef.current)
      }
      
      setSelectedCamera(deviceId)
      setIsCameraOff(false)
    } catch (err) {
      setMediaError(mapMediaError(err))
      setMediaState('error')
    }
  }, [selectedCamera])

  // Switch to a different microphone device
  const switchMicrophone = useCallback(async (deviceId) => {
    if (deviceId === selectedMicrophone) return
    
    try {
      // Stop current audio track
      localStreamRef.current?.getAudioTracks().forEach(track => track.stop())
      
      // Get new audio stream with selected microphone
      const newAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      })
      
      // Replace audio track in existing stream
      if (localStreamRef.current) {
        const newAudioTrack = newAudioStream.getAudioTracks()[0]
        const oldAudioTrack = localStreamRef.current.getAudioTracks()[0]
        
        if (oldAudioTrack) {
          localStreamRef.current.removeTrack(oldAudioTrack)
        }
        localStreamRef.current.addTrack(newAudioTrack)
        
        // Maintain mute state
        newAudioTrack.enabled = !isMuted
        
        // Notify WebRTC layer of track replacement
        onLocalStreamRef.current?.(localStreamRef.current)
      }
      
      setSelectedMicrophone(deviceId)
    } catch (err) {
      setMediaError(mapMediaError(err))
      setMediaState('error')
    }
  }, [selectedMicrophone, isMuted])

  const startLocalMedia = useCallback(async (opts = {}) => {
    if (localStreamRef.current) return localStreamRef.current
    setMediaState('requesting')
    setMediaError(null)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw Object.assign(new Error('UNAVAILABLE'), { name: 'UnavailableError' })
      }
      
      // Build constraints with selected devices
      const constraints = {
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
        ...opts,
      }
      
      if (selectedCamera) {
        constraints.video = { ...constraints.video, deviceId: { exact: selectedCamera } }
      }
      if (selectedMicrophone) {
        constraints.audio = { deviceId: { exact: selectedMicrophone } }
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
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
  }, [selectedCamera, selectedMicrophone])

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
    devices,
    selectedCamera,
    selectedMicrophone,
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