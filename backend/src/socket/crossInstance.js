/**
 * crossInstance — Socket.IO cross-instance delivery without Redis.
 *
 * When the @socket.io/redis-adapter is active, `io.to(...).emit(...)` already
 * fans out to every instance and this module is a no-op passthrough.
 *
 * When Redis is absent (default deployment), Socket.IO room/socket state lives
 * per instance. A socket connected to instance A is invisible to instance B, so
 * interview WebRTC signaling and user-room notifications would not be delivered
 * when scaled-out. This module bridges that gap with a tiny DB outbox:
 *
 *   1. The emitting instance delivers to its LOCAL members immediately and
 *      records the row in a per-instance dedupe map (so its poller skips it).
 *   2. A row is appended to `socket_relay_events`.
 *   3. Every instance runs a short poller. For each pending row it delivers to
 *      ITS local members exactly once (dedupe map keyed by row id), and garbage
 *      collects rows older than maxAgeMs.
 *
 * Events are ephemeral / at-least-once, which is the right trade-off for
 * signaling + notifications. High-volume video frames are NOT relayed.
 */

const SocketRelayEvent = require('../models/SocketRelayEvent');
const { getInstanceId } = require('../config/instance');
const logger = require('../utils/logger');

const adapterMode = { value: 'single' }; // 'single' | 'redis'
let poller = null;

/** Set 'redis' once setupRedisAdapter succeeds (called from config/socket.js). */
function setAdapterMode(mode) {
  adapterMode.value = mode;
}

function isClusterMode() {
  return adapterMode.value === 'redis';
}

/** Deliver `event` to the target on THIS instance. Returns number of local recipients. */
function emitLocal(io, targetType, target, event, payload) {
  try {
    const nsp = io.of('/');
    switch (targetType) {
      case 'socket': {
        const sock = nsp.sockets.get(target);
        if (sock) {
          sock.emit(event, payload);
          return 1;
        }
        return 0;
      }
      case 'user-room': {
        const room = `user_${target}`;
        const roomSet = nsp.adapter.rooms.get(room);
        const count = roomSet ? roomSet.size : 0;
        if (count > 0) io.to(room).emit(event, payload);
        return count;
      }
      case 'broadcast': {
        io.emit(event, payload);
        return Infinity;
      }
      case 'room':
      default: {
        const roomSet = nsp.adapter.rooms.get(target);
        const count = roomSet ? roomSet.size : 0;
        if (count > 0) io.to(target).emit(event, payload);
        return count;
      }
    }
  } catch (err) {
    logger.warn('[relay] emitLocal failed', { error: err.message, targetType, target, event });
    return 0;
  }
}

// ── Per-instance dedupe store ────────────────────────────────────────────────
const DEDUPE_TTL_MS = 2000;
const localDelivered = new Map();

function pruneDedupe() {
  const now = Date.now();
  for (const [id, ts] of localDelivered) {
    if (now - ts > DEDUPE_TTL_MS) localDelivered.delete(id);
  }
}

function markDelivered(rowId) {
  pruneDedupe();
  if (localDelivered.has(rowId)) return false;
  localDelivered.set(rowId, Date.now());
  return true;
}

/**
 * Deliver an event to a target that may live on any instance.
 * @param {Object} io          Socket.IO server
 * @param {string} targetType  'socket' | 'room' | 'user-room' | 'broadcast'
 * @param {string|number} target  socket id / room name / user id
 * @param {string} event    event name
 * @param {*}      payload  JSON-serializable payload
 * @param {Object} [opts]
 * @param {Object} [opts.excludingSocket]  when set, the LOCAL delivery uses
 *   `excludingSocket.to(target).emit(...)` so the sender is excluded exactly as
 *   the existing `socket.to(room)` semantics. Other instances emit to the whole
 *   target (the sender lives on this instance, so it never double-receives).
 */
async function relayEmit(io, targetType, target, event, payload, opts = {}) {
  const { excludingSocket } = opts;

  if (excludingSocket) {
    try {
      excludingSocket.to(target).emit(event, payload);
    } catch (err) {
      logger.warn('[relay] local emit (excl sender) failed', { error: err.message, event, target });
    }
  } else {
    emitLocal(io, targetType, target, event, payload);
  }

  if (isClusterMode()) return; // Redis adapter already fans out cross-instance.

  try {
    const row = await SocketRelayEvent.create({
      namespace: '/',
      targetType,
      target: String(target),
      event,
      payload: payload === undefined ? null : payload,
      status: 'pending',
      claimOwner: getInstanceId(),
    });
    // This instance already delivered inline; its poller must skip the row.
    markDelivered(row.id);
  } catch (err) {
    // Outbox write failed (rare) — local delivery above already happened.
    logger.warn('[relay] outbox insert failed', { error: err.message, event, target });
  }
}

// ── Poller ──────────────────────────────────────────────────────────────────
async function pollRelay(io, { maxAgeMs = 5000, batchSize = 100 } = {}) {
  let rows;
  try {
    rows = await SocketRelayEvent.findAll({
      where: { status: 'pending' },
      order: [['id', 'ASC']],
      limit: batchSize,
    });
  } catch (err) {
    return; // DB down — try again next tick
  }

  const cutoff = Date.now() - maxAgeMs;
  for (const row of rows) {
    if (markDelivered(row.id)) {
      emitLocal(io, row.targetType, row.target, row.event, row.payload);
    }

    // GC: rows older than maxAgeMs have been seen by every healthy instance.
    if (new Date(row.createdAt).getTime() < cutoff) {
      try {
        await row.destroy();
      } catch (_) { /* already deleted by another instance */ }
    }
  }
}

/** Start the poller. Safe to call multiple times (idempotent per instance). */
function startRelayPoller(io, opts = {}) {
  if (poller || isClusterMode()) return poller;
  const intervalMs = opts.intervalMs || 120;
  poller = setInterval(async () => {
    try {
      await pollRelay(io, opts);
    } catch (err) {
      logger.warn('[relay] poll cycle failed', { error: err.message });
    }
  }, intervalMs);
  if (poller.unref) poller.unref();
  return poller;
}

function stopRelayPoller() {
  if (poller) {
    clearInterval(poller);
    poller = null;
  }
}

module.exports = {
  relayEmit,
  emitLocal,
  isClusterMode,
  setAdapterMode,
  startRelayPoller,
  stopRelayPoller,
};