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
import { AlertCircle, Clapperboard, Loader2 } from 'lucide-react'
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
import { normalizeInterview } from '../../utils/interviewPresentation'
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
      <div className="bg-white border border-slate-200 rounded-2xl shadow-card p-10 text-center">
        <div className="w-10 h-10 mx-auto mb-4 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">{message}</p>
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
    devices: sessionDevices, peers, alerts, chatMessages,
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
    devices: mediaDevices,
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
  } = useInterviewMedia()

  const {
    remoteStreams, connectionStates, webrtcState, addLocalStream,
    createOffer, handleOffer, handleAnswer, handleIceCandidate,
    replaceTrackAll, addScreenStream, removeScreenStream,
    closePeer, closeAll: closeWebRTC,
  } = useWebRTC(socket, interviewId, localStreamRef)

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStreamRef.current) {
      await removeScreenStream(screenStreamRef.current)
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      setIsScreenSharing(false)
      if (socket && interviewId) socket.emit('screen-share', { interviewId, sharing: false })
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStreamRef.current = stream
        await addScreenStream(stream)
        setIsScreenSharing(true)
        if (socket && interviewId) socket.emit('screen-share', { interviewId, sharing: true })
        const screenTrack = stream.getVideoTracks()[0]
        if (screenTrack) {
          screenTrack.onended = async () => {
            if (screenStreamRef.current) {
              await removeScreenStream(screenStreamRef.current)
              screenStreamRef.current.getTracks().forEach(t => t.stop())
              screenStreamRef.current = null
            }
            setIsScreenSharing(false)
            if (socket && interviewId) socket.emit('screen-share', { interviewId, sharing: false })
          }
        }
      } catch (err) {
        console.error('Screen share failed:', err)
      }
    }
  }, [isScreenSharing, socket, interviewId, addScreenStream, removeScreenStream])
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
   * Also reused by the error screen's "Try Again" action.
   */
  const loadInterview = useCallback(async () => {
    if (!interviewId) {
      setError('Interview ID is missing.')
      setPhase(PHASE.ERROR)
      return
    }
    setPhase(PHASE.LOADING)
    setError(null)
    try {
      const res = await interviewService.get(interviewId)
      const iv = normalizeInterview(res?.interview || res?.data?.interview || res)
      setInterviewData(iv)
      setInterview(iv)
      if (iv.status === 'IN_PROGRESS') {
        markStarted(iv.startedAt || new Date().toISOString())
      }
      setPhase(PHASE.INVITE)
    } catch (err) {
      setError(err?.message || 'Could not load this interview.')
      setPhase(PHASE.ERROR)
    }
  }, [interviewId, setInterview, markStarted])

  useEffect(() => {
    loadInterview()
  }, [loadInterview])

  // Request camera + mic whenever entering invite, device check, waiting, or active room phases.
  useEffect(() => {
    if (phase === PHASE.LOADING || phase === PHASE.ENDED || phase === PHASE.ERROR) return
    if (localStreamRef.current) return
    startLocalMedia()
  }, [phase, startLocalMedia, localStreamRef])

  // Keep the video element attached to the live stream.
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      console.log('[INTERVIEW] Attaching local stream to video element', {
        streamId: localStreamRef.current.id,
        trackCount: localStreamRef.current.getTracks().length,
        tracks: localStreamRef.current.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          readyState: t.readyState,
          enabled: t.enabled,
        })),
      })
      localVideoRef.current.srcObject = localStreamRef.current
      
      // Explicitly play the video
      localVideoRef.current.play().catch(err => {
        console.warn('[INTERVIEW] video.play() failed (may be expected):', err.message)
      })

      // Wait for metadata to confirm video is ready
      const onLoadedMetadata = () => {
        console.log('[INTERVIEW] ✅ Local video ready:', {
          videoWidth: localVideoRef.current.videoWidth,
          videoHeight: localVideoRef.current.videoHeight,
        })
      }
      localVideoRef.current.addEventListener('loadedmetadata', onLoadedMetadata)
      
      return () => {
        if (localVideoRef.current) {
          localVideoRef.current.removeEventListener('loadedmetadata', onLoadedMetadata)
        }
      }
    }
  }, [mediaState, localStreamRef, phase])

  /**
   * Join the signaling room. `onJoined(success)` is called with the result.
   */
  const joinSocketRoom = useCallback((onJoined) => {
    const doJoin = () => {
      if (!socket) {
        console.error('[INTERVIEW] Cannot join room: socket unavailable')
        setError('Interview server connection unavailable.')
        setPhase(PHASE.ERROR)
        onJoined?.(false)
        return
      }
      console.log('[INTERVIEW] Emitting join-room', {
        interviewId,
        socketId: socket.id,
        userId: user?.id,
        role: user?.role,
        isInterviewer,
      })
      socket.emit('join-room', { interviewId }, (response) => {
        if (leavingRef.current) return
        console.log('[INTERVIEW] join-room response:', {
          success: response?.success,
          sessionId: response?.sessionId,
          peerCount: response?.peers?.length || 0,
          peers: response?.peers?.map(p => ({ socketId: p.socketId, role: p.role, deviceType: p.deviceType })),
        })
        if (response?.success) {
          setJoined(true)
          setSessionId(response.sessionId)
          if (response.interview) {
            setInterviewData((prev) => prev || response.interview)
            setInterview(response.interview)
          }
          setPeers(response.peers || [])
          response.peers?.forEach((peer) => {
            console.log('[INTERVIEW] Found existing peer:', {
              socketId: peer.socketId,
              role: peer.role,
              deviceType: peer.deviceType,
              willCreateOffer: isInterviewer || peer.deviceType !== 'MOBILE',
            })
            if (isInterviewer || peer.deviceType !== 'MOBILE') {
              createOffer(peer.socketId)
            }
          })
          onJoined?.(true)
        } else {
          console.error('[INTERVIEW] join-room failed:', response?.error)
          setError(response?.error || 'Failed to join the interview room.')
          setPhase(PHASE.ERROR)
          onJoined?.(false)
        }
      })
    }

    if (socket && isConnected) {
      doJoin()
    } else if (socket) {
      // Socket exists but is still connecting, wait for connect event
      const onConnect = () => {
        socket.off('connect', onConnect)
        doJoin()
      }
      socket.once('connect', onConnect)
      // Safety timeout after 5s
      setTimeout(() => {
        socket.off('connect', onConnect)
        if (!socket.connected && !joined) {
          setError('Could not connect to the interview server. Check your connection and try again.')
          setPhase(PHASE.ERROR)
          onJoined?.(false)
        }
      }, 5000)
    } else {
      setError('Interview server connection unavailable.')
      setPhase(PHASE.ERROR)
      onJoined?.(false)
    }
  }, [socket, isConnected, interviewId, createOffer, setInterview, setPeers, joined])

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
    if (!interviewId) return
    if (joined) {
      setPhase(PHASE.WAITING)
      return
    }
    setError(null)
    setNotice(null)
    setIsBusy(true)
    try {
      const joinRes = await interviewService.join(interviewId)
      setSessionId(joinRes.session?.id)
      setQrPayload(joinRes.qrPayload || null)
      if (joinRes.interview) {
        const joinedIv = normalizeInterview(joinRes.interview)
        // Preserve the richer GET payload (candidate/interviewer/etc.) and
        // overlay the fresh join session fields (sessionId, status, …).
        setInterviewData((prev) => (prev ? { ...prev, ...joinedIv } : joinedIv))
        setInterview(joinedIv)
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
      if (isInterviewer) {
        createOffer(data.socketId)
        if (!started) attemptStart()
      }
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

  const handleAcceptConsent = useCallback(async () => {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await interviewService.recordConsent(interviewId)
      setConsentGiven(true)
      setIsBusy(false)
      if (joined) {
        setPhase(PHASE.WAITING)
      } else {
        await beginJoin()
      }
    } catch (err) {
      setIsBusy(false)
      setError(err?.message || 'Unable to record consent. Please try again.')
    }
  }, [interviewId, isBusy, joined, beginJoin, setConsentGiven])

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
  const videoStreaming = Object.values(webrtcState).some(state => state?.video === 'live')

  const connectionStatus = useMemo(() => {
    if (!joined) return 'Preparing your room...'
    if (peers.length === 0) {
      return isInterviewer
        ? 'Waiting for the participant to join'
        : 'Waiting for the interviewer to join'
    }
    if (videoStreaming) {
      return isInterviewer ? 'Participant video streaming' : 'Interviewer video streaming'
    }
    if (peerConnected) {
      return 'Connection established, waiting for video...'
    }
    return 'Establishing secure connection...'
  }, [joined, peers.length, peerConnected, videoStreaming, isInterviewer])

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
      <InterviewShell interviewId={interviewId} title="Interview Room" statusBadge="Ended">
        <div className="reg-admin-table-wrap" style={{ maxWidth: 500, margin: '0 auto', padding: 32, textAlign: 'center', background: '#fff' }}>
          <Clapperboard size={36} color="#16A34A" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Interview Ended
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
            This interview was ended by {ended.byName}. You will be redirected shortly.
          </p>
          <div className="reg-admin-loading" style={{ padding: 0 }}>
            <Loader2 size={24} className="spin" />
          </div>
        </div>
      </InterviewShell>
    )
  }

  if (phase === PHASE.ERROR) {
    return (
      <InterviewShell interviewId={interviewId} title="Interview Room" statusBadge="Error">
        <div className="reg-admin-table-wrap" style={{ maxWidth: 540, margin: '0 auto', padding: 32, textAlign: 'center', background: '#fff' }}>
          <AlertCircle size={40} color="#dc2626" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Couldn't Load the Interview
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>{error}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={loadInterview}
              className="reg-admin-btn reg-admin-btn--primary"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/interviews')}
              className="reg-admin-btn reg-admin-btn--secondary"
            >
              Back to Interviews
            </button>
          </div>
        </div>
      </InterviewShell>
    )
  }

  if (phase === PHASE.LOADING) {
    return (
      <InterviewShell interviewId={interviewId} title="Interview Room" statusBadge="Loading">
        <div className="reg-admin-loading">
          <Loader2 size={32} className="spin" color="#16A34A" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Loading interview room...</span>
        </div>
      </InterviewShell>
    )
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
        interviewId={interviewId}
        mediaState={mediaState}
        mediaError={mediaError}
        localVideoRef={localVideoRef}
        isSecure={isSecureContextForMedia()}
        supportsMedia={!!navigator?.mediaDevices?.getUserMedia}
        onRetry={handleRetryMedia}
        onContinue={() => setPhase(PHASE.CONSENT)}
        onBack={() => setPhase(PHASE.INVITE)}
        isBusy={isBusy}
        devices={mediaDevices}
        selectedCamera={selectedCamera}
        selectedMicrophone={selectedMicrophone}
        onCameraChange={switchCamera}
        onMicrophoneChange={switchMicrophone}
        onEnumerateDevices={enumerateDevices}
        micLevel={micLevel}
        isMicDetected={isMicDetected}
        cameraPermission={cameraPermission}
        micPermission={micPermission}
      />
    )
  }

  if (phase === PHASE.CONSENT) {
    return (
      <ConsentScreen
        interviewId={interviewId}
        onConsent={handleAcceptConsent}
        onDecline={() => {
          stopLocalMedia()
          navigate('/interviews')
        }}
        isBusy={isBusy}
        error={error}
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
        devices={sessionDevices}
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
      interviewData={interviewData}
      isInterviewer={isInterviewer}
      user={user}
      localVideoRef={localVideoRef}
      mediaState={mediaState}
      remoteStreams={remoteStreams}
      peers={peers}
      devices={sessionDevices}
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

export default function InterviewRoom({ user }) {
  return (
    <InterviewSessionProvider>
      <InterviewRoomInner user={user} />
    </InterviewSessionProvider>
  )
}
