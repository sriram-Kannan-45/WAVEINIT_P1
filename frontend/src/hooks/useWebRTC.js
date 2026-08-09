/**
 * useWebRTC Hook
 * Manages RTCPeerConnection lifecycle for interview sessions.
 * Handles offer/answer/ICE exchange, screen share, and reconnection.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Production: add TURN server here
  // { urls: 'turn:your-turn-server.com:3478', username: '...', credential: '...' },
]

const ICE_RECONNECT_DELAY = 2000

export function useWebRTC(socket, interviewId, localStreamRef) {
  const peerConnections = useRef(new Map()) // socketId → RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({})
  const [connectionStates, setConnectionStates] = useState({})
  const pendingCandidates = useRef(new Map()) // socketId → candidates[]
  const reconnectTimers = useRef(new Map())
  // Perfect-negotiation guards for SDP glare (both sides offering at once).
  const makingOffer = useRef(false)
  const isSettingRemoteAnswerPending = useRef(false)

  /**
   * Add every track of a local stream to a peer connection, skipping
   * tracks that are already attached (prevents duplicates when the same
   * stream is added more than once).
   */
  const addTracksToPeer = useCallback((pc, stream) => {
    if (!stream || !pc) return
    const attached = new Set(pc.getSenders().map(s => s.track))
    stream.getTracks().forEach(track => {
      if (track && !attached.has(track)) {
        pc.addTrack(track, stream)
      }
    })
  }, [])

  const getOrCreatePeer = useCallback((peerSocketId) => {
    if (peerConnections.current.has(peerSocketId)) {
      return peerConnections.current.get(peerSocketId)
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Attach whatever local tracks are available right now. If the stream is
    // acquired later, use addLocalStream() to attach the missing tracks.
    addTracksToPeer(pc, localStreamRef?.current)

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
      } else if (event.track) {
        // Some browsers deliver tracks without an associated stream — build one.
        setRemoteStreams(prev => {
          const existing = prev[peerSocketId]
          if (existing) {
            existing.addTrack(event.track)
            return { ...prev }
          }
          return { ...prev, [peerSocketId]: new MediaStream([event.track]) }
        })
      }
    }

    peerConnections.current.set(peerSocketId, pc)
    return pc
  }, [socket, interviewId, addTracksToPeer])

  const createOffer = useCallback(async (peerSocketId) => {
    const localStream = localStreamRef?.current
    const pc = getOrCreatePeer(peerSocketId)

    if (!localStream) {
      return
    }

    // Skip if a negotiation is already in progress or the peer is busy.
    if (makingOffer.current || pc.signalingState !== 'stable') {
      return
    }

    // Make sure the local tracks are attached before negotiating.
    addTracksToPeer(pc, localStream)

    makingOffer.current = true
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
    } finally {
      makingOffer.current = false
    }
  }, [getOrCreatePeer, socket, interviewId, addTracksToPeer])

  const handleOffer = useCallback(async (fromSocketId, offer) => {
    const pc = getOrCreatePeer(fromSocketId)
    const mySocketId = socket?.id || ''
    const isPolite = mySocketId < fromSocketId

    try {
      // SDP glare: both sides offered at the same time. A polite peer rolls
      // back its own offer and accepts the incoming one; an impolite peer
      // drops the competing offer and lets its own win.
      if (pc.signalingState !== 'stable' && !isSettingRemoteAnswerPending.current) {
        if (!isPolite) {
          return
        }
        if (pc.signalingState === 'have-local-offer') {
          await pc.setLocalDescription({ type: 'rollback' })
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      isSettingRemoteAnswerPending.current = true
      await pc.setLocalDescription(answer)
      isSettingRemoteAnswerPending.current = false

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
      isSettingRemoteAnswerPending.current = false
      console.error('Error handling offer:', err)
    }
  }, [getOrCreatePeer, socket])

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

  /**
   * Replace a track kind (video/audio) on every peer connection.
   * Used for real screen sharing — swaps the camera video track for the
   * screen track and back again without renegotiating the SDP.
   */
  const replaceTrackAll = useCallback((newTrack, kind) => {
    for (const [peerSocketId, pc] of peerConnections.current) {
      const sender = pc.getSenders().find(s => s.track?.kind === kind)
      if (sender) {
        sender.replaceTrack(newTrack)
      }
    }
  }, [])

  const addLocalTrack = useCallback((track, stream) => {
    for (const [peerSocketId, pc] of peerConnections.current) {
      pc.addTrack(track, stream)
    }
  }, [])

  /**
   * Attach a newly-acquired local stream to every existing peer connection.
   * Safe to call more than once — tracks already attached are skipped.
   */
  const addLocalStream = useCallback((stream) => {
    for (const pc of peerConnections.current.values()) {
      addTracksToPeer(pc, stream)
    }
  }, [addTracksToPeer])

  const removeLocalTrack = useCallback((track) => {
    for (const [peerSocketId, pc] of peerConnections.current) {
      const sender = pc.getSenders().find(s => s.track === track)
      if (sender) {
        pc.removeTrack(sender)
      }
    }
  }, [])

  const closePeer = useCallback((peerSocketId) => {
    const pc = peerConnections.current.get(peerSocketId)
    if (pc) pc.close()
    peerConnections.current.delete(peerSocketId)

    const timer = reconnectTimers.current.get(peerSocketId)
    if (timer) clearTimeout(timer)
    reconnectTimers.current.delete(peerSocketId)
    pendingCandidates.current.delete(peerSocketId)

    setRemoteStreams(prev => {
      const next = { ...prev }
      delete next[peerSocketId]
      return next
    })
    setConnectionStates(prev => {
      const next = { ...prev }
      delete next[peerSocketId]
      return next
    })
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
    pendingCandidates.current.clear()
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
    replaceTrackAll,
    addLocalTrack,
    addLocalStream,
    removeLocalTrack,
    closePeer,
    closeAll,
    peerConnections: peerConnections.current,
  }
}

export default useWebRTC
