import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { io } from 'socket.io-client'
import {
  ArrowLeft,
  Sparkles,
  Clock,
  Star,
  FileText,
  Copy,
  Check,
  CheckCircle2,
  Wifi,
  Video,
  Camera,
  Shield,
  Loader2,
  AlertCircle,
  RefreshCw,
  Maximize2,
  Minimize2,
Lock,
  Unlock,
  Radio,
  Code,
  MoveLeft,
  MoveRight,
  Volume2,
  VolumeX,
  ScanLine,
  BadgeCheck
} from 'lucide-react'
import Layout from '../components/Layout'
import { API_BASE, BACKEND_ORIGIN } from '../api/api'
import { useAssessmentMobileUrl } from '../utils/useAssessmentMobileUrl'
import { useToast } from '../components/Toast'
import HireIdentityGate from '../components/assessment/HireIdentityGate'
import hiringService from '../services/hiringService'
import {
  primeHireRoomVoice,
  speakHireRoomVoice,
  stopHireRoomVoice,
  getHireRoomLanguage,
  setHireRoomLanguage,
  hireRoomMessage,
} from '../utils/hireRoomVoice'
import { hireVerificationStore } from '../utils/hireVerificationStore'
import '../styles/assessment-verification.css'

const HIRE_ROOM_STEP_LIST = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'desk', label: 'Desk' },
]
const HIRE_ROOM_TOTAL_STEPS = HIRE_ROOM_STEP_LIST.length

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

export default function ParticipantQuizVerificationPage({ user, onLogout, assessmentType: propAssessmentType }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { trainingId: paramTrainingId, quizId: paramQuizId, assessmentId: paramAssessmentId, attemptId: paramAttemptId } = useParams()
  const [searchParams] = useSearchParams()
  const { error: showError, success: showSuccess } = useToast()

  const isCoding = propAssessmentType === 'CODING' || location.pathname.includes('/coding/') || searchParams.get('type') === 'CODING'
  const currentAssessmentType = isCoding ? 'CODING' : 'QUIZ'

  const effectiveId = paramQuizId || paramAssessmentId || searchParams.get('quizId') || searchParams.get('assessmentId')
  const quizId = effectiveId
  const trainingId = paramTrainingId || searchParams.get('trainingId')
  let attemptId = paramAttemptId || searchParams.get('attemptId')
  let sessionToken = searchParams.get('sessionToken')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [quizDetails, setQuizDetails] = useState(null)
  const [courseDetails, setCourseDetails] = useState(null)
  const [activeAttemptId, setActiveAttemptId] = useState(attemptId ? parseInt(attemptId, 10) : null)
  const [activeSessionToken, setActiveSessionToken] = useState(sessionToken || null)
  const [activeMonitoringSessionId, setActiveMonitoringSessionId] = useState(searchParams.get('monitoringSessionId') || null)
  // Latest attempt context for the initialization effect. That effect seeds the
  // state above itself, so depending on it would re-run initialization and open a
  // second verification session; a ref gives it fresh values without a dependency.
  const attemptContextRef = useRef({
    attemptId: attemptId ? parseInt(attemptId, 10) : null,
    sessionToken: sessionToken || null,
    monitoringSessionId: searchParams.get('monitoringSessionId') || null,
  })
  const isHire = trainingId === 'hire'
  const [hirePolicy, setHirePolicy] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`hire_proctor_policy_${attemptId || paramAttemptId}`) || 'null') } catch { return null }
  })
const [identityReady, setIdentityReady] = useState(false)
  const [roomScanComplete, setRoomScanComplete] = useState(false)
  const [roomScanError, setRoomScanError] = useState('')

  // AI-Guided Room Verification state
  const [roomPhase, setRoomPhase] = useState('idle')
  const [roomAiStatus, setRoomAiStatus] = useState('idle')
  const [roomAiMessage, setRoomAiMessage] = useState('')
  const [roomAiTaMessage, setRoomAiTaMessage] = useState('')
  const [roomCurrentStep, setRoomCurrentStep] = useState(null)
  const [sixCaptureStatus, setSixCaptureStatus] = useState({})
const [roomScanCoverage, setRoomScanCoverage] = useState(0)
  const [roomScanSectors, setRoomScanSectors] = useState([])
  const [roomScanPendingObject, setRoomScanPendingObject] = useState(null)
  const [roomScanRestarted, setRoomScanRestarted] = useState(false)
  const [roomScanDirection, setRoomScanDirection] = useState('Left')
  const [roomVoiceEnabled, setRoomVoiceEnabled] = useState(true)
  const [roomLanguage, setRoomLanguage] = useState(() => getHireRoomLanguage())
  const [roomObservations, setRoomObservations] = useState([])
  const [roomCaptureEvent, setRoomCaptureEvent] = useState(null)
  const [roomCapturePreview, setRoomCapturePreview] = useState(null)
const roomCaptureHandledRef = useRef(null)
  const roomAdvanceTimerRef = useRef(null)
  const roomLoopRef = useRef(null)
  const roomScanBatchRef = useRef([])
  const roomScanActiveRef = useRef(false)
  const roomRecordingRef = useRef(false)
  const reviewScanRecordingRef = useRef(null)
  // ready -> recording -> reviewing -> (done | flag | retry). The recording is
  // never interrupted: only the post-scan review can move it off `recording`.
  const [roomRecordingStage, setRoomRecordingStage] = useState('ready')
  const [recordedSamples, setRecordedSamples] = useState(0)
  const roomBusyRef = useRef(false)
  const roomStatusRef = useRef('idle')
  const lastFrameRef = useRef(null)
  const lastFrameStateAtRef = useRef(0)
  const feedActiveRef = useRef(false)
  const laptopPreviewRef = useRef(null)
  const laptopStreamRef = useRef(null)
  const laptopSamplesRef = useRef([])
  const [laptopCameraStatus, setLaptopCameraStatus] = useState('Waiting for room check')
  const [laptopCameraReady, setLaptopCameraReady] = useState(false)
  const roomGuideSpokenRef = useRef({ key: null, at: 0 })
  const roomStateEmitTimerRef = useRef(null)
  const roomLatestStateRef = useRef(null)
  // Mirror of the server's authoritative capture map so callbacks read the
  // latest value without being re-created on every state change.
  const sixCaptureStatusRef = useRef({})
  // `activeRoomLanguage` is declared far below this socket effect, so socket
  // callbacks read it through a ref instead of closing over the binding.
  const activeRoomLanguageRef = useRef('en-IN')


