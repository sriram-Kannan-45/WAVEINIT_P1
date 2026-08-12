/**
 * MobileJoin Page
 * Secondary-camera page for a phone, opened by scanning the pairing QR code.
 * No login — the pairing token from the URL buys a short-lived socket token,
 * which the device uses to join the interview's WebRTC room as a MOBILE peer.
 *
 * The phone's camera is video-only (audio is intentionally muted so the laptop
 * microphone stays the single audio source). The interviewer's laptop is the
 * only peer that receives this feed.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { io } from 'socket.io-client'
import { useWebRTC } from '../../hooks/useWebRTC'

const PHASE = {
  LOADING: 'loading',
  READY: 'ready',
  CAMERA: 'camera',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  ENDED: 'ended',
}

export default function MobileJoin() {
  const { token } = useParams()
  const [phase, setPhase] = useState(PHASE.LOADING)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [socket, setSocket] = useState(null)
  const videoRef = useRef(null)
  const localStreamRef = useRef(null)
  const joinedRef = useRef(false)
  const endedRef = useRef(false)

  // Validate the pairing token and fetch interview details + socket token.
  useEffect(() => {
    let cancelled = false
    if (!token) {
      setError('Invalid QR code — no token found')
      setPhase(PHASE.ERROR)
      return
    }
    ;(async () => {
      try {
        const res = await fetch('/api/interviews/pair-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          if (!cancelled) {
            setError(data.error || 'This QR code is invalid or has expired.')
            setPhase(PHASE.ERROR)
          }
          return
        }
        if (!cancelled) {
          setInfo(data)
          setPhase(PHASE.READY)
        }
      } catch {
        if (!cancelled) {
          setError('Could not reach the server. Check your connection and try again.')
          setPhase(PHASE.ERROR)
        }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const stopCamera = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setLocalStream(null)
  }, [])

  const connectSocket = useCallback(() => {
    if (!info?.socketToken || socket) return
    console.log('[MOBILE] BEFORE socket connect — URL:', info.socketUrl || window.location.origin)
    setPhase(PHASE.CONNECTING)

    // 10-second failure timeout guard
    const timeoutTimer = setTimeout(() => {
      if (!joinedRef.current && !endedRef.current) {
        console.error('[MOBILE] CONNECTION TIMEOUT — Could not join room within 10s')
        setError('Unable to connect to the interview room. Please check your connection and tap Try Again.')
        setPhase(PHASE.ERROR)
      }
    }, 10000)

    // Same-origin so the Vite dev proxy / reverse proxy forwards /socket.io.
    const s = io({
      auth: { token: info.socketToken },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    s.on('connect', () => {
      console.log('[MOBILE] SOCKET CONNECTED — socket.id:', s.id)
      console.log('[MOBILE] EMITTING join-room for interviewId:', info.interviewId)
      s.emit('join-room', { interviewId: info.interviewId, deviceType: 'MOBILE' }, (ack) => {
        clearTimeout(timeoutTimer)
        console.log('[MOBILE] JOIN ROOM ACK:', ack)
        if (endedRef.current) return
        if (ack?.success) {
          joinedRef.current = true
          console.log('[MOBILE] CONNECTED & JOINED INTERVIEW SESSION SUCCESSFULLY')
          
          // NOW add the local stream to the peer connections (after peers exist)
          if (localStreamRef.current) {
            console.log('[MOBILE] Adding local stream to peer connections')
            addLocalStream(localStreamRef.current)
          } else {
            console.warn('[MOBILE] localStream not ready when join-room succeeded')
          }
          
          setPhase(PHASE.CONNECTED)
        } else {
          console.error('[MOBILE] JOIN ROOM FAILED:', ack?.error)
          setError(ack?.error || 'Could not pair this device. Please scan the QR code again.')
          setPhase(PHASE.ERROR)
        }
      })
    })

    s.on('disconnect', (reason) => {
      console.warn('[MOBILE] SOCKET DISCONNECTED:', reason)
      if (joinedRef.current && !endedRef.current) {
        setError('Connection to the interview was lost. Please scan the QR code again.')
        setPhase(PHASE.ERROR)
      }
    })

    s.on('connect_error', (err) => {
      clearTimeout(timeoutTimer)
      console.error('[MOBILE] SOCKET CONNECT ERROR:', err)
      const msg = err?.message || ''
      setError(/Pairing error/.test(msg)
        ? 'This QR code has already been used or has expired. Please scan a new one.'
        : `Could not connect to signaling server: ${msg || 'Network error'}`)
      setPhase(PHASE.ERROR)
    })

    s.on('interview-ended', () => {
      clearTimeout(timeoutTimer)
      endedRef.current = true
      setPhase(PHASE.ENDED)
    })

    setSocket(s)
  }, [info, socket])

  // Wire the WebRTC offer/answer/ICE handlers to the socket once connected.
  const {
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    addLocalStream,
    connectionStates,
  } = useWebRTC(socket, info?.interviewId, localStreamRef)

  const requestCamera = useCallback(async () => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError(`Secure connection (HTTPS) is required for mobile camera access. Please change 'http://' to 'https://' in your mobile browser address bar.`)
      setPhase(PHASE.ERROR)
      return
    }
    try {
      setPhase(PHASE.CAMERA)
      console.log('[MOBILE] Requesting camera access...')
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (firstErr) {
        // Fallback for devices without environment camera or with strict constraints
        console.warn('[MOBILE] Environment camera failed, trying default camera')
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }
      console.log('[MOBILE] ✅ Camera acquired:', {
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({ kind: t.kind, label: t.label, readyState: t.readyState })),
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      // DO NOT call addLocalStream() yet - socket must connect first
      connectSocket()
    } catch (err) {
      console.error('[MOBILE] Camera access failed:', err)
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      setError(isDenied
        ? 'Camera access was denied. Please allow camera access in your mobile browser settings and try again.'
        : 'Could not access camera. Please make sure no other app is using your camera and try again.')
      setPhase(PHASE.ERROR)
    }
  }, [connectSocket])

  useEffect(() => {
    if (!socket) return
    const onOffer = (d) => handleOffer(d.fromSocketId, d.offer)
    const onAnswer = (d) => handleAnswer(d.fromSocketId, d.answer)
    const onIce = (d) => handleIceCandidate(d.fromSocketId, d.candidate)
    socket.on('offer', onOffer)
    socket.on('answer', onAnswer)
    socket.on('ice-candidate', onIce)
    return () => {
      socket.off('offer', onOffer)
      socket.off('answer', onAnswer)
      socket.off('ice-candidate', onIce)
    }
  }, [socket, handleOffer, handleAnswer, handleIceCandidate])

  // Keep the preview <video> bound to the live stream.
  useEffect(() => {
    if (videoRef.current && localStream) {
      console.log('[MOBILE] Attaching stream to video preview:', {
        streamId: localStream.id,
        tracks: localStream.getTracks().map(t => ({ kind: t.kind, label: t.label, readyState: t.readyState })),
      })
      videoRef.current.srcObject = localStream
      
      // Explicitly play the video
      videoRef.current.play().catch(err => {
        console.warn('[MOBILE] video.play() failed:', err.message)
      })

      // Wait for metadata to confirm video is ready
      const onLoadedMetadata = () => {
        console.log('[MOBILE] ✅ Video preview ready:', {
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
  }, [localStream])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      endedRef.current = true
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      socket?.disconnect()
    }
  }, [socket])

  const laptopConnected = info?.devices?.some(
    (d) => d.deviceType === 'LAPTOP' && d.status === 'CONNECTED'
  )
  const videoActive = Object.values(connectionStates).some((s) => s === 'connected')

  // ── Error state ─────────────────────────────────────────────────────────
  if (phase === PHASE.ERROR) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 rounded-2xl border border-red-500/30 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-white mb-2">Pairing Error</h2>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null)
              if (info) setPhase(PHASE.READY)
              else window.location.reload()
            }}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // ── Ended state ─────────────────────────────────────────────────────────
  if (phase === PHASE.ENDED) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 rounded-2xl border border-green-500/30 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-bold text-white mb-2">Interview Ended</h2>
          <p className="text-gray-400 text-sm">
            The camera has been turned off. You can close this page now.
          </p>
        </div>
      </div>
    )
  }

  // ── Connected state ─────────────────────────────────────────────────────
  if (phase === PHASE.CONNECTED) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
        <div className="bg-gray-800 rounded-2xl border border-green-500/30 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-lg font-bold text-white mb-2">Camera Connected</h2>
          <p className="text-gray-400 text-sm mb-2">
            Your phone is now the interviewer's secondary camera view.
          </p>
          <p className="text-gray-500 text-xs mb-4">
            Keep this page open and the phone positioned on your desk. Do not navigate away.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs mb-4">
            <span className={`inline-block w-2 h-2 rounded-full ${videoActive ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className={videoActive ? 'text-green-400' : 'text-amber-400'}>
              {videoActive ? 'Streaming' : 'Connecting…'}
            </span>
          </div>
          <button
            onClick={() => {
              socket?.disconnect()
              stopCamera()
              endedRef.current = true
              setPhase(PHASE.ENDED)
            }}
            className="px-6 py-2.5 bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Disconnect Camera
          </button>
        </div>

        <div className="mt-6 w-full max-w-sm">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-2xl border border-gray-700/50 bg-black aspect-video object-cover"
          />
          <p className="text-center text-green-400 text-xs mt-2 font-medium">
            📹 Camera Active — Monitoring Mode
          </p>
        </div>
      </div>
    )
  }

  // ── Entry states (loading / ready / camera / connecting) ────────────────
  const interviewLabel = info?.interviewTitle || info?.interviewType || 'Interview'

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl border border-gray-700/50 p-8 max-w-sm w-full text-center"
      >
        <div className="text-4xl mb-3">📱</div>
        <h2 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Secondary Camera
        </h2>

        {phase === PHASE.LOADING && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400 text-sm">Validating QR code…</span>
          </div>
        )}

        {phase === PHASE.READY && (
          <>
            <p className="text-gray-400 text-sm mb-5">
              Your phone will be used as a secondary monitoring camera during the{' '}
              <span className="text-white font-medium">{interviewLabel}</span>.
              Position it to show your desk and workspace.
            </p>

            <div className="mb-5 bg-gray-700/50 rounded-xl p-3 text-left text-xs text-gray-300 space-y-2">
              <div className="flex items-center justify-between">
                <span>Interviewer laptop</span>
                <span className={laptopConnected ? 'text-green-400 font-medium' : 'text-amber-400 font-medium'}>
                  {laptopConnected ? '● Online' : '○ Waiting…'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>This phone</span>
                <span className="text-indigo-300 font-medium">Not connected yet</span>
              </div>
            </div>

            <button
              onClick={requestCamera}
              className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Enable Camera & Connect
            </button>

            <div className="mt-6 bg-gray-700/50 rounded-xl p-3 text-xs text-gray-400 text-left">
              <p>💡 Tips:</p>
              <ul className="mt-1 space-y-1">
                <li>• Position phone to show your desk area</li>
                <li>• Ensure good lighting</li>
                <li>• Keep this page open during the interview</li>
              </ul>
            </div>
          </>
        )}

        {(phase === PHASE.CAMERA || phase === PHASE.CONNECTING) && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-1" />
            <span className="text-gray-300 text-sm font-medium">
              {phase === PHASE.CAMERA ? 'Requesting camera access…' : 'Connecting to the interview…'}
            </span>
            {localStream && (
              <div className="mt-3 w-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-2xl border border-gray-700/50 bg-black aspect-video object-cover"
                />
                <p className="text-center text-indigo-300 text-xs mt-2 font-medium">
                  📷 Local Camera Active — Connecting Stream…
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
