import { motion } from 'framer-motion'
import { AlertCircle, BookOpen, Check, CheckCircle2, ClipboardList, Clock, Eye, FileText, Layers, Loader2, MessageSquare, Plus, RefreshCw, Search, Star, Trash2, TrendingUp, Trophy, User, UserCheck, UserPlus, Users, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API, API_BASE } from '../api/api'
import { fetchWithTimeout } from '../api/request'
import AssessmentSessionsPanel from '../components/admin/AssessmentSessionsPanel'
import BulkImportParticipants from '../components/admin/BulkImportParticipants'
import CreateTrainerModule from '../components/admin/CreateTrainerModule'
import CreateTrainingModule from '../components/admin/CreateTrainingModule'
import CreateParticipantModal from '../components/admin/CreateParticipantModal'
import AdminOverviewTab from '../components/admin/tabs/AdminOverviewTab'
import ParticipantProfileView from '../components/shared/ParticipantProfileView'
import { useToast } from '../components/Toast'
import TrainerProfileModal from '../components/admin/TrainerProfileModal'
import UserAvatar, { getTwoLetterInitials } from '../components/common/UserAvatar'
import AdminPagination from '../components/common/AdminPagination'
import BulkDeleteConfirmModal from '../components/admin/BulkDeleteConfirmModal'
import AdminAttendanceAnalytics from '../components/admin/attendance/AdminAttendanceAnalytics'
import AdminFeedbackAnalytics from '../components/admin/feedback/AdminFeedbackAnalytics'

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
  const navigate = useNavigate()
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
  const [addParticipantModalOpen, setAddParticipantModalOpen] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [adminReport, setAdminReport] = useState(null)

  // Trainers pagination & filters & selection
  const [trainerSearch, setTrainerSearch] = useState('')
  const [trainerPage, setTrainerPage] = useState(1)
  const [trainerLimit, setTrainerLimit] = useState(10)
  const [trainerTotal, setTrainerTotal] = useState(0)
  const [trainerTotalPages, setTrainerTotalPages] = useState(1)
  const [selectedTrainerIds, setSelectedTrainerIds] = useState(new Set())
  const [trainersLoading, setTrainersLoading] = useState(false)
  const [trainersError, setTrainersError] = useState(null)
  const [trainerDetailModal, setTrainerDetailModal] = useState(null)

  // Participants pagination & filters & selection
  const [participantSearch, setParticipantSearch] = useState('')
  const [participantStatusFilter, setParticipantStatusFilter] = useState('ALL')
  const [participantPage, setParticipantPage] = useState(1)
  const [participantLimit, setParticipantLimit] = useState(10)
  const [participantTotal, setParticipantTotal] = useState(0)
  const [participantTotalPages, setParticipantTotalPages] = useState(1)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState(new Set())
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantDetailModal, setParticipantDetailModal] = useState(null)

  // Trainings pagination & filters & selection
  const [trainingSearch, setTrainingSearch] = useState('')
  const [trainingStatusFilter, setTrainingStatusFilter] = useState('ALL')
  const [trainingPage, setTrainingPage] = useState(1)
  const [trainingLimit, setTrainingLimit] = useState(10)
  const [trainingTotal, setTrainingTotal] = useState(0)
  const [trainingTotalPages, setTrainingTotalPages] = useState(1)
  const [selectedTrainingIds, setSelectedTrainingIds] = useState(new Set())
  const [trainingsLoading, setTrainingsLoading] = useState(false)
  const [trainingDetailModal, setTrainingDetailModal] = useState(null)

  const [trainingForm, setTrainingForm] = useState({ title: '', description: '', trainerId: '', trainerIds: [], startDate: '', endDate: '', capacity: '', sequentialLearning: false })
  const [questionForm, setQuestionForm] = useState({ trainingId: '', questionText: '', questionType: 'TEXT', options: '' })

  // Programs pagination & filters & selection
  const [programs, setPrograms] = useState([])
  const [programSearch, setProgramSearch] = useState('')
  const [programPage, setProgramPage] = useState(1)
  const [programLimit, setProgramLimit] = useState(10)
  const [programTotal, setProgramTotal] = useState(0)
  const [programTotalPages, setProgramTotalPages] = useState(1)
  const [selectedProgramIds, setSelectedProgramIds] = useState(new Set())
  const [programsLoading, setProgramsLoading] = useState(false)
  const [programForm, setProgramForm] = useState({ title: '', description: '' })

  // Courses pagination & filters & selection
  const [courses, setCourses] = useState([])
  const [courseSearch, setCourseSearch] = useState('')
  const [courseStatusFilter, setCourseStatusFilter] = useState('ALL')
  const [coursePage, setCoursePage] = useState(1)
  const [courseLimit, setCourseLimit] = useState(10)
  const [courseTotal, setCourseTotal] = useState(0)
  const [courseTotalPages, setCourseTotalPages] = useState(1)
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set())
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [courseForm, setCourseForm] = useState({ title: '', description: '', trainerId: '', programId: '', status: 'ACTIVE' })

  const [summaryLoading, setSummaryLoading] = useState(false)
  const [overviewTrainings, setOverviewTrainings] = useState([])
  const [recentActivities, setRecentActivities] = useState([])
  const [confirmModal, setConfirmModal] = useState(null)

  // Bulk Delete Modal State
  const [bulkDeleteModal, setBulkDeleteModal] = useState({
    open: false,
    itemType: '',
    count: 0,
    ids: [],
    loading: false,
    failedItems: null,
  })

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` })

  const fetchAdminReport = async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/reports/admin`, { headers: auth() }, 12000)
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.success) {
        setAdminReport(d.data)
      }
    } catch (e) {
      console.error('fetchAdminReport error:', e.message)
    }
  }

  const fetchDashboardSummary = async (refresh = false) => {
    setSummaryLoading(true)
    try {
      const url = refresh ? `${API.ADMIN.DASHBOARD_SUMMARY}?fresh=true` : API.ADMIN.DASHBOARD_SUMMARY
      const r = await fetchWithTimeout(url, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.success && d.data) {
        const data = d.data
        setStats(data)
        if (Array.isArray(data.topTrainings)) {
          setOverviewTrainings(data.topTrainings)
        }
        if (Array.isArray(data.pendingList)) {
          setPendingParticipants(data.pendingList)
        }
        if (Array.isArray(data.recentActivities)) {
          setRecentActivities(data.recentActivities)
        }
        try {
          sessionStorage.setItem('admin_dashboard_summary_cache', JSON.stringify(data))
          sessionStorage.setItem('admin_stats_cache', JSON.stringify(data))
        } catch (_) {}
      }
    } catch (err) {
      console.warn('Dashboard summary fetch note:', err.message)
    } finally {
      setSummaryLoading(false)
    }
  }

  // Hydrate cached stats on mount for 0ms initial render
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('admin_dashboard_summary_cache') || sessionStorage.getItem('admin_stats_cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        setStats(parsed)
        if (Array.isArray(parsed.topTrainings)) setOverviewTrainings(parsed.topTrainings)
        if (Array.isArray(parsed.pendingList)) setPendingParticipants(parsed.pendingList)
      }
    } catch (_) {}

    // Fetch fresh summary from database in background
    fetchDashboardSummary()
  }, [])

  useEffect(() => {
    if (tab === 'overview') {
      fetchDashboardSummary()
    } else if (tab === 'reports') {
      fetchAdminReport()
    } else if (tab === 'trainers') {
      fetchTrainers(trainerPage, trainerLimit, trainerSearch)
    } else if (tab === 'createTraining' || tab === 'createTrainer') {
      fetchTrainers(1, 200, '')
    } else if (tab === 'trainings') {
      fetchTrainings(trainingPage, trainingLimit, trainingSearch, trainingStatusFilter)
    } else if (tab === 'participants') {
      fetchParticipants(participantPage, participantLimit, participantSearch, participantStatusFilter)
    } else if (tab === 'programs' || tab === 'courses') {
      fetchPrograms(programPage, programLimit, programSearch)
      fetchCourses(coursePage, courseLimit, courseSearch, courseStatusFilter)
    } else if (tab === 'notes') {
      fetchNotes(noteFilter)
    } else if (tab === 'survey' || tab === 'questions') {
      fetchQuestions()
    } else if (tab === 'feedback') {
      fetchFeedbacks()
    }
  }, [tab])

  const fetchStats = async () => {
    await fetchDashboardSummary()
  }

  const fetchPendingParticipants = async () => {
    try {
      const r = await fetchWithTimeout(API.ADMIN.PENDING_PARTICIPANTS, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
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
        const r = await fetch(API.ADMIN.DELETE_PARTICIPANT(confirmModal.id), { method: 'DELETE', headers: auth() })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.message || d.error || 'Server error deleting participant')
        success('Participant removed successfully')
        fetchParticipants(participantPage, participantLimit, participantSearch, participantStatusFilter)
        fetchPendingParticipants()
        fetchStats()
        fetchDashboardSummary(true)
      } else if (confirmModal.action === 'delete-trainer') {
        const r = await fetch(`${API_BASE}/admin/trainers/${confirmModal.id}`, { method: 'DELETE', headers: auth() })
        const d = await r.json()
        if (!r.ok) {
          console.error('[AdminDashboard] Delete trainer failed:', r.status, d)
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

  const fetchTrainers = async (page = trainerPage, limit = trainerLimit, search = trainerSearch) => {
    setTrainersLoading(true)
    setTrainersError(null)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('limit', limit)
      if (search && search.trim()) params.append('search', search.trim())

      const r = await fetchWithTimeout(`${API_BASE}/admin/trainers?${params.toString()}`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(d.error || d.message || `Server error (${r.status})`)
      }
      const list = d.trainers || (d.data && d.data.trainers) || d.data || []
      setTrainers(list)
      setTrainerTotal(d.total !== undefined ? d.total : list.length)
      setTrainerTotalPages(d.totalPages || Math.ceil((d.total || list.length) / limit) || 1)
      if (list.length > 0 && limit >= 50) {
        try { sessionStorage.setItem('admin_all_trainers_cache', JSON.stringify(list)) } catch (_) {}
      }
    } catch (e) {
      console.error('fetchTrainers error:', e.message)
      setTrainersError(e.message)
    } finally {
      setTrainersLoading(false)
    }
  }

  const fetchTrainings = async (page = trainingPage, limit = trainingLimit, search = trainingSearch, status = trainingStatusFilter) => {
    setTrainingsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('limit', limit)
      if (search && search.trim()) params.append('search', search.trim())
      if (status && status !== 'ALL') params.append('status', status)

      const r = await fetchWithTimeout(`${API_BASE}/trainings?${params.toString()}`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      const list = Array.isArray(d) ? d : (d.trainings || [])
      setTrainings(list)
      setTrainingTotal(d.total !== undefined ? d.total : list.length)
      setTrainingTotalPages(d.totalPages || Math.ceil((d.total || list.length) / limit) || 1)
    } catch (e) {
      console.error('fetchTrainings error:', e.message)
    } finally {
      setTrainingsLoading(false)
    }
  }

  const fetchFeedbacks = async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/feedback/admin-feedbacks`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      setFeedbacks(d.feedbacks || [])
    } catch {}
  }

  const fetchParticipants = async (page = participantPage, limit = participantLimit, search = participantSearch, status = participantStatusFilter) => {
    setParticipantsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('limit', limit)
      if (search && search.trim()) params.append('search', search.trim())
      if (status && status !== 'ALL') params.append('status', status)

      const r = await fetchWithTimeout(`${API.ADMIN.PARTICIPANTS}?${params.toString()}`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      const list = d.participants || (d.data && d.data.participants) || []
      setParticipants(list)
      setParticipantTotal(d.total !== undefined ? d.total : list.length)
      setParticipantTotalPages(d.totalPages || Math.ceil((d.total || list.length) / limit) || 1)
    } catch (e) {
      console.error('fetchParticipants error:', e.message)
    } finally {
      setParticipantsLoading(false)
    }
  }

  const fetchQuestions = async () => {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/survey`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      setQuestions(d.questions || [])
    } catch {}
  }

  const fetchNotes = async (status = '') => {
    try {
      const url = status 
        ? `${API_BASE}/notes/admin/notes?status=${status}`
        : `${API_BASE}/notes/admin/notes`
      const r = await fetchWithTimeout(url, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      setNotes(d.notes || [])
    } catch {}
  }

  const fetchPrograms = async (page = programPage, limit = programLimit, search = programSearch) => {
    setProgramsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('limit', limit)
      if (search && search.trim()) params.append('search', search.trim())

      const r = await fetchWithTimeout(`${API_BASE}/admin/training-programs?${params.toString()}`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      const list = d.programs || (d.data && d.data.programs) || []
      setPrograms(list)
      setProgramTotal(d.total !== undefined ? d.total : list.length)
      setProgramTotalPages(d.totalPages || Math.ceil((d.total || list.length) / limit) || 1)
    } catch (e) {
      console.error('fetchPrograms error:', e.message)
    } finally {
      setProgramsLoading(false)
    }
  }

  const fetchCourses = async (page = coursePage, limit = courseLimit, search = courseSearch, status = courseStatusFilter) => {
    setCoursesLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('limit', limit)
      if (search && search.trim()) params.append('search', search.trim())
      if (status && status !== 'ALL') params.append('status', status)

      const r = await fetchWithTimeout(`${API_BASE}/admin/courses?${params.toString()}`, { headers: auth() }, 10000)
      const d = await r.json().catch(() => ({}))
      const list = d.courses || (d.data && d.data.courses) || []
      setCourses(list)
      setCourseTotal(d.total !== undefined ? d.total : list.length)
      setCourseTotalPages(d.totalPages || Math.ceil((d.total || list.length) / limit) || 1)
    } catch (e) {
      console.error('fetchCourses error:', e.message)
    } finally {
      setCoursesLoading(false)
    }
  }

  // Aggregate refresh used by the Overview refresh action and post-create handlers
  const fetchAll = () => {
    fetchDashboardSummary(true)
    if (tab === 'participants') fetchParticipants(participantPage, participantLimit, participantSearch, participantStatusFilter)
    if (tab === 'trainers') fetchTrainers(trainerPage, trainerLimit, trainerSearch)
    if (tab === 'trainings') fetchTrainings(trainingPage, trainingLimit, trainingSearch, trainingStatusFilter)
    if (tab === 'feedback') fetchFeedbacks()
  }

  // Multi-select helpers
  const handleToggleSelect = (id, setSelectedSet) => {
    setSelectedSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllCurrentPage = (currentItems, selectedSet, setSelectedSet) => {
    const currentIds = currentItems.map(item => item.id)
    const allSelected = currentIds.length > 0 && currentIds.every(id => selectedSet.has(id))
    setSelectedSet(prev => {
      const next = new Set(prev)
      if (allSelected) {
        currentIds.forEach(id => next.delete(id))
      } else {
        currentIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const openBulkDelete = (itemType, ids) => {
    if (!ids || ids.length === 0) return
    setBulkDeleteModal({
      open: true,
      itemType,
      count: ids.length,
      ids,
      loading: false,
      failedItems: null,
    })
  }

  const handleExecuteBulkDelete = async () => {
    const { itemType, ids } = bulkDeleteModal
    if (!ids || ids.length === 0) return

    setBulkDeleteModal(prev => ({ ...prev, loading: true }))
    try {
      let endpoint = ''
      if (itemType === 'participant') endpoint = API.ADMIN.BULK_DELETE_PARTICIPANTS
      else if (itemType === 'trainer') endpoint = API.ADMIN.BULK_DELETE_TRAINERS
      else if (itemType === 'training') endpoint = API.ADMIN.BULK_DELETE_TRAININGS
      else if (itemType === 'program') endpoint = API.ADMIN_COURSES.BULK_DELETE_PROGRAMS
      else if (itemType === 'course') endpoint = API.ADMIN_COURSES.BULK_DELETE_COURSES

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ ids, force: false })
      })

      const d = await r.json().catch(() => ({}))

      if (d.success) {
        if (d.failed && d.failed.length > 0) {
          success(`Deleted ${d.summary?.deleted || 0} ${itemType}(s).`)
          setBulkDeleteModal(prev => ({ ...prev, loading: false, failedItems: d.failed }))
        } else {
          success(`Successfully deleted ${d.summary?.deleted || ids.length} ${itemType}(s).`)
          setBulkDeleteModal({ open: false, itemType: '', count: 0, ids: [], loading: false, failedItems: null })
        }

        if (itemType === 'participant') {
          setSelectedParticipantIds(new Set())
          fetchParticipants(participantPage, participantLimit, participantSearch, participantStatusFilter)
        } else if (itemType === 'trainer') {
          setSelectedTrainerIds(new Set())
          fetchTrainers(trainerPage, trainerLimit, trainerSearch)
        } else if (itemType === 'training') {
          setSelectedTrainingIds(new Set())
          fetchTrainings(trainingPage, trainingLimit, trainingSearch, trainingStatusFilter)
        } else if (itemType === 'program') {
          setSelectedProgramIds(new Set())
          fetchPrograms(programPage, programLimit, programSearch)
        } else if (itemType === 'course') {
          setSelectedCourseIds(new Set())
          fetchCourses(coursePage, courseLimit, courseSearch, courseStatusFilter)
        }
        fetchStats()
      } else {
        if (d.failed && d.failed.length > 0) {
          setBulkDeleteModal(prev => ({ ...prev, loading: false, failedItems: d.failed }))
        } else {
          showError(d.error || d.message || `Failed to delete ${itemType}s`)
          setBulkDeleteModal(prev => ({ ...prev, loading: false }))
        }
      }
    } catch (e) {
      showError(e.message || 'Server error bulk deleting records')
      setBulkDeleteModal(prev => ({ ...prev, loading: false }))
    }
  }

  // Debounced search effects for each tab
  useEffect(() => {
    if (tab === 'trainers') {
      const timer = setTimeout(() => {
        fetchTrainers(trainerPage, trainerLimit, trainerSearch)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [trainerSearch, trainerPage, trainerLimit, tab])

  useEffect(() => {
    if (tab === 'participants') {
      const timer = setTimeout(() => {
        fetchParticipants(participantPage, participantLimit, participantSearch, participantStatusFilter)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [participantSearch, participantStatusFilter, participantPage, participantLimit, tab])

  useEffect(() => {
    if (tab === 'trainings') {
      const timer = setTimeout(() => {
        fetchTrainings(trainingPage, trainingLimit, trainingSearch, trainingStatusFilter)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [trainingSearch, trainingStatusFilter, trainingPage, trainingLimit, tab])

  useEffect(() => {
    if (tab === 'programs') {
      const timer = setTimeout(() => {
        fetchPrograms(programPage, programLimit, programSearch)
        fetchCourses(coursePage, courseLimit, courseSearch, courseStatusFilter)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [programSearch, programPage, programLimit, courseSearch, courseStatusFilter, coursePage, courseLimit, tab])

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
          trainings={overviewTrainings.length > 0 ? overviewTrainings : trainings}
          participants={participants}
          trainers={trainers}
          pendingParticipants={pendingParticipants}
          adminReport={adminReport}
          summaryLoading={summaryLoading}
          loading={loading}
          onCreateTraining={() => handleTabChange('createTraining')}
          onAddTrainer={() => handleTabChange('createTrainer')}
          onAddParticipant={() => setAddParticipantModalOpen(true)}
          onViewPending={() => {
            setParticipantStatusFilter('PENDING');
            handleTabChange('participants');
          }}
          onApproveParticipant={handleApproveParticipant}
          onRejectParticipant={handleRejectParticipant}
          onRefresh={fetchAll}
        />
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
              <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
                <BookOpen size={26} color="#16A34A" />
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
            {/* Bulk Action Bar */}
            {selectedTrainingIds.size > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '10px',
                marginBottom: '14px',
                animation: 'fadeIn 0.2s ease-in-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                    {selectedTrainingIds.size}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                    {selectedTrainingIds.size} training session{selectedTrainingIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--secondary"
                    onClick={() => setSelectedTrainingIds(new Set())}
                    style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--danger"
                    onClick={() => openBulkDelete('training', Array.from(selectedTrainingIds))}
                    style={{ padding: '6px 14px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={14} /> Bulk Delete ({selectedTrainingIds.size})
                  </button>
                </div>
              </div>
            )}

            {/* Trainings Table */}
            {trainingsLoading ? (
              <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading trainings...</p></div>
            ) : trainings.length === 0 ? (
              <div className="reg-admin-empty"><BookOpen size={40} /><h3>No Trainings Found</h3><p>{trainingSearch || trainingStatusFilter !== 'ALL' ? 'No trainings match your current filter.' : 'Create your first training session to get started.'}</p>
                {!trainingSearch && trainingStatusFilter === 'ALL' && (
                  <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => handleTabChange('createTraining')}>+ Create Training</button>
                )}
              </div>
            ) : (() => {
              const displayTrainings = trainings.length > trainingLimit
                ? trainings.slice((trainingPage - 1) * trainingLimit, trainingPage * trainingLimit)
                : trainings;
              return (
                <div className="reg-admin-table-wrap">
                  <table className="reg-admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                          <input
                            type="checkbox"
                            aria-label="Select all trainings on this page"
                            checked={displayTrainings.length > 0 && displayTrainings.every(t => selectedTrainingIds.has(t.id))}
                            ref={el => {
                              if (el) {
                                const someSelected = displayTrainings.some(t => selectedTrainingIds.has(t.id));
                                const allSelected = displayTrainings.length > 0 && displayTrainings.every(t => selectedTrainingIds.has(t.id));
                                el.indeterminate = someSelected && !allSelected;
                              }
                            }}
                            onChange={() => handleSelectAllCurrentPage(displayTrainings, selectedTrainingIds, setSelectedTrainingIds)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                          />
                        </th>
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
                      {displayTrainings.map(t => {
                        const status = getTrainingStatus(t)
                        const sc = { ACTIVE: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }, UPCOMING: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, COMPLETED: { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' } }[status]
                        const isChecked = selectedTrainingIds.has(t.id)
                        return (
                          <tr key={t.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                            <td style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                              <input
                                type="checkbox"
                                aria-label={`Select training ${t.title}`}
                                checked={isChecked}
                                onChange={() => handleToggleSelect(t.id, setSelectedTrainingIds)}
                                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                              />
                            </td>
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
                                <button className="reg-admin-action" title="Leaderboard" style={{ color: '#16A34A' }} onClick={() => navigate(`/admin/trainings/${t.id}/leaderboard`)}><Trophy size={14} color="#16A34A" /></button>
                                <button className="reg-admin-action reg-admin-action--reject" title="Delete Training" onClick={() => handleDeleteTraining(t.id, t.title)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  <AdminPagination
                    page={trainingPage}
                    totalPages={trainingTotalPages}
                    totalItems={trainingTotal}
                    itemsPerPage={trainingLimit}
                    onPageChange={(p) => setTrainingPage(p)}
                    onLimitChange={(l) => { setTrainingLimit(l); setTrainingPage(1); }}
                    disabled={trainingsLoading}
                  />
                </div>
              );
            })()}
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
                      <button
                        className="reg-admin-btn reg-admin-btn--secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#16A34A', border: '1.5px solid #16A34A', background: '#FFFFFF', cursor: 'pointer' }}
                        onClick={() => {
                          const targetId = trainingDetailModal.id
                          setTrainingDetailModal(null)
                          navigate(`/admin/trainings/${targetId}/leaderboard`)
                        }}
                      >
                        <Trophy size={15} color="#16A34A" /> Leaderboard
                      </button>
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
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
              <Users size={26} color="#16A34A" />
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
          {/* Bulk Action Bar */}
          {selectedTrainerIds.size > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: '#f0fdf4',
              border: '1.5px solid #86efac',
              borderRadius: '10px',
              marginBottom: '14px',
              animation: 'fadeIn 0.2s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#16a34a',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700
                }}>
                  {selectedTrainerIds.size}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                  {selectedTrainerIds.size} trainer{selectedTrainerIds.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--secondary"
                  onClick={() => setSelectedTrainerIds(new Set())}
                  style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--danger"
                  onClick={() => openBulkDelete('trainer', Array.from(selectedTrainerIds))}
                  style={{ padding: '6px 14px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Trash2 size={14} /> Bulk Delete ({selectedTrainerIds.size})
                </button>
              </div>
            </div>
          )}

          {/* Trainers Table */}
          {trainersLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading trainers...</p></div>
          ) : trainers.length === 0 ? (
            <div className="reg-admin-empty"><User size={40} /><h3>No Trainers Found</h3><p>{trainerSearch ? 'No trainers match your search.' : 'Add your first trainer to get started.'}</p></div>
          ) : (() => {
            const displayTrainers = trainers.length > trainerLimit
              ? trainers.slice((trainerPage - 1) * trainerLimit, trainerPage * trainerLimit)
              : trainers;
            return (
              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                        <input
                          type="checkbox"
                          aria-label="Select all trainers on this page"
                          checked={displayTrainers.length > 0 && displayTrainers.every(t => selectedTrainerIds.has(t.id))}
                          ref={el => {
                            if (el) {
                              const someSelected = displayTrainers.some(t => selectedTrainerIds.has(t.id));
                              const allSelected = displayTrainers.length > 0 && displayTrainers.every(t => selectedTrainerIds.has(t.id));
                              el.indeterminate = someSelected && !allSelected;
                            }
                          }}
                          onChange={() => handleSelectAllCurrentPage(displayTrainers, selectedTrainerIds, setSelectedTrainerIds)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                        />
                      </th>
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
                    {displayTrainers.map(trainer => {
                      const empId = trainer.employeeId || trainer.employee_id || trainer.profile?.employeeId || trainer.profile?.employee_id || ''
                      const exp = trainer.experience || trainer.profile?.experience || ''
                      const phone = trainer.profile?.phone || trainer.phone || ''
                      const hasProfile = trainer.profile && (phone || trainer.profile.dob || trainer.profile.qualification || exp)
                      const isChecked = selectedTrainerIds.has(trainer.id)

                      return (
                        <tr key={trainer.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                          <td style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                            <input
                              type="checkbox"
                              aria-label={`Select trainer ${trainer.name}`}
                              checked={isChecked}
                              onChange={() => handleToggleSelect(trainer.id, setSelectedTrainerIds)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                            />
                          </td>
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

                {/* Pagination */}
                <AdminPagination
                  page={trainerPage}
                  totalPages={trainerTotalPages}
                  totalItems={trainerTotal}
                  itemsPerPage={trainerLimit}
                  onPageChange={(p) => setTrainerPage(p)}
                  onLimitChange={(l) => { setTrainerLimit(l); setTrainerPage(1); }}
                  disabled={trainersLoading}
                />
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* ── PARTICIPANTS ── */}
      {tab === 'participants' && (
        <motion.div variants={itemVariants} className="reg-admin">
          {/* Header */}
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
              <Users size={26} color="#16A34A" />
            </div>
            <div>
              <h2 className="reg-admin-title">Participants</h2>
              <p className="reg-admin-subtitle">View and manage participant accounts, status, and enrollments</p>
            </div>
            <div style={{ flex: 1 }} />
            <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => setAddParticipantModalOpen(true)}>
              <Plus size={16} /> Add Participant
            </button>
          </div>
          {/* Stats */}
          <div className="reg-admin-stats">
            {[
              { label: 'Total', value: stats.totalParticipants ?? participantTotal, icon: Users, color: '#6366f1' },
              { label: 'Approved', value: stats.approvedParticipants ?? participants.filter(p => (p.status || '').toUpperCase() === 'APPROVED').length, icon: CheckCircle2, color: '#16A34A' },
              { label: 'Pending', value: stats.pendingParticipants ?? participants.filter(p => (p.status || '').toUpperCase() === 'PENDING').length, icon: Clock, color: '#F59E0B' },
              { label: 'Rejected', value: stats.rejectedParticipants ?? participants.filter(p => (p.status || '').toUpperCase() === 'REJECTED').length, icon: XCircle, color: '#dc2626' },
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
                    onClick={() => { setParticipantStatusFilter(f); setParticipantPage(1); }}>
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                    {count > 0 && <span className="reg-admin-badge">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Bulk Action Bar */}
          {selectedParticipantIds.size > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: '#f0fdf4',
              border: '1.5px solid #86efac',
              borderRadius: '10px',
              marginBottom: '14px',
              animation: 'fadeIn 0.2s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#16a34a',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700
                }}>
                  {selectedParticipantIds.size}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                  {selectedParticipantIds.size} participant{selectedParticipantIds.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--secondary"
                  onClick={() => setSelectedParticipantIds(new Set())}
                  style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--danger"
                  onClick={() => openBulkDelete('participant', Array.from(selectedParticipantIds))}
                  style={{ padding: '6px 14px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Trash2 size={14} /> Bulk Delete ({selectedParticipantIds.size})
                </button>
              </div>
            </div>
          )}

          {/* Participants Table */}
          {participantsLoading ? (
            <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading participants...</p></div>
          ) : participants.length === 0 ? (
            <div className="reg-admin-empty"><Users size={40} /><h3>No Participants Found</h3><p>{participantSearch || participantStatusFilter !== 'ALL' ? 'No participants match your current filter.' : 'Invite your first learner to get started.'}</p></div>
          ) : (() => {
            const displayParticipants = participants.length > participantLimit
              ? participants.slice((participantPage - 1) * participantLimit, participantPage * participantLimit)
              : participants;
            return (
              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                        <input
                          type="checkbox"
                          aria-label="Select all participants on this page"
                          checked={displayParticipants.length > 0 && displayParticipants.every(p => selectedParticipantIds.has(p.id))}
                          ref={el => {
                            if (el) {
                              const someSelected = displayParticipants.some(p => selectedParticipantIds.has(p.id));
                              const allSelected = displayParticipants.length > 0 && displayParticipants.every(p => selectedParticipantIds.has(p.id));
                              el.indeterminate = someSelected && !allSelected;
                            }
                          }}
                          onChange={() => handleSelectAllCurrentPage(displayParticipants, selectedParticipantIds, setSelectedParticipantIds)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                        />
                      </th>
                      <th>Participant</th>
                      <th>Status</th>
                      <th>Enrolled</th>
                      <th>Progress</th>
                      <th>Quiz</th>
                      <th style={{ minWidth: 190, textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayParticipants.map(p => {
                      const sc = { PENDING: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, APPROVED: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }, REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' } }[(p.status || 'PENDING').toUpperCase()] || { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' }
                      const isChecked = selectedParticipantIds.has(p.id)
                      return (
                        <tr key={p.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                          <td style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                            <input
                              type="checkbox"
                              aria-label={`Select participant ${p.name}`}
                              checked={isChecked}
                              onChange={() => handleToggleSelect(p.id, setSelectedParticipantIds)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                            />
                          </td>
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
                              {/* 1. View Participant Profile */}
                              <button
                                type="button"
                                className="reg-admin-action reg-admin-action--view"
                                title="View participant profile"
                                aria-label="View participant profile"
                                onClick={() => setViewingParticipant(p)}
                              >
                                <Eye size={16} />
                              </button>

                              {/* 3. Direct Approve & Reject Actions (Only for PENDING status) */}
                              {String(p.status || 'PENDING').toUpperCase() === 'PENDING' && (
                                <>
                                  <button
                                    type="button"
                                    className="reg-admin-action reg-admin-action--approve-direct"
                                    title="Approve participant"
                                    aria-label="Approve participant"
                                    onClick={() => handleApproveParticipant(p.id)}
                                  >
                                    <Check size={18} strokeWidth={2.6} />
                                  </button>
                                  <button
                                    type="button"
                                    className="reg-admin-action reg-admin-action--reject"
                                    title="Reject participant"
                                    aria-label="Reject participant"
                                    onClick={() => handleRejectParticipant(p.id)}
                                  >
                                    <X size={16} />
                                  </button>
                                </>
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

                {/* Pagination */}
                <AdminPagination
                  page={participantPage}
                  totalPages={participantTotalPages}
                  totalItems={participantTotal}
                  itemsPerPage={participantLimit}
                  onPageChange={(p) => setParticipantPage(p)}
                  onLimitChange={(l) => { setParticipantLimit(l); setParticipantPage(1); }}
                  disabled={participantsLoading}
                />
              </div>
            );
          })()}
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
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
              <MessageSquare size={22} color="#16A34A" />
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
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
              <ClipboardList size={22} color="#16A34A" />
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
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
              <MessageSquare size={22} color="#16A34A" />
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
            {loading ? (
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
            onBack={() => handleTabChange('trainings')}
            token={user?.token}
            trainersLoading={trainersLoading}
            trainersError={trainersError}
            onRetryTrainers={() => fetchTrainers(1, 200, '')}
          />
        </motion.div>
      )}

      {/* ── PROGRAMS & COURSES ── */}
      {tab === 'programs' && (
        <motion.div variants={itemVariants} className="reg-admin">
          {/* Header */}
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
              <ClipboardList size={22} color="#16A34A" />
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
          {/* Programs Section */}
          <div className="reg-admin-table-wrap" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Training Programs ({programTotal || programs.length})</span>
                <div className="reg-admin-search" style={{ maxWidth: 280, margin: 0 }}>
                  <Search size={15} />
                  <input
                    value={programSearch}
                    onChange={e => setProgramSearch(e.target.value)}
                    placeholder="Search programs..."
                    style={{ fontSize: 13, padding: '6px 10px 6px 30px' }}
                  />
                </div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--primary" style={{ fontSize: 12 }} onClick={() => document.getElementById('create-program-form')?.scrollIntoView({ behavior: 'smooth' })}>+ New Program</button>
            </div>

            {/* Bulk Action Bar for Programs */}
            {selectedProgramIds.size > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: '#f0fdf4',
                borderBottom: '1.5px solid #86efac',
                animation: 'fadeIn 0.2s ease-in-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                    {selectedProgramIds.size}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                    {selectedProgramIds.size} program{selectedProgramIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--secondary"
                    onClick={() => setSelectedProgramIds(new Set())}
                    style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--danger"
                    onClick={() => openBulkDelete('program', Array.from(selectedProgramIds))}
                    style={{ padding: '6px 14px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={14} /> Bulk Delete ({selectedProgramIds.size})
                  </button>
                </div>
              </div>
            )}

            {programsLoading ? (
              <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading programs...</p></div>
            ) : programs.length === 0 ? (
              <div className="reg-admin-empty" style={{ padding: 32 }}><ClipboardList size={32} /><p>{programSearch ? 'No programs match your search.' : 'No programs created yet.'}</p></div>
            ) : (() => {
              const displayPrograms = programs.length > programLimit
                ? programs.slice((programPage - 1) * programLimit, programPage * programLimit)
                : programs;
              return (
                <>
                  <table className="reg-admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                          <input
                            type="checkbox"
                            aria-label="Select all programs on this page"
                            checked={displayPrograms.length > 0 && displayPrograms.every(p => selectedProgramIds.has(p.id))}
                            ref={el => {
                              if (el) {
                                const someSelected = displayPrograms.some(p => selectedProgramIds.has(p.id));
                                const allSelected = displayPrograms.length > 0 && displayPrograms.every(p => selectedProgramIds.has(p.id));
                                el.indeterminate = someSelected && !allSelected;
                              }
                            }}
                            onChange={() => handleSelectAllCurrentPage(displayPrograms, selectedProgramIds, setSelectedProgramIds)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                          />
                        </th>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Courses</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPrograms.map(p => {
                        const isChecked = selectedProgramIds.has(p.id);
                        return (
                          <tr key={p.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                            <td style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                              <input
                                type="checkbox"
                                aria-label={`Select program ${p.title}`}
                                checked={isChecked}
                                onChange={() => handleToggleSelect(p.id, setSelectedProgramIds)}
                                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                              />
                            </td>
                            <td><span className="reg-admin-name">{p.title}</span></td>
                            <td className="reg-admin-date" style={{ maxWidth: 260 }}>{(p.description || '—').slice(0, 80)}</td>
                            <td style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{p.courseCount ?? p.coursesCount ?? 0}</td>
                            <td>
                              <div className="reg-admin-actions">
                                <button className="reg-admin-action reg-admin-action--reject" title="Delete Program" onClick={() => handleDeleteProgram(p.id, p.title)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Programs Pagination */}
                  <AdminPagination
                    page={programPage}
                    totalPages={programTotalPages}
                    totalItems={programTotal}
                    itemsPerPage={programLimit}
                    onPageChange={(p) => setProgramPage(p)}
                    onLimitChange={(l) => { setProgramLimit(l); setProgramPage(1); }}
                    disabled={programsLoading}
                  />
                </>
              );
            })()}
          </div>

          {/* Courses Section */}
          <div className="reg-admin-table-wrap" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Courses ({courseTotal || courses.length})</span>
                <div className="reg-admin-search" style={{ maxWidth: 260, margin: 0 }}>
                  <Search size={15} />
                  <input
                    value={courseSearch}
                    onChange={e => setCourseSearch(e.target.value)}
                    placeholder="Search courses..."
                    style={{ fontSize: 13, padding: '6px 10px 6px 30px' }}
                  />
                </div>
                <div className="reg-admin-filter-tabs" style={{ margin: 0 }}>
                  {['ALL', 'ACTIVE', 'INACTIVE'].map(st => (
                    <button
                      key={st}
                      type="button"
                      className={`reg-admin-filter-tab ${courseStatusFilter === st ? 'reg-admin-filter-tab--active' : ''}`}
                      onClick={() => { setCourseStatusFilter(st); setCoursePage(1); }}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                    >
                      {st === 'ALL' ? 'All Status' : st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button className="reg-admin-btn reg-admin-btn--primary" style={{ fontSize: 12 }} onClick={() => document.getElementById('create-course-form')?.scrollIntoView({ behavior: 'smooth' })}>+ New Course</button>
            </div>

            {/* Bulk Action Bar for Courses */}
            {selectedCourseIds.size > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: '#f0fdf4',
                borderBottom: '1.5px solid #86efac',
                animation: 'fadeIn 0.2s ease-in-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                    {selectedCourseIds.size}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                    {selectedCourseIds.size} course{selectedCourseIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--secondary"
                    onClick={() => setSelectedCourseIds(new Set())}
                    style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    className="reg-admin-btn reg-admin-btn--danger"
                    onClick={() => openBulkDelete('course', Array.from(selectedCourseIds))}
                    style={{ padding: '6px 14px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={14} /> Bulk Delete ({selectedCourseIds.size})
                  </button>
                </div>
              </div>
            )}

            {coursesLoading ? (
              <div className="reg-admin-loading"><Loader2 size={24} className="bulk-spin" /><p>Loading courses...</p></div>
            ) : courses.length === 0 ? (
              <div className="reg-admin-empty" style={{ padding: 32 }}><Users size={32} /><p>{courseSearch || courseStatusFilter !== 'ALL' ? 'No courses match your current filter.' : 'No courses created yet.'}</p></div>
            ) : (() => {
              const displayCourses = courses.length > courseLimit
                ? courses.slice((coursePage - 1) * courseLimit, coursePage * courseLimit)
                : courses;
              return (
                <>
                  <table className="reg-admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                          <input
                            type="checkbox"
                            aria-label="Select all courses on this page"
                            checked={displayCourses.length > 0 && displayCourses.every(c => selectedCourseIds.has(c.id))}
                            ref={el => {
                              if (el) {
                                const someSelected = displayCourses.some(c => selectedCourseIds.has(c.id));
                                const allSelected = displayCourses.length > 0 && displayCourses.every(c => selectedCourseIds.has(c.id));
                                el.indeterminate = someSelected && !allSelected;
                              }
                            }}
                            onChange={() => handleSelectAllCurrentPage(displayCourses, selectedCourseIds, setSelectedCourseIds)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                          />
                        </th>
                        <th>Title</th>
                        <th>Program</th>
                        <th>Trainer</th>
                        <th>Progress</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCourses.map(c => {
                        const isChecked = selectedCourseIds.has(c.id);
                        const pct = c.structureProgress?.completionPercentage ?? c.completionPercentage ?? 0;
                        const total = c.structureProgress?.totalStructureItems ?? c.totalStructureItems ?? 0;
                        const completed = c.structureProgress?.completedStructureItems ?? c.completedStructureItems ?? 0;

                        return (
                          <tr key={c.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                            <td style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                              <input
                                type="checkbox"
                                aria-label={`Select course ${c.title}`}
                                checked={isChecked}
                                onChange={() => handleToggleSelect(c.id, setSelectedCourseIds)}
                                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                              />
                            </td>
                            <td><span className="reg-admin-name">{c.title}</span></td>
                            <td className="reg-admin-date">{c.programTitle || c.program?.title || '—'}</td>
                            <td className="reg-admin-date">{c.trainerName || c.trainer?.name || 'Unassigned'}</td>
                            <td style={{ minWidth: 120 }}>
                              {total === 0 ? (
                                <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>0% (No structure)</span>
                              ) : (
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, fontWeight: 600 }}>
                                    <span style={{ color: pct === 100 ? '#15803d' : '#0f766e' }}>{pct}%</span>
                                    <span style={{ color: '#64748b' }}>{completed}/{total}</span>
                                  </div>
                                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 9999, overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${Math.min(100, Math.max(0, pct))}%`,
                                      background: pct === 100 ? '#16a34a' : pct >= 50 ? '#0d9488' : '#3b82f6',
                                      borderRadius: 9999,
                                      transition: 'width 0.3s'
                                    }} />
                                  </div>
                                </div>
                              )}
                            </td>
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
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Courses Pagination */}
                  <AdminPagination
                    page={coursePage}
                    totalPages={courseTotalPages}
                    totalItems={courseTotal}
                    itemsPerPage={courseLimit}
                    onPageChange={(p) => setCoursePage(p)}
                    onLimitChange={(l) => { setCourseLimit(l); setCoursePage(1); }}
                    disabled={coursesLoading}
                  />
                </>
              );
            })()}
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

      {/* ── ATTENDANCE CENTER ── */}
      {tab === 'attendance' && (
        <motion.div variants={itemVariants}>
          <AdminAttendanceAnalytics user={user} />
        </motion.div>
      )}

      {/* ── FEEDBACK & SENTIMENT ── */}
      {tab === 'feedback' && (
        <motion.div variants={itemVariants}>
          <AdminFeedbackAnalytics user={user} />
        </motion.div>
      )}

      {/* ── REPORTS & ANALYTICS ── */}
      {tab === 'reports' && (
        <motion.div variants={itemVariants} className="reg-admin">
          <div className="reg-admin-header">
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', color: '#16A34A' }}>
              <TrendingUp size={22} color="#16A34A" />
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
          status: viewingParticipant.status,
          createdAt: viewingParticipant.created_at || viewingParticipant.joinedAt,
        } : null}
        onClose={() => setViewingParticipant(null)}
        onApprove={(id) => {
          handleApproveParticipant(id);
          setViewingParticipant(null);
        }}
        onReject={(id) => {
          handleRejectParticipant(id);
          setViewingParticipant(null);
        }}
        onDelete={(id, name) => handleDeleteParticipant(id, name)}
      />

      {/* ── CREATE PARTICIPANT MODAL ── */}
      <CreateParticipantModal
        open={addParticipantModalOpen}
        onClose={() => setAddParticipantModalOpen(false)}
        onParticipantCreated={() => fetchAll()}
        token={user?.token}
      />

      {/* ── BULK DELETE CONFIRM MODAL ── */}
      <BulkDeleteConfirmModal
        open={bulkDeleteModal.open}
        itemType={bulkDeleteModal.itemType}
        count={bulkDeleteModal.count}
        loading={bulkDeleteModal.loading}
        failedItems={bulkDeleteModal.failedItems}
        onClose={() => setBulkDeleteModal({ open: false, itemType: '', count: 0, ids: [], loading: false, failedItems: null })}
        onConfirm={handleExecuteBulkDelete}
        onClearFailed={() => setBulkDeleteModal(prev => ({ ...prev, failedItems: null }))}
      />
    </motion.div>
  )
}

export default AdminDashboard
