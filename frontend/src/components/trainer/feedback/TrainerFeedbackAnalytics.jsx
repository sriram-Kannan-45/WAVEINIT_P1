import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  MessageSquare, Star, Reply, Shield, RefreshCw,
  Search, Filter, CheckCircle2, User, ChevronDown
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function TrainerFeedbackAnalytics({ user }) {
  const { error: showError, success: showSuccess } = useToast()

  const [loading, setLoading] = useState(true)
  const [feedbacks, setFeedbacks] = useState([])
  const [summary, setSummary] = useState({
    totalResponses: 0,
    averageRating: 5.0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  })
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [replyingFeedbackId, setReplyingFeedbackId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [savingReply, setSavingReply] = useState(false)

  const fetchFeedbacks = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      const query = selectedCourseId ? `?courseId=${selectedCourseId}` : ''
      const res = await fetchWithTimeout(`${API.FEEDBACK_SYSTEM.TRAINER_FEEDBACKS}${query}`, {
        headers: getAuthHeaders(user),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setFeedbacks(data.feedbacks || [])
        setSummary(data.summary || {})
        if (isManual) showSuccess?.('Feedback analytics updated')
      } else {
        throw new Error(data.error || 'Failed to load feedbacks')
      }
    } catch (err) {
      console.error('Trainer feedback error:', err.message)
      showError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedCourseId, user, showError, showSuccess])

  useEffect(() => {
    fetchFeedbacks()
  }, [fetchFeedbacks])

  const handleSendReply = async (feedbackId) => {
    if (!replyText.trim()) return
    try {
      setSavingReply(true)
      const res = await fetchWithTimeout(API.FEEDBACK_SYSTEM.REPLY(feedbackId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(user) },
        body: JSON.stringify({ trainerResponse: replyText.trim() })
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        showSuccess?.('Reply published successfully')
        setReplyingFeedbackId(null)
        setReplyText('')
        fetchFeedbacks()
      } else {
        throw new Error(data.error || 'Failed to submit reply')
      }
    } catch (err) {
      console.error('Reply error:', err.message)
      showError?.(err.message)
    } finally {
      setSavingReply(false)
    }
  }

  const renderStarBadges = (rating) => {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#16A34A' }}>
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} size={14} fill={s <= rating ? '#16A34A' : 'none'} color={s <= rating ? '#16A34A' : '#CBD5E1'} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Top Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <MessageSquare size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Student Feedback & Ratings</h2>
          <p className="reg-admin-subtitle">Review learner evaluations, rating distributions, and respond to student inquiries.</p>
        </div>
        <button
          onClick={() => fetchFeedbacks(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Summary Cards & Star Breakdown ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Rating Overview */}
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 38, fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>
              {summary.averageRating}
            </div>
            <div style={{ margin: '6px 0 2px' }}>
              {renderStarBadges(Math.round(summary.averageRating))}
            </div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>{summary.totalResponses} Reviews</span>
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

        {/* Info Card */}
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Shield size={20} color="#16A34A" />
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>Student Privacy Protection</h4>
          </div>
          <p style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5, margin: 0 }}>
            Students can choose to submit feedback anonymously. In anonymous reviews, identifying details (name, email, avatar) are masked to ensure truthful student sentiment.
          </p>
        </div>
      </div>

      {/* ── Feedbacks Feed ── */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 16px' }}>
          Student Reviews ({feedbacks.length})
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
            Loading feedback reviews...
          </div>
        ) : feedbacks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94A3B8' }}>
            <MessageSquare size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No student feedback submitted yet</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {feedbacks.map(f => (
              <div
                key={f.id}
                style={{
                  padding: '16px',
                  borderRadius: 14,
                  border: '1px solid #F1F5F9',
                  background: '#F8FAFC',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: f.anonymous ? '#E2E8F0' : '#DCFCE7',
                      color: f.anonymous ? '#64748B' : '#15803D',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700
                    }}>
                      {f.anonymous ? <Shield size={16} /> : (f.participantName || 'S')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                        {f.participantName}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>
                        Course: <b>{f.courseTitle}</b> • {f.submittedAt ? new Date(f.submittedAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                  </div>

                  <div>
                    {renderStarBadges(f.courseRating || f.trainerRating || 5)}
                  </div>
                </div>

                {f.comments && (
                  <p style={{ fontSize: 13, color: '#334155', margin: '2px 0 0', lineHeight: 1.5 }}>
                    "{f.comments}"
                  </p>
                )}

                {/* Trainer's existing response */}
                {f.trainerResponse && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: '#F0FDF4', borderLeft: '3px solid #16A34A',
                    fontSize: 12.5, color: '#15803D', marginTop: 4
                  }}>
                    <b>Instructor Response:</b> {f.trainerResponse}
                  </div>
                )}

                {/* Reply Button / Box */}
                {!f.trainerResponse && (
                  <div>
                    {replyingFeedbackId === f.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                        <textarea
                          rows={2}
                          placeholder="Type your response to this student review..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button
                            onClick={() => { setReplyingFeedbackId(null); setReplyText('') }}
                            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', fontSize: 12, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSendReply(f.id)}
                            disabled={savingReply}
                            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#16A34A', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {savingReply ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setReplyingFeedbackId(f.id); setReplyText('') }}
                        style={{
                          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 6, border: '1px solid #CBD5E1',
                          background: '#fff', color: '#475569', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', marginTop: 4
                        }}
                      >
                        <Reply size={12} /> Respond
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
