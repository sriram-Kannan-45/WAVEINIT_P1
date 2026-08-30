import React, { useState, useEffect, useCallback } from 'react'
import {
  Calendar, CheckCircle2, XCircle, Users, TrendingUp,
  RefreshCw, Search, Award, ShieldAlert, BarChart2
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function AdminAttendanceAnalytics({ user }) {
  const { error: showError, success: showSuccess } = useToast()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState({
    totalSessions: 0,
    totalRecords: 0,
    presentRecords: 0,
    absentRecords: 0,
    orgAttendanceRate: 0,
    recentSessions: [],
  })

  const fetchAdminAnalytics = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      const res = await fetchWithTimeout(API.ATTENDANCE.ADMIN_ANALYTICS, {
        headers: getAuthHeaders(user),
      }, 10000)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setAnalytics(data.analytics || {})
        if (isManual) showSuccess?.('Attendance analytics refreshed')
      } else {
        throw new Error(data.error || 'Failed to fetch attendance analytics')
      }
    } catch (err) {
      console.error('Admin attendance error:', err.message)
      showError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, showError, showSuccess])

  useEffect(() => {
    fetchAdminAnalytics()
  }, [fetchAdminAnalytics])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <Calendar size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Organization Attendance Center</h2>
          <p className="reg-admin-subtitle">Cross-program participation rates, daily attendance records, and trainer conduct logs.</p>
        </div>
        <button
          onClick={() => fetchAdminAnalytics(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── KPI Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Org-Wide Attendance Rate</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {analytics.orgAttendanceRate}%
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>Average across all courses</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total Sessions Conducted</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {analytics.totalSessions}
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>Lectures & batch sessions</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Total Present Checks</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {analytics.presentRecords}
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>Verified attendances</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Total Absent Checks</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {analytics.absentRecords}
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>Recorded absences</span>
        </div>
      </div>

      {/* ── Recent Sessions Breakdown ── */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 14px' }}>
          Recent Class Sessions Across All Programs
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
            Loading attendance records...
          </div>
        ) : (analytics.recentSessions || []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
            No recent sessions recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Session / Topic</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Course</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Trainer</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Present / Total</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Attendance Rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentSessions.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                      {s.title}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13 }}>
                      {s.courseTitle}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13 }}>
                      {s.trainerName}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12.5 }}>
                      {s.sessionDate ? new Date(s.sessionDate).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                      {s.presentCount} / {s.totalMarked}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 12,
                        background: s.rate >= 75 ? '#DCFCE7' : '#FEE2E2',
                        color: s.rate >= 75 ? '#15803D' : '#B91C1C',
                        fontWeight: 700, fontSize: 12
                      }}>
                        {s.rate}%
                      </span>
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
