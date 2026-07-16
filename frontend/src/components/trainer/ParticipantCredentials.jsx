import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Eye, EyeOff, Loader2, CheckCircle2, Clock, Mail, BookOpen,
  User, Key, AlertCircle
} from 'lucide-react'
import { API } from '../../api/api'

export default function ParticipantCredentials({ user }) {
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [showPasswords, setShowPasswords] = useState(false)
  const [viewModal, setViewModal] = useState(null)

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` })

  useEffect(() => { fetchCredentials() }, [])

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const r = await fetch(API.TRAINER_CREDENTIALS.LIST, { headers: auth() })
      const d = await r.json()
      if (r.ok) setCredentials(d.credentials || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleSendCredentials = async (id) => {
    setActionLoading(id)
    try {
      const r = await fetch(API.TRAINER_CREDENTIALS.SEND(id), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error)
      alert(d.message)
      fetchCredentials()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setActionLoading(null) }
  }

  const pending = credentials.filter(c => !c.credentialsSentAt)
  const sent = credentials.filter(c => c.credentialsSentAt)

  return (
    <div className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}><Key size={22} /></div>
        <div>
          <h2 className="reg-admin-title">Pending Participant Credentials</h2>
          <p className="reg-admin-subtitle">Review participants and send their login credentials</p>
        </div>
      </div>

      {loading ? (
        <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading...</p></div>
      ) : credentials.length === 0 ? (
        <div className="reg-admin-empty"><Key size={40} /><h3>No Participants Assigned</h3><p>When admins assign participants to you, they'll appear here.</p></div>
      ) : (
        <>
          {/* Pending Credentials */}
          {pending.length > 0 && (
            <>
              <h3 className="reg-trainer-section-title"><Clock size={18} /> Pending Credentials ({pending.length})</h3>
              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table">
                  <thead>
                    <tr><th>Participant</th><th>Email</th><th>Training</th><th>Participant ID</th><th>Applied</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {pending.map(c => (
                      <tr key={c.id}>
                        <td>
                          <div className="reg-admin-participant">
                            <div className="reg-admin-avatar">{c.firstName?.[0]}{c.lastName?.[0]}</div>
                            <span className="reg-admin-name">{c.fullName}</span>
                          </div>
                        </td>
                        <td>{c.email}</td>
                        <td><span className="reg-admin-training">{c.trainingTitle}</span></td>
                        <td><span className="reg-admin-app-id">{c.participantId || 'Pending'}</span></td>
                        <td className="reg-admin-date">{new Date(c.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="reg-admin-actions">
                            <button className="reg-admin-action" title="View Details" onClick={() => setViewModal(c)}><Eye size={14} /></button>
                            <button className="reg-admin-action reg-admin-action--send" title="Send Credentials"
                              onClick={() => handleSendCredentials(c.id)} disabled={actionLoading === c.id}>
                              {actionLoading === c.id ? <Loader2 size={14} className="bulk-spin" /> : <Send size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Sent Credentials */}
          {sent.length > 0 && (
            <>
              <h3 className="reg-trainer-section-title" style={{ marginTop: 24 }}><CheckCircle2 size={18} style={{ color: '#059669' }} /> Credentials Sent ({sent.length})</h3>
              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table">
                  <thead>
                    <tr><th>Participant</th><th>Email</th><th>Training</th><th>Sent At</th></tr>
                  </thead>
                  <tbody>
                    {sent.map(c => (
                      <tr key={c.id}>
                        <td>
                          <div className="reg-admin-participant">
                            <div className="reg-admin-avatar">{c.firstName?.[0]}{c.lastName?.[0]}</div>
                            <span className="reg-admin-name">{c.fullName}</span>
                          </div>
                        </td>
                        <td>{c.email}</td>
                        <td><span className="reg-admin-training">{c.trainingTitle}</span></td>
                        <td className="reg-admin-date">{new Date(c.credentialsSentAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* View Modal */}
      <AnimatePresence>
        {viewModal && (
          <motion.div className="reg-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewModal(null)}>
            <motion.div className="reg-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <div className="reg-modal-header">
                <h3>Participant Details</h3>
                <button onClick={() => setViewModal(null)}><AlertCircle size={20} style={{ cursor: 'pointer' }} /></button>
              </div>
              <div className="reg-modal-body">
                <div className="reg-modal-grid">
                  <div><strong>Name:</strong> {viewModal.fullName}</div>
                  <div><strong>Email:</strong> {viewModal.email}</div>
                  <div><strong>Phone:</strong> {viewModal.phone || 'N/A'}</div>
                  <div><strong>Training:</strong> {viewModal.trainingTitle}</div>
                  <div><strong>Participant ID:</strong> {viewModal.participantId || 'Pending'}</div>
                  <div><strong>Applied:</strong> {new Date(viewModal.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="reg-modal-footer">
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setViewModal(null)}>Close</button>
                {!viewModal.credentialsSentAt && (
                  <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => { setViewModal(null); handleSendCredentials(viewModal.id) }}>
                    <Send size={14} /> Send Credentials
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
