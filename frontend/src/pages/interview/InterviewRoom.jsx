/**
 * InterviewRoom Page
 * Full-screen (no dashboard) video interview flow:
 *
 *   invite → device check → consent (participant only) → waiting → live room
 *
 * Role-aware:
 *  - TRAINER / ADMIN → Start Interview / End Interview
 *  - PARTICIPANT     → Join Interview / Leave Interview
 *
 * WebRTC, screen share, shared code editor, chat, AI monitoring, recording,
 * and mobile camera pairing. Refreshing any interview page lands on the
 * invitation screen without breaking the room (media/peers are cleaned up on
 * unmount).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ActiveRoom from '../../components/interview/room/ActiveRoom'
import ConsentScreen from '../../components/interview/room/ConsentScreen'
import DeviceCheckScreen from '../../components/interview/room/DeviceCheckScreen'
import InterviewShell from '../../components/interview/room/InterviewShell'
import InvitationScreen from '../../components/interview/room/InvitationScreen'
import WaitingRoomScreen from '../../components/interview/room/WaitingRoomScreen'
import { InterviewSessionProvider, useInterviewSession } from '../../contexts/InterviewSessionContext'
import { useInterviewDetectors } from '../../hooks/useInterviewDetectors'
import { useInterviewMedia } from '../../hooks/useInterviewMedia'
import { useInterviewRecorder } from '../../hooks/useInterviewRecorder'
import { useSocket, useSocketEvent } from '../../hooks/useSocket'
import { useWebRTC } from '../../hooks/useWebRTC'
import { isSecureContextForMedia } from '../../utils/mobilePairingUrl'
import interviewService from '../../services/interviewService'

const PHASE = {
  LOADING: 'loading',
  INVITE: 'invite',
  DEVICE: 'device',
  CONSENT: 'consent',
  WAITING: 'waiting',
  ACTIVE: 'active',
  ENDED: 'ended',
  ERROR: 'error',
}

function FullScreenLoader({ message = 'Loading interview...' }) {
  return (
    <InterviewShell>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
        <div className="w-10 h-10 mx-auto mb-4 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-200 text-sm">{message}</p>
      </div>
    </InterviewShell>
  )
}

function InterviewRoomInner({ user }) {
  const { id: interviewId } = useParams()
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()

  const isInterviewer = user?.role === 'TRAINER' || user?.role === 'ADMIN'

  const {
    setInterview, setSession, setDevices, setPeers, setLocalStreams,
    devices, alerts, chatMessages,
    addChatMessage, addAlert, updateDevice,
  } = useInterviewSession()

  // Local state
  const [interviewData, setInterviewData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [qrPayload, setQrPayload] = useState(null)
  const [phase, setPhase] = useState(PHASE.LOADING)
  const [joined, setJoined] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [started, setStarted] = useState(false)
  const [startedAt, setStartedAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [expandedTile, setExpandedTile] = useState(null)
  const [ended, setEnded] = useState(null)

  // Refs
  const localVideoRef = useRef(null)
  const screenStreamRef = useRef(null)
  const leavingRef = useRef(false)
  const startAttemptedRef = useRef(false)

  // Hooks
  const {
    localStreamRef,
    mediaState,
    mediaError,
    isMuted,
    isCameraOff,
    startLocalMedia,
    stopLocalMedia,
    toggleMute,
    toggleCamera,
    resetMediaError,
  } = useInterviewMedia()

  const {
    remoteStreams, connectionStates,
    createOffer, handleOffer, handleAnswer, handleIceCandidate,
    replaceTrackAll, closePeer, closeAll: closeWebRTC,
  } = useWebRTC(socket, interviewId, localStreamRef)
  const { isRecording, toggleRecording } = useInterviewRecorder(sessionId)
  const { monitorTrack } = useInterviewDetectors({
    socket,
    sessionId,
    interviewId,
    enabled: !isInterviewer && consentGiven,
  })

  // Register newly-acquired streams with the WebRTC layer + shared context.
  const handleLocalStream = useCallback((stream) => {
    addLocalStream(stream)
    setLocalStreams((prev) => ({ ...prev, laptop: stream }))
    stream.getTracks().forEach((track) => monitorTrack(track, 'LAPTOP'))
  }, [addLocalStream, setLocalStreams, monitorTrack])

  useEffect(() => {
    const stream = localStreamRef.current
    if (stream) handleLocalStream(stream)
  }, [mediaState]) // eslint-disable-line react-hooks/exhaustive-deps

  const markStarted = useCallback((from) => {
    setStarted(true)
    setStartedAt((prev) => prev || from || new Date().toISOString())
  }, [])

  /**
   * Pre-fetch interview details and validate access on mount.
   */
  useEffect(() => {
    if (!interviewId) {
      setError('Interview ID is missing.')
      setPhase(PHASE.ERROR)
      return
    }
    let cancelled = false
    interviewService.get(interviewId)
      .then((res) => {
        if (cancelled) return
        setInterviewData(res.interview)
        setInterview(res.interview)
        if (res.interview?.status === 'IN_PROGRESS') {
          markStarted(res.interview.startedAt || new Date().toISOString())
        }
        setPhase(PHASE.INVITE)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Could not load this interview.')
          setPhase(PHASE.ERROR)
        }
      })
    return () => { cancelled = true }
  }, [interviewId, setInterview, markStarted])

  // Request camera + mic when the user reaches the device check step.
  useEffect(() => {
    if (phase !== PHASE.DEVICE) return
    if (localStreamRef.current) return
    startLocalMedia()
  }, [phase, startLocalMedia, localStreamRef])

  // Keep the video element attached to the live stream.
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
  }, [mediaState, localStreamRef])

  /**
   * Join the signaling room. `onJoined(success)` is called with the result.
   */
  const joinSocketRoom = useCallback((onJoined) => {
    if (!socket || !isConnected) {
      setError('Could not connect to the interview server. Check your connection and try again.')
      setPhase(PHASE.ERROR)
      onJoined?.(false)
      return
    }
    socket.emit('join-room', { interviewId }, (response) => {
      if (leavingRef.current) return
      if (response?.success) {
        setJoined(true)
        setSessionId(response.sessionId)
        if (response.interview) {
          setInterviewData((prev) => prev || response.interview)
          setInterview(response.interview)
        }
        setPeers(response.peers || [])
        // The laptop does not need the participant's mobile feed (the
        // interviewer receives it); skip offers to mobile peers.
        response.peers?.forEach((peer) => {
          if (peer.deviceType !== 'MOBILE') createOffer(peer.socketId)
        })
        onJoined?.(true)
      } else {
        setError(response?.error || 'Failed to join the interview room.')
        setPhase(PHASE.ERROR)
        onJoined?.(false)
      }
    })
  }, [socket, isConnected, interviewId, createOffer, setInterview, setPeers])

  /**
   * Trainer: flip the interview to IN_PROGRESS via the backend and announce
   * it over the socket so the participant leaves the waiting state.
   */
  const attemptStart = useCallback(async () => {
    if (!isInterviewer || started || startAttemptedRef.current) return
    startAttemptedRef.current = true
    try {
      await interviewService.start(interviewId)
      markStarted()
      socket?.emit('interview-started', { interviewId })
      setNotice(null)
    } catch (err) {
      const msg = err?.message || ''
      startAttemptedRef.current = false
      if (/device|connect|waiting|session/i.test(msg)) {
        setNotice('Waiting for the participant to connect before the interview can officially start.')
      } else {
        setNotice(msg || 'Could not start the interview yet.')
      }
    }
  }, [interviewId, isInterviewer, started, markStarted, socket])

  /**
   * Create/join the backend session + signaling room. Called after consent
   * (participant) or after the device check (interviewer).
   */
  const beginJoin = useCallback(async () => {
    if (joined || !interviewId) return
    setError(null)
    setNotice(null)
    setIsBusy(true)
    try {
      const joinRes = await interviewService.join(interviewId)
      setSessionId(joinRes.session?.id)
      setQrPayload(joinRes.qrPayload || null)
      if (joinRes.interview) {
        setInterviewData(joinRes.interview)
        setInterview(joinRes.interview)
      }
      setSession(joinRes.session)
      setDevices({
        laptop: joinRes.devices?.some(d => d.deviceType === 'LAPTOP' && d.status === 'CONNECTED') || false,
        mobile: joinRes.devices?.some(d => d.deviceType === 'MOBILE' && d.status === 'CONNECTED') || false,
      })

      joinSocketRoom((ok) => {
        if (leavingRef.current) return
        setIsBusy(false)
        if (ok) {
          setPhase(PHASE.WAITING)
          const isActive = joinRes.session?.status === 'ACTIVE'
            || joinRes.interview?.status === 'IN_PROGRESS'
          if (isActive) {
            markStarted(joinRes.session?.started_at || joinRes.interview?.startedAt)
          } else if (isInterviewer) {
            attemptStart()
          }
        }
      })
    } catch (err) {
      setIsBusy(false)
      setError(err?.message || 'Failed to join the interview.')
      setPhase(PHASE.ERROR)
    }
  }, [
    interviewId, joined, isInterviewer,
    joinSocketRoom, markStarted, attemptStart,
    setSession, setDevices, setInterview,
  ])

  // ── Socket event handlers ───────────────────────────────────────────────
  useSocketEvent('peer-joined', useCallback((data) => {
    setPeers(prev => {
      if (prev.some(p => p.socketId === data.socketId)) return prev
      return [...prev, data]
    })
    if (!joined) return
    const isMobilePeer = data.deviceType === 'MOBILE'
    if (isMobilePeer) {
      // Only the interviewer receives the participant's mobile camera feed.
      if (isInterviewer) createOffer(data.socketId)
    } else {
      createOffer(data.socketId)
      if (isInterviewer && !started) attemptStart()
    }
  }, [setPeers, joined, createOffer, isInterviewer, started, attemptStart]))

  useSocketEvent('peer-left', useCallback((data) => {
    setPeers(prev => prev.filter(p => p.socketId !== data.socketId))
    closePeer(data.socketId)
  }, [setPeers, closePeer]))

  useSocketEvent('offer', useCallback((data) => {
    handleOffer(data.fromSocketId, data.offer)
  }, [handleOffer]))

  useSocketEvent('answer', useCallback((data) => {
    handleAnswer(data.fromSocketId, data.answer)
  }, [handleAnswer]))

  useSocketEvent('ice-candidate', useCallback((data) => {
    handleIceCandidate(data.fromSocketId, data.candidate)
  }, [handleIceCandidate]))

  useSocketEvent('chat-message', useCallback((data) => {
    addChatMessage(data)
  }, [addChatMessage]))

  useSocketEvent('device-status', useCallback((data) => {
    updateDevice(data.deviceType, data.connected)
  }, [updateDevice]))

  useSocketEvent('interview-alert', useCallback((data) => {
    addAlert(data)
  }, [addAlert]))

  useSocketEvent('screen-share', useCallback((data) => {
    setIsScreenSharing(!!data.sharing)
  }, []))

  useSocketEvent('interview-started', useCallback((data) => {
    markStarted()
  }, [markStarted]))

  useSocketEvent('interview-ended', useCallback((data) => {
    setEnded({ byName: data?.endedByName || 'the interviewer' })
  }, []))

  // ── Elapsed timer (since the interview officially started) ─────────────
  useEffect(() => {
    if (!startedAt) return
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  // ── Media controls ──────────────────────────────────────────────────────
  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStreamRef.current) {
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null
      replaceTrackAll(cameraTrack, 'video')
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      setIsScreenSharing(false)
      if (socket && interviewId) socket.emit('screen-share', { interviewId, sharing: false })
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStreamRef.current = stream
        const screenTrack = stream.getVideoTracks()[0]
        if (screenTrack) replaceTrackAll(screenTrack, 'video')
        setIsScreenSharing(true)
        if (socket && interviewId) socket.emit('screen-share', { interviewId, sharing: true })
        screenTrack.onended = () => {
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null
          replaceTrackAll(cameraTrack, 'video')
          setIsScreenSharing(false)
          screenStreamRef.current = null
          if (socket && interviewId) socket.emit('screen-share', { interviewId, sharing: false })
        }
      } catch (err) {
        console.error('Screen share failed:', err)
      }
    }
  }, [isScreenSharing, socket, interviewId, replaceTrackAll, localStreamRef])

  const handleSendMessage = useCallback((message) => {
    if (socket && interviewId && sessionId) {
      socket.emit('chat-message', { interviewId, sessionId, message })
    }
  }, [socket, interviewId, sessionId])

  // ── Cleanup / end / leave ───────────────────────────────────────────────
  const cleanupResources = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    stopLocalMedia()
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    setLocalStreams(prev => ({ ...prev, laptop: null }))
    closeWebRTC()
    if (socket && interviewId) {
      socket.emit('leave-room', { interviewId })
    }
  }, [closeWebRTC, socket, interviewId, setLocalStreams, stopLocalMedia])

  const handleEndInterview = useCallback(async () => {
    if (leavingRef.current) return
    if (!window.confirm('Are you sure you want to end this interview?')) return
    try {
      await interviewService.end(interviewId)
    } catch (err) {
      console.error('Failed to end interview:', err)
    }
    socket?.emit('end-interview', { interviewId })
    cleanupResources()
    navigate('/interviews')
  }, [interviewId, cleanupResources, navigate, socket])

  const handleLeaveInterview = useCallback(() => {
    if (leavingRef.current) return
    if (!window.confirm('Are you sure you want to leave this interview?')) return
    cleanupResources()
    navigate('/interviews')
  }, [cleanupResources, navigate])

  // When the interviewer ends the interview, clean up and leave after a beat.
  useEffect(() => {
    if (!ended) return
    cleanupResources()
    const timer = setTimeout(() => navigate('/interviews'), 2500)
    return () => clearTimeout(timer)
  }, [ended, cleanupResources, navigate])

  // Stop media + close peer connections when the component unmounts.
  useEffect(() => {
    return () => {
      stopLocalMedia()
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      closeWebRTC()
      if (socket && interviewId) {
        socket.emit('leave-room', { interviewId })
      }
    }
  }, [closeWebRTC, socket, interviewId, stopLocalMedia])

  const handleAcceptConsent = useCallback(() => {
    setConsentGiven(true)
    beginJoin()
  }, [beginJoin])

  const handleRefreshQr = useCallback(async () => {
    const res = await interviewService.refreshQr(interviewId)
    setQrPayload(res.qrPayload)
  }, [interviewId])

  const handleRetryMedia = useCallback(() => {
    resetMediaError()
    startLocalMedia()
  }, [resetMediaError, startLocalMedia])

  // ── Derived values ──────────────────────────────────────────────────────
  const peerConnected = Object.values(connectionStates).includes('connected')

  const connectionStatus = useMemo(() => {
    if (!joined) return 'Preparing your room...'
    if (peers.length === 0) {
      return isInterviewer
        ? 'Waiting for the participant to join'
        : 'Waiting for the interviewer to join'
    }
    if (peerConnected) {
      return isInterviewer ? 'Participant connected' : 'Interviewer connected'
    }
    return 'Establishing secure connection...'
  }, [joined, peers.length, peerConnected, isInterviewer])

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return h > 0
      ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const isTerminal = interviewData && ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(interviewData.status)
  const live = joined && started

  // ── Screens ─────────────────────────────────────────────────────────────
  if (ended) {
    return (
      <InterviewShell>
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8 max-w-md w-full mx-auto text-center">
          <div className="text-4xl mb-3">🎬</div>
          <h2 className="text-xl font-bold text-surface-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Interview Ended
          </h2>
          <p className="text-surface-500 text-sm mb-6">
            This interview was ended by {ended.byName}. You will be redirected shortly.
          </p>
          <div className="w-5 h-5 mx-auto border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </InterviewShell>
    )
  }

  if (phase === PHASE.ERROR) {
    return (
      <InterviewShell>
        <div className="bg-white rounded-2xl border border-danger-200 shadow-card p-8 max-w-lg w-full mx-auto text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold text-surface-900 mb-2">Error</h2>
          <p className="text-surface-500 text-sm mb-6">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setError(null); setPhase(PHASE.INVITE) }}
              className="flex-1 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/interviews')}
              className="flex-1 px-6 py-2.5 bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-medium rounded-xl transition-colors"
            >
              Back to Interviews
            </button>
          </div>
        </div>
      </InterviewShell>
    )
  }

  if (phase === PHASE.LOADING) {
    return <FullScreenLoader />
  }

  if (phase === PHASE.INVITE) {
    return (
      <InvitationScreen
        interviewData={interviewData}
        isInterviewer={isInterviewer}
        isBusy={isBusy}
        isTerminal={isTerminal}
        onContinue={() => setPhase(PHASE.DEVICE)}
        onExit={() => navigate('/interviews')}
      />
    )
  }

  if (phase === PHASE.DEVICE) {
    return (
      <DeviceCheckScreen
        mediaState={mediaState}
        mediaError={mediaError}
        localVideoRef={localVideoRef}
        isSecure={isSecureContextForMedia()}
        supportsMedia={!!navigator?.mediaDevices?.getUserMedia}
        onRetry={handleRetryMedia}
        onContinue={() => (isInterviewer ? beginJoin() : setPhase(PHASE.CONSENT))}
        onBack={() => setPhase(PHASE.INVITE)}
        isBusy={isBusy}
      />
    )
  }

  if (phase === PHASE.CONSENT && !isInterviewer) {
    return (
      <ConsentScreen
        onConsent={handleAcceptConsent}
        onDecline={() => navigate('/interviews')}
        isBusy={isBusy}
      />
    )
  }

  if (live) {
    return (
      <ActiveRoom
        interviewData={interviewData}
        isInterviewer={isInterviewer}
        user={user}
        localVideoRef={localVideoRef}
        mediaState={mediaState}
        remoteStreams={remoteStreams}
        peers={peers}
        devices={devices}
        qrPayload={qrPayload}
        onRefreshQr={handleRefreshQr}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        isCameraOff={isCameraOff}
        onToggleCamera={toggleCamera}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={handleToggleScreenShare}
        isRecording={isRecording}
        onToggleRecording={() => toggleRecording(localStreamRef.current, 'LAPTOP')}
        isChatOpen={isChatOpen}
        onToggleChat={setIsChatOpen}
        chatMessages={chatMessages}
        onSendMessage={handleSendMessage}
        alerts={alerts}
        elapsed={elapsed}
        formatTime={formatTime}
        peerConnected={peerConnected}
        connectionStatus={connectionStatus}
        notice={notice}
        handleEndInterview={handleEndInterview}
        handleLeaveInterview={handleLeaveInterview}
        socket={socket}
        interviewId={interviewId}
        sessionId={sessionId}
        expandedTile={expandedTile}
        onToggleTile={(key) => setExpandedTile((prev) => (prev === key ? null : key))}
      />
    )
  }

  // Waiting room (joined socket, not yet started)
  return (
    <WaitingRoomScreen
      isInterviewer={isInterviewer}
      interviewData={interviewData}
      qrPayload={qrPayload}
      onRefreshQr={handleRefreshQr}
      localVideoRef={localVideoRef}
      mediaState={mediaState}
      devices={devices}
      peerConnected={peerConnected}
      connectionStatus={connectionStatus}
      notice={notice}
      isStarting={isBusy}
      onStartNow={attemptStart}
      onExit={() => navigate('/interviews')}
    />
  )
}

export default function InterviewRoom({ user }) {
  return (
    <InterviewSessionProvider>
      <InterviewRoomInner user={user} />
    </InterviewSessionProvider>
  )
}
