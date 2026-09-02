import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar, CheckCircle2, XCircle, Users, TrendingUp,
  RefreshCw, Search, Award, ShieldAlert, BarChart2, X
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'
import Pagination from '../../Pagination'

export default function AdminAttendanceAnalytics({ user }) {
  const { error: showError, success: showSuccess } = useToast()
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sessionPage, setSessionPage] = useState(1)
  const [sessionLimit, setSessionLimit] = useState(10)

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

  const filteredSessions = useMemo(() => {
    const list = analytics.recentSessions || []
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.courseTitle || '').toLowerCase().includes(q) ||
      (s.trainerName || '').toLowerCase().includes(q)
    )
  }, [analytics.recentSessions, searchQuery])

  useEffect(() => {
    setSessionPage(1)
  }, [searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / sessionLimit))
  const currentPage = Math.min(sessionPage, totalPages)
  const pagedSessions = useMemo(() => {
    const start = (currentPage - 1) * sessionLimit
    return filteredSessions.slice(start, start + sessionLimit)
  }, [filteredSessions, currentPage, sessionLimit])

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Recent Class Sessions Across All Programs ({filteredSessions.length})
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: '5px 12px',
            minWidth: 220,
          }}>
            <Search size={14} color="#94A3B8" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, width: '100%', color: '#1E293B' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94A3B8' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
            Loading attendance records...
          </div>
        ) : (analytics.recentSessions || []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
            No recent sessions recorded yet.
          </div>
        ) : filteredSessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8' }}>
            No sessions match your search query.
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
                {pagedSessions.map(s => (
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
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredSessions.length}
              pageSize={sessionLimit}
              onPageChange={(p) => setSessionPage(p)}
              onPageSizeChange={(s) => { setSessionLimit(s); setSessionPage(1); }}
              pageSizeOptions={[10, 25, 50, 100]}
              recordLabel="sessions"
            />
          </div>
        )}
      </div>
    </div>
  )
}
