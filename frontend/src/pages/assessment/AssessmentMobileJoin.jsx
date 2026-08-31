/**
 * AssessmentMobileJoin Page
 * Dedicated mobile camera page opened when scanning the Quiz or Coding Assessment QR code.
 * Directly streams mobile camera view to the desktop assessment verification screen via WebRTC / WebSocket.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Shield,
  Loader2,
  RefreshCw,
  Video,
  Smartphone,
  Info,
  Maximize,
  Wifi,
  SwitchCamera,
  Code2,
} from 'lucide-react';
import { API_BASE, BACKEND_ORIGIN } from '../../api/api';
import '../../styles/assessment-verification.css';

const PHASE = {
  LOADING: 'loading',
  READY: 'ready',
  CAMERA_REQUEST: 'camera_request',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  ERROR: 'error',
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/** On-screen diagnostic log overlay component for mobile testing */
function MobileDebugPanel({ logs, isOpen, onToggle }) {
  if (!logs || logs.length === 0) return null;
  const isDebug = typeof window !== 'undefined' && (window.location.search.indexOf('debug') !== -1 || window.location.hash.indexOf('debug') !== -1);
  if (!isOpen && !isDebug) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 10, left: 10, right: 10, zIndex: 99999,
      background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155',
      borderRadius: 12, padding: '8px 12px', color: '#f8fafc',
      boxShadow: '0 4px 20px rgba(0,0,0,0.8)', fontSize: 10, fontFamily: 'monospace',
      maxHeight: isOpen ? '240px' : '36px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#4ade80', marginBottom: isOpen ? 6 : 0 }}
      >
        <span>📱 MOBILE DIAGNOSTICS ({logs.length})</span>
        <span style={{ background: '#334155', padding: '1px 6px', borderRadius: 4 }}>{isOpen ? 'Minimize' : 'Expand'}</span>
      </div>
      {isOpen && (
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
          {logs.slice().reverse().map((log, idx) => (
            <div key={idx} style={{ color: log.type === 'error' ? '#f87171' : log.type === 'warn' ? '#fbbf24' : '#86efac', wordBreak: 'break-all' }}>
              [{log.time}] {log.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

class AssessmentMobileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[AssessmentMobileJoin ErrorBoundary]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="wi-mobile-page">
          <div className="wi-mobile-header">
            <div className="wi-mobile-shield-icon">
              <Shield size={24} strokeWidth={2.4} />
            </div>
            <h1 className="wi-mobile-brand-title">WAVE INIT LMS</h1>
            <p className="wi-mobile-brand-subtitle">Secure Proctoring &bull; Verification</p>
          </div>
          <div className="wi-mobile-card">
            <div className="wi-mobile-state-box">
              <div className="wi-mobile-error-icon">
                <AlertCircle size={30} />
              </div>
              <h3 className="wi-mobile-error-title">Verification Page Error</h3>
              <p className="wi-mobile-error-msg">{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="wi-mobile-btn-primary"
              >
                <RefreshCw size={15} /> Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AssessmentMobileJoinContent() {
  const params = useParams();
  const token = params?.token || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null);
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) | 'user' (front)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isAssessmentStarted, setIsAssessmentStarted] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const laptopSocketIdRef = useRef(null);
  const offerInProgressRef = useRef(false);
  const mobileCandidateQueueRef = useRef([]);
  const frameIntervalRef = useRef(null);

  const addLog = useCallback((text, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    console.log(`[MOBILE-LOG] ${text}`);
    setLogs((prev) => [...prev.slice(-40), { time, text, type }]);
  }, []);

  // 1. Initial Page Load Instrumentation
  useEffect(() => {
    const isSecure = typeof window !== 'undefined' && window.isSecureContext === true;
    const hasMedia = typeof navigator !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia;
    addLog(`Boot: isSecure=${isSecure}, origin=${typeof window !== 'undefined' ? window.location.origin : ''}`);
    addLog(`MediaDevices supported=${hasMedia}`);
    if (typeof window !== 'undefined' && (window.location.search.indexOf('debug') !== -1 || window.location.hash.indexOf('debug') !== -1)) {
      setShowDebug(true);
    }
  }, [addLog]);

  // 2. Initial QR Token Validation
  useEffect(() => {
    let cancelled = false;

    if (!token || token === 'mobile-join' || token === 'mobile') {
      addLog('Validation failed: No token in URL', 'error');
      setError('Invalid pairing link — no verification token found in QR code.');
      setPhase(PHASE.ERROR);
      return;
    }

    const validateToken = async () => {
      try {
        setPhase(PHASE.LOADING);
        addLog(`Validating token ${token.substring(0, 10)}...`);
        const res = await fetch(`${API_BASE}/assessment-verification/mobile-validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.success) {
          addLog(`Validation failed: ${data.error || res.statusText}`, 'error');
          setError(data.error || 'This QR code is invalid or has expired.');
          setPhase(PHASE.ERROR);
          return;
        }

        addLog(`Validation success: session=${data.sessionId}`);
        setInfo(data);
        setPhase(PHASE.CAMERA_REQUEST);
      } catch (err) {
        if (!cancelled) {
          addLog(`Network validation error: ${err.message}`, 'error');
          setError(`Could not connect to the assessment server (${err.message || 'Network error'}). Please ensure your mobile device is connected to the internet and tap Try Again.`);
          setPhase(PHASE.ERROR);
        }
      }
    };

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [token, addLog]);

  // WebRTC Helper: Ultra-low latency P2P WebRTC negotiation
  const startWebRTCOffer = useCallback(async (targetSocketId = null) => {
    const target = targetSocketId || laptopSocketIdRef.current;
    if (!socketRef.current?.connected || !streamRef.current || !info?.sessionId) {
      console.log('[MOBILE-P2P] Socket, stream, or session not ready yet');
      return;
    }

    if (!target) {
      console.log('[MOBILE-P2P] Laptop socket not discovered yet, waiting for peer join');
      return;
    }

    try {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
        pcRef.current = null;
      }

      console.log('[MOBILE-P2P] Creating RTCPeerConnection with low-latency configuration');
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 2,
      });
      pcRef.current = pc;

      // Add camera video track with motion hint for low latency encoding
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        if ('contentHint' in videoTrack) {
          videoTrack.contentHint = 'motion';
        }
        pc.addTransceiver(videoTrack, {
          direction: 'sendonly',
          streams: [streamRef.current],
        });
      }

      // Trickle ICE: emit candidates immediately
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        if (socketRef.current?.connected) {
          socketRef.current.emit('assessment_verif:ice-candidate', {
            sessionId: info.sessionId,
            targetSocketId: laptopSocketIdRef.current || target,
            candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[MOBILE-P2P] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setPeerConnected(true);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setPeerConnected(false);
        }
      };

      // Create low-latency video offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      console.log('[MOBILE-P2P] Offer sent to laptop peer:', laptopSocketIdRef.current || target);
      socketRef.current.emit('assessment_verif:offer', {
        sessionId: info.sessionId,
        targetSocketId: laptopSocketIdRef.current || target,
        offer: pc.localDescription,
      });
    } catch (err) {
      console.error('[MOBILE-P2P] WebRTC Offer error:', err);
    }
  }, [info?.sessionId]);

  // Session Closed / Completed Handler: Releases camera hardware ONLY upon genuine end
  const handleSessionClosed = useCallback((reason = 'ASSESSMENT_COMPLETED') => {
    console.warn(`[AssessmentMobileJoin] >> Transitioning to PHASE.COMPLETED. Trigger Reason: "${reason}"`);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (e) {}
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch (e) {}
      socketRef.current = null;
    }
    setCameraActive(false);
    setPeerConnected(false);
    setSocketConnected(false);
    setPhase(PHASE.COMPLETED);
  }, []);

  // Periodic fallback check to detect if assessment was legitimately submitted/completed
  useEffect(() => {
    const activeToken = token || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null) || info?.token;
    const activeSessionId = info?.sessionId;
    if ((!activeToken && !activeSessionId) || phase === PHASE.COMPLETED || phase === PHASE.ERROR) return;

    // Only check for completion if stream has started
    if (phase !== PHASE.STREAMING) return;

    const interval = setInterval(async () => {
      try {
        const url = activeToken
          ? `${API_BASE}/assessment-verification/mobile-status/${activeToken}`
          : `${API_BASE}/monitoring/sessions/${activeSessionId}/status`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          // STRICT CHECK: ONLY trigger completed if backend explicitly confirms isEnded === true AND terminal status
          const isTerminatedStatus = ['COMPLETED', 'SUBMITTED', 'TERMINATED', 'EVALUATED', 'AUTO_SUBMITTED'].includes(data?.status);
          if (data?.isEnded === true && isTerminatedStatus) {
            console.log('[AssessmentMobileJoin] Fallback polling confirmed attempt submitted:', data);
            handleSessionClosed(`POLLING_CONFIRMED_${data?.status}`);
          }
        }
      } catch (e) {
        // Non-blocking network drop
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [token, info, phase, handleSessionClosed]);

  // Frame Streaming Fallback (Guarantees desktop video visibility regardless of NAT/P2P blockers)
  useEffect(() => {
    if (phase !== PHASE.STREAMING || !socketRef.current?.connected || !info?.sessionId) {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    frameIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0 && socketRef.current?.connected) {
        try {
          ctx.drawImage(video, 0, 0, 320, 240);
          const frame = canvas.toDataURL('image/jpeg', 0.5);
          socketRef.current.emit('assessment_verif:frame', {
            sessionId: info.sessionId,
            frame,
            participantId: info.participantId,
          });
        } catch (e) {}
      }
    }, 600); // ~1.6 fps

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, [phase, info?.sessionId, socketConnected]);

  // 2. Setup Socket Connection for real-time synchronization with Laptop (Stable lifecycle)
  const sessionId = info?.sessionId;
  const socketToken = info?.socketToken;

  useEffect(() => {
    if (!sessionId || !socketToken) return;

    const wsUrl = BACKEND_ORIGIN || window.location.origin;
    const socket = io(wsUrl, {
      auth: { token: socketToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[MOBILE-P2P] Socket connected:', socket.id, 'session:', sessionId);
      setSocketConnected(true);
      socket.emit('assessment_verif:join', {
        sessionId,
        role: 'mobile_camera',
      });

      // If camera stream is already live, immediately start WebRTC offer and notify laptop
      if (streamRef.current) {
        startWebRTCOffer(laptopSocketIdRef.current);
        socket.emit('assessment_verif:mobile_ready', {
          sessionId,
          token: info?.token || token,
        });
        socket.emit('assessment_verif:stream_status', {
          sessionId,
          streaming: true,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('[MOBILE-P2P] Socket disconnected');
      setSocketConnected(false);
      setPeerConnected(false);
    });

    // Laptop joined room → store socket ID & start negotiation if camera is active
    socket.on('assessment_verif:laptop_joined', ({ socketId }) => {
      console.log('[MOBILE-P2P] Laptop joined:', socketId);
      laptopSocketIdRef.current = socketId;
      if (streamRef.current) {
        startWebRTCOffer(socketId);
      }
    });

    // Laptop answered SDP offer
    socket.on('assessment_verif:answer', async ({ answer }) => {
      console.log('[MOBILE-P2P] SDP Answer received from laptop');
      if (pcRef.current && answer) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));

          // Flush queued candidates
          if (mobileCandidateQueueRef.current.length > 0) {
            for (const cand of mobileCandidateQueueRef.current) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.error('[MOBILE-P2P] ICE error:', e);
              }
            }
            mobileCandidateQueueRef.current = [];
          }
        } catch (err) {
          console.error('[MOBILE-P2P] Remote description error:', err);
        }
      }
    });

    // ICE candidates from laptop
    socket.on('assessment_verif:ice-candidate', async ({ candidate }) => {
      if (candidate) {
        const pc = pcRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('[MOBILE-P2P] ICE candidate error:', err);
          }
        } else {
          mobileCandidateQueueRef.current.push(candidate);
        }
      }
    });

    // Assessment started by laptop -> transition to IN_PROGRESS active proctoring state
    socket.on('assessment_verif:assessment_started', () => {
      console.log('[AssessmentMobileJoin] Assessment started on laptop');
      setIsAssessmentStarted(true);
    });
    socket.on('assessment_verif:in_progress', () => {
      console.log('[AssessmentMobileJoin] Assessment in progress on laptop');
      setIsAssessmentStarted(true);
    });

    // Assessment ended / submitted by laptop → immediately stop camera
    socket.on('assessment_verif:session_ended', (data) => {
      console.log('[AssessmentMobileJoin] Received assessment_verif:session_ended:', data);
      handleSessionClosed(data?.reason || 'SOCKET_ASSESSMENT_VERIF_SESSION_ENDED');
    });
    socket.on('assessment_verif:assessment_completed', (data) => {
      console.log('[AssessmentMobileJoin] Received assessment_verif:assessment_completed:', data);
      handleSessionClosed('SOCKET_ASSESSMENT_COMPLETED');
    });
    socket.on('monitoring:session_ended', (data) => {
      console.log('[AssessmentMobileJoin] Received monitoring:session_ended:', data);
      handleSessionClosed(data?.reason || 'SOCKET_MONITORING_SESSION_ENDED');
    });
    socket.on('assessment_verif:session_expired', (data) => {
      console.log('[AssessmentMobileJoin] Received assessment_verif:session_expired:', data);
      handleSessionClosed('SOCKET_SESSION_EXPIRED');
    });

    return () => {
      socket.disconnect();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
      }
    };
  }, [sessionId, socketToken, startWebRTCOffer, handleSessionClosed]);

  // 3. Request Mobile Camera Access (Defaults to Back Camera / Environment)
  const enableCamera = useCallback(async (requestedFacingMode = 'environment') => {
    setError(null);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported on this browser. Try Chrome or Safari.');
      }

      console.log(`[MOBILE-P2P] Requesting camera facingMode: ${requestedFacingMode}...`);
      let stream = null;
      let usedFacingMode = requestedFacingMode;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacingMode },
            width: { ideal: 640, max: 640 },
            height: { ideal: 480, max: 480 },
            frameRate: { ideal: 24, max: 24 },
          },
          audio: false,
        });
      } catch (prefErr) {
        console.warn(`[MOBILE-P2P] Preferred facingMode ${requestedFacingMode} failed, trying fallback:`, prefErr);
        const fallbackMode = requestedFacingMode === 'environment' ? 'user' : 'environment';
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: fallbackMode,
              width: { ideal: 640, max: 640 },
              height: { ideal: 480, max: 480 },
              frameRate: { ideal: 24, max: 24 },
            },
            audio: false,
          });
          usedFacingMode = fallbackMode;
        } catch (fallErr) {
          console.warn('[MOBILE-P2P] Fallback facingMode failed, trying basic video constraints:', fallErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24 },
            },
            audio: false,
          });
        }
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'contentHint' in videoTrack) {
        videoTrack.contentHint = 'motion';
      }
      const actualSettings = videoTrack?.getSettings?.() || {};
      const finalFacingMode = actualSettings.facingMode || usedFacingMode;
      setFacingMode(finalFacingMode);

      console.log('[MOBILE-P2P] Camera stream acquired:', finalFacingMode);
      streamRef.current = stream;
      setCameraActive(true);
      setPhase(PHASE.STREAMING);

      // Start WebRTC Peer Connection and notify room
      if (socketRef.current?.connected) {
        startWebRTCOffer(laptopSocketIdRef.current);
        socketRef.current.emit('assessment_verif:mobile_ready', {
          sessionId: info?.sessionId,
          token: info?.token || token,
        });
        socketRef.current.emit('assessment_verif:stream_status', {
          sessionId: info?.sessionId,
          streaming: true,
        });
      }

      // Notify backend via HTTP that mobile camera permission was granted
      await fetch(`${API_BASE}/assessment-verification/mobile-connected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceInfo: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        }),
      }).catch((err) => console.error('[MOBILE-P2P] mobile-connected error:', err));
    } catch (err) {
      console.error('[MOBILE-P2P] Camera permission error:', err);
      setError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in your mobile browser settings.'
          : err.message || 'Unable to access mobile camera.'
      );
    }
  }, [token, startWebRTCOffer]);

  // 4. Switch / Toggle Camera between Back and Front
  const toggleCamera = useCallback(async () => {
    if (isSwitchingCamera) return;
    setIsSwitchingCamera(true);
    const targetMode = facingMode === 'environment' ? 'user' : 'environment';

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: targetMode },
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 24, max: 24 },
        },
        audio: false,
      }).catch(async () => {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24 },
          },
          audio: false,
        });
      });

      streamRef.current = newStream;
      setFacingMode(targetMode);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }

      // Update WebRTC Sender Track with new track
      if (pcRef.current) {
        const newTrack = newStream.getVideoTracks()[0];
        if (newTrack && 'contentHint' in newTrack) {
          newTrack.contentHint = 'motion';
        }
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender && newTrack) {
          await videoSender.replaceTrack(newTrack);
        } else if (socketRef.current?.connected && laptopSocketIdRef.current) {
          startWebRTCOffer(laptopSocketIdRef.current);
        }
      }
    } catch (err) {
      console.error('[MOBILE-P2P] Switch camera error:', err);
      setError('Unable to switch camera. Please try again.');
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [facingMode, isSwitchingCamera, startWebRTCOffer]);

  // Bind and play stream when video element renders
  useEffect(() => {
    if (phase === PHASE.STREAMING && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.warn('[AssessmentMobileJoin] Video play error:', e));
      }
    }
  }, [phase, cameraActive]);

  // Cleanup media tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (pcRef.current) {
        try { pcRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  return (
    <div className="wi-mobile-page">
      {/* Brand Header */}
      <div className="wi-mobile-header">
        <div className="wi-mobile-shield-icon">
          <Shield size={24} strokeWidth={2.4} />
        </div>
        <h1 className="wi-mobile-brand-title">WAVE INIT LMS</h1>
        <p className="wi-mobile-brand-subtitle">Secure Proctoring &bull; Real-time Verification</p>
      </div>

      {/* Main Container Card */}
      <div className="wi-mobile-card">
        <AnimatePresence mode="wait">
          {/* LOADING PHASE */}
          {phase === PHASE.LOADING && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="wi-mobile-state-box"
            >
              <Loader2 className="animate-spin" size={38} color="#16A34A" />
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: '0 0 4px 0' }}>Validating QR Code</h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>Connecting to verification session...</p>
              </div>
            </motion.div>
          )}

          {/* ERROR PHASE */}
          {phase === PHASE.ERROR && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="wi-mobile-state-box"
            >
              <div className="wi-mobile-error-icon">
                <AlertCircle size={30} />
              </div>
              <div>
                <h3 className="wi-mobile-error-title">Verification Error</h3>
                <p className="wi-mobile-error-msg">{error || 'Invalid or expired QR code.'}</p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="wi-mobile-btn-retry"
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </motion.div>
          )}

          {/* CAMERA REQUEST PHASE */}
          {phase === PHASE.CAMERA_REQUEST && (
            <motion.div
              key="request"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {/* Assessment Meta Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="wi-mobile-meta-row">
                  <span className="wi-mobile-badge-tag">
                    <Code2 size={13} strokeWidth={2.5} />
                    {info?.assessmentType === 'CODING' ? 'CODING ASSESSMENT VERIFICATION' : 'AI QUIZ VERIFICATION'}
                  </span>
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className="wi-mobile-cam-btn"
                    title="Camera source"
                  >
                    <Camera size={13} strokeWidth={2.2} />
                    <span>{facingMode === 'environment' ? 'Back Camera' : 'Front Camera'}</span>
                  </button>
                </div>

                <h2 className="wi-mobile-assessment-title">
                  {info?.assessmentTitle || 'Assessment Verification'}
                </h2>

                <p className="wi-mobile-participant-row">
                  Participant: <span className="wi-mobile-participant-name">{info?.participantName || 'Candidate'}</span>
                </p>
              </div>

              {/* Camera Framing Requirement Card */}
              <div className="wi-mobile-instruction-card">
                <div className="wi-mobile-instruction-icon">
                  <Info size={20} strokeWidth={2.5} />
                </div>
                <div className="wi-mobile-instruction-content">
                  <h3 className="wi-mobile-instruction-title">Camera Framing Requirement</h3>
                  <p className="wi-mobile-instruction-text">
                    Position your phone using the <strong>Back Camera</strong> so your{' '}
                    <span className="wi-mobile-instruction-highlight">face</span>,{' '}
                    <span className="wi-mobile-instruction-highlight">upper body</span>, and{' '}
                    <span className="wi-mobile-instruction-highlight">laptop screen</span> are clearly visible.
                  </p>
                </div>
              </div>

              {/* Camera Permission Section */}
              <div className="wi-mobile-permission-card">
                <div className="wi-mobile-permission-icon">
                  <Camera size={34} strokeWidth={2.2} />
                </div>
                <h3 className="wi-mobile-permission-title">Back Camera Access Required</h3>
                <p className="wi-mobile-permission-desc">
                  Enable camera permission to stream your back camera as the live secondary proctoring view.
                </p>

                {error && (
                  <div style={{
                    padding: '10px 12px',
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#DC2626',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}>
                    <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => enableCamera('environment')}
                  className="wi-mobile-btn-primary"
                >
                  <Camera size={18} strokeWidth={2.2} />
                  <span>Enable Back Camera</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* STREAMING / CONNECTED PHASE */}
          {phase === PHASE.STREAMING && (
            <motion.div
              key="streaming"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Header Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                  {info?.assessmentTitle || 'Assessment'}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: isAssessmentStarted ? '#EAF8F0' : '#F0FDF4',
                  color: '#16A34A',
                  border: '1px solid #DCFCE7'
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#16A34A',
                    boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.25)',
                    display: 'inline-block',
                  }} className="animate-pulse" />
                  <span>
                    {isAssessmentStarted
                      ? 'Assessment in progress — keep this camera connected'
                      : 'Camera Connected — Waiting for assessment to begin'}
                  </span>
                </span>
              </div>

              {/* Video Preview Container */}
              <div className="wi-mobile-video-wrap">
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                      el.play().catch((err) => console.warn('[AssessmentMobileJoin] play error:', err));
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    e.target.play().catch(() => {});
                  }}
                  onPlaying={() => {
                    if (socketRef.current?.connected) {
                      console.log('[AssessmentMobileJoin] onPlaying -> emitting mobile_ready and stream_status');
                      socketRef.current.emit('assessment_verif:mobile_ready', {
                        sessionId: info?.sessionId,
                      });
                      socketRef.current.emit('assessment_verif:stream_status', {
                        sessionId: info?.sessionId,
                        streaming: true,
                      });
                    }
                  }}
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />

                {/* Top-Left Live Indicator */}
                <div className="wi-mobile-badge-live">
                  <div className="wi-mobile-dot-pulse" />
                  <span>LIVE PROCTORING</span>
                </div>

                {/* Top-Right Flip/Switch Camera Button */}
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={isSwitchingCamera}
                  className="wi-mobile-flip-btn"
                  title="Switch between Back and Front Camera"
                >
                  <SwitchCamera size={13} className={isSwitchingCamera ? 'animate-spin' : ''} />
                  <span>{facingMode === 'environment' ? 'Back Cam' : 'Front Cam'}</span>
                </button>

                {/* Bottom-Left Live Connection Status */}
                <div className="wi-mobile-badge-status">
                  <Wifi size={11} />
                  <span>Live Streaming</span>
                </div>
              </div>

              {/* Framing Instructions Reminder */}
              <div className="wi-mobile-instruction-card">
                <div className="wi-mobile-instruction-icon">
                  {isAssessmentStarted ? (
                    <CheckCircle2 size={20} color="#16A34A" />
                  ) : (
                    <Shield size={20} color="#16A34A" />
                  )}
                </div>
                <div className="wi-mobile-instruction-content">
                  <h3 className="wi-mobile-instruction-title">
                    {isAssessmentStarted ? 'Assessment In Progress' : 'Camera Connected & Waiting'}
                  </h3>
                  <p className="wi-mobile-instruction-text">
                    {isAssessmentStarted ? (
                      <>
                        <strong>Your assessment is currently in progress on your laptop.</strong> Position your phone so your face, upper body, and laptop screen are clearly visible. Keep this page open.
                      </>
                    ) : (
                      <>
                        <strong>Your phone camera is paired and streaming.</strong> Please complete the verification steps on your laptop. Keep this page open while you start the assessment.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* COMPLETED PHASE */}
          {phase === PHASE.COMPLETED && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="wi-mobile-state-box"
              style={{
                padding: '28px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: '#dcfce7',
                  border: '2px solid #86efac',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#16a34a',
                }}
              >
                <CheckCircle2 size={34} strokeWidth={2.5} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: '0 0 6px 0' }}>
                  Assessment Completed
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                  The assessment on your laptop has ended.
                </p>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#334155',
                  }}
                >
                  <Shield size={14} color="#16a34a" />
                  <span>Mobile Camera Safely Disconnected</span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                You can now safely close this browser tab.
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.close();
                  } catch (e) {}
                }}
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  marginTop: '4px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Close Tab
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Page Footer */}
      <div className="wi-mobile-footer">
        <Shield size={14} color="#16A34A" strokeWidth={2.2} />
        <span><strong>WAVE INIT Secure Proctoring</strong> &bull; Real-time Verification</span>
      </div>

      <MobileDebugPanel logs={logs} isOpen={showDebug} onToggle={() => setShowDebug(!showDebug)} />
    </div>
  );
}

export default function AssessmentMobileJoin() {
  return (
    <AssessmentMobileErrorBoundary>
      <AssessmentMobileJoinContent />
    </AssessmentMobileErrorBoundary>
  );
}


