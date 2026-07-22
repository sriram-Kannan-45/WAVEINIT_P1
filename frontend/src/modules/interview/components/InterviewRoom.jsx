import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useInterview } from '../hooks/useInterview';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import interviewApi from '../api';
import RoomTopBar from './RoomTopBar';
import RoomControls from './RoomControls';
import RoomSidePanel from './RoomSidePanel';
import VideoGrid from './VideoGrid';
import QRVerification from './QRVerification';
import MobileCameraStatus from './MobileCameraStatus';

export default function InterviewRoom({ interviewId, user, onExit }) {
  const { interview, loading: interviewLoading, error: interviewError, setInterview } = useInterview(interviewId);
  const socketHandlers = useInterviewSocket(interviewId, user.id);
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [violations, setViolations] = useState([]);
  const [handRaised, setHandRaised] = useState(false);
  const [mobileDevice, setMobileDevice] = useState(null);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [evaluatingParticipant, setEvaluatingParticipant] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [joining, setJoining] = useState(true);

  const heartbeatRef = useRef(null);
  const streamRef = useRef(null);

  const { remoteStreams, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, removePeer, cleanup } = useWebRTC(localStream, socketHandlers);

  const isTrainer = user.role === 'TRAINER' || user.role === 'ADMIN';

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        setLocalStream(stream);
        streamRef.current = stream;
        await interviewApi.join(interviewId, '');
        setJoining(false);
      } catch (err) {
        console.error('Failed to initialize room:', err);
        setJoining(false);
      }
    };
    if (interviewId) init();
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [interviewId]);

  useEffect(() => {
    if (!socketHandlers.socket) return;
    const off1 = socketHandlers.on('interview:user-joined', (data) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === data.userId)) return prev;
        return [...prev, { id: data.userId, name: data.userName, role: data.role }];
      });
      if (localStream) {
        createPeerConnection(data.userId, true);
      }
    });
    const off2 = socketHandlers.on('interview:user-left', (data) => {
      setParticipants(prev => prev.filter(p => p.id !== data.userId));
      removePeer(data.userId);
    });
    const off3 = socketHandlers.on('interview:offer', (data) => {
      handleOffer(data.from, data.sdp);
    });
    const off4 = socketHandlers.on('interview:answer', (data) => {
      handleAnswer(data.from, data.sdp);
    });
    const off5 = socketHandlers.on('interview:ice-candidate', (data) => {
      handleIceCandidate(data.from, data.candidate);
    });
    const off6 = socketHandlers.on('interview:chat-message', (data) => {
      setMessages(prev => [...prev, { id: Date.now(), senderId: data.senderId, senderName: data.senderName, content: data.content, timestamp: data.timestamp }]);
    });
    const off7 = socketHandlers.on('interview:violation', (data) => {
      setViolations(prev => [...prev, { type: data.type, message: data.message, timestamp: Date.now() }]);
    });
    const off8 = socketHandlers.on('interview:raise-hand', (data) => {
      setParticipants(prev => prev.map(p => p.id === data.userId ? { ...p, handRaised: true } : p));
    });
    const off9 = socketHandlers.on('interview:mobile-camera-status', (data) => {
      if (data.userId === user.id) setMobileDevice(data.device);
    });
    const off10 = socketHandlers.on('interview:room-ended', () => {
      onExit();
    });
    return () => { off1?.(); off2?.(); off3?.(); off4?.(); off5?.(); off6?.(); off7?.(); off8?.(); off9?.(); off10?.(); };
  }, [socketHandlers.socket, localStream]);

  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      socketHandlers.sendHeartbeat();
    }, 30000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [socketHandlers]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        socketHandlers.sendViolation('TAB_SWITCH', 'User switched tabs');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [socketHandlers]);

  useEffect(() => {
    const tick = () => setElapsedTime(prev => prev + 1);
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      interviewApi.leave(interviewId).catch(() => {});
    };
  }, [interviewId]);

  const toggleMic = useCallback(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(!isMuted);
  }, [localStream, isMuted]);

  const toggleCamera = useCallback(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach(t => { t.enabled = isCameraOff; });
    setIsCameraOff(!isCameraOff);
  }, [localStream, isCameraOff]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      const tracks = localStream?.getVideoTracks();
      if (tracks) tracks.forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      if (localStream) {
        const oldVideo = localStream.getVideoTracks()[0];
        if (oldVideo) localStream.removeTrack(oldVideo);
        localStream.addTrack(videoTrack);
      }
      setIsScreenSharing(false);
      socketHandlers.sendScreenShareStatus(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = () => toggleScreenShare();
        if (localStream) {
          const oldVideo = localStream.getVideoTracks()[0];
          if (oldVideo) localStream.removeTrack(oldVideo);
          localStream.addTrack(screenTrack);
        }
        setIsScreenSharing(true);
        socketHandlers.sendScreenShareStatus(true);
      } catch (err) {
        console.error('Screen share failed:', err);
      }
    }
  }, [isScreenSharing, localStream, socketHandlers]);

  const handleToggleRecording = useCallback(() => {
    setIsRecording(!isRecording);
  }, [isRecording]);

  const handleToggleChat = useCallback(() => {
    if (activeSideTab === 'chat' && isSidePanelOpen) {
      setIsSidePanelOpen(false);
      setActiveSideTab(null);
    } else {
      setIsSidePanelOpen(true);
      setActiveSideTab('chat');
    }
  }, [activeSideTab, isSidePanelOpen]);

  const handleOpenSidePanel = useCallback((tab) => {
    if (activeSideTab === tab && isSidePanelOpen) {
      setIsSidePanelOpen(false);
      setActiveSideTab(null);
    } else {
      setIsSidePanelOpen(true);
      setActiveSideTab(tab);
    }
  }, [activeSideTab, isSidePanelOpen]);

  const handleRaiseHand = useCallback(() => {
    setHandRaised(!handRaised);
    socketHandlers.sendRaiseHand(user.name);
  }, [handRaised, socketHandlers, user.name]);

  const handleEndCall = useCallback(() => {
    if (window.confirm('Are you sure you want to end this interview?')) {
      interviewApi.end(interviewId).then(() => onExit()).catch(() => onExit());
    }
  }, [interviewId, onExit]);

  const handleSendMessage = useCallback((content) => {
    socketHandlers.sendChat(content);
    setMessages(prev => [...prev, { id: Date.now(), senderId: user.id, senderName: user.name, content, timestamp: new Date().toISOString() }]);
  }, [socketHandlers, user]);

  const handleSubmitEvaluation = useCallback(async (data) => {
    await interviewApi.submitEvaluation(interviewId, data);
    setIsSidePanelOpen(false);
    setActiveSideTab(null);
    setEvaluatingParticipant(null);
  }, [interviewId]);

  if (interviewLoading || joining) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <Loader2 size={40} className="text-emerald-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 mt-3">Joining interview room...</p>
        </div>
      </div>
    );
  }

  if (interviewError) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-3">{interviewError}</p>
          <button onClick={onExit} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <RoomTopBar
        interview={interview}
        isRecording={isRecording}
        participantCount={participants.length + 1}
        elapsedTime={elapsedTime}
        onBack={onExit}
        isTrainer={isTrainer}
      />

      <div className="flex-1 flex overflow-hidden mt-[52px]">
        <div className="flex-1 p-4">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            localName={user.name}
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            participants={participants}
            pinnedId={null}
          />
        </div>

        <RoomSidePanel
          isOpen={isSidePanelOpen}
          activeTab={activeSideTab}
          onClose={() => { setIsSidePanelOpen(false); setActiveSideTab(null); }}
          interviewId={interviewId}
          userId={user.id}
          messages={messages}
          onSendMessage={handleSendMessage}
          selectedParticipant={selectedParticipant}
          evaluatingParticipant={evaluatingParticipant}
          onSubmitEvaluation={handleSubmitEvaluation}
        />
      </div>

      <RoomControls
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        isChatOpen={isChatOpen}
        isSidePanelOpen={isSidePanelOpen}
        activeSideTab={activeSideTab}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleRecording={handleToggleRecording}
        onToggleChat={handleToggleChat}
        onOpenSidePanel={handleOpenSidePanel}
        onRaiseHand={handleRaiseHand}
        onEndCall={handleEndCall}
        isTrainer={isTrainer}
        handRaised={handRaised}
        features={interview?.features || { chatEnabled: true, notesEnabled: true, recordingEnabled: true, screenShareEnabled: true, resumeViewerEnabled: true, whiteboardEnabled: false, mobileCameraEnabled: false, qrVerificationEnabled: false, aiSummaryEnabled: false }}
      />

      {mobileDevice && (
        <div className="fixed bottom-24 right-4 z-20">
          <MobileCameraStatus device={mobileDevice} />
        </div>
      )}

      <AnimatePresence>
        {showQR && (
          <QRVerification interviewId={interviewId} onClose={() => setShowQR(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {handRaised && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 bg-amber-400 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg"
          >
            Hand Raised
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
