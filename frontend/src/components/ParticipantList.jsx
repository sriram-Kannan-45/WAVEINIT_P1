import React, { useState, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Trash2, Eye, Phone, Calendar, Edit2, Check, X, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react'
import StatusBadge from './StatusBadge'
import SkeletonCard from './SkeletonCard'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }
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
          padding: 16, background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, color: '#dc2626'
        }} role="alert">
          <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Error Loading Participants</h3>
          <p style={{ fontSize: 13 }}>{this.state.error?.message || 'An unexpected error occurred'}</p>
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
    return participants.filter(p => {
      const matchesSearch = !searchTerm || 
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone?.includes(searchTerm)
      
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      
      return matchesSearch && matchesStatus
    })
  }, [participants, searchTerm, statusFilter])

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
    if (onDelete) {
      onDelete(id, name)
    }
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
      <div className="empty-state" role="status" aria-live="polite">
        <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>No Participants Yet</h3>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>Participants will appear here once they register.</p>
        {onRefresh && (
          <button 
            onClick={onRefresh}
            className="btn btn-primary btn-sm"
            aria-label="Refresh participant list"
          >
            Refresh List
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
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Toolbar: Search box & Segmented Filter Pills */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={handleSearchChange}
            style={{
              width: '100%', padding: '9px 14px 9px 40px', fontSize: 13.5, height: 40,
              fontFamily: "'Poppins', sans-serif", background: '#FFFFFF',
              border: '1.5px solid #ECECEC', borderRadius: 10,
              color: '#111827', outline: 'none',
              transition: 'border-color 200ms ease, box-shadow 200ms ease'
            }}
            onFocus={e => { e.target.style.borderColor = '#0D9488'; e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.12)' }}
            onBlur={e => { e.target.style.borderColor = '#ECECEC'; e.target.style.boxShadow = 'none' }}
          />
        </div>

        {/* Segmented Filter Pills */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#F1F3F6', borderRadius: 10, padding: 4
        }}>
          {[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'APPROVED', label: 'Approved', count: counts.APPROVED },
            { key: 'PENDING', label: 'Pending', count: counts.PENDING },
            { key: 'REJECTED', label: 'Rejected', count: counts.REJECTED }
          ].map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => { setStatusFilter(chip.key); setCurrentPage(1) }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif", border: 'none',
                transition: 'all 180ms ease',
                background: statusFilter === chip.key ? '#FFFFFF' : 'transparent',
                color: statusFilter === chip.key ? '#111827' : '#6B7280',
                boxShadow: statusFilter === chip.key ? '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' : 'none'
              }}
            >
              {chip.label} ({chip.count})
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: '#9CA3AF', fontWeight: 500, fontFamily: "'Poppins', sans-serif" }} role="status" aria-live="polite" aria-atomic="true">
        {resultsMessage}
      </div>

      {/* Participant Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>Avatar</th>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>Name</th>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>Email</th>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>Phone</th>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>Registration Date</th>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>Status</th>
              <th style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((p, idx) => (
              <motion.tr
                key={p.id}
                variants={rowVariants}
                custom={idx}
              >
                <td>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9999,
                    background: 'rgba(13,148,136,0.10)', color: '#0D9488',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: "'Poppins', sans-serif",
                    flexShrink: 0
                  }}>
                    {getInitials(p.name)}
                  </div>
                </td>
                <td style={{ fontWeight: 600, color: '#111827', fontFamily: "'Poppins', sans-serif" }}>{p.name || '-'}</td>
                <td style={{ color: '#6B7280', fontFamily: "'Poppins', sans-serif" }}>{p.email}</td>
                <td style={{ color: '#6B7280', fontFamily: "'Poppins', sans-serif" }}>{p.phone || '-'}</td>
                <td style={{ color: '#6B7280', fontFamily: "'Poppins', sans-serif", fontSize: 13 }}>
                  {new Date(p.created_at || p.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  <StatusBadge status={p.status || 'PENDING'} size="sm" />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    {onView && (
                      <button
                        onClick={() => onView(p)}
                        className="btn-icon btn-sm"
                        title="View Profile"
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          border: '1px solid #ECECEC', background: '#FFFFFF',
                          color: '#6B7280', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 150ms ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.color = '#0D9488' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#ECECEC'; e.currentTarget.style.color = '#6B7280' }}
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingParticipant(p); setEditStatus(p.status || 'PENDING') }}
                      className="btn-icon btn-sm"
                      title="Edit Status"
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        border: '1px solid #ECECEC', background: '#FFFFFF',
                        color: '#6B7280', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 150ms ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.color = '#0D9488' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#ECECEC'; e.currentTarget.style.color = '#6B7280' }}
                    >
                      <Edit2 size={14} />
                    </button>
                    {onDelete && (
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="btn-icon btn-sm"
                        title="Remove Participant"
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          border: '1px solid #ECECEC', background: '#FFFFFF',
                          color: '#6B7280', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 150ms ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#ECECEC'; e.currentTarget.style.color = '#6B7280' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }} aria-label="Pagination">
          <motion.button
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              fontFamily: "'Poppins', sans-serif",
              border: '1px solid #ECECEC', background: '#FFFFFF',
              color: currentPage === 1 ? '#9CA3AF' : '#111827',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1,
              transition: 'all 150ms ease'
            }}
          >
            <ChevronLeft size={14} /> Previous
          </motion.button>
          
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 12px', background: '#F1F3F6', borderRadius: 8,
            fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif",
            color: '#6B7280'
          }}>
            {currentPage} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>of</span> {totalPages}
          </div>
          
          <motion.button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              fontFamily: "'Poppins', sans-serif",
              border: '1px solid #ECECEC', background: '#FFFFFF',
              color: currentPage === totalPages ? '#9CA3AF' : '#111827',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1,
              transition: 'all 150ms ease'
            }}
          >
            Next <ChevronRight size={14} />
          </motion.button>
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
                  padding: 14, background: '#F1F3F6', borderRadius: 12,
                  border: '1px solid #ECECEC'
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'rgba(13,148,136,0.10)', color: '#0D9488',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, fontFamily: "'Poppins', sans-serif"
                  }}>
                    {getInitials(editingParticipant.name)}
                  </div>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: 14, color: '#111827', fontFamily: "'Poppins', sans-serif" }}>{editingParticipant.name}</h4>
                    <p style={{ fontSize: 12.5, color: '#6B7280', fontFamily: "'Poppins', sans-serif" }}>{editingParticipant.email}</p>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 20 }}>
                  <label className="form-label" style={{ fontFamily: "'Poppins', sans-serif", fontSize: 13, fontWeight: 500, color: '#6B7280' }}>Account Status</label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <motion.button
                      type="button"
                      onClick={() => setEditStatus('APPROVED')}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                        transition: 'all 180ms ease',
                        background: editStatus === 'APPROVED' ? 'rgba(16,185,129,0.08)' : 'transparent',
                        color: editStatus === 'APPROVED' ? '#059669' : '#6B7280',
                        borderColor: editStatus === 'APPROVED' ? 'rgba(16,185,129,0.3)' : '#ECECEC'
                      }}
                    >
                      <Check size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Approved
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => setEditStatus('REJECTED')}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                        transition: 'all 180ms ease',
                        background: editStatus === 'REJECTED' ? 'rgba(239,68,68,0.08)' : 'transparent',
                        color: editStatus === 'REJECTED' ? '#dc2626' : '#6B7280',
                        borderColor: editStatus === 'REJECTED' ? 'rgba(239,68,68,0.3)' : '#ECECEC'
                      }}
                    >
                      <X size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Rejected
                    </motion.button>
                  </div>
                </div>

                <div className="modal-footer">
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
