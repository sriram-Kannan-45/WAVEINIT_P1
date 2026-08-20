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

export default function AssessmentMobileJoin() {
  const { token } = useParams();
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) | 'user' (front)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const laptopSocketIdRef = useRef(null);
  const offerInProgressRef = useRef(false);
  const mobileCandidateQueueRef = useRef([]);
  const frameIntervalRef = useRef(null);

  // 1. Initial QR Token Validation
  useEffect(() => {
    let cancelled = false;

    const validateToken = async () => {
      try {
        setPhase(PHASE.VALIDATING);
        const res = await fetch(`${API_BASE}/assessment-verification/mobile-validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.success) {
          setError(data.error || 'This QR code is invalid or has expired.');
          setPhase(PHASE.ERROR);
          return;
        }

        console.log('[MOBILE SESSION]', data.sessionId);
        console.log('[MOBILE] SOCKET ROOM:', `assessment_verif_${data.sessionId}`);
        setInfo(data);
        setPhase(PHASE.CAMERA_REQUEST);
      } catch (err) {
        if (!cancelled) {
          setError('Could not connect to the server. Please check your network connection.');
          setPhase(PHASE.ERROR);
        }
      }
    };

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // WebRTC Helper: Exactly ONE controlled WebRTC negotiation function
  const startWebRTCOffer = useCallback(async (targetSocketId = null) => {
    const target = targetSocketId || laptopSocketIdRef.current;
    if (!socketRef.current?.connected || !streamRef.current || !info?.sessionId) {
      console.log('[MOBILE] Cannot start WebRTC yet: socket, stream, or session not ready');
      return;
    }

    if (!target) {
      console.log('[MOBILE] Laptop socket missing, waiting for laptop_joined');
      return;
    }

    try {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {
          console.error('[WEBRTC ERROR]', e);
        }
        pcRef.current = null;
      }

      console.log('[MOBILE-7] PEER CREATED');
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
      });
      pcRef.current = pc;

      // Add every live camera track
      streamRef.current.getVideoTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current);
      });

      console.log('[MOBILE-8] SENDERS', pc.getSenders());

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        console.log('[MOBILE] ICE SEND');
        if (socketRef.current?.connected) {
          socketRef.current.emit('assessment_verif:ice-candidate', {
            sessionId: info.sessionId,
            targetSocketId: laptopSocketIdRef.current || target,
            candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[MOBILE] CONNECTION STATE', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setPeerConnected(true);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setPeerConnected(false);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[MOBILE] ICE STATE', pc.iceConnectionState);
      };

      pc.onsignalingstatechange = () => {
        console.log('[MOBILE] signalingState:', pc.signalingState);
      };

      console.log('[MOBILE-9] CREATING OFFER');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[MOBILE-10] OFFER CREATED');

      console.log('[MOBILE-11] SENDING OFFER TO', laptopSocketIdRef.current || target);
      console.log('[MOBILE] OFFER SEND');
      socketRef.current.emit('assessment_verif:offer', {
        sessionId: info.sessionId,
        targetSocketId: laptopSocketIdRef.current || target,
        offer: pc.localDescription,
      });
    } catch (err) {
      console.error('[WEBRTC ERROR]', err);
    }
  }, [info?.sessionId]);

  // Frame Fallback Relay Stream (Bandwidth-efficient canvas capture)
  const startFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const captureAndEmit = () => {
      const vid = videoRef.current;
      const socket = socketRef.current;
      if (vid && vid.videoWidth > 0 && socket && socket.connected) {
        try {
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL('image/jpeg', 0.45);
          socket.emit('assessment_verif:frame', {
            sessionId: info?.sessionId,
            participantId: info?.participantId || 1,
            moduleType: info?.assessmentType || 'QUIZ',
            cameraSource: 'MOBILE_CAMERA',
            frame,
          });
        } catch (e) {
          console.error('[WEBRTC ERROR]', e);
        }
      }
    };

    frameIntervalRef.current = setInterval(captureAndEmit, 150);
  }, [info?.sessionId, info?.participantId, info?.assessmentType]);

  // Session Closed / Completed Handler: Releases camera hardware immediately
  const handleSessionClosed = useCallback((reason = 'ASSESSMENT_COMPLETED') => {
    console.log('[AssessmentMobileJoin] Assessment finished/closed, releasing camera hardware:', reason);
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
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

  // Periodic polling check to detect if laptop closed / submitted the assessment
  useEffect(() => {
    const activeToken = token || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null) || info?.token;
    const activeSessionId = info?.sessionId;
    if ((!activeToken && !activeSessionId) || phase === PHASE.COMPLETED || phase === PHASE.ERROR) return;

    const interval = setInterval(async () => {
      try {
        const url = activeToken
          ? `${API_BASE}/assessment-verification/mobile-status/${activeToken}`
          : `${API_BASE}/monitoring/sessions/${activeSessionId}/status`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const isEnded = data?.isEnded || ['COMPLETED', 'ENDED', 'EXPIRED', 'USED', 'SUBMITTED', 'TERMINATED'].includes(data?.status);
          if (isEnded) {
            handleSessionClosed('ASSESSMENT_COMPLETED');
          }
        }
      } catch (e) {
        // Non-blocking
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [token, info, phase, handleSessionClosed]);

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
      console.log('[MOBILE-1] socket connected', socket.connected);
      console.log('[MOBILE-2] socket id', socket.id);
      console.log('[MOBILE-3] session id', sessionId);
      console.log('[MOBILE-4] laptop socket id', laptopSocketIdRef.current);
      setSocketConnected(true);
      socket.emit('assessment_verif:join', {
        sessionId,
        role: 'mobile_camera',
      });

      // If camera stream is already live and laptop is known, start WebRTC
      if (streamRef.current && laptopSocketIdRef.current) {
        startWebRTCOffer(laptopSocketIdRef.current);
      }
      if (streamRef.current) {
        startFrameCapture();
      }
    });

    socket.on('disconnect', () => {
      console.log('[MOBILE] Socket disconnected');
      setSocketConnected(false);
      setPeerConnected(false);
    });

    // Laptop joined room → store socket ID & start negotiation if camera is active
    socket.on('assessment_verif:laptop_joined', ({ socketId }) => {
      console.log('[MOBILE] LAPTOP JOINED', socketId);
      laptopSocketIdRef.current = socketId;
      console.log('[MOBILE-4] laptop socket id', laptopSocketIdRef.current);
      if (streamRef.current) {
        startWebRTCOffer(socketId);
        startFrameCapture();
      }
    });

    // Laptop answered SDP offer
    socket.on('assessment_verif:answer', async ({ answer }) => {
      console.log('[MOBILE] answer received');
      if (pcRef.current && answer) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[MOBILE] remote description set');

          // Flush queued candidates
          if (mobileCandidateQueueRef.current.length > 0) {
            for (const cand of mobileCandidateQueueRef.current) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.error('[WEBRTC ERROR]', e);
              }
            }
            mobileCandidateQueueRef.current = [];
          }
        } catch (err) {
          console.error('[WEBRTC ERROR]', err);
        }
      }
    });

    // ICE candidates from laptop
    socket.on('assessment_verif:ice-candidate', async ({ candidate }) => {
      if (candidate) {
        console.log('[MOBILE] ICE candidate received');
        const pc = pcRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[MOBILE] Added ICE candidate from laptop');
          } catch (err) {
            console.error('[WEBRTC ERROR]', err);
          }
        } else {
          mobileCandidateQueueRef.current.push(candidate);
        }
      }
    });

    // Assessment ended / submitted by laptop → immediately stop camera
    socket.on('assessment_verif:session_ended', () => {
      handleSessionClosed('ASSESSMENT_COMPLETED');
    });
    socket.on('assessment_verif:assessment_completed', () => {
      handleSessionClosed('ASSESSMENT_COMPLETED');
    });
    socket.on('monitoring:session_ended', () => {
      handleSessionClosed('ASSESSMENT_COMPLETED');
    });
    socket.on('assessment_verif:session_expired', () => {
      handleSessionClosed('SESSION_EXPIRED');
    });

    return () => {
      socket.disconnect();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {
          console.error('[WEBRTC ERROR]', e);
        }
      }
    };
  }, [sessionId, socketToken, startWebRTCOffer, startFrameCapture, handleSessionClosed]);

  // 3. Request Mobile Camera Access (Defaults to Back Camera / Environment)
  const enableCamera = useCallback(async (requestedFacingMode = 'environment') => {
    setError(null);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported on this browser. Try Chrome or Safari.');
      }

      console.log(`[MOBILE] Requesting mobile camera with facingMode: ${requestedFacingMode}...`);
      let stream = null;
      let usedFacingMode = requestedFacingMode;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacingMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (prefErr) {
        console.warn(`[MOBILE] Preferred facingMode ${requestedFacingMode} failed, trying fallback:`, prefErr);
        const fallbackMode = requestedFacingMode === 'environment' ? 'user' : 'environment';
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: fallbackMode,
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          });
          usedFacingMode = fallbackMode;
        } catch (fallErr) {
          console.warn('[MOBILE] Fallback facingMode failed, trying generic video constraints:', fallErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      const videoTrack = stream.getVideoTracks()[0];
      const actualSettings = videoTrack?.getSettings?.() || {};
      const finalFacingMode = actualSettings.facingMode || usedFacingMode;
      setFacingMode(finalFacingMode);

      console.log('[MOBILE-5] CAMERA STREAM CREATED', finalFacingMode);
      console.log('[MOBILE-6] VIDEO TRACK', videoTrack);

      streamRef.current = stream;
      setCameraActive(true);
      setPhase(PHASE.STREAMING);

      // Start WebRTC Peer Connection if laptop socket is already known
      if (socketRef.current?.connected && laptopSocketIdRef.current) {
        startWebRTCOffer(laptopSocketIdRef.current);
      }

      // Start Fallback Frame Streaming
      startFrameCapture();

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
      }).catch((err) => console.error('[WEBRTC ERROR]', err));
    } catch (err) {
      console.error('[WEBRTC ERROR]', err);
      setError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in your mobile browser settings.'
          : err.message || 'Unable to access mobile camera.'
      );
    }
  }, [token, startWebRTCOffer, startFrameCapture]);

  // 4. Switch / Toggle Camera between Back and Front
  const toggleCamera = useCallback(async () => {
    if (isSwitchingCamera) return;
    setIsSwitchingCamera(true);
    const targetMode = facingMode === 'environment' ? 'user' : 'environment';

    try {
      // 1. Stop current tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // 2. Request new stream with alternate facing mode
      let newStream = null;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (err) {
        console.warn(`[MOBILE] Could not switch to ${targetMode}:`, err);
        newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      const newTrack = newStream.getVideoTracks()[0];
      const actualSettings = newTrack?.getSettings?.() || {};
      const effectiveMode = actualSettings.facingMode || targetMode;
      setFacingMode(effectiveMode);

      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }

      // 3. Update WebRTC sender track seamlessly
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender && newTrack) {
          await videoSender.replaceTrack(newTrack);
        } else if (socketRef.current?.connected && laptopSocketIdRef.current) {
          startWebRTCOffer(laptopSocketIdRef.current);
        }
      }
    } catch (err) {
      console.error('[MOBILE] Switch camera error:', err);
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
      startFrameCapture();
    }
  }, [phase, cameraActive, startFrameCapture]);

  // Cleanup media tracks on unmount
  useEffect(() => {
    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  {info?.assessmentTitle || 'Assessment'}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: '#EAF8F0',
                  color: '#16A34A',
                  border: '1px solid #DCFCE7'
                }}>
                  <CheckCircle2 size={13} color="#16A34A" />
                  <span>Camera Connected</span>
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
                    startFrameCapture();
                  }}
                  onPlaying={() => {
                    startFrameCapture();
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
                  <CheckCircle2 size={20} color="#16A34A" />
                </div>
                <div className="wi-mobile-instruction-content">
                  <h3 className="wi-mobile-instruction-title">Verification Ready</h3>
                  <p className="wi-mobile-instruction-text">
                    <strong>Position your phone so your face, upper body, and laptop screen are visible.</strong> Keep this screen active and do not close this browser tab during your assessment.
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
    </div>
  );
}

