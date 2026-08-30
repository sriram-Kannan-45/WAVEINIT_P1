import React, { useState, useEffect, useCallback } from 'react'
import {
  MessageSquare, Star, Shield, RefreshCw, Search,
  Filter, Users, BookOpen
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function AdminFeedbackAnalytics({ user }) {
  const { error: showError, success: showSuccess } = useToast()

  const [loading, setLoading] = useState(true)
  const [feedbacks, setFeedbacks] = useState([])
  const [summary, setSummary] = useState({
    totalResponses: 0,
    averageRating: 5.0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  })
  const [filterRating, setFilterRating] = useState('')
  const [search, setSearch] = useState('')

  const fetchAdminFeedbacks = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      const query = filterRating ? `?rating=${filterRating}` : ''
      const res = await fetchWithTimeout(`${API.FEEDBACK_SYSTEM.ADMIN_FEEDBACKS}${query}`, {
        headers: getAuthHeaders(user),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setFeedbacks(data.feedbacks || [])
        setSummary(data.summary || {})
        if (isManual) showSuccess?.('Feedback analytics updated')
      } else {
        throw new Error(data.error || 'Failed to load feedback analytics')
      }
    } catch (err) {
      console.error('Admin feedback error:', err.message)
      showError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [filterRating, user, showError, showSuccess])

  useEffect(() => {
    fetchAdminFeedbacks()
  }, [fetchAdminFeedbacks])

  const filteredFeedbacks = feedbacks.filter(f => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    return (
      (f.courseTitle && f.courseTitle.toLowerCase().includes(q)) ||
      (f.trainerName && f.trainerName.toLowerCase().includes(q)) ||
      (f.participantName && f.participantName.toLowerCase().includes(q)) ||
      (f.comments && f.comments.toLowerCase().includes(q))
    )
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <MessageSquare size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Platform Feedback & Sentiment Analytics</h2>
          <p className="reg-admin-subtitle">Monitor learner satisfaction, course reviews, and instructor ratings across the organization.</p>
        </div>
        <button
          onClick={() => fetchAdminFeedbacks(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 38, fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>
              {summary.averageRating}
            </div>
            <div style={{ fontSize: 12, color: '#15803D', fontWeight: 700, margin: '4px 0 2px' }}>
              ⭐ Overall Satisfaction
            </div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>{summary.totalResponses} Total Reviews</span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[5, 4, 3, 2, 1].map(stars => {
              const count = summary.ratingDistribution?.[stars] || 0
              const pct = summary.totalResponses > 0 ? (count / summary.totalResponses) * 100 : 0
              return (
                <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 22, color: '#475569', fontWeight: 600 }}>{stars}★</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#F1F5F9', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: '#16A34A' }} />
                  </div>
                  <span style={{ width: 20, textAlign: 'right', color: '#94A3B8', fontSize: 11 }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>Quality Assurance Oversight</h4>
          <p style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
            All course and instructor ratings are aggregated to ensure training standards. Any course falling below 3.5★ is flagged for review.
          </p>
        </div>
      </div>

      {/* ── Table & Feed ── */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Recent Reviews ({filteredFeedbacks.length})
          </h3>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: 180 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search course or instructor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5, outline: 'none' }}
              />
            </div>

            <select
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5, background: '#fff' }}
            >
              <option value="">All Star Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
            Loading reviews...
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
            No reviews found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Course / Program</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Trainer</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Student</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Rating</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Feedback Comments</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeedbacks.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>{f.courseTitle}</td>
                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13 }}>{f.trainerName}</td>
                    <td style={{ padding: '12px 14px', color: f.anonymous ? '#94A3B8' : '#334155', fontSize: 12.5 }}>
                      {f.participantName}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 12,
                        background: '#FEF3C7', color: '#B45309',
                        fontWeight: 700, fontSize: 12
                      }}>
                        ⭐ {f.courseRating || f.trainerRating}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: 12.5, maxWidth: 280 }}>
                      {f.comments ? `"${f.comments}"` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#64748B', fontSize: 12 }}>
                      {f.submittedAt ? new Date(f.submittedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
