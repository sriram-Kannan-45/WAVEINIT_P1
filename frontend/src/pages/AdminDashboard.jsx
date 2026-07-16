import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import TrainerList from '../components/TrainerList'
import ParticipantList from '../components/ParticipantList'
import ParticipantProfileView from '../components/shared/ParticipantProfileView'
import AssessmentSessionsPanel from '../components/admin/AssessmentSessionsPanel'
import AnimatedDropdown from '../components/AnimatedDropdown'
import { useToast } from '../components/Toast'
import Skeleton, { SkeletonTable } from '../components/Skeleton'
import { API, API_BASE } from '../api/api'
import { Loader2, TrendingUp, MessageSquare, Star, User, Users, ClipboardList, ChevronDown, X } from 'lucide-react'
import AdminOverviewTab from '../components/admin/tabs/AdminOverviewTab'
import { Button, Badge, Table, PageHeader, EmptyState, StatCard } from '../components/ui'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const initials = (name) => name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'AD'
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
  const [tab, setTab] = useState(activeTab || 'overview')

  useEffect(() => {
    if (activeTab) setTab(activeTab)
  }, [activeTab])

  const handleTabChange = (newTab) => {
    setTab(newTab)
    if (onTabChange) onTabChange(newTab)
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
  const [credentials, setCredentials] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [adminReport, setAdminReport] = useState(null)

  const [trainerForm, setTrainerForm] = useState({ name: '', email: '', password: '' })
  const [trainingForm, setTrainingForm] = useState({ title: '', description: '', trainerId: '', trainerIds: [], startDate: '', endDate: '', capacity: '', sequentialLearning: false })
  const [questionForm, setQuestionForm] = useState({ trainingId: '', questionText: '', questionType: 'TEXT', options: '' })
  const [addParticipantModal, setAddParticipantModal] = useState(false)
  const [participantForm, setParticipantForm] = useState({ name: '', email: '', phone: '', password: '' })

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
      const r = await fetch(`${API_BASE}/admin/pending-participants`, { headers: auth() })
      const d = await r.json()
      setPendingParticipants(d.participants || [])
    } catch {}
  }

  const handleApproveParticipant = async (id) => {
    setConfirmModal({ action: 'approve-participant', id, title: 'Approve Participant?' })
  }

  const confirmAction = async () => {
    if (!confirmModal) return
    setLoading(true)
    try {
      if (confirmModal.action === 'approve-participant') {
        const r = await fetch(`${API_BASE}/admin/approve-participant/${confirmModal.id}`, { method: 'POST', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Participant approved successfully')
        fetchPendingParticipants(); fetchParticipants()
      } else if (confirmModal.action === 'delete-question') {
        const r = await fetch(`${API_BASE}/survey/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        if (!r.ok) throw new Error('Failed to delete question')
        success('Question deleted')
        fetchQuestions()
      } else if (confirmModal.action === 'delete-training') {
        const r = await fetch(`${API_BASE}/admin/trainings/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Training deleted successfully')
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
        success(d.message || 'Trainer removed successfully')
        fetchTrainers(); fetchStats()
      } else if (confirmModal.action === 'delete-program') {
        const r = await fetch(`${API_BASE}/admin/training-programs/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        success('Program deleted successfully')
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
      const r = await fetch(`${API_BASE}/admin/participants`, { headers: auth() })
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

  const handleCreateTrainer = async (e) => {
    e.preventDefault(); setLoading(true); setCredentials(null)
    try {
      const r = await fetch(`${API_BASE}/admin/create-trainer`, { method: 'POST', headers: auth(), body: JSON.stringify(trainerForm) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setTrainerForm({ name: '', email: '', password: '' })
      fetchTrainers(); fetchStats()
      success('Trainer account created successfully.')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
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
      success('Training session created successfully.')
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
      success('Survey question created.')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleCreateParticipant = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const r = await fetch(API.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(participantForm)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setParticipantForm({ name: '', email: '', phone: '', password: '' })
      setAddParticipantModal(false)
      fetchParticipants(); fetchStats()
      success('Participant account created successfully.')
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
      success('Program created successfully.')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleCreateCourse = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const body = {
        title: courseForm.title,
        description: courseForm.description,
        trainerId: parseInt(courseForm.trainerId),
        programId: courseForm.programId ? parseInt(courseForm.programId) : undefined,
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
      success('Course created successfully.')
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

  const handleDeleteTrainer = async (id, name) => {
    setConfirmModal({ action: 'delete-trainer', id, title: `Delete trainer "${name}"?`, subtitle: 'Their training assignments will be unlinked.' })
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
      style={{ padding: 'var(--space-8)', maxWidth: 1400, margin: '0 auto' }}
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
          initialLoading={initialLoading}
          loading={loading}
        />
      )}

      {/* ── PENDING APPROVAL ── */}
      {tab === 'pending' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Pending Approval"
            subtitle="Review and approve participant registration requests."
          />
          {initialLoading ? (
            <div className="enterprise-card"><div className="enterprise-card__body"><SkeletonTable rows={3} /></div></div>
          ) : pendingParticipants.length === 0 ? (
            <div className="enterprise-card">
              <EmptyState
                icon={User}
                title="All Approved"
                description="No participants are currently waiting for registration approval."
              />
            </div>
          ) : (
            <div className="enterprise-table-wrapper">
              <Table
                columns={[
                  { key: 'name', header: 'Name', className: 'font-semibold', style: { color: 'var(--neutral-900)' } },
                  { key: 'email', header: 'Email' },
                  { key: 'phone', header: 'Phone', render: (row) => row.phone || '-' },
                  { key: 'created_at', header: 'Registered', render: (row) => fmtDate(row.created_at) },
                  {
                    key: 'actions',
                    header: '',
                    className: 'text-right',
                    render: (row) => (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleApproveParticipant(row.id)}
                        disabled={loading}
                      >
                        Approve
                      </Button>
                    ),
                  },
                ]}
                data={pendingParticipants}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* ── TRAININGS (list) ── */}
      {tab === 'trainings' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Training Sessions"
            subtitle="Manage scheduled training programs, enrollments, and status."
            action={
              <Button variant="primary" onClick={() => handleTabChange('createTraining')}>
                + Add Training
              </Button>
            }
          />
          {initialLoading ? (
            <div className="enterprise-card"><div className="enterprise-card__body"><SkeletonTable rows={5} /></div></div>
          ) : trainings.length === 0 ? (
            <div className="enterprise-card">
              <EmptyState
                icon={Users}
                title="No Trainings Yet"
                description="Create your first training session to schedule classes, assign trainers, and track enrollment."
                actionLabel="+ Create Training"
                onAction={() => handleTabChange('createTraining')}
              />
            </div>
          ) : (
            <div className="enterprise-table-wrapper">
              <Table
                columns={[
                  { key: 'title', header: 'Title', className: 'font-semibold', style: { color: 'var(--neutral-900)' } },
                  {
                    key: 'trainerName',
                    header: 'Trainer',
                    render: (row) =>
                      row.trainerName ? (
                        <span className="badge badge--success">{row.trainerName}</span>
                      ) : (
                        <span className="badge badge--neutral">Unassigned</span>
                      ),
                  },
                  { key: 'startDate', header: 'Start', render: (row) => fmtDate(row.startDate) },
                  { key: 'endDate', header: 'End', render: (row) => fmtDate(row.endDate) },
                  {
                    key: 'capacity',
                    header: 'Capacity',
                    render: (row) => (row.capacity ? row.capacity : <span className="badge badge--neutral">Unlimited</span>),
                  },
                  { key: 'enrolledCount', header: 'Enrolled', render: (row) => row.enrolledCount ?? 0 },
                  {
                    key: 'actions',
                    header: '',
                    className: 'text-right',
                    render: (row) => (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteTraining(row.id, row.title)}>
                          Delete
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={trainings}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* ── TRAINERS (list) ── */}
      {tab === 'trainers' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Trainers"
            subtitle="Manage training instructors and assign courses."
            action={
              <Button variant="primary" onClick={() => handleTabChange('createTrainer')}>
                + Add Trainer
              </Button>
            }
          />
          {initialLoading ? (
            <div className="enterprise-card"><div className="enterprise-card__body"><SkeletonTable rows={5} /></div></div>
          ) : trainers.length === 0 ? (
            <div className="enterprise-card">
              <EmptyState
                icon={User}
                title="No Trainers Yet"
                description="Add your first trainer to assign them courses and start tracking performance feedback."
                actionLabel="+ Add First Trainer"
                onAction={() => handleTabChange('createTrainer')}
              />
            </div>
          ) : (
            <div className="enterprise-card">
              <div className="enterprise-card__body">
                <TrainerList 
                  trainers={trainers}
                  token={user.token}
                  onDelete={handleDeleteTrainer}
                />
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── PARTICIPANTS ── */}
      {tab === 'participants' && (
        <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* KPI Cards */}
          <div className="wl-participants-kpi">
            <div className="wl-participants-kpi-card">
              <div className="wl-participants-kpi-icon" style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a' }}>
                <Users size={28} />
              </div>
              <div className="wl-participants-kpi-data">
                <div className="wl-participants-kpi-number">{participants.length}</div>
                <div className="wl-participants-kpi-label">Total Participants</div>
              </div>
            </div>

            <div className="wl-participants-kpi-card">
              <div className="wl-participants-kpi-icon" style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div className="wl-participants-kpi-data">
                <div className="wl-participants-kpi-number">{participants.filter(p => (p.status || '').toUpperCase() === 'APPROVED').length}</div>
                <div className="wl-participants-kpi-label">Approved</div>
                <div className="wl-participants-kpi-trend wl-participants-kpi-trend--up">
                  {participants.length > 0 ? Math.round((participants.filter(p => (p.status || '').toUpperCase() === 'APPROVED').length / participants.length) * 100) : 0}% of total
                </div>
              </div>
            </div>

            <div className="wl-participants-kpi-card">
              <div className="wl-participants-kpi-icon" style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div className="wl-participants-kpi-data">
                <div className="wl-participants-kpi-number">{participants.filter(p => (p.status || '').toUpperCase() === 'PENDING').length}</div>
                <div className="wl-participants-kpi-label">Pending Approval</div>
                <div className="wl-participants-kpi-trend wl-participants-kpi-trend--neutral">
                  Awaiting review
                </div>
              </div>
            </div>
          </div>

          {/* Participant List */}
          {initialLoading ? (
            <div className="enterprise-card"><div className="enterprise-card__body"><SkeletonTable rows={5} /></div></div>
          ) : (
            <ParticipantList
              participants={participants}
              loading={false}
              onDelete={handleDeleteParticipant}
              onRefresh={() => fetchParticipants()}
              onView={(p) => setViewingParticipant(p)}
              onApprove={async (id) => {
                const r = await fetch(`${API_BASE}/admin/approve-participant/${id}`, { method: 'POST', headers: auth() })
                if (r.ok) {
                  success('Participant approved successfully')
                  fetchParticipants()
                } else {
                  const d = await r.json()
                  showError(d.error || 'Failed to approve participant')
                }
              }}
              onReject={async (id) => {
                const r = await fetch(`${API_BASE}/admin/reject-participant/${id}`, { method: 'POST', headers: auth() })
                if (r.ok) {
                  success('Participant rejected successfully')
                  fetchParticipants()
                } else {
                  const d = await r.json()
                  showError(d.error || 'Failed to reject participant')
                }
              }}
            />
          )}
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
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Survey Questions"
            subtitle="Configure feedback survey questions for training sessions."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Add Question</h3>
              </div>
              <div className="enterprise-card__body">
                <form onSubmit={handleCreateQuestion}>
                  <div className="field-group">
                    <label className="field-label">Training (Optional)</label>
                    <AnimatedDropdown
                      options={[
                        { value: '', label: 'Apply to ALL Trainings' },
                        ...trainings.map(t => ({ value: t.id, label: t.title }))
                      ]}
                      value={questionForm.trainingId}
                      onChange={(val) => setQuestionForm(p => ({ ...p, trainingId: val }))}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Question Type</label>
                    <AnimatedDropdown
                      options={[
                        { value: 'TEXT', label: 'Text Answer' },
                        { value: 'RATING', label: 'Rating (1-5)' },
                        { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' }
                      ]}
                      value={questionForm.questionType}
                      onChange={(val) => setQuestionForm(p => ({ ...p, questionType: val }))}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Question Text</label>
                    <input
                      className="field-input"
                      style={{ paddingLeft: 14 }}
                      type="text"
                      value={questionForm.questionText}
                      required
                      onChange={e => setQuestionForm(p => ({ ...p, questionText: e.target.value }))}
                      placeholder="Enter survey question"
                    />
                  </div>
                  {questionForm.questionType === 'MULTIPLE_CHOICE' && (
                    <div className="field-group">
                      <label className="field-label">Options (comma separated)</label>
                      <input
                        className="field-input"
                        style={{ paddingLeft: 14 }}
                        type="text"
                        value={questionForm.options}
                        placeholder="Option A, Option B, Option C"
                        required
                        onChange={e => setQuestionForm(p => ({ ...p, options: e.target.value }))}
                      />
                    </div>
                  )}
                  <Button type="submit" variant="primary" disabled={loading}>Add Question</Button>
                </form>
              </div>
            </div>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Questions ({questions.length})</h3>
              </div>
              {questions.length === 0 ? (
                <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <p style={{ color: 'var(--neutral-400)', fontSize: 14 }}>No custom questions added.</p>
                </div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="enterprise-table">
                    <thead>
                      <tr><th>Target</th><th>Question</th><th>Type</th><th>Options</th><th></th></tr>
                    </thead>
                    <tbody>
                      {questions.map(q => {
                        const trg = q.trainingId ? trainings.find(t => t.id === q.trainingId)?.title || 'Specific' : 'Global'
                        return (
                          <tr key={q.id}>
                            <td><span className={q.trainingId ? "badge badge--info" : "badge badge--neutral"}>{trg}</span></td>
                            <td style={{ color: 'var(--neutral-800)' }}>{q.questionText}</td>
                            <td style={{ color: 'var(--neutral-500)' }}>{q.questionType}</td>
                            <td style={{ color: 'var(--neutral-500)' }}>{q.options ? q.options.join(', ') : '-'}</td>
                            <td><Button size="sm" variant="danger" onClick={() => handleDeleteQuestion(q.id)}>Delete</Button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── NOTES MANAGEMENT ── */}
      {tab === 'notes' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Notes Management"
            subtitle="Review and manage study resources uploaded by trainers."
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { key: '', label: 'All', count: notes.length },
                  { key: 'pending', label: 'Pending', count: notes.filter(n => n.status?.toLowerCase() === 'pending').length },
                  { key: 'approved', label: 'Approved', count: notes.filter(n => n.status?.toLowerCase() === 'approved').length }
                ].map(btn => (
                  <Button
                    key={btn.key}
                    onClick={() => { setNoteFilter(btn.key); fetchNotes(btn.key) }}
                    variant={noteFilter === btn.key ? 'primary' : 'secondary'}
                    size="sm"
                  >
                    {btn.label} ({btn.count})
                  </Button>
                ))}
              </div>
            }
          />
          {notes.length === 0 ? (
            <div className="enterprise-card">
              <EmptyState
                icon={ClipboardList}
                title="No Notes Found"
                description={
                  noteFilter === 'pending' ? 'All pending notes have been reviewed.' : 
                  noteFilter === 'approved' ? 'No approved notes yet.' : 
                  'Notes will appear here when trainers upload them.'
                }
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {notes.map((note, idx) => {
                const isPending = note.status?.toUpperCase() === 'PENDING'
                const isApproved = note.status?.toUpperCase() === 'APPROVED'
                return (
                  <div key={note.id || idx} className="enterprise-card">
                    <div className="enterprise-card__body">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                            <span className={`badge ${isApproved ? 'badge--success' : isPending ? 'badge--warning' : 'badge--error'}`}>{note.status}</span>
                            <span style={{ fontSize: 12, color: 'var(--neutral-400)' }}>{fmtDate(note.created_at)}</span>
                          </div>
                          <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--neutral-900)', marginBottom: 4 }}>{note.title}</h4>
                          <p style={{ fontSize: 12, color: 'var(--neutral-400)', marginBottom: 'var(--space-3)' }}>Uploaded by: {note.trainer?.name || 'Unknown'}</p>
                          <p style={{ fontSize: 14, color: 'var(--neutral-600)', lineHeight: 1.6 }}>{note.content}</p>
                        </div>
                        {isPending && (
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <Button size="sm" variant="danger" onClick={() => handleRejectNote(note.id)} disabled={loading}>Reject</Button>
                            <Button size="sm" variant="primary" onClick={() => handleApproveNote(note.id)} disabled={loading}>Approve</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── FEEDBACK REPORTS ── */}
      {tab === 'feedback' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Feedback Reports"
            subtitle="View all participant feedback across training sessions."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <StatCard label="Total Responses" value={feedbacks.length} icon={MessageSquare} variant="primary" />
            <StatCard label="Avg Trainer Rating" value={stats.avgTrainerRating ?? '0.0'} icon={Star} variant="amber" />
            <StatCard label="Avg Subject Rating" value={stats.avgSubjectRating ?? '0.0'} icon={TrendingUp} variant="emerald" />
          </div>
          <div className="enterprise-table-wrapper">
            {initialLoading ? (
              <div className="enterprise-card__body"><SkeletonTable rows={5} /></div>
            ) : feedbacks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                <p style={{ color: 'var(--neutral-400)', fontSize: 14 }}>No feedback submitted yet.</p>
              </div>
            ) : (
              <table className="enterprise-table">
                <thead>
                  <tr><th>#</th><th>Training</th><th>Trainer</th><th>Participant</th><th>Trainer Rating</th><th>Subject Rating</th><th>Comments</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {feedbacks.map((f, i) => (
                    <tr key={f.id}>
                      <td style={{ color: 'var(--neutral-400)' }}>{i + 1}</td>
                      <td className="font-semibold" style={{ color: 'var(--neutral-900)' }}>{f.trainingTitle}</td>
                      <td style={{ color: 'var(--neutral-500)' }}>{f.trainerName}</td>
                      <td>{f.anonymous ? <span className="badge badge--neutral">Anonymous</span> : f.participantName}</td>
                      <td><Stars v={f.trainerRating} /> <span style={{ fontSize: 12, color: 'var(--neutral-400)', marginLeft: 4 }}>{f.trainerRating}/5</span></td>
                      <td><Stars v={f.subjectRating} /> <span style={{ fontSize: 12, color: 'var(--neutral-400)', marginLeft: 4 }}>{f.subjectRating}/5</span></td>
                      <td style={{ maxWidth: 150, color: 'var(--neutral-500)', fontSize: 13 }}>{f.comments || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--neutral-500)' }}>{fmtDate(f.submittedAt)}</td>
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
          <PageHeader
            title="Create Trainer"
            onBack={() => handleTabChange('trainers')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Create Trainer Account</h3>
              </div>
              <div className="enterprise-card__body">
                <form onSubmit={handleCreateTrainer}>
                  <div className="field-group">
                    <label className="field-label">Full Name</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="text" value={trainerForm.name}
                      onChange={e => setTrainerForm(p => ({ ...p, name: e.target.value }))} required placeholder="Trainer full name" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Email Address</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="email" value={trainerForm.email}
                      onChange={e => setTrainerForm(p => ({ ...p, email: e.target.value }))} required placeholder="trainer@company.com" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Password</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="password" value={trainerForm.password}
                      onChange={e => setTrainerForm(p => ({ ...p, password: e.target.value }))} required placeholder="Set password for trainer" />
                  </div>
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Trainer'}
                  </Button>
                </form>
              </div>
            </div>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Trainers ({trainers.length})</h3>
              </div>
              <div className="enterprise-card__body">
                <TrainerList
                  trainers={trainers}
                  token={user.token}
                  onDelete={handleDeleteTrainer}
                  onAddTrainer={() => handleTabChange('createTrainer')}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── CREATE TRAINING ── */}
      {tab === 'createTraining' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Create Training"
            onBack={() => handleTabChange('trainings')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Create Training Session</h3>
              </div>
              <div className="enterprise-card__body">
                <form onSubmit={handleCreateTraining}>
                  <div className="field-group">
                    <label className="field-label">Training Title</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="text" value={trainingForm.title}
                      onChange={e => setTrainingForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. React Fundamentals" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Description</label>
                    <textarea className="field-input" style={{ paddingLeft: 14, minHeight: 80, resize: 'vertical' }} value={trainingForm.description}
                      onChange={e => setTrainingForm(p => ({ ...p, description: e.target.value }))} placeholder="Training objectives and content overview..." />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Assign Trainer(s)</label>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 'var(--space-2)',
                      maxHeight: 160,
                      overflowY: 'auto',
                      border: '1.5px solid var(--neutral-200)',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--neutral-25)',
                      marginTop: 'var(--space-1)'
                    }}>
                      {trainers.map(t => {
                        const isChecked = trainingForm.trainerIds?.includes(t.id);
                        return (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 13, color: 'var(--neutral-700)', padding: '6px', borderRadius: 'var(--radius-md)', background: isChecked ? 'var(--brand-admin-bg)' : 'transparent', transition: 'background 150ms' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const updated = e.target.checked
                                  ? [...(trainingForm.trainerIds || []), t.id]
                                  : (trainingForm.trainerIds || []).filter(id => id !== t.id);
                                setTrainingForm(p => ({
                                  ...p,
                                  trainerIds: updated,
                                  trainerId: updated[0] || ''
                                }));
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <span style={{ fontWeight: 600 }}>{t.name}</span>
                              <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{t.email}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="field-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    <input
                      type="checkbox"
                      id="sequentialLearning"
                      checked={trainingForm.sequentialLearning || false}
                      onChange={e => setTrainingForm(p => ({ ...p, sequentialLearning: e.target.checked }))}
                      style={{ width: 'auto', height: 'auto', cursor: 'pointer', margin: 0 }}
                    />
                    <label htmlFor="sequentialLearning" style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-700)', cursor: 'pointer', margin: 0 }}>
                      Enable Sequential Learning Lock
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="field-group">
                      <label className="field-label">Start Date & Time</label>
                      <input className="field-input" style={{ paddingLeft: 14 }} type="datetime-local" value={trainingForm.startDate}
                        onChange={e => setTrainingForm(p => ({ ...p, startDate: e.target.value }))} required />
                    </div>
                    <div className="field-group">
                      <label className="field-label">End Date & Time</label>
                      <input className="field-input" style={{ paddingLeft: 14 }} type="datetime-local" value={trainingForm.endDate}
                        onChange={e => setTrainingForm(p => ({ ...p, endDate: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Capacity (blank for unlimited)</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="number" value={trainingForm.capacity}
                      onChange={e => setTrainingForm(p => ({ ...p, capacity: e.target.value }))} placeholder="e.g. 30" min="1" />
                  </div>
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Training Session'}
                  </Button>
                </form>
              </div>
            </div>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Recent Trainings</h3>
              </div>
              {trainings.length === 0 ? (
                <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <p style={{ color: 'var(--neutral-400)', fontSize: 14 }}>No training sessions created yet.</p>
                </div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="enterprise-table">
                    <thead>
                      <tr><th>Title</th><th>Trainer</th><th>Start</th><th>End</th><th></th></tr>
                    </thead>
                    <tbody>
                      {trainings.slice(0, 10).map(t => (
                        <tr key={t.id}>
                          <td className="font-semibold" style={{ color: 'var(--neutral-900)' }}>{t.title}</td>
                          <td>{t.trainerName ? <span className="badge badge--info">{t.trainerName}</span> : <span className="badge badge--neutral">Unassigned</span>}</td>
                          <td style={{ color: 'var(--neutral-500)' }}>{fmtDate(t.startDate)}</td>
                          <td style={{ color: 'var(--neutral-500)' }}>{fmtDate(t.endDate)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>Edit</Button>
                              <Button size="sm" variant="danger" onClick={() => handleDeleteTraining(t.id, t.title)}>Delete</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── PROGRAMS & COURSES ── */}
      {tab === 'programs' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Programs & Courses"
            subtitle="Organize training into programs and individual courses."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Create Program</h3>
              </div>
              <div className="enterprise-card__body">
                <form onSubmit={handleCreateProgram}>
                  <div className="field-group">
                    <label className="field-label">Program Title</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="text" value={programForm.title}
                      onChange={e => setProgramForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. Full Stack Development" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Description</label>
                    <textarea className="field-input" style={{ paddingLeft: 14, minHeight: 80, resize: 'vertical' }} value={programForm.description}
                      onChange={e => setProgramForm(p => ({ ...p, description: e.target.value }))} placeholder="Program overview..." />
                  </div>
                  <Button type="submit" variant="primary" disabled={loading}>Create Program</Button>
                </form>
              </div>
            </div>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Programs ({programs.length})</h3>
              </div>
              {programs.length === 0 ? (
                <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <p style={{ color: 'var(--neutral-400)', fontSize: 14 }}>No programs created yet.</p>
                </div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="enterprise-table">
                    <thead><tr><th>Title</th><th>Description</th><th>Courses</th><th></th></tr></thead>
                    <tbody>
                      {programs.map(p => (
                        <tr key={p.id}>
                          <td className="font-semibold" style={{ color: 'var(--neutral-900)' }}>{p.title}</td>
                          <td style={{ color: 'var(--neutral-500)', maxWidth: 200 }} className="text-sm">{(p.description || '').slice(0, 60)}</td>
                          <td>{p.courseCount ?? 0}</td>
                          <td><Button size="sm" variant="danger" onClick={() => handleDeleteProgram(p.id, p.title)}>Delete</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Create Course</h3>
              </div>
              <div className="enterprise-card__body">
                <form onSubmit={handleCreateCourse}>
                  <div className="field-group">
                    <label className="field-label">Course Title</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="text" value={courseForm.title}
                      onChange={e => setCourseForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. React for Beginners" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Description</label>
                    <textarea className="field-input" style={{ paddingLeft: 14, minHeight: 80, resize: 'vertical' }} value={courseForm.description}
                      onChange={e => setCourseForm(p => ({ ...p, description: e.target.value }))} placeholder="Course description..." />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Program</label>
                    <AnimatedDropdown
                      options={programs.map(p => ({ value: p.id, label: p.title }))}
                      value={courseForm.programId}
                      onChange={(val) => setCourseForm(p => ({ ...p, programId: val }))}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Assign Trainer</label>
                    <AnimatedDropdown
                      options={[
                        { value: '', label: 'Select a trainer' },
                        ...trainers.map(t => ({ value: t.id, label: `${t.name} (${t.email})` }))
                      ]}
                      value={courseForm.trainerId}
                      onChange={(val) => setCourseForm(p => ({ ...p, trainerId: val }))}
                    />
                  </div>
                  <Button type="submit" variant="primary" disabled={loading}>Create Course</Button>
                </form>
              </div>
            </div>
            <div className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Courses ({courses.length})</h3>
              </div>
              {courses.length === 0 ? (
                <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <p style={{ color: 'var(--neutral-400)', fontSize: 14 }}>No courses created yet.</p>
                </div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table className="enterprise-table">
                    <thead><tr><th>Title</th><th>Program</th><th>Trainer</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {courses.map(c => (
                        <tr key={c.id}>
                          <td className="font-semibold" style={{ color: 'var(--neutral-900)' }}>{c.title}</td>
                          <td style={{ color: 'var(--neutral-500)' }}>{c.programTitle || '-'}</td>
                          <td style={{ color: 'var(--neutral-500)' }}>{c.trainerName || 'Unassigned'}</td>
                          <td><span className={`badge ${c.status === 'ACTIVE' ? 'badge--success' : 'badge--neutral'}`}>{c.status || 'ACTIVE'}</span></td>
                          <td><Button size="sm" variant="danger" onClick={() => handleDeleteCourse(c.id, c.title)}>Delete</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── REPORTS & ANALYTICS ── */}
      {tab === 'reports' && (
        <motion.div variants={itemVariants}>
          <PageHeader
            title="Reports & Analytics"
            subtitle="Platform-wide metrics, performance insights, and engagement data."
            action={
              <Button variant="secondary" onClick={fetchAdminReport}>Refresh Report</Button>
            }
          />

          {!adminReport ? (
            <div className="enterprise-card">
              <div className="enterprise-card__body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                <span style={{ fontSize: 14, color: 'var(--neutral-400)' }}>Loading reports data...</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
                <div className="stat-card">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Total Users</span>
                  <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--neutral-900)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1, display: 'block', marginBottom: 8 }}>{adminReport.totalUsers}</span>
                  <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                    Admins: {adminReport.usersByRole?.admin || 0} | Trainers: {adminReport.usersByRole?.trainer || 0} | Participants: {adminReport.usersByRole?.participant || 0}
                  </span>
                </div>
                <div className="stat-card">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Trainings & Lessons</span>
                  <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--neutral-900)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1, display: 'block', marginBottom: 8 }}>
                    {adminReport.totalTrainings} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--neutral-400)' }}>Trainings</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Total Lessons: {adminReport.totalLessons || 0}</span>
                </div>
                <div className="stat-card">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Completion Rate</span>
                  <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-admin)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1, display: 'block', marginBottom: 8 }}>{adminReport.completionRate}%</span>
                  <div style={{ width: '100%', height: 6, background: 'var(--neutral-100)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${adminReport.completionRate}%`, height: '100%', background: 'var(--brand-admin)', borderRadius: 3 }}></div>
                  </div>
                </div>
                <div className="stat-card">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Active Users (30 Days)</span>
                  <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--neutral-900)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1, display: 'block', marginBottom: 8 }}>{adminReport.activeUsers}</span>
                  <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Enrollment Rate: {adminReport.enrollmentRate}%</span>
                </div>
              </div>

              <div className="enterprise-card">
                <div className="enterprise-card__header">
                  <h3 className="enterprise-card__title">Trainer Performance & Feedback</h3>
                </div>
                {(!adminReport.trainerPerformance || adminReport.trainerPerformance.length === 0) ? (
                  <div className="enterprise-card__body" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <p style={{ color: 'var(--neutral-400)', fontSize: 14 }}>No feedback data available for trainers yet.</p>
                  </div>
                ) : (
                  <div style={{ overflow: 'auto' }}>
                    <table className="enterprise-table">
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
                            <td className="font-semibold" style={{ color: 'var(--neutral-900)' }}>{tp.trainerName}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge badge--success" style={{ fontWeight: 600 }}>
                                {tp.avgTrainerRating} / 5.0
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge badge--info" style={{ fontWeight: 600 }}>
                                {tp.avgSubjectRating} / 5.0
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', color: 'var(--neutral-500)' }}>
                              {tp.feedbackCount} response(s)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── EDIT MODAL ── */}
      {editModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)'
        }} onClick={() => setEditModal(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="enterprise-card"
            style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="enterprise-card__header">
              <h3 className="enterprise-card__title">Edit Training Session</h3>
              <button
                onClick={() => setEditModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 4, borderRadius: 'var(--radius-md)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="enterprise-card__body">
              <form onSubmit={handleUpdateTraining}>
                <div className="field-group">
                  <label className="field-label">Title</label>
                  <input className="field-input" style={{ paddingLeft: 14 }} type="text" value={editForm.title}
                    onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
                <div className="field-group">
                  <label className="field-label">Description</label>
                  <textarea className="field-input" style={{ paddingLeft: 14, minHeight: 80, resize: 'vertical' }} value={editForm.description}
                    onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Assign Trainer(s)</label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 'var(--space-2)',
                    maxHeight: 160,
                    overflowY: 'auto',
                    border: '1.5px solid var(--neutral-200)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--neutral-25)',
                    marginTop: 'var(--space-1)'
                  }}>
                    {trainers.map(t => {
                      const isChecked = editForm.trainerIds?.includes(t.id);
                      return (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 13, color: 'var(--neutral-700)', padding: '6px', borderRadius: 'var(--radius-md)', background: isChecked ? 'var(--brand-admin-bg)' : 'transparent', transition: 'background 150ms' }}>
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
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <span style={{ fontWeight: 600 }}>{t.name}</span>
                            <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{t.email}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="field-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  <input
                    type="checkbox"
                    id="editSequentialLearning"
                    checked={editForm.sequentialLearning || false}
                    onChange={e => setEditForm(p => ({ ...p, sequentialLearning: e.target.checked }))}
                    style={{ width: 'auto', height: 'auto', cursor: 'pointer', margin: 0 }}
                  />
                  <label htmlFor="editSequentialLearning" style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-700)', cursor: 'pointer', margin: 0 }}>
                    Enable Sequential Learning Lock
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="field-group">
                    <label className="field-label">Start Date</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="datetime-local" value={editForm.startDate}
                      onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">End Date</label>
                    <input className="field-input" style={{ paddingLeft: 14 }} type="datetime-local" value={editForm.endDate}
                      onChange={e => setEditForm(p => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Capacity</label>
                  <input className="field-input" style={{ paddingLeft: 14 }} type="number" value={editForm.capacity}
                    onChange={e => setEditForm(p => ({ ...p, capacity: e.target.value }))} placeholder="Unlimited" min="1" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                  <Button type="button" variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── CONFIRM MODAL ── */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)'
        }} onClick={() => setConfirmModal(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="enterprise-card"
            style={{ width: '100%', maxWidth: 440 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="enterprise-card__header">
              <h3 className="enterprise-card__title">{confirmModal.title}</h3>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 4, borderRadius: 'var(--radius-md)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="enterprise-card__body">
              {confirmModal.subtitle && <p style={{ fontSize: 14, color: 'var(--neutral-500)', marginBottom: 'var(--space-6)' }}>{confirmModal.subtitle}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                <Button variant="secondary" onClick={() => setConfirmModal(null)}>Cancel</Button>
                <Button variant="danger" onClick={confirmAction} disabled={loading}>
                  {loading ? 'Processing...' : 'Confirm'}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── ADD PARTICIPANT MODAL ── */}
      {addParticipantModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)'
        }} onClick={() => setAddParticipantModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="enterprise-card"
            style={{ width: '100%', maxWidth: 480 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="enterprise-card__header">
              <h3 className="enterprise-card__title">Add New Participant</h3>
              <button
                onClick={() => setAddParticipantModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 4, borderRadius: 'var(--radius-md)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="enterprise-card__body">
              <form onSubmit={handleCreateParticipant}>
                <div className="field-group">
                  <label className="field-label">Full Name</label>
                  <input className="field-input" style={{ paddingLeft: 14 }} type="text" value={participantForm.name}
                    onChange={e => setParticipantForm(p => ({ ...p, name: e.target.value }))} required placeholder="e.g. John Doe" />
                </div>
                <div className="field-group">
                  <label className="field-label">Email Address</label>
                  <input className="field-input" style={{ paddingLeft: 14 }} type="email" value={participantForm.email}
                    onChange={e => setParticipantForm(p => ({ ...p, email: e.target.value }))} required placeholder="e.g. john@example.com" />
                </div>
                <div className="field-group">
                  <label className="field-label">Phone Number</label>
                  <input className="field-input" style={{ paddingLeft: 14 }} type="tel" value={participantForm.phone}
                    onChange={e => setParticipantForm(p => ({ ...p, phone: e.target.value }))} required placeholder="e.g. +91 9876543210" />
                </div>
                <div className="field-group">
                  <label className="field-label">Password</label>
                  <input className="field-input" style={{ paddingLeft: 14 }} type="password" value={participantForm.password}
                    onChange={e => setParticipantForm(p => ({ ...p, password: e.target.value }))} required placeholder="Min 6 characters" minLength="6" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                  <Button type="button" variant="secondary" onClick={() => setAddParticipantModal(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Participant'}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      <ParticipantProfileView
        open={!!viewingParticipant}
        userId={viewingParticipant?.id}
        fallback={viewingParticipant ? {
          name: viewingParticipant.name,
          email: viewingParticipant.email,
          createdAt: viewingParticipant.created_at || viewingParticipant.joinedAt,
        } : null}
        onClose={() => setViewingParticipant(null)}
      />
    </motion.div>
  )
}

export default AdminDashboard
