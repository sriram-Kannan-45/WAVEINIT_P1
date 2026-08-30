import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Plus, Users, CheckCircle2, XCircle, Clock, ShieldCheck,
  Search, RefreshCw, AlertTriangle, ChevronRight, Save, CheckSquare,
  Square, Filter, ArrowLeft
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function TrainerAttendanceManagement({ user }) {
  const { error: showError, success: showSuccess } = useToast()

  // State
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [summary, setSummary] = useState(null)

  // Active Session for Marking
  const [activeSession, setActiveSession] = useState(null)
  const [sessionStudents, setSessionStudents] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])

  // Create Session Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newSessionForm, setNewSessionForm] = useState({
    title: '',
    courseId: '',
    sessionDate: new Date().toISOString().split('T')[0],
    startTime: '10:00 AM',
    endTime: '11:30 AM',
    batchName: '',
    topic: '',
  })

  // Load Trainer's Courses
  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(API.TRAINER_COURSES.LIST, {
        headers: getAuthHeaders(user),
      }, 10000)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.courses) {
        setCourses(data.courses || [])
      }
    } catch (err) {
      console.error('Error loading courses:', err.message)
    }
  }, [user])

  // Load Sessions & Summary
  const fetchSessions = useCallback(async (isManual = false) => {
    try {
      setLoadingSessions(true)
      const query = selectedCourseId ? `?courseId=${selectedCourseId}` : ''
      
      const [resSessions, resSummary] = await Promise.all([
        fetchWithTimeout(`${API.ATTENDANCE.SESSIONS}${query}`, { headers: getAuthHeaders(user) }, 10000),
        fetchWithTimeout(`${API.ATTENDANCE.TRAINER_SUMMARY}${query}`, { headers: getAuthHeaders(user) }, 10000),
      ])

      const dataSessions = await resSessions.json().catch(() => ({}))
      const dataSummary = await resSummary.json().catch(() => ({}))

      if (dataSessions.success) setSessions(dataSessions.sessions || [])
      if (dataSummary.success) setSummary(dataSummary.summary || null)

      if (isManual) showSuccess?.('Attendance sessions updated')
    } catch (err) {
      console.error('Trainer attendance error:', err.message)
      showError?.('Failed to load attendance sessions')
    } finally {
      setLoadingSessions(false)
    }
  }, [selectedCourseId, user, showError, showSuccess])

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Open Marking Sheet
  const handleOpenSession = async (session) => {
    try {
      setActiveSession(session)
      setLoadingDetail(true)
      setSelectedStudentIds([])
      const res = await fetchWithTimeout(API.ATTENDANCE.SESSION_DETAIL(session.id), {
        headers: getAuthHeaders(user),
      }, 10000)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setSessionStudents(data.students || [])
      } else {
        throw new Error(data.error || 'Failed to load student attendance sheet')
      }
    } catch (err) {
      console.error('Session detail error:', err.message)
      showError?.(err.message)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Quick Action: Mark All Present
  const handleMarkAllPresent = () => {
    setSessionStudents(prev => prev.map(s => ({ ...s, status: 'PRESENT' })))
  }

  // Change individual student status
  const handleStatusChange = (studentId, newStatus) => {
    setSessionStudents(prev => prev.map(s => (s.studentId === studentId ? { ...s, status: newStatus } : s)))
  }

  // Change remarks
  const handleRemarksChange = (studentId, remarks) => {
    setSessionStudents(prev => prev.map(s => (s.studentId === studentId ? { ...s, remarks } : s)))
  }

  // Toggle selection
  const toggleSelectStudent = (studentId) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    )
  }

  // Select all / none
  const toggleSelectAll = () => {
    if (selectedStudentIds.length === sessionStudents.length) {
      setSelectedStudentIds([])
    } else {
      setSelectedStudentIds(sessionStudents.map(s => s.studentId))
    }
  }

  // Apply status to selected
  const applyStatusToSelected = (status) => {
    if (selectedStudentIds.length === 0) return
    setSessionStudents(prev => prev.map(s =>
      selectedStudentIds.includes(s.studentId) ? { ...s, status } : s
    ))
  }

  // Save Attendance to Backend
  const handleSaveAttendance = async () => {
    if (!activeSession) return
    try {
      setSavingAttendance(true)
      const payload = {
        records: sessionStudents.map(s => ({
          studentId: s.studentId,
          status: s.status || 'PRESENT',
          remarks: s.remarks || '',
        }))
      }

      const res = await fetchWithTimeout(API.ATTENDANCE.MARK(activeSession.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(user) },
        body: JSON.stringify(payload),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        showSuccess?.('Attendance records saved successfully')
        fetchSessions()
      } else {
        throw new Error(data.error || 'Failed to save attendance')
      }
    } catch (err) {
      console.error('Save attendance error:', err.message)
      showError?.(err.message)
    } finally {
      setSavingAttendance(false)
    }
  }

  // Create Session Submit
  const handleCreateSessionSubmit = async (e) => {
    e.preventDefault()
    if (!newSessionForm.title.trim() || !newSessionForm.sessionDate) {
      showError?.('Session title and date are required')
      return
    }

    try {
      const res = await fetchWithTimeout(API.ATTENDANCE.CREATE_SESSION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(user) },
        body: JSON.stringify({
          ...newSessionForm,
          courseId: newSessionForm.courseId || selectedCourseId || (courses[0]?.id || null),
        }),
      }, 10000)

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        showSuccess?.('New class session created!')
        setShowCreateModal(false)
        setNewSessionForm({
          title: '',
          courseId: selectedCourseId,
          sessionDate: new Date().toISOString().split('T')[0],
          startTime: '10:00 AM',
          endTime: '11:30 AM',
          batchName: '',
          topic: '',
        })
        fetchSessions()
        // Open the newly created session
        if (data.session) handleOpenSession(data.session)
      } else {
        throw new Error(data.error || 'Failed to create session')
      }
    } catch (err) {
      console.error('Create session error:', err.message)
      showError?.(err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Top Header ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <Calendar size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="reg-admin-title">Class & Attendance Management</h2>
          <p className="reg-admin-subtitle">Schedule sessions, record student attendance, and monitor participation rates.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => fetchSessions(true)}
            className="reg-admin-btn reg-admin-btn--secondary"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="reg-admin-btn reg-admin-btn--primary"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: '#16A34A', color: '#fff' }}
          >
            <Plus size={16} /> New Session
          </button>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total Sessions Conducted</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{summary.totalSessions}</div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>Across active courses</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Overall Attendance Rate</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{summary.overallAttendanceRate}%</div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>Class average</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Students Tracked</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{summary.totalStudentsTracked}</div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>Enrolled participants</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: 12, color: summary.lowAttendanceCount > 0 ? '#DC2626' : '#64748B', fontWeight: 600 }}>
              Low Attendance (&lt;75%)
            </span>
            <div style={{ fontSize: 24, fontWeight: 800, color: summary.lowAttendanceCount > 0 ? '#DC2626' : '#0F172A', marginTop: 4 }}>
              {summary.lowAttendanceCount}
            </div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>Require follow-up</span>
          </div>
        </div>
      )}

      {/* ── Main View: Sessions List or Active Marking Sheet ── */}
      {!activeSession ? (
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
          {/* Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Class Sessions</h3>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0' }}>Select a session to mark or review attendance.</p>
            </div>

            {/* Course Filter */}
            {courses.length > 0 && (
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
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
                <option value="">All Courses ({courses.length})</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Sessions Table */}
          {loadingSessions ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: 13 }}>
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94A3B8' }}>
              <Calendar size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No sessions created yet</div>
              <p style={{ fontSize: 12, margin: '4px 0 16px' }}>Click "New Session" to schedule your first class.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="reg-admin-btn reg-admin-btn--primary"
                style={{ cursor: 'pointer', background: '#16A34A', color: '#fff' }}
              >
                <Plus size={14} /> Schedule First Session
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Session / Topic</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Course</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date & Time</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Marked / Enrolled</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Attendance Rate</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                        <div>{s.title}</div>
                        {s.topic && <div style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>{s.topic}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13 }}>
                        {s.courseTitle}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12.5 }}>
                        <div>{s.sessionDate ? new Date(s.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                        {s.startTime && <div style={{ fontSize: 11, color: '#94A3B8' }}>{s.startTime} - {s.endTime || ''}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                        <span style={{ color: '#16A34A' }}>{s.presentCount} P</span> / <span style={{ color: '#DC2626' }}>{s.absentCount} A</span>
                        {s.lateCount > 0 && <span style={{ color: '#0F172A', fontSize: 11 }}> ({s.lateCount} L)</span>}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 12,
                          background: s.attendanceRate >= 75 ? '#DCFCE7' : '#FEE2E2',
                          color: s.attendanceRate >= 75 ? '#15803D' : '#B91C1C',
                          fontWeight: 700, fontSize: 12
                        }}>
                          {s.attendanceRate}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenSession(s)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #16A34A',
                            background: '#F0FDF4',
                            color: '#15803D',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          Mark Sheet <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ── Attendance Marking Sheet ── */
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <div>
              <button
                onClick={() => setActiveSession(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#F8FAFC', color: '#475569', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', marginBottom: 8
                }}
              >
                <ArrowLeft size={13} /> Back to Sessions
              </button>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {activeSession.title}
              </h3>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0' }}>
                Course: <b>{activeSession.courseTitle}</b> • Date: {activeSession.sessionDate} {activeSession.startTime ? `(${activeSession.startTime})` : ''}
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleMarkAllPresent}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  border: '1px solid #16A34A', background: '#DCFCE7', color: '#15803D',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <CheckCircle2 size={14} /> Mark All Present
              </button>
              <button
                onClick={handleSaveAttendance}
                disabled={savingAttendance}
                style={{
                  padding: '7px 16px', borderRadius: 8,
                  border: 'none', background: '#16A34A', color: '#fff',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: savingAttendance ? 0.7 : 1
                }}
              >
                <Save size={14} /> {savingAttendance ? 'Saving...' : 'Save Records'}
              </button>
            </div>
          </div>

          {/* Bulk Action Bar if items selected */}
          {selectedStudentIds.length > 0 && (
            <div style={{
              background: '#F1F5F9', borderRadius: 10, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                {selectedStudentIds.length} students selected:
              </span>
              <button
                onClick={() => applyStatusToSelected('PRESENT')}
                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#DCFCE7', color: '#15803D', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Set Present
              </button>
              <button
                onClick={() => applyStatusToSelected('ABSENT')}
                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#B91C1C', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Set Absent
              </button>
              <button
                onClick={() => applyStatusToSelected('LATE')}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#F1F5F9', color: '#0F172A', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Set Late
              </button>
              <button
                onClick={() => applyStatusToSelected('EXCUSED')}
                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#0F172A', color: '#FFFFFF', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Set Excused
              </button>
            </div>
          )}

          {/* Student Sheet Table */}
          {loadingDetail ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: 13 }}>
              Loading enrolled students...
            </div>
          ) : sessionStudents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
              <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No enrolled students in this course</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, padding: '10px 14px' }}>
                      <button
                        onClick={toggleSelectAll}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                      >
                        {selectedStudentIds.length === sessionStudents.length && sessionStudents.length > 0 ? (
                          <CheckSquare size={16} color="#16A34A" />
                        ) : (
                          <Square size={16} color="#94A3B8" />
                        )}
                      </button>
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Student Name</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Email / Emp ID</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Attendance Status</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionStudents.map(student => {
                    const isSelected = selectedStudentIds.includes(student.studentId)
                    const status = student.status || 'PRESENT'
                    return (
                      <tr key={student.studentId} style={{ borderBottom: '1px solid #F1F5F9', background: isSelected ? '#F0FDF4' : 'transparent' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <button
                            onClick={() => toggleSelectStudent(student.studentId)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                          >
                            {isSelected ? <CheckSquare size={16} color="#16A34A" /> : <Square size={16} color="#CBD5E1" />}
                          </button>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%', background: '#E2E8F0',
                              color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700
                            }}>
                              {(student.name || 'S')[0].toUpperCase()}
                            </div>
                            <div>{student.name || 'Student'}</div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12.5 }}>
                          <div>{student.email}</div>
                          {student.employeeId && <div style={{ fontSize: 11, color: '#94A3B8' }}>ID: {student.employeeId}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                            {['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].map(st => {
                              const isActive = status === st
                              let activeBg = '#16A34A'
                              if (st === 'LATE') activeBg = '#475569'
                              if (st === 'ABSENT') activeBg = '#DC2626'
                              if (st === 'EXCUSED') activeBg = '#0F172A'

                              return (
                                <button
                                  key={st}
                                  onClick={() => handleStatusChange(student.studentId, st)}
                                  style={{
                                    padding: '5px 9px',
                                    border: 'none',
                                    background: isActive ? activeBg : '#FFFFFF',
                                    color: isActive ? '#FFFFFF' : '#64748B',
                                    fontSize: 11.5,
                                    fontWeight: isActive ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 120ms'
                                  }}
                                >
                                  {st === 'PRESENT' ? 'Present' : st === 'LATE' ? 'Late' : st === 'ABSENT' ? 'Absent' : 'Excused'}
                                </button>
                              )
                            })}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <input
                            type="text"
                            placeholder="Optional note..."
                            value={student.remarks || ''}
                            onChange={(e) => handleRemarksChange(student.studentId, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '5px 9px',
                              borderRadius: 6,
                              border: '1px solid #E2E8F0',
                              fontSize: 12,
                              outline: 'none',
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Create Session Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            padding: 16
          }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
                padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
                Schedule New Class Session
              </h3>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '0 0 16px' }}>
                Create a session entry to record lecture and student attendance.
              </p>

              <form onSubmit={handleCreateSessionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Course *
                  </label>
                  <select
                    value={newSessionForm.courseId}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, courseId: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                  >
                    <option value="">Select Course</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Session Title / Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Day 4: Advanced Database Indexing"
                    value={newSessionForm.title}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, title: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={newSessionForm.sessionDate}
                      onChange={(e) => setNewSessionForm(prev => ({ ...prev, sessionDate: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Batch Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Batch A"
                      value={newSessionForm.batchName}
                      onChange={(e) => setNewSessionForm(prev => ({ ...prev, batchName: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="text"
                      placeholder="10:00 AM"
                      value={newSessionForm.startTime}
                      onChange={(e) => setNewSessionForm(prev => ({ ...prev, startTime: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      End Time
                    </label>
                    <input
                      type="text"
                      placeholder="11:30 AM"
                      value={newSessionForm.endTime}
                      onChange={(e) => setNewSessionForm(prev => ({ ...prev, endTime: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#16A34A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Create & Open Sheet
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
