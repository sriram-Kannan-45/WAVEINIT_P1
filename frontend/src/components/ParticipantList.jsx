import React, { useState, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Trash2, Eye, Edit2, Check, X, ChevronLeft, ChevronRight, ChevronDown, Users, UserPlus } from 'lucide-react'
import StatusBadge from './StatusBadge'
import SkeletonCard from './SkeletonCard'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
}

const avatarGradients = [
  'linear-gradient(135deg, #16a34a, #15803d)',
  'linear-gradient(135deg, #0d9488, #0f766e)',
  'linear-gradient(135deg, #2563eb, #1d4ed8)',
  'linear-gradient(135deg, #7c3aed, #6d28d9)',
  'linear-gradient(135deg, #ea580c, #c2410c)',
  'linear-gradient(135deg, #d946ef, #c026d3)',
  'linear-gradient(135deg, #0ea5e9, #0284c7)',
  'linear-gradient(135deg, #f43f5e, #e11d48)',
]

function getAvatarGradient(name) {
  if (!name) return avatarGradients[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return avatarGradients[Math.abs(hash) % avatarGradients.length]
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ParticipantList Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24, background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: 20, color: '#dc2626'
        }} role="alert">
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 4, fontSize: 16 }}>Error Loading Participants</h3>
          <p style={{ fontSize: 14, color: '#6b7280' }}>{this.state.error?.message || 'An unexpected error occurred'}</p>
        </div>
      )
    }
    return this.props.children
  }
}

