/**
 * MobileJoin Page
 * Secondary-camera page for a phone, opened by scanning the pairing QR code.
 * Includes complete diagnostic logging and on-screen debug panel for step-by-step tracing.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { io } from 'socket.io-client'
import { useWebRTC } from '../../hooks/useWebRTC'
import yoloProctoringService from '../../services/yoloProctoringService'

const PHASE = {
  LOADING: 'loading',
  READY: 'ready',
  CAMERA: 'camera',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  ENDED: 'ended',
}

/** On-screen diagnostic log overlay component for mobile testing */
function MobileDebugPanel({ logs, isOpen, onToggle }) {
  return null

  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 99999,
      background: 'rgba(15,23,42,0.95)', border: '1px solid #334155',
      borderRadius: 12, padding: '8px 12px', color: '#f8fafc',
      boxShadow: '0 4px 20px rgba(0,0,0,0.8)', fontSize: 10, fontFamily: 'monospace',
      maxHeight: isOpen ? '240px' : '36px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#60a5fa', marginBottom: isOpen ? 6 : 0 }}
      >
        <span>🔍 MOBILE DIAGNOSTIC LOGS ({logs.length})</span>
        <span style={{ background: '#334155', padding: '1px 6px', borderRadius: 4 }}>{isOpen ? 'Minimize' : 'Expand'}</span>
      </div>
      {isOpen && (
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
          {logs.slice().reverse().map((log, idx) => (
            <div key={idx} style={{ color: log.type === 'error' ? '#f87171' : log.type === 'warn' ? '#fbbf24' : '#4ade80', wordBreak: 'break-all' }}>
              [{log.time}] {log.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MobileJoin() {
  const { token } = useParams()
  const [phase, setPhase] = useState(PHASE.LOADING)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [socket, setSocket] = useState(null)
  const [logs, setLogs] = useState([])
  const [showDebug, setShowDebug] = useState(true)
  const [previewReady, setPreviewReady] = useState(false)
  const [statusLabel, setStatusLabelState] = useState('idle')

  const videoRef = useRef(null)
  const localStreamRef = useRef(null)
  const socketRef = useRef(null)
  const joinedRef = useRef(false)
  const endedRef = useRef(false)
  const initializingRef = useRef(false)
  const hasVerifiedDimensionsRef = useRef(false)
  const lastLoggedStatusRef = useRef('')

  const addLog = useCallback((text, type = 'info') => {
    const time = new Date().toLocaleTimeString()
    console.log(`[MOBILE] ${text}`)
    setLogs((prev) => [...prev, { time, text, type }])
  }, [])

  const updateStatusLabel = useCallback((newStatus) => {
    if (lastLoggedStatusRef.current === newStatus) return
    lastLoggedStatusRef.current = newStatus
    setStatusLabelState(newStatus)
    addLog(`status label updated to: ${newStatus}`)
  }, [addLog])

  // 1. Initial Page Load Instrumentation
  useEffect(() => {
    const isSecure = typeof window !== 'undefined' && window.isSecureContext === true
    const hasMedia = typeof navigator !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia
    addLog(`Page loaded. isSecureContext = ${isSecure}, origin = ${window?.location?.origin}`)
    addLog(`navigator.mediaDevices exists = ${hasMedia}`)
  }, [addLog])

  // 2. Validate the pairing token and fetch interview details + socket token.
  useEffect(() => {
    let cancelled = false
    if (!token) {
      addLog('interview/token validated: FAILED (no token in URL)', 'error')
      setError('Invalid QR code — no pairing token found in URL')
      setPhase(PHASE.ERROR)
      return
    }
    ;(async () => {
      try {
        addLog(`Validating pairing token: ${token.substr(0, 10)}...`)
        const res = await fetch('/api/interviews/pair-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          if (!cancelled) {
            addLog(`interview/token validated: FAILED (${data.error || res.statusText})`, 'error')
            setError(data.error || 'This QR code is invalid or has expired. Please scan a new QR code.')
            setPhase(PHASE.ERROR)
          }
          return
        }
        if (!cancelled) {
          addLog(`interview/token validated: SUCCESS (interviewId: ${data.interviewId})`)
          setInfo(data)
          setPhase(PHASE.READY)
        }
      } catch (err) {
        if (!cancelled) {
          addLog(`interview/token validated: FAILED (${err.message})`, 'error')
          setError('Could not reach the server. Check your network connection and try again.')
          setPhase(PHASE.ERROR)
        }
      }
    })()
    return () => { cancelled = true }
  }, [token, addLog])

  const stopCamera = useCallback(() => {
    addLog('Stopping camera tracks')
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setPreviewReady(false)
    hasVerifiedDimensionsRef.current = false
  }, [addLog])

  const connectSocket = useCallback(() => {
    if (!info?.socketToken) return

    // If a previous socket exists but is not connected (e.g. a failed attempt
    // after "Try Again"), tear it down cleanly so we start fresh.
    if (socketRef.current) {
      if (socketRef.current.connected) return
      addLog('signaling socket reconnect: discarding stale connection', 'warn')
      socketRef.current.disconnect()
      socketRef.current = null
      setSocket(null)
    }

    addLog(`BEFORE socket connect — URL: ${info.socketUrl || window.location.origin}`)
    setPhase(PHASE.CONNECTING)
    updateStatusLabel('connecting')

    const timeoutTimer = setTimeout(() => {
      if (!joinedRef.current && !endedRef.current) {
        addLog('signaling socket connect: FAILED (10s timeout)', 'error')
        setError('Unable to connect to the interview room. Please check your connection and tap Try Again.')
        setPhase(PHASE.ERROR)
      }
    }, 10000)

    const s = io({
      auth: { token: info.socketToken },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = s
    setSocket(s)

    s.on('offer', (d) => {
      addLog(`offer received from signaling (from: ${d.fromSocketId?.substr(0,6)})`)
      handleOfferRef.current?.(d.fromSocketId, d.offer)
    })
    s.on('answer', (d) => {
      addLog(`answer received from signaling (from: ${d.fromSocketId?.substr(0,6)})`)
      handleAnswerRef.current?.(d.fromSocketId, d.answer)
    })
    s.on('ice-candidate', (d) => {
      addLog(`ICE candidate received from Trainer (from: ${d.fromSocketId?.substr(0,6)})`)
      handleIceCandidateRef.current?.(d.fromSocketId, d.candidate)
    })
    s.on('peer-joined', (d) => {
      addLog(`[MOBILE] peer-joined event received: socketId ${d.socketId?.substr(0,6)} (role: ${d.role}, device: ${d.deviceType})`)
      if (d.socketId) {
        addLog(`[MOBILE] Initiating WebRTC offer to new peer: ${d.socketId?.substr(0,6)}`)
        createOfferRef.current?.(d.socketId)
      }
    })
    s.on('room:state', (snapshot) => {
      addLog(`[MOBILE] room:state snapshot received (${snapshot?.peers?.length || 0} peers)`)
      if (snapshot?.peers?.length) {
        snapshot.peers.forEach((peer) => {
          if (peer.socketId && peer.socketId !== s.id) {
            addLog(`[MOBILE] Snapshot initiating offer to peer: ${peer.socketId?.substr(0,6)}`)
            createOfferRef.current?.(peer.socketId)
          }
        })
      }
    })

    s.on('connect', () => {
      addLog(`signaling socket connect: SUCCESS (socket.id: ${s.id?.substr(0,8)})`)
      addLog(`join-room emitted for interviewId/roomId: ${info.interviewId}`)
      // Coerce to String: the REST API returns a numeric interviewId but the
      // Trainer sends it as a string (from useParams). The server's in-memory
      // rooms Map is key-sensitive, so both sides MUST send the same type.
      s.emit('join-room', { interviewId: String(info.interviewId), deviceType: 'MOBILE' }, (ack) => {
        clearTimeout(timeoutTimer)
        if (endedRef.current) return
        if (ack?.success) {
          joinedRef.current = true
          addLog(`CONNECTED & JOINED ROOM SUCCESSFULLY. Peers in room: ${ack.peers?.length || 0}`)
          updateStatusLabel('connected')

          if (localStreamRef.current) {
            addLog('Attaching local camera stream to WebRTC peer connections...')
            addLocalStreamRef.current?.(localStreamRef.current)
          }

          if (ack.peers?.length) {
            ack.peers.forEach((peer) => {
              addLog(`Sending offer via signaling to target: ${peer.socketId?.substr(0,6)}`)
              createOfferRef.current?.(peer.socketId)
            })
          }

          setPhase(PHASE.CONNECTED)
        } else {
          addLog(`JOIN ROOM FAILED: ${ack?.error}`, 'error')
          setError(ack?.error || 'Could not pair this device. Please scan the QR code again.')
          setPhase(PHASE.ERROR)
        }
      })
    })

    s.on('disconnect', (reason) => {
      addLog(`signaling socket DISCONNECTED: ${reason}`, 'warn')
      if (joinedRef.current && !endedRef.current) {
        setError('Connection to the interview was lost. Please scan the QR code again.')
        setPhase(PHASE.ERROR)
      }
    })

    s.on('connect_error', (err) => {
      clearTimeout(timeoutTimer)
      addLog(`signaling socket connect: FAILED (${err.message})`, 'error')
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
  }, [info, addLog, updateStatusLabel])

  // Wire the WebRTC offer/answer/ICE handlers to the socket once connected.
  // Pass socketRef directly so useWebRTC accesses the live socket instance synchronously
  // upon creation without waiting for React state re-renders.
  const {
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    createOffer,
    addLocalStream,
    connectionStates,
  } = useWebRTC(socketRef, info?.interviewId != null ? String(info.interviewId) : null, localStreamRef)

  const handleOfferRef = useRef(handleOffer)
  const handleAnswerRef = useRef(handleAnswer)
  const handleIceCandidateRef = useRef(handleIceCandidate)
  const createOfferRef = useRef(createOffer)
  const addLocalStreamRef = useRef(addLocalStream)

  useEffect(() => {
    handleOfferRef.current = handleOffer
    handleAnswerRef.current = handleAnswer
    handleIceCandidateRef.current = handleIceCandidate
    createOfferRef.current = createOffer
    addLocalStreamRef.current = addLocalStream
  }, [handleOffer, handleAnswer, handleIceCandidate, createOffer, addLocalStream])

  // Log WebRTC connection state transitions & update statusLabel to 'streaming'
  useEffect(() => {
    const entries = Object.entries(connectionStates)
    entries.forEach(([id, state]) => {
      addLog(`peerConnection.connectionState changes: [${id.substr(0,6)}] → ${state}`)
      if (state === 'connected') {
        addLog('WebRTC state: connected')
        addLog('Remote connection established')
        updateStatusLabel('streaming')
      }
    })
  }, [connectionStates, addLog, updateStatusLabel])

  /**
   * Real camera initialization function.
   * Requests environment camera (rear camera for desk monitoring) with fallback to any camera.
   */
  const requestCamera = useCallback(async () => {
    if (initializingRef.current) return localStreamRef.current
    initializingRef.current = true

    // Keep exactly one active local stream: stop any previous stream before
    // reacquiring (only happens on an explicit retry).
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      setLocalStream(null)
      setPreviewReady(false)
    }

    setPhase(PHASE.CAMERA)
    setError(null)
    setPreviewReady(false)
    hasVerifiedDimensionsRef.current = false
    updateStatusLabel('requesting-permission')

    const isSecure = typeof window !== 'undefined' && window.isSecureContext === true
    addLog(`Secure context check: ${isSecure}`)

    if (!isSecure) {
      const msg = 'This page must be loaded over a secure (https) connection to use the camera. Please rescan the QR code.'
      addLog(`getUserMedia result: FAILED (SecurityError, ${msg})`, 'error')
      setError(msg)
      setPhase(PHASE.ERROR)
      initializingRef.current = false
      return null
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      const msg = 'Camera API (getUserMedia) is unavailable in this browser context.'
      addLog(`getUserMedia result: FAILED (UnavailableError, ${msg})`, 'error')
      setError(msg)
      setPhase(PHASE.ERROR)
      initializingRef.current = false
      return null
    }

    addLog('getUserMedia call started')

    try {
      let stream = null

      const preferredConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      }
      const frontFacingConstraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      }
      const anyCameraConstraints = {
        video: true,
        audio: false,
      }

      try {
        addLog('Requesting environment camera (facingMode: environment)...')
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints)
      } catch (frontErr) {
        addLog(`Environment camera constraint failed (${frontErr.message}), falling back to front camera...`, 'warn')
        try {
          stream = await navigator.mediaDevices.getUserMedia(frontFacingConstraints)
        } catch (anyErr) {
          addLog(`Front camera constraint failed (${anyErr.message}), falling back to default video...`, 'warn')
          stream = await navigator.mediaDevices.getUserMedia(anyCameraConstraints)
        }
      }

      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      addLog('getUserMedia result: SUCCESS')
      addLog(`Camera permission granted. Local stream acquired (id: ${stream.id?.substr(0,8)})`)
      addLog(`video track live? ${videoTrack ? videoTrack.readyState : 'no-track'}`)
      addLog(`audio track live? ${audioTrack ? audioTrack.readyState : 'no-track'}`)
      updateStatusLabel('permission-granted')

      localStreamRef.current = stream
      setLocalStream(stream)

      initializingRef.current = false
      connectSocket()
      return stream
    } catch (err) {
      addLog(`getUserMedia result: FAILED (${err.name}: ${err.message})`, 'error')
      initializingRef.current = false

      let friendlyMsg = 'Camera permission is required. Please allow camera access and try again.'
      const name = err?.name || ''
      const msg = err?.message || ''

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        friendlyMsg = 'Camera permission was denied. Please allow camera access in your mobile browser settings and tap Allow Camera.'
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        friendlyMsg = 'No camera device was detected on this mobile phone.'
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        friendlyMsg = 'Your mobile camera is already being used by another application. Close other apps and try again.'
      } else if (name === 'SecurityError') {
        friendlyMsg = 'This page must be loaded over a secure (https) connection to use the camera. Please rescan the QR code.'
      } else if (msg) {
        friendlyMsg = msg
      }

      setError(friendlyMsg)
      setPhase(PHASE.ERROR)
      return null
    }
  }, [connectSocket, addLog, updateStatusLabel])

  // Automatically trigger camera permission request upon token validation
  useEffect(() => {
    if (phase === PHASE.READY && !localStreamRef.current && !initializingRef.current) {
      addLog('Token validated, automatically requesting camera permission...')
      requestCamera()
    }
  }, [phase, requestCamera, addLog])

  // Attach local stream to WebRTC peer connections once connected + start YOLO proctoring
  useEffect(() => {
    if (phase === PHASE.CONNECTED && socket && localStreamRef.current && info?.interviewId) {
      addLog('Socket connected & phase CONNECTED — triggering addLocalStream & YOLO proctoring')
      addLocalStream(localStreamRef.current)

      const monitorId = yoloProctoringService.startMonitoring({
        source: localStreamRef.current,
        socket,
        sessionId: String(info.sessionId || info.interviewId),
        participantId: info.candidateId || 1,
        moduleType: 'INTERVIEW',
        cameraSource: 'MOBILE_CAMERA',
        interviewId: String(info.interviewId),
        fps: 5,
        onDetection: ({ event }) => {
          if (event) {
            addLog(`YOLO Event: ${event.eventType} (${(event.confidence * 100).toFixed(0)}%)`)
          }
        },
      })

      return () => {
        yoloProctoringService.stopMonitoring(monitorId)
      }
    }
  }, [phase, socket, addLocalStream, addLog, info])

  // Single guarded video ref attachment effect (fixes Issue 1 play abort loop)
  useEffect(() => {
    if (!videoRef.current || !localStream) return

    // Guard: Only set srcObject and call play() if not already attached
    if (videoRef.current.srcObject !== localStream) {
      addLog(`Attaching local stream to video element in phase: ${phase}`)
      videoRef.current.srcObject = localStream
      videoRef.current.muted = true
      videoRef.current.playsInline = true
      
      videoRef.current.play().then(() => {
        addLog(`video.play() result: SUCCESS (phase: ${phase})`)
      }).catch(err => {
        addLog(`video.play() result: FAILED (${err.message})`, 'warn')
      })
    }

    let timeoutTimer = null

    const checkRealDimensions = () => {
      if (!videoRef.current || hasVerifiedDimensionsRef.current) return false
      const w = videoRef.current.videoWidth || 0
      const h = videoRef.current.videoHeight || 0
      if (w > 16 && h > 16) {
        hasVerifiedDimensionsRef.current = true
        addLog(`[MOBILE] Real preview dimensions: ${w}x${h}`)
        addLog('[MOBILE] Proceeding to WebRTC setup after stable camera stream')
        setPreviewReady(true)
        updateStatusLabel('camera-active')
        if (timeoutTimer) clearTimeout(timeoutTimer)

        // Directly trigger WebRTC setup as soon as local camera stream is stable
        if (localStreamRef.current && addLocalStreamRef.current) {
          addLocalStreamRef.current(localStreamRef.current)
        }

        return true
      }
      return false
    }

    const onVideoEvent = () => {
      checkRealDimensions()
    }

    const target = videoRef.current
    target.addEventListener('loadedmetadata', onVideoEvent)
    target.addEventListener('loadeddata', onVideoEvent)
    target.addEventListener('resize', onVideoEvent)
    target.addEventListener('playing', onVideoEvent)

    checkRealDimensions()

    timeoutTimer = setTimeout(() => {
      if (!hasVerifiedDimensionsRef.current) {
        const currentW = target?.videoWidth || 0
        const currentH = target?.videoHeight || 0
        addLog(`[MOBILE CAMERA] Preview still decoding after 5s (dimensions: ${currentW}x${currentH})`, 'warn')
        // The WebRTC send is independent of the local <video> element, so a
        // slow local preview must not abort the whole flow. Dimensions can
        // arrive late via the resize/loadeddata events above.
      }
    }, 5000)

    return () => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (target) {
        target.removeEventListener('loadedmetadata', onVideoEvent)
        target.removeEventListener('loadeddata', onVideoEvent)
        target.removeEventListener('resize', onVideoEvent)
        target.removeEventListener('playing', onVideoEvent)
      }
    }
  }, [localStream, phase, addLog, updateStatusLabel])

  // Cleanup on unmount ONLY.
  //
  // CRITICAL: this must NOT depend on `socket`. Previously the cleanup ran
  // whenever `socket` state changed (null → connected), which executed the
  // previous closure and stopped every camera track + nulled localStreamRef
  // exactly when WebRTC was supposed to use them. That is why the mobile
  // preview worked but no video track ever reached the Trainer.
  //
  // An empty dependency array means this runs only on real unmount. During
  // React 18 dev StrictMode's simulated unmount nothing has been acquired
  // yet (socketRef/localStreamRef are null), so it is a safe no-op.
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
  }, [])

  const laptopConnected = info?.devices?.some(
    (d) => d.deviceType === 'LAPTOP' && d.status === 'CONNECTED'
  )
  const videoActive = Object.values(connectionStates).some((s) => s === 'connected') || statusLabel === 'streaming'

  const getStatusText = () => {
    switch (statusLabel) {
      case 'requesting-permission': return 'Requesting camera permission…'
      case 'permission-granted': return 'Camera permission granted'
      case 'camera-active': return 'Local camera active — Connecting stream…'
      case 'connecting': return 'Connecting to interview…'
      case 'connected': return 'Connected to room'
      case 'streaming': return '● Connected & Streaming'
      default: return 'Initializing…'
    }
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (phase === PHASE.ERROR) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 sm:p-6 pb-16">
        <div className="bg-gray-800 rounded-2xl border border-red-500/30 p-6 sm:p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-white mb-2">Camera Permission Error</h2>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => {
              setError(null)
              if (info) {
                requestCamera()
              } else {
                window.location.reload()
              }
            }}
            className="w-full px-6 py-3.5 min-h-[48px] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl transition-colors shadow-md touch-manipulation"
          >
            Allow Camera / Try Again
          </button>
        </div>
        <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
      </div>
    )
  }

  // ── Ended state ─────────────────────────────────────────────────────────
  if (phase === PHASE.ENDED) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 sm:p-6 pb-16">
        <div className="bg-gray-800 rounded-2xl border border-green-500/30 p-6 sm:p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-bold text-white mb-2">Interview Ended</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The camera has been turned off. You can close this page now.
          </p>
        </div>
        <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
      </div>
    )
  }

  // ── Unified Active Render Tree (single stable video element across CAMERA, CONNECTING, CONNECTED)
  const interviewLabel = info?.interviewTitle || info?.interviewType || 'Interview'

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 sm:p-6 pb-16">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl border border-gray-700/50 p-6 sm:p-8 max-w-sm w-full text-center"
      >
        <div className="text-4xl mb-3">📱</div>
        <h2 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Secondary Camera
        </h2>

        {phase === PHASE.LOADING && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400 text-sm font-medium">Validating QR code…</span>
          </div>
        )}

        {phase === PHASE.READY && (
          <>
            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
              Your phone will be used as a secondary monitoring camera during the{' '}
              <span className="text-white font-semibold">{interviewLabel}</span>.
              Position it to show your desk and workspace.
            </p>

            <div className="mb-5 bg-gray-700/50 rounded-xl p-3.5 text-left text-xs text-gray-300 space-y-2.5">
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
              className="w-full px-6 py-3.5 min-h-[48px] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl transition-colors shadow-md touch-manipulation"
            >
              Allow Camera & Connect
            </button>
          </>
        )}

        {(phase === PHASE.CAMERA || phase === PHASE.CONNECTING || phase === PHASE.CONNECTED) && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="flex items-center justify-center gap-2 text-xs mb-2 flex-wrap">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${videoActive ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className={videoActive ? 'text-green-400 font-medium' : 'text-amber-400 font-medium'}>
                {getStatusText()}
              </span>
            </div>

            {/* SINGLE PERSISTENT VIDEO ELEMENT — never unmounts across phase changes */}
            <div className="w-full">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-2xl border border-gray-700/50 bg-black aspect-video object-cover"
              />
              <p className="text-center text-indigo-300 text-xs mt-2 font-medium">
                {previewReady ? '📹 Camera Active — Monitoring Mode' : '⏳ Initializing Camera Preview…'}
              </p>
            </div>

            {phase === PHASE.CONNECTED && (
              <button
                onClick={() => {
                  socketRef.current?.disconnect()
                  socketRef.current = null
                  setSocket(null)
                  stopCamera()
                  endedRef.current = true
                  setPhase(PHASE.ENDED)
                }}
                className="w-full mt-4 px-6 py-3 min-h-[44px] bg-red-600/80 hover:bg-red-600 active:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors touch-manipulation"
              >
                Disconnect Camera
              </button>
            )}
          </div>
        )}
      </motion.div>

      <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
    </div>
  )
}