useEffect(() => {
    if (!isHire || !effectiveId) return
    hiringService.getProctoringPolicy(currentAssessmentType, effectiveId, activeMonitoringSessionId).then(result => {
      setHirePolicy(result.policy)
      if (activeAttemptId || attemptId) sessionStorage.setItem(`hire_proctor_policy_${activeAttemptId || attemptId}`, JSON.stringify(result.policy))
      if (!result.policy.enabled || !result.policy.identityVerification || result.state?.identityVerifiedAt) setIdentityReady(true)
      if (result.state?.sixCaptureStatus) setSixCaptureStatus(result.state.sixCaptureStatus)
      if (typeof result.state?.roomScanCoverage === 'number') setRoomScanCoverage(result.state.roomScanCoverage)
if (Array.isArray(result.state?.roomScanSectors)) setRoomScanSectors(result.state.roomScanSectors)
      if (result.state?.roomScanPendingObject) setRoomScanPendingObject(result.state.roomScanPendingObject)
      if (result.state?.roomScanRestarted) setRoomScanRestarted(true)
      if (Array.isArray(result.state?.roomObservations)) setRoomObservations(result.state.roomObservations)
      if (result.state?.roomScanClear) { setRoomPhase('done'); setRoomScanComplete(true) }
      primeHireRoomVoice()
    }).catch(error => setRoomScanError(error.message || 'Could not load Hire proctoring policy'))
  }, [isHire, currentAssessmentType, effectiveId, activeAttemptId, attemptId, activeMonitoringSessionId])

  // Verification Session States
  const [sessionData, setSessionData] = useState(null)
  const [timeLeft, setTimeLeft] = useState(597)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedSessionId, setCopiedSessionId] = useState(false)
  const [isFullscreenVideo, setIsFullscreenVideo] = useState(false)
  const [verifyingStart, setVerifyingStart] = useState(false)

  // Real-time Checklist States
  const [qrScanned, setQrScanned] = useState(false)
  const [participantValidated, setParticipantValidated] = useState(false)
  const [mobileStreamConnected, setMobileStreamConnected] = useState(false)
  const [mobileCameraReady, setMobileCameraReady] = useState(false)
  const [webRtcConnected, setWebRtcConnected] = useState(false)
  const [remoteVideoReady, setRemoteVideoReady] = useState(false)
  const [isFullyVerified, setIsFullyVerified] = useState(false)
  const [workspaceVerified, setWorkspaceVerified] = useState(false)
  const [hireRoomPageStarted, setHireRoomPageStarted] = useState(false)
  const [compositionMessage, setCompositionMessage] = useState(isHire
    ? 'Connect your mobile camera to begin room verification.'
    : 'Show both yourself and your laptop in the mobile camera.')
  const lastEvidenceRef = useRef(0)
  const lastMobileFrameAtRef = useRef(0)
  const [transportError, setTransportError] = useState(null)
  const [isDisconnected, setIsDisconnected] = useState(false)

  // Media & WebRTC Refs
  const [remoteStream, setRemoteStream] = useState(null)
  const [lastFrame, setLastFrame] = useState(null)
  const videoRef = useRef(null)
  const previewContainerRef = useRef(null)
  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const mobileSocketIdRef = useRef(null)
  const sessionIdRef = useRef(null)
  const candidateQueueRef = useRef([])
  const pollIntervalRef = useRef(null)

  const activeToken =
    user?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('token') || sessionStorage.getItem('token')
      : null)

  // 1. Fetch Course and Quiz/Coding Info + Create / Restore Attempt
  useEffect(() => {
    let aborted = false
    const initAttempt = async () => {
      if (!effectiveId) {
        setError(`${isCoding ? 'Assessment' : 'Quiz'} ID is required.`)
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // If attemptId is not already provided, create or resume the attempt
        let curAttemptId = attemptContextRef.current.attemptId
        let curSessionToken = attemptContextRef.current.sessionToken

        if (!curAttemptId) {
          const startEndpoint = isCoding
            ? `${API_BASE}/coding/participant/start/${effectiveId}`
            : `${API_BASE}/quizzes/${effectiveId}/start`

          const startRes = await fetch(startEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
            },
            ...(isCoding ? {
              body: JSON.stringify({
                participant_id: user?.id,
                training_id: trainingId,
                lesson_id: null,
                coding_assessment_id: effectiveId,
              })
            } : {})
          })
          const startData = await startRes.json()
          if (!startRes.ok || !startData.attemptId) {
            throw new Error(startData.error || `Failed to initialize ${isCoding ? 'coding' : 'quiz'} attempt.`)
          }
          curAttemptId = startData.attemptId
          curSessionToken = startData.sessionToken
          attemptContextRef.current = {
            attemptId: curAttemptId,
            sessionToken: curSessionToken,
            monitoringSessionId: startData.monitoringSessionId || null,
          }
          setActiveAttemptId(curAttemptId)
          setActiveSessionToken(curSessionToken)
          setActiveMonitoringSessionId(startData.monitoringSessionId || null)
          if (startData.quiz || startData.assessment) {
            setQuizDetails(startData.quiz || startData.assessment)
          }
        }

        // Initiate Verification Session for this exact attempt
        if (curAttemptId) {
          try {
            const adminRes = await fetch(`${API_BASE}/assessment-verification/admission/${currentAssessmentType}/${curAttemptId}`, {
              headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
            });
            if (adminRes.ok && !aborted && !isHire) {
              const coursePath = trainingId ? `/trainings/${trainingId}` : '';
              const params = new URLSearchParams({
                attemptId: String(curAttemptId),
                sessionToken: curSessionToken || '',
                monitoringSessionId: attemptContextRef.current.monitoringSessionId || '',
              });
              navigate(`${coursePath}/${isCoding ? 'coding' : 'quizzes'}/${effectiveId}/attempt?${params.toString()}`, { replace: true });
              return;
            }
          } catch (_) {}

          const verifRes = await fetch(`${API_BASE}/assessment-verification/initiate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
            },
            body: JSON.stringify({
              assessmentType: currentAssessmentType,
              assessmentId: parseInt(effectiveId, 10),
              attemptId: parseInt(curAttemptId, 10),
            }),
          })
          const verifData = await verifRes.json()
          if (!aborted) {
            if (!verifRes.ok || !verifData.success) {
              throw new Error(verifData.error || 'Failed to initialize verification session')
            }
            sessionIdRef.current = verifData.sessionId
            setSessionData(verifData)
            if (verifData.status === 'PAIRED' || verifData.status === 'VERIFIED' || verifData.mobileVerified) {
              setQrScanned(true)
              setParticipantValidated(true)
            }
          }
        }

        if (!aborted) setLoading(false)
        // Fetch Quiz / Coding Assessment metadata
        const qEndpoint = isCoding
          ? `${API_BASE}/coding/assessments/${effectiveId}`
          : `${API_BASE}/quizzes/${effectiveId}/questions`

        const qRes = await fetch(qEndpoint, {
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
          },
        })
        const qData = await qRes.json()
        if (!aborted && qRes.ok) {
          setQuizDetails(qData.quiz || qData.assessment || qData)
        }

        // Fetch Course / Training details if trainingId exists
        if (trainingId && trainingId !== 'hire') {
          try {
            const courseRes = await fetch(`${API_BASE}/participant/courses/${trainingId}`, {
              headers: {
                'Content-Type': 'application/json',
                ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
              },
            })
            const courseData = await courseRes.json()
            if (!aborted && courseData.success && courseData.course) {
              setCourseDetails(courseData.course)
            }
          } catch (e) {
            // Non-critical
          }
        }


      } catch (err) {
        if (!aborted) {
          console.error('[ParticipantQuizVerificationPage] init error:', err)
          setError(err.message || 'Unable to connect to verification server')
          setLoading(false)
        }
      }
    }

    initAttempt()
    return () => {
      aborted = true
    }
  }, [effectiveId, isCoding, attemptId, sessionToken, activeToken, trainingId, isHire, navigate, user?.id, currentAssessmentType])

  // 2. Real-time Countdown Timer
  useEffect(() => {
    if (!sessionData?.expiresAt) return
    const target = new Date(sessionData.expiresAt).getTime()

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000))
      setTimeLeft(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [sessionData?.expiresAt])

  const isExpired = sessionData?.status === 'EXPIRED' ||
    (timeLeft <= 0 && !loading && sessionData && !(isHire && qrScanned))

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(timeLeft / 60)
    const secs = timeLeft % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [timeLeft])

  // 3. WebRTC Peer Connection Setup
  const getOrCreatePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current

    console.log('[LAPTOP-P2P] Initializing RTCPeerConnection with low-latency configuration')
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    })
    pcRef.current = pc

    pc.ontrack = (event) => {
      console.log('[LAPTOP-P2P] Remote video track received from mobile peer:', event.streams)
      let stream = event.streams && event.streams[0]
      if (!stream && event.track) {
        stream = new MediaStream([event.track])
      }
      if (stream) {
        setRemoteStream(stream)
        setMobileCameraReady(true)
        setIsDisconnected(false)

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch((e) => console.warn('[LAPTOP-P2P] Video play error:', e))
        }
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      if (socketRef.current?.connected) {
        const targetSessionId = sessionIdRef.current || sessionData?.sessionId
        socketRef.current.emit('assessment_verif:ice-candidate', {
          sessionId: targetSessionId,
          targetSocketId: mobileSocketIdRef.current,
          candidate,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('[LAPTOP-P2P] WebRTC connection state:', pc.connectionState)
      const state = pc.connectionState
      if (state === 'connected') {
        setWebRtcConnected(true)
        setMobileCameraReady(true)
        setIsDisconnected(false)
      } else if (state === 'disconnected' || state === 'failed') {
        setWebRtcConnected(false)
        setRemoteVideoReady(false)
        setIsDisconnected(true)
      }
    }

    return pc
  }, [sessionData?.sessionId])

  // 4. Socket.IO Real-Time Synchronization
  useEffect(() => {
    const currentSessionId = sessionData?.sessionId || sessionIdRef.current
    if (!currentSessionId) return

    console.log('[LAPTOP-VERIF] Connecting to Socket.IO for session:', currentSessionId)
    const socket = io(BACKEND_ORIGIN || window.location.origin, {
      auth: { token: activeToken },
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    let joinRetryTimer
    const joinRoom = () => {
      clearTimeout(joinRetryTimer)
      if (!socket.connected) return
      console.log('[LAPTOP-VERIF] Connected to verification socket with ID:', socket.id)
      socket.timeout(8000).emit('assessment_verif:join', {
        sessionId: currentSessionId,
        role: 'laptop',
        clientType: 'browser_desktop',
      }, (err, ack) => {
        if (err || !ack?.ok) {
          setTransportError(ack?.error || 'Camera session connection failed. Retrying…')
          if (socket.connected) joinRetryTimer = setTimeout(joinRoom, 3000)
        } else setTransportError(null)
      })
    }
    socket.on('connect', joinRoom)
    socket.on('connect_error', () => {
      setTransportError('Cannot connect to the camera server. Check your connection and refresh this page.')
    })
    socket.on('disconnect', () => {
      setIsFullyVerified(false)
      setTransportError('Camera server disconnected. Reconnecting…')
    })

    // 1. Mobile Joined / Scanned
    socket.on('assessment_verif:mobile_joined', (payload) => {
      console.log('[LAPTOP-VERIF] Mobile joined:', payload)
      roomScanBatchRef.current = []
      roomRecordingRef.current = false
      setRecordedSamples(0)
      setRoomRecordingStage('ready')
      setQrScanned(true)
      setParticipantValidated(true)
      if (roomLatestStateRef.current) socket.emit('assessment_verif:room_state', {
        sessionId: currentSessionId, state: roomLatestStateRef.current,
      })
      if (payload?.socketId) {
        mobileSocketIdRef.current = payload.socketId
        // Inform mobile that laptop is active in the room
        socket.emit('assessment_verif:laptop_joined', {
          sessionId: currentSessionId,
          socketId: socket.id,
        })
      }
    })

    socket.on('assessment_verif:mobile_status', (payload) => {
      if (payload?.connected === false) {
        roomScanBatchRef.current = []
        setIsDisconnected(true)
        setIsFullyVerified(false)
        setMobileStreamConnected(false)
        setRemoteVideoReady(false)
        setLastFrame(null)
        lastEvidenceRef.current = 0
      } else if (payload?.mobileCameraReady) {
        setMobileCameraReady(true)
      }
    })
    socket.on('assessment_verif:stream_status', (payload) => {
      if (payload?.streaming) setMobileCameraReady(true)
    })
    socket.on('assessment_verif:scan_sample', payload => {
      if (!roomScanActiveRef.current || !roomRecordingRef.current || typeof payload?.frame !== 'string') return
      roomScanBatchRef.current.push({ frame: payload.frame, orientation: payload.orientation || null })
      if (roomScanBatchRef.current.length > 96) roomScanBatchRef.current.splice(0, roomScanBatchRef.current.length - 96)
      setRecordedSamples(roomScanBatchRef.current.length)
    })
    socket.on('assessment_verif:scan_recording_control', payload => {
      if (payload?.action === 'start') {
        // A fresh recording never reuses anything from the previous attempt.
        roomScanBatchRef.current = []
        laptopSamplesRef.current = []
        roomRecordingRef.current = true
        roomScanActiveRef.current = true
        setRecordedSamples(0)
        setRoomScanRestarted(false)
        setRoomScanError('')
        setRoomRecordingStage('recording')
        setRoomAiStatus('GUIDING')
        setRoomAiMessage('Recording. Turn smoothly from the saved left view through front to right.')
        setRoomAiTaMessage(hireRoomMessage('ta-IN', 'recording_started') || '')
        speakRoom({ priority: 'CURRENT_STEP', key: 'recording_started' })
      } else if (payload?.action === 'finish') {
        roomRecordingRef.current = false
        reviewScanRecordingRef.current?.()
      }
    })
    socket.on('assessment_verif:yolo_detection', (payload) => {
      const evidence = payload?.success && Date.now() - Number(payload.mobileEvidence?.receivedAt) <= 5000 && payload.mobileEvidence
      lastEvidenceRef.current = evidence?.receivedAt || 0
      setIsFullyVerified(!!evidence?.eligible)
      setCompositionMessage(payload?.userMessage || 'Waiting for mobile camera detection.')
    })

    // 3. WebRTC Offer from Mobile
    socket.on('assessment_verif:offer', async ({ offer, fromSocketId, sessionId }) => {
      console.log('[LAPTOP-VERIF] Received WebRTC offer from mobile:', fromSocketId)
      if (fromSocketId) mobileSocketIdRef.current = fromSocketId
      setQrScanned(true)
      setParticipantValidated(true)
      setMobileCameraReady(true)

      // A fresh offer (new mobile session / re-pair) must never be applied to
      // a connection frozen mid-handshake or to a stale connected peer from a
      // previous QR session, or setRemoteDescription rejects and DTLS hangs
      // permanently. Recycle any connection that is not clean and stable.
      const bridgingSession = String(sessionId || '') === String(sessionData?.sessionId)
      const existing = pcRef.current
      if (existing && (!bridgingSession || existing.connectionState !== 'connected' || existing.signalingState !== 'stable')) {
        console.warn('[LAPTOP-P2P] Recycling stale peer connection for fresh offer', { bridgingSession, state: existing.connectionState, signaling: existing.signalingState })
        try { existing.close() } catch (_) {}
        pcRef.current = null
        candidateQueueRef.current = []
        setWebRtcConnected(false)
        setRemoteVideoReady(false)
      }
      const pc = getOrCreatePeerConnection()

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        while (candidateQueueRef.current.length > 0) {
          const cand = candidateQueueRef.current.shift()
          await pc.addIceCandidate(cand)
        }

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socket.emit('assessment_verif:answer', {
          sessionId: currentSessionId,
          targetSocketId: fromSocketId || mobileSocketIdRef.current,
          answer,
        })
      } catch (e) {
        console.error('[LAPTOP-VERIF] Failed to handle WebRTC offer:', e)
      }
    })

    // 4. ICE Candidates from Mobile
    socket.on('assessment_verif:ice-candidate', async ({ candidate }) => {
      const pc = pcRef.current
      if (pc && candidate) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } else {
            candidateQueueRef.current.push(new RTCIceCandidate(candidate))
          }
        } catch (e) {
          console.warn('[LAPTOP-VERIF] Error adding ICE candidate:', e)
        }
      }
    })

    // 5. Fallback Real-time Video Frames
socket.on('assessment_verif:frame', (payload) => {
      const frame = payload?.frame || payload?.frameData
      if (frame) {
        lastMobileFrameAtRef.current = Date.now()
        lastFrameRef.current = frame
        socket.emit('assessment_verif:frame_received', { sessionId: currentSessionId })
        // Keep the freshest frame in a ref for sampling; only refresh React state
        // a couple of times per second so camera frames never drive re-renders.
        const now = Date.now()
        if (now - lastFrameStateAtRef.current > 450) {
          lastFrameStateAtRef.current = now
          setLastFrame(frame)
        }
        setMobileStreamConnected(true)
        setMobileCameraReady(true)
        setQrScanned(true)
        setParticipantValidated(true)
        setIsDisconnected(false)
      }
    })
    socket.on('assessment_verif:room_capture_state', setRoomCaptureEvent)

    // Server-authoritative step correction. The laptop owns `room_state`, so it
    // never consumes that event; without this it would keep re-broadcasting a
    // stale current step and the final step could never be submitted in order.
    socket.on('assessment_verif:room_state_sync', (payload) => {
      if (!payload || payload.reason !== 'STEP_OUT_OF_ORDER') return
      const status = payload.sixCaptureStatus || {}
      console.warn('[LAPTOP-VERIF] Room step desync corrected by server', payload.pendingStep)
      setSixCaptureStatus(status)
      sixCaptureStatusRef.current = status
      const pendingIndex = (payload.roomSteps || HIRE_ROOM_STEP_LIST.map(s => s.key))
        .findIndex(key => !status[key]?.verifiedAt)
      if (pendingIndex < 0) return
      const key = (payload.roomSteps || HIRE_ROOM_STEP_LIST.map(s => s.key))[pendingIndex]
      const meta = HIRE_ROOM_STEP_LIST.find(s => s.key === key)
      if (!meta) return
      setRoomCurrentStep(previous => (previous?.key === key ? previous : { ...meta, index: pendingIndex }))
      setRoomAiMessage(hireRoomMessage(activeRoomLanguageRef.current, `step_${key}`) || meta.label)
      setRoomAiTaMessage(hireRoomMessage('ta-IN', `step_${key}`) || '')
      setRoomAiStatus('GUIDING')
      roomGuideSpokenRef.current = { key: null, at: 0 }
      clearTimeout(roomAdvanceTimerRef.current)
    })


    socket.on('assessment_verif:mobile-disconnected', () => {
      console.warn('[LAPTOP-VERIF] Mobile device disconnected')
      setIsDisconnected(true)
      setWebRtcConnected(false)
      setRemoteVideoReady(false)
    })

    return () => {
      clearTimeout(joinRetryTimer)
      socket.disconnect()
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      // Drop queued signaling from the previous mobile session so a re-pair
      // cannot feed stale ICE into a brand-new peer connection.
      candidateQueueRef.current = []
      mobileSocketIdRef.current = null
    }
  }, [sessionData?.sessionId, getOrCreatePeerConnection, activeToken])

  // 5. Polling Fallback
  useEffect(() => {
    const currentSessionId = sessionData?.sessionId || sessionIdRef.current
    if (!currentSessionId) return

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/assessment-verification/status/${currentSessionId}`, { headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {} })
        const data = await res.json()
        if (data.success) {
          const s = data.session || data
          if (s.hireFramingVerified) setWorkspaceVerified(true)
          if (s.status === 'PAIRED' || s.status === 'VERIFIED' || s.mobileVerified || s.qrScanned) {
            setQrScanned(true)
            setParticipantValidated(true)
          }
          setMobileCameraReady(!!s.mobileCameraReady)
          const evidence = s.mobileEvidence
          // Do not resurrect stale stream readiness from a saved permission flag.
          if (evidence && evidence.receivedAt >= lastEvidenceRef.current) {
            lastEvidenceRef.current = evidence.receivedAt
            setIsFullyVerified(!!s.isFullyVerified)
          }

        }
      } catch (_) {}
    }, 2000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [sessionData?.sessionId, activeToken])

  useEffect(() => {
    let lastVideoTime = -1
    const timer = setInterval(() => {
      const video = videoRef.current
      if (video && video.readyState >= 2 && !video.paused && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        lastMobileFrameAtRef.current = Date.now()
        setMobileStreamConnected(true)
        setRemoteVideoReady(true)
      }
      if (Date.now() - lastEvidenceRef.current > 5000) {
        setIsFullyVerified(false)
      }
      if (Date.now() - lastMobileFrameAtRef.current > 5000) {
        setMobileStreamConnected(false)
        setWebRtcConnected(false)
        setRemoteVideoReady(false)
        setLastFrame(null)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [])

  // 6. Manual Refresh Session
  const handleRefreshQR = async () => {
    // A QR refresh mints an entirely new monitoring session and wipes the
    // room-verification FSM, so it must never run once the AI-guided scan has
    // begun. Scans are resumed via "Restart Room Scan" inside the flow.
    if (hireFlowPage) return
    try {
      setRefreshing(true)
      const res = await fetch(`${API_BASE}/assessment-verification/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: sessionData?.sessionId,
        }),
      })
      const data = await res.json()
if (data.success) {
        sessionIdRef.current = data.sessionId
        setSessionData(data)
        setQrScanned(false)
        setParticipantValidated(false)
        setMobileStreamConnected(false)
        setMobileCameraReady(false)
        setWebRtcConnected(false)
        setRemoteVideoReady(false)
        setIsFullyVerified(false)
        setWorkspaceVerified(false)
        setHireRoomPageStarted(false)
        setIsDisconnected(false)
        // The refreshed QR points at a brand-new monitoring session, so the
        // previous mobile peer connection must not survive (stale DTLS hangs).
        if (pcRef.current) {
          try { pcRef.current.close() } catch (_) {}
          pcRef.current = null
        }
        candidateQueueRef.current = []
        mobileSocketIdRef.current = null
        showSuccess('QR code refreshed successfully')
      }
    } catch (e) {
      showError('Failed to refresh QR session')
    } finally {
      setRefreshing(false)
    }
  }

  // 7. Fullscreen Video Preview Toggle
  const toggleFullscreen = () => {
    if (!previewContainerRef.current) return
    if (!document.fullscreenElement) {
      previewContainerRef.current.requestFullscreen?.().catch(() => {})
      setIsFullscreenVideo(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreenVideo(false)
    }
  }

  // 8. Start Assessment after Verification
  const handleStartQuiz = async () => {
    try {
      setVerifyingStart(true)

      const hireWithoutMobile = isHire && hirePolicy && (!hirePolicy.enabled || (!hirePolicy.mobileRoomScan && !hirePolicy.roomScan360Enabled))
      if (isHire && hirePolicy?.enabled && hirePolicy.identityVerification && !identityReady) throw new Error('Complete identity verification first.')
      if (isHire && hirePolicy?.enabled && (hirePolicy.mobileRoomScan || hirePolicy.roomScan360Enabled) && !roomScanComplete) throw new Error('Complete the room verification first.')
      if (isHire && hirePolicy?.enabled && (hirePolicy.mobileRoomScan || hirePolicy.roomScan360Enabled) && !workspaceVerified) throw new Error('Complete the hand and laptop check first.')
      if (!hireWithoutMobile && (!isFullyVerified || !mobileStreamConnected || isExpired || isDisconnected)) throw new Error(isHire
        ? 'Wait for stable hand and laptop verification.'
        : 'Wait for stable person and laptop verification.')
      if (hireWithoutMobile) {
        const coursePath = `/trainings/hire`
        const params = new URLSearchParams({ attemptId: String(activeAttemptId), sessionToken: activeSessionToken || '', monitoringSessionId: activeMonitoringSessionId || '' })
        navigate(`${coursePath}/${isCoding ? 'coding' : 'quizzes'}/${effectiveId}/attempt?${params.toString()}`)
        return
      }
      const response = await fetch(`${API_BASE}/assessment-verification/verify-start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ assessmentType: currentAssessmentType, assessmentId: Number(effectiveId),
          attemptId: Number(activeAttemptId), sessionId: sessionData.sessionId, token: sessionData.token }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Mobile verification is not ready.')
      sessionStorage.setItem(`assessment_verif_${currentAssessmentType}_${effectiveId}_${activeAttemptId}`,
        JSON.stringify({ sessionId: sessionData.sessionId, token: sessionData.token }))

      // Navigate to the actual attempt screen
      const coursePath = trainingId ? `/trainings/${trainingId}` : ''
      const params = new URLSearchParams({
        attemptId: String(activeAttemptId),
        sessionToken: activeSessionToken || '',
        monitoringSessionId: activeMonitoringSessionId || '',
      })
      navigate(`${coursePath}/${isCoding ? 'coding' : 'quizzes'}/${effectiveId}/attempt?${params.toString()}`)
    } catch (err) {
      showError(err.message || `Unable to start ${isCoding ? 'coding assessment' : 'quiz'}`)
      setVerifyingStart(false)
    }
  }

  const handleBackToQuiz = () => {
    if (trainingId === 'hire') {
      navigate('/participant?tab=hiring-assessments')
      return
    }
    if (trainingId) {
      navigate(`/participant?tab=myEnrollments&courseId=${trainingId}&subtab=${isCoding ? 'coding' : 'quizzes'}`)
    } else {
      navigate('/participant?tab=myEnrollments')
    }
  }

  const courseDisplayName = courseDetails?.title || (trainingId === 'hire' ? 'Hiring assessment' : (trainingId ? `Training ${trainingId}` : 'Assessment'))
  const quizDisplayName = quizDetails?.title || (isCoding ? 'Coding Assessment' : 'AI Generated Quiz')
  const durationDisplay = quizDetails?.timeLimit ? `${quizDetails.timeLimit} Minutes` : '60 Minutes'
  const marksDisplay = quizDetails?.totalMarks || (quizDetails?.questions ? `${quizDetails.questions.length * 5 || 50} Marks` : (isCoding ? `${(quizDetails?.numProblems || 3) * 10} Marks` : '50 Marks'))
  const mobilePairUrl = useAssessmentMobileUrl(sessionData?.qrPayload?.shortUrl)

const roomScanRequired = isHire && hirePolicy?.enabled && (hirePolicy.mobileRoomScan || hirePolicy.roomScan360Enabled)
  const hireConnectionReady = isHire && roomScanRequired && qrScanned && participantValidated && mobileCameraReady &&
    mobileStreamConnected && (remoteVideoReady || !!lastFrame)
  useEffect(() => { if (hireConnectionReady) setHireRoomPageStarted(true) }, [hireConnectionReady])
  const hireFlowPage = isHire && roomScanRequired && hireRoomPageStarted
  useEffect(() => {
    if (isHire) setWorkspaceVerified(roomScanComplete && isFullyVerified)
  }, [isHire, roomScanComplete, isFullyVerified])
  const roomScan360Enabled = roomScanRequired
  const activeRoomLanguage = hirePolicy?.allowParticipantLanguage === false ? (hirePolicy.defaultLanguage || 'en-IN') : roomLanguage
  const activeRoomIsTa = String(activeRoomLanguage).toLowerCase().startsWith('ta')
  activeRoomLanguageRef.current = activeRoomLanguage


  useEffect(() => {
    if (!roomScanRequired || !['six', 'scan360'].includes(roomPhase)) return undefined
    let cancelled = false
    let timer = null
    const preview = laptopPreviewRef.current
    laptopSamplesRef.current = []
    setLaptopCameraReady(false)
    setLaptopCameraStatus('Connecting laptop camera…')
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return }
        laptopStreamRef.current = stream
        const video = preview
        if (video) { video.srcObject = stream; video.play().catch(() => {}) }
        setLaptopCameraStatus('Laptop camera active for movement check')
        timer = setInterval(() => {
          if (!video?.videoWidth || video.readyState < 2) return
          const canvas = document.createElement('canvas')
          canvas.width = 240
          canvas.height = Math.round(240 * video.videoHeight / video.videoWidth)
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
          laptopSamplesRef.current.push({ frame: canvas.toDataURL('image/jpeg', 0.58), at: Date.now() })
          laptopSamplesRef.current = laptopSamplesRef.current.filter(item => Date.now() - item.at <= 90000).slice(-200)
          if (laptopSamplesRef.current.length >= 3) setLaptopCameraReady(true)
        }, 450)
      })
      .catch(() => { if (!cancelled) setLaptopCameraStatus('Allow laptop camera access to confirm phone movement') })
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      laptopStreamRef.current?.getTracks().forEach(track => track.stop())
      laptopStreamRef.current = null
      laptopSamplesRef.current = []
      setLaptopCameraReady(false)
      if (preview) preview.srcObject = null
    }
  }, [roomScanRequired, roomPhase])

  const recentLaptopFrames = useCallback((maxAgeMs = 3500) => {
    const samples = laptopSamplesRef.current.filter(item => Date.now() - item.at <= maxAgeMs)
    if (samples.length <= 6) return samples.map(item => item.frame)
    // Sample the whole action window instead of only its final static frames.
    // A participant commonly moves first, steadies the phone, then taps Capture.
    return Array.from({ length: 6 }, (_, index) =>
      samples[Math.round(index * (samples.length - 1) / 5)].frame)
  }, [])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !roomScanRequired) return undefined
    const onRequest = ({ captureId }) => {
      if (!captureId || roomPhase !== 'six') return
      socket.emit('assessment_verif:laptop_evidence', {
        sessionId: sessionData?.sessionId || sessionIdRef.current, captureId,
        frames: recentLaptopFrames(8000),
      })
    }
    socket.on('assessment_verif:laptop_evidence_request', onRequest)
    return () => socket.off('assessment_verif:laptop_evidence_request', onRequest)
  }, [roomScanRequired, roomPhase, recentLaptopFrames, sessionData?.sessionId])

  const speakRoom = useCallback(({ priority, key, message, taMessage }) => {
    if (!hirePolicy?.voiceWarnings || !roomVoiceEnabled) return
    const language = activeRoomLanguage
    speakHireRoomVoice({ priority, language, key, message, taMessage, rate: hirePolicy.voiceRate ?? 0.95, volume: hirePolicy.voiceVolume ?? 1 })
  }, [hirePolicy, roomVoiceEnabled, activeRoomLanguage])

  const beginScan360 = useCallback(() => {
    roomScanBatchRef.current = []
    roomScanActiveRef.current = true
    roomRecordingRef.current = false
    setRoomRecordingStage('ready')
    setRecordedSamples(0)
    setRoomScanCoverage(0)
    setRoomScanSectors([])
    setRoomScanPendingObject(null)
    setRoomScanComplete(false)
    setRoomScanRestarted(false)
    setRoomScanError('')
    setWorkspaceVerified(false)
    setRoomScanDirection('Left')
    setRoomAiMessage(hireRoomMessage(activeRoomLanguage, 'start_360') || 'Start at the left view, then turn slowly through front to right')
    setRoomAiTaMessage(hireRoomMessage('ta-IN', 'start_360') || '')
    setRoomAiStatus('GUIDING')
    setRoomPhase('scan360')
    speakRoom({ priority: 'CURRENT_STEP', key: 'start_360' })
  }, [activeRoomLanguage, speakRoom])

  const advanceRoomStep = useCallback((verifiedStepKey) => {
    setRoomCapturePreview(previous => {
      if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
      return null
    })
    // Derive the next step from the server's authoritative capture map, not a
    // local list index. A purely positional advance silently desynced the
    // overlay from the backend whenever the two disagreed, which left the last
    // step permanently stuck on a step-order rejection.
    const serverPendingIndex = HIRE_ROOM_STEP_LIST.findIndex(step => !sixCaptureStatusRef.current?.[step.key]?.verifiedAt)
    const currentIndex = HIRE_ROOM_STEP_LIST.findIndex(step => step.key === verifiedStepKey)
    const nextIndex = serverPendingIndex > currentIndex ? serverPendingIndex : currentIndex + 1
    const next = HIRE_ROOM_STEP_LIST[nextIndex]
    if (next) {
      setRoomCurrentStep({ ...next, index: nextIndex })
      setRoomAiMessage(hireRoomMessage(activeRoomLanguage, `step_${next.key}`) || next.label)
      setRoomAiTaMessage(hireRoomMessage('ta-IN', `step_${next.key}`) || '')
      setRoomAiStatus('GUIDING')
      roomGuideSpokenRef.current = { key: null, at: 0 }
      speakRoom({ priority: 'CURRENT_STEP', key: `step_${next.key}` })
    } else if (roomScan360Enabled) {
      beginScan360()
    } else {
      setRoomPhase('done')
      setRoomScanComplete(true)
      speakRoom({ priority: 'SUCCESS', key: 'all_done' })
    }
  }, [activeRoomLanguage, roomScan360Enabled, beginScan360, speakRoom])

  useEffect(() => { sixCaptureStatusRef.current = sixCaptureStatus || {} }, [sixCaptureStatus])

  useEffect(() => {
    const event = roomCaptureEvent
    if (!event || roomPhase !== 'six' || event.step !== roomCurrentStep?.key) return
    const eventKey = `${event.captureId}:${event.status}`
    if (roomCaptureHandledRef.current === eventKey) return
    roomCaptureHandledRef.current = eventKey
    if (event.preview) {
      setRoomCapturePreview(previous => {
        if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
        return event.preview
      })
    }
    if (event.status === 'ANALYZING') {
      setRoomAiStatus('ANALYZING')
      setRoomAiMessage('Analyzing photo…')
      setRoomAiTaMessage('புகைப்படம் ஆய்வு செய்யப்படுகிறது…')
    } else if (event.status === 'ERROR') {
      setRoomAiStatus('ERROR')
      setRoomAiMessage(event.error || 'Unable to analyze this photo. Try again.')
      setRoomAiTaMessage(event.taError || hireRoomMessage('ta-IN', 'photo_server_error'))
      const errorVoiceKeys = {
        AI_TIMEOUT: 'photo_timeout', UPLOAD_FAILED: 'photo_upload_failed', INVALID_IMAGE: 'photo_invalid',
        ALREADY_ANALYZING: 'photo_analyzing', SERVER_ERROR: 'photo_server_error',
        STEP_OUT_OF_ORDER: 'photo_step_resync', ROOM_PHASE_INVALID: 'room_phase_invalid',
        UNSUPPORTED_STEP: 'unsupported_step', INVALID_LAPTOP_SAMPLE: 'failure_webcam',
      }
      speakRoom({ priority: 'CRITICAL', key: errorVoiceKeys[event.errorCode] || 'photo_server_error' })
    } else if (event.result) {
      const result = event.result
      setSixCaptureStatus(result.sixCaptureStatus || {})
      if (result.observations?.length) {
        setRoomObservations(previous => [...previous, ...result.observations].slice(-50))
      }
      setRoomAiMessage(result.message || hireRoomMessage(activeRoomLanguage, result.guideKey))
      setRoomAiTaMessage(result.taMessage || hireRoomMessage('ta-IN', result.guideKey))
      if (event.status === 'VERIFIED') {
        setRoomAiStatus('SUCCESS')
        speakRoom({ priority: 'SUCCESS', key: `${event.step}_ok`, message: result.message, taMessage: result.taMessage })
        clearTimeout(roomAdvanceTimerRef.current)
        roomAdvanceTimerRef.current = setTimeout(() => advanceRoomStep(event.step), 2200)
      } else {
        setRoomAiStatus('RETRY')
        setRoomCapturePreview(previous => {
          if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
          return null
        })
        speakRoom({ priority: 'RETRY', key: `retake_${event.step}_${result.guideKey}`, message: result.message, taMessage: result.taMessage })
      }
    }
  }, [roomCaptureEvent, roomPhase, roomCurrentStep?.key, activeRoomLanguage, advanceRoomStep, speakRoom])

  const startRoomScanFlow = useCallback(() => {
    stopHireRoomVoice()
    roomScanBatchRef.current = []
    roomGuideSpokenRef.current = { key: null, at: 0 }
    setRoomScanError('')
    const existing = sixCaptureStatus
    const firstPendingIndex = HIRE_ROOM_STEP_LIST.findIndex(step => !existing[step.key]?.verifiedAt)
    if (firstPendingIndex === -1) {
      if (roomScan360Enabled) beginScan360()
      else { setRoomPhase('done'); setRoomScanComplete(true); speakRoom({ priority: 'GENERAL', key: 'all_done' }) }
      return
    }
    const step = { ...HIRE_ROOM_STEP_LIST[firstPendingIndex], index: firstPendingIndex }
    setRoomCurrentStep(step)
    setRoomAiMessage(hireRoomMessage(activeRoomLanguage, `step_${step.key}`) || step.label)
    setRoomAiTaMessage(hireRoomMessage('ta-IN', `step_${step.key}`) || '')
    setRoomAiStatus('GUIDING')
    setRoomPhase('six')
    speakRoom({ priority: 'CURRENT_STEP', key: `step_${step.key}` })
  }, [sixCaptureStatus, roomScan360Enabled, beginScan360, speakRoom, activeRoomLanguage])

  // Keep live transport refs so the 180-degree sampling loop reads current values.
  useEffect(() => { roomStatusRef.current = roomAiStatus }, [roomAiStatus])
  useEffect(() => { feedActiveRef.current = mobileStreamConnected && (remoteVideoReady || !!lastFrameRef.current) }, [mobileStreamConnected, remoteVideoReady])

  useEffect(() => {
    if (!roomScanRequired || roomPhase !== 'idle' || !hireConnectionReady) return
    startRoomScanFlow()
  }, [roomPhase, roomScanRequired, hireConnectionReady, startRoomScanFlow])

  // Review one completed phone recording. No AI request runs during the turn.
  useEffect(() => {
    if (!roomScanRequired || roomPhase !== 'scan360') return
    let disposed = false
    let activeController = null
    reviewScanRecordingRef.current = async () => {
      if (!feedActiveRef.current) {
        if (roomStatusRef.current !== 'ERROR') {
          setRoomAiStatus('ERROR')
          setRoomAiMessage('Mobile feed paused. Reconnecting to your phone…')
          setRoomAiTaMessage('மொபைல் வீடியோ இடைநிறுத்தப்பட்டது. மீண்டும் இணைக்கிறது…')
        }
        return
      }
      {
        // The authenticated paired phone supplied every sampled JPEG.
        if (roomBusyRef.current) return
        const recording = roomScanBatchRef.current
        if (recording.length < 8) {
          // Obviously empty recordings are rejected locally: no AI call, no
          // saved-room comparison, and nothing attributed to the room itself.
          roomScanBatchRef.current = []
          roomRecordingRef.current = false
          setRecordedSamples(0)
          setRoomRecordingStage('retry')
          setRoomScanRestarted(true)
          setRoomScanError('')
          setRoomAiStatus('RETRY')
          setRoomAiMessage(hireRoomMessage(activeRoomLanguage, 'recording_short')
            || 'Recording is too short. Start again at the left view and finish at the right view.')
          setRoomAiTaMessage(hireRoomMessage('ta-IN', 'recording_short') || '')
          speakRoom({ priority: 'RETRY', key: 'recording_short' })
          return
        }
        const maxFrames = 24
        const batch = recording.length <= maxFrames ? recording : Array.from({ length: maxFrames }, (_, index) =>
          recording[Math.round(index * (recording.length - 1) / (maxFrames - 1))])
        roomBusyRef.current = true
        setRoomRecordingStage('reviewing')
        setRoomAiStatus('ANALYZING')
        setRoomAiMessage(hireRoomMessage(activeRoomLanguage, 'recording_reviewing')
          || 'Analyzing room scan...')
        setRoomAiTaMessage(hireRoomMessage('ta-IN', 'recording_reviewing') || '')
        const requestController = new AbortController()
        activeController = requestController
        const requestTimeout = setTimeout(() => requestController.abort(), 65000)
        try {
          const result = await hiringService.analyzeRoomScan360(activeMonitoringSessionId,
            batch.map(item => item.frame), batch.map(item => item.orientation), recentLaptopFrames(90000),
            { signal: requestController.signal })
          if (disposed) return
          if (result.skipped) throw new Error('Room verification policy changed. Reload this page to continue.')
          if (typeof result.coverage === 'number') setRoomScanCoverage(result.coverage)
          if (Array.isArray(result.sectors)) setRoomScanSectors(result.sectors)
          setRoomScanPendingObject(result.pendingObject || null)
          if (result.currentDirection) setRoomScanDirection(result.currentDirection)
          if (result.observations?.length) {
            setRoomObservations(prev => [...prev, ...result.observations.map(obs => ({ objectType: obs.objectType || 'item', confidence: Number(obs.confidence) || 0 }))].slice(-50))
          }
          if (result.rescanRequired || !result.roomScanClear) {
            // The recording is spent either way. Nothing from it carries over,
            // so the next attempt always starts from the saved left view.
            roomScanBatchRef.current = []
            roomScanActiveRef.current = true
            roomRecordingRef.current = false
            setRoomScanCoverage(0)
            setRoomScanSectors([])
            // FLAG means the sweep was usable and something specific has to be
            // dealt with, so it must not be reported as a room mismatch.
            const flagged = result.verdict === 'FLAG'
            setRoomRecordingStage(flagged ? 'flag' : 'retry')
            setRoomScanRestarted(!flagged)
            setRoomScanError('')
            const guide = result.guideKey || 'room_mismatch'
            const message = result.message || hireRoomMessage(activeRoomLanguage, guide)
              || 'The recording did not pass review. Record the left-to-right sweep again.'
            setRoomAiStatus(flagged ? 'FLAG' : 'RETRY')
            setRoomAiMessage(message)
            setRoomAiTaMessage(result.taMessage || hireRoomMessage('ta-IN', guide) || '')
            speakRoom({ priority: 'CRITICAL', key: guide, message, taMessage: result.taMessage })
            return
          }
          const guide = result.guideKey || (result.roomScanClear ? 'scan_complete' : 'coverage_pending')
          setRoomAiMessage(result.message || hireRoomMessage(activeRoomLanguage, guide) || 'Scanning')
          setRoomAiTaMessage(result.taMessage || hireRoomMessage('ta-IN', guide) || '')
          if (result.roomScanClear) {
            roomScanActiveRef.current = false
            setRoomRecordingStage('done')
            setRoomScanError('')
            lastEvidenceRef.current = 0
            setIsFullyVerified(false)
            setWorkspaceVerified(false)
            setRoomAiStatus('SUCCESS')
            setRoomPhase('done')
            setRoomScanComplete(true)
            // Tell the phone to submit its first workspace frame immediately.
            // The regular overlay broadcast is debounced for scan progress.
            const completedState = { ...roomLatestStateRef.current, phase: 'done', complete: true,
              aiStatus: 'SUCCESS', message: result.message, taMessage: result.taMessage,
              coverage: result.coverage, sectors: result.sectors }
            roomLatestStateRef.current = completedState
            socketRef.current?.emit('assessment_verif:room_state', {
              sessionId: sessionData?.sessionId || sessionIdRef.current, state: completedState,
            })
            speakRoom({ priority: 'SUCCESS', key: 'scan_complete', message: result.message, taMessage: result.taMessage })
          }
        } catch (scanError) {
          if (disposed) return
          // A transport or service failure is never evidence about the room, so
          // the candidate is asked to record again without any mismatch claim.
          roomScanBatchRef.current = []
          roomScanActiveRef.current = true
          roomRecordingRef.current = false
          setRoomRecordingStage('retry')
          setRoomScanRestarted(true)
          setRoomScanError('')
          setRoomAiStatus('RETRY')
          const timedOut = scanError.name === 'CanceledError'
          setRoomAiMessage(timedOut
            ? 'Recording review timed out. Please record the room again.'
            : (scanError.message || 'Unable to review the recording. Please record it again.'))
          setRoomAiTaMessage(timedOut
            ? 'பதிவை ஆய்வு செய்ய கால அவகாரம் முடிந்தது. அறையை மீண்டும் பதிவு செய்யவும்.'
            : 'பதிவை ஆய்வு செய்ய முடியவில்லை. அறையை மீண்டும் பதிவு செய்யவும்.')
        } finally {
          clearTimeout(requestTimeout)
          if (activeController === requestController) activeController = null
          roomBusyRef.current = false
        }
      }
    }
    return () => {
      disposed = true
      reviewScanRecordingRef.current = null
      activeController?.abort()
      roomBusyRef.current = false
    }
  }, [roomScanRequired, roomPhase, speakRoom, activeRoomLanguage, activeMonitoringSessionId, recentLaptopFrames, sessionData?.sessionId])

  // Keep the chatbot + page store in sync with the live room state.
  useEffect(() => {
    if (!isHire) return
    hireVerificationStore.set({
      phase: roomPhase,
      step: roomCurrentStep ? { key: roomCurrentStep.key, label: roomCurrentStep.label, index: roomCurrentStep.index } : null,
      steps: sixCaptureStatus,
      coverage: roomScanCoverage,
      sectors: roomScanSectors,
      pendingObject: roomScanPendingObject,
      restarted: roomScanRestarted,
      complete: roomPhase === 'done',
      aiStatus: roomAiStatus,
      retakeReason: roomAiStatus === 'RETRY' ? roomAiMessage : null,
      selectedLanguage: activeRoomLanguage,
      roomScanStatus: roomPhase === 'scan360' ? roomAiStatus : null,
      recordingStage: roomRecordingStage,
      recordedSamples,
    })
  }, [isHire, roomPhase, roomCurrentStep, sixCaptureStatus, roomScanCoverage, roomScanSectors, roomScanDirection, roomScanPendingObject, roomScanRestarted, roomAiStatus, roomAiMessage, activeRoomLanguage, roomRecordingStage, recordedSamples])

  // Drive the phone's full-screen overlay via the shared socket room.
  useEffect(() => {
    if (!isHire || !socketRef.current?.connected) return
    clearTimeout(roomStateEmitTimerRef.current)
    roomStateEmitTimerRef.current = setTimeout(() => {
      const state = {
          phase: roomPhase,
          step: roomCurrentStep ? { key: roomCurrentStep.key, label: roomCurrentStep.label, index: roomCurrentStep.index } : null,
          steps: sixCaptureStatus,
          coverage: roomScanCoverage,
          sectors: roomScanSectors,
          currentDirection: roomScanDirection,
          pendingObject: roomScanPendingObject,
          restarted: roomScanRestarted,
          complete: roomPhase === 'done',
          aiStatus: roomAiStatus,
          message: roomAiMessage,
          taMessage: roomAiTaMessage,
          language: activeRoomLanguage,
          voiceEnabled: roomVoiceEnabled && hirePolicy?.voiceWarnings !== false,
          laptopCameraReady,
          recordingStage: roomRecordingStage,
          recordedSamples,
      }
      roomLatestStateRef.current = state
      socketRef.current.emit('assessment_verif:room_state', {
        sessionId: sessionData?.sessionId || sessionIdRef.current,
        state,
      })
    }, 400)
    return () => clearTimeout(roomStateEmitTimerRef.current)
  }, [isHire, roomPhase, roomCurrentStep, sixCaptureStatus, roomScanCoverage, roomScanSectors, roomScanDirection, roomScanPendingObject, roomScanRestarted, roomAiStatus, roomAiMessage, roomAiTaMessage, activeRoomLanguage, roomVoiceEnabled, hirePolicy?.voiceWarnings, sessionData?.sessionId, laptopCameraReady, roomRecordingStage, recordedSamples])

  useEffect(() => () => {
    stopHireRoomVoice()
    hireVerificationStore.reset()
    if (roomStateEmitTimerRef.current) clearTimeout(roomStateEmitTimerRef.current)
    if (roomAdvanceTimerRef.current) clearTimeout(roomAdvanceTimerRef.current)
  }, [])

  if (isHire && (loading || (hirePolicy?.enabled && !activeMonitoringSessionId))) {
    return (
<Layout user={user} activeTab="hiring-assessments" onLogout={onLogout} hideSidebar>
        <div className="reg-admin-section" style={{ maxWidth: 680, margin: '60px auto', padding: 36, textAlign: 'center' }}>
          <Loader2 size={36} className="bulk-spin" style={{ margin: '0 auto 16px', color: '#16A34A' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>
            Preparing Hire Assessment Session
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0 }}>
            Initializing secure verification environment… Please wait.
          </p>
        </div>
      </Layout>
    )
  }

