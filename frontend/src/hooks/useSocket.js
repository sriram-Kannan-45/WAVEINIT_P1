import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { BACKEND_ORIGIN } from '../api/api'

/**
 * Singleton Socket.IO client.
 * Exactly one TCP connection per tab — multiple useSocket() callers
 * share the same instance and add/remove listeners independently.
 *
 * Auth: pulls JWT from localStorage 'user' key (matches getAuthHeaders).
 * Reconnection: handled by socket.io-client defaults.
 */

let socketRef = null
let connectionState = 'disconnected'  // 'connecting' | 'connected' | 'disconnected'
const stateListeners = new Set()

function notifyState(next) {
  connectionState = next
  // Execute listener updates in a microtask so setState is never invoked
  // synchronously during a React component's render phase.
  queueMicrotask(() => {
    stateListeners.forEach((fn) => fn(next))
  })
}

function getStoredToken() {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token || parsed?.accessToken || null
  } catch {
    return null
  }
}

function ensureSocket() {
  const token = getStoredToken()
  if (!token) {
    if (socketRef) {
      socketRef.disconnect()
      socketRef = null
      notifyState('disconnected')
    }
    return null
  }

  // If socket already exists with the current token
  if (socketRef && socketRef.auth?.token === token) {
    if (socketRef.connected) return socketRef
    if (!socketRef.disconnected) return socketRef
    socketRef.connect()
    return socketRef
  }

  // If token changed or previous socket needs replacement
  if (socketRef) {
    socketRef.disconnect()
    socketRef = null
  }

  socketRef = io(BACKEND_ORIGIN, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })

  socketRef.on('connect', () => notifyState('connected'))
  socketRef.on('disconnect', () => notifyState('disconnected'))
  socketRef.on('connect_error', (err) => {
    console.warn('[Socket.IO] connect_error:', err?.message)
    notifyState('disconnected')
  })
  notifyState('connecting')

  return socketRef
}

export function useSocket() {
  const [state, setState] = useState(connectionState)
  const socket = ensureSocket()

  useEffect(() => {
    stateListeners.add(setState)
    return () => stateListeners.delete(setState)
  }, [])

  return { socket, state, isConnected: state === 'connected' }
}

/**
 * Subscribe to a single socket event with automatic cleanup.
 * `deps` must include any captured variables.
 */
export function useSocketEvent(event, handler, deps = []) {
  const { socket } = useSocket()
  const handlerRef = useRef(handler)

  // Keep latest handler without re-binding listener
  useEffect(() => { handlerRef.current = handler }, [handler])

  useEffect(() => {
    if (!socket) return
    const wrapped = (...args) => handlerRef.current?.(...args)
    socket.on(event, wrapped)
    return () => { socket.off(event, wrapped) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, event, ...deps])
}

/** Force-disconnect on logout. */
export function disconnectSocket() {
  if (socketRef) {
    socketRef.disconnect()
    socketRef = null
    notifyState('disconnected')
  }
}
