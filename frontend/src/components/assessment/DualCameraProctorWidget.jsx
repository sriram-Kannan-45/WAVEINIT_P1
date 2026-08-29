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
  EyeOff,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { API_BASE, BACKEND_ORIGIN } from '../../api/api';
import yoloProctoringService from '../../services/yoloProctoringService';
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

export default function DualCameraProctorWidget({
  assessmentType = 'QUIZ',
  assessmentId,
  attemptId,
  sessionId: propSessionId,
  userToken,
  externalWebcamStream,
  onWebcamStreamReady,
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewLayout, setViewLayout] = useState('side_by_side'); // 'side_by_side' | 'pip'
  const [pipMainFeed, setPipMainFeed] = useState('laptop'); // 'laptop' | 'mobile'
  const [activeSessionId, setActiveSessionId] = useState(propSessionId || null);
  const [sessionToken, setSessionToken] = useState(null);

  // Webcam State
  const [webcamStream, setWebcamStream] = useState(externalWebcamStream || null);
  const [webcamActive, setWebcamActive] = useState(false);

  // Mobile Camera State
  const [remoteStream, setRemoteStream] = useState(null);
  const [lastFrame, setLastFrame] = useState(null);
  const [mobileConnected, setMobileConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // YOLO Live Proctoring State
  const [pcYoloDetection, setPcYoloDetection] = useState({
    eventType: 'PERSON_DETECTED',
    confidence: 1.0,
    detectedClasses: ['person'],
    lastTime: null,
  });
  const [mobileYoloDetection, setMobileYoloDetection] = useState({
    eventType: 'PERSON_DETECTED',
    confidence: 1.0,
    detectedClasses: ['person'],
    lastTime: null,
  });

  const webcamVideoRef = useRef(null);
  const mobileVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const mobileSocketIdRef = useRef(null);
  const candidateQueueRef = useRef([]);

  const webcamStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  useEffect(() => {
    webcamStreamRef.current = webcamStream;
  }, [webcamStream]);

  useEffect(() => {
    remoteStreamRef.current = remoteStream;
  }, [remoteStream]);

  // Global unmount cleanup: ensure camera tracks are released immediately
  useEffect(() => {
    return () => {
      if (webcamStreamRef.current) {
        try {
          webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      if (remoteStreamRef.current) {
        try {
          remoteStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = null;
      }
      if (mobileVideoRef.current) {
        mobileVideoRef.current.srcObject = null;
      }
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (_) {}
        pcRef.current = null;
      }
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (_) {}
        socketRef.current = null;
      }
    };
  }, []);

  const activeToken =
    userToken ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('token') || sessionStorage.getItem('token')
      : null);

  // 1. Resolve Session ID (from props, storage, or backend)
  useEffect(() => {
    if (propSessionId) {
      setActiveSessionId(propSessionId);
      return;
    }

    const storageKey = `assessment_verif_${assessmentType}_${assessmentId}_${attemptId}`;
    try {
      const cached = sessionStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.sessionId) {
          setActiveSessionId(parsed.sessionId);
          setSessionToken(parsed.token);
          return;
        }
      }
    } catch (e) {}

    // Fetch existing active session for this attempt from backend
    if (assessmentId && attemptId) {
      fetch(`${API_BASE}/assessment-verification/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({
          assessmentType,
          assessmentId: Number(assessmentId),
          attemptId: Number(attemptId),
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.sessionId) {
            setActiveSessionId(data.sessionId);
            setSessionToken(data.token);
            try {
              sessionStorage.setItem(
                storageKey,
                JSON.stringify({ sessionId: data.sessionId, token: data.token })
              );
            } catch (err) {}
          }
        })
        .catch((err) => console.warn('[DualCamera] Could not load verification session:', err));
    }
  }, [assessmentType, assessmentId, attemptId, propSessionId, activeToken]);

  // 2. Acquire Primary Laptop Webcam (if not externally provided)
  useEffect(() => {
    if (externalWebcamStream) {
      setWebcamStream(externalWebcamStream);
      setWebcamActive(true);
      return;
    }

    let activeCam = null;
    let cancelled = false;

    const startWebcam = async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480 },
            height: { ideal: 360 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeCam = stream;
        setWebcamStream(stream);
        setWebcamActive(true);
        onWebcamStreamReady?.(stream);
      } catch (err) {
        console.warn('[DualCamera] Primary webcam error:', err.message);
      }
    };

    startWebcam();

    return () => {
      cancelled = true;
      if (activeCam && !externalWebcamStream) {
        activeCam.getTracks().forEach((t) => t.stop());
      }
    };
  }, [externalWebcamStream, onWebcamStreamReady]);

  // Bind webcam stream to video element
  useEffect(() => {
    if (webcamVideoRef.current && webcamStream) {
      webcamVideoRef.current.srcObject = webcamStream;
      webcamVideoRef.current.play().catch(() => {});
    }
  }, [webcamStream, isMinimized, viewLayout]);

  // 3. Connect to Mobile Camera Feed via WebRTC & Socket.IO
  const getOrCreatePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      let stream = event.streams && event.streams[0];
      if (!stream) {
        stream = new MediaStream([event.track]);
      }
      setRemoteStream(stream);
      setMobileConnected(true);
      if (mobileVideoRef.current) {
        mobileVideoRef.current.srcObject = stream;
        mobileVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      if (socketRef.current?.connected && activeSessionId) {
        socketRef.current.emit('assessment_verif:ice-candidate', {
          sessionId: activeSessionId,
          targetSocketId: mobileSocketIdRef.current,
          candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setMobileConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setMobileConnected(false);
      }
    };

    return pc;
  }, [activeSessionId]);

  const connectMobileSocket = useCallback(() => {
    if (!activeSessionId) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const wsUrl = BACKEND_ORIGIN || window.location.origin;
    const socket = io(wsUrl, {
      auth: { token: sessionToken || activeToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 30,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('assessment_verif:join', {
        sessionId: activeSessionId,
        role: 'laptop',
      });
    });

    socket.on('assessment_verif:mobile_joined', ({ socketId }) => {
      mobileSocketIdRef.current = socketId;
      setMobileConnected(true);
      getOrCreatePeerConnection();
      socket.emit('assessment_verif:laptop_joined', {
        sessionId: activeSessionId,
        socketId: socket.id,
      });
    });

    socket.on('assessment_verif:offer', async ({ offer, fromSocketId }) => {
      try {
        mobileSocketIdRef.current = fromSocketId;
        setMobileConnected(true);
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
      } catch (err) {
        console.error('[DualCamera] WebRTC offer answer error:', err);
      }
    });

    socket.on('assessment_verif:ice-candidate', async ({ candidate }) => {
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
    });

    socket.on('assessment_verif:frame', ({ frame }) => {
      if (frame) {
        setLastFrame(frame);
        setMobileConnected(true);
      }
    });

    socket.on('assessment_verif:stream_status', ({ streaming }) => {
      if (typeof streaming === 'boolean') {
        setMobileConnected(streaming);
      }
    });

    socket.on('assessment_verif:yolo_detection', ({ event }) => {
      if (event && event.cameraSource === 'MOBILE_CAMERA') {
        setMobileYoloDetection({
          eventType: event.eventType,
          confidence: event.confidence,
          detectedClasses: event.detectedClasses || [],
          lastTime: new Date().toLocaleTimeString(),
        });
      }
    });
  }, [activeSessionId, sessionToken, activeToken, getOrCreatePeerConnection]);

  useEffect(() => {
    connectMobileSocket();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
      }
    };
  }, [connectMobileSocket]);

  // Start YOLO proctoring monitor on Laptop Webcam stream
  useEffect(() => {
    if (!webcamStream || !activeSessionId || !socketRef.current) return;

    const monitorId = yoloProctoringService.startMonitoring({
      source: webcamStream,
      socket: socketRef.current,
      sessionId: activeSessionId,
      participantId: 1,
      moduleType: assessmentType,
      cameraSource: 'PC_CAMERA',
      fps: 5,
      quizId: assessmentType === 'QUIZ' ? assessmentId : null,
      assessmentId: assessmentType === 'CODING' ? assessmentId : null,
      onDetection: ({ event, timestamp }) => {
        if (event) {
          setPcYoloDetection({
            eventType: event.eventType,
            confidence: event.confidence,
            detectedClasses: event.detectedClasses || [],
            lastTime: timestamp,
          });
        }
      },
      onStatusChange: ({ status, active }) => {
        setWebcamActive(active);
      },
    });

    return () => {
      yoloProctoringService.stopMonitoring(monitorId);
    };
  }, [webcamStream, activeSessionId, assessmentType, assessmentId]);

  // Start YOLO proctoring monitor on Mobile WebRTC stream (if WebRTC active)
  useEffect(() => {
    if (!remoteStream || !activeSessionId || !socketRef.current) return;

    const monitorId = yoloProctoringService.startMonitoring({
      source: remoteStream,
      socket: socketRef.current,
      sessionId: activeSessionId,
      participantId: 1,
      moduleType: assessmentType,
      cameraSource: 'MOBILE_CAMERA',
      fps: 5,
      quizId: assessmentType === 'QUIZ' ? assessmentId : null,
      assessmentId: assessmentType === 'CODING' ? assessmentId : null,
      onDetection: ({ event, timestamp }) => {
        if (event) {
          setMobileYoloDetection({
            eventType: event.eventType,
            confidence: event.confidence,
            detectedClasses: event.detectedClasses || [],
            lastTime: timestamp,
          });
        }
      },
      onStatusChange: ({ active }) => {
        setMobileConnected(active);
      },
    });

    return () => {
      yoloProctoringService.stopMonitoring(monitorId);
    };
  }, [remoteStream, activeSessionId, assessmentType, assessmentId]);

  // Bind mobile remote stream when element mounts
  useEffect(() => {
    if (mobileVideoRef.current && remoteStream) {
      mobileVideoRef.current.srcObject = remoteStream;
      mobileVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, isMinimized, viewLayout]);

  const handleReconnect = () => {
    setIsReconnecting(true);
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
    connectMobileSocket();
    setTimeout(() => setIsReconnecting(false), 1200);
  };

  const getEventBadgeColor = (eventType) => {
    if (eventType === 'PHONE_DETECTED' || eventType === 'MULTIPLE_PERSONS_DETECTED') {
      return 'bg-red-500/80 text-white border-red-400';
    }
    if (eventType === 'NO_PERSON_DETECTED') {
      return 'bg-amber-500/80 text-white border-amber-400';
    }
    return 'bg-emerald-500/80 text-white border-emerald-400';
  };

  // If minimized, display a sleek compact floating badge
  if (isMinimized) {
    return (
      <div className="dual-proctor-container">
        <div
          onClick={() => setIsMinimized(false)}
          className="dual-proctor-minimized-pill"
          title="Click to expand Dual Camera Proctoring Stream"
        >
          <div className="dual-proctor-live-dot" />
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
            <Shield size={13} className="text-emerald-400" />
            <span>YOLOv8 Dual Cams Live</span>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
            Show
          </span>
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
            <span>YOLOv8 Dual AI Proctor</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 font-medium ml-1">
              <Shield size={10} /> Active
            </span>
          </div>

          <div className="dual-proctor-actions">
            {/* View Mode Toggle */}
            <button
              type="button"
              onClick={() => setViewLayout((prev) => (prev === 'side_by_side' ? 'pip' : 'side_by_side'))}
              className="dual-proctor-btn"
              title={viewLayout === 'side_by_side' ? 'Switch to Picture-in-Picture' : 'Switch to Side-by-Side'}
            >
              <Layers size={12} />
            </button>

            {/* Reconnect Button */}
            <button
              type="button"
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="dual-proctor-btn"
              title="Refresh Camera Connections"
            >
              <RefreshCw size={12} className={isReconnecting ? 'animate-spin text-emerald-400' : ''} />
            </button>

            {/* Minimize */}
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="dual-proctor-btn"
              title="Minimize Camera Widget"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Feeds Container */}
        <div className={`dual-proctor-body ${viewLayout === 'pip' ? 'dual-proctor-body--pip' : ''}`}>
          {/* Feed 1: Laptop Front Webcam (Face Cam) */}
          <div
            onClick={() => {
              if (viewLayout === 'pip' && pipMainFeed === 'mobile') {
                setPipMainFeed('laptop');
              }
            }}
            className={`dual-proctor-feed ${
              viewLayout === 'pip'
                ? pipMainFeed === 'laptop'
                  ? 'dual-proctor-feed--main'
                  : 'dual-proctor-feed--thumb'
                : ''
            }`}
          >
            <div className="dual-proctor-badge">
              <Camera size={10} className="text-blue-400" />
              <span>{viewLayout === 'pip' && pipMainFeed !== 'laptop' ? 'Laptop' : 'Laptop (Face)'}</span>
            </div>

            {webcamStream ? (
              <video
                ref={webcamVideoRef}
                autoPlay
                playsInline
                muted
                className="dual-proctor-video"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="dual-proctor-connecting">
                <AlertTriangle size={18} className="text-amber-500 animate-pulse" />
                <span className="text-amber-300 font-semibold">PC camera unavailable</span>
              </div>
            )}

            {/* YOLO Detection Overlay for PC Cam */}
            {webcamActive && (
              <div
                className={`absolute bottom-2 left-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm border flex items-center justify-between z-10 ${getEventBadgeColor(
                  pcYoloDetection.eventType
                )}`}
              >
                <span>{pcYoloDetection.eventType.replace(/_/g, ' ')}</span>
                <span>{(pcYoloDetection.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>

          {/* Feed 2: Mobile Secondary Camera (Back/Desk Cam) */}
          <div
            onClick={() => {
              if (viewLayout === 'pip' && pipMainFeed === 'laptop') {
                setPipMainFeed('mobile');
              }
            }}
            className={`dual-proctor-feed ${
              viewLayout === 'pip'
                ? pipMainFeed === 'mobile'
                  ? 'dual-proctor-feed--main'
                  : 'dual-proctor-feed--thumb'
                : ''
            }`}
          >
            <div className="dual-proctor-badge">
              <Smartphone size={10} className="text-emerald-400" />
              <span>{viewLayout === 'pip' && pipMainFeed !== 'mobile' ? 'Mobile' : 'Mobile (Desk)'}</span>
            </div>

            {/* WebRTC Video Stream */}
            <video
              ref={mobileVideoRef}
              autoPlay
              playsInline
              muted
              className={`dual-proctor-video ${remoteStream ? 'block' : 'hidden'}`}
              style={{ transform: 'scaleX(1)' }}
            />

            {/* Fallback Frame Stream */}
            {!remoteStream && lastFrame && (
              <img
                src={lastFrame}
                alt="Mobile feed"
                className="dual-proctor-video block"
              />
            )}

            {/* Disconnected / Connecting State */}
            {!remoteStream && !lastFrame && (
              <div className="dual-proctor-connecting">
                <Smartphone size={18} className="text-slate-500 animate-pulse" />
                <span className="text-slate-400">Mobile camera disconnected</span>
              </div>
            )}

            {/* YOLO Detection Overlay for Mobile Cam */}
            {mobileConnected && (
              <div
                className={`absolute bottom-2 left-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm border flex items-center justify-between z-10 ${getEventBadgeColor(
                  mobileYoloDetection.eventType
                )}`}
              >
                <span>{mobileYoloDetection.eventType.replace(/_/g, ' ')}</span>
                <span>{(mobileYoloDetection.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
