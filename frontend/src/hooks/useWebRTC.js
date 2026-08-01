/**
 * useWebRTC Hook
 * Manages RTCPeerConnection lifecycle for interview sessions.
 * Handles offer/answer/ICE exchange, screen share, and reconnection.
 */
import { useRef, useCallback, useEffect, useState } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Production: add TURN server here
  // { urls: 'turn:your-turn-server.com:3478', username: '...', credential: '...' },
]

const ICE_RECONNECT_DELAY = 2000

export function useWebRTC(socket, interviewId, localStreams) {
  const peerConnections = useRef(new Map()) // socketId → RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({})
  const [connectionStates, setConnectionStates] = useState({})
  const pendingCandidates = useRef(new Map()) // socketId → candidates[]
  const reconnectTimers = useRef(new Map())

  const getOrCreatePeer = useCallback((peerSocketId, localStream) => {
    if (peerConnections.current.has(peerSocketId)) {
      return peerConnections.current.get(peerSocketId)
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream)
      })
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          interviewId,
          targetSocketId: peerSocketId,
          candidate: event.candidate,
        })
      }
    }

    // Connection state
    pc.onconnectionstatechange = () => {
      setConnectionStates(prev => ({ ...prev, [peerSocketId]: pc.connectionState }))

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Attempt ICE restart after delay
        const timer = setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            pc.restartIce()
            if (socket) {
              socket.emit('ice-restart', { targetSocketId: peerSocketId })
            }
          }
        }, ICE_RECONNECT_DELAY)
        reconnectTimers.current.set(peerSocketId, timer)
      }
    }

    // Remote stream
    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (stream) {
        setRemoteStreams(prev => ({ ...prev, [peerSocketId]: stream }))
      }
    }

    peerConnections.current.set(peerSocketId, pc)
    return pc
  }, [socket, interviewId])

  const createOffer = useCallback(async (peerSocketId) => {
    const localStream = localStreams?.laptop
    const pc = getOrCreatePeer(peerSocketId, localStream)

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      if (socket) {
        socket.emit('offer', {
          interviewId,
          targetSocketId: peerSocketId,
          offer: pc.localDescription,
        })
      }
    } catch (err) {
      console.error('Error creating offer:', err)
    }
  }, [getOrCreatePeer, socket, interviewId, localStreams])

  const handleOffer = useCallback(async (fromSocketId, offer) => {
    const localStream = localStreams?.laptop
    const pc = getOrCreatePeer(fromSocketId, localStream)

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      if (socket) {
        socket.emit('answer', {
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        })
      }

      // Process any pending ICE candidates
      const pending = pendingCandidates.current.get(fromSocketId) || []
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingCandidates.current.delete(fromSocketId)
    } catch (err) {
      console.error('Error handling offer:', err)
    }
  }, [getOrCreatePeer, socket, localStreams])

  const handleAnswer = useCallback(async (fromSocketId, answer) => {
    const pc = peerConnections.current.get(fromSocketId)
    if (!pc) return

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))

      // Process pending candidates
      const pending = pendingCandidates.current.get(fromSocketId) || []
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingCandidates.current.delete(fromSocketId)
    } catch (err) {
      console.error('Error handling answer:', err)
    }
  }, [])

  const handleIceCandidate = useCallback(async (fromSocketId, candidate) => {
    const pc = peerConnections.current.get(fromSocketId)
    if (!pc) {
      // Queue for later
      if (!pendingCandidates.current.has(fromSocketId)) {
        pendingCandidates.current.set(fromSocketId, [])
      }
      pendingCandidates.current.get(fromSocketId).push(candidate)
      return
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      console.error('Error adding ICE candidate:', err)
    }
  }, [])

  const replaceTrack = useCallback((peerSocketId, newTrack, kind) => {
    const pc = peerConnections.current.get(peerSocketId)
    if (!pc) return

    const sender = pc.getSenders().find(s => s.track?.kind === kind)
    if (sender) {
      sender.replaceTrack(newTrack)
    }
  }, [])

  const addLocalTrack = useCallback((track, stream) => {
    for (const [peerSocketId, pc] of peerConnections.current) {
      pc.addTrack(track, stream)
    }
  }, [])

  const removeLocalTrack = useCallback((track) => {
    for (const [peerSocketId, pc] of peerConnections.current) {
      const sender = pc.getSenders().find(s => s.track === track)
      if (sender) {
        pc.removeTrack(sender)
      }
    }
  }, [])

  const closeAll = useCallback(() => {
    for (const [id, pc] of peerConnections.current) {
      pc.close()
    }
    peerConnections.current.clear()
    for (const timer of reconnectTimers.current.values()) {
      clearTimeout(timer)
    }
    reconnectTimers.current.clear()
    setRemoteStreams({})
    setConnectionStates({})
  }, [])

  useEffect(() => {
    return () => closeAll()
  }, [closeAll])

  return {
    remoteStreams,
    connectionStates,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    replaceTrack,
    addLocalTrack,
    removeLocalTrack,
    closeAll,
    peerConnections: peerConnections.current,
  }
}

export default useWebRTC
