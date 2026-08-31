/**
 * Interview Socket Events
 * WebRTC signalling, room management, chat, code sync, and AI monitoring alerts.
 *
 * Events contract:
 *   Client → Server: join-room, leave-room, offer, answer, ice-candidate,
 *     screen-share, chat-message, device-status, interview-alert, code-sync,
 *     recording-status
 *   Server → Client: peer-joined, peer-left, offer, answer, ice-candidate,
 *     screen-share, chat-message, device-status, interview-alert, code-sync,
 *     recording-status
 */

const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const {
  Interview, InterviewSession, InterviewDevice, InterviewLog,
} = require('../models');
const tokenService = require('../services/interviewTokenService');
const aiMonitorService = require('../services/interviewAiMonitorService');
const relay = require('./crossInstance');
const logger = require('../utils/logger');

// In-memory room state: interviewId → InterviewRoomState instance
const rooms = new Map();

class InterviewRoomState {
  constructor(interviewId) {
    this.interviewId = String(interviewId);
    this.peers = new Map(); // socketId → { socketId, userId, role, userName, deviceType, streams }
  }

  addPeer(socketId, info) {
    this.peers.set(socketId, {
      socketId,
      userId: info.userId,
      role: info.role,
      userName: info.userName,
      deviceType: info.deviceType || 'LAPTOP',
      joinedAt: Date.now(),
      streams: {
        camera: true,
        screen: false,
        mic: true,
      },
    });
  }

  removePeer(socketId) {
    const peer = this.peers.get(socketId);
    this.peers.delete(socketId);
    return peer;
  }

  setStreamStatus(socketId, streamType, active) {
    const peer = this.peers.get(socketId);
    if (peer && peer.streams) {
      peer.streams[streamType] = active;
    }
  }

  toSnapshot() {
    const peerList = [];
    let mobilePaired = false;
    for (const [socketId, info] of this.peers) {
      if (info.deviceType === 'MOBILE') mobilePaired = true;
      peerList.push({
        socketId: info.socketId,
        userId: info.userId,
        role: info.role,
        userName: info.userName,
        deviceType: info.deviceType,
        streams: info.streams,
      });
    }
    return {
      roomId: this.interviewId,
      mobilePaired,
      peers: peerList,
      timestamp: Date.now(),
    };
  }
}

function getRoom(interviewId) {
  const key = String(interviewId);
  if (!rooms.has(key)) {
    rooms.set(key, new InterviewRoomState(key));
  }
  return rooms.get(key);
}

function broadcastRoomState(io, interviewId) {
  const key = String(interviewId);
  const room = rooms.get(key);
  if (!room) return;
  const snapshot = room.toSnapshot();
  console.log(`[ROOM STATE] server: broadcast snapshot for roomId=${key} (peers=${snapshot.peers.length}, mobilePaired=${snapshot.mobilePaired})`);
  relay.relayEmit(io, 'room', `interview_${key}`, 'room:state', snapshot);
}

/**
 * Validate socket has permission to join this interview room.
 */
async function validateRoomAccess(socket, interviewId) {
  const userId = socket.userId;
  const role = socket.userRole;

  const interview = await Interview.findByPk(interviewId);
  if (!interview) return { allowed: false, error: 'Interview not found' };

  if (role === 'ADMIN' || role === 'TRAINER' || socket.deviceType === 'MOBILE') return { allowed: true, interview };
  if (String(interview.candidate_id) === String(userId)) return { allowed: true, interview };
  if (String(interview.interviewer_id) === String(userId)) return { allowed: true, interview };
  if (String(interview.created_by) === String(userId)) return { allowed: true, interview };

  return { allowed: false, error: 'Not authorized for this interview' };
}

/**
 * Register interview socket events on a socket instance.
 */