function ParticipantList({
  participants = [],
  loading = false,
  onDelete = null,
  onRefresh = null,
  onView = null,
  onApprove = null,
  onReject = null
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [currentPage, setCurrentPage] = useState(1)
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const itemsPerPage = 10

  const getInitials = useCallback((name) => {
    if (!name) return '?'
    return name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }, [])

  const counts = useMemo(() => {
    const res = { all: participants.length, APPROVED: 0, PENDING: 0, REJECTED: 0 }
    participants.forEach(p => {
      const status = (p.status || '').toUpperCase()
      if (status === 'APPROVED') res.APPROVED++
      if (status === 'PENDING') res.PENDING++
      if (status === 'REJECTED') res.REJECTED++
    })
    return res
  }, [participants])

  const filteredItems = useMemo(() => {
    let items = participants.filter(p => {
      const matchesSearch = !searchTerm ||
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone?.includes(searchTerm)
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })

    items.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'date') return new Date(b.created_at || b.joinedAt || 0) - new Date(a.created_at || a.joinedAt || 0)
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '')
      return 0
    })

    return items
  }, [participants, searchTerm, statusFilter, sortBy])

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const startIdx = (currentPage - 1) * itemsPerPage
  const paginatedItems = filteredItems.slice(startIdx, startIdx + itemsPerPage)

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }, [])

  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1))
  }, [])

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1))
  }, [totalPages])

  const handleDelete = useCallback((id, name) => {
    if (onDelete) onDelete(id, name)
  }, [onDelete])

  const handleSaveStatus = async () => {
    if (!editingParticipant) return
    try {
      if (editStatus === 'APPROVED' && editingParticipant.status !== 'APPROVED') {
        if (onApprove) await onApprove(editingParticipant.id)
      } else if (editStatus === 'REJECTED' && editingParticipant.status !== 'REJECTED') {
        if (onReject) await onReject(editingParticipant.id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setEditingParticipant(null)
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading participants">
        <SkeletonCard variant="card" count={5} />
      </div>
    )
  }

  if (!participants || participants.length === 0) {
    return (
      <div className="wl-participants-empty" role="status" aria-live="polite">
        <div className="wl-participants-empty-icon">
          <Users size={48} />
        </div>
        <h3 className="wl-participants-empty-title">No Participants Yet</h3>
        <p className="wl-participants-empty-desc">
          Participants will appear here once they register. Invite your first learner to get started.
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="wl-participants-btn-primary"
            aria-label="Refresh participant list"
          >
            <UserPlus size={18} />
            Invite Participant
          </button>
        )}
      </div>
    )
  }

  const resultsMessage = `Showing ${paginatedItems.length} of ${filteredItems.length} participants`

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Toolbar */}
      <div className="wl-participants-toolbar">
        <div className="wl-participants-search">
          <Search size={18} className="wl-participants-search-icon" />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div className="wl-participants-filter-group">
          <select
            className="wl-participants-filter-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
          >
            <option value="all">All Status ({counts.all})</option>
            <option value="APPROVED">Approved ({counts.APPROVED})</option>
            <option value="PENDING">Pending ({counts.PENDING})</option>
            <option value="REJECTED">Rejected ({counts.REJECTED})</option>
          </select>

          <select
            className="wl-participants-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Sort by Name</option>
            <option value="date">Sort by Date</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />

        <span className="wl-participants-results">{resultsMessage}</span>
      </div>

      {/* Participant Cards */}
      <div className="wl-participants-list">
        {paginatedItems.map((p) => (
          <motion.div
            key={p.id}
            className="wl-participant-card"
            variants={cardVariants}
          >
            {/* Avatar */}
            <div
              className="wl-participant-avatar"
              style={{ background: getAvatarGradient(p.name) }}
            >
              {getInitials(p.name)}
            </div>

            {/* Name & Email */}
            <div className="wl-participant-info">
              <div className="wl-participant-name">{p.name || '-'}</div>
              <div className="wl-participant-email">{p.email}</div>
            </div>

            {/* Enrollment Date */}
            <div className="wl-participant-date">
              {new Date(p.created_at || p.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>

            {/* Progress */}
            <div className="wl-participant-progress">
              <div className="wl-participant-progress-label">
                <span className="wl-participant-progress-text">Progress</span>
                <span className="wl-participant-progress-value">{p.progress || 0}%</span>
              </div>
              <div className="wl-participant-progress-bar">
                <div
                  className="wl-participant-progress-fill"
                  style={{ width: `${Math.min(100, p.progress || 0)}%` }}
                />
              </div>
            </div>

            {/* Quiz Score */}
            <div className="wl-participant-quiz">
              <strong>{p.quizScore || p.quiz_score || 0}%</strong>
              Quiz
            </div>

            {/* Status */}
            <StatusBadge status={p.status || 'PENDING'} size="sm" />

            {/* Actions */}
            <div className="wl-participant-actions">
              {onView && (
                <button
                  className="wl-participant-action-btn"
                  onClick={() => onView(p)}
                  title="View Profile"
                >
                  <Eye size={16} />
                </button>
              )}
              <button
                className="wl-participant-action-btn"
                onClick={() => { setEditingParticipant(p); setEditStatus(p.status || 'PENDING') }}
                title="Edit Status"
              >
                <Edit2 size={16} />
              </button>
              {onDelete && (
                <button
                  className="wl-participant-action-btn wl-participant-action-btn--danger"
                  onClick={() => handleDelete(p.id, p.name)}
                  title="Remove Participant"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="wl-participants-pagination" aria-label="Pagination">
          <button
            className="wl-participants-page-btn"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} /> Previous
          </button>

          <div className="wl-participants-page-info">
            {currentPage} <span style={{ color: '#94a3b8', fontWeight: 400 }}>of</span> {totalPages}
          </div>

          <button
            className="wl-participants-page-btn"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            Next <ChevronRight size={16} />
          </button>
        </nav>
      )}

      {/* Edit Status Modal */}
      <AnimatePresence>
        {editingParticipant && (
          <motion.div
            className="modal-overlay"
            onClick={() => setEditingParticipant(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '420px' }}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="modal-header">
                <h3>Manage Participant Status</h3>
                <button className="modal-close" onClick={() => setEditingParticipant(null)}>×</button>
              </div>
              <div className="modal-body">
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 14, background: '#f8fafc', borderRadius: 14,
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: getAvatarGradient(editingParticipant.name), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)'
                  }}>
                    {getInitials(editingParticipant.name)}
                  </div>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', fontFamily: 'var(--font-display)' }}>{editingParticipant.name}</h4>
                    <p style={{ fontSize: 13, color: '#64748b', fontFamily: 'var(--font-primary)' }}>{editingParticipant.email}</p>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ fontFamily: 'var(--font-primary)', fontSize: 13, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 10 }}>Account Status</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setEditStatus('APPROVED')}
                      style={{
                        flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-primary)',
                        transition: 'all 180ms ease',
                        background: editStatus === 'APPROVED' ? '#f0fdf4' : 'transparent',
                        color: editStatus === 'APPROVED' ? '#16a34a' : '#64748b',
                        borderColor: editStatus === 'APPROVED' ? 'rgba(22,163,74,0.3)' : '#e2e8f0'
                      }}
                    >
                      <Check size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} /> Approved
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditStatus('REJECTED')}
                      style={{
                        flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-primary)',
                        transition: 'all 180ms ease',
                        background: editStatus === 'REJECTED' ? '#fef2f2' : 'transparent',
                        color: editStatus === 'REJECTED' ? '#ef4444' : '#64748b',
                        borderColor: editStatus === 'REJECTED' ? 'rgba(239,68,68,0.3)' : '#e2e8f0'
                      }}
                    >
                      <X size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} /> Rejected
                    </button>
                  </div>
                </div>

                <div className="modal-footer" style={{ marginTop: 24 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingParticipant(null)}>Cancel</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={handleSaveStatus}>Save Status</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default memo(ParticipantList)
