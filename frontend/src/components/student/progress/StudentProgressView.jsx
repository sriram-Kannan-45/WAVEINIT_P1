import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Award, BookOpen, CheckCircle2, AlertTriangle,
  RefreshCw, BarChart2, Star, ShieldCheck, Flame, ArrowUpRight
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function StudentProgressView({ user }) {
  const { error: showError, success: showSuccess } = useToast()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)

  const fetchProgress = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      const res = await fetchWithTimeout(API.ANALYTICS.STUDENT, {
        headers: getAuthHeaders(user),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setAnalytics(data.data || null)
        if (isManual) showSuccess?.('Progress metrics refreshed')
      } else {
        throw new Error(data.error || 'Failed to load progress analytics')
      }
    } catch (err) {
      console.error('Progress analytics error:', err.message)
      showError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, showError, showSuccess])

  useEffect(() => {
    fetchProgress()
  }, [fetchProgress])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <TrendingUp size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">My Learning Progress & Performance</h2>
          <p className="reg-admin-subtitle">Comprehensive overview of your course milestones, test accuracy, and skill growth.</p>
        </div>
        <button
          onClick={() => fetchProgress(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748B' }}>
          Loading your learning analytics...
        </div>
      ) : !analytics ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
          No analytics data available yet.
        </div>
      ) : (
        <>
          {/* ── Top Metric Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Average Test Score</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
                {analytics.averageScore}%
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>Best: <b>{analytics.bestScore}%</b></span>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Courses In Progress</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {analytics.inProgressCourses} / {analytics.totalEnrolled}
              </div>
              <span style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 600 }}>{analytics.completedCourses} Completed</span>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Attendance Standing</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
                {analytics.attendanceRate}%
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>{analytics.totalSessionsAttended} of {analytics.totalSessionsConducted} classes</span>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>Certificates Earned</span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#15803D', marginTop: 4 }}>
                {analytics.certificatesCount}
              </div>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>{analytics.badgesCount} Badges Unlocked</span>
            </div>
          </div>

          {/* ── Weak Areas & Recommendations ── */}
          {analytics.weakAreas && analytics.weakAreas.length > 0 && (
            <div style={{
              background: '#F0FDF4',
              borderRadius: 16,
              border: '1.5px solid #86EFAC',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14
            }}>
              <div style={{ background: '#DCFCE7', padding: 8, borderRadius: 10, color: '#15803D' }}>
                <AlertTriangle size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
                  Recommended Focus Areas (&lt; 60% Score)
                </h4>
                <p style={{ fontSize: 12.5, color: '#475569', margin: '0 0 10px' }}>
                  We identified topics where additional review can help boost your overall score:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {analytics.weakAreas.map((w, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #86EFAC',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#15803D'
                      }}
                    >
                      {w.title} ({w.score}%)
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Course Progress Bars ── */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 14px' }}>
              Course Progress & Milestones
            </h3>

            {analytics.courseProgress && analytics.courseProgress.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {analytics.courseProgress.map((cp, idx) => (
                  <div key={idx} style={{ padding: '10px 0', borderBottom: idx < analytics.courseProgress.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{cp.title}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>
                        {cp.progress}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 8, borderRadius: 4, background: '#F1F5F9', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, cp.progress)}%`,
                        height: '100%',
                        borderRadius: 4,
                        background: '#16A34A',
                        transition: 'width 300ms ease-out'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>No active course enrollments yet.</div>
            )}
          </div>

          {/* ── Test History Timeline ── */}
          {analytics.testHistory && analytics.testHistory.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 14px' }}>
                Test Score Progression
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Assessment</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px' }}>Type</th>
                      <th style={{ textAlign: 'center', padding: '10px 14px' }}>Score</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.testHistory.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{t.title}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748B', fontSize: 12 }}>{t.type}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 12,
                            background: t.score >= 70 ? '#DCFCE7' : t.score >= 50 ? '#FEF3C7' : '#FEE2E2',
                            color: t.score >= 70 ? '#15803D' : t.score >= 50 ? '#B45309' : '#B91C1C',
                            fontWeight: 700, fontSize: 12
                          }}>
                            {t.score}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B', fontSize: 12 }}>{t.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
