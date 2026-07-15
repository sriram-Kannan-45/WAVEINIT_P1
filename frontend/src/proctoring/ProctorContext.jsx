/**
 * ProctorContext — single source of truth for the participant-side
 * proctoring state machine.
 *
 * Hardening (production):
 *  - Never fires an API call until the auth user id is known
 *    (prevents the "WHERE participant_id has invalid undefined value" bug).
 *  - Normalises server errors into human-readable messages.
 *  - Debounces violation reports (1.5s per type) to avoid hammering.
 *  - Server is the source of truth for warnings, exits, and endsAt.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { proctorApi } from './api';
import useAuthUser from './hooks/useAuthUser';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import { HEARTBEAT_INTERVAL_MS, VIOLATION_LABELS, STUN_SERVERS } from './constants';
import { captureFrame } from '../utils/captureFrame';

const ProctorContext = createContext(null);

function humanise(err) {
  if (!err) return null;
  const msg = err.message || 'Something went wrong';
  // Map known server codes to friendly text
  if (err.code === 'AUTH_USER_ID_MISSING') return 'Your session has expired — please sign in again.';
  if (err.code === 'NETWORK_ERROR') return 'Network error — please check your connection.';
  // Sequelize raw errors that shouldn't be exposed
  if (/has invalid "undefined" value/i.test(msg)) {
    return 'We could not load your account — please refresh and sign in again.';
  }
  return msg;
}

// Module-level variable to persist screen share stream across route/provider recreation in SPA
let globalScreenStream = null;

export function ProctorProvider({ children }) {
  const { userId, ready: authReady } = useAuthUser();
  const [session, setSession] = useState(null);
  const [lastWarning, setLastWarning] = useState(null);
  const [error, setError] = useState(null);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [violationLog, setViolationLog] = useState([]);
  const [proctorStream, setProctorStream] = useState(null);
  const [screenStream, setScreenStreamState] = useState(globalScreenStream);

  const setScreenStream = useCallback((stream) => {
    globalScreenStream = stream;
    setScreenStreamState(stream);
  }, []);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectionCountdown, setReconnectionCountdown] = useState(null);
  const [trainerMessages, setTrainerMessages] = useState([]);
  const lastReportRef = useRef(new Map());
  const reconnectionTimerRef = useRef(null);
  const viewerPcsRef = useRef(new Map()); // Map<viewerId, RTCPeerConnection>
  const pendingViewersRef = useRef(new Set()); // trainers waiting for a screen share
  const prevScreenStreamRef = useRef(null);
  const { socket } = useSocket();

  // Clean up reconnection timer
  useEffect(() => () => {
    if (reconnectionTimerRef.current) clearInterval(reconnectionTimerRef.current);
  }, []);

  // Resume any active session — only after auth is ready and we have a userId
  useEffect(() => {
    if (!authReady || !userId) return;
    let alive = true;
    proctorApi.getActiveSession().then(s => {
      if (alive && s) setSession(s);
    }).catch((e) => { /* don't block UI for this background fetch */ });
    return () => { alive = false; };
  }, [authReady, userId]);

  // Heartbeat — REST + socket every HEARTBEAT_INTERVAL_MS while ACTIVE
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;
    const id = setInterval(() => {
      proctorApi.heartbeat(session.sessionId, session.sessionToken).catch(() => {});
      socket?.emit('proctor:heartbeat', { sessionId: session.sessionId });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [session?.sessionId, session?.sessionToken, session?.status, socket]);

  // Periodic screen capture uploads (every 30 seconds)
  useEffect(() => {
    if (!socket || !session || session.status !== 'ACTIVE' || !screenStream) return;

    const captureInterval = setInterval(async () => {
      try {
        const dataUrl = await captureFrame(screenStream, 0.4);
        if (dataUrl) {
          socket.emit('proctor:screen-frame', {
            sessionId: session.sessionId,
            imageBase64: dataUrl,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.warn('Screen capture failed', err);
      }
    }, 30000);

    return () => clearInterval(captureInterval);
  }, [socket, session?.sessionId, session?.status, screenStream]);

  // Join session room as soon as we have a session, and re-join when socket reconnects
  useEffect(() => {
    if (!socket || !session?.sessionId) return;

    const handleJoin = () => {
      console.log('[ProctorContext] Joining proctor room...');
      socket.emit('proctor:join', { sessionId: session.sessionId }, (ack) => {
        if (ack?.session) setSession(prev => ({ ...prev, ...ack.session }));
        // If screen sharing was already active, notify trainers immediately after re-joining
        if (screenStream) {
          console.log('[ProctorContext] Re-notifying screen stream availability after join');
          socket.emit('proctor:stream-available', { sessionId: session.sessionId });
        }
      });
    };

    if (socket.connected) {
      handleJoin();
    }

    socket.on('connect', handleJoin);
    return () => {
      socket.off('connect', handleJoin);
    };
  }, [socket, session?.sessionId, screenStream]);


  // Server-pushed forced termination
  useSocketEvent('proctor:terminated', (msg) => {
    setSession(prev => prev ? { ...prev, status: 'TERMINATED', terminationReason: msg?.reason } : prev);
  }, []);

  useSocketEvent('proctor:warning', (msg) => {
    setLastWarning({ ...msg, at: Date.now() });
  }, []);

  useSocketEvent('proctor:multipleLogin', () => {
    setSession(prev => prev ? {
      ...prev, status: 'TERMINATED', terminationReason: 'Logged in from another device',
    } : prev);
  }, []);

  // ── Grace period reconnection ──────────────────────────────────────────
  useSocketEvent('proctor:reconnected', (msg) => {
    if (msg?.session) {
      setSession(prev => ({ ...prev, ...msg.session }));
      setIsReconnecting(false);
      setReconnectionCountdown(null);
      if (reconnectionTimerRef.current) clearInterval(reconnectionTimerRef.current);
    }
  }, []);

  // ── Trainer message ────────────────────────────────────────────────────
  useSocketEvent('proctor:trainerMessage', (msg) => {
    if (msg?.message) {
      setTrainerMessages(prev => [...prev, { ...msg, id: Date.now() }]);
      setLastWarning({ type: 'TRAINER_WARNING', message: msg.message, at: Date.now() });
    }
  }, []);

  // ── WebRTC helpers ─────────────────────────────────────────────────────
  const closePeerConnection = useCallback((viewerId) => {
    const pc = viewerPcsRef.current.get(viewerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      viewerPcsRef.current.delete(viewerId);
    }
  }, []);

  const createPeerConnectionForViewer = useCallback(async (viewerId) => {
    if (!socket || !session?.sessionId) return;
    const screen = screenStream;
    const webcam = proctorStream;
    if (!screen) {
      console.warn('[ProctorContext] Cannot create peer connection without screen stream');
      return;
    }
    if (viewerPcsRef.current.has(viewerId)) return;

    console.log('[ProctorContext] Creating WebRTC connection for trainer', viewerId);
    try {
      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
      viewerPcsRef.current.set(viewerId, pc);

      screen.getTracks().forEach(track => pc.addTrack(track, screen));
      if (webcam) {
        webcam.getTracks().forEach(track => pc.addTrack(track, webcam));
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[ProctorContext] Sending ICE candidate to trainer', viewerId);
          socket.emit('proctor:ice-candidate', {
            sessionId: session.sessionId,
            viewerId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[ProctorContext] ICE connection state for', viewerId, ':', pc.iceConnectionState);
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
          closePeerConnection(viewerId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[ProctorContext] Sending WebRTC offer to trainer', viewerId);
      socket.emit('proctor:webrtc-offer', {
        sessionId: session.sessionId,
        viewerId,
        sdp: pc.localDescription,
      });
    } catch (err) {
      console.warn('[ProctorContext] WebRTC offer creation failed for', viewerId, err);
      closePeerConnection(viewerId);
    }
  }, [socket, session?.sessionId, screenStream, proctorStream, closePeerConnection]);

  // Clean WebRTC connections when the socket disconnects
  useEffect(() => {
    if (!socket) return;
    const handleDisconnect = () => {
      console.log('[ProctorContext] Socket disconnected; closing all WebRTC connections');
      viewerPcsRef.current.forEach((pc, viewerId) => closePeerConnection(viewerId));
      pendingViewersRef.current.clear();
    };
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, closePeerConnection]);

  // ── WebRTC: observe-request from trainer (participant side) ────────────
  useSocketEvent('proctor:observe-request', ({ sessionId, viewerId }) => {
    if (!socket) return;
    pendingViewersRef.current.add(viewerId);
    createPeerConnectionForViewer(viewerId);
  }, [socket, createPeerConnectionForViewer]);

  // ── WebRTC: answer from trainer ────────────────────────────────────────
  useSocketEvent('proctor:webrtc-answer', ({ sessionId, viewerId, sdp }) => {
    console.log('[ProctorContext] WebRTC answer received from trainer');
    const pc = viewerPcsRef.current.get(viewerId);
    if (!pc) return;
    try {
      pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[ProctorContext] Remote description set');
    } catch (err) {
      console.warn('[ProctorContext] WebRTC setRemote failed', err);
    }
  }, []);

  // ── WebRTC: ICE candidate from trainer ─────────────────────────────────
  useSocketEvent('proctor:ice-candidate', ({ sessionId, viewerId, candidate }) => {
    console.log('[ProctorContext] ICE candidate received from trainer');
    const pc = viewerPcsRef.current.get(viewerId);
    if (!pc || !candidate) return;
    try {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[ProctorContext] ICE candidate added');
    } catch (err) {
      console.warn('[ProctorContext] WebRTC addIceCandidate failed', err);
    }
  }, []);

  // ── WebRTC: unobserve-request from trainer ─────────────────────────────
  useSocketEvent('proctor:unobserve-request', ({ sessionId, viewerId }) => {
    pendingViewersRef.current.delete(viewerId);
    closePeerConnection(viewerId);
  }, [closePeerConnection]);

  // ── Shared cleanup helper: stop tracks, close peer connections, notify trainers ─
  const cleanupScreenShare = useCallback((opts = {}) => {
    const { emitEnded = true } = opts;

    // Stop all media tracks to release the display capture.
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }

    // Close every trainer peer connection.
    viewerPcsRef.current.forEach((pc, viewerId) => closePeerConnection(viewerId));
    pendingViewersRef.current.clear();

    // Notify trainers that the stream has ended.
    if (emitEnded && socket && session?.sessionId) {
      socket.emit('proctor:stream-ended', { sessionId: session.sessionId });
    }

    setScreenStream(null);
  }, [screenStream, socket, session?.sessionId, closePeerConnection, setScreenStream]);



  // ── Auto-publish screen share when the stream becomes available ────────
  useEffect(() => {
    if (!socket || !session?.sessionId) return;
    if (!screenStream) {
      // Stream was stopped — run full cleanup once.
      if (prevScreenStreamRef.current) {
        cleanupScreenShare();
      }
      prevScreenStreamRef.current = null;
      return;
    }
    // Only act on a brand-new stream object (start or restart).
    if (prevScreenStreamRef.current === screenStream) return;
    prevScreenStreamRef.current = screenStream;

    console.log('[ProctorContext] Screen stream available; notifying trainers');
    socket.emit('proctor:stream-available', { sessionId: session.sessionId });

    // Create peer connections for every trainer who has already requested to observe.
    pendingViewersRef.current.forEach(viewerId => {
      createPeerConnectionForViewer(viewerId);
    });
  }, [socket, session?.sessionId, screenStream, createPeerConnectionForViewer, cleanupScreenShare]);

  // ── Clean up on page unload so trainers see stream-ended immediately ───
  useEffect(() => {
    if (!session?.sessionId) return;
    const onBeforeUnload = () => {
      if (screenStream) {
        socket?.emit('proctor:stream-ended', { sessionId: session.sessionId });
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [socket, session?.sessionId, screenStream]);

  const start = useCallback(async ({ quizId, assessmentId, attemptId, fingerprintHash, screenSharing, assessmentType = 'quiz' }) => {
    setError(null);
    if (!authReady) {
      const err = new Error('Authentication still loading — please wait a moment');
      setError(err); throw err;
    }
    if (!userId) {
      const err = new Error('Please sign in again before starting the exam');
      err.code = 'AUTH_USER_ID_MISSING';
      setError(err); throw err;
    }
    const id = quizId || assessmentId;
    if (!id) {
      const err = new Error('Quiz/Assessment id missing');
      setError(err); throw err;
    }
    try {
      const s = await proctorApi.startSession({ quizId: id, attemptId, fingerprintHash, screenSharing, assessmentType });
      setSession(s);
      return s;
    } catch (e) {
      e.message = humanise(e) || e.message;
      setError(e);
      throw e;
    }
  }, [authReady, userId]);

  const activate = useCallback(async (sId, sToken) => {
    const id = sId || session?.sessionId;
    const token = sToken || session?.sessionToken;
    if (!id) return;
    const s = await proctorApi.activate(id, token);
    setSession(prev => ({ ...prev, ...s }));
    return s;
  }, [session]);

  const submit = useCallback(async (sId, sToken) => {
    const id = sId || session?.sessionId;
    const token = sToken || session?.sessionToken;
    if (!id) return;
    const s = await proctorApi.submit(id, token);
    setSession(prev => ({ ...prev, ...s }));
    return s;
  }, [session]);

  const terminate = useCallback(async (reason, sId, sToken) => {
    const id = sId || session?.sessionId;
    const token = sToken || session?.sessionToken;
    if (!id) return;
    const s = await proctorApi.terminate(id, token, reason);
    setSession(prev => ({ ...prev, ...s }));
    return s;
  }, [session]);

  const report = useCallback((type, message, metadata, sId, sToken) => {
    const id = sId || session?.sessionId;
    const token = sToken || session?.sessionToken;
    if (!id) return;
    const now = Date.now();
    const last = lastReportRef.current.get(type) || 0;
    if (now - last < 1500) return;
    lastReportRef.current.set(type, now);

    const logMsg = message || VIOLATION_LABELS[type];
    setLastWarning({ type, message: logMsg, at: now });

    setViolationLog(prev => [
      ...prev,
      { type, timestamp: now, meta: metadata || {} }
    ]);

    socket?.emit('proctor:violation', {
      sessionId: id, type, message, metadata,
    });
    proctorApi.recordViolation(id, token, {
      type, message, metadata,
    }).then(({ session: srv, terminated }) => {
      if (srv) setSession(prev => ({ ...prev, ...srv }));
      if (terminated) setSession(prev => prev && { ...prev, status: 'TERMINATED' });
    }).catch(() => {});
  }, [session, socket]);

  // ── Track ended event listener (to handle browser bar stops during exam) ─
  useEffect(() => {
    if (!screenStream) return;

    const handleEnded = () => {
      console.log('[ProctorContext] Screen share track ended (user stopped via browser)');
      report('SCREEN_SHARE_STOPPED', 'Screen sharing was stopped.');
      cleanupScreenShare();
    };

    const tracks = screenStream.getVideoTracks();
    tracks.forEach(track => track.addEventListener('ended', handleEnded));

    return () => {
      tracks.forEach(track => track.removeEventListener('ended', handleEnded));
    };
  }, [screenStream, report, cleanupScreenShare]);

  const pushState = useCallback((flags) => {
    if (!session || !socket) return;
    socket.emit('proctor:state', { sessionId: session.sessionId, ...flags });
  }, [session, socket]);

  const reset = useCallback(() => {
    cleanupScreenShare();
    setSession(null); setLastWarning(null); setError(null);
    setCameraGranted(false); setMicGranted(false); setViolationLog([]);
    lastReportRef.current.clear();
  }, [cleanupScreenShare]);

  const value = useMemo(() => ({
    session,
    userId,
    authReady,
    warningsCount: session?.warningsCount || 0,
    fullscreenExits: session?.fullscreenExits || 0,
    isActive: session?.status === 'ACTIVE',
    isPending: session?.status === 'PENDING',
    isTerminated: ['TERMINATED', 'EXPIRED'].includes(session?.status),
    isSubmitted: session?.status === 'SUBMITTED',
    isLocked: ['TERMINATED', 'EXPIRED'].includes(session?.status) || session?.isLocked || false,
    error,
    errorMessage: humanise(error),
    lastWarning,
    cameraGranted,
    setCameraGranted,
    micGranted,
    setMicGranted,
    violationLog,
    setViolationLog,
    proctorStream,
    setProctorStream,
    screenStream,
    setScreenStream,
    isReconnecting,
    reconnectionCountdown,
    trainerMessages,
    // Category violation counters synced from session view
    fullscreenViolations: session?.fullscreenViolations || 0,
    tabSwitchViolations: session?.tabSwitchViolations || 0,
    screenshotViolations: session?.screenshotViolations || 0,
    devToolsViolations: session?.devToolsViolations || 0,
    windowBlurViolations: session?.windowBlurViolations || 0,
    start, activate, submit, terminate, report, pushState, reset,
  }), [
    session, userId, authReady, error, lastWarning, cameraGranted, micGranted,
    violationLog, proctorStream, screenStream, setScreenStream, isReconnecting, reconnectionCountdown, trainerMessages,
    start, activate, submit, terminate, report, pushState, reset,
  ]);

  return (
    <ProctorContext.Provider value={value}>
      {children}
    </ProctorContext.Provider>
  );
}

export function useProctor() {
  const ctx = useContext(ProctorContext);
  if (!ctx) {
    throw new Error('useProctor must be used inside <ProctorProvider>');
  }
  return ctx;
}
