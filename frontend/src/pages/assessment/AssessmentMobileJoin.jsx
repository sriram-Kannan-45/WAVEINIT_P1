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
} from 'lucide-react';
import { API_BASE, BACKEND_ORIGIN } from '../../api/api';

const PHASE = {
  LOADING: 'loading',
  READY: 'ready',
  CAMERA_REQUEST: 'camera_request',
  STREAMING: 'streaming',
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
  }, [sessionId, socketToken, startWebRTCOffer, startFrameCapture]);

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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-emerald-500 selection:text-white font-sans">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shadow-sm">
          <Shield size={20} />
        </div>
        <span className="text-lg font-bold tracking-tight text-white">WAVE INIT LMS</span>
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-md bg-slate-800/95 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-md">
        <AnimatePresence mode="wait">
          {/* LOADING PHASE */}
          {phase === PHASE.LOADING && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-4"
            >
              <Loader2 className="animate-spin text-emerald-400" size={40} />
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Validating QR Code</h3>
                <p className="text-xs text-slate-400">Connecting to verification session...</p>
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
              className="py-8 flex flex-col items-center text-center space-y-4"
            >
              <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertCircle size={28} />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-rose-300">Verification Error</h3>
                <p className="text-xs text-slate-300 max-w-xs">{error || 'Invalid or expired QR code.'}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2 cursor-pointer"
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
              className="space-y-5"
            >
              {/* Assessment Meta Header */}
              <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
                    {info?.assessmentType === 'CODING' ? 'Coding Assessment' : 'AI Quiz'} Verification
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <Smartphone size={10} /> Back Camera
                  </span>
                </div>
                <div className="text-sm font-bold text-white truncate">{info?.assessmentTitle}</div>
                <div className="text-xs text-slate-400">
                  Participant: <span className="text-slate-200 font-semibold">{info?.participantName}</span>
                </div>
              </div>

              {/* Framing Instructions Card */}
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3.5 flex items-start gap-3 text-left">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Info size={18} />
                </div>
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-emerald-300">Camera Framing Requirement</span>
                  <p className="text-slate-300 leading-relaxed font-medium">
                    Position your phone using the <span className="text-emerald-400 font-bold">Back Camera</span> so your <span className="text-emerald-400 font-bold">face</span>, <span className="text-emerald-400 font-bold">upper body</span>, and <span className="text-emerald-400 font-bold">laptop screen</span> are clearly visible.
                  </p>
                </div>
              </div>

              <div className="text-center space-y-2 py-2">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <Camera size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">Back Camera Access Required</h3>
                  <p className="text-xs text-slate-400 leading-relaxed px-2">
                    Enable camera permission to stream your back camera as the live secondary proctoring view.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={() => enableCamera('environment')}
                className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-slate-950 font-bold text-sm rounded-2xl transition duration-150 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera size={18} />
                <span>Enable Back Camera</span>
              </button>
            </motion.div>
          )}

          {/* STREAMING / CONNECTED PHASE */}
          {phase === PHASE.STREAMING && (
            <motion.div
              key="streaming"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Header Badge */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-slate-300 truncate max-w-[200px]">
                  {info?.assessmentTitle}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>Camera Connected</span>
                </span>
              </div>

              {/* Video Preview with Live Badges and Switch Camera Button */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-emerald-500/40 aspect-[4/3] flex items-center justify-center shadow-inner min-h-[220px]">
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
                  className="w-full h-full object-cover"
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />

                {/* Top-Left Live Indicator */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur border border-slate-700/60 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 z-10 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold">LIVE PROCTORING</span>
                </div>

                {/* Top-Right Flip/Switch Camera Button */}
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={isSwitchingCamera}
                  className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 backdrop-blur border border-slate-700/70 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 z-10 transition active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
                  title="Switch between Back and Front Camera"
                >
                  <SwitchCamera size={13} className={isSwitchingCamera ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                  <span>{facingMode === 'environment' ? 'Back Cam' : 'Front Cam'}</span>
                </button>

                {/* Bottom-Left Live Connection Status */}
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur border border-slate-700/60 text-[10px] text-slate-200 flex items-center gap-1.5 z-10 shadow-sm">
                  <Wifi size={11} className="text-emerald-400" />
                  <span className="font-semibold text-emerald-300">Live Streaming</span>
                </div>
              </div>

              {/* Framing Instructions Reminder */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl space-y-1 text-left">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Verification Ready
                </div>
                <p className="text-[11.5px] text-slate-300 leading-relaxed font-medium">
                  <strong>Position your phone so your face, upper body, and laptop screen are visible.</strong> Keep this screen active and do not close this browser tab during your assessment. You can tap <strong>Back Cam / Front Cam</strong> above to switch cameras anytime.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-center text-[11px] text-slate-500">
        WAVE INIT Secure Proctoring &bull; Real-time Verification
      </div>
    </div>
  );
}

