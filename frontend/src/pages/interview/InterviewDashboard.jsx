/**
 * InterviewDashboard Page
 * Enterprise admin table view — matches RegistrationApplications design exactly.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, Calendar, Clock, User, Plus, Search, Filter,
  Eye, Pencil, CalendarClock, Play, XCircle, Trash2,
  FileText, X, Loader2, ChevronLeft, ChevronRight as ChevronRightIcon,
  MoreVertical,
} from 'lucide-react'
import { useToast } from '../../components/Toast'
import interviewService from '../../services/interviewService'
import {
  STATUS_COLORS, TYPE_BADGE, MEETING_BADGE,
  formatDate, formatTime, formatDateTime,
} from '../../utils/interviewPresentation'
import { getTwoLetterInitials } from '../../components/common/UserAvatar'

// Allowed next statuses per current status (matches backend transition rules).
const STATUS_OPTIONS = {
  SCHEDULED:   [{ value: 'IN_PROGRESS', label: 'In Progress' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }],
  IN_PROGRESS: [{ value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }],
  COMPLETED:   [],
  CANCELLED:   [],
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

// Shared form styles — matches the Schedule Interview page design system.
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }
const selectStyle = { ...inputStyle, appearance: 'none', background: '#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 10px center', paddingRight: 30 }

const ivActionBtn = (bg, border, color) => ({
  width: 32,
  height: 32,
  borderRadius: 8,
  border: `1px solid ${border}`,
  background: bg,
  color: color,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  transition: 'all 0.15s ease',
  flexShrink: 0,
})

const EMPTY_EDIT_FORM = {
  title: '',
  candidateId: '',
  interviewerId: '',
  type: 'TECHNICAL',
  date: '',
  time: '',
  durationMinutes: 60,
  meetingType: 'IN_PLATFORM',
  meetingLink: '',
  description: '',
  requireMobilePairing: true,
  recordInterview: false,
}

export default function InterviewDashboard({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { success, error: showError } = useToast()
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, scheduled: 0, inProgress: 0, completed: 0, cancelled: 0, today: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 })
  const [detailInterview, setDetailInterview] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null) // { interview, action: 'delete' | 'cancel' }
  const [changeStatusTarget, setChangeStatusTarget] = useState(null)
  const [newStatus, setNewStatus] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(null)
  const [menuPos, setMenuPos] = useState(null)
  const menuRef = useRef(null)
  const [editInterview, setEditInterview] = useState(null)
  const [editFetching, setEditFetching] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [interviewers, setInterviewers] = useState([])
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const limit = 15

  const fetchData = async (page = 1) => {
    try {
      setLoading(true)
      const params = { page, limit }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.type = typeFilter
      if (search) params.search = search
      const [listRes, statsRes] = await Promise.all([
        interviewService.list(params),
        interviewService.getStats(),
      ])
      setInterviews(listRes.interviews || [])
      setPagination(listRes.pagination || { total: 0, page: 1, pages: 1 })
      setStats(statsRes || {})
    } catch (err) {
      showError(err?.message || 'Failed to fetch interviews')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [statusFilter, typeFilter])

  // Show the success toast passed from the ScheduleInterview page after save.
  useEffect(() => {
    if (location.state?.toast) {
      success(location.state.toast)
      window.history.replaceState({}, document.title)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.reg-admin-actions')) setMenuOpen(null)
    }
    const closeOnScrollOrResize = () => setMenuOpen(null)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', closeOnScrollOrResize, true)
    window.addEventListener('resize', closeOnScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', closeOnScrollOrResize, true)
      window.removeEventListener('resize', closeOnScrollOrResize)
    }
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchData(1)
  }

  const handleView = async (interview) => {
    setMenuOpen(null)
    setDetailLoading(true)
    setDetailInterview(interview)
    try {
      const res = await interviewService.get(interview.id)
      setDetailInterview(res.interview || interview)
    } catch (err) {
      showError(err?.message || 'Failed to load interview details')
    } finally {
      setDetailLoading(false)
    }
  }

  // Open the ⋮ actions dropdown anchored to the clicked button. Uses fixed
  // positioning so the menu is never clipped by the table wrapper or hidden
  // behind the sidebar/header, and flips upward when near the viewport bottom.
  const openMenu = (e, id) => {
    e.stopPropagation()
    if (menuOpen === id) {
      setMenuOpen(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const menuWidth = 180
    let right = window.innerWidth - rect.right
    if (right < 8) right = 8
    if (window.innerWidth - right - menuWidth < 8) {
      right = Math.max(8, window.innerWidth - rect.left - menuWidth)
    }

    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const estHeight = manage ? 190 : 56

    const shouldFlip = spaceBelow < estHeight && spaceAbove > spaceBelow

    if (shouldFlip) {
      setMenuPos({
        bottom: window.innerHeight - rect.top + 6,
        top: 'auto',
        right,
        isFlipped: true,
      })
    } else {
      setMenuPos({
        top: rect.bottom + 6,
        bottom: 'auto',
        right,
        isFlipped: false,
      })
    }
    setMenuOpen(id)
  }

  const openEdit = async (interview) => {
    setMenuOpen(null)
    setEditInterview(interview)
    setEditFetching(true)
    try {
      const [res, candRes, intRes] = await Promise.all([
        interviewService.get(interview.id),
        interviewService.getCandidates(),
        interviewService.getInterviewers(),
      ])
      const iv = res?.interview || interview
      setCandidates(candRes?.candidates || [])
      setInterviewers(intRes?.interviewers || [])
      const d = new Date(iv.scheduled_at)
      const pad = (n) => String(n).padStart(2, '0')
      setEditForm({
        title: iv.title || '',
        candidateId: iv.candidate_id != null ? String(iv.candidate_id) : '',
        interviewerId: iv.interviewer_id != null ? String(iv.interviewer_id) : '',
        type: iv.type || 'TECHNICAL',
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        durationMinutes: iv.duration_minutes || 60,
        meetingType: iv.meeting_type || 'IN_PLATFORM',
        meetingLink: iv.meeting_link || '',
        description: iv.description || '',
        requireMobilePairing: iv.require_mobile_pairing !== false,
        recordInterview: !!iv.record_interview,
      })
    } catch (err) {
      showError(err?.message || 'Failed to load interview details')
    } finally {
      setEditFetching(false)
    }
  }

  const handleEditChange = (field, value) => {
    if (field === 'meetingType' && value !== 'IN_PLATFORM') {
      setEditForm(f => ({ ...f, [field]: value, requireMobilePairing: false, recordInterview: false }))
    } else {
      setEditForm(f => ({ ...f, [field]: value }))
    }
  }

  const handleEditSave = async () => {
    if (!editInterview) return
    if (!editForm.candidateId || !editForm.interviewerId || !editForm.date || !editForm.time) {
      showError('Please fill in the candidate, interviewer, date and time')
      return
    }
    try {
      setEditSaving(true)
      const scheduledAt = new Date(`${editForm.date}T${editForm.time}`).toISOString()
      const payload = {
        candidateId: parseInt(editForm.candidateId, 10),
        interviewerId: parseInt(editForm.interviewerId, 10),
        scheduledAt,
        durationMinutes: parseInt(editForm.durationMinutes, 10),
        type: editForm.type,
        title: editForm.title?.trim() || undefined,
        description: editForm.description?.trim() || undefined,
        requireMobilePairing: editForm.meetingType === 'IN_PLATFORM' ? !!editForm.requireMobilePairing : false,
        meetingType: editForm.meetingType,
        meetingLink: editForm.meetingType === 'ONLINE' ? editForm.meetingLink?.trim() : undefined,
        recordInterview: editForm.meetingType === 'IN_PLATFORM' ? !!editForm.recordInterview : false,
      }
      const res = await interviewService.update(editInterview.id, payload)
      setEditInterview(null)
      setEditForm(EMPTY_EDIT_FORM)
      success('Interview updated successfully')
      if (res?.interview?.id) {
        setInterviews(prev => prev.map(iv => (iv.id === res.interview.id ? res.interview : iv)))
      }
      await fetchData(pagination.page)
    } catch (err) {
      showError(err?.response?.data?.error || err?.message || 'Failed to update interview')
    } finally {
      setEditSaving(false)
    }
  }

  const handleStart = (interview) => {
    setMenuOpen(null)
    navigate(`/interview/${interview.id}/room`)
  }

  const handleCancel = async (interview) => {
    try {
      setActionLoading(true)
      await interviewService.updateStatus(interview.id, 'CANCELLED')
      setConfirmTarget(null)
      success('Interview cancelled successfully')
      await fetchData(pagination.page)
    } catch (err) {
      showError(err?.message || 'Failed to cancel interview')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (interview) => {
    try {
      setActionLoading(true)
      const res = await interviewService.delete(interview.id)
      if (!res?.success) throw new Error(res?.message || 'Failed to delete interview')
      setConfirmTarget(null)
      success('Interview deleted successfully')
      await fetchData(pagination.page)
    } catch (err) {
      showError(err?.message || 'Failed to delete interview')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmTarget) return
    if (confirmTarget.action === 'delete') await handleDelete(confirmTarget.interview)
    else await handleCancel(confirmTarget.interview)
  }

  const handleChangeStatus = async () => {
    if (!changeStatusTarget || !newStatus) return
    try {
      setActionLoading(true)
      const res = await interviewService.updateStatus(changeStatusTarget.id, newStatus)
      setChangeStatusTarget(null)
      setNewStatus('')
      success(`Interview marked as ${newStatus.replace('_', ' ')}`)
      if (res?.interview?.id) {
        setInterviews(prev => prev.map(iv => (iv.id === res.interview.id ? res.interview : iv)))
      }
      await fetchData(pagination.page)
    } catch (err) {
      showError(err?.message || 'Failed to update interview status')
    } finally {
      setActionLoading(false)
    }
  }

  const canManage = (iv) => {
    if (user?.role === 'ADMIN') return true
    if (user?.role === 'TRAINER') return iv.interviewer_id === user.id
    return false
  }

  
  const getInitials = (name) => getTwoLetterInitials(name)
  const isAdmin = user?.role === 'ADMIN'

  const statCards = [
    { label: 'Total', value: stats.total, icon: Video, color: '#6366f1' },
    { label: 'Scheduled', value: stats.scheduled, icon: Calendar, color: '#16A34A' },
    { label: 'In Progress', value: stats.inProgress, icon: Play, color: '#F59E0B' },
    { label: 'Completed', value: stats.completed, icon: FileText, color: '#0D9488' },
    { label: 'Cancelled', value: stats.cancelled, icon: XCircle, color: '#dc2626' },
  ]

  const statusTabs = [
    { key: '', label: 'All' },
    { key: 'SCHEDULED', label: 'Scheduled' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ]

  const allowedStatuses = changeStatusTarget ? (STATUS_OPTIONS[changeStatusTarget.status] || []) : []

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
          <Video size={26} color="#16A34A" />
        </div>
        <div>
          <h2 className="reg-admin-title">Interviews</h2>
          <p className="reg-admin-subtitle">
            {isAdmin ? 'Schedule and manage candidate interview sessions' : 'Your assigned interviews'}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => navigate('/interview/schedule')}>
            <Plus size={16} /> Schedule Interview
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="reg-admin-stats">
        {statCards.map(s => (
          <div key={s.label} className="reg-admin-stat">
            <s.icon size={20} style={{ color: s.color }} />
            <div>
              <span className="reg-admin-stat-num">{s.value ?? 0}</span>
              <span className="reg-admin-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="reg-admin-filters">
        <form onSubmit={handleSearch} className="reg-admin-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name, email, interviewer, title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <div className="reg-admin-filter-tabs">
          {statusTabs.map(t => (
            <button
              key={t.key}
              className={`reg-admin-filter-tab ${statusFilter === t.key ? 'reg-admin-filter-tab--active' : ''}`}
              onClick={() => setStatusFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type filters */}
      <div className="reg-admin-filters" style={{ marginTop: 8 }}>
        <div className="reg-admin-filter-tabs">
          {[
            { key: '', label: 'All Types' },
            { key: 'TECHNICAL', label: 'Technical' },
            { key: 'HR', label: 'HR' },
            { key: 'MANAGERIAL', label: 'Managerial' },
            { key: 'CUSTOM', label: 'Custom' },
          ].map(t => (
            <button
              key={t.key}
              className={`reg-admin-filter-tab ${typeFilter === t.key ? 'reg-admin-filter-tab--active' : ''}`}
              onClick={() => setTypeFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="reg-admin-loading">
          <Loader2 size={28} className="spin" />
          <span>Loading interviews...</span>
        </div>
      ) : interviews.length === 0 ? (
        /* Empty */
        <div className="reg-admin-empty">
          <Video size={40} />
          <h3>No Interviews Found</h3>
          <p>No interviews match your current filter.</p>
          {isAdmin && (
            <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => navigate('/interview/schedule')}>
              <Plus size={15} /> Schedule Interview
            </button>
          )}
        </div>
      ) : (
        /* Table */
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Candidate</th>
                <th>Interviewer</th>
                <th>Type</th>
                <th>Date</th>
                <th>Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Meeting</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {interviews.map(iv => {
                const sc = STATUS_COLORS[iv.status] || STATUS_COLORS.SCHEDULED
                const tb = TYPE_BADGE[iv.type] || TYPE_BADGE.TECHNICAL
                const mb = MEETING_BADGE[iv.meeting_type] || MEETING_BADGE.ONLINE
                const manage = canManage(iv)
                return (
                  <tr key={iv.id}>
                    <td>
                      <span className="reg-admin-app-id">#{iv.id}</span>
                    </td>
                    <td>
                      <div className="reg-admin-participant">
                        <div className="reg-admin-avatar">
                          {getInitials(iv.candidate?.name)}
                        </div>
                        <div>
                          <div className="reg-admin-name">{iv.candidate?.name || '—'}</div>
                          <div className="reg-admin-email">{iv.candidate?.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="reg-admin-name" style={{ fontSize: 13 }}>{iv.interviewer?.name || '—'}</div>
                      <div className="reg-admin-email">{iv.interviewer?.email || ''}</div>
                    </td>
                    <td><span className={`reg-admin-type ${tb.cls}`}>{tb.label}</span></td>
                    <td className="reg-admin-date">{formatDate(iv.scheduled_at)}</td>
                    <td className="reg-admin-date">{formatTime(iv.scheduled_at)}</td>
                    <td>{iv.duration_minutes} min</td>
                    <td>
                      <span className="reg-admin-status" style={{
                        background: sc.bg, color: sc.text, borderColor: sc.border,
                      }}>{iv.status?.replace('_', ' ')}</span>
                    </td>
                    <td><span className={`reg-admin-meeting ${mb.cls}`}>{mb.label}</span></td>
                    <td>
                      {isAdmin ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            style={ivActionBtn('#EFF6FF', '#BFDBFE', '#2563EB')}
                            title="View Details"
                            onClick={() => handleView(iv)}
                          >
                            <Eye size={15} color="#2563EB" strokeWidth={2.2} />
                          </button>
                          {(iv.status === 'SCHEDULED' || iv.status === 'IN_PROGRESS') && (
                            <button
                              style={ivActionBtn('#F0FDF4', '#BBF7D0', '#16A34A')}
                              title="Start / Join Interview"
                              onClick={() => handleStart(iv)}
                            >
                              <Play size={15} color="#16A34A" strokeWidth={2.2} />
                            </button>
                          )}
                          <button
                            style={ivActionBtn('#F0FDFA', '#99F6E4', '#0D9488')}
                            title="Edit Interview"
                            onClick={() => openEdit(iv)}
                          >
                            <Pencil size={15} color="#0D9488" strokeWidth={2.2} />
                          </button>
                          <button
                            style={ivActionBtn('#F5F3FF', '#DDD6FE', '#7C3AED')}
                            title="Change Status"
                            onClick={() => { setChangeStatusTarget(iv); setNewStatus(''); }}
                          >
                            <Filter size={15} color="#7C3AED" strokeWidth={2.2} />
                          </button>
                          {iv.status === 'SCHEDULED' && (
                            <button
                              style={ivActionBtn('#FFFBEB', '#FDE68A', '#D97706')}
                              title="Cancel Interview"
                              onClick={() => setConfirmTarget({ interview: iv, action: 'cancel' })}
                            >
                              <CalendarClock size={15} color="#D97706" strokeWidth={2.2} />
                            </button>
                          )}
                          <button
                            style={ivActionBtn('#FEF2F2', '#FECACA', '#DC2626')}
                            title="Delete Interview"
                            onClick={() => setConfirmTarget({ interview: iv, action: 'delete' })}
                          >
                            <Trash2 size={15} color="#DC2626" strokeWidth={2.2} />
                          </button>
                        </div>
                      ) : (
                        <div className="reg-admin-actions">
                          <button
                            className="reg-admin-action"
                            style={{ background: '#F8FAFC', color: '#334155', border: '1px solid #CBD5E1' }}
                            title="Actions"
                            data-menu-btn={iv.id}
                            onClick={(e) => openMenu(e, iv.id)}
                          >
                            <MoreVertical size={16} color="#334155" strokeWidth={2.2} />
                          </button>
                          <AnimatePresence>
                            {menuOpen === iv.id && (
                              <motion.div
                                ref={menuRef}
                                className="reg-admin-action-menu"
                                style={{
                                  top: menuPos?.top ?? 'auto',
                                  bottom: menuPos?.bottom ?? 'auto',
                                  right: menuPos?.right ?? 'auto',
                                }}
                                initial={{ opacity: 0, y: menuPos?.isFlipped ? 4 : -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: menuPos?.isFlipped ? 4 : -4 }}
                                transition={{ duration: 0.15 }}
                              >
                                <button className="reg-admin-action-menu-item" onClick={() => handleView(iv)}>
                                  <Eye size={14} color="#2563EB" /> View Details
                                </button>
                                {manage && (
                                  <button className="reg-admin-action-menu-item" onClick={() => openEdit(iv)}>
                                    <Pencil size={14} color="#0D9488" /> Edit Interview
                                  </button>
                                )}
                                {manage && (
                                  <button className="reg-admin-action-menu-item" onClick={() => { setChangeStatusTarget(iv); setNewStatus(''); setMenuOpen(null) }}>
                                    <Filter size={14} color="#7C3AED" /> Change Status
                                  </button>
                                )}
                                {(iv.status === 'SCHEDULED' || iv.status === 'IN_PROGRESS') && (
                                  <button className="reg-admin-action-menu-item" onClick={() => handleStart(iv)}>
                                    <Play size={14} color="#16A34A" /> Start Interview
                                  </button>
                                )}
                                {iv.status === 'SCHEDULED' && manage && (
                                  <button className="reg-admin-action-menu-item" onClick={() => { setConfirmTarget({ interview: iv, action: 'cancel' }); setMenuOpen(null) }}>
                                    <CalendarClock size={14} color="#D97706" /> Cancel Interview
                                  </button>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
          <button
            className="reg-admin-btn reg-admin-btn--secondary"
            disabled={pagination.page <= 1}
            onClick={() => fetchData(pagination.page - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ padding: '6px 14px', fontSize: 13, color: '#64748b' }}>
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            className="reg-admin-btn reg-admin-btn--secondary"
            disabled={pagination.page >= pagination.pages}
            onClick={() => fetchData(pagination.page + 1)}
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      <AnimatePresence>
        {detailInterview && (
          <motion.div className="reg-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDetailInterview(null)}>
            <motion.div className="reg-modal"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>Interview Details</h3>
                <button onClick={() => setDetailInterview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="#64748b" />
                </button>
              </div>
              <div className="reg-modal-body">
                {detailLoading ? (
                  <div className="reg-admin-loading">
                    <Loader2 size={24} className="spin" />
                    <span>Loading details...</span>
                  </div>
                ) : (
                  <>
                    <div className="reg-modal-grid">
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Title</span>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{detailInterview.title || `Interview #${detailInterview.id}`}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Status</span>
                        <div><span className="reg-admin-status" style={{ background: STATUS_COLORS[detailInterview.status]?.bg, color: STATUS_COLORS[detailInterview.status]?.text, borderColor: STATUS_COLORS[detailInterview.status]?.border }}>
                          {detailInterview.status?.replace('_', ' ')}
                        </span></div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Candidate</span>
                        <div style={{ fontSize: 14 }}>{detailInterview.candidate?.name || '—'}{detailInterview.candidate?.email ? ` (${detailInterview.candidate.email})` : ''}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Mobile / Email</span>
                        <div style={{ fontSize: 14 }}>{detailInterview.candidate?.phone || detailInterview.candidate?.email || '—'}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Interviewer</span>
                        <div style={{ fontSize: 14 }}>{detailInterview.interviewer?.name || '—'}{detailInterview.interviewer?.email ? ` (${detailInterview.interviewer.email})` : ''}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Type</span>
                        <div><span className={`reg-admin-type ${TYPE_BADGE[detailInterview.type]?.cls}`}>{TYPE_BADGE[detailInterview.type]?.label}</span></div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Date & Time</span>
                        <div style={{ fontSize: 14 }}>{formatDateTime(detailInterview.scheduled_at)}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Duration</span>
                        <div style={{ fontSize: 14 }}>{detailInterview.duration_minutes} minutes</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Meeting Type</span>
                        <div><span className={`reg-admin-meeting ${MEETING_BADGE[detailInterview.meeting_type]?.cls}`}>{MEETING_BADGE[detailInterview.meeting_type]?.label}</span></div></div>
                      {detailInterview.meeting_link && (
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Meeting Link</span>
                          <div style={{ fontSize: 14, wordBreak: 'break-all' }}>
                            {/^https?:\/\//i.test(detailInterview.meeting_link) ? (
                              <a href={detailInterview.meeting_link} target="_blank" rel="noopener noreferrer" style={{ color: '#16A34A' }}>{detailInterview.meeting_link}</a>
                            ) : detailInterview.meeting_link}
                          </div></div>
                      )}
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Record Interview</span>
                        <div style={{ fontSize: 14 }}>{detailInterview.record_interview ? 'Yes' : 'No'}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Mobile Pairing</span>
                        <div style={{ fontSize: 14 }}>{detailInterview.require_mobile_pairing ? 'Required' : 'Not Required'}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Created</span>
                        <div style={{ fontSize: 14 }}>{formatDateTime(detailInterview.created_at)}</div></div>
                      <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Last Updated</span>
                        <div style={{ fontSize: 14 }}>{formatDateTime(detailInterview.updated_at)}</div></div>
                    </div>
                    {detailInterview.description && (
                      <div style={{ marginTop: 16 }}>
                        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Notes</span>
                        <div style={{ fontSize: 14, marginTop: 4, color: '#334155' }}>{detailInterview.description}</div>
                      </div>
                    )}
                    {detailInterview.result && (
                      <div style={{ marginTop: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Result</span>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: detailInterview.result.decision === 'SELECTED' ? '#16A34A' : detailInterview.result.decision === 'REJECTED' ? '#dc2626' : '#F59E0B' }}>
                          {detailInterview.result.decision}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setDetailInterview(null)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHANGE STATUS MODAL ── */}
      <AnimatePresence>
        {changeStatusTarget && (
          <motion.div className="reg-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setChangeStatusTarget(null)}>
            <motion.div className="reg-modal reg-modal--small"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>Change Interview Status</h3>
                <button onClick={() => setChangeStatusTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="#64748b" />
                </button>
              </div>
              <div className="reg-modal-body">
                <p style={{ fontSize: 14, color: '#475569', margin: '0 0 14px' }}>
                  Interview <strong>#{changeStatusTarget.id}</strong> is currently{' '}
                  <strong>{changeStatusTarget.status?.replace('_', ' ')}</strong>.
                </p>
                {allowedStatuses.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                    This interview is in a terminal state and cannot be changed.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allowedStatuses.map(opt => (
                      <label
                        key={opt.value}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          border: `1px solid ${newStatus === opt.value ? '#16A34A' : '#e2e8f0'}`,
                          borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#334155',
                          background: newStatus === opt.value ? '#f0fdf4' : '#fff',
                        }}
                      >
                        <input
                          type="radio"
                          name="interview-status"
                          value={opt.value}
                          checked={newStatus === opt.value}
                          onChange={() => setNewStatus(opt.value)}
                          style={{ accentColor: '#16A34A' }}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setChangeStatusTarget(null)}>Close</button>
                <button
                  className="reg-admin-btn reg-admin-btn--primary"
                  onClick={handleChangeStatus}
                  disabled={actionLoading || !newStatus}
                >
                  {actionLoading ? 'Updating...' : 'Save Status'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EDIT INTERVIEW MODAL ── */}
      <AnimatePresence>
        {editInterview && (
          <motion.div className="reg-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditInterview(null)}>
            <motion.div className="reg-modal"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>Edit Interview{editInterview.id ? ` #${editInterview.id}` : ''}</h3>
                <button onClick={() => setEditInterview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="#64748b" />
                </button>
              </div>
              <div className="reg-modal-body">
                {editFetching ? (
                  <div className="reg-admin-loading">
                    <Loader2 size={24} className="spin" />
                    <span>Loading interview data...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="interview-form-grid">
                      {/* Left column */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label style={labelStyle}>Interview Title</label>
                          <input
                            type="text"
                            placeholder="e.g., Senior Developer Technical Interview"
                            value={editForm.title}
                            onChange={e => handleEditChange('title', e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Candidate *</label>
                          <select
                            value={editForm.candidateId}
                            onChange={e => handleEditChange('candidateId', e.target.value)}
                            style={selectStyle}
                            required
                          >
                            <option value="">Select candidate</option>
                            {candidates.length === 0 ? (
                              <option value="" disabled>No approved participants found</option>
                            ) : candidates.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.email}) {c.training?.title ? ` - ${c.training.title}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>HR / Interviewer *</label>
                          <select
                            value={editForm.interviewerId}
                            onChange={e => handleEditChange('interviewerId', e.target.value)}
                            style={selectStyle}
                            required
                          >
                            <option value="">Select interviewer</option>
                            {interviewers.length === 0 ? (
                              <option value="" disabled>No trainers found</option>
                            ) : interviewers.map(i => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.email}) {i.activeInterviews > 0 ? ` [${i.activeInterviews} active]` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Interview Type</label>
                          <select value={editForm.type} onChange={e => handleEditChange('type', e.target.value)} style={selectStyle}>
                            <option value="TECHNICAL">Technical</option>
                            <option value="HR">HR</option>
                            <option value="MANAGERIAL">Managerial</option>
                            <option value="CUSTOM">Custom</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Duration</label>
                          <select value={editForm.durationMinutes} onChange={e => handleEditChange('durationMinutes', parseInt(e.target.value))} style={selectStyle}>
                            <option value={30}>30 minutes</option>
                            <option value={45}>45 minutes</option>
                            <option value={60}>60 minutes</option>
                            <option value={90}>90 minutes</option>
                            <option value={120}>120 minutes</option>
                          </select>
                        </div>
                      </div>

                      {/* Right column */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label style={labelStyle}>Interview Date *</label>
                          <input
                            type="date"
                            value={editForm.date}
                            onChange={e => handleEditChange('date', e.target.value)}
                            style={inputStyle}
                            required
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Interview Time *</label>
                          <input
                            type="time"
                            value={editForm.time}
                            onChange={e => handleEditChange('time', e.target.value)}
                            style={inputStyle}
                            required
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Meeting Type</label>
                          <select value={editForm.meetingType} onChange={e => handleEditChange('meetingType', e.target.value)} style={selectStyle}>
                            <option value="IN_PLATFORM">In-Platform (Interview in this app)</option>
                            <option value="ONLINE">External Online (Google Meet, Zoom, etc.)</option>
                          </select>
                        </div>
                        {editForm.meetingType === 'ONLINE' && (
                          <div>
                            <label style={labelStyle}>Meeting Link</label>
                            <input
                              type="url"
                              placeholder="https://meet.google.com/..."
                              value={editForm.meetingLink}
                              onChange={e => handleEditChange('meetingLink', e.target.value)}
                              style={inputStyle}
                            />
                          </div>
                        )}
                        <div>
                          <label style={labelStyle}>Notes / Description</label>
                          <textarea
                            rows={4}
                            placeholder="Optional notes about this interview..."
                            value={editForm.description}
                            onChange={e => handleEditChange('description', e.target.value)}
                            style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Toggles — only shown for In-Platform meetings */}
                    {editForm.meetingType === 'IN_PLATFORM' && (
                      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            type="button"
                            className={`interview-toggle ${editForm.requireMobilePairing ? 'interview-toggle--active' : ''}`}
                            onClick={() => handleEditChange('requireMobilePairing', !editForm.requireMobilePairing)}
                          >
                            <div className="interview-toggle-knob" />
                          </button>
                          <span style={{ fontSize: 13, color: '#475569' }}>Mobile Camera Monitoring</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            type="button"
                            className={`interview-toggle ${editForm.recordInterview ? 'interview-toggle--active' : ''}`}
                            onClick={() => handleEditChange('recordInterview', !editForm.recordInterview)}
                          >
                            <div className="interview-toggle-knob" />
                          </button>
                          <span style={{ fontSize: 13, color: '#475569' }}>Record Interview</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setEditInterview(null)}>Cancel</button>
                <button
                  className="reg-admin-btn reg-admin-btn--primary"
                  onClick={handleEditSave}
                  disabled={editFetching || editSaving}
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELETE / CANCEL CONFIRM MODAL ── */}
      <AnimatePresence>
        {confirmTarget && (
          <motion.div className="reg-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setConfirmTarget(null)}>
            <motion.div className="reg-modal reg-modal--small"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>{confirmTarget.action === 'delete' ? 'Delete Interview' : 'Cancel Interview'}</h3>
                <button onClick={() => setConfirmTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="#64748b" />
                </button>
              </div>
              <div className="reg-modal-body">
                <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>
                  Are you sure you want to {confirmTarget.action === 'delete' ? 'delete' : 'cancel'} interview{' '}
                  <strong>#{confirmTarget.interview.id}</strong>
                  {confirmTarget.interview.title ? ` "${confirmTarget.interview.title}"` : ''}?
                  {confirmTarget.action === 'delete'
                    ? ' This will permanently remove the interview and all its associated data.'
                    : ' The interview will be marked as cancelled and all participants notified.'}
                </p>
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setConfirmTarget(null)}>Keep Interview</button>
                <button
                  className="reg-admin-btn reg-admin-btn--danger"
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : confirmTarget.action === 'delete' ? 'Delete Interview' : 'Cancel Interview'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
