import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, CheckCircle2, XCircle, Clock, AlertCircle, Eye, Send,
  UserPlus, Download, Search, Filter, Loader2, ChevronDown, Star, Briefcase
} from 'lucide-react'
import { API } from '../../api/api'

const STATUS_COLORS = {
  PENDING: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  APPROVED: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  WAITLISTED: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
}

function ScoreBadge({ score }) {
  if (!score) return <span className="reg-admin-score reg-admin-score--na">N/A</span>
  const color = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626'
  return (
    <span className="reg-admin-score" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
      <Star size={12} /> {score}%
    </span>
  )
}

export default function RegistrationApplications({ user }) {
  const [applications, setApplications] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedApp, setSelectedApp] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [assignModal, setAssignModal] = useState(null)
  const [trainers, setTrainers] = useState([])
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` })

  useEffect(() => { fetchApplications(); fetchStats(); }, [filter])

  const fetchApplications = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'ALL') params.set('status', filter)
      if (search) params.set('search', search)
      const r = await fetch(`${API.REGISTRATION.APPLICATIONS}?${params}`, { headers: auth() })
      const d = await r.json()
      if (r.ok) setApplications(d.applications || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchStats = async () => {
    try {
      const r = await fetch(API.REGISTRATION.STATS, { headers: auth() })
      const d = await r.json()
      if (r.ok) setStats(d)
    } catch (e) { console.error(e) }
  }

  const fetchTrainers = async () => {
    try {
      const r = await fetch(API.REGISTRATION.TRAINERS, { headers: auth() })
      const d = await r.json()
      if (r.ok) setTrainers(d.trainers || [])
    } catch (e) { console.error(e) }
  }

  const handleApprove = async (id) => {
    setActionLoading(id)
    try {
      const r = await fetch(API.REGISTRATION.APPROVE(id), { method: 'PATCH', headers: auth(), body: JSON.stringify({}) })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error)
      alert(`Approved! Participant ID: ${d.participantId}\nTemp Password: ${d.plainPassword}\n\nShare these credentials securely.`)
      fetchApplications(); fetchStats()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setActionLoading(null) }
  }

  const handleReject = async () => {
    if (!rejectModal) return
    setActionLoading(rejectModal.id)
    try {
      const r = await fetch(API.REGISTRATION.REJECT(rejectModal.id), { method: 'PATCH', headers: auth(), body: JSON.stringify({ reason: rejectReason }) })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error)
      setRejectModal(null); setRejectReason('')
      fetchApplications(); fetchStats()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setActionLoading(null) }
  }

  const handleAssignTrainer = async (appId, trainerId) => {
    setActionLoading(appId)
    try {
      const r = await fetch(API.REGISTRATION.ASSIGN_TRAINER(appId), { method: 'PATCH', headers: auth(), body: JSON.stringify({ trainerId }) })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error)
      setAssignModal(null)
      fetchApplications()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setActionLoading(null) }
  }

  const handleSendCredentials = async (id) => {
    setActionLoading(id)
    try {
      const r = await fetch(API.REGISTRATION.SEND_CREDENTIALS(id), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error)
      alert(d.message)
      fetchApplications()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setActionLoading(null) }
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (filter !== 'ALL') params.set('status', filter)
    window.open(`${API.REGISTRATION.EXPORT}?${params}`, '_blank')
  }

  return (
    <div className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon"><FileText size={22} /></div>
        <div>
          <h2 className="reg-admin-title">Participant Applications</h2>
          <p className="reg-admin-subtitle">Review and manage registration applications</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="reg-admin-btn reg-admin-btn--secondary" onClick={handleExport}><Download size={14} /> Export Excel</button>
      </div>

      {/* Stats */}
      <div className="reg-admin-stats">
        {[
          { label: 'Total', value: stats.total, icon: FileText, color: '#6366f1' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: '#f59e0b' },
          { label: 'Approved', value: stats.approved, icon: CheckCircle2, color: '#059669' },
          { label: 'Rejected', value: stats.rejected, icon: XCircle, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="reg-admin-stat">
            <s.icon size={20} style={{ color: s.color }} />
            <div>
              <span className="reg-admin-stat-num">{s.value}</span>
              <span className="reg-admin-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="reg-admin-filters">
        <div className="reg-admin-search">
          <Search size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applications..." onKeyDown={e => e.key === 'Enter' && fetchApplications()} />
        </div>
        <div className="reg-admin-filter-tabs">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED'].map(f => (
            <button key={f} className={`reg-admin-filter-tab ${filter === f ? 'reg-admin-filter-tab--active' : ''}`}
              onClick={() => setFilter(f)}>
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              {f === 'PENDING' && stats.pending > 0 && <span className="reg-admin-badge">{stats.pending}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Applications Table */}
      {loading ? (
        <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading applications...</p></div>
      ) : applications.length === 0 ? (
        <div className="reg-admin-empty"><FileText size={40} /><h3>No Applications Found</h3><p>No applications match your current filter.</p></div>
      ) : (
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Participant</th>
                <th>Training</th>
                <th>AI Score</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.id}>
                  <td><span className="reg-admin-app-id">{app.applicationNumber}</span></td>
                  <td>
                    <div className="reg-admin-participant">
                      <div className="reg-admin-avatar">{app.firstName?.[0]}{app.lastName?.[0]}</div>
                      <div>
                        <span className="reg-admin-name">{app.fullName}</span>
                        <span className="reg-admin-email">{app.email}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="reg-admin-training">{app.trainingTitle}</span></td>
                  <td><ScoreBadge score={app.aiScore} /></td>
                  <td>
                    <span className="reg-admin-status" style={{
                      background: STATUS_COLORS[app.status]?.bg,
                      color: STATUS_COLORS[app.status]?.text,
                      borderColor: STATUS_COLORS[app.status]?.border,
                    }}>{app.status}</span>
                  </td>
                  <td className="reg-admin-date">{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="reg-admin-actions">
                      <button className="reg-admin-action" title="View Details" onClick={() => setSelectedApp(app)}><Eye size={14} /></button>
                      {app.status === 'PENDING' && (
                        <>
                          <button className="reg-admin-action reg-admin-action--approve" title="Approve"
                            onClick={() => handleApprove(app.id)} disabled={actionLoading === app.id}>
                            {actionLoading === app.id ? <Loader2 size={14} className="bulk-spin" /> : <CheckCircle2 size={14} />}
                          </button>
                          <button className="reg-admin-action reg-admin-action--reject" title="Reject"
                            onClick={() => setRejectModal(app)} disabled={actionLoading === app.id}>
                            <XCircle size={14} />
                          </button>
                          <button className="reg-admin-action reg-admin-action--assign" title="Assign Trainer"
                            onClick={() => { setAssignModal(app); fetchTrainers() }}>
                            <UserPlus size={14} />
                          </button>
                        </>
                      )}
                      {app.status === 'APPROVED' && !app.credentialsSentAt && (
                        <button className="reg-admin-action reg-admin-action--send" title="Send Credentials"
                          onClick={() => handleSendCredentials(app.id)} disabled={actionLoading === app.id}>
                          {actionLoading === app.id ? <Loader2 size={14} className="bulk-spin" /> : <Send size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedApp && (
          <motion.div className="reg-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedApp(null)}>
            <motion.div className="reg-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>Application Details — {selectedApp.applicationNumber}</h3>
                <button onClick={() => setSelectedApp(null)}><XCircle size={20} /></button>
              </div>
              <div className="reg-modal-body">
                <div className="reg-modal-grid">
                  <div><strong>Name:</strong> {selectedApp.fullName}</div>
                  <div><strong>Email:</strong> {selectedApp.email}</div>
                  <div><strong>Phone:</strong> {selectedApp.phone || 'N/A'}</div>
                  <div><strong>Gender:</strong> {selectedApp.gender?.replace(/_/g, ' ') || 'N/A'}</div>
                  <div><strong>DOB:</strong> {selectedApp.dob || 'N/A'}</div>
                  <div><strong>Qualification:</strong> {selectedApp.qualification || 'N/A'}</div>
                  <div><strong>Experience:</strong> {selectedApp.experience || 'N/A'}</div>
                  <div><strong>Training:</strong> {selectedApp.trainingTitle}</div>
                  <div><strong>Batch:</strong> {selectedApp.batch || 'N/A'}</div>
                  <div><strong>City:</strong> {[selectedApp.city, selectedApp.state, selectedApp.country].filter(Boolean).join(', ') || 'N/A'}</div>
                  <div><strong>AI Score:</strong> <ScoreBadge score={selectedApp.aiScore} /></div>
                  <div><strong>Status:</strong> {selectedApp.status}</div>
                  {selectedApp.trainerName && <div><strong>Trainer:</strong> {selectedApp.trainerName}</div>}
                  {selectedApp.participantId && <div><strong>Participant ID:</strong> {selectedApp.participantId}</div>}
                  {selectedApp.rejectionReason && <div><strong>Rejection Reason:</strong> {selectedApp.rejectionReason}</div>}
                  {selectedApp.credentialsSentAt && <div><strong>Credentials Sent:</strong> {new Date(selectedApp.credentialsSentAt).toLocaleString()}</div>}
                </div>
              </div>
              <div className="reg-modal-footer">
                {selectedApp.status === 'PENDING' && (
                  <>
                    <button className="reg-admin-btn reg-admin-btn--danger" onClick={() => { setSelectedApp(null); setRejectModal(selectedApp) }}>Reject</button>
                    <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => { setSelectedApp(null); handleApprove(selectedApp.id) }}>Approve</button>
                  </>
                )}
                {selectedApp.status === 'APPROVED' && !selectedApp.credentialsSentAt && (
                  <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => { setSelectedApp(null); handleSendCredentials(selectedApp.id) }}>Send Credentials</button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Modal */}
      <AnimatePresence>
        {rejectModal && (
          <motion.div className="reg-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRejectModal(null)}>
            <motion.div className="reg-modal reg-modal--small" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <h3>Reject Application</h3>
              <p>Reason for rejecting {rejectModal.fullName}'s application:</p>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Optional reason..." rows={3} />
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setRejectModal(null)}>Cancel</button>
                <button className="reg-admin-btn reg-admin-btn--danger" onClick={handleReject} disabled={actionLoading === rejectModal.id}>
                  {actionLoading === rejectModal.id ? <Loader2 size={14} className="bulk-spin" /> : 'Reject'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign Trainer Modal */}
      <AnimatePresence>
        {assignModal && (
          <motion.div className="reg-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAssignModal(null)}>
            <motion.div className="reg-modal reg-modal--small" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <h3>Assign Trainer to {assignModal.fullName}</h3>
              <div className="reg-trainer-list">
                {trainers.length === 0 ? (
                  <p className="reg-admin-empty-text">No trainers available for this training.</p>
                ) : trainers.map(t => (
                  <div key={t.id} className="reg-trainer-item" onClick={() => handleAssignTrainer(assignModal.id, t.id)}>
                    <div className="reg-admin-avatar">{t.name?.[0]}</div>
                    <div>
                      <strong>{t.name}</strong>
                      <span>{t.email}</span>
                    </div>
                    <UserPlus size={16} />
                  </div>
                ))}
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setAssignModal(null)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
