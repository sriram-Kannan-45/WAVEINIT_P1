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
const CONNECTION_TIMEOUT_MS = 15000

export function useWebRTC(socket, interviewId, localStreamRef) {
  const peerConnections = useRef(new Map()) // socketId → RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({})
  const [connectionStates, setConnectionStates] = useState({})
  const [webrtcState, setWebrtcState] = useState({}) // { [socketId]: { video: 'live' | 'connecting' | 'failed', audio: 'live' | 'connecting' | 'failed' } }
  const pendingCandidates = useRef(new Map()) // socketId → candidates[]
  const reconnectTimers = useRef(new Map())
  const connectionTimeouts = useRef(new Map()) // socketId → timeout timer
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
      console.log(`[WebRTC] Reusing existing peer connection for ${peerSocketId}`)
      return peerConnections.current.get(peerSocketId)
    }

    console.log(`[WebRTC] Creating NEW RTCPeerConnection for peer: ${peerSocketId}`, {
      interviewId,
      localStreamExists: !!localStreamRef?.current,
      localTrackCount: localStreamRef?.current?.getTracks().length || 0,
    })
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Attach whatever local tracks are available right now. If the stream is
    // acquired later, use addLocalStream() to attach the missing tracks.
    addTracksToPeer(pc, localStreamRef?.current)

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log(`[WebRTC] Local ICE candidate generated for ${peerSocketId}:`, event.candidate.candidate)
        socket.emit('ice-candidate', {
          interviewId,
          targetSocketId: peerSocketId,
          candidate: event.candidate,
        })
      }
    }

    // Connection state
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] connectionState changed for ${peerSocketId}:`, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
      })
      setConnectionStates(prev => ({ ...prev, [peerSocketId]: pc.connectionState }))

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Connection ${pc.connectionState} for ${peerSocketId}, will attempt ICE restart`)
        // Attempt ICE restart after delay
        const timer = setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.log(`[WebRTC] Restarting ICE for ${peerSocketId}`)
            pc.restartIce()
            if (socket) {
              socket.emit('ice-restart', { targetSocketId: peerSocketId })
            }
          }
        }, ICE_RECONNECT_DELAY)
        reconnectTimers.current.set(peerSocketId, timer)
      } else if (pc.connectionState === 'connected') {
        console.log(`[WebRTC] ✅ Connection ESTABLISHED for ${peerSocketId}`)
        // Clear reconnect timer
        const reconnectTimer = reconnectTimers.current.get(peerSocketId)
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimers.current.delete(peerSocketId)
        }
        // Clear connection timeout
        const timeoutTimer = connectionTimeouts.current.get(peerSocketId)
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          connectionTimeouts.current.delete(peerSocketId)
        }
      }
    }

    // Connection timeout: if not connected within 15s, restart ICE
    const timeoutTimer = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        console.error(`[WebRTC] Connection TIMEOUT for ${peerSocketId} after ${CONNECTION_TIMEOUT_MS}ms`)
        console.log(`[WebRTC] Attempting ICE restart for ${peerSocketId}`)
        pc.restartIce()
        if (socket) {
          socket.emit('ice-restart', { targetSocketId: peerSocketId })
        }
      }
    }, CONNECTION_TIMEOUT_MS)
    connectionTimeouts.current.set(peerSocketId, timeoutTimer)

    // Remote stream
    pc.ontrack = (event) => {
      console.log(`[WebRTC] REMOTE TRACK RECEIVED from ${peerSocketId}:`, {
        kind: event.track.kind,
        label: event.track.label,
        readyState: event.track.readyState,
        enabled: event.track.enabled,
        muted: event.track.muted,
        streamId: event.streams[0]?.id,
        streamTrackCount: event.streams[0]?.getTracks().length,
      })
      const [stream] = event.streams

      // Update WebRTC state to show track is live
      setWebrtcState(prev => ({
        ...prev,
        [peerSocketId]: {
          ...prev[peerSocketId],
          [event.track.kind]: 'live',
        }
      }))

      // Identify screen-share tracks vs camera tracks
      const isScreenTrack = event.track.kind === 'video' && (
        stream?.id?.includes('screen') ||
        event.track.label?.toLowerCase().includes('screen') ||
        event.track.label?.toLowerCase().includes('display') ||
        event.track.label?.toLowerCase().includes('monitor')
      )

      const key = isScreenTrack ? `${peerSocketId}_screen` : peerSocketId
      console.log(`[WebRTC] Setting remoteStream key="${key}" isScreenTrack=${isScreenTrack}`)

      if (stream) {
        setRemoteStreams(prev => ({ ...prev, [key]: stream }))
      } else if (event.track) {
        setRemoteStreams(prev => {
          const existing = prev[key]
          if (existing) {
            existing.addTrack(event.track)
            return { ...prev }
          }
          return { ...prev, [key]: new MediaStream([event.track]) }
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
      console.warn(`[WebRTC] createOffer called for ${peerSocketId} but localStream not ready yet - will retry when stream available`)
      return
    }

    // Skip if a negotiation is already in progress or the peer is busy.
    if (makingOffer.current || pc.signalingState !== 'stable') {
      console.warn(`[WebRTC] Skipping createOffer for ${peerSocketId} - negotiation in progress or signaling not stable`, {
        makingOffer: makingOffer.current,
        signalingState: pc.signalingState,
      })
      return
    }

    // Make sure the local tracks are attached before negotiating.
    addTracksToPeer(pc, localStream)

    makingOffer.current = true
    try {
      console.log(`[WebRTC] Creating SDP offer for ${peerSocketId}`, {
        localTrackCount: localStream.getTracks().length,
        localTracks: localStream.getTracks().map(t => ({ kind: t.kind, label: t.label, enabled: t.enabled })),
      })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      if (socket) {
        console.log(`[WebRTC] Emitting SDP offer to ${peerSocketId}`)
        socket.emit('offer', {
          interviewId,
          targetSocketId: peerSocketId,
          offer: pc.localDescription,
        })
      }
    } catch (err) {
      console.error(`[WebRTC] Error creating offer for ${peerSocketId}:`, err)
    } finally {
      makingOffer.current = false
    }
  }, [getOrCreatePeer, socket, interviewId, addTracksToPeer])

  const handleOffer = useCallback(async (fromSocketId, offer) => {
    console.log(`[WebRTC] SDP offer received from fromSocketId: ${fromSocketId}`)
    const pc = getOrCreatePeer(fromSocketId)
    const mySocketId = socket?.id || ''
    const isPolite = mySocketId < fromSocketId

    try {
      if (pc.signalingState !== 'stable' && !isSettingRemoteAnswerPending.current) {
        if (!isPolite) {
          console.log(`[WebRTC] Glare detected, impolite peer ignoring offer from ${fromSocketId}`)
          return
        }
        if (pc.signalingState === 'have-local-offer') {
          await pc.setLocalDescription({ type: 'rollback' })
        }
      }

      if (localStreamRef?.current) {
        addTracksToPeer(pc, localStreamRef.current)
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      isSettingRemoteAnswerPending.current = true
      await pc.setLocalDescription(answer)
      isSettingRemoteAnswerPending.current = false

      if (socket) {
        console.log(`[WebRTC] Emitting SDP answer to targetSocketId: ${fromSocketId}`)
        socket.emit('answer', {
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        })
      }

      // Process any pending ICE candidates
      const pending = pendingCandidates.current.get(fromSocketId) || []
      console.log(`[WebRTC] Flushing ${pending.length} pending ICE candidates for ${fromSocketId}`)
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingCandidates.current.delete(fromSocketId)
    } catch (err) {
      isSettingRemoteAnswerPending.current = false
      console.error('Error handling offer:', err)
    }
  }, [getOrCreatePeer, socket, addTracksToPeer])

  const handleAnswer = useCallback(async (fromSocketId, answer) => {
    console.log(`[WebRTC] SDP answer received from fromSocketId: ${fromSocketId}`)
    const pc = peerConnections.current.get(fromSocketId)
    if (!pc) return

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))

      // Process pending candidates
      const pending = pendingCandidates.current.get(fromSocketId) || []
      console.log(`[WebRTC] Flushing ${pending.length} pending ICE candidates after answer for ${fromSocketId}`)
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingCandidates.current.delete(fromSocketId)
    } catch (err) {
      console.error('Error handling answer:', err)
    }
  }, [])

  const handleIceCandidate = useCallback(async (fromSocketId, candidate) => {
    console.log(`[WebRTC] Remote ICE candidate received from fromSocketId: ${fromSocketId}`)
    const pc = peerConnections.current.get(fromSocketId)
    if (!pc || !pc.remoteDescription) {
      console.log(`[WebRTC] Queuing ICE candidate for ${fromSocketId} (remoteDescription not set yet)`)
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

  const addScreenStream = useCallback(async (screenStream) => {
    if (!screenStream) return
    const screenTrack = screenStream.getVideoTracks()[0]
    if (!screenTrack) return

    for (const [peerSocketId, pc] of peerConnections.current.entries()) {
      const senders = pc.getSenders()
      const alreadyAttached = senders.some(s => s.track === screenTrack)
      if (!alreadyAttached) {
        pc.addTrack(screenTrack, screenStream)
        if (pc.signalingState === 'stable' && !makingOffer.current) {
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
          } catch (e) {
            console.error('Error adding screen stream offer:', e)
          } finally {
            makingOffer.current = false
          }
        }
      }
    }
  }, [socket, interviewId])

  const removeScreenStream = useCallback(async (screenStream) => {
    if (!screenStream) return
    const screenTrack = screenStream.getVideoTracks()[0]
    for (const [peerSocketId, pc] of peerConnections.current.entries()) {
      const sender = pc.getSenders().find(s => s.track === screenTrack)
      if (sender) {
        pc.removeTrack(sender)
        if (pc.signalingState === 'stable' && !makingOffer.current) {
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
          } catch (e) {
            console.error('Error removing screen stream offer:', e)
          } finally {
            makingOffer.current = false
          }
        }
      }
    }
  }, [socket, interviewId])

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
    if (!stream) return
    for (const [peerSocketId, pc] of peerConnections.current.entries()) {
      addTracksToPeer(pc, stream)
      if (pc.signalingState === 'stable') {
        createOffer(peerSocketId)
      }
    }
  }, [addTracksToPeer, createOffer])

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

    const reconnectTimer = reconnectTimers.current.get(peerSocketId)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimers.current.delete(peerSocketId)

    const timeoutTimer = connectionTimeouts.current.get(peerSocketId)
    if (timeoutTimer) clearTimeout(timeoutTimer)
    connectionTimeouts.current.delete(peerSocketId)

    pendingCandidates.current.delete(peerSocketId)

    setRemoteStreams(prev => {
      const next = { ...prev }
      delete next[peerSocketId]
      delete next[`${peerSocketId}_screen`]
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
    for (const timer of connectionTimeouts.current.values()) {
      clearTimeout(timer)
    }
    connectionTimeouts.current.clear()
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
    webrtcState,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    replaceTrack,
    replaceTrackAll,
    addScreenStream,
    removeScreenStream,
    addLocalTrack,
    addLocalStream,
    removeLocalTrack,
    closePeer,
    closeAll,
    peerConnections: peerConnections.current,
  }
}

export default useWebRTC
