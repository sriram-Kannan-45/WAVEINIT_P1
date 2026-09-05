/**
 * ActiveRoom Component (Stage 5: Main Interview Room)
 * SaaS layout with multi-stream support, mandatory setup gating, in-call chat,
 * tab-switch detection, HR scorecard, and timer countdown.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import InterviewShell from './InterviewShell'
import VideoTile from '../VideoTile'
import QRPairing from '../QRPairing'
import MobileFeedTile from './MobileFeedTile'
import GroupDiscussionRoom from './GroupDiscussionRoom'
import interviewService from '../../../services/interviewService'
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  LogOut,
  CheckCircle2,
  Clock,
  User,
  FileText,
  Send,
  AlertCircle,
  QrCode,
  MessageSquare,
  Star,
  X,
  AlertTriangle,
  Disc,
} from 'lucide-react'

const defaultFormatTime = (seconds = 0) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0
    ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function ActiveRoom({
  interviewData,
  isInterviewer,
  user,
  localVideoRef,
  mediaState,
  remoteStreams = {},
  connectionStates = {},
  webrtcState = {},
  peers = [],
  devices = {},
  qrPayload,
  onRefreshQr,
  isMuted,
  onToggleMute,
  isCameraOff,
  onToggleCamera,
  isScreenSharing,
  onToggleScreenShare,
  isRecording = false,
  onToggleRecording,
  handleEndInterview,
  handleLeaveInterview,
  socket,
  interviewId,
  getRemoteDiagnostics,
  onRetryConnection,
  participantSetupStatus,
  tabSwitchCount = 0,
  chatMessages = [],
  onSendMessage,
  elapsed = 0,
  formatTime = defaultFormatTime,
  started = false,
  peerConnected,
  connectionStatus,
  mobileFrames = {}, mobileEvidence = {}, localStream, onStart, notice, aiStatus,
  candidateMonitoring = {},
}) {
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [reconnectError,setReconnectError]=useState('')
  const [screenShareLive, setScreenShareLive] = useState(false)
  const [screenShareStatus, setScreenShareStatus] = useState('none') // 'none' | 'connecting' | 'live' | 'failed'

  // In-call Chat state
  const [showChat, setShowChat] = useState(false)
  const [chatText, setChatText] = useState('')
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const lastSeenMsgCountRef = useRef(0)
  const chatBottomRef = useRef(null)

  // HR Scorecard state (Trainer view)
  const [techRating, setTechRating] = useState(0)
  const [commRating, setCommRating] = useState(0)
  const [problemRating, setProblemRating] = useState(0)
  const [recommendation, setRecommendation] = useState('')
  const [showEndModal, setShowEndModal] = useState(false)

  const handleScreenShareVideoState = useCallback((state) => {
    setScreenShareLive(state.ready)
  }, [])

  // Unread chat tracking
  useEffect(() => {
    if (chatMessages.length > lastSeenMsgCountRef.current) {
      if (!showChat) {
        setUnreadChatCount(prev => prev + (chatMessages.length - lastSeenMsgCountRef.current))
      }
      lastSeenMsgCountRef.current = chatMessages.length
    }
  }, [chatMessages.length, showChat])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (showChat) {
      setUnreadChatCount(0)
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [showChat, chatMessages.length])

  // Fetch initial notes
  useEffect(() => {
    if (interviewId) {
      interviewService.getNotes(interviewId)
        .then(res => {
          if (res?.notes?.length > 0) {
            setNotes(res.notes.map(n => n.note_text).join('\n\n'))
          } else if (res?.note) {
            setNotes(res.note)
          }
        })
        .catch(() => {})
    }
  }, [interviewId])

  const handleSaveNotes = async () => {
    if (!interviewId) return
    try {
      setSavingNotes(true)
      let fullNotes = notes
      if (isInterviewer && (techRating > 0 || commRating > 0 || problemRating > 0 || recommendation)) {
        const ratingSummary = `\n\n[HR Scorecard]\n- Technical Skills: ${techRating}/5\n- Communication: ${commRating}/5\n- Problem Solving: ${problemRating}/5\n- Recommendation: ${recommendation || 'Pending'}`
        if (!notes.includes('[HR Scorecard]')) {
          fullNotes = `${notes.trim()}${ratingSummary}`
          setNotes(fullNotes)
        }
      }
      await interviewService.createNote(interviewId, { note_text: fullNotes })
    } catch (e) {
      console.error('Failed to save notes:', e)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSendChatMessage = (e) => {
    e?.preventDefault()
    if (!chatText.trim()) return
    onSendMessage?.(chatText.trim())
    setChatText('')
  }

  const candidateName = interviewData?.candidate?.name || 'Candidate'
  const candidateEmail = interviewData?.candidate?.email || ''
  const interviewerName = interviewData?.interviewer?.name || 'Interviewer'
  const interviewerEmail = interviewData?.interviewer?.email || ''
  const scheduledDate = interviewData?.scheduledAt || interviewData?.scheduled_at
    ? new Date(interviewData.scheduledAt || interviewData.scheduled_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Today'
  const scheduledTime = interviewData?.scheduledAt || interviewData?.scheduled_at
    ? new Date(interviewData.scheduledAt || interviewData.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Scheduled'
  const durationMinutes = interviewData?.durationMinutes || interviewData?.duration_minutes || 60
  const durationSeconds = durationMinutes * 60
  const remainingSeconds = Math.max(0, durationSeconds - elapsed)

  // Pinned stream selection state
  const [pinnedStreamKey, setPinnedStreamKey] = useState(null)

  // Differentiate streams by role and deviceType
  const remoteEntries = Object.entries(remoteStreams || {})

  // Mobile peer & stream (from participant's phone)
  const mobilePeer = peers.find(p => p.deviceType === 'MOBILE' && (isInterviewer || String(p.userId)===String(user?.id)))
  const mobileStream = mobilePeer
    ? remoteStreams[mobilePeer.socketId]
    : (remoteEntries.find(([id]) => peers.find(p => p.socketId === id)?.deviceType === 'MOBILE')?.[1] || null)

  // Find counterpart laptop peer
  const remoteLaptopPeer = peers.find(p => p.socketId !== socket?.id && p.deviceType !== 'MOBILE')
  const remoteLaptopStream = remoteLaptopPeer
    ? (remoteStreams[remoteLaptopPeer.socketId] || remoteEntries.find(([id]) => id !== mobilePeer?.socketId && !id.endsWith('_screen'))?.[1] || null)
    : (remoteEntries.find(([id]) => id !== mobilePeer?.socketId && !id.endsWith('_screen'))?.[1] || null)

  // Participant laptop peer & stream (for Trainer view)
  const participantLaptopPeer = peers.find(p => (p.role?.toUpperCase() === 'PARTICIPANT' || p.role?.toUpperCase() === 'CANDIDATE') && p.deviceType !== 'MOBILE') || (isInterviewer ? remoteLaptopPeer : null)
  const participantLaptopStream = isInterviewer ? remoteLaptopStream : (participantLaptopPeer ? remoteStreams[participantLaptopPeer.socketId] : null)

  // Trainer laptop peer & stream (for Participant view)
  const trainerLaptopPeer = peers.find(p => (p.role?.toUpperCase() === 'TRAINER' || p.role?.toUpperCase() === 'ADMIN') && p.deviceType !== 'MOBILE') || (!isInterviewer ? remoteLaptopPeer : null)
  const trainerLaptopStream = !isInterviewer ? remoteLaptopStream : (trainerLaptopPeer ? remoteStreams[trainerLaptopPeer.socketId] : null)

  // Screen share detection
  const participantScreenStream = (remoteStreams[`${participantLaptopPeer?.socketId}_screen`]
    || remoteEntries.find(([id]) => id.endsWith('_screen'))?.[1]
    || (participantLaptopPeer && remoteStreams[participantLaptopPeer.socketId]?.getVideoTracks().length > 1
        ? remoteStreams[participantLaptopPeer.socketId] : null)
    || null)

  // Tier 4: Remote Media Status
  const hasTrainerVideo      = !!trainerLaptopStream      && trainerLaptopStream.getVideoTracks().some(t => t.readyState === 'live')
  const hasParticipantVideo  = !!participantLaptopStream  && participantLaptopStream.getVideoTracks().some(t => t.readyState === 'live')
  const hasMobileVideo       = !!mobileStream             && mobileStream.getVideoTracks().some(t => t.readyState === 'live')
  const hasScreenVideo       = !!participantScreenStream && participantScreenStream.getVideoTracks().some(t => t.readyState === 'live')

  // Screen share status lifecycle
  useEffect(() => {
    if (!participantScreenStream) {
      setScreenShareStatus('none')
      return
    }
    if (screenShareLive) {
      setScreenShareStatus('live')
      return
    }

    setScreenShareStatus('connecting')
    const timer = setTimeout(() => {
      setScreenShareStatus(prev => prev === 'live' ? 'live' : 'failed')
    }, 8000)

    return () => clearTimeout(timer)
  }, [participantScreenStream, screenShareLive])

  // Track connection duration to show retry if negotiation takes too long
  const [connectingElapsed, setConnectingElapsed] = useState(0)
  useEffect(() => {
    if (!remoteLaptopPeer || hasTrainerVideo || hasParticipantVideo) {
      setConnectingElapsed(0)
      return
    }
    const timer = setInterval(() => {
      setConnectingElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [remoteLaptopPeer, hasTrainerVideo, hasParticipantVideo])

  // Auto-retry connection once if stuck for > 8s
  const retryAttemptedRef = useRef(false)
  useEffect(() => {
    if (connectingElapsed >= 8 && !retryAttemptedRef.current && remoteLaptopPeer) {
      retryAttemptedRef.current = true
      console.log('[ActiveRoom] Connection taking longer than 8s — triggering automatic ICE retry...')
      onRetryConnection?.(remoteLaptopPeer.socketId)
    }
  }, [connectingElapsed, remoteLaptopPeer, onRetryConnection])

  // Participant setup completion flag
  const isParticipantSetupDone = !isInterviewer || participantSetupStatus?.completed || participantSetupStatus?.step === 'room' || hasParticipantVideo

  // Primary video stage stream resolution
  const mainStageStream = (() => {
    if (pinnedStreamKey) {
      if (pinnedStreamKey === 'screen' && participantScreenStream) return participantScreenStream
      if (pinnedStreamKey === 'mobile' && mobileStream) return mobileStream
      if (pinnedStreamKey === 'laptop' && (participantLaptopStream || remoteLaptopStream)) return participantLaptopStream || remoteLaptopStream
      if (remoteStreams[pinnedStreamKey]) return remoteStreams[pinnedStreamKey]
    }

    if (isInterviewer) {
      // Only show participant video if participant setup is complete
      if (!isParticipantSetupDone) return null
      return participantLaptopStream || remoteLaptopStream || null
    } else {
      return trainerLaptopStream || remoteLaptopStream || null
    }
  })()

  const mainStageLabel = (() => {
    if (mainStageStream === participantScreenStream) return `${candidateName}'s Screen Share`
    if (mainStageStream === mobileStream) return `${candidateName}'s Mobile Camera`
    return isInterviewer ? `${candidateName}'s Laptop Camera` : `${interviewerName}'s Camera`
  })()

  const isMainStageLive = !!mainStageStream && mainStageStream.getVideoTracks().some(t => t.readyState === 'live')

  // Tier 1: Room Presence
  const trainerInRoom   = !!trainerLaptopPeer || (!isInterviewer && !!remoteLaptopPeer)
  const participantInRoom = !!participantLaptopPeer || (isInterviewer && !!remoteLaptopPeer)
  const mobileInRoom    = !!mobilePeer

  // Tier 2 / 3: WebRTC Connection State
  const mobileWebRTCState            = mobilePeer            ? connectionStates[mobilePeer.socketId]            : null
  const participantLaptopWebRTCState  = participantLaptopPeer ? connectionStates[participantLaptopPeer.socketId]  : (remoteLaptopPeer ? connectionStates[remoteLaptopPeer.socketId] : null)
  const trainerLaptopWebRTCState      = trainerLaptopPeer    ? connectionStates[trainerLaptopPeer.socketId]      : (remoteLaptopPeer ? connectionStates[remoteLaptopPeer.socketId] : null)

  // Derived helpers
  const isMobileConnected            = hasMobileVideo || mobileWebRTCState === 'connected' || !!devices?.mobile || mobileInRoom
  const isParticipantLaptopConnected = hasParticipantVideo || participantLaptopWebRTCState === 'connected'
  const isTrainerConnected           = hasTrainerVideo || trainerLaptopWebRTCState === 'connected'

  const remotePeerInRoom     = isInterviewer ? (participantInRoom || mobileInRoom) : trainerInRoom
  const remoteWebRTCState    = isInterviewer ? (participantLaptopWebRTCState || mobileWebRTCState) : trainerLaptopWebRTCState
  const remoteName           = isInterviewer ? candidateName : interviewerName

  /**
   * Derive center-stage status
   */
  const centerStageStatus = (() => {
    if (isMainStageLive) return 'live'
    if (isInterviewer && !isParticipantSetupDone) return 'waiting_setup'
    if (!remotePeerInRoom) return 'waiting'
    if (remoteWebRTCState === 'connected') return 'connected'
    if (remoteWebRTCState === 'failed') return 'failed'
    if (remoteWebRTCState === 'disconnected') return 'disconnected'
    return 'connecting'
  })()

  const getStatusBadgeProps = (peerObj, peerStream, peerWebRTCState, peerHasVideo) => {
    if (!peerObj) {
      return { text: '○ Waiting', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }
    }
    if (peerHasVideo || peerWebRTCState === 'connected') {
      return { text: '● Connected', bg: '#dcfce7', color: '#15803D', border: '#bbf7d0' }
    }
    if (peerWebRTCState === 'connecting' || peerWebRTCState === 'checking' || peerWebRTCState === 'new' || peerWebRTCState === null) {
      return { text: '◐ Connecting...', bg: '#fef3c7', color: '#d97706', border: '#fcd34d' }
    }
    if (peerWebRTCState === 'failed') {
      return { text: '✕ Failed', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
    }
    if (peerWebRTCState === 'disconnected') {
      return { text: '↻ Reconnecting', bg: '#fef3c7', color: '#d97706', border: '#fcd34d' }
    }
    return { text: '◐ Connecting...', bg: '#fef3c7', color: '#d97706', border: '#fcd34d' }
  }

  // Setup step status helpers
  const setupStep = participantSetupStatus?.step || 'ready'
  const isReadyDone = setupStep !== 'ready'
  const isPairDone = ['screenshare', 'fullscreen', 'room'].includes(setupStep) || isMobileConnected
  const isScreenDone = ['fullscreen', 'room'].includes(setupStep)
  const isFullscreenDone = setupStep === 'room'

  if(interviewData?.mode==='GROUP_DISCUSSION') return <GroupDiscussionRoom {...{interviewData,user,isInterviewer,localStream,peers,remoteStreams,socket,mobileFrames,mobileEvidence,qrPayload,onRefreshQr,onStart,started,elapsed,formatTime,handleEndInterview,handleLeaveInterview,isMuted,onToggleMute,isCameraOff,onToggleCamera,chatMessages,onSendMessage,notice,aiStatus,candidateMonitoring,isRecording,onToggleRecording}} />

  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'IN_PROGRESS'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Interview #${interviewId}`}
      status={isTrainerConnected || isParticipantLaptopConnected ? 'Live' : 'Waiting status'}
      headerRight={
        <button
          onClick={isInterviewer ? () => setShowEndModal(true) : handleLeaveInterview}
          className="reg-admin-btn reg-admin-btn--danger"
        >
          <LogOut size={14} />
          {isInterviewer ? 'End Interview' : 'Leave Room'}
        </button>
      }
    >
      {!isInterviewer&&started&&aiStatus?.faceDetected===false&&<p role="alert" style={{padding:12,background:'#fffbeb'}}>Your face is not visible in the laptop camera. Adjust your position; your interview stays open.</p>}
      {!isInterviewer && interviewData?.require_mobile_pairing!==false && <div style={{maxWidth:340,marginBottom:16}}><MobileFeedTile name={user?.name||'Your camera'} stream={mobileStream} frame={mobileFrames[user?.id]} evidence={mobileEvidence[user?.id]} onReconnect={async()=>{try{await onRefreshQr();setShowQrModal(true);setReconnectError('')}catch(e){setReconnectError(e.message)}}} /></div>}
      {/* 3-Column SaaS Grid */}
      <div className="interview-room-grid">

        {/* LEFT COLUMN: Interview Details & Connection Status */}
        <div className="interview-col-details" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Interview Details Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
              Interview Details
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Candidate</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{candidateName}</div>
                {candidateEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{candidateEmail}</div>}
              </div>

              <div>
                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Interviewer</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{interviewerName}</div>
                {interviewerEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{interviewerEmail}</div>}
              </div>

              <div>
                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Type</span>
                <span className="reg-admin-type" style={{ fontSize: 11, fontWeight: 600, display: 'inline-block', marginTop: 2 }}>
                  {interviewData?.type || 'HR'} Interview
                </span>
              </div>

              <div>
                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Date & Time</span>
                <div style={{ fontSize: 11, color: '#334155', fontWeight: 500 }}>{scheduledDate} at {scheduledTime}</div>
              </div>

              <div>
                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Duration</span>
                <div style={{ fontSize: 11, color: '#334155', fontWeight: 500 }}>{durationMinutes} minutes</div>
              </div>
            </div>
          </div>

          {/* Connection Status Card */}
          <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
              Connection Status
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const targetPeer      = isInterviewer ? participantLaptopPeer : trainerLaptopPeer
                const targetHasVideo  = isInterviewer ? hasParticipantVideo   : hasTrainerVideo
                const targetState     = isInterviewer ? participantLaptopWebRTCState : trainerLaptopWebRTCState
                const laptopBadge = getStatusBadgeProps(targetPeer, null, targetState, targetHasVideo)
                const mobileBadge = getStatusBadgeProps(mobilePeer, null, mobileWebRTCState, hasMobileVideo)

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: '#475569', fontWeight: 500 }}>
                        {isInterviewer ? 'Participant Laptop' : 'Interviewer Laptop'}
                      </span>
                      <span className="reg-admin-status" style={{ background: laptopBadge.bg, color: laptopBadge.color, borderColor: laptopBadge.border, fontSize: 10, padding: '1px 6px' }}>
                        {laptopBadge.text}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: '#475569', fontWeight: 500 }}>Mobile Camera</span>
                      <span className="reg-admin-status" style={{ background: mobileBadge.bg, color: mobileBadge.color, borderColor: mobileBadge.border, fontSize: 10, padding: '1px 6px' }}>
                        {mobileBadge.text}
                      </span>
                    </div>
                  </>
                )
              })()}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#475569', fontWeight: 500 }}>Microphone</span>
                <span className="reg-admin-status" style={{
                  background: isMuted ? '#fee2e2' : '#dcfce7',
                  color: isMuted ? '#dc2626' : '#15803D',
                  borderColor: isMuted ? '#fca5a5' : '#bbf7d0',
                  fontSize: 10, padding: '1px 6px',
                }}>
                  {isMuted ? '✕ Muted' : '● Active'}
                </span>
              </div>

              {/* Tab Switch Integrity Badge */}
              {isInterviewer && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#475569', fontWeight: 500 }}>Tab Focus</span>
                  <span className="reg-admin-status" style={{
                    background: tabSwitchCount === 0 ? '#dcfce7' : tabSwitchCount < 3 ? '#fef3c7' : '#fee2e2',
                    color: tabSwitchCount === 0 ? '#15803D' : tabSwitchCount < 3 ? '#d97706' : '#dc2626',
                    borderColor: tabSwitchCount === 0 ? '#bbf7d0' : tabSwitchCount < 3 ? '#fcd34d' : '#fca5a5',
                    fontSize: 10, padding: '1px 6px',
                  }}>
                    {tabSwitchCount === 0 ? '● Active' : `⚠️ ${tabSwitchCount} switch${tabSwitchCount > 1 ? 'es' : ''}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Large Video Container & Video Controls */}
        <div className="interview-col-video" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, height: '100%' }}>
          {/* Main Video Viewport */}
          <div className="interview-video-stage" style={{
            background: '#0F172A',
            borderRadius: 12,
            border: '1px solid #1E293B',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            flex: '1 1 0%',
            minHeight: 0,
            width: '100%',
          }}>
            {/* Live Video Feed */}
            {centerStageStatus === 'live' && mainStageStream ? (
              <VideoTile
                stream={mainStageStream}
                label={mainStageLabel}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : centerStageStatus === 'waiting_setup' ? (
              /* Trainer View: Participant Setup Progress Checklist */
              <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20, maxWidth: 440 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(37,99,235,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <Clock size={24} color="#60a5fa" />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', margin: '0 0 6px' }}>
                  Waiting for Candidate Setup...
                </h3>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 16px', lineHeight: 1.4 }}>
                  {candidateName} is completing the required pre-join preparation steps.
                </p>

                {/* 4 Step Progress Checklist */}
                <div style={{
                  background: 'rgba(30,41,59,0.7)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  textAlign: 'left',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: isReadyDone ? '#4ade80' : '#cbd5e1' }}>1. Hardware & Media Check</span>
                    <span style={{ color: isReadyDone ? '#4ade80' : '#fbbf24', fontWeight: 600 }}>{isReadyDone ? '✓ Ready' : '◐ In Progress'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: isPairDone ? '#4ade80' : '#cbd5e1' }}>2. Mobile QR Pairing</span>
                    <span style={{ color: isPairDone ? '#4ade80' : setupStep === 'pair' ? '#fbbf24' : '#64748b', fontWeight: 600 }}>
                      {isPairDone ? '✓ Paired' : setupStep === 'pair' ? '◐ Pairing...' : '○ Pending'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: isScreenDone ? '#4ade80' : '#cbd5e1' }}>3. Screen Sharing</span>
                    <span style={{ color: isScreenDone ? '#4ade80' : setupStep === 'screenshare' ? '#fbbf24' : '#64748b', fontWeight: 600 }}>
                      {isScreenDone ? '✓ Configured' : setupStep === 'screenshare' ? '◐ Setting up...' : '○ Pending'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: isFullscreenDone ? '#4ade80' : '#cbd5e1' }}>4. Fullscreen Room Entry</span>
                    <span style={{ color: isFullscreenDone ? '#4ade80' : setupStep === 'fullscreen' ? '#fbbf24' : '#64748b', fontWeight: 600 }}>
                      {isFullscreenDone ? '✓ Ready' : setupStep === 'fullscreen' ? '◐ Entering...' : '○ Pending'}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 10, color: '#64748b', margin: '12px 0 0' }}>
                  Live video feed will appear automatically once candidate enters the room.
                </p>
              </div>
            ) : (
              /* Status placeholder */
              <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20 }}>
                <div style={{
                  width: 50, height: 50, borderRadius: '50%',
                  background: centerStageStatus === 'failed' ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px',
                }}>
                  {centerStageStatus === 'failed'
                    ? <AlertCircle size={26} color="#dc2626" />
                    : centerStageStatus === 'connecting' || centerStageStatus === 'connected'
                      ? <div style={{ width: 26, height: 26, border: '3px solid #475569', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      : <VideoIcon size={26} color="#CBD5E1" />}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', margin: '0 0 4px' }}>
                  {centerStageStatus === 'waiting'
                    ? (isInterviewer ? 'Waiting for participant to join...' : 'Waiting for interviewer...')
                    : centerStageStatus === 'connecting'
                      ? `Connecting to ${remoteName}...`
                      : centerStageStatus === 'connected'
                        ? `Connected to ${remoteName}`
                        : centerStageStatus === 'failed'
                          ? 'Connection failed'
                          : `${remoteName} disconnected`}
                </h3>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 auto 10px', maxWidth: 340, lineHeight: 1.4 }}>
                  {centerStageStatus === 'connecting' && connectingElapsed > 5
                    ? 'Negotiating media connection. Click Retry below if it takes longer than expected.'
                    : centerStageStatus === 'connecting'
                      ? 'Establishing secure WebRTC connection. This takes a few seconds.'
                      : centerStageStatus === 'failed'
                        ? 'Could not establish video connection. Please click Retry below.'
                        : 'Waiting for stream frames...'}
                </p>
                {(centerStageStatus === 'failed' || (centerStageStatus === 'connecting' && connectingElapsed > 5)) && (
                  <button
                    onClick={() => onRetryConnection?.(remoteLaptopPeer?.socketId)}
                    className="reg-admin-btn reg-admin-btn--secondary"
                    style={{ fontSize: 11, padding: '4px 12px', margin: '4px auto 0' }}
                  >
                    Retry Video Connection
                  </button>
                )}
              </div>
            )}

            {/* Local Video Picture-in-Picture */}
            <div style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 110,
              height: 70,
              borderRadius: 8,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.2)',
              background: '#000',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 20,
            }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              <span style={{
                position: 'absolute',
                bottom: 2,
                left: 2,
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 4px',
                borderRadius: 3,
              }}>
                You ({isInterviewer ? 'Trainer' : 'Candidate'})
              </span>
            </div>

            {/* Elapsed Timer & Time Remaining Overlay */}
            <div style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(4px)',
              padding: '4px 10px',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 20,
            }}>
              <Clock size={12} color="#16A34A" />
              <span>{formatTime(elapsed || 0)} / {durationMinutes}m</span>
              <span style={{ color: remainingSeconds < 300 ? '#f87171' : '#94a3b8', fontSize: 10, fontWeight: 500 }}>
                ({Math.ceil(remainingSeconds / 60)}m left)
              </span>
            </div>

            {/* In-Call Chat Overlay Popover */}
            {showChat && (
              <div style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                width: 320,
                height: 280,
                background: '#ffffff',
                borderRadius: 10,
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 30,
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}>
                {/* Chat Header */}
                <div style={{
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MessageSquare size={14} color="#2563eb" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>In-Call Chat</span>
                  </div>
                  <button
                    onClick={() => setShowChat(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b' }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Chat Messages */}
                <div style={{
                  flex: 1,
                  padding: 10,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  background: '#fafafa',
                }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, margin: 'auto' }}>
                      No messages yet. Send a note if you experience audio/video issues.
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => {
                      const isMe = msg.fromUserId === user?.id || msg.fromSocketId === socket?.id
                      return (
                        <div key={i} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                          <div style={{
                            fontSize: 9,
                            color: '#64748b',
                            marginBottom: 2,
                            textAlign: isMe ? 'right' : 'left',
                          }}>
                            {isMe ? 'You' : (msg.fromUserName || remoteName)} · {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                          <div style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            fontSize: 11,
                            lineHeight: 1.4,
                            background: isMe ? '#2563eb' : '#e2e8f0',
                            color: isMe ? '#ffffff' : '#0f172a',
                          }}>
                            {msg.message}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendChatMessage} style={{ padding: '6px 8px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 6, background: '#fff' }}>
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Type message to room..."
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      fontSize: 11,
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    className="reg-admin-btn reg-admin-btn--primary"
                    style={{ padding: '5px 10px', fontSize: 11 }}
                  >
                    <Send size={12} />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Video Controls Bar */}
          <div className="reg-admin-table-wrap interview-video-controls" style={{ padding: '4px 10px', gap: 6 }}>
            <button
              onClick={onToggleMute}
              className={`reg-admin-btn ${isMuted ? 'reg-admin-btn--danger' : 'reg-admin-btn--secondary'}`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              onClick={onToggleCamera}
              className={`reg-admin-btn ${isCameraOff ? 'reg-admin-btn--danger' : 'reg-admin-btn--secondary'}`}
              title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
            >
              {isCameraOff ? <VideoOff size={14} /> : <VideoIcon size={14} />}
              <span>{isCameraOff ? 'Camera On' : 'Camera Off'}</span>
            </button>

            {/* In-Call Chat Toggle Button */}
            <button
              onClick={() => setShowChat(prev => !prev)}
              className={`reg-admin-btn ${showChat ? 'reg-admin-btn--primary' : 'reg-admin-btn--secondary'}`}
              title="Toggle In-Call Chat"
            >
              <MessageSquare size={14} />
              <span>Chat</span>
              {unreadChatCount > 0 && !showChat && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '50%',
                  padding: '1px 5px',
                  fontSize: 10,
                  fontWeight: 700,
                  marginLeft: 3,
                }}>
                  {unreadChatCount}
                </span>
              )}
            </button>

            {/* Screen Share: Participant only */}
            {!isInterviewer && (
              <button
                onClick={onToggleScreenShare}
                className={`reg-admin-btn ${isScreenSharing ? 'reg-admin-btn--primary' : 'reg-admin-btn--secondary'}`}
                title="Share Screen"
              >
                <Monitor size={14} />
                <span>{isScreenSharing ? 'Sharing' : 'Share Screen'}</span>
              </button>
            )}

            {/* Recording Control (if available) */}
            {onToggleRecording && (
              <button
                onClick={onToggleRecording}
                className={`reg-admin-btn ${isRecording ? 'reg-admin-btn--danger' : 'reg-admin-btn--secondary'}`}
                title={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                <Disc size={14} className={isRecording ? 'spin' : ''} />
                <span>{isRecording ? 'Recording' : 'Record'}</span>
              </button>
            )}

            <button
              onClick={isInterviewer ? () => setShowEndModal(true) : handleLeaveInterview}
              className="reg-admin-btn reg-admin-btn--danger"
            >
              <LogOut size={14} />
              <span>{isInterviewer ? 'End Interview' : 'Leave Room'}</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Participant Mobile Feed (Trainer View) OR Connected Status (Participant View) & Notes */}
        <div className="interview-col-notes" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isInterviewer ? (
            /* Trainer View: Participant Screen Share & Mobile Camera Feed Tiles */
            <>
              {/* Participant Screen Share Feed Tile */}
              <div
                className="reg-admin-table-wrap"
                style={{
                  background: '#fff',
                  padding: 10,
                  cursor: participantScreenStream ? 'pointer' : 'default',
                  outline: pinnedStreamKey === 'screen' ? '2px solid #2563eb' : 'none',
                  flex: '0 0 auto',
                }}
                onClick={() => participantScreenStream && setPinnedStreamKey(pinnedStreamKey === 'screen' ? null : 'screen')}
                title={participantScreenStream ? 'Click to pin/unpin to main stage' : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Screen Share {pinnedStreamKey === 'screen' ? '📌' : ''}
                  </h4>
                  <span className="reg-admin-status" style={{
                    background: screenShareStatus === 'live' ? '#dcfce7' : screenShareStatus === 'failed' ? '#fee2e2' : screenShareStatus === 'connecting' ? '#fef3c7' : '#f1f5f9',
                    color: screenShareStatus === 'live' ? '#15803D' : screenShareStatus === 'failed' ? '#dc2626' : screenShareStatus === 'connecting' ? '#d97706' : '#64748b',
                    borderColor: screenShareStatus === 'live' ? '#bbf7d0' : screenShareStatus === 'failed' ? '#fca5a5' : screenShareStatus === 'connecting' ? '#fcd34d' : '#e2e8f0',
                    fontSize: 10, padding: '1px 6px',
                  }}>
                    {screenShareStatus === 'live'
                      ? '● Live'
                      : screenShareStatus === 'failed'
                        ? '✕ Failed'
                        : screenShareStatus === 'connecting'
                          ? '◐ Starting...'
                          : '○ Off'}
                  </span>
                </div>
                <div style={{ width: '100%', height: 100, background: '#0f172a', borderRadius: 8, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {participantScreenStream ? (
                    <VideoTile
                      stream={participantScreenStream}
                      label={`${candidateName}'s Screen`}
                      isScreenShare
                      style={{ width: '100%', height: '100%' }}
                      onVideoState={handleScreenShareVideoState}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 6 }}>
                      <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>
                        Waiting for screen share...
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Participant Mobile Camera Feed Tile */}
              <div
                style={{
                  cursor: 'pointer',
                  borderRadius: 10,
                  outline: pinnedStreamKey === 'mobile' ? '2px solid #2563eb' : 'none',
                  flex: '0 0 auto',
                }}
                onClick={() => setPinnedStreamKey(pinnedStreamKey === 'mobile' ? null : 'mobile')}
                title="Click to pin/unpin to main stage"
              >
                <MobileFeedTile frame={mobileFrames[mobilePeer?.userId]} evidence={mobileEvidence[mobilePeer?.userId]} stream={mobileStream} name={candidateName} />
              </div>
            </>
          ) : (
            /* Participant View: Connect Mobile Camera Status or QR Code Card */
            <div style={{ flex: '0 0 auto' }}>
              {isMobileConnected ? (
                <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 10, border: '1px solid #bbf7d0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                      Mobile Companion Camera
                    </h4>
                    <span className="reg-admin-status" style={{
                      background: '#dcfce7',
                      color: '#15803D',
                      borderColor: '#bbf7d0',
                      fontSize: 10,
                      padding: '1px 6px',
                    }}>
                      ● Connected
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#166534', margin: 0 }}>
                    Secondary proctoring camera is connected & streaming.
                  </p>
                </div>
              ) : (
                <QRPairing
                  qrPayload={qrPayload}
                  onRefresh={onRefreshQr}
                  expiresAt={qrPayload?.expiresAt}
                  tokenStatus="○ Waiting for scan"
                />
              )}
            </div>
          )}

          {/* Trainer HR Scorecard (Trainer View Only) */}
          {isInterviewer && (
            <div className="reg-admin-table-wrap" style={{ background: '#fff', padding: 10, flex: '0 0 auto' }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px', color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
                HR Quick Scorecard
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#475569' }}>Technical</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={14}
                        onClick={() => setTechRating(star)}
                        style={{ cursor: 'pointer', fill: star <= techRating ? '#f59e0b' : 'none', color: star <= techRating ? '#f59e0b' : '#cbd5e1' }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#475569' }}>Communication</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={14}
                        onClick={() => setCommRating(star)}
                        style={{ cursor: 'pointer', fill: star <= commRating ? '#f59e0b' : 'none', color: star <= commRating ? '#f59e0b' : '#cbd5e1' }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#475569' }}>Problem Solving</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={14}
                        onClick={() => setProblemRating(star)}
                        style={{ cursor: 'pointer', fill: star <= problemRating ? '#f59e0b' : 'none', color: star <= problemRating ? '#f59e0b' : '#cbd5e1' }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 4 }}>
                  <select
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                    style={{ width: '100%', fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    <option value="">-- Recommendation --</option>
                    <option value="Strong Hire">Strong Hire</option>
                    <option value="Hire">Hire</option>
                    <option value="Hold / Under Review">Hold / Under Review</option>
                    <option value="Reject">Reject</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Interview Notes Card */}
          <div className="reg-admin-table-wrap interview-notes-card" style={{ background: '#fff', padding: 10, flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 120 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Interview Notes
              </h4>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="reg-admin-btn reg-admin-btn--secondary"
                style={{ padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record assessment notes, evaluation feedback, and candidate answers here..."
              style={{
                flex: '1 1 0%',
                width: '100%',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 8,
                fontSize: 12,
                resize: 'none',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {reconnectError&&<p role="alert">{reconnectError}</p>}
      {showQrModal&&!isInterviewer&&<div role="dialog" aria-label="Reconnect mobile camera" style={{position:'fixed',inset:0,background:'#0008',zIndex:9999,display:'grid',placeItems:'center'}}><div style={{background:'white',padding:24,borderRadius:16,maxWidth:360}}><p>Reconnect your camera to this interview. Your session continues.</p><QRPairing qrPayload={qrPayload} onRefresh={onRefreshQr}/><button className="reg-admin-btn" onClick={()=>setShowQrModal(false)}>Close</button></div></div>}
      {/* Quick End Interview Outcome Modal (Trainer View) */}
      {showEndModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}>
          <div className="reg-admin-table-wrap" style={{ background: '#fff', maxWidth: 420, width: '100%', padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>
              End Interview
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              Select a final outcome recommendation before completing this session.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                Outcome Recommendation
              </label>
              <select
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
              >
                <option value="Advance to Next Round">Advance to Next Round</option>
                <option value="Strong Hire">Strong Hire</option>
                <option value="Hire">Hire</option>
                <option value="Hold / Under Review">Hold / Under Review</option>
                <option value="Reject">Reject</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowEndModal(false)}
                className="reg-admin-btn reg-admin-btn--secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleSaveNotes()
                  setShowEndModal(false)
                  handleEndInterview?.()
                }}
                className="reg-admin-btn reg-admin-btn--danger"
              >
                Confirm & End Interview
              </button>
            </div>
          </div>
        </div>
      )}
    </InterviewShell>
  )
}
