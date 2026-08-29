import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
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
  Radio
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

export default function ParticipantQuizVerificationPage({ user, onLogout }) {
  const navigate = useNavigate()
  const { trainingId: paramTrainingId, quizId: paramQuizId, attemptId: paramAttemptId } = useParams()
  const [searchParams] = useSearchParams()
  const { error: showError, success: showSuccess } = useToast()

  const quizId = paramQuizId || searchParams.get('quizId')
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

  // 1. Fetch Course and Quiz Info + Create / Restore Quiz Attempt
  useEffect(() => {
    let aborted = false
    const initQuizAttempt = async () => {
      if (!quizId) {
        setError('Quiz ID is required.')
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
          const startRes = await fetch(`${API_BASE}/quizzes/${quizId}/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
            },
          })
          const startData = await startRes.json()
          if (!startRes.ok || !startData.attemptId) {
            throw new Error(startData.error || 'Failed to initialize quiz attempt.')
          }
          curAttemptId = startData.attemptId
          curSessionToken = startData.sessionToken
          setActiveAttemptId(curAttemptId)
          setActiveSessionToken(curSessionToken)
          setActiveMonitoringSessionId(startData.monitoringSessionId || null)
          if (startData.quiz) {
            setQuizDetails(startData.quiz)
          }
        }

        // Fetch Quiz & Questions metadata
        const qRes = await fetch(`${API_BASE}/quizzes/${quizId}/questions`, {
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
          },
        })
        const qData = await qRes.json()
        if (!aborted && qRes.ok && qData.quiz) {
          setQuizDetails(qData.quiz)
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
            // Non-critical, fallback to trainingId or 'react'
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
              assessmentType: 'QUIZ',
              assessmentId: parseInt(quizId, 10),
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

    initQuizAttempt()
    return () => {
      aborted = true
    }
  }, [quizId, trainingId, activeToken])

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

  // 3. WebRTC Peer Connection Setup: Low-latency P2P configuration
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

    const wsUrl = BACKEND_ORIGIN || window.location.origin
    const socket = io(wsUrl, {
      auth: { token: activeToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[LAPTOP-P2P] Socket connected:', socket.id, 'session:', currentSessionId)
      socket.emit('assessment_verif:join', {
        sessionId: currentSessionId,
        role: 'laptop',
      })
    })

    socket.on('assessment_verif:mobile_joined', ({ socketId }) => {
      console.log('[LAPTOP-P2P] Mobile peer joined:', socketId)
      mobileSocketIdRef.current = socketId
      setQrScanned(true)
      setParticipantValidated(true)
      setIsDisconnected(false)
      getOrCreatePeerConnection()

      const targetSessionId = currentSessionId || sessionIdRef.current
      socket.emit('assessment_verif:laptop_joined', {
        sessionId: targetSessionId,
        socketId: socket.id,
      })
    })

    socket.on('assessment_verif:offer', async ({ offer, fromSocketId, sessionId }) => {
      try {
        console.log('[LAPTOP-P2P] Offer received from mobile:', fromSocketId)
        mobileSocketIdRef.current = fromSocketId
        setQrScanned(true)
        setParticipantValidated(true)
        const pc = getOrCreatePeerConnection()
        await pc.setRemoteDescription(new RTCSessionDescription(offer))

        if (candidateQueueRef.current.length > 0) {
          for (const cand of candidateQueueRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand))
            } catch (e) {
              console.error('[LAPTOP-P2P] ICE queue candidate error:', e)
            }
          }
          candidateQueueRef.current = []
        }

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        const targetSessionId = sessionId || currentSessionId || sessionIdRef.current
        socket.emit('assessment_verif:answer', {
          sessionId: targetSessionId,
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        })
      } catch (err) {
        console.error('[LAPTOP-P2P] WebRTC Offer handling error:', err)
      }
    })

    socket.on('assessment_verif:ice-candidate', async ({ candidate }) => {
      try {
        const pc = getOrCreatePeerConnection()
        if (pc && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } else {
            candidateQueueRef.current.push(candidate)
          }
        }
      } catch (err) {
        console.error('[LAPTOP-P2P] ICE Candidate error:', err)
      }
    })

    socket.on('assessment_verif:mobile_status', (data) => {
      if (data.mobileReady || data.connected || data.mobileVerified) {
        setQrScanned(true)
        setParticipantValidated(true)
        setMobileCameraReady(true)
        setIsDisconnected(false)
      } else {
        setIsDisconnected(true)
      }
    })

    socket.on('assessment_verif:stream_status', (data) => {
      if (data.streaming) {
        setQrScanned(true)
        setParticipantValidated(true)
        setMobileCameraReady(true)
        setIsDisconnected(false)
      }
    })

    socket.on('assessment_verif:unlocked', () => {
      setQrScanned(true)
      setParticipantValidated(true)
      setIsDisconnected(false)
    })

    return () => {
      socket.disconnect()
      if (pcRef.current) {
        try { pcRef.current.close() } catch (e) {}
        pcRef.current = null
      }
    }
  }, [sessionData?.sessionId, activeToken, getOrCreatePeerConnection])

  // 5. Attach remote video stream to DOM
  useEffect(() => {
    const video = videoRef.current
    if (!video || !remoteStream) return

    video.srcObject = remoteStream
    video.muted = true
    video.autoplay = true
    video.playsInline = true

    video.onplaying = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setRemoteVideoReady(true)
        setMobileStreamConnected(true)
        setMobileCameraReady(true)
        setIsFullyVerified(true)
      }
    }

    video.play().catch((err) => {
      console.warn('[LAPTOP-P2P] Video playback error:', err)
    })
  }, [remoteStream])

  // Connection Confirmation
  useEffect(() => {
    if (remoteVideoReady) {
      setMobileStreamConnected(true)
      setMobileCameraReady(true)
      setIsFullyVerified(true)
      setIsDisconnected(false)
    }
  }, [remoteVideoReady])

  // 7. Refresh QR Code
  const handleRefreshQr = async () => {
    if (!sessionData?.sessionId || refreshing) return
    try {
      setRefreshing(true)
      const res = await fetch(`${API_BASE}/assessment-verification/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({ sessionId: sessionData.sessionId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to refresh QR code')
      }
      setSessionData(data)
      setQrScanned(false)
      setParticipantValidated(false)
      setMobileStreamConnected(false)
      setMobileCameraReady(false)
      setIsFullyVerified(false)
      setIsDisconnected(false)
      setRemoteStream(null)
      setLastFrame(null)
      if (pcRef.current) {
        try { pcRef.current.close() } catch (e) {}
        pcRef.current = null
      }
      showSuccess('Generated a new verification QR code.')
    } catch (err) {
      showError(err.message || 'Unable to refresh QR code')
    } finally {
      setRefreshing(false)
    }
  }

  // 8. Copy Session ID
  const handleCopySessionId = () => {
    if (!sessionData?.sessionId) return
    navigator.clipboard?.writeText(sessionData.sessionId)
    setCopiedSessionId(true)
    setTimeout(() => setCopiedSessionId(false), 2000)
  }

  // 9. Fullscreen Video Preview Toggle
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

  // 10. Start / Resume Quiz after Verification (Mobile QR Paused)
  const handleStartQuiz = async () => {
    try {
      setVerifyingStart(true)

      // Persist verification in session storage
      try {
        sessionStorage.setItem(
          `assessment_verif_QUIZ_${quizId}_${activeAttemptId}`,
          JSON.stringify({ sessionId: sessionData?.sessionId || `bypassed_${Date.now()}`, token: sessionData?.token || 'bypassed' })
        )
      } catch (e) {}

      // Navigate to the actual quiz attempt screen
      const coursePath = trainingId ? `/trainings/${trainingId}` : ''
      const params = new URLSearchParams({
        attemptId: String(activeAttemptId),
        sessionToken: activeSessionToken || '',
        monitoringSessionId: activeMonitoringSessionId || '',
      })
      navigate(`${coursePath}/quizzes/${quizId}/attempt?${params.toString()}`)
    } catch (err) {
      showError(err.message || 'Unable to start quiz')
      setVerifyingStart(false)
    }
  }

  const handleBackToQuiz = () => {
    if (trainingId) {
      navigate(`/participant?tab=myEnrollments&courseId=${trainingId}&subtab=quizzes`)
    } else {
      navigate('/participant?tab=myEnrollments')
    }
  }

  const courseDisplayName = courseDetails?.title || (trainingId ? `Training ${trainingId}` : 'react')
  const quizDisplayName = quizDetails?.title || 'AI Generated Quiz'
  const durationDisplay = quizDetails?.timeLimit ? `${quizDetails.timeLimit} Minutes` : '60 Minutes'
  const marksDisplay = quizDetails?.totalMarks || (quizDetails?.questions ? `${quizDetails.questions.length * 5 || 50} Marks` : '50 Marks')
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
            <span style={{ color: '#16A34A', fontWeight: 600 }}>AI Quiz - Verification</span>
          </nav>
        </div>

        {/* ── Page Title Row ── */}
        <div className="wi-verif-title-row">
          <div className="wi-verif-title-left">
            <button
              onClick={handleBackToQuiz}
              className="wi-verif-round-btn"
              title="Back to Quiz"
              aria-label="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="wi-verif-heading">AI Quiz – Mobile Camera Verification</h1>
              <p className="wi-verif-subheading">Secure assessment with identity verification</p>
            </div>
          </div>

          <div className="wi-verif-actions-right">
            <button onClick={handleBackToQuiz} className="wi-verif-back-btn">
              <ArrowLeft size={14} /> Back to Quiz
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
              <Sparkles size={20} strokeWidth={2.2} />
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
            <div>
              <div className="wi-verif-col-header">
                <span className="wi-verif-num-badge">1</span>
                <h2 className="wi-verif-col-title">Scan with Mobile Camera</h2>
              </div>
              <p className="wi-verif-col-desc">
                Use your registered mobile device to scan the QR code and connect your camera.
              </p>

              <div className="wi-verif-steps-box">
                <div className="wi-verif-steps-title">Steps to Follow</div>
                <ol className="wi-verif-steps-list">
                  <li>Open camera on your mobile device</li>
                  <li>Scan the QR code shown below</li>
                  <li>Allow camera access when prompted</li>
                  <li>Keep your face in view during the assessment</li>
                </ol>
              </div>

              {/* QR Code */}
              <div className="wi-verif-qr-wrapper">
                {loading ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={32} className="animate-spin" color="#16A34A" />
                  </div>
                ) : isExpired ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <AlertCircle size={40} color="#DC2626" style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, margin: '0 0 10px' }}>
                      QR Code Expired
                    </p>
                    <button
                      onClick={handleRefreshQr}
                      disabled={refreshing}
                      className="wi-verif-start-btn"
                      style={{ padding: '8px 16px', fontSize: 12.5 }}
                    >
                      <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Generate New QR
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="wi-verif-qr-frame">
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--tl" />
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--tr" />
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--bl" />
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--br" />
                      <QRCodeSVG
                        value={mobilePairUrl || `https://waveinit.com/join/${sessionData?.token || 'session'}`}
                        size={176}
                        level="M"
                        includeMargin={false}
                        fgColor="#0F172A"
                        bgColor="#FFFFFF"
                      />
                    </div>

                    <span className="wi-verif-timer-label">QR Code Expires In</span>
                    <div className="wi-verif-timer-value">
                      <Clock size={16} />
                      <span>{formattedTimer}</span>
                    </div>

                    <span className="wi-verif-session-label">Session ID</span>
                    <div className="wi-verif-session-pill">
                      <span>{sessionData?.sessionId || 'verif_quiz_8_trc8boccn61g'}</span>
                      <button
                        type="button"
                        onClick={handleCopySessionId}
                        className="wi-verif-copy-btn"
                        title="Copy Session ID"
                      >
                        {copiedSessionId ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── RIGHT COLUMN: Status & Camera Preview ── */}
            <div>
              <div className="wi-verif-col-header">
                <span className="wi-verif-num-badge">2</span>
                <h2 className="wi-verif-col-title">Verification Status</h2>
              </div>

              <div className="wi-verif-checklist">
                {/* Step 1 */}
                <div className="wi-verif-check-row">
                  <div className="wi-verif-check-left">
                    <Check size={16} color={qrScanned ? '#16A34A' : '#94A3B8'} strokeWidth={2.5} />
                    <span>QR Code Scanned & Paired</span>
                  </div>
                  <span
                    className={`wi-verif-check-badge ${
                      qrScanned ? 'wi-verif-check-badge--completed' : 'wi-verif-check-badge--waiting'
                    }`}
                  >
                    {qrScanned ? 'Completed' : 'Waiting...'}
                  </span>
                </div>

                {/* Step 2 */}
                <div className="wi-verif-check-row">
                  <div className="wi-verif-check-left">
                    <Check size={16} color={participantValidated ? '#16A34A' : '#94A3B8'} strokeWidth={2.5} />
                    <span>Participant & Attempt Validated</span>
                  </div>
                  <span
                    className={`wi-verif-check-badge ${
                      participantValidated
                        ? 'wi-verif-check-badge--completed'
                        : 'wi-verif-check-badge--waiting'
                    }`}
                  >
                    {participantValidated ? 'Completed' : 'Waiting...'}
                  </span>
                </div>

                {/* Step 3 */}
                <div className="wi-verif-check-row">
                  <div className="wi-verif-check-left">
                    <Wifi
                      size={16}
                      color={
                        mobileStreamConnected || remoteVideoReady
                          ? '#16A34A'
                          : qrScanned
                          ? '#D97706'
                          : '#94A3B8'
                      }
                    />
                    <span>Mobile Camera Stream</span>
                  </div>
                  <span
                    className={`wi-verif-check-badge ${
                      mobileStreamConnected || remoteVideoReady
                        ? 'wi-verif-check-badge--live'
                        : isDisconnected
                        ? 'wi-verif-check-badge--error'
                        : qrScanned
                        ? 'wi-verif-check-badge--connecting'
                        : 'wi-verif-check-badge--waiting'
                    }`}
                  >
                    {mobileStreamConnected || remoteVideoReady ? (
                      <>
                        <span className="wi-verif-pulse-dot" style={{ width: 6, height: 6 }} /> Live
                      </>
                    ) : isDisconnected ? (
                      'Disconnected'
                    ) : qrScanned ? (
                      'Connecting...'
                    ) : (
                      'Waiting'
                    )}
                  </span>
                </div>

                {/* Step 4 */}
                <div className="wi-verif-check-row">
                  <div className="wi-verif-check-left">
                    <Radio
                      size={16}
                      color={
                        mobileCameraReady || remoteVideoReady
                          ? '#16A34A'
                          : qrScanned
                          ? '#D97706'
                          : '#94A3B8'
                      }
                    />
                    <span>Mobile Camera Connected</span>
                  </div>
                  <span
                    className={`wi-verif-check-badge ${
                      mobileCameraReady || remoteVideoReady
                        ? 'wi-verif-check-badge--completed'
                        : isDisconnected
                        ? 'wi-verif-check-badge--error'
                        : qrScanned
                        ? 'wi-verif-check-badge--connecting'
                        : 'wi-verif-check-badge--waiting'
                    }`}
                  >
                    {mobileCameraReady || remoteVideoReady
                      ? 'Connected'
                      : isDisconnected
                      ? 'Disconnected'
                      : qrScanned
                      ? 'Connecting...'
                      : 'Waiting'}
                  </span>
                </div>
              </div>

              {/* Subheading */}
              <div className="wi-verif-preview-section-title">Mobile Camera Preview</div>

              {/* Dark Camera Preview Box */}
              <div className="wi-verif-preview-container" ref={previewContainerRef}>
                {remoteStream ? (
                  <>
                    <div className="wi-verif-preview-live-badge">
                      <span className="wi-verif-pulse-dot" style={{ width: 6, height: 6 }} />
                      <span>LIVE</span>
                    </div>

                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="wi-verif-fs-btn"
                      title={isFullscreenVideo ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreenVideo ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>

                    <video
                      ref={videoRef}
                      className="wi-verif-preview-video"
                      playsInline
                      autoPlay
                      muted
                      disablePictureInPicture
                    />
                  </>
                ) : (
                  <>
                    {/* Centered Viewfinder Corners */}
                    <div className="wi-verif-preview-viewfinder">
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--tl" />
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--tr" />
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--bl" />
                      <span className="wi-verif-qr-corner wi-verif-qr-corner--br" />
                    </div>

                    <div className="wi-verif-preview-camera-circle">
                      <Camera size={22} />
                    </div>

                    <p className="wi-verif-preview-waiting-title">
                      Waiting for mobile camera connection
                    </p>
                    <p className="wi-verif-preview-waiting-sub">
                      After connecting, the live camera feed will appear here.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Lock / Unlock Control Card ── */}
        <div className="wi-verif-bottom-card">
          <div className="wi-verif-lock-banner">
            <div className="wi-verif-lock-icon-wrap">
              <Shield size={18} />
            </div>
            <div>
              <div className="wi-verif-lock-title">
                {isFullyVerified || mobileCameraReady
                  ? 'Verification completed. Assessment is ready to start.'
                  : 'Assessment is locked until verification is completed.'}
              </div>
              <div className="wi-verif-lock-sub">
                Keep your mobile camera active throughout the assessment.
              </div>
            </div>
          </div>

          <div className="wi-verif-lock-action-row">
            <div
              className="wi-verif-lock-state wi-verif-lock-state--unlocked"
            >
              <Unlock size={16} />
              <span>READY (MOBILE PAUSED)</span>
            </div>

            <button
              onClick={handleStartQuiz}
              disabled={verifyingStart}
              className="wi-verif-start-btn"
            >
              {verifyingStart ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Starting...
                </>
              ) : (
                <>
                  Start / Resume Quiz &rarr;
                </>
              )}
            </button>
          </div>

          <p className="wi-verif-footer-help">
            Mobile QR verification is temporarily paused. Click Start / Resume Quiz to enter the assessment.
          </p>
        </div>
      </div>
    </Layout>
  )
}
