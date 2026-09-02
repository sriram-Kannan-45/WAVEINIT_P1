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
  Code
} from 'lucide-react'
import Layout from '../components/Layout'
import { API_BASE, BACKEND_ORIGIN } from '../api/api'
import { buildAssessmentMobileUrl } from '../utils/assessmentPairingUrl'
import { useToast } from '../components/Toast'
import '../styles/assessment-verification.css'

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
        if (trainingId) {
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

        // Initiate Verification Session for this exact attempt
        if (curAttemptId) {
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
  }, [effectiveId, isCoding, activeAttemptId, activeSessionToken, activeToken, trainingId, user?.id, currentAssessmentType])

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
        setRemoteVideoReady(true)
        setMobileStreamConnected(true)
        setMobileCameraReady(true)
        setIsFullyVerified(true)
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
        setMobileStreamConnected(true)
        setMobileCameraReady(true)
        setIsFullyVerified(true)
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
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[LAPTOP-VERIF] Connected to verification socket with ID:', socket.id)
      socket.emit('assessment_verif:join', {
        sessionId: currentSessionId,
        role: 'laptop',
        clientType: 'browser_desktop',
      })
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

    // 2. Mobile Status Updates
    socket.on('assessment_verif:mobile_status', (payload) => {
      console.log('[LAPTOP-VERIF] Mobile status update:', payload)
      setQrScanned(true)
      setParticipantValidated(true)
      if (payload?.cameraStreaming || payload?.status === 'STREAMING' || payload?.mobileReady || payload?.mobileCameraReady || payload?.connected) {
        setMobileCameraReady(true)
        setMobileStreamConnected(true)
      }
      if (payload?.status === 'VERIFIED' || payload?.mobileCameraReady || payload?.connected) {
        setIsFullyVerified(true)
      }
      if (payload?.socketId) {
        mobileSocketIdRef.current = payload.socketId
      }
    })

    socket.on('assessment_verif:stream_status', (payload) => {
      console.log('[LAPTOP-VERIF] Stream status update:', payload)
      if (payload?.cameraStreaming || payload?.status === 'STREAMING' || payload?.mobileReady || payload?.streaming) {
        setMobileCameraReady(true)
        setMobileStreamConnected(true)
      }
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
        setLastFrame(frame)
        setMobileStreamConnected(true)
        setMobileCameraReady(true)
        setQrScanned(true)
        setParticipantValidated(true)
        setIsFullyVerified(true)
        setIsDisconnected(false)
      }
    })

    // 6. Verification Unlocked
    socket.on('assessment_verif:unlocked', () => {
      console.log('[LAPTOP-VERIF] Assessment unlocked by mobile stream')
      setQrScanned(true)
      setParticipantValidated(true)
      setMobileCameraReady(true)
      setMobileStreamConnected(true)
      setIsFullyVerified(true)
    })

    socket.on('assessment_verif:mobile-disconnected', () => {
      console.warn('[LAPTOP-VERIF] Mobile device disconnected')
      setIsDisconnected(true)
      setWebRtcConnected(false)
      setRemoteVideoReady(false)
    })

    return () => {
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
        const res = await fetch(`${API_BASE}/assessment-verification/status/${currentSessionId}`)
        const data = await res.json()
        if (data.success) {
          const s = data.session || data
          if (s.status === 'PAIRED' || s.status === 'VERIFIED' || s.mobileVerified || s.qrScanned) {
            setQrScanned(true)
            setParticipantValidated(true)
          }
          if (s.mobileCameraReady || s.mobileVerified || s.status === 'VERIFIED') {
            setMobileCameraReady(true)
            setMobileStreamConnected(true)
          }
          if (s.status === 'VERIFIED' || s.isFullyVerified || s.mobileVerified) {
            setIsFullyVerified(true)
          }
          if (s.lastFramePreview || s.frame) {
            setLastFrame(s.lastFramePreview || s.frame)
            setMobileStreamConnected(true)
          }
        }
      } catch (_) {}
    }, 2000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [sessionData?.sessionId])

  // 6. Manual Refresh Session
  const handleRefreshQR = async () => {
    try {
      setRefreshing(true)
      const res = await fetch(`${API_BASE}/assessment-verification/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({
          assessmentType: currentAssessmentType,
          assessmentId: parseInt(effectiveId, 10),
          attemptId: parseInt(activeAttemptId, 10),
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

      // Persist verification in session storage
      try {
        sessionStorage.setItem(
          `assessment_verif_${currentAssessmentType}_${effectiveId}_${activeAttemptId}`,
          JSON.stringify({ sessionId: sessionData?.sessionId || `bypassed_${Date.now()}`, token: sessionData?.token || 'bypassed' })
        )
      } catch (e) {}

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
    if (trainingId) {
      navigate(`/participant?tab=myEnrollments&courseId=${trainingId}&subtab=${isCoding ? 'coding' : 'quizzes'}`)
    } else {
      navigate('/participant?tab=myEnrollments')
    }
  }

  const courseDisplayName = courseDetails?.title || (trainingId ? `Training ${trainingId}` : 'react')
  const quizDisplayName = quizDetails?.title || (isCoding ? 'Coding Assessment' : 'AI Generated Quiz')
  const durationDisplay = quizDetails?.timeLimit ? `${quizDetails.timeLimit} Minutes` : '60 Minutes'
  const marksDisplay = quizDetails?.totalMarks || (quizDetails?.questions ? `${quizDetails.questions.length * 5 || 50} Marks` : (isCoding ? `${(quizDetails?.numProblems || 3) * 10} Marks` : '50 Marks'))
  const mobilePairUrl = buildAssessmentMobileUrl(sessionData?.qrPayload?.shortUrl)

  return (
    <Layout
      user={user}
      activeTab="myEnrollments"
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
            <Link to="/participant?tab=myEnrollments">My Courses</Link>
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
              <h1 className="wi-verif-heading">{isCoding ? 'Coding Assessment – Mobile Camera Verification' : 'AI Quiz – Mobile Camera Verification'}</h1>
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
                        <span className="wi-verif-stream-title-connecting">Connecting WebRTC Stream...</span>
                        <span className="wi-verif-stream-sub-connecting">Camera access granted on mobile</span>
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

              {/* Start Assessment CTA Button */}
              <div className="wi-verif-start-btn-wrap">
                <button
                  onClick={handleStartQuiz}
                  disabled={verifyingStart || loading}
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
