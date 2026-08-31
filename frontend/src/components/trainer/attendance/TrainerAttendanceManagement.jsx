import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Plus, Users, CheckCircle2, XCircle, Clock, ShieldCheck,
  Search, RefreshCw, AlertTriangle, ChevronRight, Save, CheckSquare,
  Square, Filter, ArrowLeft, Lock, Unlock, Sun, Moon, Sparkles,
  Info, Check, HelpCircle
} from 'lucide-react'
import { API } from '../../../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../../../api/request'
import { useToast } from '../../Toast'

export default function TrainerAttendanceManagement({ user }) {
  const { error: showError, success: showSuccess } = useToast()

  // Courses & Filters
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [sessions, setSessions] = useState([])
  const [todayDateStr, setTodayDateStr] = useState('')
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [summary, setSummary] = useState(null)
  const [sessionFilter, setSessionFilter] = useState('ALL') // ALL | TODAY | PAST | UPCOMING
  const [searchQuery, setSearchQuery] = useState('')

  // Active Session for Marking / Inspecting
  const [activeSession, setActiveSession] = useState(null)
  const [sessionStudents, setSessionStudents] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])

  // Legacy Create Session Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newSessionForm, setNewSessionForm] = useState({
    title: '',
    courseId: '',
    sessionType: 'MORNING',
    sessionDate: new Date().toISOString().split('T')[0],
    startTime: '09:00 AM',
    endTime: '01:00 PM',
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
        if (data.courses.length > 0 && !selectedCourseId) {
          setSelectedCourseId(data.courses[0].id)
        }
      }
    } catch (err) {
      console.error('Error loading courses:', err.message)
    }
  }, [user, selectedCourseId])

  // Load Sessions & Summary (auto-generates Morning/Evening sessions)
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

      if (dataSessions.success) {
        setSessions(dataSessions.sessions || [])
        if (dataSessions.todayDate) setTodayDateStr(dataSessions.todayDate)
      }
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

  // Separate Today's Sessions (Morning & Evening)
  const todaySessions = useMemo(() => {
    const today = todayDateStr || new Date().toISOString().split('T')[0]
    const list = sessions.filter(s => s.sessionDate === today)
    const morning = list.find(s => (s.sessionType || 'MORNING').toUpperCase() === 'MORNING') || null
    const evening = list.find(s => (s.sessionType || '').toUpperCase() === 'EVENING') || null
    return { morning, evening, all: list }
  }, [sessions, todayDateStr])

  // Filtered Sessions List
  const filteredSessions = useMemo(() => {
    const today = todayDateStr || new Date().toISOString().split('T')[0]
    return sessions.filter(s => {
      // Status filter
      if (sessionFilter === 'TODAY' && s.sessionDate !== today) return false
      if (sessionFilter === 'PAST' && s.sessionDate >= today) return false
      if (sessionFilter === 'UPCOMING' && s.sessionDate <= today) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (s.title || '').toLowerCase().includes(q)
        const matchDate = (s.sessionDate || '').toLowerCase().includes(q)
        const matchTopic = (s.topic || '').toLowerCase().includes(q)
        const matchType = (s.sessionType || '').toLowerCase().includes(q)
        if (!matchTitle && !matchDate && !matchTopic && !matchType) return false
      }

      return true
    })
  }, [sessions, sessionFilter, searchQuery, todayDateStr])

  // Open Marking / Inspection Sheet
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
        // Keep active session lock metadata updated
        if (data.session) {
          setActiveSession(prev => ({ ...prev, ...data.session }))
        }
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

  // Quick Action: Mark All Present (only if session is open)
  const handleMarkAllPresent = () => {
    if (activeSession?.isLocked) return
    setSessionStudents(prev => prev.map(s => ({ ...s, status: 'PRESENT' })))
  }

  // Change individual student status
  const handleStatusChange = (studentId, newStatus) => {
    if (activeSession?.isLocked) return
    setSessionStudents(prev => prev.map(s => (s.studentId === studentId ? { ...s, status: newStatus } : s)))
  }

  // Change remarks
  const handleRemarksChange = (studentId, remarks) => {
    if (activeSession?.isLocked) return
    setSessionStudents(prev => prev.map(s => (s.studentId === studentId ? { ...s, remarks } : s)))
  }

  // Toggle selection
  const toggleSelectStudent = (studentId) => {
    if (activeSession?.isLocked) return
    setSelectedStudentIds(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    )
  }

  // Select all / none
  const toggleSelectAll = () => {
    if (activeSession?.isLocked) return
    if (selectedStudentIds.length === sessionStudents.length) {
      setSelectedStudentIds([])
    } else {
      setSelectedStudentIds(sessionStudents.map(s => s.studentId))
    }
  }

  // Apply status to selected
  const applyStatusToSelected = (status) => {
    if (activeSession?.isLocked || selectedStudentIds.length === 0) return
    setSessionStudents(prev => prev.map(s =>
      selectedStudentIds.includes(s.studentId) ? { ...s, status } : s
    ))
  }

  // Save Attendance to Backend (enforces server-side locks)
  const handleSaveAttendance = async () => {
    if (!activeSession) return
    if (activeSession.isLocked) {
      showError?.(activeSession.lockMessage || 'This session is locked and cannot be edited.')
      return
    }

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
        showSuccess?.('Attendance records saved successfully!')
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

  // Create Custom Session Submit (fallback)
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
        showSuccess?.('New session created!')
        setShowCreateModal(false)
        fetchSessions()
        if (data.session) handleOpenSession(data.session)
      } else {
        throw new Error(data.error || 'Failed to create session')
      }
    } catch (err) {
      console.error('Create session error:', err.message)
      showError?.(err.message)
    }
  }

  // Session Slot Badge Component
  const renderSlotBadge = (sessionType) => {
    const isMorning = (sessionType || 'MORNING').toUpperCase() === 'MORNING'
    const isEvening = (sessionType || '').toUpperCase() === 'EVENING'

    if (isMorning) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          background: '#FEF3C7', color: '#B45309',
          fontSize: 11.5, fontWeight: 700
        }}>
          <Sun size={12} /> Morning
        </span>
      )
    }
    if (isEvening) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          background: '#E0E7FF', color: '#4338CA',
          fontSize: 11.5, fontWeight: 700
        }}>
          <Moon size={12} /> Evening
        </span>
      )
    }
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 6,
        background: '#F1F5F9', color: '#475569',
        fontSize: 11.5, fontWeight: 600
      }}>
        General
      </span>
    )
  }

  // Status Lock Badge Component
  const renderLockBadge = (session) => {
    if (session.isOpen) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 20,
          background: '#DCFCE7', color: '#15803D',
          fontSize: 11.5, fontWeight: 700,
          border: '1px solid #86EFAC'
        }}>
          <Unlock size={12} /> Open Today
        </span>
      )
    }

    if (session.lockReason === 'PAST_DATE') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 20,
          background: '#F1F5F9', color: '#64748B',
          fontSize: 11.5, fontWeight: 600,
          border: '1px solid #E2E8F0'
        }}>
          <Lock size={12} /> Locked (Past)
        </span>
      )
    }

    if (session.lockReason === 'FUTURE_DATE' || session.lockReason === 'TRAINING_NOT_STARTED') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 20,
          background: '#EFF6FF', color: '#2563EB',
          fontSize: 11.5, fontWeight: 600,
          border: '1px solid #BFDBFE'
        }}>
          <Lock size={12} /> Locked (Upcoming)
        </span>
      )
    }

    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 20,
        background: '#FEE2E2', color: '#B91C1C',
        fontSize: 11.5, fontWeight: 600,
        border: '1px solid #FECACA'
      }}>
        <Lock size={12} /> Locked
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Top Header with IST Timezone Indicator ── */}
      <div className="reg-admin-header" style={{ marginBottom: 0 }}>
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
          <Calendar size={22} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 className="reg-admin-title" style={{ margin: 0 }}>Automated Attendance System</h2>
            <span style={{
              fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
              background: '#DCFCE7', color: '#15803D', display: 'inline-flex', alignItems: 'center', gap: 4
            }}>
              <Sparkles size={12} /> Auto-Managed
            </span>
          </div>
          <p className="reg-admin-subtitle">
            Daily Morning & Evening sessions automatically prepared for the full training duration in <b>Asia/Kolkata (IST)</b>.
          </p>
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
            className="reg-admin-btn reg-admin-btn--secondary"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            title="Create ad-hoc extra session"
          >
            <Plus size={14} /> Custom Session
          </button>
        </div>
      </div>

      {/* ── Date & Course Selection Bar ── */}
      <div style={{
        background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: '12px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#334155', fontSize: 13, fontWeight: 600 }}>
            <Clock size={16} color="#16A34A" />
            <span>Today's Date (IST):</span>
            <span style={{
              background: '#F1F5F9', padding: '3px 10px', borderRadius: 6,
              color: '#0F172A', fontWeight: 700, fontFamily: 'monospace'
            }}>
              {todayDateStr || new Date().toISOString().split('T')[0]}
            </span>
          </div>
          <span style={{ color: '#CBD5E1' }}>|</span>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            Only current day sessions are open for marking. Past & upcoming days are automatically locked.
          </span>
        </div>

        {/* Course Filter Dropdown */}
        {courses.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Training / Course:</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1.5px solid #16A34A',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#0F172A',
                outline: 'none',
                background: '#F0FDF4',
                cursor: 'pointer'
              }}
            >
              <option value="">All Assigned Programs ({courses.length})</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Summary Stats ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total Sessions</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{summary.totalSessions}</div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>Morning & Evening slots</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Overall Attendance Rate</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{summary.overallAttendanceRate}%</div>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>Average across program</span>
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

      {/* ── Today's Active Attendance Hub (Morning & Evening Cards) ── */}
      {!activeSession && (
        <div style={{
          background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)',
          borderRadius: 18, border: '1.5px solid #86EFAC', padding: '20px',
          boxShadow: '0 4px 12px rgba(22, 163, 74, 0.06)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#15803D', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} /> Today's Attendance Sessions ({todayDateStr || 'Today'})
              </h3>
              <p style={{ fontSize: 12.5, color: '#475569', margin: '2px 0 0' }}>
                Open for recording today. Marking Evening attendance will never overwrite Morning attendance.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {/* Morning Session Card */}
            <div style={{
              background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: '16px',
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: todaySessions.morning?.isOpen ? '0 2px 8px rgba(22, 163, 74, 0.1)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF3C7', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sun size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Morning Attendance</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>09:00 AM – 01:00 PM</div>
                  </div>
                </div>
                {todaySessions.morning ? renderLockBadge(todaySessions.morning) : (
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>Not scheduled</span>
                )}
              </div>

              {todaySessions.morning ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569', background: '#F8FAFC', padding: '8px 10px', borderRadius: 8 }}>
                    <span>Recorded: <b>{todaySessions.morning.totalMarked}</b></span>
                    <span>Present: <b style={{ color: '#16A34A' }}>{todaySessions.morning.presentCount}</b></span>
                    <span>Rate: <b>{todaySessions.morning.attendanceRate}%</b></span>
                  </div>
                  <button
                    onClick={() => handleOpenSession(todaySessions.morning)}
                    style={{
                      marginTop: 'auto', padding: '8px 14px', borderRadius: 8,
                      border: 'none',
                      background: todaySessions.morning.isOpen ? '#16A34A' : '#475569',
                      color: '#FFFFFF', fontSize: 12.5, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    {todaySessions.morning.isOpen ? <Unlock size={14} /> : <Lock size={14} />}
                    {todaySessions.morning.isOpen ? 'Mark Morning Attendance' : 'View Morning Records'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '14px 0' }}>
                  No morning session generated for this date
                </div>
              )}
            </div>

            {/* Evening Session Card */}
            <div style={{
              background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: '16px',
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: todaySessions.evening?.isOpen ? '0 2px 8px rgba(22, 163, 74, 0.1)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#E0E7FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Moon size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Evening Attendance</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>02:00 PM – 06:00 PM</div>
                  </div>
                </div>
                {todaySessions.evening ? renderLockBadge(todaySessions.evening) : (
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>Not scheduled</span>
                )}
              </div>

              {todaySessions.evening ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569', background: '#F8FAFC', padding: '8px 10px', borderRadius: 8 }}>
                    <span>Recorded: <b>{todaySessions.evening.totalMarked}</b></span>
                    <span>Present: <b style={{ color: '#16A34A' }}>{todaySessions.evening.presentCount}</b></span>
                    <span>Rate: <b>{todaySessions.evening.attendanceRate}%</b></span>
                  </div>
                  <button
                    onClick={() => handleOpenSession(todaySessions.evening)}
                    style={{
                      marginTop: 'auto', padding: '8px 14px', borderRadius: 8,
                      border: 'none',
                      background: todaySessions.evening.isOpen ? '#16A34A' : '#475569',
                      color: '#FFFFFF', fontSize: 12.5, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    {todaySessions.evening.isOpen ? <Unlock size={14} /> : <Lock size={14} />}
                    {todaySessions.evening.isOpen ? 'Mark Evening Attendance' : 'View Evening Records'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '14px 0' }}>
                  No evening session generated for this date
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main View: Sessions List or Active Marking Sheet ── */}
      {!activeSession ? (
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
          {/* Filter Tabs & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>All Training Attendance Days</h3>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0' }}>
                Complete calendar from training start to end date.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Filter Tabs */}
              <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid #E2E8F0', padding: 2, background: '#F8FAFC' }}>
                {[
                  { id: 'ALL', label: 'All Sessions' },
                  { id: 'TODAY', label: 'Today (Open)' },
                  { id: 'PAST', label: 'Past (Locked)' },
                  { id: 'UPCOMING', label: 'Upcoming' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSessionFilter(tab.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: 'none',
                      background: sessionFilter === tab.id ? '#16A34A' : 'transparent',
                      color: sessionFilter === tab.id ? '#FFFFFF' : '#475569',
                      fontSize: 12, fontWeight: sessionFilter === tab.id ? 700 : 500,
                      cursor: 'pointer', transition: 'all 120ms'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Search date / topic..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 12px 6px 30px',
                    borderRadius: 8, border: '1px solid #E2E8F0',
                    fontSize: 12.5, outline: 'none', width: 170
                  }}
                />
              </div>
            </div>
          </div>

          {/* Sessions Table */}
          {loadingSessions ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: 13 }}>
              Loading sessions...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94A3B8' }}>
              <Calendar size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No sessions matching filter</div>
              <p style={{ fontSize: 12, margin: '4px 0 16px' }}>Attendance sessions are automatically generated based on the training date range.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Session Slot</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Training / Course</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Status</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Marked / Enrolled</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map(s => {
                    const isToday = s.sessionDate === (todayDateStr || new Date().toISOString().split('T')[0])
                    return (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isToday ? '#F0FDF4' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{s.sessionDate}</span>
                            {isToday && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#16A34A', color: '#fff', fontWeight: 700 }}>
                                TODAY
                              </span>
                            )}
                          </div>
                          {s.dayNumber && <div style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>Day {s.dayNumber}</div>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {renderSlotBadge(s.sessionType)}
                            <span style={{ fontSize: 11, color: '#64748B' }}>{s.startTime || '09:00 AM'} - {s.endTime || '01:00 PM'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569', fontSize: 13 }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.title}</div>
                          <div style={{ fontSize: 11.5, color: '#64748B' }}>{s.courseTitle}</div>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {renderLockBadge(s)}
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
                              border: s.isOpen ? '1px solid #16A34A' : '1px solid #CBD5E1',
                              background: s.isOpen ? '#16A34A' : '#F8FAFC',
                              color: s.isOpen ? '#FFFFFF' : '#475569',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            {s.isOpen ? <Unlock size={12} /> : <Lock size={12} />}
                            {s.isOpen ? 'Mark Sheet' : 'View Sheet'}
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ── Attendance Marking / Inspection Sheet ── */
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
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
                <ArrowLeft size={13} /> Back to Sessions List
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  {activeSession.title}
                </h3>
                {renderSlotBadge(activeSession.sessionType)}
                {renderLockBadge(activeSession)}
              </div>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0' }}>
                Course: <b>{activeSession.courseTitle}</b> • Date: <b>{activeSession.sessionDate}</b> ({activeSession.startTime || '09:00 AM'} - {activeSession.endTime || '01:00 PM'})
              </p>
            </div>

            {/* Actions: Save / Mark All (Disabled if locked) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!activeSession.isLocked ? (
                <>
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
                </>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  background: '#F1F5F9', border: '1px solid #E2E8F0',
                  color: '#64748B', fontSize: 12, fontWeight: 600
                }}>
                  <Lock size={13} /> Read-Only Mode (Locked)
                </div>
              )}
            </div>
          </div>

          {/* Locked Notice Banner */}
          {activeSession.isLocked && (
            <div style={{
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
              padding: '10px 14px', marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 12.5
            }}>
              <Info size={16} color="#64748B" />
              <span>
                {activeSession.lockMessage || 'This session belongs to a past or future date and is locked for data integrity. Records are displayed in view-only mode.'}
              </span>
            </div>
          )}

          {/* Bulk Action Bar if items selected (Open session only) */}
          {!activeSession.isLocked && selectedStudentIds.length > 0 && (
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
              <div style={{ fontWeight: 600, fontSize: 14, color: '#475569' }}>No enrolled students found</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {!activeSession.isLocked && (
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
                    )}
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Student Name</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Email / Emp ID</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px' }}>Attendance Status</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionStudents.map(student => {
                    const isSelected = selectedStudentIds.includes(student.studentId)
                    const status = student.status || (activeSession.isLocked ? 'ABSENT' : 'PRESENT')
                    return (
                      <tr
                        key={student.studentId}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isSelected ? '#F0FDF4' : 'transparent'
                        }}
                      >
                        {!activeSession.isLocked && (
                          <td style={{ padding: '10px 14px' }}>
                            <button
                              onClick={() => toggleSelectStudent(student.studentId)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                            >
                              {isSelected ? <CheckSquare size={16} color="#16A34A" /> : <Square size={16} color="#CBD5E1" />}
                            </button>
                          </td>
                        )}
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
                          {!activeSession.isLocked ? (
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
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '4px 10px', borderRadius: 12,
                              background: status === 'PRESENT' ? '#DCFCE7' : status === 'LATE' ? '#FEF3C7' : status === 'EXCUSED' ? '#E0E7FF' : '#FEE2E2',
                              color: status === 'PRESENT' ? '#15803D' : status === 'LATE' ? '#B45309' : status === 'EXCUSED' ? '#4338CA' : '#B91C1C',
                              fontWeight: 700, fontSize: 12
                            }}>
                              {status === 'PRESENT' ? <CheckCircle2 size={13} /> : status === 'LATE' ? <Clock size={13} /> : status === 'EXCUSED' ? <ShieldCheck size={13} /> : <XCircle size={13} />}
                              {status}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {!activeSession.isLocked ? (
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
                          ) : (
                            <span style={{ fontSize: 12, color: student.remarks ? '#334155' : '#94A3B8' }}>
                              {student.remarks || '—'}
                            </span>
                          )}
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

      {/* ── Custom Session Modal (Fallback) ── */}
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
                Schedule Custom Session Entry
              </h3>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '0 0 16px' }}>
                Standard training days are auto-created. Use this to schedule an extra/supplementary session.
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
                    placeholder="e.g. Supplementary Doubt Clearing Session"
                    value={newSessionForm.title}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, title: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Session Slot *
                    </label>
                    <select
                      value={newSessionForm.sessionType}
                      onChange={(e) => setNewSessionForm(prev => ({ ...prev, sessionType: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                    >
                      <option value="MORNING">Morning Session</option>
                      <option value="EVENING">Evening Session</option>
                      <option value="GENERAL">General Session</option>
                    </select>
                  </div>
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="text"
                      placeholder="09:00 AM"
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
                      placeholder="01:00 PM"
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
                    Create Session
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
