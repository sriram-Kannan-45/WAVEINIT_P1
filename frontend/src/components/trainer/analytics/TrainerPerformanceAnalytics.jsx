import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart2, Users, BookOpen, CheckCircle2, TrendingUp,
  RefreshCw, Star, Calendar, Award
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function TrainerPerformanceAnalytics({ user }) {
  const { error: showError, success: showSuccess } = useToast()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)

  const fetchTrainerAnalytics = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      const res = await fetchWithTimeout(API.ANALYTICS.TRAINER, {
        headers: getAuthHeaders(user),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setAnalytics(data.data || null)
        if (isManual) showSuccess?.('Performance analytics refreshed')
      } else {
        throw new Error(data.error || 'Failed to load trainer analytics')
      }
    } catch (err) {
      console.error('Trainer analytics error:', err.message)
      showError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, showError, showSuccess])

  useEffect(() => {
    fetchTrainerAnalytics()
  }, [fetchTrainerAnalytics])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Top Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <BarChart2 size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Instructor Performance Analytics</h2>
          <p className="reg-admin-subtitle">Course completion rates, learner engagement, assessment results, and attendance metrics.</p>
        </div>
        <button
          onClick={() => fetchTrainerAnalytics(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748B' }}>
          Loading performance analytics...
        </div>
      ) : !analytics ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
          No analytics data available yet.
        </div>
      ) : (
        <>
          {/* ── Metric Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total Students Enrolled</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {analytics.totalStudents}
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>Across {analytics.totalCourses} courses</span>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Avg Completion Rate</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
                {analytics.averageCompletionRate}%
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>Course finish rate</span>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Attendance Rate</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
                {analytics.attendanceRate}%
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>Overall participation</span>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>Instructor Rating</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#15803D', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={22} fill="#16A34A" color="#16A34A" /> {analytics.averageFeedbackRating}
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>{analytics.totalFeedbacks} reviews</span>
            </div>
          </div>

          {/* ── Per Course Breakdown Table ── */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 14px' }}>
              Course Performance Breakdown
            </h3>

            {(analytics.courseBreakdown || []).length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
                No active courses assigned yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Course Title</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px' }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px' }}>Enrolled Students</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px' }}>Completed Students</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.courseBreakdown.map(c => (
                      <tr key={c.courseId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                          {c.title}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 12,
                            background: c.status === 'PUBLISHED' ? '#DCFCE7' : '#F1F5F9',
                            color: c.status === 'PUBLISHED' ? '#15803D' : '#64748B',
                            fontSize: 11, fontWeight: 700
                          }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                          {c.enrolledCount}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                          {c.completedCount}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 12,
                            background: c.completionRate >= 70 ? '#DCFCE7' : '#F1F5F9',
                            color: c.completionRate >= 70 ? '#15803D' : '#334155',
                            fontWeight: 700, fontSize: 12.5
                          }}>
                            {c.completionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
