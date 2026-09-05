/**
 * MobileJoin Page
 * Secondary-camera page for a phone, opened by scanning the pairing QR code.
 * Includes complete diagnostic logging and on-screen debug panel for step-by-step tracing.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { io } from 'socket.io-client'
import {
  Shield,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Video,
  Smartphone,
  Info,
  Wifi,
} from 'lucide-react'
import { useWebRTC } from '../../hooks/useWebRTC'
import { mobileCameraStatus } from '../../utils/mobileCameraStatus.mjs'
import yoloProctoringService from '../../services/yoloProctoringService'
import { API_BASE, BACKEND_ORIGIN } from '../../api/api'
import '../../styles/assessment-verification.css'

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
  const [mobileEvidence,setMobileEvidence]=useState(null)
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
  const hadConnectedRef = useRef(false)
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
        const res = await fetch(`${API_BASE}/interviews/pair-validate`, {
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

    const wsUrl = info.socketUrl || BACKEND_ORIGIN || window.location.origin
    addLog(`BEFORE socket connect — URL: ${wsUrl}`)
    setPhase(PHASE.CONNECTING)
    updateStatusLabel('connecting')

    const timeoutTimer = setTimeout(() => {
      if (!joinedRef.current && !endedRef.current) {
        addLog('signaling socket connect: FAILED (10s timeout)', 'error')
        setError('Unable to connect to the interview room. Please check your connection and tap Try Again.')
        setPhase(PHASE.ERROR)
      }
    }, 10000)

    const s = io(wsUrl, {
      auth: async callback=>{
        try{const response=await fetch(`${API_BASE}/interviews/pair-validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Pairing is no longer active');callback({token:data.socketToken})}catch(e){setError(e.message);callback({token:info.socketToken})}
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
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
    const permitted=peer=>peer.deviceType!=='MOBILE'&&(String(peer.userId)===String(info.candidateId)||['ADMIN','TRAINER'].includes(peer.role))
    s.on('interview:mobile-evidence',data=>setMobileEvidence(data.success?data.mobileEvidence:null))
    s.on('peer-joined', (d) => {
      if(!permitted(d))return
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
          if (permitted(peer) && peer.socketId && peer.socketId !== s.id) {
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
          hadConnectedRef.current = true
          addLog(`CONNECTED & JOINED ROOM SUCCESSFULLY. Peers in room: ${ack.peers?.length || 0}`)
          updateStatusLabel('connected')

          if (localStreamRef.current) {
            addLog('Attaching local camera stream to WebRTC peer connections...')
            addLocalStreamRef.current?.(localStreamRef.current)
          }

          if (ack.peers?.length) {
            ack.peers.forEach((peer) => {
              if (!permitted(peer)) return
              addLog(`Sending offer via signaling to target: ${peer.socketId?.substr(0,6)}`)
              createOfferRef.current?.(peer.socketId)
            })
          }

          setError(null)
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
        joinedRef.current=false
        setError('Connection interrupted. Reconnecting to the same interview…')
        updateStatusLabel('connecting')
        setPhase(PHASE.CONNECTING)
      }
    })

    s.on('connect_error', (err) => {
      clearTimeout(timeoutTimer)
      addLog(`signaling socket connect: FAILED (${err.message})`, 'error')
      // Socket.IO retries transient network failures automatically.  A phone that
      // already joined keeps its original pairing and shows a reconnecting state.
      if (hadConnectedRef.current && !endedRef.current) {
        setError('Connection interrupted. Reconnecting to the same interview…')
        updateStatusLabel('connecting')
        setPhase(PHASE.CONNECTING)
        return
      }
      const msg = err?.message || ''
      setError(/Pairing error/.test(msg)
        ? 'This QR code has already been used or has expired. Please scan a new one.'
        : `Could not connect to signaling server: ${msg || 'Network error'}`)
      setPhase(PHASE.ERROR)
    })

    s.on('interview-ended', () => {
      clearTimeout(timeoutTimer)
      endedRef.current = true
      stopCamera()
      setPhase(PHASE.ENDED)
    })

    s.on('room:closed', () => {
      clearTimeout(timeoutTimer)
      endedRef.current = true
      stopCamera()
      setPhase(PHASE.ENDED)
    })

    s.on('assessment_verif:session_ended', () => {
      clearTimeout(timeoutTimer)
      endedRef.current = true
      stopCamera()
      setPhase(PHASE.ENDED)
    })
  }, [info, addLog, updateStatusLabel, stopCamera])

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
        participantId: info.candidateId,
        moduleType: 'INTERVIEW',
        cameraSource: 'MOBILE_CAMERA',
        interviewId: String(info.interviewId),
        fps: 1.6,
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
      <div className="wi-mobile-page">
        <div className="wi-mobile-header">
          <div className="wi-mobile-shield-icon">
            <Shield size={24} strokeWidth={2.4} />
          </div>
          <h1 className="wi-mobile-brand-title">WAVE INIT LMS</h1>
          <p className="wi-mobile-brand-subtitle">Interview Monitoring &bull; Real-time Verification</p>
        </div>

        <div className="wi-mobile-card">
          <div className="wi-mobile-state-box">
            <div className="wi-mobile-error-icon">
              <AlertCircle size={30} />
            </div>
            <div>
              <h3 className="wi-mobile-error-title">Camera Permission Error</h3>
              <p className="wi-mobile-error-msg">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null)
                if (info) {
                  requestCamera()
                } else {
                  window.location.reload()
                }
              }}
              className="wi-mobile-btn-primary"
            >
              <RefreshCw size={15} /> Allow Camera / Try Again
            </button>
          </div>
        </div>

        <div className="wi-mobile-footer">
          <Shield size={14} color="#16A34A" strokeWidth={2.2} />
          <span><strong>WAVE INIT Secure Proctoring</strong> &bull; Real-time Verification</span>
        </div>
        <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
      </div>
    )
  }

  // ── Ended state ─────────────────────────────────────────────────────────
  if (phase === PHASE.ENDED) {
    return (
      <div className="wi-mobile-page">
        <div className="wi-mobile-header">
          <div className="wi-mobile-shield-icon">
            <Shield size={24} strokeWidth={2.4} />
          </div>
          <h1 className="wi-mobile-brand-title">WAVE INIT LMS</h1>
          <p className="wi-mobile-brand-subtitle">Interview Monitoring &bull; Real-time Verification</p>
        </div>

        <div className="wi-mobile-card">
          <div className="wi-mobile-state-box">
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>Interview Ended</h3>
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                The camera has been turned off. You can safely close this page now.
              </p>
            </div>
          </div>
        </div>

        <div className="wi-mobile-footer">
          <Shield size={14} color="#16A34A" strokeWidth={2.2} />
          <span><strong>WAVE INIT Secure Proctoring</strong> &bull; Real-time Verification</span>
        </div>
        <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
      </div>
    )
  }

  // ── Unified Active Render Tree (single stable video element across CAMERA, CONNECTING, CONNECTED)
  const interviewLabel = info?.interviewTitle || info?.interviewType || 'Interview'

  return (
    <div className="wi-mobile-page">
      {/* Brand Header */}
      <div className="wi-mobile-header">
        <div className="wi-mobile-shield-icon">
          <Shield size={24} strokeWidth={2.4} />
        </div>
        <h1 className="wi-mobile-brand-title">WAVE INIT LMS</h1>
        <p className="wi-mobile-brand-subtitle">Interview Monitoring &bull; Real-time Verification</p>
      </div>

      <div className="wi-mobile-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span className="wi-mobile-badge-tag">
            <Smartphone size={13} strokeWidth={2.5} />
            SECONDARY CAMERA
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
            {interviewLabel}
          </span>
        </div>

        {phase === PHASE.LOADING && (
          <div className="wi-mobile-state-box">
            <Loader2 className="animate-spin" size={38} color="#16A34A" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>Validating QR Code</h3>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>Connecting to interview room...</p>
            </div>
          </div>
        )}

        {phase === PHASE.READY && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="wi-mobile-instruction-card">
              <div className="wi-mobile-instruction-icon">
                <Info size={20} strokeWidth={2.5} />
              </div>
              <div className="wi-mobile-instruction-content">
                <h3 className="wi-mobile-instruction-title">Camera Placement</h3>
                <p className="wi-mobile-instruction-text">
                  Your phone will be used as a secondary camera during the <strong>{interviewLabel}</strong>. Position it to clearly show your desk and workspace.
                </p>
              </div>
            </div>

            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '12px 14px',
              fontSize: '12px',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Interviewer laptop</span>
                <span style={{ color: laptopConnected ? '#16A34A' : '#D97706', fontWeight: 600 }}>
                  {laptopConnected ? '● Online' : '○ Waiting…'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>This phone</span>
                <span style={{ color: '#64748B', fontWeight: 500 }}>Not connected yet</span>
              </div>
            </div>

            <button
              type="button"
              onClick={requestCamera}
              className="wi-mobile-btn-primary"
            >
              <Camera size={18} strokeWidth={2.2} />
              <span>Allow Camera &amp; Connect</span>
            </button>
          </div>
        )}

        {(phase === PHASE.CAMERA || phase === PHASE.CONNECTING || phase === PHASE.CONNECTED) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: videoActive ? '#16A34A' : '#D97706'
              }} />
              <span style={{ color: videoActive ? '#16A34A' : '#D97706', fontWeight: 600 }}>
                {getStatusText()}
              </span>
            </div>

            {/* Video preview */}
            <div className="wi-mobile-video-wrap">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />
              <div className="wi-mobile-badge-live">
                <div className="wi-mobile-dot-pulse" />
                <span>MONITORING MODE</span>
              </div>
              <div className="wi-mobile-badge-status">
                <Wifi size={11} />
                <span>{previewReady ? 'Active' : 'Initializing…'}</span>
              </div>
            </div>

            {phase===PHASE.CONNECTED&&<p role="status">{mobileCameraStatus({connected:true,evidence:mobileEvidence,now:Date.now()}).message}</p>}
            {phase === PHASE.CONNECTED && (
              <button
                type="button"
                onClick={() => {
                  socketRef.current?.disconnect()
                  socketRef.current = null
                  setSocket(null)
                  stopCamera()
                  endedRef.current = true
                  setPhase(PHASE.ENDED)
                }}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                  borderRadius: '14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease'
                }}
              >
                Disconnect Camera
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Page Footer */}
      <div className="wi-mobile-footer">
        <Shield size={14} color="#16A34A" strokeWidth={2.2} />
        <span><strong>WAVE INIT Secure Proctoring</strong> &bull; Real-time Verification</span>
      </div>

      <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
    </div>
  )
}
