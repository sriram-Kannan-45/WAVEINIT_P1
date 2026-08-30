import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Trophy, Medal, Crown, Star, TrendingUp, Search,
  RefreshCw, Filter, Award, BookOpen, CheckCircle2, Flame
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function StudentLeaderboardView({ user, enrollments = [] }) {
  const { error: showError, success: showSuccess } = useToast()

  const [scope, setScope] = useState('overall')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [timeframe, setTimeframe] = useState('all_time')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState([])
  const [summary, setSummary] = useState({ totalParticipants: 0, highestPoints: 0 })

  const fetchLeaderboard = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      let endpoint = `${API.LEADERBOARD.OVERALL}?timeframe=${timeframe}`
      if (scope === 'course' && selectedCourseId) {
        endpoint = `${API.LEADERBOARD.COURSE(selectedCourseId)}?timeframe=${timeframe}`
      }

      const res = await fetchWithTimeout(endpoint, {
        headers: getAuthHeaders(user),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setLeaderboard(data.leaderboard || [])
        setSummary(data.summary || { totalParticipants: 0, highestPoints: 0 })
        if (isManual) showSuccess?.('Leaderboard rankings updated')
      } else {
        throw new Error(data.error || 'Failed to load leaderboard')
      }
    } catch (err) {
      console.error('Leaderboard error:', err.message)
      showError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [scope, selectedCourseId, timeframe, user, showError, showSuccess])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const filteredLeaders = leaderboard.filter(item => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    return (
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.employeeId && item.employeeId.toLowerCase().includes(q))
    )
  })

  // Top 3 Podium
  const topThree = leaderboard.slice(0, 3)

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#DCFCE7', color: '#15803D' }}>
          <Crown size={16} />
        </div>
      )
    }
    if (rank === 2) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#F1F5F9', color: '#0F172A' }}>
          <Medal size={16} />
        </div>
      )
    }
    if (rank === 3) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#E2E8F0', color: '#334155' }}>
          <Medal size={16} />
        </div>
      )
    }
    return (
      <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>
        #{rank}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Top Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <Trophy size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Learner Leaderboard & Hall of Fame</h2>
          <p className="reg-admin-subtitle">Live rankings calculated from assessments, quizzes, lesson completions, and attendance.</p>
        </div>
        <button
          onClick={() => fetchLeaderboard(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Controls: Scope & Timeframe ── */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '14px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        {/* Scope Radio / Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { setScope('overall'); setSelectedCourseId('') }}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: scope === 'overall' ? '1px solid #16A34A' : '1px solid #E2E8F0',
              background: scope === 'overall' ? '#DCFCE7' : '#fff',
              color: scope === 'overall' ? '#15803D' : '#475569',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer'
            }}
          >
            🏆 Overall LMS
          </button>
          <button
            onClick={() => setScope('course')}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: scope === 'course' ? '1px solid #16A34A' : '1px solid #E2E8F0',
              background: scope === 'course' ? '#DCFCE7' : '#fff',
              color: scope === 'course' ? '#15803D' : '#475569',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer'
            }}
          >
            📚 By Course
          </button>

          {scope === 'course' && enrollments.length > 0 && (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 8, border: '1px solid #CBD5E1',
                fontSize: 12.5, color: '#334155', background: '#fff', outline: 'none'
              }}
            >
              <option value="">Select Enrolled Course</option>
              {enrollments.map(e => (
                <option key={e.courseId || e.id} value={e.courseId || e.id}>
                  {e.course?.title || e.training?.title || `Course #${e.courseId}`}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Timeframe & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search learner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px 6px 30px', borderRadius: 8,
                border: '1px solid #CBD5E1', fontSize: 12.5, outline: 'none'
              }}
            />
          </div>

          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 12.5, color: '#334155', background: '#fff', outline: 'none'
            }}
          >
            <option value="all_time">All Time</option>
            <option value="monthly">This Month</option>
            <option value="weekly">This Week</option>
          </select>
        </div>
      </div>

      {/* ── Podium Cards for Top 3 ── */}
      {!loading && topThree.length >= 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {topThree.map((item, idx) => {
            const isFirst = idx === 0
            const isSecond = idx === 1
            const isThird = idx === 2
            const crownBg = isFirst ? '#DCFCE7' : isSecond ? '#F1F5F9' : '#E2E8F0'
            const crownColor = isFirst ? '#15803D' : isSecond ? '#0F172A' : '#475569'
            const borderColor = isFirst ? '#86EFAC' : '#E2E8F0'

            return (
              <div
                key={item.userId || idx}
                style={{
                  background: isFirst ? 'linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)' : '#FFFFFF',
                  borderRadius: 18,
                  border: `1.5px solid ${borderColor}`,
                  padding: '20px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  boxShadow: isFirst ? '0 4px 15px rgba(22, 163, 74, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                  position: 'relative'
                }}
              >
                {/* Crown Icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: crownBg, color: crownColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10
                }}>
                  {isFirst ? <Crown size={24} /> : <Medal size={22} />}
                </div>

                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: crownColor }}>
                  Rank #{item.rank || idx + 1}
                </span>

                <h4 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '4px 0 2px' }}>
                  {item.name}
                </h4>
                <span style={{ fontSize: 12, color: '#64748B' }}>{item.department || item.email}</span>

                <div style={{
                  marginTop: 12, padding: '4px 14px', borderRadius: 20,
                  background: isFirst ? '#DCFCE7' : '#F1F5F9', color: isFirst ? '#15803D' : '#0F172A', fontWeight: 800, fontSize: 14
                }}>
                  ⚡ {item.totalPoints} pts
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12, fontSize: 11.5, color: '#64748B' }}>
                  <span>🎯 {item.quizScoreTotal + item.codingScoreTotal} quiz/code</span>
                  <span>•</span>
                  <span>📖 {item.lessonsCompleted} lessons</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Detailed Leaderboard Table ── */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 14px' }}>
          Leaderboard Standings ({filteredLeaders.length} Learners)
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
            Calculating leaderboard rankings...
          </div>
        ) : filteredLeaders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94A3B8' }}>
            <Trophy size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No ranking data available</div>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>Complete lessons, tests, and classes to earn points!</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: 'center', padding: '10px 14px' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Learner</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Assessment Marks</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Lessons Completed</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Classes Attended</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px' }}>Total Points</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeaders.map(item => {
                  const isCurrent = item.userId === user?.id
                  return (
                    <tr
                      key={item.userId}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: isCurrent ? '#F0FDF4' : 'transparent',
                        fontWeight: isCurrent ? 700 : 400
                      }}
                    >
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {getRankBadge(item.rank)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: '#E2E8F0',
                            color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700
                          }}>
                            {(item.name || 'S')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ color: '#0F172A', fontWeight: 600 }}>{item.name} {isCurrent && '(You)'}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{item.department || item.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                        {item.quizScoreTotal + item.codingScoreTotal} pts
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                        {item.lessonsCompleted}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                        {item.attendancePresentCount}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 14,
                          background: '#DCFCE7', color: '#15803D',
                          fontWeight: 800, fontSize: 13.5
                        }}>
                          ⚡ {item.totalPoints}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
