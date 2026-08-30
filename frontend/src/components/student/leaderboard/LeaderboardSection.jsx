import { useState, useEffect } from 'react'
import { Trophy, Medal, TrendingUp, Loader2 } from 'lucide-react'
import { API_BASE } from '../../../api/api'

function getAuthHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const token = user?.token || user?.accessToken || ''
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export default function LeaderboardSection({ enrollments = [], quizzes = [], currentUserId }) {
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch(`${API_BASE}/ai-quiz/leaderboard`, {
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        })
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (!cancelled) setLeaders(data.leaderboard || data || [])
      } catch {
        if (!cancelled) {
          const computed = (enrollments || [])
            .filter(e => e.score != null)
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 10)
            .map((e, i) => ({ rank: i + 1, name: e.participantName || `User #${e.participantId}`, score: e.score }))
          setLeaders(computed)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchLeaderboard()
    return () => { cancelled = true }
  }, [enrollments])

  const rankIcon = (rank) => {
    if (rank === 1) return <Trophy size={18} style={{ color: '#16A34A' }} />
    if (rank === 2) return <Medal size={18} style={{ color: '#0F172A' }} />
    if (rank === 3) return <Medal size={18} style={{ color: '#475569' }} />
    return <span style={{ color: 'var(--neutral-400)', fontWeight: 600, fontSize: 14 }}>{rank}</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Poppins', sans-serif" }}>
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <Trophy size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Leaderboard</h2>
          <p className="reg-admin-subtitle">Top performers across all quizzes and learning modules</p>
        </div>
      </div>

      <div className="enterprise-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand-participant)' }} />
          </div>
        ) : leaders.length === 0 ? (
          <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--neutral-400)' }}>
            <TrendingUp size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
            No leaderboard data yet
          </div>
        ) : (
          <div>
            {leaders.map((entry, idx) => (
              <div
                key={entry.id || entry.participantId || idx}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-4) var(--space-6)',
                  borderBottom: idx < leaders.length - 1 ? '1px solid var(--neutral-100)' : 'none',
                  background: entry.userId === currentUserId || entry.participantId === currentUserId
                    ? 'var(--brand-participant-bg)' : 'transparent',
                  transition: 'background 150ms',
                }}
              >
                <div style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                  {rankIcon(entry.rank || idx + 1)}
                </div>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand-participant)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                  {(entry.name || entry.participantName || 'U')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--neutral-800)' }}>{entry.name || entry.participantName || 'Unknown'}</div>
                  {entry.courseName && <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{entry.courseName}</div>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--brand-participant)' }}>
                  {entry.score != null ? `${entry.score}%` : entry.points || '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
