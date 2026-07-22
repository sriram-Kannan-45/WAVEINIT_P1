import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../../../hooks/useSocket';

export function useInterviewSocket(interviewId, userId) {
  const { socket, isConnected } = useSocket();
  const handlersRef = useRef({});

  useEffect(() => {
    if (!socket || !interviewId || !userId) return;
    
    socket.emit('interview:join', { interviewId, userId });
    
    return () => {
      socket.emit('interview:leave', { interviewId, userId });
    };
  }, [socket, interviewId, userId]);

  const on = useCallback((event, handler) => {
    if (!socket) return;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket]);

  const emit = useCallback((event, data) => {
    if (socket) socket.emit(event, data);
  }, [socket]);

  return {
    socket,
    isConnected,
    on,
    emit,
    // Convenience emitters
    sendOffer: (target, sdp) => emit('interview:offer', { interviewId, target, sdp, from: userId }),
    sendAnswer: (target, sdp) => emit('interview:answer', { interviewId, target, sdp, from: userId }),
    sendIceCandidate: (target, candidate) => emit('interview:ice-candidate', { interviewId, target, candidate, from: userId }),
    sendChat: (content) => emit('interview:chat-send', { interviewId, senderId: userId, content }),
    sendTyping: (userName) => emit('interview:chat-typing', { interviewId, userId, userName }),
    sendScreenShareStatus: (isSharing) => emit('interview:screen-share', { interviewId, userId, isSharing }),
    sendMobileStatus: (action, deviceToken) => emit('interview:mobile-camera', { interviewId, userId, action, deviceToken }),
    sendWhiteboard: (action, data) => emit('interview:whiteboard', { interviewId, userId, action, data }),
    sendRaiseHand: (userName) => emit('interview:raise-hand', { interviewId, userId, userName }),
    sendViolation: (type, message, metadata) => emit('interview:violation', { interviewId, userId, type, message, metadata }),
    sendHeartbeat: () => emit('interview:heartbeat', { interviewId, userId }),
    forceTerminate: (targetUserId, reason) => emit('interview:force-terminate', { interviewId, targetUserId, reason }),
  };
}
