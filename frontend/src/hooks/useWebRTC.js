/**
 * useWebRTC Hook — Perfect-Negotiation Pattern
 *
 * Key design principle (W3C perfect negotiation):
 *   - Every RTCPeerConnection has an onnegotiationneeded handler.
 *   - onnegotiationneeded fires automatically when tracks are added.
 *   - Only the "polite" peer yields during glare; the "impolite" peer wins.
 *   - Polite/impolite is determined by socket ID string comparison (stable).
 *   - External createOffer() is ONLY called when the caller explicitly wants
 *     to initiate as the offerer (joiner → finds existing peer in join-ACK).
 *   - The existing peer does NOT call createOffer() from peer-joined; it
 *     simply prepares the RTCPeerConnection and waits for an offer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  // OpenRelay by Metered (free public TURN service for NAT traversal fallback)
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelay',
    credential: 'openrelay',
  },
]

const ICE_RECONNECT_DELAY = 2000
const CONNECTION_TIMEOUT_MS = 15000

export function useWebRTC(socket, interviewId, localStreamRef) {
  const peerConnections = useRef(new Map())   // socketId → RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({})
  const [connectionStates, setConnectionStates] = useState({})
  const [webrtcState, setWebrtcState] = useState({})

  const pendingCandidates = useRef(new Map())  // socketId → candidates[]
  const reconnectTimers = useRef(new Map())
  const connectionTimeouts = useRef(new Map())
  const pendingOfferPeers = useRef(new Set())  // peers waiting for localStream
  const activeScreenSharers = useRef(new Set())

  // Per-peer perfect-negotiation guards (Map: socketId → boolean)
  const makingOffer = useRef(new Map())
  const ignoreOffer = useRef(new Map())

  // Support passing either a Socket instance OR a React ref ({ current: socket })
  // so dynamically initialized sockets (like MobileJoin's socketRef) are accessible
  // immediately without waiting for a React re-render + useEffect cycle.
  const getSocket = useCallback(() => {
    if (!socket) return null
    if (typeof socket === 'object' && 'current' in socket) return socket.current
    return socket
  }, [socket])

  const socketRef = useRef(getSocket())
  socketRef.current = getSocket()
  useEffect(() => { socketRef.current = getSocket() }, [socket, getSocket])

  const interviewIdRef = useRef(interviewId)
  useEffect(() => { interviewIdRef.current = interviewId }, [interviewId])

  // ── screen-share signal listener ──────────────────────────────────────────
  useEffect(() => {
    const liveSocket = getSocket()
    if (!liveSocket) return
    const onScreenShareSignal = (data) => {
      const { fromSocketId, sharing } = data || {}
      if (!fromSocketId) return
      if (sharing) {
        console.log(`[WebRTC] Peer ${fromSocketId} started screen sharing`)
        activeScreenSharers.current.add(fromSocketId)
      } else {
        console.log(`[WebRTC] Peer ${fromSocketId} stopped screen sharing`)
        activeScreenSharers.current.delete(fromSocketId)
        setRemoteStreams(prev => {
          const next = { ...prev }
          delete next[`${fromSocketId}_screen`]
          return next
        })
      }
    }
    liveSocket.on('screen-share', onScreenShareSignal)
    return () => { liveSocket.off('screen-share', onScreenShareSignal) }
  }, [socket, getSocket])

  /**
   * Log receiver + inbound-rtp stats for a peer connection. Lets us tell apart:
   *  - no remote track received
   *  - RTP packets received but zero frames decoded
   *  - frames decoded but the video element isn't rendering
   */
  const logRemoteMediaDiagnostics = useCallback(async (pc, peerSocketId, tag) => {
    if (!pc) return
    try {
      pc.getReceivers().forEach((receiver) => {
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] receiver for ${peerSocketId}:`, {
          kind: receiver.track?.kind,
          readyState: receiver.track?.readyState,
          muted: receiver.track?.muted,
        })
      })

      const stats = await pc.getStats()
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] video stats for ${peerSocketId}:`, {
            packetsReceived: report.packetsReceived,
            framesDecoded: report.framesDecoded,
            framesDropped: report.framesDropped,
            framesReceived: report.framesReceived,
            bytesReceived: report.bytesReceived,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            jitter: report.jitter,
          })
          if (report.framesDecoded > 0 && report.frameWidth > 2 && report.frameHeight > 2) {
            console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] VIDEO LIVE ${report.frameWidth}x${report.frameHeight}`)
          }
        }
      })
    } catch (err) {
      console.warn(`[WEBRTC REMOTE] getStats diagnostics failed for ${peerSocketId}:`, err?.message)
    }
  }, [])

  /**
   * Add every track of a local stream to a peer connection, skipping
   * tracks that are already attached.
   */
  const addTracksToPeer = useCallback((pc, stream) => {
    if (!stream || !pc) return
    const attached = new Set(pc.getSenders().map(s => s.track?.id))
    stream.getTracks().forEach(track => {
      if (track && !attached.has(track.id)) {
        const isMobile = typeof window !== 'undefined' && window.location.pathname.includes('mobile-join')
        const tag = isMobile ? '[MOBILE]' : '[TRAINER]'
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} track added to peerConnection: SUCCESS (${track.kind}: ${track.label})`)
        pc.addTrack(track, stream)
      }
    })
  }, [])

  /**
   * Determine the polite/impolite role for a peer pair CONSISTENTLY so glare
   * (both sides offering at once) always resolves. Per the W3C perfect
   * negotiation pattern the roles must be stable for a given pair — we use a
   * lexicographic comparison of the two socket IDs. An explicit override is
   * still honoured for callers that must force a role.
   */
  const getPoliteFlag = useCallback((peerSocketId, override) => {
    if (typeof override === 'boolean') return override
    const myId = socketRef.current?.id || ''
    if (!myId || !peerSocketId) return false
    return myId < peerSocketId
  }, [])

  /**
   * Get or create the RTCPeerConnection for a peer.
   *
   * @param {string} peerSocketId   The remote peer's socket ID
   * @param {boolean} [politeOverride] Force polite/impolite; otherwise derived.
   */
  const getOrCreatePeer = useCallback((peerSocketId, politeOverride) => {
    if (peerConnections.current.has(peerSocketId)) {
      const existingPc = peerConnections.current.get(peerSocketId)
      if (localStreamRef?.current) {
        addTracksToPeer(existingPc, localStreamRef.current)
      }
      return existingPc
    }

    const isMobile = typeof window !== 'undefined' && window.location.pathname.includes('mobile-join')
    const tag = isMobile ? '[MOBILE]' : '[TRAINER]'
    const polite = getPoliteFlag(peerSocketId, politeOverride)
    console.log(`[${new Date().toLocaleTimeString()}] ${tag} RTCPeerConnection created for peer: ${peerSocketId}`, {
      interviewId: interviewIdRef.current,
      polite,
      mySocketId: socketRef.current?.id,
    })

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // ── ICE candidates ──────────────────────────────────────────────────
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} ICE candidate generated → ${peerSocketId}:`, event.candidate.candidate?.substr(0, 60))
        socketRef.current.emit('ice-candidate', {
          interviewId: interviewIdRef.current,
          targetSocketId: peerSocketId,
          candidate: event.candidate,
        })
      }
    }

    pc.onicecandidateerror = (e) => {
      if (e.errorCode !== 701) {
        console.warn(`[${new Date().toLocaleTimeString()}] ${tag} ICE candidate error for ${peerSocketId}:`, e.errorText)
      }
    }

    // ── Connection state ────────────────────────────────────────────────
    const syncConnectionState = () => {
      const state = (pc.connectionState && pc.connectionState !== 'new')
        ? pc.connectionState
        : (pc.iceConnectionState && pc.iceConnectionState !== 'new')
          ? pc.iceConnectionState
          : 'connecting'

      console.log(`[${new Date().toLocaleTimeString()}] ${tag} peerConnection state update: [${peerSocketId.substr(0,6)}] → connectionState=${pc.connectionState}, iceState=${pc.iceConnectionState} (effective: ${state})`)
      setConnectionStates(prev => ({ ...prev, [peerSocketId]: state }))

      if (state === 'disconnected' || state === 'failed') {
        console.warn(`[${new Date().toLocaleTimeString()}] ${tag} ${state} for ${peerSocketId}, will restart ICE in ${ICE_RECONNECT_DELAY}ms`)
        const timer = setTimeout(() => {
          const currentPc = peerConnections.current.get(peerSocketId)
          if (currentPc && (currentPc.connectionState === 'disconnected' || currentPc.connectionState === 'failed' || currentPc.iceConnectionState === 'failed')) {
            console.log(`[${new Date().toLocaleTimeString()}] ${tag} Restarting ICE for ${peerSocketId}`)
            currentPc.restartIce()
            if (socketRef.current) {
              socketRef.current.emit('ice-restart', { targetSocketId: peerSocketId })
            }
          }
        }, ICE_RECONNECT_DELAY)
        reconnectTimers.current.set(peerSocketId, timer)
      } else if (state === 'connected' || state === 'completed') {
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} ✅ Connection ESTABLISHED for ${peerSocketId}`)
        const reconnectTimer = reconnectTimers.current.get(peerSocketId)
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimers.current.delete(peerSocketId)
        }
        const timeoutTimer = connectionTimeouts.current.get(peerSocketId)
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          connectionTimeouts.current.delete(peerSocketId)
        }
        for (const delay of [1200, 3000]) {
          setTimeout(() => {
            const livePc = peerConnections.current.get(peerSocketId)
            if (livePc && (livePc.connectionState === 'connected' || livePc.iceConnectionState === 'connected' || livePc.iceConnectionState === 'completed')) {
              logRemoteMediaDiagnostics(livePc, peerSocketId, tag)
            }
          }, delay)
        }
      }
    }

    pc.onconnectionstatechange = syncConnectionState
    pc.oniceconnectionstatechange = syncConnectionState
    syncConnectionState()

    // ── ICE Gathering & Connection State Logging (Timestamped) ─────────
    pc.onicegatheringstatechange = () => {
      console.log(`[${new Date().toLocaleTimeString()}] ${tag} iceGatheringState changes: ${pc.iceGatheringState}`)
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[${new Date().toLocaleTimeString()}] ${tag} iceConnectionState changes: ${pc.iceConnectionState}`)
    }

    pc.onsignalingstatechange = () => {
      console.log(`[${new Date().toLocaleTimeString()}] ${tag} signalingState changes: ${pc.signalingState}`)
    }

    // ── Connection timeout ──────────────────────────────────────────────
    const timeoutTimer = setTimeout(() => {
      const currentPc = peerConnections.current.get(peerSocketId)
      if (currentPc && currentPc.connectionState !== 'connected') {
        console.warn(`[${new Date().toLocaleTimeString()}] ${tag} Connection TIMEOUT for ${peerSocketId} after ${CONNECTION_TIMEOUT_MS}ms`)
        currentPc.restartIce()
        if (socketRef.current) {
          socketRef.current.emit('ice-restart', { targetSocketId: peerSocketId })
        }
      }
    }, CONNECTION_TIMEOUT_MS)
    connectionTimeouts.current.set(peerSocketId, timeoutTimer)

    // ── Perfect Negotiation: onnegotiationneeded ───────────────────────
    pc.onnegotiationneeded = async () => {
      console.log(`[${new Date().toLocaleTimeString()}] ${tag} onnegotiationneeded for ${peerSocketId}, signalingState=${pc.signalingState}, polite=${polite}`)
      try {
        makingOffer.current.set(peerSocketId, true)
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} offer created`)
        const offer = await pc.createOffer()
        if (pc.signalingState !== 'stable') {
          console.log(`[${new Date().toLocaleTimeString()}] ${tag} onnegotiationneeded aborted (signalingState=${pc.signalingState}) for ${peerSocketId}`)
          makingOffer.current.set(peerSocketId, false)
          return
        }
        await pc.setLocalDescription(offer)
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} offer sent via signaling, room: ${interviewIdRef.current}`)
        if (socketRef.current) {
          socketRef.current.emit('offer', {
            interviewId: interviewIdRef.current,
            targetSocketId: peerSocketId,
            offer: pc.localDescription,
          })
        }
      } catch (err) {
        console.error(`[${new Date().toLocaleTimeString()}] ${tag} onnegotiationneeded error for ${peerSocketId}:`, err)
      } finally {
        makingOffer.current.set(peerSocketId, false)
      }
    }

    // ── Remote track reception ──────────────────────────────────────────
    pc.ontrack = (event) => {
      // Never assume event.streams[0] exists — build a MediaStream from the
      // received track if the browser did not supply one.
      let stream = event.streams && event.streams[0]
      if (!stream) {
        stream = new MediaStream([event.track])
      }

      console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] track received from ${peerSocketId}:`, {
        kind: event.track.kind,
        label: event.track.label,
        readyState: event.track.readyState,
        muted: event.track.muted,
        streamId: stream.id,
      })

      event.track.onunmute = () => {
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] track UNMUTED (${event.track.kind})`)
      }
      event.track.onended = () => {
        console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] track ENDED (${event.track.kind})`)
      }

      setWebrtcState(prev => ({
        ...prev,
        [peerSocketId]: {
          ...prev[peerSocketId],
          [event.track.kind]: 'live',
        }
      }))

      const isExplicitScreen = activeScreenSharers.current.has(peerSocketId) ||
        stream.id?.includes('screen') ||
        event.track.label?.toLowerCase().includes('screen') ||
        event.track.label?.toLowerCase().includes('display') ||
        event.track.label?.toLowerCase().includes('monitor') ||
        event.track.label?.toLowerCase().includes('capture')

      setRemoteStreams(prev => {
        let key = peerSocketId
        const existingCamera = prev[peerSocketId]

        if (event.track.kind === 'video') {
          if (isExplicitScreen) {
            key = `${peerSocketId}_screen`
          } else if (existingCamera && existingCamera.getVideoTracks().length > 0) {
            const existingTrack = existingCamera.getVideoTracks()[0]
            if (existingTrack && existingTrack.id !== event.track.id) {
              key = `${peerSocketId}_screen`
            }
          }
        }

        console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] Assigning remote track (${event.track.kind}) to key="${key}"`)

        const existingStream = prev[key]
        let updatedStream

        if (existingStream) {
          const tracks = existingStream.getTracks()
          if (!tracks.some(t => t.id === event.track.id)) {
            updatedStream = new MediaStream([...tracks, event.track])
          } else {
            // Track already present — reuse the SAME stream object. Creating
            // a new MediaStream per ontrack would churn the stream identity
            // on every renegotiation and force VideoTile to re-attach/play.
            updatedStream = existingStream
          }
        } else {
          updatedStream = new MediaStream(stream.getTracks())
        }

        console.log(`[${new Date().toLocaleTimeString()}] ${tag} [WEBRTC REMOTE] Remote stream updated for key="${key}":`, {
          trackCount: updatedStream.getTracks().length,
          streamId: updatedStream.id,
        })

        return { ...prev, [key]: updatedStream }
      })

      // Bug B: per-stream pipeline trace — when a screen/display track is
      // received, snapshot getStats() after frames should have started so we
      // can prove packets/decoded-frames actually flow (or diagnose why not).
      if (event.track.kind === 'video' && isExplicitScreen) {
        setTimeout(() => {
          logRemoteMediaDiagnostics(pc, peerSocketId, tag)
        }, 1500)
      }
    }

    if (localStreamRef?.current) {
      addTracksToPeer(pc, localStreamRef.current)
    }

    pc._polite = polite
    peerConnections.current.set(peerSocketId, pc)
    return pc
  }, [addTracksToPeer, getPoliteFlag, logRemoteMediaDiagnostics, localStreamRef])

  const createOffer = useCallback(async (peerSocketId) => {
    const localStream = localStreamRef?.current
    console.log(`[MOBILE] createOffer initiated for target peerSocketId: ${peerSocketId}`)

    if (!localStream) {
      console.warn(`[MOBILE] createOffer: localStream not ready yet for ${peerSocketId}, queuing peerSocketId`)
      pendingOfferPeers.current.add(peerSocketId)
      return
    }

    pendingOfferPeers.current.delete(peerSocketId)

    if (makingOffer.current.get(peerSocketId)) {
      console.warn(`[MOBILE] Already making offer for ${peerSocketId}, skipping duplicate call`)
      return
    }

    try {
      const pc = getOrCreatePeer(peerSocketId)

      if (pc.signalingState !== 'stable') {
        console.warn(`[MOBILE] createOffer aborted for ${peerSocketId} (signalingState=${pc.signalingState})`)
        return
      }

      // Tracks MUST be attached to the SAME peer connection used for
      // signaling, and BEFORE the offer is created.
      console.log('[MOBILE] Adding local tracks to peerConnection before offer...')
      addTracksToPeer(pc, localStream)

      const senders = pc.getSenders()
      console.log('[WEBRTC MOBILE] Senders attached before offer:', senders.map(s => ({
        kind: s.track?.kind,
        readyState: s.track?.readyState,
        enabled: s.track?.enabled,
        muted: s.track?.muted,
      })))

      makingOffer.current.set(peerSocketId, true)

      console.log('[MOBILE] Creating offer...')
      const offer = await pc.createOffer()

      await pc.setLocalDescription(offer)
      console.log('[MOBILE] Local description set (offer)')

      if (socketRef.current) {
        socketRef.current.emit('offer', {
          interviewId: interviewIdRef.current,
          targetSocketId: peerSocketId,
          offer: pc.localDescription,
        })
        console.log('[WEBRTC SIGNALING] Offer sent', { target: peerSocketId, senderCount: senders.length })
      } else {
        console.error('[MOBILE] CRITICAL: socketRef.current is null when attempting to emit offer!')
      }
    } catch (err) {
      console.error('[MOBILE] CRITICAL EXCEPTION in createOffer sequence:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    } finally {
      makingOffer.current.set(peerSocketId, false)
    }
  }, [getOrCreatePeer, addTracksToPeer, localStreamRef])

  const preparePeer = useCallback((peerSocketId) => {
    const localStream = localStreamRef?.current
    const pc = getOrCreatePeer(peerSocketId)
    if (localStream) {
      addTracksToPeer(pc, localStream)
    } else {
      pendingOfferPeers.current.add(peerSocketId)
    }
    return pc
  }, [getOrCreatePeer, addTracksToPeer, localStreamRef])

  const handleOffer = useCallback(async (fromSocketId, offer) => {
    const isMobile = typeof window !== 'undefined' && window.location.pathname.includes('mobile-join')
    const tag = isMobile ? '[MOBILE]' : '[TRAINER]'

    console.log(`[${new Date().toLocaleTimeString()}] ${tag} offer received from remote (from: ${fromSocketId}), room: ${interviewIdRef.current}`)
    const pc = getOrCreatePeer(fromSocketId)
    const polite = pc._polite !== false

    try {
      const isMakingOffer = makingOffer.current.get(fromSocketId) || false
      const offerCollision = isMakingOffer || pc.signalingState !== 'stable'

      ignoreOffer.current.set(fromSocketId, !polite && offerCollision)

      if (ignoreOffer.current.get(fromSocketId)) {
        console.log(`${tag} Glare → impolite, ignoring offer from ${fromSocketId}`)
        return
      }

      if (offerCollision && polite) {
        console.log(`${tag} Glare → polite, rolling back for ${fromSocketId}`)
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }),
        ])
        makingOffer.current.set(fromSocketId, false)
      }

      if (localStreamRef?.current) {
        addTracksToPeer(pc, localStreamRef.current)
      }

      console.log(`${tag} Setting remote description (offer)...`)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      console.log(`${tag} setRemoteDescription: SUCCESS`)

      console.log(`${tag} Creating answer...`)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      console.log(`[${new Date().toLocaleTimeString()}] [WebRTC] 📤 Answer sent to ${fromSocketId}`)
      if (socketRef.current) {
        socketRef.current.emit('answer', {
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        })
      }

      const pending = pendingCandidates.current.get(fromSocketId) || []
      if (pending.length > 0) {
        console.log(`[WebRTC] Flushing ${pending.length} queued ICE candidates for ${fromSocketId}`)
        for (const candidate of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (e) {
            console.warn(`[WebRTC] ICE candidate add failed (expected after rollback):`, e.message)
          }
        }
        pendingCandidates.current.delete(fromSocketId)
      }
    } catch (err) {
      console.error(`[WebRTC] handleOffer error for ${fromSocketId}:`, err)
    }
  }, [getOrCreatePeer, addTracksToPeer, localStreamRef])

  const handleAnswer = useCallback(async (fromSocketId, answer) => {
    console.log(`[${new Date().toLocaleTimeString()}] [WebRTC] 📥 Answer received from ${fromSocketId}`)
    const pc = peerConnections.current.get(fromSocketId)
    if (!pc) {
      console.warn(`[WebRTC] handleAnswer: no peer found for ${fromSocketId}`)
      return
    }

    if (pc.signalingState !== 'have-local-offer') {
      console.warn(`[WebRTC] handleAnswer: unexpected signalingState=${pc.signalingState} for ${fromSocketId}`)
      return
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
      console.log(`[WebRTC] Remote description (answer) set for ${fromSocketId}`)

      const pending = pendingCandidates.current.get(fromSocketId) || []
      if (pending.length > 0) {
        console.log(`[WebRTC] Flushing ${pending.length} queued ICE candidates after answer for ${fromSocketId}`)
        for (const candidate of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (e) {
            console.warn(`[WebRTC] ICE candidate add failed:`, e.message)
          }
        }
        pendingCandidates.current.delete(fromSocketId)
      }
    } catch (err) {
      console.error(`[WebRTC] handleAnswer error for ${fromSocketId}:`, err)
    }
  }, [])

  const handleIceCandidate = useCallback(async (fromSocketId, candidate) => {
    const pc = peerConnections.current.get(fromSocketId)
    if (!pc || !pc.remoteDescription) {
      console.log(`[WebRTC] ICE candidate queued for ${fromSocketId} (no remoteDescription yet)`)
      if (!pendingCandidates.current.has(fromSocketId)) {
        pendingCandidates.current.set(fromSocketId, [])
      }
      pendingCandidates.current.get(fromSocketId).push(candidate)
      return
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
      console.log(`[WebRTC] ICE candidate applied for ${fromSocketId}`)
    } catch (err) {
      if (!ignoreOffer.current.get(fromSocketId)) {
        console.error(`[WebRTC] addIceCandidate error for ${fromSocketId}:`, err)
      }
    }
  }, [])

  const replaceTrack = useCallback((peerSocketId, newTrack, kind) => {
    const pc = peerConnections.current.get(peerSocketId)
    if (!pc) return
    const sender = pc.getSenders().find(s => s.track?.kind === kind)
    if (sender) sender.replaceTrack(newTrack)
  }, [])

  const replaceTrackAll = useCallback((newTrack, kind) => {
    for (const [, pc] of peerConnections.current) {
      const sender = pc.getSenders().find(s => s.track?.kind === kind)
      if (sender) sender.replaceTrack(newTrack)
    }
  }, [])

  const addScreenStream = useCallback(async (screenStream) => {
    if (!screenStream) return
    const screenTrack = screenStream.getVideoTracks()[0]
    if (!screenTrack) return

    for (const [peerSocketId, pc] of peerConnections.current.entries()) {
      const alreadyAttached = pc.getSenders().some(s => s.track?.id === screenTrack.id)
      if (!alreadyAttached) {
        pc.addTrack(screenTrack, screenStream)
        console.log(`[WebRTC] Screen track added to peer ${peerSocketId}, onnegotiationneeded will fire`)
      }
    }
  }, [])

  const removeScreenStream = useCallback(async (screenStream) => {
    if (!screenStream) return
    const screenTrack = screenStream.getVideoTracks()[0]
    for (const [peerSocketId, pc] of peerConnections.current.entries()) {
      const sender = pc.getSenders().find(s => s.track?.id === screenTrack?.id)
      if (sender) {
        pc.removeTrack(sender)
        console.log(`[WebRTC] Screen track removed from peer ${peerSocketId}`)
      }
    }
  }, [])

  const addLocalTrack = useCallback((track, stream) => {
    for (const [, pc] of peerConnections.current) {
      pc.addTrack(track, stream)
    }
  }, [])

  const addLocalStream = useCallback((stream) => {
    if (!stream) return
    console.log('[WebRTC] addLocalStream:', {
      streamId: stream.id,
      trackCount: stream.getTracks().length,
      tracks: stream.getTracks().map(t => `${t.kind}:${t.readyState}`),
      existingPeers: Array.from(peerConnections.current.keys()),
      pendingPeers: Array.from(pendingOfferPeers.current),
    })

    for (const [peerSocketId, pc] of peerConnections.current.entries()) {
      addTracksToPeer(pc, stream)
    }

    const pendingList = Array.from(pendingOfferPeers.current)
    pendingOfferPeers.current.clear()
    for (const peerSocketId of pendingList) {
      if (!peerConnections.current.has(peerSocketId)) {
        createOffer(peerSocketId)
      }
    }
  }, [addTracksToPeer, createOffer])

  const removeLocalTrack = useCallback((track) => {
    for (const [, pc] of peerConnections.current) {
      const sender = pc.getSenders().find(s => s.track?.id === track.id)
      if (sender) pc.removeTrack(sender)
    }
  }, [])

  const closePeer = useCallback((peerSocketId) => {
    const pc = peerConnections.current.get(peerSocketId)
    if (pc) {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.onnegotiationneeded = null
      pc.close()
    }
    peerConnections.current.delete(peerSocketId)

    const reconnectTimer = reconnectTimers.current.get(peerSocketId)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimers.current.delete(peerSocketId)

    const timeoutTimer = connectionTimeouts.current.get(peerSocketId)
    if (timeoutTimer) clearTimeout(timeoutTimer)
    connectionTimeouts.current.delete(peerSocketId)

    pendingCandidates.current.delete(peerSocketId)
    pendingOfferPeers.current.delete(peerSocketId)
    activeScreenSharers.current.delete(peerSocketId)
    makingOffer.current.delete(peerSocketId)
    ignoreOffer.current.delete(peerSocketId)

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
    for (const [, pc] of peerConnections.current) {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.onnegotiationneeded = null
      pc.close()
    }
    peerConnections.current.clear()
    for (const timer of reconnectTimers.current.values()) clearTimeout(timer)
    reconnectTimers.current.clear()
    for (const timer of connectionTimeouts.current.values()) clearTimeout(timer)
    connectionTimeouts.current.clear()
    pendingCandidates.current.clear()
    pendingOfferPeers.current.clear()
    activeScreenSharers.current.clear()
    makingOffer.current.clear()
    ignoreOffer.current.clear()
    setRemoteStreams({})
    setConnectionStates({})
  }, [])

  const getRemoteDiagnostics = useCallback((peerSocketId) => {
    const pc = peerConnections.current.get(peerSocketId)
    if (!pc) {
      console.warn(`[WEBRTC REMOTE] No peer connection for ${peerSocketId}`)
      return
    }
    logRemoteMediaDiagnostics(pc, peerSocketId, 'TRAINER')
  }, [logRemoteMediaDiagnostics])

  useEffect(() => {
    return () => closeAll()
  }, [closeAll])

  const retryPeerConnection = useCallback((peerSocketId) => {
    if (!peerSocketId) {
      for (const [id, pc] of peerConnections.current.entries()) {
        console.log(`[WebRTC] Retrying peer connection for ${id}...`)
        try {
          pc.restartIce()
          if (socketRef.current) {
            socketRef.current.emit('ice-restart', { targetSocketId: id })
          }
        } catch (e) {
          console.warn('[WebRTC] restartIce error:', e)
        }
        createOffer(id)
      }
      return
    }

    const pc = peerConnections.current.get(peerSocketId)
    if (pc) {
      try {
        pc.restartIce()
        if (socketRef.current) {
          socketRef.current.emit('ice-restart', { targetSocketId: peerSocketId })
        }
      } catch (e) {
        console.warn('[WebRTC] restartIce error:', e)
      }
    }
    createOffer(peerSocketId)
  }, [createOffer])

  return {
    remoteStreams,
    connectionStates,
    webrtcState,
    createOffer,
    preparePeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    retryPeerConnection,
    replaceTrack,
    replaceTrackAll,
    addScreenStream,
    removeScreenStream,
    addLocalTrack,
    addLocalStream,
    removeLocalTrack,
    closePeer,
    closeAll,
    getRemoteDiagnostics,
    peerConnections: peerConnections.current,
  }
}

export default useWebRTC