function registerInterviewEvents(io, socket) {
  /**
   * join-room: Join an interview room for WebRTC signalling.
   */
  socket.on('join-room', async (data, callback) => {
    try {
      // CRITICAL: coerce to String so the in-memory `rooms` Map always uses
      // the same key type regardless of whether the client sent a string
      // (Trainer, from URL params) or a number (Mobile, from REST API).
      const interviewId = data.interviewId != null ? String(data.interviewId) : null;
      if (!interviewId) {
        if (callback) callback({ success: false, error: 'interviewId required' });
        return;
      }

      const deviceType = data.deviceType === 'MOBILE' ? 'MOBILE' : 'LAPTOP';

      const { allowed, interview, error } = await validateRoomAccess(socket, interviewId);
      if (!allowed) {
        if (callback) callback({ success: false, error });
        return;
      }

      // Mobile pairing sockets must carry a PENDING pairing token; consume it
      // atomically right here so a QR code can only ever pair one socket.
      if (deviceType === 'MOBILE') {
        if (!socket.pairingToken) {
          if (callback) callback({ success: false, error: 'Missing pairing token' });
          return;
        }
        const consume = await tokenService.consumePairingToken(socket.pairingToken, socket.userId);
        if (!consume.success) {
          if (callback) callback({ success: false, error: consume.message });
          return;
        }
        await tokenService.markConnected(consume.device.id);
        await InterviewLog.create({
          session_id: consume.device.session_id,
          actor_id: socket.userId,
          event_type: 'MOBILE_PAIRED',
          payload_json: { deviceId: consume.device.id },
        }).catch(() => {});

        // Tell the laptop side that the mobile camera is now connected.
        // `device-status` updates the generic device list; `mobile-camera-paired`
        // is the dedicated, clearly-named event the Trainer's "Mobile Camera" /
        // "Participant Mobile Feed" widgets listen for (Bug A fix).
        const pairedPayload = {
          roomId: interviewId,
          socketId: socket.id,
          participantId: socket.userId,
          participantName: socket.userName,
          pairedAt: Date.now(),
        };
        console.log(`[WEBRTC SIGNALING] server: mobile-camera-paired emitted, roomId=${interviewId}, socketId=${socket.id}`);
        relay.relayEmit(io, 'room', `interview_${interviewId}`, 'device-status', {
          fromUserId: socket.userId,
          deviceType: 'MOBILE',
          connected: true,
          timestamp: new Date().toISOString(),
        }, { excludingSocket: socket });
        relay.relayEmit(io, 'room', `interview_${interviewId}`, 'mobile-camera-paired', pairedPayload);
      }

      // Find or create session
      let session = await InterviewSession.findOne({
        where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (!session) {
        session = await InterviewSession.create({
          interview_id: interviewId,
          status: 'WAITING',
        });
      }

      const room = getRoom(interviewId);

      // Notify all peers in the room across instances about new joiner
      relay.relayEmit(io, 'room', `interview_${interviewId}`, 'peer-joined', {
        socketId: socket.id,
        userId: socket.userId,
        role: socket.userRole,
        userName: socket.userName,
        deviceType,
      }, { excludingSocket: socket });

      // Add this socket to the room
      socket.join(`interview_${interviewId}`);
      room.addPeer(socket.id, {
        userId: socket.userId,
        role: socket.userRole,
        userName: socket.userName,
        deviceType,
      });

      // Broadcast updated room:state snapshot to room
      broadcastRoomState(io, interviewId);

      // Store interviewId on socket for cleanup
      socket.currentInterviewId = interviewId;

      // Send existing peers to the new joiner
      const existingPeers = [];
      for (const [peerSocketId, peerInfo] of room.peers) {
        if (peerSocketId !== socket.id) {
          existingPeers.push({
            socketId: peerSocketId,
            userId: peerInfo.userId,
            role: peerInfo.role,
            userName: peerInfo.userName,
            deviceType: peerInfo.deviceType || 'LAPTOP',
          });
        }
      }

      // Log join event
      await InterviewLog.create({
        session_id: session.id,
        actor_id: socket.userId,
        event_type: 'SOCKET_JOINED',
        payload_json: { socketId: socket.id, role: socket.userRole, deviceType },
      }).catch(() => {});

      const snapshot = room.toSnapshot();
      if (callback) callback({
        success: true,
        sessionId: session.id,
        peers: existingPeers,
        roomState: snapshot,
        interview: {
          id: interview.id,
          type: interview.type,
          scheduledAt: interview.scheduled_at,
          durationMinutes: interview.duration_minutes,
        },
      });
    } catch (error) {
      logger.error('Error in join-room', { error: error.message });
      if (callback) callback({ success: false, error: 'Server error' });
    }
  });

  /**
   * get-room-state: One-shot "current room state" query so a peer that joins
   * (or refreshes) after the mobile camera already paired can sync immediately.
   */
  socket.on('get-room-state', (data, callback) => {
    const interviewId = data?.interviewId != null ? String(data.interviewId) : null;
    const room = getRoom(interviewId);
    const snapshot = room.toSnapshot();
    console.log(`[WEBRTC SIGNALING] server: get-room-state for roomId=${interviewId} → peers=${snapshot.peers.length}, mobilePaired=${snapshot.mobilePaired}`);
    if (callback) callback({ success: true, roomId: interviewId, peers: snapshot.peers, mobilePaired: snapshot.mobilePaired, roomState: snapshot });
  });

  /**
   * leave-room: Leave an interview room.
   */
  socket.on('leave-room', async (data) => {
    const interviewId = data?.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId) return;

    await handleLeaveRoom(io, socket, interviewId);
  });

  /**
   * interview-started: Trainer/Admin announces the interview has officially
   * started so participants leave the waiting state.
   */
  socket.on('interview-started', (data) => {
    const interviewId = data?.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId) return;

    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'interview-started', {
      startedBy: socket.userId,
      startedByName: socket.userName,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * end-interview: Trainer/Admin ends the interview.
   * Marks the session ENDED and notifies all peers so they leave the room.
   */
  socket.on('end-interview', async (data, callback) => {
    const interviewId = data?.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId) {
      if (callback) callback({ success: false, error: 'interviewId required' });
      return;
    }

    const role = socket.userRole;
    if (role !== 'TRAINER' && role !== 'ADMIN') {
      if (callback) callback({ success: false, error: 'Only the interviewer can end the interview' });
      return;
    }

    try {
      const session = await InterviewSession.findOne({
        where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
      });
      if (session) {
        session.status = 'ENDED';
        session.ended_at = new Date();
        await session.save();
      }

      // Notify everyone in the room (including the trainer)
      relay.relayEmit(io, 'room', `interview_${interviewId}`, 'interview-ended', {
        endedBy: socket.userId,
        endedByName: socket.userName,
        timestamp: new Date().toISOString(),
      });

      if (callback) callback({ success: true });
    } catch (error) {
      logger.error('Error ending interview', { error: error.message });
      if (callback) callback({ success: false, error: 'Server error' });
    }
  });

  /**
   * WebRTC signalling: offer, answer, ice-candidate
   */
  socket.on('offer', (data) => {
    const { targetSocketId, offer } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    const roomName = `interview_${interviewId}`;
    console.log(`[SERVER] Received offer for interviewId/room: ${interviewId} (targetSocketId: ${targetSocketId}) from socket: ${socket.id}`);
    if (targetSocketId) {
      console.log(`[SERVER] Relaying offer to targetSocketId: ${targetSocketId}`);
      relay.relayEmit(io, 'socket', targetSocketId, 'offer', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        offer,
      });
    } else {
      console.warn(`[SERVER] Received offer without targetSocketId from socket: ${socket.id}`);
    }
  });

  socket.on('answer', (data) => {
    const { targetSocketId, answer } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    console.log(`[SERVER] Received answer from socket: ${socket.id} for targetSocketId: ${targetSocketId}`);
    if (targetSocketId) {
      console.log(`[SERVER] Relaying answer to targetSocketId: ${targetSocketId}`);
      relay.relayEmit(io, 'socket', targetSocketId, 'answer', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        answer,
      });
    } else {
      console.warn(`[SERVER] Received answer without targetSocketId from socket: ${socket.id}`);
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetSocketId, candidate } = data;
    console.log(`[SERVER] Received ice-candidate from socket: ${socket.id} for targetSocketId: ${targetSocketId}`);
    if (targetSocketId) {
      relay.relayEmit(io, 'socket', targetSocketId, 'ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    }
  });

  /**
   * screen-share: Broadcast screen share start/stop to room.
   */
  socket.on('screen-share', (data) => {
    const { sharing, metadata } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    if (interviewId) {
      relay.relayEmit(io, 'room', `interview_${interviewId}`, 'screen-share', {
        fromSocketId: socket.id,
        fromUserId: socket.userId,
        sharing,
        metadata,
      }, { excludingSocket: socket });
    }
  });

  /**
   * chat-message: Broadcast chat to room.
   */
  socket.on('chat-message', async (data) => {
    const { message, sessionId } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId || !message) return;

    // Persist to interview_logs
    if (sessionId) {
      await InterviewLog.create({
        session_id: sessionId,
        actor_id: socket.userId,
        event_type: 'CHAT_MESSAGE',
        payload_json: { message: message.substring(0, 500) },
      }).catch(() => {});
    }

    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'chat-message', {
      fromSocketId: socket.id,
      fromUserId: socket.userId,
      fromUserName: socket.userName,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * participant-step-progress: Reports candidate setup step progression.
   */
  socket.on('participant-step-progress', (data) => {
    const { step, progress, completed } = data || {};
    const interviewId = data?.interviewId != null ? String(data.interviewId) : String(socket.currentInterviewId || '');
    if (!interviewId) return;

    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'participant-step-progress', {
      fromSocketId: socket.id,
      fromUserId: socket.userId,
      step,
      progress,
      completed: completed || step === 'room',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * participant-tab-switch: Reports candidate tab switch / focus loss.
   */
  socket.on('participant-tab-switch', (data) => {
    const interviewId = data?.interviewId != null ? String(data.interviewId) : String(socket.currentInterviewId || '');
    if (!interviewId) return;

    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'participant-tab-switch', {
      fromSocketId: socket.id,
      fromUserId: socket.userId,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * device-status: Client reports device connection status change.
   */
  socket.on('device-status', async (data) => {
    const { sessionId, deviceType, connected } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId) return;

    // Broadcast to room
    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'device-status', {
      fromUserId: socket.userId,
      deviceType,
      connected,
      timestamp: new Date().toISOString(),
    });

    // Persist event
    if (sessionId) {
      await InterviewLog.create({
        session_id: sessionId,
        actor_id: socket.userId,
        event_type: connected ? 'DEVICE_CONNECTED' : 'DEVICE_DISCONNECTED',
        payload_json: { deviceType },
      }).catch(() => {});
    }
  });

  /**
   * interview-alert: Client-side AI monitoring alert.
   */
  socket.on('interview-alert', async (data) => {
    const { sessionId, alertType, severity, sourceDevice, message, metadata } = data;
    if (!sessionId || !alertType) return;

    const alert = await aiMonitorService.processAlert(sessionId, {
      alertType, severity, sourceDevice, message, metadata,
    }).catch(() => null);

    if (alert) {
      // Broadcast alert to interviewer (and admin if present) — user-room so it
      // reaches the trainer's socket wherever it is connected.
      const alertRoomId = String(data.interviewId || socket.currentInterviewId || '');
      const room = alertRoomId ? getRoom(alertRoomId) : null;
      if (room) {
        for (const [peerSocketId, peerInfo] of room.peers) {
          if (peerInfo.role === 'TRAINER' || peerInfo.role === 'ADMIN') {
            relay.relayEmit(io, 'socket', peerSocketId, 'interview-alert', {
              alertId: alert.id,
              alertType: alert.alert_type,
              severity: alert.severity,
              sourceDevice: alert.source_device,
              message: alert.message,
              ts: alert.ts,
            });
          }
        }
      }
    }
  });

  /**
   * interview:yolo_frame: Real-time YOLO frame processing for candidate camera / mobile stream
   */
  socket.on('interview:yolo_frame', async (data, ack) => {
    try {
      const {
        frame,
        sessionId,
        participantId = socket.userId,
        cameraSource = 'PC_CAMERA',
        confidenceThreshold = 0.35,
        interviewId = socket.currentInterviewId,
      } = data || {};

      if (!frame || !sessionId) {
        return ack?.({ ok: false, error: 'frame and sessionId required' });
      }

      const yoloService = require('../services/yoloProctoringService');
      const res = await yoloService.analyzeFrame({
        frame,
        sessionId,
        participantId,
        moduleType: 'INTERVIEW',
        cameraSource,
        confidenceThreshold,
      });

      if (res?.success && res.proctoring_event) {
        const ev = res.proctoring_event;
        // Broadcast alert if suspicious event or state change
        if (ev.shouldBroadcast) {
          const alertRoomId = String(interviewId || sessionId);
          relay.relayEmit(io, 'room', `interview_${alertRoomId}`, 'interview-alert', {
            alertType: ev.eventType,
            severity: ev.severity,
            sourceDevice: cameraSource === 'MOBILE_CAMERA' ? 'MOBILE' : 'LAPTOP',
            message: `YOLO Monitor: ${ev.eventType} (${(ev.confidence * 100).toFixed(0)}%)`,
            metadata: {
              detectedClasses: ev.detectedClasses,
              confidence: ev.confidence,
              cameraSource,
            },
            ts: new Date(),
          });
        }
        ack?.({ ok: true, event: ev, detections: res.detections });
      } else {
        ack?.({ ok: false, error: res?.error });
      }
    } catch (err) {
      logger.warn('[SocketIO] interview:yolo_frame error:', err.message);
      ack?.({ ok: false, error: err.message });
    }
  });

  /**
   * code-sync: Shared code editor content broadcast.
   */
  socket.on('code-sync', (data) => {
    const { content, language, cursor } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId) return;

    // Broadcast to all peers except sender (last-write-wins for MVP)
    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'code-sync', {
      fromUserId: socket.userId,
      content,
      language,
      cursor,
      timestamp: Date.now(),
    }, { excludingSocket: socket });
  });

  /**
   * recording-status: Broadcast recording state changes.
   */
  socket.on('recording-status', (data) => {
    const { recording, deviceType } = data;
    const interviewId = data.interviewId != null ? String(data.interviewId) : null;
    if (!interviewId) return;

    relay.relayEmit(io, 'room', `interview_${interviewId}`, 'recording-status', {
      fromUserId: socket.userId,
      recording,
      deviceType,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * ICE restart request.
   */
  socket.on('ice-restart', (data) => {
    const { targetSocketId } = data;
    if (targetSocketId) {
      relay.relayEmit(io, 'socket', targetSocketId, 'ice-restart', {
        fromSocketId: socket.id,
      });
    }
  });

  /**
   * Disconnect: clean up room state.
   */
  socket.on('disconnect', async () => {
    if (socket.currentInterviewId) {
      await handleLeaveRoom(io, socket, String(socket.currentInterviewId));
    }
    logger.info('Interview socket disconnected', { socketId: socket.id, userId: socket.userId });
  });
}

/**
 * Handle socket leaving a room (disconnect or explicit leave-room).
 */
async function handleLeaveRoom(io, socket, interviewId) {
  const room = rooms.get(interviewId);
  if (!room) return;

  const peerInfo = room.removePeer(socket.id) || {};
  const deviceType = peerInfo.deviceType || 'LAPTOP';
  socket.leave(`interview_${interviewId}`);

  // Broadcast updated room:state snapshot to remaining room members
  broadcastRoomState(io, interviewId);

  // Notify remaining peers
  for (const [peerSocketId] of room.peers) {
    relay.relayEmit(io, 'socket', peerSocketId, 'peer-left', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      deviceType,
    });
  }

  // Mark device as disconnected
  try {
    const session = await InterviewSession.findOne({
      where: { interview_id: interviewId, status: { [Op.in]: ['WAITING', 'ACTIVE'] } },
    });
    if (session) {
      const where = {
        session_id: session.id,
        user_id: socket.userId,
        status: 'CONNECTED',
      };
      if (deviceType) where.device_type = deviceType;
      await InterviewDevice.update(
        { status: 'DISCONNECTED', disconnected_at: new Date() },
        { where }
      );

      await InterviewLog.create({
        session_id: session.id,
        actor_id: socket.userId,
        event_type: 'SOCKET_LEFT',
        payload_json: { socketId: socket.id, deviceType },
      }).catch(() => {});
    }
  } catch (err) {
    logger.error('Error handling leave room cleanup', { error: err.message });
  }

  // Tell the laptop side when the mobile camera goes away.
  if (deviceType === 'MOBILE') {
    console.log(`[WEBRTC SIGNALING] server: mobile-camera-disconnected emitted, roomId=${interviewId}, socketId=${socket.id}`);
    for (const [peerSocketId] of room.peers) {
      relay.relayEmit(io, 'socket', peerSocketId, 'device-status', {
        fromUserId: socket.userId,
        deviceType: 'MOBILE',
        connected: false,
        timestamp: new Date().toISOString(),
      });
      relay.relayEmit(io, 'socket', peerSocketId, 'mobile-camera-disconnected', {
        roomId: interviewId,
        socketId: socket.id,
        participantId: socket.userId,
        disconnectedAt: Date.now(),
      });
    }
  }

  // Clean up empty rooms
  if (room.peers.size === 0) {
    rooms.delete(interviewId);
  }
}

module.exports = { registerInterviewEvents, rooms, getRoom };
