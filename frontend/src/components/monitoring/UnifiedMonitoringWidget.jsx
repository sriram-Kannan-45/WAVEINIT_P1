import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Camera,
  Smartphone,
  Minimize2,
  Maximize2,
  Wifi,
  WifiOff,
  RefreshCw,
  Eye,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Check,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { API_BASE, BACKEND_ORIGIN } from '../../api/api';
import monitoringClient from '../../proctoring/engine/MonitoringEngineClient';
import '../../styles/dual-camera-widget.css';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:standard.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:standard.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:standard.relay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export default function UnifiedMonitoringWidget({
  contextType = 'QUIZ',
  contextId,
  attemptId,
  sessionId = null,
  participantId,
  userToken,
  mobileEnabled = true,
  preCalibrated = true,
  prePaired = true,
  externalWebcamStream = null,
  onWebcamStreamReady = null,
  onCalibrationPassed = null,
}) {
  const isQuizOrCoding = ['QUIZ', 'CODING'].includes(contextType?.toUpperCase());
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewLayout, setViewLayout] = useState('side_by_side'); // 'side_by_side' | 'pip'

  const storedSessionId =
    typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = sessionStorage.getItem(`assessment_verif_${contextType}_${contextId}_${attemptId}`);
            return raw ? JSON.parse(raw)?.sessionId : null;
          } catch {
            return null;
          }
        })()
      : null;

  const [activeSessionId, setActiveSessionId] = useState(sessionId || storedSessionId || null);

  // Calibration State — For Quiz & Coding, pre-test verification already performed calibration
  const [calibrationPassed, setCalibrationPassed] = useState(preCalibrated || isQuizOrCoding);

  // Streams & Detection State
  const [webcamStream, setWebcamStream] = useState(externalWebcamStream || null);
  const [remoteMobileStream, setRemoteMobileStream] = useState(null);
  const [remoteVideoPlaying, setRemoteVideoPlaying] = useState(false);
  const [lastReceivedFrame, setLastReceivedFrame] = useState(null);
  const [mobileConnected, setMobileConnected] = useState(prePaired || false);

  const [laptopMetrics, setLaptopMetrics] = useState({
    faceDetected: true,
    faceCount: 1,
    gaze: 'ON_SCREEN',
    gazeConfidence: 1.0,
    headPose: { yaw: 0, pitch: 0, roll: 0 },
  });

  const [mobileMetrics, setMobileMetrics] = useState({
    compositionState: mobileEnabled ? 'VALID' : 'DISABLED',
    userMessage: 'Monitoring active',
    detections: [],
  });

  const [recentViolation, setRecentViolation] = useState(null);

  const webcamVideoRef = useRef(null);
  const mobileVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const lastMobileActivityRef = useRef(Date.now());

  const activeToken =
    userToken ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('token') || sessionStorage.getItem('token')
      : null);

  const resolvedParticipantId = participantId || 1;

  // Sync prop sessionId if it arrives after mount
  useEffect(() => {
    if (sessionId && sessionId !== activeSessionId) {
      setActiveSessionId(sessionId);
    }
  }, [sessionId, activeSessionId]);

  // 1. Initialize Monitoring Session
  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/monitoring/sessions/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
          },
          body: JSON.stringify({
            contextType,
            contextId: contextId ? Number(contextId) : null,
            attemptId: attemptId ? Number(attemptId) : null,
            mobileEnabled,
          }),
        });

        const data = await res.json();
        if (cancelled) return;

        if (data?.success && data?.data) {
          const sId = sessionId || storedSessionId || data.data.sessionId;
          setActiveSessionId(sId);
          setCalibrationPassed(true);
        }
      } catch (err) {
        console.warn('[UnifiedMonitoringWidget] Session init fallback:', err);
        if (sessionId) setActiveSessionId(sessionId);
      }
    };

    if (!activeSessionId) {
      initSession();
    } else {
      setCalibrationPassed(true);
    }

    return () => {
      cancelled = true;
    };
  }, [contextType, contextId, attemptId, mobileEnabled, activeToken, sessionId, storedSessionId, activeSessionId]);

  // 2. Authoritative Server-side Verification Status Polling
  useEffect(() => {
    if (!activeSessionId || !mobileEnabled) return;

    let cancelled = false;

    const checkVerificationStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/assessment-verification/status/${activeSessionId}`, {
          headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
        });
        const data = await res.json();
        if (cancelled) return;

        if (data?.success) {
          if (data.mobileVerified || data.status === 'VERIFIED' || data.status === 'PAIRED') {
            setMobileConnected(true);
            lastMobileActivityRef.current = Date.now();
            setMobileMetrics((prev) => ({
              ...prev,
              compositionState: 'VALID',
              userMessage: 'Side camera connected and active',
            }));
          }
        }
      } catch (e) {
        // Non-blocking poll
      }
    };

    // Immediate check on mount
    checkVerificationStatus();
    const interval = setInterval(checkVerificationStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSessionId, activeToken, mobileEnabled]);

  // 3. Acquire Local Webcam Stream for Laptop Feed
  useEffect(() => {
    if (externalWebcamStream) {
      setWebcamStream(externalWebcamStream);
      if (webcamVideoRef.current && webcamVideoRef.current.srcObject !== externalWebcamStream) {
        webcamVideoRef.current.srcObject = externalWebcamStream;
        webcamVideoRef.current.play().catch(() => {});
      }
      return;
    }

    let localStream = null;
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
            frameRate: { ideal: 15, max: 20 },
          },
          audio: false,
        });
        localStream = stream;
        setWebcamStream(stream);
        onWebcamStreamReady?.(stream);

        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          webcamVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('[UnifiedMonitoringWidget] Webcam access error:', err);
      }
    };

    startWebcam();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [externalWebcamStream, onWebcamStreamReady]);

  // Ensure webcam stream is bound to video element
  useEffect(() => {
    if (webcamStream && webcamVideoRef.current) {
      if (webcamVideoRef.current.srcObject !== webcamStream) {
        webcamVideoRef.current.srcObject = webcamStream;
      }
      webcamVideoRef.current.play().catch(() => {});
    }
  }, [webcamStream]);

  // Ensure remote mobile stream is bound to video element
  useEffect(() => {
    if (remoteMobileStream && mobileVideoRef.current) {
      if (mobileVideoRef.current.srcObject !== remoteMobileStream) {
        mobileVideoRef.current.srcObject = remoteMobileStream;
      }
      const playPromise = mobileVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setRemoteVideoPlaying(true)).catch(() => {});
      }
    }
  }, [remoteMobileStream]);

  // 4. WebRTC Peer Connection Helper
  const getOrCreatePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      console.log('[UnifiedMonitoringWidget] ontrack received:', event.streams);
      let stream = event.streams?.[0];
      if (!stream) {
        stream = new MediaStream([event.track]);
      }
      setRemoteMobileStream(stream);
      setMobileConnected(true);
      lastMobileActivityRef.current = Date.now();
      if (mobileVideoRef.current) {
        mobileVideoRef.current.srcObject = stream;
        mobileVideoRef.current.play().then(() => setRemoteVideoPlaying(true)).catch(() => {});
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      if (socketRef.current?.connected && activeSessionId) {
        socketRef.current.emit('assessment_verif:ice-candidate', {
          sessionId: activeSessionId,
          candidate,
        });
        socketRef.current.emit('monitoring:ice-candidate', {
          sessionId: activeSessionId,
          candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[UnifiedMonitoringWidget] pc connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setMobileConnected(true);
        lastMobileActivityRef.current = Date.now();
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        if (Date.now() - lastMobileActivityRef.current > 8000) {
          setMobileConnected(false);
          setRemoteVideoPlaying(false);
        }
      }
    };

    return pc;
  }, [activeSessionId]);

  // 5. Socket.IO Signaling & Real-time Frame Handlers
  useEffect(() => {
    if (!activeSessionId) return;

    const wsUrl = BACKEND_ORIGIN || window.location.origin;
    const socket = io(wsUrl, {
      auth: { token: activeToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[UnifiedMonitoringWidget] Socket connected:', socket.id, 'Joining rooms for session:', activeSessionId);
      socket.emit('assessment_verif:join', {
        sessionId: activeSessionId,
        role: 'laptop',
      });
      socket.emit('monitoring:join', {
        sessionId: activeSessionId,
        role: 'laptop',
      });
    });

    const handleMobileJoined = () => {
      console.log('[UnifiedMonitoringWidget] Mobile joined event received');
      setMobileConnected(true);
      lastMobileActivityRef.current = Date.now();
      getOrCreatePeerConnection();
      socket.emit('assessment_verif:laptop_joined', { sessionId: activeSessionId, socketId: socket.id });
      socket.emit('monitoring:laptop_joined', { sessionId: activeSessionId, socketId: socket.id });
    };

    const handleWebRTCOffer = async ({ offer, fromSocketId }) => {
      try {
        console.log('[UnifiedMonitoringWidget] WebRTC offer received from:', fromSocketId);
        setMobileConnected(true);
        lastMobileActivityRef.current = Date.now();
        const pc = getOrCreatePeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        if (candidateQueueRef.current.length > 0) {
          for (const cand of candidateQueueRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          candidateQueueRef.current = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('assessment_verif:answer', {
          sessionId: activeSessionId,
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        });
        socket.emit('monitoring:answer', {
          sessionId: activeSessionId,
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        });
      } catch (err) {
        console.error('[UnifiedMonitoringWidget] WebRTC offer answer error:', err);
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      try {
        const pc = getOrCreatePeerConnection();
        if (pc && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            candidateQueueRef.current.push(candidate);
          }
        }
      } catch (err) {}
    };

    const handleMobileFrame = ({ frame }) => {
      if (frame) {
        setLastReceivedFrame(frame);
        setMobileConnected(true);
        lastMobileActivityRef.current = Date.now();
      }
    };

    const handleStreamStatus = (data) => {
      if (data?.streaming) {
        setMobileConnected(true);
        lastMobileActivityRef.current = Date.now();
      }
    };

    const handleMobileStatus = (data) => {
      if (data?.connected || data?.mobileReady || data?.mobileVerified) {
        setMobileConnected(true);
        lastMobileActivityRef.current = Date.now();
      }
    };

    const isGenuineViolation = (eventType, severity) => {
      if (!eventType) return false;
      const t = String(eventType).toUpperCase();
      // Normal/expected states should NEVER be shown as violation alerts
      if (['PERSON_DETECTED', 'COMPOSITION_VALID', 'COMPOSITION_STABILIZING', 'FACE_RETURNED', 'INFO', 'ONLINE'].includes(t)) {
        return false;
      }
      // Genuine violations
      if (
        t.includes('PHONE') ||
        t.includes('MULTIPLE') ||
        t.includes('FACE_ABSENT') ||
        t.includes('NO_PERSON') ||
        t.includes('SECONDARY') ||
        t.includes('BOOK') ||
        t.includes('GAZE') ||
        t.includes('HEAD') ||
        t.includes('TAB_SWITCH') ||
        t.includes('FULLSCREEN_EXIT') ||
        t.includes('WINDOW_BLUR')
      ) {
        return true;
      }
      return severity === 'WARNING' || severity === 'HIGH' || severity === 'CRITICAL';
    };

    const handleMobileComposition = (data) => {
      if (data) {
        setMobileConnected(true);
        lastMobileActivityRef.current = Date.now();
        if (data.compositionState) {
          setMobileMetrics((prev) => ({
            ...prev,
            compositionState: data.compositionState,
            userMessage: data.userMessage,
            detections: data.detections || [],
          }));
        }
        const evType = data.event?.eventType || data.event?.event;
        const sev = data.event?.severity || 'WARNING';
        if (evType && isGenuineViolation(evType, sev)) {
          setRecentViolation({
            type: evType,
            severity: sev,
            time: Date.now(),
          });
        }
      }
    };

    socket.on('assessment_verif:mobile_joined', handleMobileJoined);
    socket.on('monitoring:mobile_joined', handleMobileJoined);

    socket.on('assessment_verif:offer', handleWebRTCOffer);
    socket.on('monitoring:offer', handleWebRTCOffer);

    socket.on('assessment_verif:ice-candidate', handleIceCandidate);
    socket.on('monitoring:ice-candidate', handleIceCandidate);

    socket.on('assessment_verif:frame', handleMobileFrame);
    socket.on('monitoring:mobile_frame', handleMobileFrame);

    socket.on('assessment_verif:stream_status', handleStreamStatus);
    socket.on('monitoring:stream_status', handleStreamStatus);

    socket.on('assessment_verif:mobile_status', handleMobileStatus);
    socket.on('monitoring:mobile_composition', handleMobileComposition);
    socket.on('assessment_verif:yolo_detection', handleMobileComposition);

    // Watchdog check for genuine mobile drop (Grace period active after 8s of no frames/heartbeat)
    const watchdog = setInterval(() => {
      if (Date.now() - lastMobileActivityRef.current > 8000) {
        setMobileConnected(false);
        setRemoteVideoPlaying(false);
      }
    }, 2000);

    // Initialize monitoring client SDK
    monitoringClient.init({
      sessionId: activeSessionId,
      attemptId,
      participantId: resolvedParticipantId,
      contextType,
      token: activeToken,
      socket,
    });

    monitoringClient.onEventReported = (data) => {
      const evType = data?.event?.eventType || data?.event?.event || data?.eventType;
      const sev = data?.event?.severity || data?.severity || 'WARNING';
      if (evType && isGenuineViolation(evType, sev)) {
        setRecentViolation({
          type: evType,
          severity: sev,
          time: Date.now(),
        });
      }
    };

    return () => {
      clearInterval(watchdog);
      if (socket.connected && activeSessionId) {
        socket.emit('assessment_verif:end', { sessionId: activeSessionId });
        socket.emit('monitoring:end_session', { sessionId: activeSessionId });
      }
      socket.disconnect();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
      }
    };
  }, [activeSessionId, activeToken, contextType, resolvedParticipantId, getOrCreatePeerConnection]);

  // 6. Start Laptop & Mobile Monitoring Loops
  useEffect(() => {
    if (!webcamStream || !activeSessionId || !calibrationPassed) return;

    monitoringClient.startLaptopMonitoring(webcamStream, webcamVideoRef.current, (metrics) => {
      setLaptopMetrics(metrics);
    });

    return () => {
      monitoringClient.stopLaptopMonitoring();
    };
  }, [webcamStream, activeSessionId, calibrationPassed]);

  useEffect(() => {
    if (!remoteMobileStream || !activeSessionId || !mobileEnabled) return;

    monitoringClient.startMobileMonitoring(remoteMobileStream, mobileVideoRef.current, (metrics) => {
      setMobileMetrics(metrics);
    });

    return () => {
      monitoringClient.stopMobileMonitoring();
    };
  }, [remoteMobileStream, activeSessionId, mobileEnabled]);

  const getCompositionBadgeClass = (state) => {
    switch (state) {
      case 'VALID':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'PHONE_DETECTED':
      case 'UNAUTHORIZED_PHONE':
        return 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse';
      case 'DISCONNECTED':
      case 'STREAM_INTERRUPTED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  if (isMinimized) {
    return (
      <div className="dual-proctor-container">
        <div
          onClick={() => setIsMinimized(false)}
          className="dual-proctor-minimized-pill"
          title="Click to expand monitoring widget"
        >
          <div className="dual-proctor-live-dot" />
          <span className="text-xs font-bold text-slate-200">Monitoring Active</span>
          <Maximize2 size={12} className="text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="dual-proctor-container">
      <div className="dual-proctor-card">
        {/* Header */}
        <div className="dual-proctor-header">
          <div className="dual-proctor-title">
            <div className="dual-proctor-live-dot" />
            <span>Monitoring Engine</span>
            {recentViolation && Date.now() - recentViolation.time < 4000 ? (
              <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/40 flex items-center gap-1 font-semibold ml-1 animate-pulse">
                <AlertTriangle size={10} /> {recentViolation.type?.replace(/_/g, ' ')}
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 font-medium ml-1">
                <Shield size={10} /> Active
              </span>
            )}
          </div>

          <div className="dual-proctor-actions">
            <button
              type="button"
              onClick={() => setViewLayout((prev) => (prev === 'side_by_side' ? 'pip' : 'side_by_side'))}
              className="dual-proctor-btn"
              title={viewLayout === 'side_by_side' ? 'Picture-in-Picture' : 'Side-by-Side'}
            >
              <Layers size={13} />
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="dual-proctor-btn"
              title="Minimize Widget"
            >
              <Minimize2 size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="dual-proctor-body">
          {/* Laptop Feed (MediaPipe) */}
          <div className="dual-proctor-feed">
            <video
              ref={(el) => {
                webcamVideoRef.current = el;
                if (el && webcamStream && el.srcObject !== webcamStream) {
                  el.srcObject = webcamStream;
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              className="dual-proctor-video transform -scale-x-100"
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
            />
            <div className="dual-proctor-badge">
              <Camera size={10} /> Laptop
            </div>
            <div className="dual-proctor-status">
              <CheckCircle2 size={10} /> Active
            </div>
          </div>

          {/* Mobile Feed (YOLO11s) */}
          {mobileEnabled && (
            <div className="dual-proctor-feed">
              {/* 1. Live WebRTC Video Stream */}
              <video
                ref={(el) => {
                  mobileVideoRef.current = el;
                  if (el && remoteMobileStream && el.srcObject !== remoteMobileStream) {
                    el.srcObject = remoteMobileStream;
                    el.play().then(() => setRemoteVideoPlaying(true)).catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className={`dual-proctor-video ${remoteVideoPlaying ? 'block' : 'hidden'}`}
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                onLoadedMetadata={(e) => {
                  if (e.target.videoWidth > 0) setRemoteVideoPlaying(true);
                  e.target.play().catch(() => {});
                }}
                onPlaying={(e) => {
                  if (e.target.videoWidth > 0) setRemoteVideoPlaying(true);
                }}
              />

              {/* 2. Direct Fallback Frame Stream (rendered while WebRTC is initializing or as fallback) */}
              {!remoteVideoPlaying && lastReceivedFrame && (
                <img
                  src={lastReceivedFrame}
                  className="dual-proctor-video"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
                  alt="Live Mobile Feed"
                />
              )}

              {/* 3. Valid status but awaiting initial frame (loading state — never silent black box) */}
              {!remoteVideoPlaying && !lastReceivedFrame && mobileConnected && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-2 text-center gap-1.5 bg-slate-900/90 w-full">
                  <RefreshCw size={18} className="animate-spin text-emerald-400" />
                  <span className="text-[10.5px] text-emerald-300 font-semibold">
                    Loading Mobile Feed...
                  </span>
                  <span className="text-[8px] text-slate-400">Synchronizing live video stream</span>
                </div>
              )}

              {/* 4. Stream disconnected / Grace period active */}
              {!remoteVideoPlaying && !lastReceivedFrame && !mobileConnected && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-2 text-center gap-1.5 bg-slate-900/90 w-full">
                  <Smartphone size={18} className="text-amber-400 animate-pulse" />
                  <span className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
                    <RefreshCw size={9} className="animate-spin" /> Side Camera Reconnecting...
                  </span>
                  <span className="text-[8px] text-slate-400">Grace period active</span>
                </div>
              )}

              <div className="dual-proctor-badge">
                <Smartphone size={10} /> Mobile
              </div>
              <div className="dual-proctor-status">
                <span
                  className={`text-[8.5px] font-bold px-1 py-0.2 rounded border ${getCompositionBadgeClass(
                    mobileMetrics.compositionState
                  )}`}
                >
                  {mobileMetrics.compositionState.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Corrective Guidance Footer */}
        {mobileMetrics.userMessage && mobileMetrics.compositionState !== 'VALID' && (
          <div className="px-3 py-1.5 bg-amber-500/10 border-t border-amber-500/20 text-[10px] text-amber-300 flex items-center gap-1.5">
            <AlertTriangle size={11} className="flex-shrink-0" />
            <span className="truncate">{mobileMetrics.userMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
