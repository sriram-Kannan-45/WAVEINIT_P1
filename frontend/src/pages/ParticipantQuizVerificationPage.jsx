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
  Undo2,
  BadgeCheck
} from 'lucide-react'
import Layout from '../components/Layout'
import { API_BASE, BACKEND_ORIGIN } from '../api/api'
import { buildAssessmentMobileUrl } from '../utils/assessmentPairingUrl'
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
  { key: 'back', label: 'Back' },
  { key: 'right', label: 'Right' },
  { key: 'desk', label: 'Desk' },
  { key: 'floor', label: 'Floor' },
]

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
  const [roomGuideKey, setRoomGuideKey] = useState(null)
  const [roomCurrentStep, setRoomCurrentStep] = useState(null)
  const [sixCaptureStatus, setSixCaptureStatus] = useState({})
  const [roomScanCoverage, setRoomScanCoverage] = useState(0)
  const [roomAttempts, setRoomAttempts] = useState(0)
  const [roomVoiceEnabled, setRoomVoiceEnabled] = useState(true)
  const [roomLanguage, setRoomLanguage] = useState(() => getHireRoomLanguage())
  const [roomObservations, setRoomObservations] = useState([])
  const roomLoopRef = useRef(null)
  const roomScanBatchRef = useRef([])
  const roomStepRef = useRef(null)
  const roomBusyRef = useRef(false)
  const roomStatusRef = useRef('idle')
  const feedActiveRef = useRef(false)
  const roomGuideSpokenRef = useRef({ key: null, at: 0 })
  const roomStateEmitTimerRef = useRef(null)

