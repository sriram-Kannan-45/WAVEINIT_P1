import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../api/api'
import { getAuthHeaders } from '../api/request'
import { useSocket, useSocketEvent } from './useSocket'

/**
 * Fetches the global leaderboard and subscribes to live updates via Socket.IO.
 *
 * @param {Object} opts
 * @param {'global'|'training'|'quiz'} [opts.scope='global']
 * @param {number|string|null} [opts.id=null]   - Quiz id when scope='quiz', training id when scope='training'
 * @param {boolean} [opts.live=true]            - Whether to subscribe to socket updates
 */
export function useLeaderboard({ scope = 'global', id = null, live = true } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const { socket, isConnected } = useSocket()

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ scope })
      if (id != null) params.set('id', String(id))
      const res = await fetch(
        `${API_BASE}/ai-quiz/participant/global-leaderboard?${params.toString()}`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load leaderboard')
      setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : [])
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }, [scope, id])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  // Join / leave the relevant room when scope or id changes
  useEffect(() => {
    if (!live || !socket || !isConnected) return
    const room = `${scope}${id != null ? `:${id}` : ''}`
    socket.emit('leaderboard:join', { scope, id })
    return () => { socket.emit('leaderboard:leave', { scope, id }) }
  }, [socket, isConnected, scope, id, live])

  // Listen for incremental updates pushed from server
  useSocketEvent(
    'leaderboard:update',
    (payload) => {
      // Server sends { scope, id, leaderboard } — accept only matching scope/id
      if (!payload) return
      const matchesScope = payload.scope === scope
      const matchesId = String(payload.id ?? '') === String(id ?? '')
      if (matchesScope && matchesId && Array.isArray(payload.leaderboard)) {
        setEntries(payload.leaderboard)
        setLastUpdated(new Date())
      }
    },
    [scope, id]
  )

  return {
    entries,
    loading,
    error,
    lastUpdated,
    refetch: fetchLeaderboard,
  }
}
