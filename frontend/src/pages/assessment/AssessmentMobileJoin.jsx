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
  Volume2,
} from 'lucide-react';
import { API_BASE, BACKEND_ORIGIN } from '../../api/api';
import { mobileCameraStatus } from '../../utils/mobileCameraStatus.mjs';
import { hireRoomMessage, speakHireRoomVoice, stopHireRoomVoice } from '../../utils/hireRoomVoice';
import '../../styles/assessment-verification.css';

const PHASE = {
  LOADING: 'loading',
  READY: 'ready',
  CAMERA_REQUEST: 'camera_request',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  ERROR: 'error',
};

const ROOM_PHOTO_ERROR_KEYS = {
  AI_TIMEOUT: 'photo_timeout',
  UPLOAD_FAILED: 'photo_upload_failed',
  INVALID_IMAGE: 'photo_invalid',
  ALREADY_ANALYZING: 'photo_analyzing',
  CAPTURE_REPLAY: 'failure_duplicate_image',
  STALE_CAPTURE: 'failure_stale',
  CAMERA_NOT_READY: 'failure_webcam',
  QR_NOT_PAIRED: 'photo_upload_failed',
  INVALID_CAPTURE_ID: 'photo_invalid',
  STEP_OUT_OF_ORDER: 'photo_step_resync',
  ROOM_PHASE_INVALID: 'room_phase_invalid',
  UNSUPPORTED_STEP: 'unsupported_step',
  INVALID_LAPTOP_SAMPLE: 'failure_webcam',
  SERVER_ERROR: 'photo_server_error',
};

const roomPhotoError = code => Object.assign(new Error(code), { code });
const logRoomPhoto = (stage, details = {}) => {
  if (import.meta.env.DEV) console.info(`[HIRE_ROOM_PHOTO] ${stage}`, details);
};

// Canonical guided room steps, mirroring the laptop page. Counting only these
// keys keeps the counter correct on sessions resumed from the older 6-step
// build, whose stored status map may still hold a retired step.
const HIRE_ROOM_STEP_KEYS = ['front', 'left', 'right', 'bottom', 'desk'];

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
  const [desktopReceiving, setDesktopReceiving] = useState(false);
