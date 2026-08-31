import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Calendar, CheckCircle2, XCircle, Clock, AlertTriangle,
  RefreshCw, Filter, Search, Award, TrendingUp, ShieldCheck
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function StudentAttendanceView({ user }) {
  const { error: showError, success: showSuccess } = useToast()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    totalSessions: 0,
    presentSessions: 0,
    lateSessions: 0,
    absentSessions: 0,
    excusedSessions: 0,
    attendancePercentage: 100,
  })
  const [history, setHistory] = useState([])
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const fetchAttendance = useCallback(async (isManual = false) => {
    try {
      setLoading(true)
      const res = await fetchWithTimeout(API.ATTENDANCE.STUDENT_SUMMARY, {
        headers: getAuthHeaders(user),
      }, 10000)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setSummary(data.summary || {})
        setHistory(data.history || [])
        if (isManual) showSuccess?.('Attendance records refreshed')
      } else {
        throw new Error(data.error || 'Failed to load attendance summary')
      }
    } catch (err) {
      console.error('Student attendance error:', err.message)
      showError?.(err.message || 'Failed to load attendance records')
    } finally {
      setLoading(false)
    }
  }, [user, showError, showSuccess])

  useEffect(() => {
    fetchAttendance()
  }, [fetchAttendance])

  const filteredHistory = history.filter(item => {
    const matchStatus = statusFilter === 'ALL' || item.status === statusFilter
    const matchSearch = !search.trim() ||
      (item.sessionTitle && item.sessionTitle.toLowerCase().includes(search.toLowerCase())) ||
      (item.courseTitle && item.courseTitle.toLowerCase().includes(search.toLowerCase()))
    return matchStatus && matchSearch
  })

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: '#DCFCE7', color: '#15803D',
            fontSize: 12, fontWeight: 600
          }}>
            <CheckCircle2 size={13} /> Present
          </span>
        )
      case 'LATE':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: '#FEF3C7', color: '#B45309',
            fontSize: 12, fontWeight: 600
          }}>
            <Clock size={13} /> Late
          </span>
        )
      case 'EXCUSED':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: '#E0E7FF', color: '#4338CA',
            fontSize: 12, fontWeight: 600
          }}>
            <ShieldCheck size={13} /> Excused
          </span>
        )
      case 'ABSENT':
      default:
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: '#FEE2E2', color: '#B91C1C',
            fontSize: 12, fontWeight: 600
          }}>
            <XCircle size={13} /> Absent
          </span>
        )
    }
  }

  const renderSlotBadge = (sessionType) => {
    const isMorning = (sessionType || 'MORNING').toUpperCase() === 'MORNING'
    const isEvening = (sessionType || '').toUpperCase() === 'EVENING'

    if (isMorning) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 7px', borderRadius: 4,
          background: '#FEF3C7', color: '#B45309',
          fontSize: 11, fontWeight: 700
        }}>
          Morning
        </span>
      )
    }
    if (isEvening) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 7px', borderRadius: 4,
          background: '#E0E7FF', color: '#4338CA',
          fontSize: 11, fontWeight: 700
        }}>
          Evening
        </span>
      )
    }
    return null
  }

  const isGoodAttendance = summary.attendancePercentage >= 75

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16a34a' }}>
          <Calendar size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">My Attendance & Sessions</h2>
          <p className="reg-admin-subtitle">Track your daily Morning & Evening class attendance rate and session history.</p>
        </div>
        <button
          onClick={() => fetchAttendance(true)}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── KPI Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {/* Attendance Percentage Dial */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: isGoodAttendance ? '#DCFCE7' : '#FEE2E2',
            color: isGoodAttendance ? '#16A34A' : '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 800
          }}>
            {summary.attendancePercentage}%
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Overall Attendance</span>
            <div style={{ fontSize: 18, fontWeight: 700, color: isGoodAttendance ? '#15803D' : '#B91C1C' }}>
              {isGoodAttendance ? 'Good Standing' : 'Needs Improvement'}
            </div>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Minimum 75% required</span>
          </div>
        </div>

        {/* Total Sessions */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total Sessions Conducted</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {summary.totalSessions}
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>Morning & Evening combined</span>
        </div>

        {/* Classes Attended */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Attended (Present)</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {summary.presentSessions}
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>Full credit received</span>
        </div>

        {/* Classes Missed */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Missed (Absent)</span>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {summary.absentSessions}
          </div>
          <span style={{ fontSize: 11.5, color: '#64748B' }}>
            {summary.lateSessions > 0 ? `${summary.lateSessions} late, ` : ''}{summary.excusedSessions} excused
          </span>
        </div>
      </div>

      {/* ── Session History Table & Filters ── */}
      <div style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #E2E8F0',
        padding: '20px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Daily Attendance Log</h3>
            <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0' }}>Detailed record of past sessions and marked status.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search session or course..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  fontSize: 12.5,
                  outline: 'none',
                }}
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                fontSize: 12.5,
                color: '#334155',
                outline: 'none',
                background: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="EXCUSED">Excused</option>
            </select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: 13 }}>
            Loading attendance records...
          </div>
        ) : filteredHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94A3B8' }}>
            <Calendar size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No attendance records found</div>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>Sessions marked by your trainer will appear here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Session / Slot</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Course</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date & Time</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item, idx) => (
                  <tr key={item.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{item.sessionTitle}</span>
                        {renderSlotBadge(item.sessionType)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13 }}>
                      {item.courseTitle}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12.5 }}>
                      <div>{item.sessionDate ? new Date(item.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                      {item.startTime && <div style={{ fontSize: 11, color: '#94A3B8' }}>{item.startTime}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {getStatusBadge(item.status)}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12 }}>
                      {item.remarks || '—'}
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
