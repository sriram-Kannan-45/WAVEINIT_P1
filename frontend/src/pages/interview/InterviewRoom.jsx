/**
 * InterviewRoom Page
 * The main interview room with WebRTC video, screen share, shared code editor,
 * chat, AI monitoring, recording, and dual camera support.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSocket, useSocketEvent } from '../../hooks/useSocket'
import { useWebRTC } from '../../hooks/useWebRTC'
import { useInterviewRecorder } from '../../hooks/useInterviewRecorder'
import { useInterviewDetectors } from '../../hooks/useInterviewDetectors'
import { useInterviewSession, InterviewSessionProvider } from '../../contexts/InterviewSessionContext'
import interviewService from '../../services/interviewService'
import VideoTile from '../../components/interview/VideoTile'
import QRPairing from '../../components/interview/QRPairing'
import InterviewToolbar from '../../components/interview/InterviewToolbar'
import ChatPanel from '../../components/interview/ChatPanel'
import StatusStrip from '../../components/interview/StatusStrip'
import SharedCodeEditor from '../../components/interview/SharedCodeEditor'

function InterviewRoomInner({ user }) {
  const { id: interviewId } = useParams()
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const session = useInterviewSession()

  // Local state
  const [interviewData, setInterviewData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [qrPayload, setQrPayload] = useState(null)
  const [joined, setJoined] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [showConsentModal, setShowConsentModal] = useState(true)
  const [timer, setTimer] = useState(0)
  const [expandedTile, setExpandedTile] = useState(null)
  const [error, setError] = useState(null)

  // Refs
  const localVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const mobileStreamRef = useRef(null)

  // Hooks
  const { remoteStreams, createOffer, handleOffer, handleAnswer, handleIceCandidate, closeAll: closeWebRTC } = useWebRTC(socket, interviewId, {})
  const { isRecording, toggleRecording } = useInterviewRecorder(sessionId)
  const { emitAlert, monitorTrack } = useInterviewDetectors({ socket, sessionId, interviewId, enabled: consentGiven })

  // Get local camera stream
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      // Monitor tracks for AI detection
      stream.getTracks().forEach(track => monitorTrack(track, 'LAPTOP'))
      session.setLocalStreams(prev => ({ ...prev, laptop: stream }))
      return stream
    } catch (err) {
      console.error('Failed to get camera:', err)
      setError('Camera access denied. Please enable camera and microphone.')
      return null
    }
  }, [monitorTrack, session])

  // Join interview room
  useEffect(() => {
    if (!socket || !isConnected || joined) return

    const join = async () => {
      try {
        const res = await interviewService.join(interviewId)
        setSessionId(res.session?.id)
        setQrPayload(res.qrPayload)
        setInterviewData(res.interview || interviewData)
        session.setInterview(res.interview)
        session.setSession(res.session)
        session.setDevices({
          laptop: res.devices?.some(d => d.deviceType === 'LAPTOP' && d.status === 'CONNECTED') || false,
          mobile: res.devices?.some(d => d.deviceType === 'MOBILE' && d.status === 'CONNECTED') || false,
        })

        // Join socket room
        socket.emit('join-room', { interviewId }, (response) => {
          if (response.success) {
            setJoined(true)
            setSessionId(response.sessionId)
            // Create offers to existing peers
            response.peers?.forEach(peer => {
              createOffer(peer.socketId)
            })
          } else {
            setError(response.error || 'Failed to join room')
          }
        })
      } catch (err) {
        setError(err.message || 'Failed to join interview')
      }
    }

    join()
  }, [socket, isConnected, interviewId])

  // Socket event handlers
  useSocketEvent('peer-joined', useCallback((data) => {
    session.setPeers(prev => [...prev, data])
    // Create offer to new peer
    createOffer(data.socketId)
  }, [createOffer, session]))

  useSocketEvent('peer-left', useCallback((data) => {
    session.setPeers(prev => prev.filter(p => p.socketId !== data.socketId))
  }, [session]))

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
    session.addChatMessage(data)
  }, [session]))

  useSocketEvent('device-status', useCallback((data) => {
    session.updateDevice(data.deviceType, data.connected)
  }, [session]))

  useSocketEvent('interview-alert', useCallback((data) => {
    session.addAlert(data)
  }, [session]))

  useSocketEvent('screen-share', useCallback((data) => {
    if (data.sharing) {
      setIsScreenSharing(true)
    } else {
      setIsScreenSharing(false)
    }
  }, []))

  useSocketEvent('recording-status', useCallback((data) => {
    // Handle remote recording status
  }, []))

  // Timer countdown
  useEffect(() => {
    if (!interviewData?.scheduledAt || !joined) return
    const scheduled = new Date(interviewData.scheduledAt).getTime()
    const duration = (interviewData.durationMinutes || 60) * 60 * 1000
    const endTime = scheduled + duration

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
      setTimer(remaining)
      if (remaining === 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [interviewData, joined])

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = isMuted })
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  // Toggle camera
  const handleToggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = isCameraOff })
      setIsCameraOff(!isCameraOff)
    }
  }, [isCameraOff])

  // Toggle screen share
  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      setIsScreenSharing(false)
      if (socket && interviewId) {
        socket.emit('screen-share', { interviewId, sharing: false })
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStreamRef.current = stream
        setIsScreenSharing(true)
        if (socket && interviewId) {
          socket.emit('screen-share', { interviewId, sharing: true })
        }
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false)
          screenStreamRef.current = null
          if (socket && interviewId) {
            socket.emit('screen-share', { interviewId, sharing: false })
          }
        }
      } catch (err) {
        console.error('Screen share failed:', err)
      }
    }
  }, [isScreenSharing, socket, interviewId])

  // Send chat message
  const handleSendMessage = useCallback((message) => {
    if (socket && interviewId && sessionId) {
      socket.emit('chat-message', { interviewId, sessionId, message })
    }
  }, [socket, interviewId, sessionId])

  // End interview
  const handleEndInterview = useCallback(async () => {
    if (!confirm('Are you sure you want to end this interview?')) return
    try {
      await interviewService.end(interviewId)
      cleanupAndNavigate()
    } catch (err) {
      console.error('Failed to end interview:', err)
    }
  }, [interviewId])

  // Cleanup
  const cleanupAndNavigate = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    closeWebRTC()
    if (socket) {
      socket.emit('leave-room', { interviewId })
    }
    navigate('/interviews')
  }, [closeWebRTC, socket, interviewId, navigate])

  // Accept consent
  const handleAcceptConsent = useCallback(() => {
    setConsentGiven(true)
    setShowConsentModal(false)
    getLocalStream()
  }, [getLocalStream])

  // Refresh QR
  const handleRefreshQr = useCallback(async () => {
    try {
      const res = await interviewService.refreshQr(interviewId)
      setQrPayload(res.qrPayload)
    } catch (err) {
      console.error('Failed to refresh QR:', err)
    }
  }, [interviewId])

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const timerColor = timer <= 60 ? 'text-red-400' : timer <= 300 ? 'text-amber-400' : 'text-green-400'

  // Consent modal
  if (showConsentModal) {
    return (
      <div className="h-full min-h-[calc(100vh-8rem)] bg-gray-900 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-800 rounded-2xl border border-gray-700/50 p-8 max-w-lg w-full"
        >
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">📹</div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Recording & Monitoring Consent
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              This interview session will be recorded for quality and evaluation purposes.
              AI-based monitoring may be active during the session to detect tab switches,
              copy/paste activity, and camera status changes.
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-xl p-4 mb-6 text-sm text-gray-300 space-y-2">
            <p>• Video and audio will be recorded from your camera and microphone</p>
            <p>• Screen sharing content may be recorded if you enable it</p>
            <p>• The interviewer can view your laptop and mobile camera feeds</p>
            <p>• Activity logs (tab switches, code editor changes) are tracked</p>
            <p>• Recordings are accessible only by authorized interviewers and admins</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/interviews')}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Decline & Exit
            </button>
            <button
              onClick={handleAcceptConsent}
              className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              I Consent — Join Interview
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full min-h-[calc(100vh-8rem)] bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 rounded-2xl border border-red-500/30 p-8 max-w-lg w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/interviews')}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Back to Interviews
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 overflow-hidden">
      {/* Status Strip */}
      <StatusStrip
        devices={session.devices}
        isCameraActive={!isCameraOff}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        alertCount={session.alerts.length}
      />

      {/* Timer */}
      <div className="flex items-center justify-center py-1 bg-gray-800/40">
        <span className={`font-mono text-lg font-bold ${timerColor}`}>
          ⏱️ {formatTime(timer)}
        </span>
        <span className="text-gray-500 text-xs ml-3">
          {interviewData?.type || 'Interview'} · {interviewData?.durationMinutes || 60} min
        </span>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel — Candidate Context (desktop) */}
        <div className="hidden lg:flex flex-col w-64 bg-gray-800/30 border-r border-gray-700/30 p-4 overflow-y-auto">
          <div className="bg-gray-800/60 rounded-xl p-4 mb-4">
            <h3 className="text-white font-semibold text-sm mb-2">Candidate Info</h3>
            <p className="text-gray-400 text-xs">
              {interviewData?.type || 'Technical'} Interview
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Scheduled: {interviewData?.scheduledAt ? new Date(interviewData.scheduledAt).toLocaleString() : '—'}
            </p>
          </div>

          {/* QR Pairing */}
          {qrPayload && (
            <QRPairing
              qrPayload={qrPayload}
              onRefresh={handleRefreshQr}
              expiresAt={qrPayload?.expiresAt}
            />
          )}
        </div>

        {/* Center — Work Area */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {/* Video Grid */}
          <div className="grid grid-cols-2 gap-3 flex-shrink-0" style={{ maxHeight: '40%' }}>
            {/* Local video */}
            <div className="relative">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-40 object-cover rounded-2xl bg-gray-800 border border-gray-700/50"
                style={{ transform: 'scaleX(-1)' }}
              />
              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded-lg text-white text-xs">
                You (Laptop)
              </span>
            </div>

            {/* Remote videos */}
            {Object.entries(remoteStreams).map(([peerId, stream]) => (
              <VideoTile
                key={peerId}
                stream={stream}
                label={session.peers.find(p => p.socketId === peerId)?.userName || 'Peer'}
                isExpanded={expandedTile === peerId}
                onToggleExpand={() => setExpandedTile(expandedTile === peerId ? null : peerId)}
              />
            ))}

            {/* Mobile camera placeholder */}
            {!session.devices.mobile && (
              <div className="h-40 rounded-2xl bg-gray-800/50 border border-dashed border-gray-600 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-2xl">📱</span>
                  <p className="text-gray-500 text-xs mt-1">Mobile camera not connected</p>
                </div>
              </div>
            )}
          </div>

          {/* Shared Code Editor */}
          <div className="flex-1 min-h-0">
            <SharedCodeEditor
              socket={socket}
              interviewId={interviewId}
              sessionId={sessionId}
              readOnly={!consentGiven}
            />
          </div>
        </div>

        {/* Chat Panel */}
        <ChatPanel
          messages={session.chatMessages}
          onSendMessage={handleSendMessage}
          currentUserId={user?.id}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      </div>

      {/* Bottom Toolbar */}
      <InterviewToolbar
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isCameraOff={isCameraOff}
        onToggleCamera={handleToggleCamera}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={handleToggleScreenShare}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        isRecording={isRecording}
        onToggleRecording={() => toggleRecording(localStreamRef.current, 'LAPTOP')}
        onEndInterview={handleEndInterview}
        isInterviewer={user?.role === 'TRAINER' || user?.role === 'ADMIN'}
      />
    </div>
  )
}

export default function InterviewRoom({ user }) {
  return (
    <InterviewSessionProvider>
      <InterviewRoomInner user={user} />
    </InterviewSessionProvider>
  )
}
