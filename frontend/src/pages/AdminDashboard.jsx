import { motion } from 'framer-motion'
import { AlertCircle, BookOpen, Check, CheckCircle2, ClipboardList, Clock, Eye, FileText, Layers, Loader2, MessageSquare, Plus, RefreshCw, Search, Star, Trash2, TrendingUp, User, UserCheck, UserPlus, Users, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { API, API_BASE } from '../api/api'
import AssessmentSessionsPanel from '../components/admin/AssessmentSessionsPanel'
import BulkImportParticipants from '../components/admin/BulkImportParticipants'
import CreateTrainerModule from '../components/admin/CreateTrainerModule'
import CreateTrainingModule from '../components/admin/CreateTrainingModule'
import AdminOverviewTab from '../components/admin/tabs/AdminOverviewTab'
import ParticipantProfileView from '../components/shared/ParticipantProfileView'
import { useToast } from '../components/Toast'
import TrainerProfileModal from '../components/admin/TrainerProfileModal'
import UserAvatar, { getTwoLetterInitials } from '../components/common/UserAvatar'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const initials = (name) => getTwoLetterInitials(name)

const Stars = ({ v }) => (
  <span style={{ display: 'inline-flex', gap: '1px' }}>
    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= v ? '#F59E0B' : '#D0D5DD', fontSize: 14 }}>&#9733;</span>)}
  </span>
)

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
}