useEffect(() => {
    if (!isHire || !effectiveId) return
    hiringService.getProctoringPolicy(currentAssessmentType, effectiveId, activeMonitoringSessionId).then(result => {
      setHirePolicy(result.policy)
      if (activeAttemptId || attemptId) sessionStorage.setItem(`hire_proctor_policy_${activeAttemptId || attemptId}`, JSON.stringify(result.policy))
      if (!result.policy.enabled || !result.policy.identityVerification || result.state?.identityVerifiedAt) setIdentityReady(true)
      if (result.state?.roomScanClear) setRoomScanComplete(true)
      if (result.state?.sixCaptureStatus) setSixCaptureStatus(result.state.sixCaptureStatus)
      if (typeof result.state?.roomScanCoverage === 'number') setRoomScanCoverage(result.state.roomScanCoverage)
      if (Array.isArray(result.state?.roomObservations)) setRoomObservations(result.state.roomObservations)
      if (result.state?.roomScanClear) setRoomPhase('done')
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
  const [compositionMessage, setCompositionMessage] = useState("Show both yourself and your laptop in the mobile camera.")
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
        let curAttemptId = activeAttemptId
        let curSessionToken = activeSessionToken

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
                monitoringSessionId: activeMonitoringSessionId || '',
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
  }, [effectiveId, isCoding, attemptId, sessionToken, activeToken, trainingId, user?.id, currentAssessmentType])

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

  const isExpired = (timeLeft <= 0 && !loading && sessionData) || sessionData?.status === 'EXPIRED'

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
      setQrScanned(true)
      setParticipantValidated(true)
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
        socket.emit('assessment_verif:frame_received', { sessionId: currentSessionId })
        setLastFrame(frame)
        setMobileStreamConnected(true)
        setMobileCameraReady(true)
        setQrScanned(true)
        setParticipantValidated(true)
        setIsDisconnected(false)
      }
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
        setIsDisconnected(false)
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
      if (!hireWithoutMobile && (!isFullyVerified || !mobileStreamConnected || isExpired || isDisconnected)) throw new Error('Wait for stable person and laptop verification.')
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
  const mobilePairUrl = buildAssessmentMobileUrl(sessionData?.qrPayload?.shortUrl)

const roomScanRequired = isHire && hirePolicy?.enabled && (hirePolicy.mobileRoomScan || hirePolicy.roomScan360Enabled)
  const roomScan360Enabled = hirePolicy?.roomScan360Enabled !== false
  const roomScanThreshold = hirePolicy?.roomScanCoverageThreshold || 85
  const allSixCaptured = HIRE_ROOM_STEP_LIST.every(step => !!sixCaptureStatus[step.key]?.verifiedAt)
  const activeRoomLanguage = hirePolicy?.allowParticipantLanguage === false ? (hirePolicy.defaultLanguage || 'en-IN') : roomLanguage
  const activeRoomIsTa = String(activeRoomLanguage).toLowerCase().startsWith('ta')

  const captureFrame = useCallback(() => {
    let frame = lastFrame
    const video = videoRef.current
    try {
      if (video?.videoWidth) {
        const canvas = document.createElement('canvas')
        canvas.width = 480
        canvas.height = Math.round(480 * video.videoHeight / video.videoWidth)
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        frame = canvas.toDataURL('image/jpeg', 0.72)
      }
    } catch (e) { /* fall back to last known frame */ }
    return frame
  }, [lastFrame])

  const speakRoom = useCallback(({ priority, key, message, taMessage }) => {
    if (!hirePolicy?.voiceWarnings || !roomVoiceEnabled) return
    const language = activeRoomLanguage
    speakHireRoomVoice({ priority, language, key, message, taMessage, rate: hirePolicy.voiceRate ?? 0.95, volume: hirePolicy.voiceVolume ?? 1 })
  }, [hirePolicy, roomVoiceEnabled, activeRoomLanguage])

  const beginScan360 = useCallback(() => {
    roomScanBatchRef.current = []
    setRoomGuideKey('start_360')
    setRoomAiMessage(hireRoomMessage(activeRoomLanguage, 'start_360') || 'Slowly turn in a full circle')
    setRoomAiTaMessage(hireRoomMessage('ta-IN', 'start_360') || '')
    setRoomAiStatus('GUIDING')
    setRoomPhase('scan360')
    speakRoom({ priority: 'CURRENT_STEP', key: 'start_360' })
  }, [activeRoomLanguage, speakRoom])

  const advanceRoomStep = useCallback((verifiedStepKey) => {
    const currentIndex = HIRE_ROOM_STEP_LIST.findIndex(step => step.key === verifiedStepKey)
    const next = HIRE_ROOM_STEP_LIST[currentIndex + 1]
    if (next) {
      setRoomCurrentStep({ ...next, index: currentIndex + 1 })
      setRoomGuideKey(`step_${next.key}`)
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
    setRoomGuideKey(`step_${step.key}`)
    setRoomAiMessage(hireRoomMessage(activeRoomLanguage, `step_${step.key}`) || step.label)
    setRoomAiTaMessage(hireRoomMessage('ta-IN', `step_${step.key}`) || '')
    setRoomAiStatus('GUIDING')
    setRoomPhase('six')
    speakRoom({ priority: 'CURRENT_STEP', key: `step_${step.key}` })
  }, [sixCaptureStatus, roomScan360Enabled, beginScan360, speakRoom, activeRoomLanguage])

  const handleRetakeRoomStep = useCallback((stepKey) => {
    stopHireRoomVoice()
    setSixCaptureStatus(prev => ({ ...prev, [stepKey]: { ...(prev[stepKey] || {}), verifiedAt: null } }))
    const index = HIRE_ROOM_STEP_LIST.findIndex(step => step.key === stepKey)
    setRoomCurrentStep({ ...HIRE_ROOM_STEP_LIST[index], index })
    roomGuideSpokenRef.current = { key: null, at: 0 }
    if (roomPhase === 'scan360') setRoomPhase('six')
    setRoomAiStatus('GUIDING')
    setRoomAiMessage(hireRoomMessage(activeRoomLanguage, 'redo_step') || 'Show the area clearly')
    setRoomAiTaMessage(hireRoomMessage('ta-IN', 'redo_step') || '')
    speakRoom({ priority: 'RETRY', key: 'redo_step' })
  }, [activeRoomLanguage, roomPhase, speakRoom])

  // Keep live-step refs so the room sampling loop reads current values.
  useEffect(() => { roomStepRef.current = roomCurrentStep }, [roomCurrentStep])
  useEffect(() => { roomStatusRef.current = roomAiStatus }, [roomAiStatus])
  useEffect(() => { feedActiveRef.current = remoteVideoReady || !!lastFrame || webRtcConnected }, [remoteVideoReady, lastFrame, webRtcConnected])

  useEffect(() => {
    if (!roomScanRequired || roomPhase !== 'idle' || !feedActiveRef.current) return
    startRoomScanFlow()
  }, [roomPhase, roomScanRequired, startRoomScanFlow])

  useEffect(() => {
    if (roomPhase === 'scan360' && allSixCaptured && roomScanCoverage >= roomScanThreshold) {
      setRoomPhase('done')
      setRoomScanComplete(true)
      speakRoom({ priority: 'SUCCESS', key: 'all_done' })
    }
  }, [roomPhase, allSixCaptured, roomScanCoverage, roomScanThreshold, speakRoom])

  // AI-Guided sampling loop: six guided steps, then the 360 sweep.
  useEffect(() => {
    if (!roomScanRequired || (roomPhase !== 'six' && roomPhase !== 'scan360')) return
    const phase = roomPhase
    const interval = setInterval(async () => {
      if (roomBusyRef.current) return
      if (!feedActiveRef.current) {
        if (roomStatusRef.current !== 'ERROR') {
          setRoomAiStatus('ERROR')
          setRoomAiMessage('Mobile feed paused. Reconnecting to your phone…')
          setRoomAiTaMessage('மொபைல் வீடியோ இடைநிறுத்தப்பட்டது. மீண்டும் இணைக்கிறது…')
        }
        return
      }
      const frame = captureFrame()
      if (!frame) return

      if (phase === 'six') {
        const step = roomStepRef.current
        if (!step) return
        roomBusyRef.current = true
        setRoomAiStatus('ANALYZING')
        try {
          const result = await hiringService.analyzeRoomStep(activeMonitoringSessionId, step.key, frame)
          if (result.skipped) { setRoomPhase('done'); setRoomScanComplete(true); return }
          setSixCaptureStatus(result.sixCaptureStatus)
          setRoomAttempts(result.attempts || 0)
          if (result.observations?.length) {
            setRoomObservations(prev => [...prev, ...result.observations.map(obs => ({ objectType: obs.objectType || 'item', confidence: Number(obs.confidence) || 0 }))].slice(-50))
          }
          if (result.valid && !result.sameFrame) {
            setRoomAiStatus('SUCCESS')
            const successText = result.message || hireRoomMessage(activeRoomLanguage, `${step.key}_ok`) || 'Captured'
            setRoomAiMessage(successText)
            setRoomAiTaMessage(result.taMessage || hireRoomMessage('ta-IN', `${step.key}_ok`) || '')
            speakRoom({ priority: 'SUCCESS', key: `${step.key}_ok`, message: result.message, taMessage: result.taMessage })
            advanceRoomStep(step.key)
          } else if (result.sameFrame && result.verifiedBefore) {
            setRoomAiStatus('SUCCESS')
            advanceRoomStep(step.key)
          } else {
            setRoomAiStatus('RETRY')
            const guide = result.guideKey || `${step.key}_poor`
            setRoomGuideKey(guide)
            setRoomAiMessage(result.message || hireRoomMessage(activeRoomLanguage, guide) || 'Adjust the angle and try again')
            setRoomAiTaMessage(result.taMessage || hireRoomMessage('ta-IN', guide) || '')
            const now = Date.now()
            const lastGuide = roomGuideSpokenRef.current
            if (guide !== lastGuide.key || now - lastGuide.at > 7000) {
              roomGuideSpokenRef.current = { key: guide, at: now }
              speakRoom({ priority: 'RETRY', key: guide, message: result.message, taMessage: result.taMessage })
            }
          }
        } finally { roomBusyRef.current = false }
      } else {
        roomScanBatchRef.current.push(frame)
        if (roomScanBatchRef.current.length < 3) {
          if (roomStatusRef.current !== 'GUIDING') setRoomAiStatus('GUIDING')
          return
        }
        const batch = roomScanBatchRef.current
        roomScanBatchRef.current = []
        roomBusyRef.current = true
        setRoomAiStatus('ANALYZING')
        try {
          const result = await hiringService.analyzeRoomScan360(activeMonitoringSessionId, batch)
          if (result.skipped) { setRoomPhase('done'); setRoomScanComplete(true); return }
          if (typeof result.coverage === 'number') setRoomScanCoverage(result.coverage)
          if (result.observations?.length) {
            setRoomObservations(prev => [...prev, ...result.observations.map(obs => ({ objectType: obs.objectType || 'item', confidence: Number(obs.confidence) || 0 }))].slice(-50))
          }
          const guide = result.guideKey || (result.coverage >= roomScanThreshold ? 'scan_complete' : 'coverage_pending')
          setRoomGuideKey(guide)
          setRoomAiMessage(result.message || hireRoomMessage(activeRoomLanguage, guide) || 'Scanning')
          setRoomAiTaMessage(result.taMessage || hireRoomMessage('ta-IN', guide) || '')
          if (result.coverage >= roomScanThreshold) {
            setRoomAiStatus('SUCCESS')
            speakRoom({ priority: 'SUCCESS', key: 'scan_complete', message: result.message, taMessage: result.taMessage })
          } else {
            setRoomAiStatus('GUIDING')
            const now = Date.now()
            const lastGuide = roomGuideSpokenRef.current
            if (guide !== lastGuide.key || now - lastGuide.at > 9000) {
              roomGuideSpokenRef.current = { key: guide, at: now }
              speakRoom({ priority: 'GENERAL', key: guide, message: result.message, taMessage: result.taMessage })
            }
          }
        } finally { roomBusyRef.current = false }
      }
    }, 900)
    return () => clearInterval(interval)
  }, [roomScanRequired, roomPhase, captureFrame, speakRoom, advanceRoomStep, activeRoomLanguage, roomScanThreshold, activeMonitoringSessionId])

  // Keep the chatbot + page store in sync with the live room state.
  useEffect(() => {
    if (!isHire) return
    hireVerificationStore.set({
      phase: roomPhase,
      step: roomCurrentStep ? { key: roomCurrentStep.key, label: roomCurrentStep.label, index: roomCurrentStep.index } : null,
      steps: sixCaptureStatus,
      coverage: roomScanCoverage,
      complete: roomPhase === 'done',
      aiStatus: roomAiStatus,
    })
  }, [isHire, roomPhase, roomCurrentStep, sixCaptureStatus, roomScanCoverage, roomAiStatus])

  // Drive the phone's full-screen overlay via the shared socket room.
  useEffect(() => {
    if (!isHire || !socketRef.current?.connected) return
    clearTimeout(roomStateEmitTimerRef.current)
    roomStateEmitTimerRef.current = setTimeout(() => {
      socketRef.current.emit('assessment_verif:room_state', {
        sessionId: sessionData?.sessionId || sessionIdRef.current,
        state: {
          phase: roomPhase,
          step: roomCurrentStep ? { key: roomCurrentStep.key, label: roomCurrentStep.label, index: roomCurrentStep.index } : null,
          steps: sixCaptureStatus,
          coverage: roomScanCoverage,
          complete: roomPhase === 'done',
          aiStatus: roomAiStatus,
          language: activeRoomLanguage,
        },
      })
    }, 400)
    return () => clearTimeout(roomStateEmitTimerRef.current)
  }, [isHire, roomPhase, roomCurrentStep, sixCaptureStatus, roomScanCoverage, roomAiStatus, activeRoomLanguage, sessionData?.sessionId])

  useEffect(() => () => {
    stopHireRoomVoice()
    hireVerificationStore.reset()
    if (roomStateEmitTimerRef.current) clearTimeout(roomStateEmitTimerRef.current)
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

if (isHire && hirePolicy?.enabled && hirePolicy.identityVerification && !identityReady && ((!hirePolicy.mobileRoomScan && !hirePolicy.roomScan360Enabled) || roomScanComplete)) {
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
                {isHire
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
        <div className="wi-verif-main-card">
          <div className="wi-verif-split-grid">
            {/* ── LEFT COLUMN: QR Scan ── */}
            <div className="wi-verif-col">
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
                  <li>Position phone at a 45° angle to capture desk & hands</li>
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
                    ) : (
                      <div className="wi-verif-qr-content">
                        <QRCodeSVG
                          value={mobilePairUrl || 'https://waveinit.com'}
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
                    disabled={refreshing || loading}
                    className="wi-verif-refresh-btn"
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
                <h2 className="wi-verif-col-title">Live Mobile Camera Feed</h2>
              </div>
              <p className="wi-verif-col-desc">
                Once paired, your mobile stream will appear below in real-time.
              </p>

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

                  <div className={`wi-verif-check-item ${remoteVideoReady || lastFrame || webRtcConnected ? 'is-done' : ''}`}>
                    <div className="wi-verif-check-left">
                      <div className="wi-verif-check-circle">
                        {remoteVideoReady || lastFrame || webRtcConnected ? <Check size={13} strokeWidth={3} /> : <span className="wi-verif-check-dot" />}
                      </div>
                      <span className="wi-verif-check-text">Live Video Stream Active</span>
                    </div>
                    <span className={`wi-verif-check-pill ${remoteVideoReady || lastFrame || webRtcConnected ? 'is-done' : ''}`}>
                      {remoteVideoReady || lastFrame || webRtcConnected ? '✓ Active' : 'Waiting...'}
                    </span>
                  </div>
                </div>
              </div>

{isHire && roomScanRequired && <div className="wi-verif-checklist-box wi-room-flow" style={{ marginTop: 12 }}>
                <div className="wi-verif-checklist-title">AI-Guided Room Verification</div>

                <div className="wi-room-toolbar">
                  <div className="wi-room-lang-toggle" role="group" aria-label="Voice language">
                    <button type="button" className={`wi-room-lang-btn ${!activeRoomIsTa ? 'is-active' : ''}`} onClick={() => setRoomLanguage(setHireRoomLanguage('en-IN'))} disabled={hirePolicy?.allowParticipantLanguage === false}>English</button>
                    <button type="button" className={`wi-room-lang-btn ${activeRoomIsTa ? 'is-active' : ''}`} onClick={() => setRoomLanguage(setHireRoomLanguage('ta-IN'))} disabled={hirePolicy?.allowParticipantLanguage === false}>தமிழ்</button>
                  </div>
                  <button type="button" className="wi-room-voice-btn" onClick={() => setRoomVoiceEnabled(value => !value)} title={roomVoiceEnabled ? 'Mute voice' : 'Unmute voice'} aria-label={roomVoiceEnabled ? 'Mute voice' : 'Unmute voice'}>
                    {roomVoiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
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
                          <span className="wi-room-guide-step">Step {roomCurrentStep.index + 1} of 6 — {roomCurrentStep.label}</span>
                          <span className="wi-room-guide-instruction">{activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</span>
                        </div>
                      </div>
                    )}

                    {roomPhase === 'scan360' && (
                      <div className="wi-room-guide">
                        <div className="wi-room-guide-arrow" data-dir="360"><ScanLine size={26} /></div>
                        <div className="wi-room-guide-text">
                          <span className="wi-room-guide-step">360° Room Scan — turn in a full circle</span>
                          <span className="wi-room-guide-instruction">{activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</span>
                        </div>
                      </div>
                    )}

                    {roomPhase === 'scan360' && (
                      <div className="wi-room-coverage">
                        <div className="wi-room-coverage-label"><span>Room coverage</span><span>{Math.round(roomScanCoverage)}% / {roomScanThreshold}%</span></div>
                        <div className="wi-room-coverage-bar"><div className="wi-room-coverage-fill" style={{ width: `${Math.min(100, roomScanCoverage)}%` }} /></div>
                      </div>
                    )}

                    <div className={`wi-room-status wi-room-status--${String(roomAiStatus).toLowerCase()}`}>
                      {roomAiStatus === 'ANALYZING' && <><Loader2 size={13} className="bulk-spin" /> Analyzing frame…</>}
                      {roomAiStatus === 'GUIDING' && <><ScanLine size={13} /> Following your camera…</>}
                      {roomAiStatus === 'RETRY' && <><RefreshCw size={13} /> Adjust the angle and continue</>}
                      {roomAiStatus === 'ERROR' && <><AlertCircle size={13} /> {activeRoomIsTa ? (roomAiTaMessage || roomAiMessage) : roomAiMessage}</>}
                      {roomAiStatus === 'SUCCESS' && <><CheckCircle2 size={13} /> Captured — moving on</>}
                    </div>

                    {roomScanError && <p role="alert" className="wi-room-error">{roomScanError}</p>}

                    {HIRE_ROOM_STEP_LIST.filter(step => sixCaptureStatus[step.key]?.verifiedAt).length > 0 && (
                      <div className="wi-room-retakes">
                        {HIRE_ROOM_STEP_LIST.filter(step => sixCaptureStatus[step.key]?.verifiedAt).map(step => (
                          <button key={step.key} type="button" className="wi-room-retake-btn" onClick={() => handleRetakeRoomStep(step.key)} title={`Retake ${step.label} view`}>
                            <Undo2 size={11} /> {step.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {roomObservations.length > 0 && (
                      <p className="wi-room-note">Noted {roomObservations.length} item{roomObservations.length > 1 ? 's' : ''} in view — recorded for the reviewer. Keep going.</p>
                    )}
                  </>
                ) : (
                  <div className="wi-room-complete">
                    <BadgeCheck size={30} color="#16a34a" />
                    <div>
                      <strong>Room verification complete</strong>
                      <span>{hirePolicy?.identityVerification === false ? 'You can now begin the assessment.' : 'Identity verification is next.'}</span>
                    </div>
                  </div>
                )}
              </div>}

              {/* Start Assessment CTA Button */}
              <div className="wi-verif-start-btn-wrap">
                <p role="status">{transportError || (isFullyVerified ? "Person and laptop verified — ready for monitoring." : compositionMessage)}</p>
                <button
                  onClick={handleStartQuiz}
                  disabled={verifyingStart || loading || !isFullyVerified || !mobileStreamConnected || isExpired || isDisconnected || (isHire && (hirePolicy?.mobileRoomScan || hirePolicy?.roomScan360Enabled) && !roomScanComplete)}
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
