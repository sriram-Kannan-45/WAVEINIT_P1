/**
 * InterviewDashboard Page
 * Enterprise admin table view — matches RegistrationApplications design exactly.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, Calendar, Clock, User, Plus, Search, Filter,
  Eye, Pencil, CalendarClock, Play, XCircle, Trash2,
  FileText, X, Loader2, ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import interviewService from '../../services/interviewService'

const STATUS_COLORS = {
  SCHEDULED:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  IN_PROGRESS: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  COMPLETED:   { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  CANCELLED:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  RESCHEDULED: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  NO_SHOW:     { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
}

const TYPE_BADGE = {
  TECHNICAL: { cls: 'reg-admin-type--technical', label: 'Technical' },
  HR:        { cls: 'reg-admin-type--hr', label: 'HR' },
  MANAGERIAL:{ cls: 'reg-admin-type--managerial', label: 'Managerial' },
  CUSTOM:    { cls: 'reg-admin-type--custom', label: 'Custom' },
}

const MEETING_BADGE = {
  ONLINE:    { cls: 'reg-admin-meeting--online', label: 'Online' },
  IN_PERSON: { cls: 'reg-admin-meeting--in-person', label: 'In-Person' },
  HYBRID:    { cls: 'reg-admin-meeting--hybrid', label: 'Hybrid' },
  IN_PLATFORM: { cls: 'reg-admin-meeting--online', label: 'In-Platform' },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

export default function InterviewDashboard({ user }) {
  const navigate = useNavigate()
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, scheduled: 0, inProgress: 0, completed: 0, cancelled: 0, today: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 })
  const [detailInterview, setDetailInterview] = useState(null)
  const [editInterview, setEditInterview] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [actionLoading, setActionLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(null)
  const menuRef = useRef(null)
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
      console.error('Failed to fetch interviews:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [statusFilter, typeFilter])

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchData(1)
  }

  const handleView = (interview) => { setDetailInterview(interview); setMenuOpen(null) }

  const handleEdit = (interview) => {
    setEditForm({
      title: interview.title || '',
      description: interview.description || '',
      type: interview.type,
      meeting_type: interview.meeting_type || 'ONLINE',
      meeting_link: interview.meeting_link || '',
      record_interview: interview.record_interview || false,
    })
    setEditInterview(interview)
    setMenuOpen(null)
  }

  const handleSaveEdit = async () => {
    try {
      setActionLoading(true)
      await interviewService.update(editInterview.id, editForm)
      setEditInterview(null)
      fetchData(pagination.page)
    } catch (err) {
      console.error('Failed to update interview:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleStart = (interview) => {
    setMenuOpen(null)
    navigate(`/interview/${interview.id}/room`)
  }

  const handleCancel = async (interview) => {
    try {
      setActionLoading(true)
      await interviewService.update(interview.id, { status: 'CANCELLED' })
      setDeleteTarget(null)
      fetchData(pagination.page)
    } catch (err) {
      console.error('Failed to cancel:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (interview) => {
    try {
      setActionLoading(true)
      await interviewService.delete(interview.id)
      setDeleteTarget(null)
      fetchData(pagination.page)
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (dt) => new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const formatTime = (dt) => new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const getInitials = (name) => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
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

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
          <Video size={22} color="#fff" />
        </div>
        <div>
          <h2 className="reg-admin-title">Interviews</h2>
          <p className="reg-admin-subtitle">
            {isAdmin ? 'Manage all interviews across the platform' : 'Your assigned interviews'}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => navigate('/interview/schedule')}>
            <Plus size={15} /> Schedule Interview
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
            placeholder="Search by name, email, title..."
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
                <th>Mobile</th>
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
                    <td>{iv.candidate?.phone || '—'}</td>
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
                      <div className="reg-admin-actions" ref={menuRef}>
                        <button
                          className="reg-admin-action"
                          title="Actions"
                          onClick={() => setMenuOpen(menuOpen === iv.id ? null : iv.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
                          </svg>
                        </button>
                        <AnimatePresence>
                          {menuOpen === iv.id && (
                            <motion.div
                              className="reg-admin-action-menu"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                            >
                              <button className="reg-admin-action-menu-item" onClick={() => handleView(iv)}>
                                <Eye size={14} /> View Details
                              </button>
                              {iv.status === 'SCHEDULED' && isAdmin && (
                                <button className="reg-admin-action-menu-item" onClick={() => handleEdit(iv)}>
                                  <Pencil size={14} /> Edit
                                </button>
                              )}
                              {iv.status === 'SCHEDULED' && isAdmin && (
                                <button className="reg-admin-action-menu-item" onClick={() => { navigate(`/interview/schedule?reschedule=${iv.id}`); setMenuOpen(null) }}>
                                  <CalendarClock size={14} /> Reschedule
                                </button>
                              )}
                              {(iv.status === 'SCHEDULED' || iv.status === 'IN_PROGRESS') && isAdmin && (
                                <button className="reg-admin-action-menu-item" onClick={() => handleStart(iv)}>
                                  <Play size={14} /> Start Interview
                                </button>
                              )}
                              {iv.status === 'SCHEDULED' && (
                                <button className="reg-admin-action-menu-item" onClick={() => { setDeleteTarget(iv); setMenuOpen(null) }}>
                                  <XCircle size={14} /> Cancel
                                </button>
                              )}
                              {iv.status !== 'COMPLETED' && isAdmin && (
                                <button className="reg-admin-action-menu-item reg-admin-action-menu-item--danger" onClick={() => { setDeleteTarget(iv); setMenuOpen(null) }}>
                                  <Trash2 size={14} /> Delete
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
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
                <div className="reg-modal-grid">
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Title</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{detailInterview.title || `Interview #${detailInterview.id}`}</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Status</span>
                    <div><span className="reg-admin-status" style={{ background: STATUS_COLORS[detailInterview.status]?.bg, color: STATUS_COLORS[detailInterview.status]?.text, borderColor: STATUS_COLORS[detailInterview.status]?.border }}>
                      {detailInterview.status?.replace('_', ' ')}
                    </span></div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Candidate</span>
                    <div style={{ fontSize: 14 }}>{detailInterview.candidate?.name} ({detailInterview.candidate?.email})</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Mobile</span>
                    <div style={{ fontSize: 14 }}>{detailInterview.candidate?.phone || '—'}</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Interviewer</span>
                    <div style={{ fontSize: 14 }}>{detailInterview.interviewer?.name} ({detailInterview.interviewer?.email})</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Type</span>
                    <div><span className={`reg-admin-type ${TYPE_BADGE[detailInterview.type]?.cls}`}>{TYPE_BADGE[detailInterview.type]?.label}</span></div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Date & Time</span>
                    <div style={{ fontSize: 14 }}>{formatDate(detailInterview.scheduled_at)} at {formatTime(detailInterview.scheduled_at)}</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Duration</span>
                    <div style={{ fontSize: 14 }}>{detailInterview.duration_minutes} minutes</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Meeting Type</span>
                    <div><span className={`reg-admin-meeting ${MEETING_BADGE[detailInterview.meeting_type]?.cls}`}>{MEETING_BADGE[detailInterview.meeting_type]?.label}</span></div></div>
                  {detailInterview.meeting_link && (
                    <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Meeting Link</span>
                      <div style={{ fontSize: 14, wordBreak: 'break-all' }}>{detailInterview.meeting_link}</div></div>
                  )}
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Record Interview</span>
                    <div style={{ fontSize: 14 }}>{detailInterview.record_interview ? 'Yes' : 'No'}</div></div>
                  <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Mobile Pairing</span>
                    <div style={{ fontSize: 14 }}>{detailInterview.require_mobile_pairing ? 'Required' : 'Not Required'}</div></div>
                </div>
                {detailInterview.description && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Description</span>
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
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setDetailInterview(null)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EDIT MODAL ── */}
      <AnimatePresence>
        {editInterview && (
          <motion.div className="reg-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditInterview(null)}>
            <motion.div className="reg-modal"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>Edit Interview</h3>
                <button onClick={() => setEditInterview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="#64748b" />
                </button>
              </div>
              <div className="reg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Title</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Type</label>
                    <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                      <option value="TECHNICAL">Technical</option>
                      <option value="HR">HR</option>
                      <option value="MANAGERIAL">Managerial</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Meeting Type</label>
                    <select value={editForm.meeting_type} onChange={e => setEditForm(f => ({ ...f, meeting_type: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                      <option value="IN_PLATFORM">In-Platform</option>
                      <option value="ONLINE">External Online</option>
                      <option value="IN_PERSON">In-Person</option>
                      <option value="HYBRID">Hybrid</option>
                    </select>
                  </div>
                </div>
                {editForm.meeting_type === 'IN_PLATFORM' && (
                  <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                    Room URL auto-generated at <code>{editInterview.meeting_link || `/interview/${editInterview.id}/room`}</code>
                  </div>
                )}
                {(editForm.meeting_type === 'ONLINE' || editForm.meeting_type === 'HYBRID') && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Meeting Link</label>
                    <input value={editForm.meeting_link} onChange={e => setEditForm(f => ({ ...f, meeting_link: e.target.value }))}
                      placeholder="https://meet.google.com/..."
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Description</label>
                  <textarea rows={3} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className={`interview-toggle ${editForm.record_interview ? 'interview-toggle--active' : ''}`}
                    onClick={() => setEditForm(f => ({ ...f, record_interview: !f.record_interview }))}
                  >
                    <div className="interview-toggle-knob" />
                  </button>
                  <span style={{ fontSize: 13, color: '#475569' }}>Record Interview</span>
                </div>
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setEditInterview(null)}>Cancel</button>
                <button className="reg-admin-btn reg-admin-btn--primary" onClick={handleSaveEdit} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELETE/CANCEL MODAL ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div className="reg-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDeleteTarget(null)}>
            <motion.div className="reg-modal reg-modal--small"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>{isAdmin ? 'Delete Interview' : 'Cancel Interview'}</h3>
                <button onClick={() => setDeleteTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color="#64748b" />
                </button>
              </div>
              <div className="reg-modal-body">
                <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>
                  Are you sure you want to {isAdmin ? 'delete' : 'cancel'} interview <strong>#{deleteTarget.id}</strong>
                  {deleteTarget.title ? ` "${deleteTarget.title}"` : ''}?
                  {isAdmin ? ' This will cancel the interview and notify all participants.' : ' This action cannot be undone.'}
                </p>
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setDeleteTarget(null)}>Keep Interview</button>
                <button
                  className="reg-admin-btn reg-admin-btn--danger"
                  onClick={() => isAdmin ? handleDelete(deleteTarget) : handleCancel(deleteTarget)}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : isAdmin ? 'Delete Interview' : 'Cancel Interview'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
