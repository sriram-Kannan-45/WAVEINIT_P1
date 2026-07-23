import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTC(localStream, socketHandlers) {
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());

  const createPeerConnection = useCallback((peerId, isInitiator) => {
    if (peerConnectionsRef.current.has(peerId)) {
      peerConnectionsRef.current.get(peerId).close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(peerId, pc);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(peerId, event.streams[0]);
        return next;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketHandlers?.sendIceCandidate?.(peerId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(peerId);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socketHandlers?.sendOffer?.(peerId, pc.localDescription);
        })
        .catch(err => console.error('Error creating offer:', err));
    }

    return pc;
  }, [localStream, socketHandlers]);

  const handleOffer = useCallback(async (fromId, sdp) => {
    let pc = peerConnectionsRef.current.get(fromId);
    if (!pc) {
      pc = createPeerConnection(fromId, false);
    }
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketHandlers?.sendAnswer?.(fromId, pc.localDescription);
  }, [createPeerConnection, socketHandlers]);

  const handleAnswer = useCallback(async (fromId, sdp) => {
    const pc = peerConnectionsRef.current.get(fromId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const candidates = pendingCandidatesRef.current.get(fromId) || [];
      for (const c of candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidatesRef.current.delete(fromId);
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromId, candidate) => {
    const pc = peerConnectionsRef.current.get(fromId);
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      if (!pendingCandidatesRef.current.has(fromId)) {
        pendingCandidatesRef.current.set(fromId, []);
      }
      pendingCandidatesRef.current.get(fromId).push(candidate);
    }
  }, []);

  const removePeer = useCallback((peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    pendingCandidatesRef.current.delete(peerId);
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => {
        stopScreenShare();
      };

      setScreenShareStream(screenStream);
      setIsScreenSharing(true);

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, screenStream);
        }
      });

      return screenStream;
    } catch (err) {
      console.error('Screen share failed:', err);
      return null;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenShareStream) {
      screenShareStream.getTracks().forEach(t => t.stop());
    }

    const cameraTrack = localStream?.getVideoTracks()[0];
    if (cameraTrack) {
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(cameraTrack);
        }
      });
    }

    setScreenShareStream(null);
    setIsScreenSharing(false);
  }, [screenShareStream, localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  const cleanup = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    setRemoteStreams(new Map());
    if (screenShareStream) {
      screenShareStream.getTracks().forEach(t => t.stop());
    }
    setScreenShareStream(null);
    setIsScreenSharing(false);
  }, [screenShareStream]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    remoteStreams,
    screenShareStream,
    isScreenSharing,
    toggleScreenShare,
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    removePeer,
    cleanup,
    peerConnections: peerConnectionsRef.current,
  };
}
