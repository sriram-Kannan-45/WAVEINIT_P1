import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../api/api'
import { getAuthHeaders } from '../api/request'

/**
 * Fetches participant-wide quiz performance analytics from the new
 * GET /api/ai-quiz/participant/stats endpoint.
 *
 * Shape:
 *   { totalQuizzes, averageScore, bestRank, accuracyTrend: [{date, accuracy}] }
 */
export function useStudentStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/ai-quiz/participant/stats`, {
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load stats')
      setStats(data.stats || data)
    } catch (err) {
      setError(err.message || 'Failed to load stats')
      // Don't blank stats on refetch error — keep last good copy
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}
