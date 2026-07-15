import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../api/api'
import { getAuthHeaders } from '../api/request'
import { useSocketEvent } from './useSocket'

/**
 * Fetches notifications and subscribes to live `notification:new` /
 * `notification:read` socket events emitted by NotificationService.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/notifications?limit=20`, {
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load notifications')
      setNotifications(data.data || data.notifications || [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch (err) {
      setError(err.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  useSocketEvent('notification:new', (incoming) => {
    if (!incoming) return
    setNotifications((prev) => [incoming, ...prev].slice(0, 50))
    if (!incoming.isRead) setUnreadCount((c) => c + 1)
  })

  useSocketEvent('notification:read', ({ notificationId }) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  })

  const markRead = useCallback(async (id) => {
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      /* ignore — server will retry on next fetch */
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }, [])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markRead,
    markAllRead,
  }
}
