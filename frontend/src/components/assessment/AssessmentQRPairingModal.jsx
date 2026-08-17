/**
 * AssessmentQRPairingModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * WAVE INIT LMS — AI Quiz / Coding Assessment Verification Modal
 * Pixel-perfect SaaS assessment verification matching the target reference UI.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import {
  Shield,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Smartphone,
  Check,
  X,
  ArrowRight,
  Lock,
  QrCode,
  UserCheck,
  Video,
  ExternalLink,
  Copy,
  Maximize2,
  Minimize2,
  Clock,
} from 'lucide-react';
import { API_BASE, BACKEND_ORIGIN } from '../../api/api';
import { buildAssessmentMobileUrl } from '../../utils/assessmentPairingUrl';
import '../../styles/assessment-verification.css';

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

export default function AssessmentQRPairingModal({
  assessmentType = 'QUIZ',
  assessmentId,
  attemptId,
  assessmentTitle = 'Background Verification Declaration Quiz',
  participantName = 'Sriram Titoo',
  userToken,
  onVerified,
  onCancel,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(597);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [copiedMobileLink, setCopiedMobileLink] = useState(false);
  const [showHowToScan, setShowHowToScan] = useState(false);
  const [isFullscreenVideo, setIsFullscreenVideo] = useState(false);
  const [verifyingStart, setVerifyingStart] = useState(false);

  // Real-time Checklist States
  const [qrScanned, setQrScanned] = useState(false);
  const [participantValidated, setParticipantValidated] = useState(false);
  const [mobileStreamConnected, setMobileStreamConnected] = useState(false);
  const [mobileCameraReady, setMobileCameraReady] = useState(false);
  const [isFullyVerified, setIsFullyVerified] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Media & Sockets
  const [remoteStream, setRemoteStream] = useState(null);
  const [hasReceivedFrames, setHasReceivedFrames] = useState(false);
  const [lastFrame, setLastFrame] = useState(null);
  const [isRealVideoFlowing, setIsRealVideoFlowing] = useState(false);
  const videoRef = useRef(null);
  const previewContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const pollIntervalRef = useRef(null);

  const activeToken =
    userToken ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('token') || sessionStorage.getItem('token')
      : null);

  // 1. Initiate Verification Session
  const initiateSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/assessment-verification/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({
          assessmentType,
          assessmentId,
          attemptId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize verification session');
      }

      setSessionData(data);
      if (data.status === 'PAIRED' || data.status === 'VERIFIED' || data.mobileVerified) {
        setQrScanned(true);
        setParticipantValidated(true);
      }
      if (data.mobileVerified) {
        setMobileStreamConnected(true);
        setMobileCameraReady(true);
        setIsFullyVerified(true);
      }
      setLoading(false);
    } catch (err) {
      console.error('[AssessmentVerification] Session init error:', err);
      setError(err.message || 'Unable to connect to verification server');
      setLoading(false);
    }
  }, [assessmentType, assessmentId, attemptId, activeToken]);

  useEffect(() => {
    initiateSession();
  }, [initiateSession]);

  // 2. Real-time Countdown Timer
  useEffect(() => {
    if (!sessionData?.expiresAt) return;
    const target = new Date(sessionData.expiresAt).getTime();

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionData?.expiresAt]);

  const isExpired = (timeLeft <= 0 && !loading && sessionData) || sessionData?.status === 'EXPIRED';

  // 3. WebRTC Peer Connection
  const getOrCreatePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    console.log('[WebRTC Laptop] Initializing RTCPeerConnection with STUN servers');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      console.log('[WebRTC Laptop] ontrack event fired! Tracks:', event.tracks, 'Streams:', event.streams);
      let stream = event.streams && event.streams[0];
      if (!stream) {
        stream = new MediaStream([event.track]);
      }
      setRemoteStream(stream);
      setQrScanned(true);
      setParticipantValidated(true);
      setMobileStreamConnected(true);
      setMobileCameraReady(true);
      setIsFullyVerified(true);
      setIsDisconnected(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => console.log('[WebRTC Laptop] Video playback started successfully'))
            .catch((e) => console.warn('[WebRTC Laptop] Video play promise error:', e));
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.connected) {
        console.log('[WebRTC Laptop] Emitting ICE candidate:', event.candidate.candidate?.slice(0, 30));
        socketRef.current.emit('assessment_verif:ice-candidate', {
          sessionId: sessionData?.sessionId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC Laptop] Connection State changed:', pc.connectionState);
      const state = pc.connectionState;
      if (state === 'connected') {
        setIsDisconnected(false);
        setMobileStreamConnected(true);
        setMobileCameraReady(true);
      } else if (state === 'disconnected' || state === 'failed') {
        console.warn('[WebRTC Laptop] Connection disconnected or failed; fallback frame relay active');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC Laptop] ICE Connection State:', pc.iceConnectionState);
    };

    pc.onsignalingstatechange = () => {
      console.log('[WebRTC Laptop] Signaling State:', pc.signalingState);
    };

    return pc;
  }, [sessionData?.sessionId]);

  // 4. Socket.IO Synchronization
  useEffect(() => {
    if (!sessionData?.sessionId) return;

    const wsUrl = BACKEND_ORIGIN || window.location.origin;
    console.log('[AssessmentVerification] Connecting to socket:', wsUrl, 'session:', sessionData.sessionId);
    const socket = io(wsUrl, {
      auth: { token: activeToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[AssessmentVerification] Laptop socket connected:', socket.id);
      socket.emit('assessment_verif:join', {
        sessionId: sessionData.sessionId,
        role: 'laptop',
      });
    });

    socket.on('assessment_verif:mobile_joined', () => {
      console.log('[AssessmentVerification] Mobile device paired & joined room');
      setQrScanned(true);
      setParticipantValidated(true);
      setIsDisconnected(false);
      getOrCreatePeerConnection();
    });

    socket.on('assessment_verif:offer', async ({ offer, fromSocketId }) => {
      try {
        console.log('[WebRTC Laptop] Received offer from mobile socket:', fromSocketId);
        setQrScanned(true);
        setParticipantValidated(true);
        const pc = getOrCreatePeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('[WebRTC Laptop] Set remote description successfully');

        // Process any queued candidates
        if (candidateQueueRef.current.length > 0) {
          console.log(`[WebRTC Laptop] Flushing ${candidateQueueRef.current.length} queued ICE candidates`);
          for (const cand of candidateQueueRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          candidateQueueRef.current = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('[WebRTC Laptop] Created answer, emitting to mobile');

        socket.emit('assessment_verif:answer', {
          sessionId: sessionData.sessionId,
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        });
      } catch (err) {
        console.error('[WebRTC Laptop] Offer handling error:', err);
      }
    });

    socket.on('assessment_verif:ice-candidate', async ({ candidate }) => {
      try {
        const pc = getOrCreatePeerConnection();
        if (pc && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            console.log('[WebRTC Laptop] Queuing early ICE candidate');
            candidateQueueRef.current.push(candidate);
          }
        }
      } catch (err) {
        console.warn('[WebRTC Laptop] Candidate error:', err);
      }
    });

    socket.on('assessment_verif:frame', ({ frame }) => {
      if (frame) {
        setLastFrame(frame);
        setHasReceivedFrames(true);
        setQrScanned(true);
        setParticipantValidated(true);
        setMobileStreamConnected(true);
        setMobileCameraReady(true);
        setIsFullyVerified(true);
        setIsDisconnected(false);
      }
    });

    socket.on('assessment_verif:mobile_status', (data) => {
      console.log('[AssessmentVerification] Mobile status update:', data);
      if (data.connected || data.mobileVerified) {
        setQrScanned(true);
        setParticipantValidated(true);
        setMobileStreamConnected(true);
        setMobileCameraReady(true);
        setIsFullyVerified(true);
        setIsDisconnected(false);
      } else {
        setIsDisconnected(true);
      }
    });

    socket.on('assessment_verif:stream_status', (data) => {
      console.log('[AssessmentVerification] Stream status update:', data);
      if (data.streaming) {
        setQrScanned(true);
        setParticipantValidated(true);
        setMobileStreamConnected(true);
        setMobileCameraReady(true);
        setIsFullyVerified(true);
        setIsDisconnected(false);
      }
    });

    socket.on('assessment_verif:unlocked', () => {
      console.log('[AssessmentVerification] Session unlocked event received');
      setQrScanned(true);
      setParticipantValidated(true);
      setMobileStreamConnected(true);
      setMobileCameraReady(true);
      setIsFullyVerified(true);
      setIsDisconnected(false);
    });

    return () => {
      socket.disconnect();
      if (pcRef.current) {
        try { pcRef.current.close(); } catch (e) {}
        pcRef.current = null;
      }
    };
  }, [sessionData?.sessionId, activeToken, getOrCreatePeerConnection]);

  // 5. Polling Fallback
  useEffect(() => {
    if (!sessionData?.sessionId || isFullyVerified) return;

    const pollStatus = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/assessment-verification/status/${sessionData.sessionId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
            },
          }
        );
        const data = await res.json();
        if (data.success) {
          if (data.status === 'PAIRED' || data.status === 'VERIFIED' || data.mobileVerified) {
            setQrScanned(true);
            setParticipantValidated(true);
          }
          if (data.mobileVerified || data.status === 'VERIFIED') {
            setMobileStreamConnected(true);
            setMobileCameraReady(true);
            setIsFullyVerified(true);
            setIsDisconnected(false);
          }
        }
      } catch (e) {}
    };

    pollIntervalRef.current = setInterval(pollStatus, 1500);
    return () => clearInterval(pollIntervalRef.current);
  }, [sessionData?.sessionId, isFullyVerified, activeToken]);

  // Video attachment
  useEffect(() => {
    if (remoteStream && videoRef.current) {
      if (videoRef.current.srcObject !== remoteStream) {
        videoRef.current.srcObject = remoteStream;
      }
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => console.warn('[WebRTC Laptop] Play error:', e));
      }
    }
  }, [remoteStream]);

  // 6. Refresh QR Helper
  const handleRefreshQr = async () => {
    if (!sessionData?.sessionId || refreshing) return;
    try {
      setRefreshing(true);
      const res = await fetch(`${API_BASE}/assessment-verification/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({ sessionId: sessionData.sessionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to refresh QR code');
      }
      setSessionData(data);
      setQrScanned(false);
      setParticipantValidated(false);
      setMobileStreamConnected(false);
      setMobileCameraReady(false);
      setIsFullyVerified(false);
      setIsDisconnected(false);
      setRemoteStream(null);
      if (pcRef.current) {
        try { pcRef.current.close(); } catch (e) {}
        pcRef.current = null;
      }
    } catch (err) {
      setError(err.message || 'Unable to refresh QR code');
    } finally {
      setRefreshing(false);
    }
  };

  // 7. Copy Helpers
  const handleCopySessionId = () => {
    if (!sessionData?.sessionId) return;
    navigator.clipboard?.writeText(sessionData.sessionId);
    setCopiedSessionId(true);
    setTimeout(() => setCopiedSessionId(false), 2000);
  };

  // 8. Fullscreen Video Helper
  const toggleFullscreenVideo = () => {
    if (!previewContainerRef.current) return;
    if (!document.fullscreenElement) {
      previewContainerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreenVideo(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreenVideo(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreenVideo(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 9. Start / Resume Quiz Action
  const handleStartAssessment = async () => {
    try {
      setVerifyingStart(true);
      setError(null);

      const res = await fetch(`${API_BASE}/assessment-verification/verify-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({
          assessmentType,
          assessmentId,
          attemptId,
          sessionId: sessionData?.sessionId,
          token: sessionData?.token,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Verification check failed on server');
      }

      onVerified?.(data.data);
    } catch (err) {
      setError(err.message || 'Verification could not be confirmed');
      setVerifyingStart(false);
    }
  };

  const mobilePairUrl = buildAssessmentMobileUrl(sessionData?.qrPayload?.shortUrl);
  const typeLabel = assessmentType === 'CODING' ? 'CODING ASSESSMENT' : 'AI QUIZ';
  const startButtonLabel = assessmentType === 'CODING' ? 'Start / Resume Coding Assessment →' : 'Start / Resume Quiz →';

  const allChecksPassed =
    (isFullyVerified ||
      (qrScanned && participantValidated && mobileStreamConnected && mobileCameraReady)) &&
    !isDisconnected;
  const canStart = allChecksPassed && !isExpired;

  return (
    <div className="wi-verif-overlay">
      <div className="wi-verif-card">
        {/* ── 1. HEADER ── */}
        <div className="wi-verif-header">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-xs">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <div className="text-[9.5px] font-bold tracking-wider text-emerald-100 uppercase leading-none">
                {typeLabel} • MOBILE CAMERA VERIFICATION
              </div>
              <h2 className="text-[15px] font-bold text-white tracking-tight mt-0.5">
                Assessment Verification
              </h2>
            </div>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              title="Cancel & Close"
              className="w-6 h-6 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center transition cursor-pointer"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* ── 2. MODAL BODY ── */}
        <div className="wi-verif-body">
          {/* Assessment Identity */}
          <div className="text-center pt-0 pb-0.5 space-y-0.5">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              ASSESSMENT
            </div>
            <h3 className="text-[15px] font-bold text-slate-800 tracking-tight leading-snug">
              {assessmentTitle}
            </h3>
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 pt-0.5">
              <span className="font-bold uppercase tracking-wider text-[9.5px] text-slate-400">
                PARTICIPANT
              </span>
              <span className="font-bold text-[#059669] text-[12.5px]">
                {participantName}
              </span>
            </div>
          </div>

          {/* Token Expired / Error Alert Banner */}
          {(isExpired || error) && (
            <div className="p-2 sm:p-2.5 bg-[#fff1f2] border border-[#fecaca] rounded-xl flex items-center justify-between gap-2.5 text-left">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#ef4444] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertTriangle size={13} />
                </div>
                <div>
                  <div className="text-[11.5px] font-bold text-[#991b1b] leading-tight">
                    {error ? 'Verification Error' : 'Token expired'}
                  </div>
                  <div className="text-[10.5px] text-[#dc2626] font-medium leading-snug">
                    {error || 'This verification session has expired. Please generate a new QR code to continue.'}
                  </div>
                </div>
              </div>

              <button
                onClick={handleRefreshQr}
                disabled={refreshing}
                className="px-3 py-1 bg-white border border-[#fecaca] hover:bg-rose-50 text-[#b91c1c] text-[10.5px] font-bold rounded-full shadow-2xs flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh QR'}</span>
              </button>
            </div>
          )}

          {/* ── 3. 2-COLUMN MAIN CONTENT ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            {/* ── LEFT COLUMN: MOBILE VERIFICATION & QR CARD ── */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 flex flex-col items-center justify-between shadow-2xs">
              {/* Header with Icon */}
              <div className="flex items-start gap-2.5 text-left w-full">
                <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone size={15} />
                </div>
                <div className="space-y-0.5 flex-1">
                  <h4 className="text-[12px] font-bold text-slate-800 leading-tight">Scan with Mobile Camera</h4>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Use your registered mobile device to verify your identity and connect your camera.
                  </p>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHowToScan(!showHowToScan)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 mt-0.5 cursor-pointer"
                    >
                      <span>How to scan?</span>
                      <ExternalLink size={10} />
                    </button>

                    {showHowToScan && (
                      <div className="absolute top-5 left-0 z-30 w-68 p-2.5 bg-white border border-slate-200 rounded-xl shadow-xl text-xs text-slate-600 text-left space-y-1.5">
                        <div className="font-bold text-slate-800 flex items-center justify-between text-[11px]">
                          <span>Scanning Instructions</span>
                          <button onClick={() => setShowHowToScan(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                            <X size={11} />
                          </button>
                        </div>
                        <ol className="list-decimal pl-3.5 space-y-0.5 text-[10px] text-slate-500">
                          <li>Open your mobile camera or QR scanner.</li>
                          <li>Point it at the QR code on this screen.</li>
                          <li>Tap the link banner that appears on your phone.</li>
                          <li>Allow mobile camera access to pair live stream.</li>
                        </ol>
                        {mobilePairUrl && (
                          <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(mobilePairUrl);
                                setCopiedMobileLink(true);
                                setTimeout(() => setCopiedMobileLink(false), 2000);
                              }}
                              className="text-[9.5px] font-semibold text-emerald-700 hover:text-emerald-800 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 cursor-pointer"
                            >
                              {copiedMobileLink ? '✓ Copied' : 'Copy Mobile Link'}
                            </button>
                            <a
                              href={mobilePairUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[9.5px] font-semibold text-slate-600 hover:text-slate-800 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200"
                            >
                              Open in Tab ↗
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Centered QR Code Container */}
              <div
                className={`p-2 bg-white rounded-xl border border-slate-200/90 shadow-2xs my-1.5 flex items-center justify-center transition-all duration-200 ${
                  isExpired ? 'opacity-25 grayscale' : ''
                }`}
              >
                {loading ? (
                  <div className="w-[155px] h-[155px] flex flex-col items-center justify-center gap-1.5 text-slate-400">
                    <Loader2 size={20} className="animate-spin text-emerald-600" />
                    <span className="text-[10px] font-medium">Generating QR...</span>
                  </div>
                ) : mobilePairUrl ? (
                  <QRCodeSVG value={mobilePairUrl} size={155} level="M" />
                ) : (
                  <div className="w-[155px] h-[155px] flex items-center justify-center text-slate-400 text-[10px] font-medium">
                    QR Unavailable
                  </div>
                )}
              </div>

              {/* Expiry Timer Pill */}
              <div className="space-y-0.5 text-center">
                <div className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">
                  QR CODE EXPIRES IN
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/90 text-emerald-700 font-mono font-bold text-[10.5px] shadow-2xs">
                  <Clock size={11} className="text-emerald-600" />
                  <span>
                    {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:
                    {String(timeLeft % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Session ID */}
              <div className="w-full pt-1.5 mt-1 border-t border-slate-100/90 text-center">
                <div className="text-[8.5px] text-slate-400 font-medium leading-none">Session ID</div>
                <div className="flex items-center justify-center gap-1 text-[9.5px] font-mono text-slate-500 mt-0.5">
                  <span className="truncate max-w-[190px]">
                    {sessionData?.sessionId || `verif_quiz_${assessmentId}_att_${attemptId}_4495a4764408`}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySessionId}
                    title="Copy Session ID"
                    className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    {copiedSessionId ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: VERIFICATION STATUS & CAMERA PREVIEW ── */}
            <div className="flex flex-col justify-between space-y-2">
              {/* Verification Status Container */}
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  VERIFICATION STATUS
                </div>

                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-1 space-y-0.5">
                  {/* Row 1: QR Code Scanned & Paired */}
                  <div className="px-2 py-1 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600 shrink-0">
                        {qrScanned ? <Check size={12} strokeWidth={2.5} className="text-emerald-700" /> : <QrCode size={12} />}
                      </div>
                      <span className="font-semibold text-slate-800 text-[11px]">QR Code Scanned &amp; Paired</span>
                    </div>
                    <span
                      className={`text-[9.5px] px-2 py-0.5 rounded-full font-medium transition ${
                        qrScanned
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold'
                          : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                      }`}
                    >
                      {qrScanned ? '✓ Completed' : 'Waiting...'}
                    </span>
                  </div>

                  {/* Row 2: Participant & Attempt Validated */}
                  <div className="px-2 py-1 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600 shrink-0">
                        {participantValidated ? <Check size={12} strokeWidth={2.5} className="text-emerald-700" /> : <UserCheck size={12} />}
                      </div>
                      <span className="font-semibold text-slate-800 text-[11px]">Participant &amp; Attempt Validated</span>
                    </div>
                    <span
                      className={`text-[9.5px] px-2 py-0.5 rounded-full font-medium transition ${
                        participantValidated
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold'
                          : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                      }`}
                    >
                      {participantValidated ? '✓ Completed' : 'Waiting...'}
                    </span>
                  </div>

                  {/* Row 3: Mobile Camera Stream */}
                  <div className="px-2 py-1 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600 shrink-0">
                        {mobileStreamConnected && !isDisconnected ? <Check size={12} strokeWidth={2.5} className="text-emerald-700" /> : <Video size={12} />}
                      </div>
                      <span className="font-semibold text-slate-800 text-[11px]">Mobile Camera Stream</span>
                    </div>
                    <span
                      className={`text-[9.5px] px-2 py-0.5 rounded-full font-medium transition ${
                        mobileStreamConnected && !isDisconnected
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold'
                          : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                      }`}
                    >
                      {mobileStreamConnected && !isDisconnected ? '✓ Connected' : 'Waiting...'}
                    </span>
                  </div>

                  {/* Row 4: Mobile Camera Connected */}
                  <div className="px-2 py-1 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600 shrink-0">
                        {mobileCameraReady && !isDisconnected ? <Check size={12} strokeWidth={2.5} className="text-emerald-700" /> : <Smartphone size={12} />}
                      </div>
                      <span className="font-semibold text-slate-800 text-[11px]">Mobile Camera Connected</span>
                    </div>
                    <span
                      className={`text-[9.5px] px-2 py-0.5 rounded-full font-medium transition ${
                        mobileCameraReady && !isDisconnected
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold'
                          : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                      }`}
                    >
                      {mobileCameraReady && !isDisconnected ? '✓ Connected' : 'Waiting...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile Camera Preview Container */}
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 mt-0.5">
                  MOBILE CAMERA PREVIEW
                </div>

                <div
                  ref={previewContainerRef}
                  className="relative rounded-xl overflow-hidden bg-[#0b1329] border border-slate-800 aspect-[16/10] flex items-center justify-center shadow-inner group"
                >
                  {/* Real Live WebRTC Video */}
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (el && remoteStream && el.srcObject !== remoteStream) {
                        console.log('[WebRTC Laptop] Setting videoElement.srcObject = remoteStream, tracks:', remoteStream.getTracks());
                        el.srcObject = remoteStream;
                        el.muted = true;
                        el.playsInline = true;
                        const playPromise = el.play();
                        if (playPromise !== undefined) {
                          playPromise
                            .then(() => console.log('[WebRTC Laptop] el.play() resolved successfully'))
                            .catch((err) => console.warn('[WebRTC Laptop] el.play() error:', err));
                        }
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      console.log('[WebRTC Laptop] onLoadedMetadata -> videoWidth:', e.target.videoWidth, 'videoHeight:', e.target.videoHeight);
                      if (e.target.videoWidth > 0) setIsRealVideoFlowing(true);
                    }}
                    onPlaying={(e) => {
                      console.log('[WebRTC Laptop] onPlaying fired -> videoWidth:', e.target.videoWidth, 'videoHeight:', e.target.videoHeight);
                      if (e.target.videoWidth > 0) setIsRealVideoFlowing(true);
                    }}
                    onTimeUpdate={(e) => {
                      if (e.target.videoWidth > 0 && !isRealVideoFlowing) {
                        setIsRealVideoFlowing(true);
                      }
                    }}
                    className={`w-full h-full object-cover z-10 transition-opacity duration-200 ${
                      isRealVideoFlowing && remoteStream && !isDisconnected
                        ? 'opacity-100 block'
                        : 'opacity-0 absolute pointer-events-none'
                    }`}
                  />

                  {/* High-speed Direct Mobile Camera Frame Feed */}
                  {lastFrame && !isRealVideoFlowing && !isDisconnected && (
                    <img
                      src={lastFrame}
                      alt="Live Mobile Camera Feed"
                      className="w-full h-full object-cover block z-10"
                    />
                  )}

                  {/* Connected Overlay Badges */}
                  {(isRealVideoFlowing || lastFrame || (mobileStreamConnected && mobileCameraReady)) && !isDisconnected ? (
                    <>
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-700 text-[9px] font-mono text-emerald-400 flex items-center gap-1 z-20 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-bold text-white">LIVE</span>
                      </div>

                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-slate-950/85 backdrop-blur border border-slate-700 text-white z-20 shadow-xs flex items-center gap-1 text-[11px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Camera Connected</span>
                      </div>

                      <button
                        type="button"
                        onClick={toggleFullscreenVideo}
                        title="Toggle Fullscreen"
                        className="absolute bottom-2 right-2 w-6 h-6 rounded-lg bg-slate-950/80 hover:bg-slate-900 border border-slate-700 text-white flex items-center justify-center transition z-20 shadow-xs cursor-pointer"
                      >
                        {isFullscreenVideo ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                      </button>
                    </>
                  ) : isDisconnected ? (
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center space-y-1 z-20">
                      <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
                        <AlertTriangle size={16} />
                      </div>
                      <div className="text-[11px] font-bold text-rose-300">
                        Mobile Camera Disconnected
                      </div>
                      <p className="text-[10px] text-slate-300 max-w-xs leading-tight">
                        Assessment is locked. Reconnecting mobile camera stream automatically...
                      </p>
                      <Loader2 size={13} className="animate-spin text-emerald-400 mt-0.5" />
                    </div>
                  ) : (
                    /* Waiting Empty State matching reference */
                    <div className="p-3 flex flex-col items-center justify-center text-center space-y-1">
                      <div className="w-9 h-9 rounded-full border border-dashed border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto mb-0.5">
                        <Smartphone size={16} />
                      </div>
                      <div className="text-[11.5px] font-bold text-white">
                        Waiting for mobile camera connection
                      </div>
                      <p className="text-[9.5px] text-slate-400 max-w-[200px] leading-tight">
                        After connecting, the live camera feed will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 4. LOCKED STATUS BANNER ── */}
          <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center gap-2.5 shadow-2xs mt-0.5">
            <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Shield size={15} />
            </div>
            <div className="space-y-0.5 text-left">
              <div className="text-[11px] font-bold text-slate-800">
                Assessment is locked until verification is completed.
              </div>
              <p className="text-[9.5px] text-slate-500 leading-tight">
                Keep your mobile camera active throughout the assessment.
              </p>
            </div>
          </div>

          {/* ── 5. FOOTER ACTION BAR ── */}
          <div className="flex items-center justify-between pt-0.5 gap-2">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px]">
              <Lock size={11} className="text-slate-500" />
              <span>LOCKED</span>
            </div>

            <button
              onClick={handleStartAssessment}
              disabled={!canStart || verifyingStart}
              className={`px-4 py-1.5 rounded-lg font-bold text-[11.5px] transition duration-150 flex items-center gap-1 shadow-xs ${
                canStart && !verifyingStart
                  ? 'bg-[#056d53] hover:bg-emerald-700 text-white shadow-emerald-700/20 active:scale-[0.98] cursor-pointer'
                  : 'bg-emerald-100/70 text-emerald-700/60 border border-emerald-200/90 cursor-not-allowed'
              }`}
            >
              {verifyingStart ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <>
                  <span>{startButtonLabel}</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </div>

          {/* ── 6. FOOTER HELPER TEXT ── */}
          <div className="text-center text-[10px] text-slate-400 font-medium pt-0.5">
            Complete all verification steps to unlock.
          </div>
        </div>
      </div>
    </div>
  );
}