const [transportError, setTransportError] = useState(null);
  const [compositionWarning, setCompositionWarning] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [scanRecording, setScanRecording] = useState(false);
  const [scanReviewPending, setScanReviewPending] = useState(false);
  const [scanRecordSeconds, setScanRecordSeconds] = useState(0);
  const [scanControlError, setScanControlError] = useState('');
  const scanRecordingRef = useRef(false);
  const scanControlBusyRef = useRef(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const workspaceReadyRef = useRef(false);
  const roomStateRef = useRef(null);
  useEffect(() => {
    workspaceReadyRef.current = false;
    setWorkspaceReady(false);
    roomStateRef.current = null;
    setRoomState(null);
    scanRecordingRef.current = false;
    setScanRecording(false);
    setScanReviewPending(false);
  }, [info?.sessionId]);
  useEffect(() => {
    if (roomState?.phase === 'scan360') return;
    scanRecordingRef.current = false;
    setScanRecording(false);
    setScanReviewPending(false);
  }, [roomState?.phase]);
  useEffect(() => {
    // `flag` and `retry` both re-arm recording; only the instruction differs,
    // and a flagged scan must be explained rather than shown as a blank reset.
    if (['retry', 'flag', 'ready'].includes(roomState?.recordingStage)) {
      setScanReviewPending(false);
      setScanControlError('');
    }
  }, [roomState?.recordingStage]);
  useEffect(() => {
    if (!scanReviewPending) return undefined;
    const timer = setTimeout(() => {
      setScanReviewPending(false);
      setScanControlError('Review did not return. Start a new recording and try again.');
    }, 75000);
    return () => clearTimeout(timer);
  }, [scanReviewPending]);
  useEffect(() => {
    if (!scanRecording) return undefined;
    const timer = setInterval(() => setScanRecordSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [scanRecording]);
  const [roomCaptureStatus, setRoomCaptureStatus] = useState('CAPTURE_READY');
  const [roomCaptureError, setRoomCaptureError] = useState('');
  const [roomPhotoPreview, setRoomPhotoPreview] = useState(null);
  const roomCaptureBusyRef = useRef(false);
  const roomUploadAcceptedRef = useRef(null);
  const mobileStreamIdRef = useRef(crypto.randomUUID());
  const deviceOrientationRef = useRef(null);
  const orientationPermissionRef = useRef(false);
  const overlayVideoRef = useRef(null);
  const lastDesktopReceiptRef = useRef(0);
  const retryJoinRef = useRef(null);
  const cameraLinked = socketConnected && (peerConnected || desktopReceiving);
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
  const joinedRef = useRef(false);
  const offerTargetRef = useRef(null);
  const lastOfferAtRef = useRef(0);
  const framePendingRef = useRef(false);
  const sendVerificationFrameRef = useRef(null);
  const lastScanSampleAtRef = useRef(0);
  useEffect(() => {
    const onOrientation = event => {
      if (Number.isFinite(event.alpha)) deviceOrientationRef.current = {
        yaw: event.alpha, pitch: Number.isFinite(event.beta) ? event.beta : null,
        capturedAt: Date.now(),
      };
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, []);
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
        setIsAssessmentStarted(!!data.isAssessmentStarted);
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
  const startWebRTCOffer = useCallback(async (targetSocketId = null, options = {}) => {
    const target = targetSocketId || laptopSocketIdRef.current;
    if (!joinedRef.current || !socketRef.current?.connected || !streamRef.current || !info?.sessionId) {
      console.log('[MOBILE-P2P] Socket, stream, or session not ready yet');
      return;
    }

    if (!target) {
      console.log('[MOBILE-P2P] Laptop socket not discovered yet, waiting for peer join');
      return;
    }

    if (offerInProgressRef.current) return;
    const nowMs = Date.now();
    const force = Boolean(options?.force);
    const pcState = pcRef.current?.connectionState;
    // Rate-limit background retries and never spam renegotiation on a healthy
    // connected peer — unless the laptop explicitly (re)joined, forcing a
    // fresh pair. A connection stuck 'connecting' because the old laptop peer
    // died is NOT exempt, so the next retry re-offers and recovers instead of
    // suppressing the renegotiation forever.
    if (!force && nowMs - lastOfferAtRef.current < 2500) return;
    if (!force && offerTargetRef.current === target && pcState === 'connected') return;
    lastOfferAtRef.current = nowMs;
    offerInProgressRef.current = true;
    offerTargetRef.current = target;
    mobileCandidateQueueRef.current = [];
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
            targetSocketId: target,
            candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[MOBILE-P2P] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setPeerConnected(true);
          setTransportError(null);
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
        targetSocketId: target,
        offer: pc.localDescription,
      });
    } catch (err) {
      console.error('[MOBILE-P2P] WebRTC Offer error:', err);
      offerTargetRef.current = null;
    } finally {
      offerInProgressRef.current = false;
      if (joinedRef.current && laptopSocketIdRef.current && laptopSocketIdRef.current !== target) {
        queueMicrotask(() => startWebRTCOffer(laptopSocketIdRef.current));
      }
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
    setRoomState(null);
    setPhase(PHASE.COMPLETED);
  }, []);

  const confirmAssessmentEnded = useCallback(async reason => {
    if (!info?.hireFraming && !workspaceReadyRef.current) { handleSessionClosed(reason); return; }
    const statusKey = token || info?.token || info?.sessionId;
    if (!statusKey) return;
    try {
      const response = await fetch(`${API_BASE}/assessment-verification/mobile-status/${statusKey}`);
      if (!response.ok) return;
      const status = await response.json();
      if (status.isEnded === true && ['COMPLETED', 'SUBMITTED', 'EVALUATED', 'AUTO_SUBMITTED', 'TERMINATED'].includes(status.status)) {
        handleSessionClosed(reason);
      } else {
        setTransportError('The verification session is still active. Keep your mobile camera open.');
      }
    } catch (_) { /* polling will confirm a genuine submission */ }
  }, [handleSessionClosed, info?.hireFraming, info?.sessionId, info?.token, token]);

  // Periodic fallback check to detect if assessment was legitimately submitted/completed
  useEffect(() => {
    const activeToken = token || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null) || info?.token;
    const activeSessionId = info?.sessionId;
    if ((!activeToken && !activeSessionId) || phase === PHASE.COMPLETED || phase === PHASE.ERROR) return;

    // Only check for completion if stream has started
    if (phase !== PHASE.STREAMING) return;

    const checkStatus = async () => {
      try {
        const url = activeToken
          ? `${API_BASE}/assessment-verification/mobile-status/${activeToken}`
          : `${API_BASE}/monitoring/sessions/${activeSessionId}/status`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data?.workspaceReady === true) {
            workspaceReadyRef.current = true;
            setWorkspaceReady(true);
          }
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
    };
    checkStatus();
    const interval = setInterval(checkStatus, 4000);

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
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    const sendVerificationFrame = (force = false) => {
      const sensor = deviceOrientationRef.current;
      const p2pLive = !!pcRef.current && pcRef.current.connectionState === 'connected';
      const video = videoRef.current;
      if (!workspaceReadyRef.current && roomStateRef.current?.phase === 'scan360' && scanRecordingRef.current && joinedRef.current &&
          video?.videoWidth > 0 && video?.videoHeight > 0 && socketRef.current?.connected &&
          Date.now() - lastScanSampleAtRef.current >= 450) {
        try {
          canvas.width = Math.min(480, video.videoWidth);
          canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          lastScanSampleAtRef.current = Date.now();
          socketRef.current.emit('assessment_verif:scan_sample', {
            sessionId: info.sessionId, mobileStreamId: mobileStreamIdRef.current,
            capturedAt: lastScanSampleAtRef.current,
            frame: canvas.toDataURL('image/jpeg', 0.72),
            orientation: sensor && Date.now() - sensor.capturedAt < 2500
              ? { yaw: sensor.yaw, pitch: sensor.pitch } : null,
          });
        } catch (_) {}
      }
      if (!framePendingRef.current && (force || !p2pLive || workspaceReadyRef.current || roomStateRef.current?.complete) && joinedRef.current && video && video.videoWidth > 0 && video.videoHeight > 0 && socketRef.current?.connected) {
        try {
          canvas.width = Math.min(640, video.videoWidth);
          canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL('image/jpeg', 0.7);
          framePendingRef.current = true;
          socketRef.current.timeout(12000).emit('assessment_verif:frame', {
            sessionId: info.sessionId,
            frame,
            participantId: info.participantId,
          }, (err, ack) => {
            framePendingRef.current = false;
            if (err || !ack?.ok) {
              const stillLive = !!pcRef.current && (pcRef.current.connectionState === 'connected' || pcRef.current.connectionState === 'connecting');
              if (!stillLive) setTransportError(ack?.error || 'Camera upload interrupted. Reconnecting to the laptop…');
            }
          });
        } catch (e) {}
      }
    };
    sendVerificationFrameRef.current = sendVerificationFrame;
    frameIntervalRef.current = setInterval(sendVerificationFrame, 400); // ~2.5 fps

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      if (sendVerificationFrameRef.current === sendVerificationFrame) sendVerificationFrameRef.current = null;
    };
  }, [phase, info?.sessionId, info?.participantId, socketConnected]);

  // 2. Setup Socket Connection for real-time synchronization with Laptop (Stable lifecycle)
  const sessionId = info?.sessionId;
  const socketToken = info?.socketToken;

  useEffect(() => {
    if (!sessionId || !socketToken) return;

    const wsUrl = BACKEND_ORIGIN || window.location.origin;
    const socket = io(wsUrl, {
      auth: { token: socketToken },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 20,
    });
    socketRef.current = socket;

    let joinRetryTimer;
    const joinRoom = () => {
      clearTimeout(joinRetryTimer);
      if (!socket.connected) { socket.connect(); return; }
      console.log('[MOBILE-P2P] Socket connected:', socket.id, 'session:', sessionId);
      joinedRef.current = false;
      offerTargetRef.current = null;
      socket.timeout(8000).emit('assessment_verif:join', {
        sessionId,
        role: 'mobile_camera',
      }, (err, ack) => {
        if (err || !ack?.ok) {
          setSocketConnected(false);
          setTransportError(ack?.error || 'Could not join the camera session. Retrying…');
          if (socket.connected) joinRetryTimer = setTimeout(joinRoom, 3000);
          return;
        }
        setTransportError(null);
        joinedRef.current = true;
        setSocketConnected(true);
        if (ack.workspaceReady === true) {
          workspaceReadyRef.current = true;
          setWorkspaceReady(true);
        }

      // If camera stream is already live, immediately start WebRTC offer and notify laptop
      if (streamRef.current) {
        startWebRTCOffer(laptopSocketIdRef.current);
        socket.emit('assessment_verif:mobile_ready', {
          sessionId,
          token: info?.token || token,
          mobileStreamId: mobileStreamIdRef.current,
        });
        socket.emit('assessment_verif:stream_status', {
          sessionId,
          streaming: true,
          mobileStreamId: mobileStreamIdRef.current,
        });
      }
      });
    };
    retryJoinRef.current = joinRoom;
    socket.on('connect', joinRoom);
    socket.on('connect_error', () => {
      setSocketConnected(false);
      setTransportError('Camera is open, but the server connection failed. Check your connection and retry.');
    });
    socket.on('assessment_verif:desktop_receiving', () => {
      lastDesktopReceiptRef.current = Date.now();
      setDesktopReceiving(true);
      setTransportError(null);
    });
socket.on('assessment_verif:yolo_detection', data => {
      const evidence = data?.success ? data.mobileEvidence : null;
      const status = mobileCameraStatus({ connected: true, evidence, hireFraming: info?.hireFraming === true || workspaceReadyRef.current });
      setCompositionWarning(status.kind === 'reposition' ? `${status.title}. ${status.message}` : null);
      if (status.kind === 'reposition' && evidence?.framing_mode === 'HIRE_WORKSPACE' && workspaceReadyRef.current) {
        const key = { LAPTOP: 'framing_laptop', HANDS: 'framing_hands' }[evidence.guidance_key];
        if (key) speakHireRoomVoice({ priority: 'RETRY', language: roomStateRef.current?.language, key });
      }
    });
    socket.on('assessment_verif:workspace_ready', data => {
      if (data?.sessionId !== sessionId || data?.ready !== true) return;
      workspaceReadyRef.current = true;
      setWorkspaceReady(true);
      sendVerificationFrameRef.current?.(true);
    });
socket.on('assessment_verif:room_state', data => {
      if (!data || typeof data.state !== 'object') return;
      if (workspaceReadyRef.current && data.state.complete !== true) return;
      const capturing = roomCaptureBusyRef.current || roomUploadAcceptedRef.current;
      // While a capture/upload is in flight on this device, the laptop's
      // room_state broadcast can race the machine's own ack and regress our
      // CAPTURING/UPLOADING/ANALYZING status. Keep the in-flight verdict and
      // apply only the remaining room fields.
      const next = capturing
        ? { ...data.state, aiStatus: roomStateRef.current?.aiStatus ?? data.state.aiStatus }
        : data.state;
      const justCompleted = next.complete === true && roomStateRef.current?.complete !== true;
      roomStateRef.current = next;
      setRoomState({ ...next });
      if (justCompleted) sendVerificationFrameRef.current?.(true);
    });
    socket.on('assessment_verif:room_capture_state', event => {
      if (event?.status === 'ANALYZING' && event.captureId) roomUploadAcceptedRef.current = event.captureId;
    });
    // Server-authoritative step correction after a step-order rejection, so the
    // capture button targets the step the backend actually expects.
    socket.on('assessment_verif:room_state_sync', payload => {
      if (!payload || payload.reason !== 'STEP_OUT_OF_ORDER') return;
      const key = payload.pendingStep;
      if (!key) return;
      const current = roomStateRef.current || {};
      const index = Math.max(0, HIRE_ROOM_STEP_KEYS.indexOf(key));
      const next = { ...current, step: { key, index, label: current.step?.label }, sixCaptureStatus: payload.sixCaptureStatus || {} };
      roomStateRef.current = next;
      setRoomState({ ...next });
      console.warn('[HIRE_ROOM_PHOTO] step desync corrected by server', key);
    });
    const receiptTimer = setInterval(() => {
      if (Date.now() - lastDesktopReceiptRef.current > 5000) setDesktopReceiving(false);
    }, 1000);

    socket.on('disconnect', () => {
      console.log('[MOBILE-P2P] Socket disconnected');
      joinedRef.current = false;
      framePendingRef.current = false;
      setSocketConnected(false);
      setPeerConnected(false);
      setDesktopReceiving(false);
      scanRecordingRef.current = false;
      setScanRecording(false);
      setTransportError('Connection interrupted. Reconnecting…');
    });

    // Laptop joined room → store socket ID & start negotiation if camera is active
    socket.on('assessment_verif:laptop_joined', ({ socketId }) => {
      console.log('[MOBILE-P2P] Laptop joined:', socketId);
      laptopSocketIdRef.current = socketId;
      if (streamRef.current) {
        startWebRTCOffer(socketId, { force: true });
      }
    });

    // Laptop answered SDP offer
    socket.on('assessment_verif:answer', async ({ answer }) => {
      console.log('[MOBILE-P2P] SDP Answer received from laptop');
      const pc = pcRef.current;
      if (!pc || !answer) return;
      // A staple from a previous renegotiation must never be applied to a pc
      // that has moved on (new offer), which would corrupt the SDP state.
      if (pc.signalingState !== 'have-local-offer') {
        console.warn('[MOBILE-P2P] Ignoring stale answer (signalingState=' + pc.signalingState + ')');
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        // Flush queued candidates
        if (mobileCandidateQueueRef.current.length > 0) {
          for (const cand of mobileCandidateQueueRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.error('[MOBILE-P2P] ICE error:', e);
            }
          }
          mobileCandidateQueueRef.current = [];
        }
      } catch (err) {
        console.error('[MOBILE-P2P] Remote description error:', err);
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
      confirmAssessmentEnded(data?.reason || 'SOCKET_ASSESSMENT_VERIF_SESSION_ENDED');
    });
    socket.on('assessment_verif:assessment_completed', (data) => {
      console.log('[AssessmentMobileJoin] Received assessment_verif:assessment_completed:', data);
      confirmAssessmentEnded('SOCKET_ASSESSMENT_COMPLETED');
    });
    socket.on('monitoring:session_ended', (data) => {
      console.log('[AssessmentMobileJoin] Received monitoring:session_ended:', data);
      confirmAssessmentEnded(data?.reason || 'SOCKET_MONITORING_SESSION_ENDED');
    });
    socket.on('assessment_verif:session_expired', (data) => {
      console.log('[AssessmentMobileJoin] Received assessment_verif:session_expired:', data);
      if (joinedRef.current) {
        setTransportError('The pairing session needs to be refreshed on your laptop. Keep this page open while reconnecting.');
      } else {
        setError('The QR pairing link expired. Scan a new QR code from the laptop.');
        setPhase(PHASE.ERROR);
      }
    });

    return () => {
      clearTimeout(joinRetryTimer);
      clearInterval(receiptTimer);
      retryJoinRef.current = null;
      socket.disconnect();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
      }
    };
  }, [sessionId, socketToken, info?.token, info?.hireFraming, token, startWebRTCOffer, confirmAssessmentEnded]);

  const controlScanRecording = action => {
    if (scanControlBusyRef.current || !socketRef.current?.connected || !joinedRef.current || !cameraActive) return;
    scanControlBusyRef.current = true;
    setScanControlError('');
    // Stop sampling before sending Finish. Socket.IO preserves event order, so
    // the laptop receives every earlier sample before the finish event.
    if (action === 'finish') scanRecordingRef.current = false;
    socketRef.current.timeout(8000).emit('assessment_verif:scan_recording_control', {
      sessionId: info?.sessionId, mobileStreamId: mobileStreamIdRef.current, action,
    }, (error, ack) => {
      scanControlBusyRef.current = false;
      if (error || !ack?.ok) {
        setScanControlError(ack?.error || 'Recording control could not reach the laptop. Try again.');
        if (action === 'finish') {
          scanRecordingRef.current = false;
          setScanRecording(false);
        }
        return;
      }
      const recording = action === 'start';
      scanRecordingRef.current = recording;
      setScanRecording(recording);
      setScanReviewPending(action === 'finish');
      if (recording) setScanRecordSeconds(0);
    });
  };

  useEffect(() => {
    if (overlayVideoRef.current && streamRef.current && overlayVideoRef.current.srcObject !== streamRef.current) {
      overlayVideoRef.current.srcObject = streamRef.current;
      overlayVideoRef.current.play().catch(() => {});
    }
  }, [roomState?.phase, cameraActive]);

  useEffect(() => {
    roomCaptureBusyRef.current = false;
    setRoomCaptureStatus('CAPTURE_READY');
    setRoomCaptureError('');
    setRoomPhotoPreview(previous => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, [roomState?.phase, roomState?.step?.key]);

useEffect(() => {
    if (workspaceReady) return;
    if (roomState?.phase === 'six' && roomState.step?.key) {
      stopHireRoomVoice();
      // The laptop voices the room flow; the phone only speaks when the
      // laptop voice is disabled to avoid overlapping duplicate prompts.
      if (roomState.voiceEnabled === false) speakHireRoomVoice({ priority: 'CURRENT_STEP', language: roomState.language,
        key: `step_${roomState.step.key}` });
    } else if (roomState?.phase === 'scan360') {
      stopHireRoomVoice();
      if (roomState.voiceEnabled === false) speakHireRoomVoice({ priority: 'CURRENT_STEP', language: roomState.language, key: 'start_360' });
    }
  }, [workspaceReady, roomState?.phase, roomState?.step?.key, roomState?.language, roomState?.voiceEnabled]);

  useEffect(() => {
    if (workspaceReady) return;
    if (roomState?.phase !== 'scan360') return;
    const key = roomState.restarted ? 'scan_restarted'
      : roomState.pendingObject?.objectType ? 'object_detected' : null;
    if (key && roomState.voiceEnabled === false) {
      speakHireRoomVoice({ priority: 'CRITICAL', language: roomState.language, key,
        message: roomState.message, taMessage: roomState.taMessage });
    }
  }, [workspaceReady, roomState?.phase, roomState?.pendingObject?.objectType, roomState?.restarted,
    roomState?.message, roomState?.taMessage, roomState?.language, roomState?.voiceEnabled]);

  useEffect(() => {
    if (workspaceReady) speakHireRoomVoice({ priority: 'CURRENT_STEP', language: roomState?.language, key: 'workspace_start' });
  }, [workspaceReady, roomState?.language]);
  useEffect(() => () => stopHireRoomVoice(), []);

  useEffect(() => {
    if (workspaceReady) return;
    if (roomState?.phase !== 'six' || !roomState.step?.key) return;
    if (roomState.aiStatus === 'ANALYZING') {
      setRoomCaptureStatus('ANALYZING');
} else if (roomState.aiStatus === 'RETRY') {
      setRoomCaptureStatus('RETAKE');
      if (roomState.voiceEnabled === false) speakHireRoomVoice({ priority: 'RETRY', language: roomState.language,
        key: `retake_${roomState.step.key}`, message: roomState.message, taMessage: roomState.taMessage });
    } else if (roomState.aiStatus === 'SUCCESS') {
      setRoomCaptureStatus('VERIFIED');
      if (roomState.voiceEnabled === false) speakHireRoomVoice({ priority: 'SUCCESS', language: roomState.language,
        key: `${roomState.step.key}_ok`, message: roomState.message, taMessage: roomState.taMessage });
    }
  }, [workspaceReady, roomState?.aiStatus, roomState?.message, roomState?.taMessage, roomState?.step?.key, roomState?.phase, roomState?.language, roomState?.voiceEnabled]);

  const captureRoomPhoto = useCallback(async () => {
    if (!orientationPermissionRef.current && typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      orientationPermissionRef.current = true;
      try { await DeviceOrientationEvent.requestPermission(); } catch (_) { /* visual fallback */ }
    }
    const step = roomState?.step?.key;
    const video = videoRef.current;
    const socket = socketRef.current;
    if (roomCaptureBusyRef.current || roomState?.phase !== 'six' || !step || !socket?.connected) return;
    if (!video?.videoWidth || !video?.videoHeight) {
      setRoomCaptureStatus('ERROR');
      setRoomCaptureError('Camera preview is unavailable. Please check the camera and try again.');
      if (roomState.voiceEnabled === false) speakHireRoomVoice({ priority: 'CRITICAL', language: roomState.language, key: 'camera_error' });
      return;
    }
    roomCaptureBusyRef.current = true;
    setRoomCaptureStatus('CAPTURING');
    setRoomCaptureError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(960, video.videoWidth);
      canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const toJpeg = quality => new Promise((resolve, reject) => canvas.toBlob(blob =>
        blob ? resolve(blob) : reject(roomPhotoError('INVALID_IMAGE')), 'image/jpeg', quality));
      let photo = await toJpeg(0.8);
      if (photo.size > 1200000) {
        const optimized = document.createElement('canvas');
        optimized.width = Math.min(800, canvas.width);
        optimized.height = Math.round(canvas.height * optimized.width / canvas.width);
        optimized.getContext('2d').drawImage(canvas, 0, 0, optimized.width, optimized.height);
        photo = await new Promise((resolve, reject) => optimized.toBlob(blob =>
          blob ? resolve(blob) : reject(roomPhotoError('INVALID_IMAGE')), 'image/jpeg', 0.72));
      }
      if (photo.size > 1400000) throw roomPhotoError('UPLOAD_FAILED');
      logRoomPhoto('PHOTO_CAPTURED', { step });
      logRoomPhoto('PHOTO_SIZE', { step, bytes: photo.size, width: canvas.width, height: canvas.height });
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = Math.min(320, canvas.width);
      previewCanvas.height = Math.round(canvas.height * previewCanvas.width / canvas.width);
      previewCanvas.getContext('2d').drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
      const preview = previewCanvas.toDataURL('image/jpeg', 0.55);
      setRoomPhotoPreview(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(photo);
      });
      setRoomCaptureStatus('UPLOADING');
      const captureId = crypto.randomUUID();
      const capturedAt = Date.now();
      const laptopEvidenceReady = await new Promise(resolve => {
        const timer = setTimeout(() => { socket.off('assessment_verif:laptop_evidence', onEvidence); resolve(false); }, 3200);
        const onEvidence = evidence => {
          if (evidence?.captureId !== captureId) return;
          clearTimeout(timer);
          socket.off('assessment_verif:laptop_evidence', onEvidence);
          resolve(evidence.ready === true);
        };
        socket.on('assessment_verif:laptop_evidence', onEvidence);
        socket.emit('assessment_verif:laptop_evidence_request', { sessionId: info.sessionId, captureId });
      });
      if (!laptopEvidenceReady) throw roomPhotoError('CAMERA_NOT_READY');
      roomUploadAcceptedRef.current = null;
      const bytes = await photo.arrayBuffer();
      logRoomPhoto('UPLOAD_START', { captureId, step, bytes: photo.size });
      const reply = await new Promise((resolve, reject) => socket.timeout(48000).emit('assessment_verif:room_capture',
        { sessionId: info.sessionId, step, captureId, capturedAt,
          mobileStreamId: mobileStreamIdRef.current, photo: bytes, preview,
          orientation: deviceOrientationRef.current && Date.now() - deviceOrientationRef.current.capturedAt < 2500
            ? { yaw: deviceOrientationRef.current.yaw, pitch: deviceOrientationRef.current.pitch } : null },
        (error, ack) => error ? reject(roomPhotoError(roomUploadAcceptedRef.current === captureId ? 'AI_TIMEOUT' : 'UPLOAD_FAILED')) : resolve(ack)));
      logRoomPhoto('UPLOAD_COMPLETE', { captureId, step, accepted: reply?.ok === true });
      if (!reply?.ok) throw roomPhotoError(reply?.errorCode || 'SERVER_ERROR');
      logRoomPhoto('AI_RESPONSE', { captureId, step, verified: reply.result?.verified === true,
        confidence: reply.result?.confidence, guideKey: reply.result?.guideKey });
      setRoomCaptureStatus(reply.result?.valid ? 'VERIFIED' : 'RETAKE');
      if (!reply.result?.valid) {
        const failureKeys = {
          DUPLICATE_IMAGE: 'failure_duplicate_image',
          TOO_SIMILAR_TO_PREVIOUS_VIEW: 'failure_too_similar',
          WRONG_DIRECTION: 'failure_wrong_direction',
          WEBCAM_VALIDATION_FAILED: 'failure_webcam',
          PARTICIPANT_NOT_DETECTED: 'failure_participant',
          MULTIPLE_PERSONS_DETECTED: 'failure_multiple_people',
          INSUFFICIENT_CAMERA_MOVEMENT: 'failure_movement',
          FRAME_TOO_BLURRY: 'failure_blurry',
          FRAME_TOO_DARK: 'failure_dark',
          FRAME_OVEREXPOSED: 'failure_overexposed',
          CAMERA_BLOCKED: 'failure_camera_blocked',
          RESOLUTION_TOO_LOW: 'failure_resolution',
          QUALITY_TOO_LOW: 'failure_quality_low',
          IMAGE_UNREADABLE: 'failure_unreadable',
          STALE_CAPTURE: 'failure_stale',
        };
        const guideKeys = {
          blurred: 'failure_blurry',
          too_dark: 'failure_dark',
          overexposed: 'failure_overexposed',
          camera_blocked: 'failure_camera_blocked',
          resolution_low: 'failure_resolution',
          quality_low: 'failure_quality_low',
          image_invalid: 'failure_unreadable',
          duplicate_image: 'failure_duplicate_image',
        };
        // Prefer the backend's explicit failure code, then its guide key, so the
        // candidate is shown the real cause rather than a generic instruction.
        const key = failureKeys[reply.result?.failureReason]
          || guideKeys[reply.result?.guideKey]
          || (['move_to_area', 'move_further', 'move_left_further', 'move_right_further'].includes(reply.result?.guideKey) ? 'move_further'
          : ['laptop_camera_required'].includes(reply.result?.guideKey) ? 'laptop_camera_required'
           : ['laptop_motion_missing', 'movement_unconfirmed'].includes(reply.result?.guideKey) ? 'laptop_motion_missing'
           : reply.result?.guideKey === 'laptop_participant_not_visible' ? 'laptop_participant_not_visible'
           : reply.result?.guideKey === 'rotation_unconfirmed' ? 'rotation_unconfirmed'
          : 'photo_area_missing');
        setRoomCaptureError((String(roomState.language).startsWith('ta') ? reply.result?.taMessage : reply.result?.message)
          || hireRoomMessage(roomState.language, key));
        setRoomPhotoPreview(previous => {
          if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
          return null;
        });
      }
      logRoomPhoto('VERIFICATION_RESULT', { captureId, step, verified: reply.result?.valid === true });
    } catch (captureError) {
      setRoomCaptureStatus('ERROR');
      const key = ROOM_PHOTO_ERROR_KEYS[captureError.code] || 'photo_server_error';
      setRoomCaptureError(hireRoomMessage(roomState.language, key));
      logRoomPhoto('VERIFICATION_ERROR', { step, code: captureError.code || 'SERVER_ERROR' });
      if (roomState.voiceEnabled === false) speakHireRoomVoice({ priority: 'CRITICAL', language: roomState.language, key });
    } finally {
      roomCaptureBusyRef.current = false;
    }
  }, [roomState, info?.sessionId]);

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
        if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError', 'NotReadableError'].includes(prefErr.name)) throw prefErr;
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
      mobileStreamIdRef.current = crypto.randomUUID();
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
          mobileStreamId: mobileStreamIdRef.current,
        });
        socketRef.current.emit('assessment_verif:stream_status', {
          sessionId: info?.sessionId,
          streaming: true,
          mobileStreamId: mobileStreamIdRef.current,
        });
      }

      // Notify backend via HTTP that mobile camera permission was granted
      const permissionResponse = await fetch(`${API_BASE}/assessment-verification/mobile-connected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceInfo: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        }),
      });
      if (!permissionResponse.ok) throw new Error('Camera opened, but pairing was not accepted. Refresh the laptop verification page and scan its current QR code.');
    } catch (err) {
      console.error('[MOBILE-P2P] Camera permission error:', err);
      setError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in your mobile browser settings.'
          : err.message || 'Unable to access mobile camera.'
      );
    }
  }, [token, info?.sessionId, info?.token, startWebRTCOffer]);

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
                  <h3 className="wi-mobile-instruction-title">{info?.hireFraming ? 'Camera Connection' : 'Camera Framing Requirement'}</h3>
                  <p className="wi-mobile-instruction-text">
                    {info?.hireFraming ? <>
                      Pair the phone and keep the <strong>live camera</strong> open. Room verification starts after the camera connects.
                    </> : <>
                      Position your phone using the <strong>Back Camera</strong> so your{' '}
                      <span className="wi-mobile-instruction-highlight">face</span>,{' '}
                      <span className="wi-mobile-instruction-highlight">upper body</span>, and{' '}
                      <span className="wi-mobile-instruction-highlight">laptop screen</span> are clearly visible.
                    </>}
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
                    {!cameraLinked ? 'Camera open — connecting to your laptop' : isAssessmentStarted
                      ? 'Assessment in progress — keep this camera connected'
                      : workspaceReady ? 'Mobile check — show your hand and laptop'
                      : 'Camera Connected — Waiting for assessment to begin'}
                  </span>
                </span>
              </div>

              {(transportError || error) && <div role="alert" style={{ padding: 12, color: '#9A3412' }}>
                {transportError || error}
                <button type="button" onClick={() => retryJoinRef.current?.()} style={{ marginLeft: 8 }}>Retry connection</button>
              </div>}
              {cameraLinked && compositionWarning && <div role="status" style={{ padding: 12, background: '#FFFBEB', color: '#92400E', borderRadius: 10 }}>{compositionWarning}</div>}
              {cameraLinked && workspaceReady && !isAssessmentStarted && <button type="button"
                onClick={() => speakHireRoomVoice({ priority: 'CURRENT_STEP', language: roomState?.language, key: 'workspace_start', force: true })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', padding: '8px 12px' }}>
                <Volume2 size={18} /> Play hand and laptop instructions
              </button>}
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
                        mobileStreamId: mobileStreamIdRef.current,
                      });
                      socketRef.current.emit('assessment_verif:stream_status', {
                        sessionId: info?.sessionId,
                        streaming: true,
                        mobileStreamId: mobileStreamIdRef.current,
                      });
                    }
                  }}
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />

                {/* Top-Left Live Indicator */}
                <div className="wi-mobile-badge-live">
                  <div className="wi-mobile-dot-pulse" />
                  <span>{cameraLinked ? 'LIVE PROCTORING' : 'LOCAL CAMERA PREVIEW'}</span>
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
                  <span>{cameraLinked ? 'Laptop receiving video' : 'Waiting for laptop connection'}</span>
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
                    {!cameraLinked ? 'Connecting to Your Laptop' : isAssessmentStarted ? 'Assessment In Progress' : workspaceReady ? 'Hand & Laptop Check' : 'Camera Connected & Waiting'}
                  </h3>
                  <p className="wi-mobile-instruction-text">
                    {!cameraLinked ? (
                      <>Your camera is open. Keep both pages open while the laptop connects. If it stays here, refresh the verification page on your laptop and scan its current QR code.</>
                    ) : isAssessmentStarted ? (
                      <>
                        <strong>Your assessment is currently in progress on your laptop.</strong> {info?.hireFraming || workspaceReady
                          ? 'Position your phone so your hand and laptop are clearly visible.'
                          : 'Position your phone so your face, upper body, and laptop screen are clearly visible.'} Keep this page open.
                      </>
                    ) : workspaceReady || roomState?.complete ? (
                      <><strong>Room verification is complete.</strong> Show your hand and laptop together to finish the mobile check.</>
                    ) : (
                      <>
                        <strong>Your phone camera is paired and streaming.</strong> Complete the guided room photos and 180° scan. Keep this page open.
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

      {/* AI-Guided Room Verification Full-Screen Overlay (driven by the laptop) */}
      {phase === PHASE.STREAMING && roomState && roomState.phase && !roomState.complete && !workspaceReady && (
        <div className="wi-room-overlay">
          <div className="wi-room-overlay-inner">
            <div className="wi-room-overlay-shield">
              <Shield size={26} strokeWidth={2.2} />
            </div>
            <div className="wi-room-overlay-title">ROOM VERIFICATION</div>
            <div className="wi-room-proctor-status" role="status">
              <span className="wi-room-proctor-pulse" />
              {socketConnected && cameraActive ? 'Mobile camera connected' : 'Waiting for mobile camera…'}
              <span aria-hidden="true">·</span> AI Proctor {roomState.aiStatus === 'ANALYZING' ? 'checking' : 'guiding'}
              <span aria-hidden="true">·</span> Voice {roomState.voiceEnabled === false ? 'off' : 'on'}
            </div>
            {roomState.phase === 'scan360' &&
              <p className="wi-room-overlay-sensor-note">Keep the phone upright. Start at the saved left view, then turn slowly through front to right.</p>}
            {roomState.phase === 'scan360' ? (
              <div className="wi-room-overlay-step">180° Room Scan — Left → Front → Right</div>
            ) : roomState.step ? (
              <div className="wi-room-overlay-step">Step {roomState.step.index + 1} of {HIRE_ROOM_STEP_KEYS.length} — {roomState.step.label}</div>
            ) : null}
            <p className="wi-room-overlay-hint">{roomState.language?.startsWith('ta')
              ? (roomState.taMessage || hireRoomMessage('ta-IN', `step_${roomState.step?.key}`))
              : (roomState.message || hireRoomMessage('en-IN', `step_${roomState.step?.key}`))}</p>
            <button type="button" className="wi-mobile-btn-primary" style={{ marginBottom: 12 }}
              onClick={() => speakHireRoomVoice({ priority: 'CURRENT_STEP', language: roomState.language,
                key: roomState.phase === 'scan360' ? 'start_360' : `step_${roomState.step?.key || 'front'}`,
                message: roomState.message, taMessage: roomState.taMessage, force: true })}>
              <Volume2 size={17} /> Play instructions
            </button>
            <div className="wi-room-mobile-preview">
              <video ref={overlayVideoRef} autoPlay playsInline muted />
              {roomState.phase === 'scan360' && scanRecording &&
                <span className="wi-room-progress-ring" aria-label="Room recording active">REC</span>}
              <span className="wi-room-camera-direction">{roomState.phase === 'scan360'
                ? (scanRecording ? 'Recording' : 'Ready') : (roomState.step?.label || 'Room')}</span>
            </div>
            {roomPhotoPreview && roomState.phase === 'six' && (
              <div className="wi-room-captured-thumb">
                <img src={roomPhotoPreview} alt={`Captured ${roomState.step?.label || 'room'} photo`} />
                <span>Captured photo</span>
              </div>
            )}
            {roomState.phase === 'six' && (
              <button type="button" className="wi-mobile-btn-primary wi-room-capture-button"
                onClick={captureRoomPhoto}
                disabled={!cameraActive || !socketConnected || roomState.laptopCameraReady === false || ['CAPTURING', 'UPLOADING', 'ANALYZING', 'VERIFIED'].includes(roomCaptureStatus) || (roomState.aiStatus === 'ANALYZING' && roomCaptureStatus !== 'ERROR')}>
                <Camera size={17} /> {roomCaptureStatus === 'RETAKE' ? `Retake ${roomState.step?.label || ''} Photo`
                  : roomCaptureStatus === 'ERROR' ? 'Try Again' : 'Capture Photo'}
              </button>
            )}
            {roomState.phase === 'scan360' && <div className="wi-room-sector-summary">
              <span>{scanRecording ? `Recording ${scanRecordSeconds}s · ${roomState.recordedSamples || 0} samples saved` :
                roomState.recordingStage === 'reviewing' ? 'Analyzing room scan…' :
                  roomState.recordingStage === 'flag' ? 'Remove the item shown, then record the sweep again.' :
                    roomState.recordingStage === 'retry' ? 'That recording was not enough. Start again at the left view.' :
                      'Start at the saved left view. Turn through front and finish at the saved right view.'}</span>
            </div>}
            {roomState.phase === 'scan360' && (roomState.recordingStage === 'retry' || roomState.recordingStage === 'flag') &&
              !scanRecording && !scanReviewPending && (
              <p role="alert" className="wi-room-error">
                {roomState.recordingStage === 'flag' ? (roomState.message || 'A prohibited item was visible. Remove it and record again.')
                  : (roomState.message || 'The recording did not pass review. Please record the sweep again.')}
              </p>)}
            {roomState.phase === 'scan360' && roomState.recordingStage !== 'reviewing' && !scanReviewPending &&
              <button type="button" className="wi-mobile-btn-primary wi-room-capture-button"
                disabled={!cameraActive || !socketConnected || !joinedRef.current || scanControlBusyRef.current}
                onClick={() => controlScanRecording(scanRecording ? 'finish' : 'start')}>
                <Camera size={17} /> {scanRecording ? 'Finish recording and review' : 'Start 180° recording'}
              </button>}
            {scanControlError && <p role="alert" className="wi-room-error">{scanControlError}</p>}
            <div className="wi-room-overlay-status">
              {roomState.phase === 'six'
                ? (roomCaptureStatus === 'CAPTURING' ? 'Capturing…' : roomCaptureStatus === 'UPLOADING' ? 'Uploading…'
                  : roomState.laptopCameraReady === false ? 'Waiting for laptop movement camera…'
                  : roomCaptureStatus === 'ERROR' ? 'Photo analysis temporarily failed'
                    : roomState.aiStatus === 'ANALYZING' ? 'Analyzing photo…'
                      : roomCaptureStatus === 'VERIFIED' ? 'Photo verified' : roomCaptureStatus === 'RETAKE' ? 'Photo not verified — see the reason below' : 'Ready to capture')
                : roomState.recordingStage === 'reviewing' ? 'Analyzing recorded room sweep…'
                  : scanRecording ? 'Keep turning smoothly from left through front to right.'
                    : (roomState.message || 'Record a left-to-right room sweep')}
            </div>
            {roomCaptureError && <p role="alert" className="wi-room-error">{roomCaptureError}</p>}
            <p className="wi-room-overlay-hint">{roomState.phase === 'six'
              ? `${HIRE_ROOM_STEP_KEYS.filter(key => roomState.steps?.[key]?.verifiedAt).length}/${HIRE_ROOM_STEP_KEYS.length} photos verified`
              : 'Finish near the saved right view. The room is checked after recording.'}</p>
          </div>
        </div>
      )}

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