if (isHire && hirePolicy?.enabled && hirePolicy.identityVerification && !identityReady && ((!hirePolicy.mobileRoomScan && !hirePolicy.roomScan360Enabled) || (roomScanComplete && workspaceVerified))) {
    return <Layout user={user} activeTab="hiring-assessments" onLogout={onLogout} hideSidebar><HireIdentityGate sessionId={activeMonitoringSessionId} policy={hirePolicy} onVerified={() => setIdentityReady(true)} /></Layout>
  }

if (isHire && hirePolicy && (!hirePolicy.enabled || (!hirePolicy.mobileRoomScan && !hirePolicy.roomScan360Enabled))) {
    return <Layout user={user} activeTab="hiring-assessments" onLogout={onLogout} hideSidebar><div className="reg-admin-section" style={{ maxWidth: 680, margin: '40px auto', padding: 28, textAlign: 'center' }}><Shield size={36} color="#059669" /><h2>Hire verification ready</h2><p style={{ color: '#64748B' }}>{hirePolicy.enabled ? 'Required identity checks are complete. Room scanning is disabled for this assessment.' : 'AI proctoring is disabled for this assessment.'}</p><button className="reg-admin-btn reg-admin-btn--primary" onClick={handleStartQuiz} disabled={verifyingStart}>{verifyingStart && <Loader2 size={15} className="bulk-spin" />} Proceed to {isCoding ? 'Coding Assessment' : 'Quiz'}</button></div></Layout>
  }

  return (
    <Layout
      user={user}
activeTab={trainingId === 'hire' || isHire ? 'hiring-assessments' : 'myEnrollments'}
      hideSidebar={isHire}
      onTabChange={(tab, cId) => {
        if (tab === 'profile') navigate('/my-profile')
        else if (tab === 'interviews') navigate('/interviews')
        else navigate(`/participant?tab=${tab}${cId ? `&courseId=${cId}` : ''}`)
      }}
      onLogout={onLogout}
    >
      <div className="wi-verif-page">
        {/* ── Breadcrumb Navigation ── */}
        <div className="wi-verif-breadcrumb-row">
          <nav className="wi-verif-breadcrumb">
            <Link to={trainingId === 'hire' || isHire ? '/participant?tab=hiring-assessments' : '/participant?tab=myEnrollments'}>
              {trainingId === 'hire' || isHire ? 'Hiring Assessments' : 'My Courses'}
            </Link>
            <span className="wi-verif-breadcrumb-sep">/</span>
            <span
              style={{ cursor: 'pointer', color: '#16A34A', fontWeight: 500 }}
              onClick={handleBackToQuiz}
            >
              {courseDisplayName}
            </span>
            <span className="wi-verif-breadcrumb-sep">/</span>
            <span style={{ color: '#16A34A', fontWeight: 600 }}>{isCoding ? 'Coding Assessment - Verification' : 'AI Quiz - Verification'}</span>
          </nav>
        </div>

        {/* ── Page Title Row ── */}
        <div className="wi-verif-title-row">
          <div className="wi-verif-title-left">
            <button
              onClick={handleBackToQuiz}
              className="wi-verif-round-btn"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="wi-verif-heading">
                {hireFlowPage
                  ? (roomScanComplete ? 'Hire Workspace Verification' : 'AI-Guided Room Verification')
                  : isHire
                  ? (isCoding ? 'Hire Coding Assessment – Camera Verification' : 'Hire Assessment – Camera Verification')
                  : (isCoding ? 'Coding Assessment – Mobile Camera Verification' : 'AI Quiz – Mobile Camera Verification')
                }
              </h1>
              <p className="wi-verif-subheading">Secure proctoring with multi-angle identity verification</p>
            </div>
          </div>

          <div className="wi-verif-actions-right">
            <button onClick={handleBackToQuiz} className="wi-verif-back-btn">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="wi-verif-progress-pill">
              <span className="wi-verif-pulse-dot" />
              <span>Assessment in Progress</span>
            </div>
          </div>
        </div>

        {/* ── Horizontal Assessment Summary Card ── */}
        <div className="wi-verif-summary-card">
          <div className="wi-verif-summary-item">
            <div className="wi-verif-summary-icon">
              {isCoding ? <Code size={20} strokeWidth={2.2} /> : <Sparkles size={20} strokeWidth={2.2} />}
            </div>
            <div className="wi-verif-summary-text">
              <span className="wi-verif-summary-label">Assessment</span>
              <span className="wi-verif-summary-value">{quizDisplayName}</span>
            </div>
          </div>

          <div className="wi-verif-summary-item">
            <div className="wi-verif-summary-icon">
              <Clock size={20} strokeWidth={2.2} />
            </div>
            <div className="wi-verif-summary-text">
              <span className="wi-verif-summary-label">Duration</span>
              <span className="wi-verif-summary-value">{durationDisplay}</span>
            </div>
          </div>

          <div className="wi-verif-summary-item">
            <div className="wi-verif-summary-icon">
              <Star size={20} strokeWidth={2.2} />
            </div>
            <div className="wi-verif-summary-text">
              <span className="wi-verif-summary-label">Total Marks</span>
              <span className="wi-verif-summary-value">{marksDisplay}</span>
            </div>
          </div>

          <div className="wi-verif-summary-item">
            <div className="wi-verif-summary-icon">
              <FileText size={20} strokeWidth={2.2} />
            </div>
            <div className="wi-verif-summary-text">
              <span className="wi-verif-summary-label">Attempt</span>
              <span className="wi-verif-summary-value">1 of 1</span>
            </div>
          </div>
        </div>

        {/* ── Main 2-Column Verification Card ── */}
        <div className={`wi-verif-main-card ${hireFlowPage ? 'wi-hire-flow-page' : ''}`}>
          <div className="wi-verif-split-grid">
            {/* ── LEFT COLUMN: QR Scan ── */}
            <div className="wi-verif-col wi-verif-qr-column">
              <div className="wi-verif-col-header">
                <span className="wi-verif-num-badge">1</span>
                <h2 className="wi-verif-col-title">Scan with Mobile Camera</h2>
              </div>
              <p className="wi-verif-col-desc">
                Use your mobile phone camera to scan the QR code and pair your side camera feed.
              </p>

              <div className="wi-verif-steps-box">
                <div className="wi-verif-steps-title">
                  <Sparkles size={14} className="wi-verif-steps-icon" />
                  <span>Steps to Follow</span>
                </div>
                <ol className="wi-verif-steps-list">
                  <li>Open camera on your mobile device</li>
                  <li>Scan the QR code shown below</li>
                  <li>Allow camera access when prompted</li>
                  <li>{isHire ? 'Keep the live mobile video stream open' : 'Position phone at a 45° angle to capture desk & hands'}</li>
                </ol>
              </div>

              {/* QR Code Container */}
              <div className="wi-verif-qr-wrapper">
                <div className="wi-verif-qr-frame">
                  <div className="wi-verif-qr-corner wi-verif-qr-corner--tl" />
                  <div className="wi-verif-qr-corner wi-verif-qr-corner--tr" />
                  <div className="wi-verif-qr-corner wi-verif-qr-corner--bl" />
                  <div className="wi-verif-qr-corner wi-verif-qr-corner--br" />

                  <div className="wi-verif-qr-inner">
                    {loading ? (
                      <div className="wi-verif-qr-loading">
                        <Loader2 size={34} className="animate-spin text-emerald-600" />
                        <span className="wi-verif-qr-loading-text">Generating secure QR...</span>
                      </div>
                    ) : error ? (
                      <div className="wi-verif-qr-loading">
                        <AlertCircle size={34} color="#dc2626" />
                        <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 13 }}>{error}</span>
                        <button onClick={handleRefreshQR} className="wi-verif-retry-btn">
                          <RefreshCw size={13} /> Retry
                        </button>
                      </div>
                    ) : isExpired ? (
                      <div className="wi-verif-qr-loading">
                        <Clock size={34} color="#f59e0b" />
                        <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 13 }}>QR Code Expired</span>
                        <button onClick={handleRefreshQR} className="wi-verif-retry-btn">
                          <RefreshCw size={13} /> Refresh QR
                        </button>
                      </div>
                    ) : !mobilePairUrl ? (
                      <div className="wi-verif-qr-loading">Finding this laptop's current Wi-Fi address…</div>
                    ) : (
                      <div className="wi-verif-qr-content">
                        <QRCodeSVG
                          value={mobilePairUrl}
                          size={180}
                          level="M"
                          includeMargin={false}
                        />
                        {qrScanned && (
                          <div className="wi-verif-qr-scanned-overlay">
                            <CheckCircle2 size={42} color="#16a34a" />
                            <span>QR Scanned!</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="wi-verif-qr-footer">
                  <div className="wi-verif-timer-row">
                    <Clock size={14} className="wi-verif-clock-icon" />
                    <span>Expires in <strong className="wi-verif-timer-digits">{formattedTimer}</strong></span>
                  </div>
                  <button
                    onClick={handleRefreshQR}
                    disabled={refreshing || loading || hireFlowPage}
                    className={hireFlowPage ? 'wi-verif-refresh-btn wi-verif-refresh-btn-hidden' : 'wi-verif-refresh-btn'}
                    title="Refresh QR Code"
                  >
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Live Stream & Checklist ── */}
            <div className="wi-verif-col">
              <div className="wi-verif-col-header">
                <span className="wi-verif-num-badge">2</span>
                <h2 className="wi-verif-col-title">{hireFlowPage ? (roomScanComplete ? 'Hand & Laptop Check' : 'AI-Guided Room Verification') : 'Live Mobile Camera Feed'}</h2>
              </div>
              <p className="wi-verif-col-desc">
                {hireFlowPage
                  ? (roomScanComplete ? 'Show your hand and laptop together in the mobile camera.' : 'Complete five guided room photos, then the 180° room scan.')
                  : 'Once paired, your mobile stream will appear below in real-time.'}
              </p>
              {hireFlowPage && <div className="wi-hire-stage-banner"><CheckCircle2 size={17} /> {mobileStreamConnected ? 'Mobile camera connected' : 'Mobile camera reconnecting…'}
                {!mobileStreamConnected && <button type="button" onClick={() => setHireRoomPageStarted(false)}>Show pairing QR</button>}
              </div>}

              {/* Video Preview Container */}
              <div
                ref={previewContainerRef}
                className={`wi-verif-video-box ${remoteVideoReady || lastFrame ? 'is-live' : ''}`}
              >
                <video
                  ref={(el) => {
                    videoRef.current = el
                    if (el && remoteStream && el.srcObject !== remoteStream) {
                      el.srcObject = remoteStream
                      el.play().catch(() => {})
                    }
                  }}
                  autoPlay
                  onPlaying={() => { setRemoteVideoReady(true); setMobileStreamConnected(true) }}
                  playsInline
                  muted
                  className={`wi-verif-video-el ${remoteVideoReady ? 'block' : 'hidden'}`}
                />

                {!remoteVideoReady && lastFrame && (
                  <img
                    src={lastFrame}
                    alt="Live Mobile Feed"
                    className="wi-verif-video-el block object-cover"
                  />
                )}

                {!remoteVideoReady && !lastFrame && (
                  <div className="wi-verif-video-placeholder">
                    {loading ? (
                      <Loader2 size={36} className="animate-spin text-slate-400" />
                    ) : qrScanned ? (
                      <div className="wi-verif-stream-connecting">
                        <RefreshCw size={32} className="animate-spin text-emerald-400" />
                        <span className="wi-verif-stream-title-connecting">Connecting mobile video…</span>
                        <span className="wi-verif-stream-sub-connecting">{transportError || (mobileCameraReady ? 'Camera access granted. Waiting for video from your phone.' : 'Waiting for camera permission on your phone.')}</span>
                      </div>
                    ) : (
                      <div className="wi-verif-stream-idle">
                        <div className="wi-verif-camera-icon-wrap">
                          <Video size={24} strokeWidth={1.75} />
                        </div>
                        <span className="wi-verif-stream-title">Awaiting Mobile Camera</span>
                        <span className="wi-verif-stream-sub">Scan QR code on left to connect</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Status Badges on Video */}
                <div className="wi-verif-video-overlay-top">
                  <div className={`wi-verif-live-pill ${remoteVideoReady || lastFrame ? 'is-live' : ''}`}>
                    <Radio size={12} className={remoteVideoReady || lastFrame ? 'animate-pulse text-emerald-400' : ''} />
                    <span>{remoteVideoReady || lastFrame ? 'LIVE FEED' : 'STANDBY'}</span>
                  </div>
                  <button onClick={toggleFullscreen} className="wi-verif-icon-btn" title="Toggle Fullscreen">
                    {isFullscreenVideo ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>

                <div className="wi-verif-video-overlay-bottom">
                  <span className="wi-verif-source-pill">
                    <Camera size={12} /> Secondary Mobile Feed
                  </span>
                </div>
              </div>

              {/* Real-time Checklist */}
              <div className="wi-verif-checklist-box">
                <div className="wi-verif-checklist-title">Verification Checklist</div>
                <div className="wi-verif-checklist-items">
                  <div className={`wi-verif-check-item ${qrScanned ? 'is-done' : ''}`}>
                    <div className="wi-verif-check-left">
                      <div className="wi-verif-check-circle">
                        {qrScanned ? <Check size={13} strokeWidth={3} /> : <span className="wi-verif-check-dot" />}
                      </div>
                      <span className="wi-verif-check-text">QR Code Scanned</span>
                    </div>
                    <span className={`wi-verif-check-pill ${qrScanned ? 'is-done' : ''}`}>
                      {qrScanned ? '✓ Completed' : 'Waiting...'}
                    </span>
                  </div>

                  <div className={`wi-verif-check-item ${participantValidated ? 'is-done' : ''}`}>
                    <div className="wi-verif-check-left">
                      <div className="wi-verif-check-circle">
                        {participantValidated ? <Check size={13} strokeWidth={3} /> : <span className="wi-verif-check-dot" />}
                      </div>
                      <span className="wi-verif-check-text">Mobile Device Validated</span>
                    </div>
                    <span className={`wi-verif-check-pill ${participantValidated ? 'is-done' : ''}`}>
                      {participantValidated ? '✓ Completed' : 'Waiting...'}
                    </span>
                  </div>

                  <div className={`wi-verif-check-item ${mobileCameraReady ? 'is-done' : ''}`}>
                    <div className="wi-verif-check-left">
                      <div className="wi-verif-check-circle">
                        {mobileCameraReady ? <Check size={13} strokeWidth={3} /> : <span className="wi-verif-check-dot" />}
                      </div>
                      <span className="wi-verif-check-text">Camera Permission Allowed</span>
                    </div>
                    <span className={`wi-verif-check-pill ${mobileCameraReady ? 'is-done' : ''}`}>
                      {mobileCameraReady ? '✓ Completed' : 'Waiting...'}
                    </span>
                  </div>

                  <div className={`wi-verif-check-item ${mobileStreamConnected && (remoteVideoReady || lastFrame) ? 'is-done' : ''}`}>
                    <div className="wi-verif-check-left">
                      <div className="wi-verif-check-circle">
                        {mobileStreamConnected && (remoteVideoReady || lastFrame) ? <Check size={13} strokeWidth={3} /> : <span className="wi-verif-check-dot" />}
                      </div>
                      <span className="wi-verif-check-text">Live Video Stream Active</span>
                    </div>
                    <span className={`wi-verif-check-pill ${mobileStreamConnected && (remoteVideoReady || lastFrame) ? 'is-done' : ''}`}>
                      {mobileStreamConnected && (remoteVideoReady || lastFrame) ? '✓ Active' : 'Waiting...'}
                    </span>
                  </div>
                  {isHire && hirePolicy?.enabled && roomScanComplete && (
                    <div className={`wi-verif-check-item ${workspaceVerified ? 'is-done' : ''}`}>
                      <div className="wi-verif-check-left">
                        <div className="wi-verif-check-circle">
                          {workspaceVerified ? <Check size={13} strokeWidth={3} /> : <span className="wi-verif-check-dot" />}
                        </div>
                        <span className="wi-verif-check-text">Hand & Laptop Verified</span>
                      </div>
                      <span className={`wi-verif-check-pill ${workspaceVerified ? 'is-done' : ''}`}>
                        {workspaceVerified ? '✓ Completed' : 'Checking...'}
                      </span>
                    </div>
                  )}
                </div>
                {isHire && roomScanComplete && !workspaceVerified && <p role="status" style={{ margin: '8px 4px 0', color: '#475569', fontSize: 13 }}>
                  Place the phone where your hand and laptop are visible together. {compositionMessage}
                </p>}
                {isHire && roomScanComplete && !workspaceVerified && <button type="button"
                  onClick={() => speakHireRoomVoice({ priority: 'CURRENT_STEP', language: activeRoomLanguage,
                    key: 'workspace_start', force: true, rate: hirePolicy?.voiceRate ?? 0.95,
                    volume: hirePolicy?.voiceVolume ?? 1 })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '4px 4px 8px', padding: '5px 8px' }}>
                  <Volume2 size={14} /> Play hand and laptop instructions
                </button>}
              </div>

{isHire && roomScanRequired && <div className="wi-verif-checklist-box wi-room-flow" style={{ marginTop: 12 }}>
                <div className="wi-verif-checklist-title">AI-Guided Room Verification</div>
                {roomPhase !== 'done' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', fontSize: 12, color: '#475569' }}>
                  <video ref={laptopPreviewRef} autoPlay muted playsInline aria-label="Laptop camera movement preview"
                    style={{ width: 112, borderRadius: 6, background: '#0f172a' }} />
                  <span>{laptopCameraStatus}</span>
                </div>}

                <div className="wi-room-toolbar">
                  <div className="wi-room-lang-toggle" role="group" aria-label="Voice language">
                    <button type="button" className={`wi-room-lang-btn ${!activeRoomIsTa ? 'is-active' : ''}`} onClick={() => setRoomLanguage(setHireRoomLanguage('en-IN'))} disabled={hirePolicy?.allowParticipantLanguage === false}>English</button>
                    <button type="button" className={`wi-room-lang-btn ${activeRoomIsTa ? 'is-active' : ''}`} onClick={() => setRoomLanguage(setHireRoomLanguage('ta-IN'))} disabled={hirePolicy?.allowParticipantLanguage === false}>தமிழ்</button>
                  </div>
                  <button type="button" className="wi-room-voice-btn" onClick={() => setRoomVoiceEnabled(value => !value)} title={roomVoiceEnabled ? 'Mute voice' : 'Unmute voice'} aria-label={roomVoiceEnabled ? 'Mute voice' : 'Unmute voice'}>
                    {roomVoiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  </button>
                  <button type="button" className="wi-room-voice-btn" title="Play current instructions" aria-label="Play current instructions"
                    onClick={() => speakHireRoomVoice({ priority: 'CURRENT_STEP', language: activeRoomLanguage,
                      key: roomPhase === 'scan360' ? 'start_360' : roomPhase === 'done' ? 'workspace_start' : `step_${roomCurrentStep?.key || 'front'}`,
                      message: roomAiMessage || undefined, taMessage: roomAiTaMessage || undefined,
                      rate: hirePolicy?.voiceRate ?? 0.95, volume: hirePolicy?.voiceVolume ?? 1, force: true })}>
                    <Volume2 size={14} /> Play instructions
                  </button>
                </div>

                <div className="wi-room-steps-track" aria-label="Room capture progress">
                  {HIRE_ROOM_STEP_LIST.map((step, index) => {
                    const done = !!sixCaptureStatus[step.key]?.verifiedAt
                    const isCurrent = roomCurrentStep?.key === step.key
                    return (
                      <div key={step.key} className={`wi-room-step-dot ${done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`} title={step.label}>
                        {done ? <Check size={11} strokeWidth={3} /> : <span>{index + 1}</span>}
                      </div>
                    )
                  })}
                </div>

                {roomPhase !== 'done' ? (
                  <>
                    {roomCurrentStep && roomPhase === 'six' && (
                      <div className="wi-room-guide">
                        <div className="wi-room-guide-arrow" data-dir={roomCurrentStep.key}>
                          {roomCurrentStep.key === 'left' ? <MoveLeft size={26} /> : roomCurrentStep.key === 'right' ? <MoveRight size={26} /> : <ScanLine size={26} />}
                        </div>
                        <div className="wi-room-guide-text">
                          <span className="wi-room-guide-step">Step {roomCurrentStep.index + 1} of {HIRE_ROOM_TOTAL_STEPS} — {roomCurrentStep.label}</span>
                          <span className="wi-room-guide-instruction">{activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</span>
                        </div>
                      </div>
                    )}

                    {roomPhase === 'scan360' && (
                      <div className="wi-room-guide">
                        <div className="wi-room-guide-arrow" data-dir="360"><ScanLine size={26} /></div>
                        <div className="wi-room-guide-text">
                          <span className="wi-room-guide-step">180° Room Scan — Left → Front → Right</span>
                          <span className="wi-room-guide-instruction">{activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</span>
                        </div>
                      </div>
                    )}

                    {roomPhase === 'scan360' && (roomRecordingStage === 'retry' || roomRecordingStage === 'flag') && (
                      <div className="wi-room-restart-banner" role="alert">
                        <AlertCircle size={16} />
                        {(activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage)
                          || 'Recording did not pass review. Start a new recording on the phone from the saved left view.'}
                      </div>
                    )}

                    {roomPhase === 'scan360' && (
                      <div className="wi-room-coverage">
                        <div className="wi-room-coverage-label"><span>180° room recording</span><span>{recordedSamples} samples captured</span></div>
                        <div className="wi-room-sector-summary">
                          <span>{roomRecordingStage === 'recording' ? 'Recording now. The phone will send the video for review when you tap Finish.' :
                            roomRecordingStage === 'reviewing' ? 'Analyzing room scan…' :
                              roomRecordingStage === 'flag' ? 'Clear the room as instructed, then record the sweep again on the phone.' :
                                roomRecordingStage === 'retry' ? 'On the phone, tap Start recording again, turn left → front → right, then tap Finish.' :
                                  'On the phone, tap Start recording, turn left → front → right, then tap Finish.'}</span>
                        </div>
                      </div>
                    )}

                    {roomPhase === 'six' && roomCapturePreview && (
                      <div className="wi-room-photo-preview">
                        <img src={roomCapturePreview} alt={`${roomCurrentStep?.label || 'Room'} captured on mobile`} />
                        <span>Photo captured on your phone</span>
                      </div>
                    )}

                    <div className={`wi-room-status wi-room-status--${String(roomAiStatus).toLowerCase()}`}>
                      {roomAiStatus === 'ANALYZING' && <><Loader2 size={13} className="bulk-spin" /> {roomPhase === 'six' ? 'Analyzing photo…'
                        : 'Analyzing room scan…'}</>}
                      {roomAiStatus === 'GUIDING' && <><ScanLine size={13} /> {roomPhase === 'six' ? 'Capture this photo on your phone' : 'Turn slowly from left through front to right'}</>}
                      {roomAiStatus === 'RETRY' && <><AlertCircle size={13} /> {roomPhase === 'six' ? 'Photo not verified — follow the phone guidance' : 'Scan incomplete — please record the room again'}</>}
                      {roomAiStatus === 'FLAG' && <><AlertCircle size={13} /> {activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</>}
                      {roomAiStatus === 'ERROR' && <><AlertCircle size={13} /> {activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</>}
                      {roomAiStatus === 'SUCCESS' && <><CheckCircle2 size={13} /> Captured — moving on</>}
                    </div>

                    {roomScanError && <p role="alert" className="wi-room-error">{roomScanError}</p>}

                    <p className="wi-room-note">{HIRE_ROOM_STEP_LIST.filter(step => sixCaptureStatus[step.key]?.verifiedAt).length}/{HIRE_ROOM_TOTAL_STEPS} photos verified</p>

                    {roomObservations.length > 0 && (
                      <p className="wi-room-note">{roomObservations.length} observation{roomObservations.length > 1 ? 's' : ''} saved for review. {roomAiStatus === 'RETRY' ? 'Correct the issue and retake this photo.' : ''}</p>
                    )}
                  </>
                ) : (
                  <div className="wi-room-complete">
                    <BadgeCheck size={30} color="#16a34a" />
                    <div>
                      <strong>{HIRE_ROOM_TOTAL_STEPS}/{HIRE_ROOM_TOTAL_STEPS} room photos verified · 180° room verified</strong>
                      <span>Now show your hand and laptop together in the mobile camera.</span>
                    </div>
                  </div>
                )}
              </div>}

              {/* Start Assessment CTA Button */}
              {(!isHire || !roomScanRequired || (roomScanComplete && workspaceVerified && identityReady)) && <div className="wi-verif-start-btn-wrap">
                {isHire && roomScanRequired && <div className={`wi-hire-system-check ${isFullyVerified && mobileStreamConnected && !isExpired && !isDisconnected ? 'is-done' : ''}`} role="status">
                  <Shield size={18} /> <span>{isFullyVerified && mobileStreamConnected && !isExpired && !isDisconnected
                    ? 'System check complete — mobile camera and workspace monitoring are ready.'
                    : 'System check in progress — keep the mobile camera connected and workspace visible.'}</span>
                </div>}
                <p role="status">{transportError || (isFullyVerified
                  ? (isHire ? 'Hand and laptop verified — ready for monitoring.' : 'Person and laptop verified — ready for monitoring.')
                  : compositionMessage)}</p>
                <button
                  onClick={handleStartQuiz}
                  disabled={verifyingStart || loading || !isFullyVerified || !mobileStreamConnected || isExpired || isDisconnected || (isHire && roomScanRequired && !workspaceVerified)}
                  className="wi-verif-start-btn"
                >
                  {verifyingStart ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Starting Assessment...</span>
                    </>
                  ) : (
                    <>
                      <Shield size={18} />
                      <span>Proceed to {isCoding ? 'Coding Assessment' : 'Quiz'}</span>
                    </>
                  )}
                </button>
              </div>}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