function AdminDashboard({ user, onLogout, activeTab, onTabChange }) {
  const { success, error: showError, info, warning } = useToast()
  const normalizeTab = (tabKey) => tabKey === 'applications' ? 'pending' : tabKey || 'overview'
  const [tab, setTab] = useState(normalizeTab(activeTab))

  useEffect(() => {
    if (activeTab) setTab(normalizeTab(activeTab))
  }, [activeTab])

  const handleTabChange = (newTab) => {
    const normalizedTab = normalizeTab(newTab)
    setTab(normalizedTab)
    if (onTabChange) onTabChange(normalizedTab)
  }
  const [trainers, setTrainers] = useState([])
  const [trainings, setTrainings] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [participants, setParticipants] = useState([])
  const [pendingParticipants, setPendingParticipants] = useState([])
  const [questions, setQuestions] = useState([])
  const [notes, setNotes] = useState([])
  const [noteFilter, setNoteFilter] = useState('')
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(false)
  const [viewingParticipant, setViewingParticipant] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [adminReport, setAdminReport] = useState(null)

  const [trainerSearch, setTrainerSearch] = useState('')
  const [trainerDetailModal, setTrainerDetailModal] = useState(null)
  const [participantSearch, setParticipantSearch] = useState('')
  const [participantStatusFilter, setParticipantStatusFilter] = useState('ALL')
  const [participantDetailModal, setParticipantDetailModal] = useState(null)
  const [trainingSearch, setTrainingSearch] = useState('')
  const [trainingStatusFilter, setTrainingStatusFilter] = useState('ALL')
  const [trainingDetailModal, setTrainingDetailModal] = useState(null)

  const [trainingForm, setTrainingForm] = useState({ title: '', description: '', trainerId: '', trainerIds: [], startDate: '', endDate: '', capacity: '', sequentialLearning: false })
  const [questionForm, setQuestionForm] = useState({ trainingId: '', questionText: '', questionType: 'TEXT', options: '' })

  const [programs, setPrograms] = useState([])
  const [courses, setCourses] = useState([])
  const [programForm, setProgramForm] = useState({ title: '', description: '' })
  const [courseForm, setCourseForm] = useState({ title: '', description: '', trainerId: '', programId: '', status: 'ACTIVE' })

  const [initialLoading, setInitialLoading] = useState(true)
  const [confirmModal, setConfirmModal] = useState(null)

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` })

  const fetchAdminReport = async () => {
    try {
      const r = await fetch(`${API_BASE}/reports/admin`, { headers: auth() })
      const d = await r.json()
      if (r.ok && d.success) {
        setAdminReport(d.data)
      }
    } catch (e) {
      console.error('fetchAdminReport error:', e.message)
    }
  }

  useEffect(() => {
    const loadAll = async () => {
      setInitialLoading(true)
      try {
        await fetchAll()
      } finally {
        setInitialLoading(false)
      }
    }
    loadAll()
  }, [])

  useEffect(() => {
    if (tab === 'reports') {
      fetchAdminReport()
    }
  }, [tab])

  const fetchAll = async () => {
    await Promise.all([
      fetchStats(),
      fetchTrainers(),
      fetchTrainings(),
      fetchFeedbacks(),
      fetchParticipants(),
      fetchQuestions(),
      fetchPendingParticipants(),
      fetchNotes(),
      fetchPrograms(),
      fetchCourses(),
      fetchAdminReport()
    ])
  }

  const fetchStats = async () => {
    try {
      const r = await fetch(`${API_BASE}/admin/stats`, { headers: auth() })
      if (r.ok) setStats(await r.json())
    } catch {}
  }

  const fetchPendingParticipants = async () => {
    try {
      const r = await fetch(API.ADMIN.PENDING_PARTICIPANTS, { headers: auth() })
      const d = await r.json()
      setPendingParticipants(d.participants || [])
    } catch {}
  }

  const confirmAction = async () => {
    if (!confirmModal) return
    setLoading(true)
    try {
      if (confirmModal.action === 'delete-question') {
        const r = await fetch(`${API_BASE}/survey/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        if (!r.ok) throw new Error('Failed to delete question')
        success('Survey question deleted successfully')
        fetchQuestions()
      } else if (confirmModal.action === 'delete-training') {
        const r = await fetch(`${API_BASE}/admin/trainings/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Training deleted successfully', 'The training session has been removed.')
        fetchTrainings(); fetchStats()
      } else if (confirmModal.action === 'delete-participant') {
        const r = await fetch(`${API_BASE}/admin/participants/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Participant removed successfully')
        fetchParticipants(); fetchStats()
      } else if (confirmModal.action === 'delete-trainer') {
        const r = await fetch(`${API_BASE}/admin/trainers/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) {
          console.error('[AdminDashboard] Delete trainer failed:', r.status, d)
          if (r.status === 500) {
            throw new Error('Unexpected server error.')
          }
          throw new Error(d.message || d.error || 'Server error deleting trainer')
        }
        success('Trainer deleted successfully')
        fetchTrainers(); fetchStats()
      } else if (confirmModal.action === 'delete-program') {
        const r = await fetch(`${API_BASE}/admin/training-programs/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Training program deleted successfully')
        fetchPrograms()
      } else if (confirmModal.action === 'delete-course') {
        const r = await fetch(`${API_BASE}/admin/courses/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Course deleted successfully')
        fetchCourses()
      }
    } catch (e) { 
      showError(e.message) 
    } finally { 
      setLoading(false)
      setConfirmModal(null)
    }
  }

  const fetchTrainers = async () => {
    try {
      const r = await fetch(`${API_BASE}/admin/trainers`, { headers: auth() })
      const d = await r.json()
      const trainers = d.trainers || (d.data && d.data.trainers) || []
      setTrainers(trainers)
    } catch (e) { console.error('fetchTrainers error:', e.message) }
  }

  const fetchTrainings = async () => {
    try {
      const r = await fetch(`${API_BASE}/trainings`, { headers: auth() })
      const d = await r.json()
      setTrainings(Array.isArray(d) ? d : (d.trainings || []))
    } catch {}
  }

  const fetchFeedbacks = async () => {
    try {
      const r = await fetch(`${API_BASE}/feedback/admin-feedbacks`, { headers: auth() })
      const d = await r.json()
      setFeedbacks(d.feedbacks || [])
    } catch {}
  }

  const fetchParticipants = async () => {
    try {
      const r = await fetch(API.ADMIN.PARTICIPANTS, { headers: auth() })
      const d = await r.json()
      const participants = d.participants || (d.data && d.data.participants) || []
      setParticipants(participants)
    } catch (e) { console.error('fetchParticipants error:', e.message) }
  }

  const fetchQuestions = async () => {
    try {
      const r = await fetch(`${API_BASE}/survey`, { headers: auth() })
      const d = await r.json()
      setQuestions(d.questions || [])
    } catch {}
  }

  const fetchNotes = async (status = '') => {
    try {
      const url = status 
        ? `${API_BASE}/notes/admin/notes?status=${status}`
        : `${API_BASE}/notes/admin/notes`
      const r = await fetch(url, { headers: auth() })
      const d = await r.json()
      setNotes(d.notes || [])
    } catch {}
  }

  const fetchPrograms = async () => {
    try {
      const r = await fetch(`${API_BASE}/admin/training-programs`, { headers: auth() })
      const d = await r.json()
      setPrograms(d.programs || (d.data && d.data.programs) || [])
    } catch {}
  }

  const fetchCourses = async () => {
    try {
      const r = await fetch(`${API_BASE}/admin/courses`, { headers: auth() })
      const d = await r.json()
      setCourses(d.courses || (d.data && d.data.courses) || [])
    } catch {}
  }

  const handleApproveNote = async (noteId) => {
    setLoading(true)
    try {
      setNotes(prev => prev.filter(note => note.id !== noteId))
      const r = await fetch(`${API_BASE}/notes/${noteId}/status`, {
        method: 'PUT',
        headers: auth(),
        body: JSON.stringify({ status: 'APPROVED' })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to approve note')
      success('Note approved successfully!')
    } catch (e) {
      await fetchNotes(noteFilter)
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRejectNote = async (noteId) => {
    setLoading(true)
    try {
      setNotes(prev => prev.filter(note => note.id !== noteId))
      const r = await fetch(`${API_BASE}/notes/${noteId}/status`, {
        method: 'PUT',
        headers: auth(),
        body: JSON.stringify({ status: 'REJECTED' })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to reject note')
      success('Note rejected successfully!')
    } catch (e) {
      await fetchNotes(noteFilter)
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTraining = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const body = {
        title: trainingForm.title,
        description: trainingForm.description,
        trainerId: trainingForm.trainerId ? parseInt(trainingForm.trainerId) : undefined,
        trainerIds: (trainingForm.trainerIds || []).map(id => parseInt(id)),
        startDate: trainingForm.startDate,
        endDate: trainingForm.endDate,
        capacity: trainingForm.capacity ? parseInt(trainingForm.capacity) : null,
        sequentialLearning: !!trainingForm.sequentialLearning
      }
      const r = await fetch(`${API_BASE}/admin/trainings`, {
        method: 'POST', headers: auth(),
        body: JSON.stringify(body)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setTrainingForm({ title: '', description: '', trainerId: '', trainerIds: [], startDate: '', endDate: '', capacity: '', sequentialLearning: false })
      fetchTrainings(); fetchStats()
      success('Training created successfully')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleCreateQuestion = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const opts = questionForm.options.split(',').map(s => s.trim()).filter(Boolean)
      const body = { ...questionForm, options: questionForm.questionType === 'MULTIPLE_CHOICE' ? opts : null }
      const r = await fetch(`${API}/survey`, { method: 'POST', headers: auth(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setQuestionForm({ trainingId: '', questionText: '', questionType: 'TEXT', options: '' })
      fetchQuestions()
      success('Survey question created successfully')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }


  const handleCreateProgram = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/admin/training-programs`, {
        method: 'POST', headers: auth(),
        body: JSON.stringify(programForm)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setProgramForm({ title: '', description: '' })
      fetchPrograms()
      success('Training program created successfully')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleCreateCourse = async (e) => {
    e.preventDefault()
    if (!courseForm.programId) {
      showError('Please select a training program.')
      return
    }
    if (!courseForm.trainerId) {
      showError('Please select a trainer.')
      return
    }
    setLoading(true)
    try {
      const body = {
        title: courseForm.title,
        description: courseForm.description,
        trainerId: parseInt(courseForm.trainerId),
        programId: parseInt(courseForm.programId),
        status: courseForm.status
      }
      const r = await fetch(`${API_BASE}/admin/training-programs/${courseForm.programId}/courses`, {
        method: 'POST', headers: auth(),
        body: JSON.stringify(body)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setCourseForm({ title: '', description: '', trainerId: '', programId: '', status: 'ACTIVE' })
      fetchCourses(); fetchPrograms()
      success('Course created successfully')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleDeleteQuestion = async (id) => {
    setConfirmModal({ action: 'delete-question', id, title: 'Delete Question?' })
  }

  const handleDeleteTraining = async (id, title) => {
    setConfirmModal({ action: 'delete-training', id, title: `Delete training "${title}"?`, subtitle: 'This will remove all associated enrollments and feedback.' })
  }

  const handleDeleteParticipant = async (id, name) => {
    setConfirmModal({ action: 'delete-participant', id, title: `Delete participant "${name}"?`, subtitle: 'All their enrollments and feedback will also be removed.' })
  }

  const handleApproveParticipant = async (id) => {
    setLoading(true)
    try {
      const r = await fetch(API.ADMIN.APPROVE_PARTICIPANT(id), {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({})
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || d.message || 'Failed to approve participant')
      success('Participant approved successfully', 'The participant application has been approved.')
      fetchParticipants(); fetchPendingParticipants(); fetchStats()
    } catch (e) {
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRejectParticipant = async (id) => {
    setLoading(true)
    try {
      const r = await fetch(API.ADMIN.REJECT_PARTICIPANT(id), {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ reason: '' })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || d.message || 'Failed to reject participant')
      success('Participant rejected successfully')
      fetchParticipants(); fetchPendingParticipants(); fetchStats()
    } catch (e) {
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTrainer = (id, name) => {
    setConfirmModal({ action: 'delete-trainer', id, title: 'Delete Trainer?', subtitle: 'This action cannot be undone.', confirmText: 'Delete' })
  }

  const handleDeleteProgram = async (id, name) => {
    setConfirmModal({ action: 'delete-program', id, title: `Delete program "${name}"?` })
  }

  const handleDeleteCourse = async (id, name) => {
    setConfirmModal({ action: 'delete-course', id, title: `Delete course "${name}"?` })
  }

  const openEdit = (t) => {
    setEditModal(t)
    setEditForm({
      title: t.title,
      description: t.description || '',
      trainerId: t.trainerId || '',
      trainerIds: t.trainerIds || (t.trainerId ? [t.trainerId] : []),
      startDate: t.startDate ? t.startDate.slice(0, 16) : '',
      endDate: t.endDate ? t.endDate.slice(0, 16) : '',
      capacity: t.capacity || '',
      sequentialLearning: t.sequentialLearning || false
    })
  }

  const handleUpdateTraining = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/admin/trainings/${editModal.id}`, {
        method: 'PUT', headers: auth(),
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          trainerId: editForm.trainerId ? parseInt(editForm.trainerId) : undefined,
          trainerIds: (editForm.trainerIds || []).map(id => parseInt(id)),
          startDate: editForm.startDate,
          endDate: editForm.endDate,
          capacity: editForm.capacity ? parseInt(editForm.capacity) : null,
          sequentialLearning: !!editForm.sequentialLearning
        })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setEditModal(null); fetchTrainings()
      success('Training updated successfully.')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleSendReminders = async (trainingId) => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/admin/send-reminders/${trainingId}`, { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      info(d.message)
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'pending', label: 'Pending Approval' },
    { key: 'trainings', label: 'Trainings' },
    { key: 'trainers', label: 'Trainers' },
    { key: 'participants', label: 'Participants' },
    { key: 'bulkImport', label: 'Bulk Import' },
    { key: 'sessions', label: 'Assessment Sessions' },
    { key: 'notes', label: 'Notes Management' },
    { key: 'feedback', label: 'Feedback Reports' },
    { key: 'surveys', label: 'Survey Config' },
    { key: 'reports', label: 'Reports & Analytics' },
  ]

  if (!user || !user.token) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--neutral-50)'
      }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: 'var(--brand-admin)' }} size={24} />
        <span style={{ marginTop: '12px', fontSize: '13px', color: 'var(--neutral-400)' }}>Verifying session...</span>
      </div>
    )
  }

  return (
    <motion.div
      style={{ maxWidth: 1400, margin: '0 auto' }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <AdminOverviewTab
          user={user}
          stats={stats}
          feedbacks={feedbacks}
          trainings={trainings}
          participants={participants}
          trainers={trainers}
          pendingParticipants={pendingParticipants}
          adminReport={adminReport}
          initialLoading={initialLoading}
          loading={loading}
          onCreateTraining={() => handleTabChange('createTraining')}
          onAddTrainer={() => handleTabChange('createTrainer')}
          onAddParticipant={() => handleTabChange('participants')}
          onViewTrainings={() => handleTabChange('trainings')}
          onRefresh={fetchAll}
        />
      )}

      {/* ── PENDING APPROVAL ── */}
      {tab === 'pending' && (
        <motion.div variants={itemVariants} className="reg-admin">
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
              <User size={22} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Pending Approval</h2>
              <p className="reg-admin-subtitle">Review pending participant registrations and approve or reject participant accounts.</p>
            </div>
          </div>
          {initialLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading pending registrations...</p></div>
          ) : pendingParticipants.length === 0 ? (
            <div className="reg-admin-empty"><User size={40} /><h3>All Approved</h3><p>No participants are currently waiting for registration approval.</p></div>
          ) : (
            <div className="reg-admin-table-wrap">
              <table className="reg-admin-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {pendingParticipants.map(p => (
                    <tr key={p.id}>
                      <td><span className="reg-admin-name">{p.name}</span></td>
                      <td className="reg-admin-email">{p.email}</td>
                      <td className="reg-admin-date">{p.phone || '-'}</td>
                      <td className="reg-admin-date">{fmtDate(p.appliedAt || p.created_at || p.createdAt)}</td>
                      <td>
                        <div className="reg-admin-actions">
                          <button type="button" className="reg-admin-action" title="Approve" onClick={() => handleApproveParticipant(p.id)}>
                            <CheckCircle2 size={14} />
                          </button>
                          <button type="button" className="reg-admin-action reg-admin-action--reject" title="Reject" onClick={() => handleRejectParticipant(p.id)}>
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* ── TRAININGS (list) ── */}
      {tab === 'trainings' && (() => {
        const getTrainingStatus = (t) => {
          const now = new Date()
          const start = t.startDate ? new Date(t.startDate) : null
          const end = t.endDate ? new Date(t.endDate) : null
          if (start && now < start) return 'UPCOMING'
          if (end && now > end) return 'COMPLETED'
          return 'ACTIVE'
        }
        const filtered = trainings.filter(t => {
          const matchesSearch = !trainingSearch || t.title?.toLowerCase().includes(trainingSearch.toLowerCase()) || t.trainerName?.toLowerCase().includes(trainingSearch.toLowerCase())
          const status = getTrainingStatus(t)
          const matchesStatus = trainingStatusFilter === 'ALL' || status === trainingStatusFilter
          return matchesSearch && matchesStatus
        })
        return (
          <motion.div variants={itemVariants} className="reg-admin">
            {/* Header */}
            <div className="reg-admin-header">
              <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
                <BookOpen size={26} color="#fff" />
              </div>
              <div>
                <h2 className="reg-admin-title">Training Sessions</h2>
                <p className="reg-admin-subtitle">Manage scheduled training programs, enrollments, and status</p>
              </div>
              <div style={{ flex: 1 }} />
              <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => handleTabChange('createTraining')}>
                <Plus size={16} /> Add Training
              </button>
            </div>
            {/* Stats */}
            <div className="reg-admin-stats">
              {[
                { label: 'Total', value: trainings.length, icon: BookOpen, color: '#2563eb' },
                { label: 'Active', value: trainings.filter(t => getTrainingStatus(t) === 'ACTIVE').length, icon: CheckCircle2, color: '#16A34A' },
                { label: 'Upcoming', value: trainings.filter(t => getTrainingStatus(t) === 'UPCOMING').length, icon: Clock, color: '#F59E0B' },
                { label: 'Completed', value: trainings.filter(t => getTrainingStatus(t) === 'COMPLETED').length, icon: XCircle, color: '#64748b' },
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
                <input value={trainingSearch} onChange={e => setTrainingSearch(e.target.value)} placeholder="Search by title or trainer..." />
              </div>
              <div className="reg-admin-filter-tabs">
                {['ALL', 'ACTIVE', 'UPCOMING', 'COMPLETED'].map(f => {
                  const count = f === 'ALL' ? trainings.length : trainings.filter(t => getTrainingStatus(t) === f).length
                  return (
                    <button key={f} className={`reg-admin-filter-tab ${trainingStatusFilter === f ? 'reg-admin-filter-tab--active' : ''}`}
                      onClick={() => setTrainingStatusFilter(f)}>
                      {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                      {count > 0 && <span className="reg-admin-badge">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Trainings Table */}
            {initialLoading ? (
              <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading trainings...</p></div>
            ) : filtered.length === 0 ? (
              <div className="reg-admin-empty"><BookOpen size={40} /><h3>No Trainings Found</h3><p>{trainingSearch || trainingStatusFilter !== 'ALL' ? 'No trainings match your current filter.' : 'Create your first training session to get started.'}</p>
                {!trainingSearch && trainingStatusFilter === 'ALL' && (
                  <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => handleTabChange('createTraining')}>+ Create Training</button>
                )}
              </div>
            ) : (
              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Trainer</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Capacity</th>
                      <th>Enrolled</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => {
                      const status = getTrainingStatus(t)
                      const sc = { ACTIVE: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }, UPCOMING: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, COMPLETED: { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' } }[status]
                      return (
                        <tr key={t.id}>
                          <td>
                            <span className="reg-admin-name" style={{ fontWeight: 600 }}>{t.title}</span>
                          </td>
                          <td>
                            {t.trainerName ? (
                              <span className="reg-admin-status" style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}>{t.trainerName}</span>
                            ) : (
                              <span className="reg-admin-status" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>Unassigned</span>
                            )}
                          </td>
                          <td className="reg-admin-date">{fmtDate(t.startDate)}</td>
                          <td className="reg-admin-date">{fmtDate(t.endDate)}</td>
                          <td style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                            {t.capacity || <span style={{ color: '#94a3b8', fontWeight: 400 }}>Unlimited</span>}
                          </td>
                          <td style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{t.enrolledCount ?? 0}</td>
                          <td>
                            <span className="reg-admin-status" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>{status}</span>
                          </td>
                          <td>
                            <div className="reg-admin-actions">
                              <button className="reg-admin-action" title="View Details" onClick={() => setTrainingDetailModal(t)}><Eye size={14} /></button>
                              <button className="reg-admin-action" title="Edit Training" onClick={() => openEdit(t)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                              <button className="reg-admin-action reg-admin-action--reject" title="Delete Training" onClick={() => handleDeleteTraining(t.id, t.title)}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Training Detail Modal */}
            {trainingDetailModal && (() => {
              const status = getTrainingStatus(trainingDetailModal)
              const sc = { ACTIVE: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }, UPCOMING: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, COMPLETED: { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' } }[status]
              return (
                <div className="reg-modal-overlay" onClick={() => setTrainingDetailModal(null)}>
                  <div className="reg-modal" onClick={e => e.stopPropagation()}>
                    <div className="reg-modal-header">
                      <h3>Training Details</h3>
                      <button onClick={() => setTrainingDetailModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#64748b" /></button>
                    </div>
                    <div className="reg-modal-body">
                      <div className="reg-modal-grid">
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Title</span>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{trainingDetailModal.title}</div></div>
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Status</span>
                          <div><span className="reg-admin-status" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>{status}</span></div></div>
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Trainer</span>
                          <div style={{ fontSize: 14 }}>{trainingDetailModal.trainerName || 'Unassigned'}</div></div>
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Start Date</span>
                          <div style={{ fontSize: 14 }}>{fmtDate(trainingDetailModal.startDate)}</div></div>
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>End Date</span>
                          <div style={{ fontSize: 14 }}>{fmtDate(trainingDetailModal.endDate)}</div></div>
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Capacity</span>
                          <div style={{ fontSize: 14 }}>{trainingDetailModal.capacity || 'Unlimited'}</div></div>
                        <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Enrolled</span>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{trainingDetailModal.enrolledCount ?? 0}</div></div>
                        {trainingDetailModal.description && (
                          <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Description</span>
                            <div style={{ fontSize: 14, marginTop: 4, color: '#334155', lineHeight: 1.6 }}>{trainingDetailModal.description}</div></div>
                        )}
                        {trainingDetailModal.sequentialLearning && (
                          <div><span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Sequential Learning</span>
                            <div style={{ fontSize: 14, color: '#16A34A', fontWeight: 600 }}>Enabled</div></div>
                        )}
                      </div>
                    </div>
                    <div className="reg-modal-footer">
                      <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setTrainingDetailModal(null)}>Close</button>
                      <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => { setTrainingDetailModal(null); openEdit(trainingDetailModal) }}>Edit Training</button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </motion.div>
        )
      })()}

      {/* ── TRAINERS (list) ── */}
      {tab === 'trainers' && (
        <motion.div variants={itemVariants} className="reg-admin">
          {/* Header */}
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
              <Users size={26} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Trainers</h2>
              <p className="reg-admin-subtitle">Manage training instructors and assign courses</p>
            </div>
            <div style={{ flex: 1 }} />
            <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => handleTabChange('createTrainer')}>
              <Plus size={16} /> Add Trainer
            </button>
          </div>
          {/* Stats */}
          <div className="reg-admin-stats">
            {[
              { label: 'Total Trainers', value: trainers.length, icon: Users, color: '#8b5cf6' },
              { label: 'Profile Set', value: trainers.filter(t => t.profile && (t.profile.phone || t.profile.dob || t.profile.qualification || t.profile.experience)).length, icon: CheckCircle2, color: '#16A34A' },
              { label: 'No Profile', value: trainers.filter(t => !t.profile || (!t.profile.phone && !t.profile.dob && !t.profile.qualification && !t.profile.experience)).length, icon: AlertCircle, color: '#F59E0B' },
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
              <input value={trainerSearch} onChange={e => setTrainerSearch(e.target.value)} placeholder="Search trainers..." />
            </div>
          </div>
          {/* Trainers Table */}
          {initialLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading trainers...</p></div>
          ) : trainers.filter(t => {
            if (!trainerSearch) return true
            const q = trainerSearch.toLowerCase()
            return (
              t.name?.toLowerCase().includes(q) ||
              t.email?.toLowerCase().includes(q) ||
              (t.employeeId || t.employee_id || '').toLowerCase().includes(q)
            )
          }).length === 0 ? (
            <div className="reg-admin-empty"><User size={40} /><h3>No Trainers Found</h3><p>{trainerSearch ? 'No trainers match your search.' : 'Add your first trainer to get started.'}</p></div>
          ) : (
            <div className="reg-admin-table-wrap">
              <table className="reg-admin-table">
                <thead>
                  <tr>
                    <th>Trainer</th>
                    <th>Employee ID</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Experience</th>
                    <th>Profile</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trainers.filter(t => {
                    if (!trainerSearch) return true
                    const q = trainerSearch.toLowerCase()
                    return (
                      t.name?.toLowerCase().includes(q) ||
                      t.email?.toLowerCase().includes(q) ||
                      (t.employeeId || t.employee_id || '').toLowerCase().includes(q)
                    )
                  }).map(trainer => {
                    const empId = trainer.employeeId || trainer.employee_id || trainer.profile?.employeeId || trainer.profile?.employee_id || ''
                    const exp = trainer.experience || trainer.profile?.experience || ''
                    const phone = trainer.profile?.phone || trainer.phone || ''
                    const hasProfile = trainer.profile && (phone || trainer.profile.dob || trainer.profile.qualification || exp)

                    return (
                      <tr key={trainer.id}>
                        <td>
                          <div className="reg-admin-participant">
                            <UserAvatar name={trainer.name} size={32} fontSize={11} />
                            <span className="reg-admin-name">{trainer.name}</span>
                          </div>
                        </td>
                        <td className="reg-admin-date" style={{ fontWeight: 600, color: '#334155' }}>{empId || '—'}</td>
                        <td className="reg-admin-email">{trainer.email}</td>
                        <td className="reg-admin-date">{phone || '—'}</td>
                        <td className="reg-admin-date">{exp || '—'}</td>
                        <td>
                          <span className={`reg-admin-status`} style={{
                            background: hasProfile ? '#d1fae5' : '#f1f5f9',
                            color: hasProfile ? '#065f46' : '#64748b',
                            borderColor: hasProfile ? '#6ee7b7' : '#e2e8f0',
                          }}>{hasProfile ? 'Profile Set' : 'No Profile'}</span>
                        </td>
                        <td>
                          <div className="reg-admin-actions">
                            <button className="reg-admin-action" title="View Details" onClick={() => setTrainerDetailModal(trainer)}><Eye size={14} /></button>
                            <button className="reg-admin-action reg-admin-action--reject" title="Delete Trainer" onClick={() => handleDeleteTrainer(trainer.id, trainer.name)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* ── PARTICIPANTS ── */}
      {tab === 'participants' && (
        <motion.div variants={itemVariants} className="reg-admin">
          {/* Header */}
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
              <Users size={26} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Participants</h2>
              <p className="reg-admin-subtitle">View and manage participant accounts, status, and enrollments</p>
            </div>
            <div style={{ flex: 1 }} />
            <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => handleTabChange('bulk-import')}>
              <Plus size={16} /> Add Participant
            </button>
          </div>
          {/* Stats */}
          <div className="reg-admin-stats">
            {[
              { label: 'Total', value: participants.length, icon: Users, color: '#6366f1' },
              { label: 'Approved', value: participants.filter(p => (p.status || '').toUpperCase() === 'APPROVED').length, icon: CheckCircle2, color: '#16A34A' },
              { label: 'Pending', value: participants.filter(p => (p.status || '').toUpperCase() === 'PENDING').length, icon: Clock, color: '#F59E0B' },
              { label: 'Rejected', value: participants.filter(p => (p.status || '').toUpperCase() === 'REJECTED').length, icon: XCircle, color: '#dc2626' },
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
              <input value={participantSearch} onChange={e => { setParticipantSearch(e.target.value); }} placeholder="Search participants..." />
            </div>
            <div className="reg-admin-filter-tabs">
              {['ALL', 'APPROVED', 'PENDING', 'REJECTED'].map(f => {
                const count = f === 'ALL' ? participants.length : participants.filter(p => (p.status || '').toUpperCase() === f).length
                return (
                  <button key={f} className={`reg-admin-filter-tab ${participantStatusFilter === f ? 'reg-admin-filter-tab--active' : ''}`}
                    onClick={() => setParticipantStatusFilter(f)}>
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                    {count > 0 && <span className="reg-admin-badge">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Participants Table */}
          {initialLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading participants...</p></div>
          ) : participants.filter(p => {
            const matchesSearch = !participantSearch || p.name?.toLowerCase().includes(participantSearch.toLowerCase()) || p.email?.toLowerCase().includes(participantSearch.toLowerCase()) || p.phone?.includes(participantSearch)
            const matchesStatus = participantStatusFilter === 'ALL' || (p.status || '').toUpperCase() === participantStatusFilter
            return matchesSearch && matchesStatus
          }).length === 0 ? (
            <div className="reg-admin-empty"><Users size={40} /><h3>No Participants Found</h3><p>{participantSearch || participantStatusFilter !== 'ALL' ? 'No participants match your current filter.' : 'Invite your first learner to get started.'}</p></div>
          ) : (
            <div className="reg-admin-table-wrap">
              <table className="reg-admin-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Status</th>
                    <th>Enrolled</th>
                    <th>Progress</th>
                    <th>Quiz</th>
                    <th style={{ minWidth: 190, textAlign: 'left' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.filter(p => {
                    const matchesSearch = !participantSearch || p.name?.toLowerCase().includes(participantSearch.toLowerCase()) || p.email?.toLowerCase().includes(participantSearch.toLowerCase()) || p.phone?.includes(participantSearch)
                    const matchesStatus = participantStatusFilter === 'ALL' || (p.status || '').toUpperCase() === participantStatusFilter
                    return matchesSearch && matchesStatus
                  }).map(p => {
                    const sc = { PENDING: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, APPROVED: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }, REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' } }[(p.status || 'PENDING').toUpperCase()] || { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' }
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="reg-admin-participant">
                            <UserAvatar name={p.name} size={32} fontSize={11} />
                            <div>
                              <span className="reg-admin-name">{p.name || '-'}</span>
                              <span className="reg-admin-email">{p.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="reg-admin-status" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                            {(p.status || 'PENDING').toUpperCase()}
                          </span>
                        </td>
                        <td className="reg-admin-date">{fmtDate(p.created_at || p.joinedAt)}</td>
                        <td style={{ minWidth: 90 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, p.progress || 0)}%`, height: '100%', background: '#16A34A', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, minWidth: 28 }}>{p.progress || 0}%</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{p.quizScore || p.quiz_score || 0}%</td>
                        <td style={{ minWidth: 190 }}>
                          <div className="reg-admin-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                            {/* 1. View Participant */}
                            <button
                              type="button"
                              className="reg-admin-action reg-admin-action--view"
                              title="View participant"
                              aria-label="View participant"
                              onClick={() => setViewingParticipant(p)}
                            >
                              <Eye size={16} />
                            </button>

                            {/* 2. Review Application */}
                            <button
                              type="button"
                              className="reg-admin-action reg-admin-action--review"
                              title="Review application"
                              aria-label="Review application"
                              onClick={() => handleTabChange('pending')}
                            >
                              <FileText size={16} />
                            </button>

                            {/* 3. Direct Approve Action (Only for PENDING status) */}
                            {String(p.status || 'PENDING').toUpperCase() === 'PENDING' && (
                              <button
                                type="button"
                                className="reg-admin-action reg-admin-action--approve-direct"
                                title="Approve participant"
                                aria-label="Approve participant"
                                onClick={() => handleApproveParticipant(p.id)}
                              >
                                <Check size={18} strokeWidth={2.6} />
                              </button>
                            )}

                            {/* 4. Delete Participant */}
                            <button
                              type="button"
                              className="reg-admin-action reg-admin-action--reject"
                              title="Delete participant"
                              aria-label="Delete participant"
                              onClick={() => handleDeleteParticipant(p.id, p.name)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* ── BULK IMPORT ── */}
      {tab === 'bulkImport' && (
        <motion.div variants={itemVariants}>
          <BulkImportParticipants user={user} />
        </motion.div>
      )}

      {/* ── ASSESSMENT SESSIONS ── */}
      {tab === 'sessions' && (
        <motion.div variants={itemVariants}>
          <AssessmentSessionsPanel />
        </motion.div>
      )}

      {/* ── SURVEYS ── */}
      {tab === 'surveys' && (
        <motion.div variants={itemVariants} className="reg-admin">
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>
              <MessageSquare size={22} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Survey Questions</h2>
              <p className="reg-admin-subtitle">Configure feedback survey questions for training sessions.</p>
            </div>
          </div>
          <div className="reg-form-grid" style={{ alignItems: 'start' }}>
            <div className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <div>
                  <div className="reg-card-title">Add Question</div>
                  <div className="reg-card-subtitle">Create a new feedback question</div>
                </div>
              </div>
              <div className="reg-card-body">
                <form onSubmit={handleCreateQuestion}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                      <label className="reg-field-label">Training (Optional)</label>
                      <select
                        className="reg-select"
                        value={questionForm.trainingId}
                        onChange={(e) => setQuestionForm(p => ({ ...p, trainingId: e.target.value }))}
                      >
                        <option value="">Apply to ALL Trainings</option>
                        {trainings.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="reg-field-label">Question Type</label>
                      <select
                        className="reg-select"
                        value={questionForm.questionType}
                        onChange={(e) => setQuestionForm(p => ({ ...p, questionType: e.target.value }))}
                      >
                        <option value="TEXT">Text Answer</option>
                        <option value="RATING">Rating (1-5)</option>
                        <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                      </select>
                    </div>
                    <div>
                      <label className="reg-field-label">Question Text<span className="reg-req"> *</span></label>
                      <input
                        className="reg-input"
                        type="text"
                        value={questionForm.questionText}
                        required
                        onChange={e => setQuestionForm(p => ({ ...p, questionText: e.target.value }))}
                        placeholder="Enter survey question"
                      />
                    </div>
                    {questionForm.questionType === 'MULTIPLE_CHOICE' && (
                      <div>
                        <label className="reg-field-label">Options (comma separated)<span className="reg-req"> *</span></label>
                        <input
                          className="reg-input"
                          type="text"
                          value={questionForm.options}
                          placeholder="Option A, Option B, Option C"
                          required
                          onChange={e => setQuestionForm(p => ({ ...p, options: e.target.value }))}
                        />
                      </div>
                    )}
                    <div className="reg-form-actions">
                      <div style={{ flex: 1 }} />
                      <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={loading}>Add Question</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
            <div className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <div>
                  <div className="reg-card-title">Questions ({questions.length})</div>
                  <div className="reg-card-subtitle">Existing survey questions</div>
                </div>
              </div>
              {questions.length === 0 ? (
                <div className="reg-admin-empty"><MessageSquare size={32} /><p>No custom questions added.</p></div>
              ) : (
                <table className="reg-admin-table">
                  <thead>
                    <tr><th>Target</th><th>Question</th><th>Type</th><th>Options</th><th></th></tr>
                  </thead>
                  <tbody>
                    {questions.map(q => {
                      const trg = q.trainingId ? trainings.find(t => t.id === q.trainingId)?.title || 'Specific' : 'Global'
                      return (
                        <tr key={q.id}>
                          <td>
                            <span className="reg-admin-status" style={{
                              background: q.trainingId ? '#dbeafe' : '#f1f5f9',
                              color: q.trainingId ? '#1e40af' : '#64748b',
                              borderColor: q.trainingId ? '#93c5fd' : '#e2e8f0',
                            }}>{trg}</span>
                          </td>
                          <td style={{ color: '#334155' }}>{q.questionText}</td>
                          <td className="reg-admin-date">{q.questionType}</td>
                          <td className="reg-admin-date">{q.options ? q.options.join(', ') : '-'}</td>
                          <td>
                            <div className="reg-admin-actions">
                              <button type="button" className="reg-admin-action reg-admin-action--reject" title="Delete Question" onClick={() => handleDeleteQuestion(q.id)}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── NOTES MANAGEMENT ── */}
      {tab === 'notes' && (
        <motion.div variants={itemVariants} className="reg-admin">
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <ClipboardList size={22} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Notes Management</h2>
              <p className="reg-admin-subtitle">Review and manage study resources uploaded by trainers.</p>
            </div>
            <div style={{ flex: 1 }} />
            <div className="reg-admin-filter-tabs">
              {[
                { key: '', label: 'All', count: notes.length },
                { key: 'pending', label: 'Pending', count: notes.filter(n => n.status?.toLowerCase() === 'pending').length },
                { key: 'approved', label: 'Approved', count: notes.filter(n => n.status?.toLowerCase() === 'approved').length }
              ].map(btn => (
                <button
                  key={btn.key}
                  className={`reg-admin-filter-tab ${noteFilter === btn.key ? 'reg-admin-filter-tab--active' : ''}`}
                  onClick={() => { setNoteFilter(btn.key); fetchNotes(btn.key) }}
                >
                  {btn.label} {btn.count > 0 && <span className="reg-admin-badge">{btn.count}</span>}
                </button>
              ))}
            </div>
          </div>
          {notes.length === 0 ? (
            <div className="reg-admin-empty">
              <ClipboardList size={40} />
              <h3>No Notes Found</h3>
              <p>
                {noteFilter === 'pending' ? 'All pending notes have been reviewed.' : 
                noteFilter === 'approved' ? 'No approved notes yet.' : 
                'Notes will appear here when trainers upload them.'}
              </p>
            </div>
          ) : (
            <div className="reg-admin-table-wrap">
              {notes.map((note, idx) => {
                const isPending = note.status?.toUpperCase() === 'PENDING'
                const isApproved = note.status?.toUpperCase() === 'APPROVED'
                return (
                  <div key={note.id || idx} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="reg-admin-status" style={{
                          background: isApproved ? '#d1fae5' : isPending ? '#fef3c7' : '#fee2e2',
                          color: isApproved ? '#065f46' : isPending ? '#92400e' : '#b91c1c',
                          borderColor: isApproved ? '#6ee7b7' : isPending ? '#fcd34d' : '#fecaca',
                        }}>{note.status}</span>
                        <span className="reg-admin-date">{fmtDate(note.created_at)}</span>
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{note.title}</h4>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Uploaded by: {note.trainer?.name || 'Unknown'}</p>
                      <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>{note.content}</p>
                    </div>
                    {isPending && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button type="button" className="reg-admin-btn reg-admin-btn--danger" onClick={() => handleRejectNote(note.id)} disabled={loading}>Reject</button>
                        <button type="button" className="reg-admin-btn reg-admin-btn--primary" onClick={() => handleApproveNote(note.id)} disabled={loading}>Approve</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── FEEDBACK REPORTS ── */}
      {tab === 'feedback' && (
        <motion.div variants={itemVariants} className="reg-admin">
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
              <MessageSquare size={22} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Feedback Reports</h2>
              <p className="reg-admin-subtitle">View all participant feedback across training sessions.</p>
            </div>
          </div>
          <div className="reg-admin-stats">
            <div className="reg-admin-stat"><MessageSquare size={20} style={{ color: '#16A34A' }} /><div><span className="reg-admin-stat-num">{feedbacks.length}</span><span className="reg-admin-stat-label">Total Responses</span></div></div>
            <div className="reg-admin-stat"><Star size={20} style={{ color: '#F59E0B' }} /><div><span className="reg-admin-stat-num">{stats.avgTrainerRating ?? '0.0'}</span><span className="reg-admin-stat-label">Avg Trainer Rating</span></div></div>
            <div className="reg-admin-stat"><TrendingUp size={20} style={{ color: '#2563eb' }} /><div><span className="reg-admin-stat-num">{stats.avgSubjectRating ?? '0.0'}</span><span className="reg-admin-stat-label">Avg Subject Rating</span></div></div>
          </div>
          <div className="reg-admin-table-wrap">
            {initialLoading ? (
              <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading feedback...</p></div>
            ) : feedbacks.length === 0 ? (
              <div className="reg-admin-empty"><MessageSquare size={40} /><h3>No Feedback Yet</h3><p>No feedback submitted yet.</p></div>
            ) : (
              <table className="reg-admin-table">
                <thead>
                  <tr><th>#</th><th>Training</th><th>Trainer</th><th>Participant</th><th>Trainer Rating</th><th>Subject Rating</th><th>Comments</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {feedbacks.map((f, i) => (
                    <tr key={f.id}>
                      <td className="reg-admin-date">{i + 1}</td>
                      <td><span className="reg-admin-name">{f.trainingTitle}</span></td>
                      <td className="reg-admin-date">{f.trainerName}</td>
                      <td>{f.anonymous ? <span className="reg-admin-status" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>Anonymous</span> : f.participantName}</td>
                      <td><Stars v={f.trainerRating} /> <span className="reg-admin-date" style={{ marginLeft: 4 }}>{f.trainerRating}/5</span></td>
                      <td><Stars v={f.subjectRating} /> <span className="reg-admin-date" style={{ marginLeft: 4 }}>{f.subjectRating}/5</span></td>
                      <td className="reg-admin-date" style={{ maxWidth: 150 }}>{f.comments || '-'}</td>
                      <td className="reg-admin-date" style={{ whiteSpace: 'nowrap' }}>{fmtDate(f.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      )}
      {/* ── CREATE TRAINER ── */}
      {tab === 'createTrainer' && (
        <motion.div variants={itemVariants}>
          <CreateTrainerModule
            trainers={trainers}
            initialLoading={initialLoading}
            token={user.token}
            onCreated={() => { fetchTrainers(); fetchStats() }}
            onDelete={handleDeleteTrainer}
            onView={(t) => setTrainerDetailModal(t)}
            onBack={() => handleTabChange('trainers')}
          />
        </motion.div>
      )}


      {/* ── CREATE TRAINING ── */}
      {tab === 'createTraining' && (
        <motion.div variants={itemVariants}>
          <CreateTrainingModule
            trainers={trainers}
            trainings={trainings}
            form={trainingForm}
            onFormChange={setTrainingForm}
            onSubmit={handleCreateTraining}
            onEdit={openEdit}
            onDelete={handleDeleteTraining}
            loading={loading}
            initialLoading={initialLoading}
            onBack={() => handleTabChange('trainings')}
          />
        </motion.div>
      )}

      {/* ── PROGRAMS & COURSES ── */}
      {tab === 'programs' && (
        <motion.div variants={itemVariants} className="reg-admin">
          {/* Header */}
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>
              <ClipboardList size={22} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Programs & Courses</h2>
              <p className="reg-admin-subtitle">Organize training into programs and individual courses</p>
            </div>
          </div>
          {/* Stats */}
          <div className="reg-admin-stats">
            {[
              { label: 'Programs', value: programs.length, icon: ClipboardList, color: '#0d9488' },
              { label: 'Courses', value: courses.length, icon: Users, color: '#2563eb' },
              { label: 'Active Trainers', value: trainers.length, icon: User, color: '#8b5cf6' },
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
          {/* Programs Table */}
          <div className="reg-admin-table-wrap" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Programs ({programs.length})</span>
              <button className="reg-admin-btn reg-admin-btn--primary" style={{ fontSize: 12 }} onClick={() => document.getElementById('create-program-form')?.scrollIntoView({ behavior: 'smooth' })}>+ New Program</button>
            </div>
            {programs.length === 0 ? (
              <div className="reg-admin-empty" style={{ padding: 32 }}><ClipboardList size={32} /><p>No programs created yet.</p></div>
            ) : (
              <table className="reg-admin-table">
                <thead>
                  <tr><th>Title</th><th>Description</th><th>Courses</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {programs.map(p => (
                    <tr key={p.id}>
                      <td><span className="reg-admin-name">{p.title}</span></td>
                      <td className="reg-admin-date" style={{ maxWidth: 260 }}>{(p.description || '—').slice(0, 80)}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{p.courseCount ?? 0}</td>
                      <td>
                        <div className="reg-admin-actions">
                          <button className="reg-admin-action reg-admin-action--reject" title="Delete Program" onClick={() => handleDeleteProgram(p.id, p.title)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Courses Table */}
          <div className="reg-admin-table-wrap" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Courses ({courses.length})</span>
              <button className="reg-admin-btn reg-admin-btn--primary" style={{ fontSize: 12 }} onClick={() => document.getElementById('create-course-form')?.scrollIntoView({ behavior: 'smooth' })}>+ New Course</button>
            </div>
            {courses.length === 0 ? (
              <div className="reg-admin-empty" style={{ padding: 32 }}><Users size={32} /><p>No courses created yet.</p></div>
            ) : (
              <table className="reg-admin-table">
                <thead>
                  <tr><th>Title</th><th>Program</th><th>Trainer</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {courses.map(c => (
                    <tr key={c.id}>
                      <td><span className="reg-admin-name">{c.title}</span></td>
                      <td className="reg-admin-date">{c.programTitle || '—'}</td>
                      <td className="reg-admin-date">{c.trainerName || 'Unassigned'}</td>
                      <td>
                        <span className="reg-admin-status" style={{
                          background: c.status === 'ACTIVE' ? '#d1fae5' : '#f1f5f9',
                          color: c.status === 'ACTIVE' ? '#065f46' : '#64748b',
                          borderColor: c.status === 'ACTIVE' ? '#6ee7b7' : '#e2e8f0',
                        }}>{c.status || 'ACTIVE'}</span>
                      </td>
                      <td>
                        <div className="reg-admin-actions">
                          <button className="reg-admin-action reg-admin-action--reject" title="Delete Course" onClick={() => handleDeleteCourse(c.id, c.title)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Create Forms */}
          <div className="reg-form-grid" style={{ alignItems: 'start' }}>
            <div id="create-program-form" className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <div>
                  <div className="reg-card-title">Create Program</div>
                  <div className="reg-card-subtitle">Add a new training program</div>
                </div>
              </div>
              <div className="reg-card-body">
                <form onSubmit={handleCreateProgram}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                      <label className="reg-field-label">Program Title<span className="reg-req"> *</span></label>
                      <input className="reg-input" type="text" value={programForm.title}
                        onChange={e => setProgramForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. Full Stack Development" />
                    </div>
                    <div>
                      <label className="reg-field-label">Description</label>
                      <textarea className="reg-textarea" value={programForm.description}
                        onChange={e => setProgramForm(p => ({ ...p, description: e.target.value }))} placeholder="Program overview..." />
                    </div>
                    <div className="reg-form-actions">
                      <div style={{ flex: 1 }} />
                      <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={loading}>Create Program</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
            <div id="create-course-form" className="reg-admin-table-wrap">
              <div className="reg-card-header">
                <div>
                  <div className="reg-card-title">Create Course</div>
                  <div className="reg-card-subtitle">Add a new course to a program</div>
                </div>
              </div>
              <div className="reg-card-body">
                <form onSubmit={handleCreateCourse}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                      <label className="reg-field-label">Course Title<span className="reg-req"> *</span></label>
                      <input className="reg-input" type="text" value={courseForm.title}
                        onChange={e => setCourseForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. React for Beginners" />
                    </div>
                    <div>
                      <label className="reg-field-label">Description</label>
                      <textarea className="reg-textarea" value={courseForm.description}
                        onChange={e => setCourseForm(p => ({ ...p, description: e.target.value }))} placeholder="Course description..." />
                    </div>
                    <div>
                      <label className="reg-field-label">Program</label>
                      <select
                        className="reg-select"
                        value={courseForm.programId}
                        onChange={(e) => setCourseForm(p => ({ ...p, programId: e.target.value }))}
                      >
                        <option value="">Select a program</option>
                        {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="reg-field-label">Assign Trainer</label>
                      <select
                        className="reg-select"
                        value={courseForm.trainerId}
                        onChange={(e) => setCourseForm(p => ({ ...p, trainerId: e.target.value }))}
                      >
                        <option value="">Select a trainer</option>
                        {trainers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                      </select>
                    </div>
                    <div className="reg-form-actions">
                      <div style={{ flex: 1 }} />
                      <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={loading}>Create Course</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── REPORTS & ANALYTICS ── */}
      {tab === 'reports' && (
        <motion.div variants={itemVariants} className="reg-admin">
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
              <TrendingUp size={22} color="#fff" />
            </div>
            <div>
              <h2 className="reg-admin-title">Reports & Analytics</h2>
              <p className="reg-admin-subtitle">Platform-wide metrics, performance insights, and engagement data.</p>
            </div>
            <div style={{ flex: 1 }} />
            <button className="reg-admin-btn reg-admin-btn--secondary" onClick={fetchAdminReport}>
              <RefreshCw size={14} /> Refresh Report
            </button>
          </div>

          {!adminReport ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading reports data...</p></div>
          ) : (
            <div>
              <div className="reg-admin-stats">
                <div className="reg-admin-stat">
                  <Users size={20} style={{ color: '#2563eb' }} />
                  <div style={{ flex: 1 }}>
                    <span className="reg-admin-stat-num">{adminReport.totalUsers}</span>
                    <span className="reg-admin-stat-label">Total Users</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Admins: {adminReport.usersByRole?.admin || 0} | Trainers: {adminReport.usersByRole?.trainer || 0} | Participants: {adminReport.usersByRole?.participant || 0}
                    </span>
                  </div>
                </div>
                <div className="reg-admin-stat">
                  <BookOpen size={20} style={{ color: '#0d9488' }} />
                  <div style={{ flex: 1 }}>
                    <span className="reg-admin-stat-num">{adminReport.totalTrainings}</span>
                    <span className="reg-admin-stat-label">Trainings & Lessons</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Total Lessons: {adminReport.totalLessons || 0}</span>
                  </div>
                </div>
                <div className="reg-admin-stat">
                  <TrendingUp size={20} style={{ color: '#16A34A' }} />
                  <div style={{ flex: 1 }}>
                    <span className="reg-admin-stat-num">{adminReport.completionRate}%</span>
                    <span className="reg-admin-stat-label">Completion Rate</span>
                    <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ width: `${adminReport.completionRate}%`, height: '100%', background: '#16A34A', borderRadius: 3 }}></div>
                    </div>
                  </div>
                </div>
                <div className="reg-admin-stat">
                  <Clock size={20} style={{ color: '#8b5cf6' }} />
                  <div style={{ flex: 1 }}>
                    <span className="reg-admin-stat-num">{adminReport.activeUsers}</span>
                    <span className="reg-admin-stat-label">Active Users (30 Days)</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Enrollment Rate: {adminReport.enrollmentRate}%</span>
                  </div>
                </div>
              </div>

              <div className="reg-admin-table-wrap">
                <div className="reg-card-header">
                  <div>
                    <div className="reg-card-title">Trainer Performance & Feedback</div>
                    <div className="reg-card-subtitle">Average ratings and feedback counts per trainer</div>
                  </div>
                </div>
                {(!adminReport.trainerPerformance || adminReport.trainerPerformance.length === 0) ? (
                  <div className="reg-admin-empty"><TrendingUp size={32} /><p>No feedback data available for trainers yet.</p></div>
                ) : (
                  <table className="reg-admin-table">
                    <thead>
                      <tr>
                        <th>Trainer Name</th>
                        <th style={{ textAlign: 'center' }}>Avg Trainer Rating</th>
                        <th style={{ textAlign: 'center' }}>Avg Subject Rating</th>
                        <th style={{ textAlign: 'center' }}>Feedback Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminReport.trainerPerformance.map(tp => (
                        <tr key={tp.trainerId}>
                          <td><span className="reg-admin-name">{tp.trainerName}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="reg-admin-status" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', fontWeight: 600 }}>
                              {tp.avgTrainerRating} / 5.0
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="reg-admin-status" style={{ background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd', fontWeight: 600 }}>
                              {tp.avgSubjectRating} / 5.0
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                            {tp.feedbackCount} response(s)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── EDIT MODAL ── */}
      {editModal && (
        <div className="reg-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="reg-modal" onClick={e => e.stopPropagation()}>
            <div className="reg-modal-header">
              <h3>Edit Training Session</h3>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#64748b" /></button>
            </div>
            <div className="reg-modal-body">
              <form onSubmit={handleUpdateTraining}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="reg-field-label">Title<span className="reg-req"> *</span></label>
                    <input className="reg-input" type="text" value={editForm.title}
                      onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="reg-field-label">Description</label>
                    <textarea className="reg-textarea" value={editForm.description}
                      onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div>
                    <label className="reg-field-label">Assign Trainer(s)</label>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 8,
                      maxHeight: 160,
                      overflowY: 'auto',
                      border: '1.5px solid #e2e8f0',
                      padding: 12,
                      borderRadius: 10,
                      background: '#f8fafc',
                      marginTop: 4,
                    }}>
                      {trainers.map(t => {
                        const isChecked = editForm.trainerIds?.includes(t.id);
                        return (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#475569', padding: 6, borderRadius: 8, background: isChecked ? '#f0fdf4' : 'transparent', transition: 'background 150ms' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const updated = e.target.checked
                                  ? [...(editForm.trainerIds || []), t.id]
                                  : (editForm.trainerIds || []).filter(id => id !== t.id);
                                setEditForm(p => ({
                                  ...p,
                                  trainerIds: updated,
                                  trainerId: updated[0] || ''
                                }));
                              }}
                              style={{ cursor: 'pointer', accentColor: '#16A34A' }}
                            />
                            <div>
                              <span style={{ fontWeight: 600 }}>{t.name}</span>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.email}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      id="editSequentialLearning"
                      checked={editForm.sequentialLearning || false}
                      onChange={e => setEditForm(p => ({ ...p, sequentialLearning: e.target.checked }))}
                      style={{ width: 'auto', height: 'auto', cursor: 'pointer', margin: 0, accentColor: '#16A34A' }}
                    />
                    <label htmlFor="editSequentialLearning" style={{ fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer', margin: 0 }}>
                      Enable Sequential Learning Lock
                    </label>
                  </div>
                  <div className="reg-form-grid">
                    <div>
                      <label className="reg-field-label">Start Date</label>
                      <input className="reg-input" type="datetime-local" value={editForm.startDate}
                        onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="reg-field-label">End Date</label>
                      <input className="reg-input" type="datetime-local" value={editForm.endDate}
                        onChange={e => setEditForm(p => ({ ...p, endDate: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="reg-field-label">Capacity</label>
                    <input className="reg-input" type="number" value={editForm.capacity}
                      onChange={e => setEditForm(p => ({ ...p, capacity: e.target.value }))} placeholder="Unlimited" min="1" />
                  </div>
                </div>
                <div className="reg-modal-footer">
                  <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAINER PROFILE VIEW MODAL ── */}
      <TrainerProfileModal
        open={!!trainerDetailModal}
        trainer={trainerDetailModal}
        onClose={() => setTrainerDetailModal(null)}
        onDelete={(id, name) => handleDeleteTrainer(id, name)}
      />

      {/* ── CONFIRM MODAL ── */}
      {confirmModal && (
        <div className="reg-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="reg-modal reg-modal--small" onClick={e => e.stopPropagation()}>
            <div className="reg-modal-header">
              <h3>{confirmModal.title}</h3>
              <button onClick={() => setConfirmModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#64748b" /></button>
            </div>
            <div className="reg-modal-body">
              {confirmModal.subtitle && <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{confirmModal.subtitle}</p>}
            </div>
            <div className="reg-modal-footer">
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="reg-admin-btn reg-admin-btn--danger" onClick={confirmAction} disabled={loading}>
                {loading ? 'Processing...' : (confirmModal.confirmText || 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}


      <ParticipantProfileView
        open={!!viewingParticipant}
        userId={viewingParticipant?.id}
        participant={viewingParticipant}
        fallback={viewingParticipant ? {
          name: viewingParticipant.name,
          email: viewingParticipant.email,
          createdAt: viewingParticipant.created_at || viewingParticipant.joinedAt,
        } : null}
        onClose={() => setViewingParticipant(null)}
        onDelete={(id, name) => handleDeleteParticipant(id, name)}
      />
    </motion.div>
  )
}

export default AdminDashboard
