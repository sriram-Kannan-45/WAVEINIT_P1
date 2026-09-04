import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  placement = 'floating',
  contextType = 'QUIZ',
  contextId,
  attemptId,
  sessionId = null,
  participantId,
  userToken,
  mobileEnabled = true,
  preCalibrated = true,
  prePaired = true,
  isTestActive = true,
  isPaused = false,
  testStartedAt = null,
  externalWebcamStream: suppliedWebcamStream = null,
  onWebcamStreamReady = null,
  onCalibrationPassed = null,
}) {
  // Only browser MediaStreams can be assigned to a video element. Ignore
  // invalid caller values and acquire the local webcam through the normal path.
  const externalWebcamStream = typeof MediaStream !== 'undefined' && suppliedWebcamStream instanceof MediaStream
    ? suppliedWebcamStream
    : null;
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
  const [activeGraceWarning, setActiveGraceWarning] = useState(null);
  const graceWarningTimeoutRef = useRef(null);

  const webcamVideoRef = useRef(null);
  const mobileVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const lastMobileActivityRef = useRef(Date.now());

  const webcamStreamRef = useRef(null);
  const remoteMobileStreamRef = useRef(null);

  useEffect(() => {
    webcamStreamRef.current = webcamStream;
  }, [webcamStream]);

  useEffect(() => {
    remoteMobileStreamRef.current = remoteMobileStream;
  }, [remoteMobileStream]);

  // Global unmount cleanup: ensure camera tracks are released immediately
  useEffect(() => {
    return () => {
      if (webcamStreamRef.current) {
        try {
          webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      if (remoteMobileStreamRef.current) {
        try {
          remoteMobileStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = null;
      }
      if (mobileVideoRef.current) {
        mobileVideoRef.current.srcObject = null;
      }
      try {
        monitoringClient.destroy();
      } catch (_) {}
    };
  }, []);

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
    if (activeSessionId) return;

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
          const sId = sessionId || storedSessionId || data.data?.session?.sessionId || data.data?.sessionId;
          if (sId) {
            setActiveSessionId(sId);
            setCalibrationPassed(true);
          } else {
            console.error('[UnifiedMonitoringWidget] Monitoring start did not return a session ID');
          }
        }
      } catch (err) {
        console.warn('[UnifiedMonitoringWidget] Failed to initialize monitoring session:', err);
      }
    };

    initSession();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, activeToken, contextType, contextId, attemptId, mobileEnabled, sessionId, storedSessionId]);

  // 2. Poll Mobile Verification Status
  useEffect(() => {
    if (!activeSessionId || !mobileEnabled || mobileConnected) return;

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
  }, [activeSessionId, activeToken, mobileEnabled, mobileConnected]);

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
    let cancelled = false;

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

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

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
      cancelled = true;
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

    // Live Grace Warning Listener (First 3 Alerts as Live In-UI Banners)
    const handleGraceWarning = (data) => {
      console.log('[UnifiedMonitoringWidget] Received live grace warning:', data);
      if (data) {
        if (graceWarningTimeoutRef.current) clearTimeout(graceWarningTimeoutRef.current);
        setActiveGraceWarning({
          warningNumber: data.warningNumber || 1,
          maxWarnings: data.maxWarnings || 3,
          eventType: data.eventType,
          message: data.message || `${(data.eventType || '').replace(/_/g, ' ')} detected`,
          source: data.source || 'LAPTOP',
          timestamp: Date.now(),
        });
        // Auto-dismiss after 6.5 seconds
        graceWarningTimeoutRef.current = setTimeout(() => {
          setActiveGraceWarning(null);
        }, 6500);
      }
    };

    socket.on('monitoring:grace_warning', handleGraceWarning);
    socket.on('assessment_verif:grace_warning', handleGraceWarning);

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
      isTestActive,
      testStartedAt,
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
      socket.disconnect();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
      }
    };
  }, [activeSessionId, activeToken, contextType, resolvedParticipantId, isTestActive, testStartedAt, getOrCreatePeerConnection]);

  // Sync isTestActive and isPaused changes
  useEffect(() => {
    monitoringClient.setTestActive(isTestActive, testStartedAt);
  }, [isTestActive, testStartedAt]);

  useEffect(() => {
    monitoringClient.setPaused(isPaused);
  }, [isPaused]);

  // 6. Start Laptop & Mobile Monitoring Loops
  useEffect(() => {
    if (!webcamStream || !activeSessionId || !calibrationPassed) return;

    let cancelled = false;

    const startMonitoring = async () => {
      await monitoringClient.calibrateGazeBaseline(webcamVideoRef.current);
      if (cancelled) return;

      monitoringClient.startLaptopMonitoring(webcamStream, webcamVideoRef.current, (metrics) => {
        setLaptopMetrics(metrics);
      }, testStartedAt);
    };

    startMonitoring();

    return () => {
      cancelled = true;
      monitoringClient.stopLaptopMonitoring();
    };
  }, [webcamStream, activeSessionId, calibrationPassed, testStartedAt]);

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

  return (
    <div className={`dual-proctor-container${placement === 'inline' ? ' dual-proctor-inline' : ''}`}>
      {isMinimized && (
        <div
          onClick={() => setIsMinimized(false)}
          className="dual-proctor-minimized-pill"
          title="Click to expand monitoring widget"
        >
          <Shield size={14} color="#15803D" strokeWidth={2.5} />
          <span>MONITORING</span>
          <ChevronUp size={14} color="#15803D" />
        </div>
      )}

      <div
        className="dual-proctor-card"
        style={{ display: isMinimized ? 'none' : 'flex' }}
      >
        {/* Header */}
        <div className="dual-proctor-header">
          <div className="dual-proctor-title">
            <Shield size={14} color="#15803D" strokeWidth={2.5} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>MONITORING</span>
          </div>

          <div className="dual-proctor-actions">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="dual-proctor-btn"
              title="Minimize Widget"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="dual-proctor-body">
          {/* Tile 1: Webcam */}
          <div className="dual-proctor-tile">
            <div className="dual-proctor-tile-header">
              <Camera size={12} color="#15803D" />
              <span>Webcam</span>
            </div>
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
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#15803D' }}>Active</span>
            </div>
          </div>

          {/* Tile 2: Mobile Camera */}
          <div className="dual-proctor-tile">
            <div className="dual-proctor-tile-header">
              <Smartphone size={12} color="#475569" />
              <span>Mobile Camera</span>
            </div>
            <div className="dual-proctor-tile-box">
              {mobileConnected || remoteVideoPlaying || lastReceivedFrame ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#15803D', fontWeight: 700, fontSize: 11 }}>
                    <Check size={13} color="#15803D" strokeWidth={3} />
                    <span>Connected</span>
                  </div>
                  <span style={{ fontSize: 9.5, color: '#64748B', marginTop: 4 }}>
                    Grace period active
                  </span>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#D97706', fontWeight: 600, fontSize: 10.5 }}>
                    <RefreshCw size={11} className="animate-spin text-amber-500" />
                    <span>Connecting...</span>
                  </div>
                  <span style={{ fontSize: 9, color: '#94A3B8', marginTop: 4 }}>
                    Waiting for mobile
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Security Status Banner */}
        <div className="dual-proctor-security-footer">
          <div style={{
            width: 26, height: 26, borderRadius: '50%', background: '#DCFCE7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Shield size={14} color="#15803D" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803D', lineHeight: 1.2 }}>
              All Systems Normal
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
              No violations detected
            </div>
          </div>
        </div>
      </div>

      {/* Live Proctor Grace Warning Banner (First 3 Alerts As On-Screen Warnings) */}
      <AnimatePresence>
        {activeGraceWarning && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            style={{
              position: 'fixed',
              top: '18px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 999999,
              width: '92%',
              maxWidth: '580px',
              background: activeGraceWarning.warningNumber === 3 ? '#FEF2F2' : '#FFFBEB',
              border: activeGraceWarning.warningNumber === 3 ? '2px solid #F87171' : '2px solid #FCD34D',
              borderRadius: '12px',
              boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                background: activeGraceWarning.warningNumber === 3 ? '#DC2626' : '#D97706',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: '800',
                padding: '4px 8px',
                borderRadius: '6px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
              }}>
                <AlertTriangle size={13} />
                <span>WARNING {activeGraceWarning.warningNumber} OF {activeGraceWarning.maxWarnings || 3}</span>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: activeGraceWarning.warningNumber === 3 ? '#991B1B' : '#92400E', lineHeight: 1.3 }}>
                  {activeGraceWarning.message}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  {activeGraceWarning.warningNumber === 3
                    ? 'Final warning — subsequent events will be scored into the proctoring report.'
                    : 'Live alert only (unscored). Please correct your framing/environment.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveGraceWarning(null)}
              style={{
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '11.5px',
                fontWeight: '700',
                color: '#334155',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
