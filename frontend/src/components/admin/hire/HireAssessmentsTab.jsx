import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, CheckCircle2, Clock3, Code2, Download, Eye,
  FileQuestion, Loader2, Plus, RefreshCw, Search, Send, Upload, Users, X,
  ShieldCheck, Volume2, Trash2, Edit2, MoreVertical, ExternalLink,
  AlertTriangle, Shield, Check, FileCode, CheckCircle, XCircle,
  Ban, RotateCcw, Timer, UserCheck, HelpCircle
} from 'lucide-react'
import { API_BASE, BACKEND_ORIGIN } from '../../../api/api'
import hiringService from '../../../services/hiringService'
import { useToast } from '../../Toast'
import BulkDeleteConfirmModal from '../BulkDeleteConfirmModal'
import '../../../styles/admin-sessions.css'

const emptyForm = { title: '', jobRole: '', assessmentType: 'QUIZ', description: '', durationMinutes: 60, passingScore: 60 }

function MenuItem({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 14px',
        background: 'none',
        border: 'none',
        fontSize: 13,
        color: danger ? '#DC2626' : '#334155',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#F8FAFC' }}
      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
      disabled={disabled}
      onClick={onClick}
    >
      {icon} {label}
    </button>
  )
}

const statusTone = {
  DRAFT:       { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: 'Draft' },
  PUBLISHED:   { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', label: 'Published' },
  ASSIGNED:    { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'Assigned' },
  IN_PROGRESS: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'In Progress' },
  COMPLETED:   { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Completed' },
  EVALUATED:   { bg: '#FAF5FF', color: '#6D28D9', border: '#E9D5FF', label: 'Evaluated' },
  CLOSED:      { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0', label: 'Closed' },
  EXPIRED:     { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', label: 'Expired' },
}

function StatusBadge({ value }) {
  const norm = String(value || 'DRAFT').toUpperCase()
  const style = statusTone[norm] || statusTone.DRAFT
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 650,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        letterSpacing: '0.2px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.color }} />
      {style.label || norm.replaceAll('_', ' ')}
    </span>
  )
}

function Modal({ children, onClose, maxWidth = 580 }) {
  return (
    <div className="reg-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="reg-modal" style={{ maxWidth, width: 'min(100%, calc(100vw - 32px))' }}>
        {children}
      </div>
    </div>
  )
}

export default function HireAssessmentsTab({ user }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const uploadRef = useRef(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [detailError, setDetailError] = useState('')
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const activeControllerRef = useRef(null)
  const [retryCount, setRetryCount] = useState(0)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState(new Set())
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(new Set())
  const [bulkDeleteModal, setBulkDeleteModal] = useState({
    open: false,
    itemType: 'assessment',
    title: '',
    count: 0,
    ids: [],
    loading: false,
    failedItems: null,
  })
  const [candidateToDelete, setCandidateToDelete] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [candidateFilter, setCandidateFilter] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [policyDraft, setPolicyDraft] = useState(null)
  const [proctoringReview, setProctoringReview] = useState(null)
  const [reviewError, setReviewError] = useState('')
  const [activeMenuId, setActiveMenuId] = useState(null)

  // Close 3-dot dropdown on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest('[data-hire-menu]')) {
        setActiveMenuId(null)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const load = useCallback(async () => {
    const request = ++listRequest.current
    setLoading(true)
    setLoadError('')
    try {
      const response = await hiringService.listAssessments({ search, type, limit: 100 })
      if (request === listRequest.current) setItems(response.assessments || [])
    } catch (error) {
      if (request === listRequest.current) setLoadError(error.message || 'Could not load hiring assessments')
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }, [search, type])

  useEffect(() => {
    const timer = setTimeout(load, 180)
    return () => { clearTimeout(timer); listRequest.current += 1 }
  }, [load])

  useEffect(() => () => {
    detailRequest.current += 1
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
    }
  }, [])

  const stats = useMemo(() => ({
    total: items.length,
    published: items.filter((item) => item.engine_status === 'PUBLISHED').length,
    assigned: items.reduce((sum, item) => sum + Number(item.assigned_count || 0), 0),
    active: items.reduce((sum, item) => sum + Number(item.in_progress_count || 0), 0),
    pending: items.reduce((sum, item) => sum + Number(item.pending_candidates || 0), 0),
  }), [items])

  const openDetail = useCallback((item) => {
    if (!item?.id) return
    const id = Number(item.id)
    if (!Number.isFinite(id) || id <= 0) return
    setSelected(prev => (prev && Number(prev.id) === id ? prev : { ...item, id }))
    setDetailError('')
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('selectedId', String(id))
      next.delete('assessmentId')
      return next
    })
    setRetryCount(c => c + 1)
  }, [setSearchParams])

  const handleBackToList = useCallback(() => {
    detailRequest.current += 1
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
    }
    setSelected(null)
    setCandidates([])
    setSelectedCandidateIds(new Set())
    setDetailLoading(false)
    setDetailError('')
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('selectedId')
      next.delete('assessmentId')
      return next
    })
  }, [setSearchParams])

  // Single-source-of-truth workflow loader driven by searchParams
  useEffect(() => {
    const rawId = searchParams.get('selectedId') || searchParams.get('assessmentId')
    if (!rawId) {
      setSelected(null)
      setCandidates([])
      setDetailLoading(false)
      setDetailError('')
      return
    }

    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) {
      setDetailError('Invalid assessment ID specified in URL.')
      setDetailLoading(false)
      setSelected(null)
      return
    }

    let isMounted = true
    const request = ++detailRequest.current
    const controller = new AbortController()
    activeControllerRef.current = controller

    const loadAssessment = async () => {
      setDetailLoading(true)
      setDetailError('')

      try {
        const [workflowRes, candidatesRes] = await Promise.allSettled([
          hiringService.getAssessment(id, { signal: controller.signal }),
          hiringService.listCandidates(id, {}, { signal: controller.signal })
        ])

        if (!isMounted || controller.signal.aborted || request !== detailRequest.current) {
          return
        }

        if (workflowRes.status === 'rejected') {
          const err = workflowRes.reason
          if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('cancelled')) {
            return
          }
          throw err
        }

        const workflowData = workflowRes.value?.assessment
        if (!workflowData) {
          throw new Error('Hiring assessment not found.')
        }

        setSelected({
          ...workflowData,
          id: Number(workflowData.id),
          quiz_id: workflowData.quiz_id ? Number(workflowData.quiz_id) : null,
          coding_assessment_id: workflowData.coding_assessment_id ? Number(workflowData.coding_assessment_id) : null,
        })
        setPolicyDraft(workflowData.proctoring_config || null)

        if (candidatesRes.status === 'fulfilled') {
          setCandidates(candidatesRes.value?.candidates || [])
        } else {
          console.warn('[Hire Assessment] Candidates list non-fatal warning:', candidatesRes.reason)
          setCandidates([])
        }
      } catch (err) {
        if (!isMounted || controller.signal.aborted || request !== detailRequest.current) {
          return
        }
        if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('cancelled')) {
          return
        }
        console.error('[Hire Assessment] Failed to load assessment workflow:', err)
        setDetailError(err?.message || 'Unable to load this assessment.')
      } finally {
        if (isMounted && request === detailRequest.current) {
          setDetailLoading(false)
        }
      }
    }

    loadAssessment()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [searchParams, retryCount])

  const create = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) return toast.error('Enter an assessment title')
    setSaving(true)
    try {
      const response = await hiringService.createAssessment(form)
      toast.success('Hiring assessment created')
      setShowCreate(false)
      setForm(emptyForm)
      await load()
      if (response.assessment) await openDetail(response.assessment)
    } catch (error) {
      toast.error(error.message || 'Could not create assessment')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item) => {
    setEditItem({
      id: item.id,
      title: item.title || '',
      jobRole: item.hiring_role || item.jobRole || '',
      description: item.description || '',
      durationMinutes: item.duration_minutes || 60,
      passingScore: item.passing_score || 60,
    })
    setActiveMenuId(null)
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editItem.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      await hiringService.updateAssessment(editItem.id, {
        ...editItem,
        hiringRole: editItem.jobRole,
        jobRole: editItem.jobRole,
      })
      toast.success('Assessment updated')
      setEditItem(null)
      await load()
      if (selected && Number(selected.id) === Number(editItem.id)) {
        setRetryCount(c => c + 1)
      }
    } catch (error) {
      toast.error(error.message || 'Could not update assessment')
    } finally {
      setSaving(false)
    }
  }

  const openBulkDelete = (ids, customTitle = '') => {
    if (!ids || ids.length === 0) return
    setActiveMenuId(null)
    setBulkDeleteModal({
      open: true,
      itemType: 'assessment',
      title: customTitle || (ids.length === 1 ? 'Delete Assessment?' : `Delete ${ids.length} Selected Assessments?`),
      count: ids.length,
      ids,
      loading: false,
      failedItems: null,
    })
  }

  const handleExecuteBulkDelete = async (force = false, overrideIds = null) => {
    const { ids: modalIds } = bulkDeleteModal
    const ids = (overrideIds && overrideIds.length > 0) ? overrideIds : modalIds
    if (!ids || ids.length === 0) return

    setBulkDeleteModal(prev => ({ ...prev, loading: true }))
    try {
      const res = await hiringService.bulkDeleteAssessments(ids, force)
      const data = res.data || res

      if (data.success) {
        if (data.failed && data.failed.length > 0) {
          toast.warning(`Deleted ${data.summary?.deleted || 0} assessment(s). ${data.failed.length} item(s) protected.`)
          setBulkDeleteModal(prev => ({
            ...prev,
            loading: false,
            failedItems: data.failed,
            ids: data.failed.map(f => f.id),
            count: data.failed.length,
          }))
        } else {
          toast.success(`Successfully ${force ? 'force deleted' : 'deleted'} ${data.summary?.deleted || ids.length} assessment(s).`)
          setBulkDeleteModal({ open: false, itemType: 'assessment', title: '', count: 0, ids: [], loading: false, failedItems: null })
        }
        setSelectedAssessmentIds(new Set())
        if (selected && ids.map(Number).includes(Number(selected.id))) {
          handleBackToList()
        }
        await load()
      } else {
        if (data.failed && data.failed.length > 0) {
          setBulkDeleteModal(prev => ({ ...prev, loading: false, failedItems: data.failed }))
        } else {
          toast.error(data.error || 'Failed to delete assessment(s)')
          setBulkDeleteModal(prev => ({ ...prev, loading: false }))
        }
      }
    } catch (err) {
      toast.error(err.message || 'Error deleting assessment(s)')
      setBulkDeleteModal(prev => ({ ...prev, loading: false }))
    }
  }

  const handleToggleSelectAssessment = (id) => {
    setSelectedAssessmentIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllAssessments = () => {
    const currentIds = items.map(item => item.id)
    const allSelected = currentIds.length > 0 && currentIds.every(id => selectedAssessmentIds.has(id))
    setSelectedAssessmentIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        currentIds.forEach(id => next.delete(id))
      } else {
        currentIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleToggleSelectCandidate = (id) => {
    setSelectedCandidateIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllCandidates = () => {
    const currentIds = filteredCandidates.map(c => c.id)
    const allSelected = currentIds.length > 0 && currentIds.every(id => selectedCandidateIds.has(id))
    setSelectedCandidateIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        currentIds.forEach(id => next.delete(id))
      } else {
        currentIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleBulkAssignCandidates = async () => {
    const ids = Array.from(selectedCandidateIds)
    if (!ids.length) return
    setBusy('bulk-assign')
    try {
      await hiringService.assignCandidates(selected.id, ids)
      toast.success(`Candidate assignments updated`)
      setSelectedCandidateIds(new Set())
      setRetryCount(c => c + 1)
      await load()
    } catch (err) {
      toast.error(err.message || 'Could not assign candidates')
    } finally {
      setBusy('')
    }
  }

  const handleBulkRemoveCandidates = async () => {
    const ids = Array.from(selectedCandidateIds)
    if (!ids.length) return
    setBusy('bulk-remove-candidates')
    try {
      await Promise.all(ids.map(cid => hiringService.removeCandidate(selected.id, cid).catch(() => null)))
      toast.success(`Removed ${ids.length} candidate(s)`)
      setSelectedCandidateIds(new Set())
      setRetryCount(c => c + 1)
      await load()
    } catch (err) {
      toast.error(err.message || 'Could not remove candidates')
    } finally {
      setBusy('')
    }
  }

  const handleOpenQuiz = async (item = selected, isCreate = false) => {
    if (busy) return
    const itemId = Number(item?.id)
    let quizId = item?.quiz_id ? Number(item.quiz_id) : null
    if (!quizId) {
      setBusy('create-quiz')
      try {
        const res = await hiringService.ensureQuiz(itemId)
        quizId = Number(res.quizId || res.quiz?.id)
        toast.success('Quiz linked to Hire assessment')
        if (selected && Number(selected.id) === itemId) {
          setRetryCount(c => c + 1)
        }
        await load()
      } catch (err) {
        toast.error(err.message || 'Could not initialize quiz')
        setBusy('')
        return
      } finally {
        setBusy('')
      }
    }
    if (!quizId) return toast.error('Quiz content is unavailable')
    const actionQuery = isCreate ? '&tab=questions&action=create' : ''
    navigate(`/trainer/quiz/${quizId}?from=hire&hireId=${itemId}&hireTitle=${encodeURIComponent(item.title || '')}${actionQuery}`)
  }

  const handleOpenCoding = async (item = selected, isCreate = false) => {
    if (busy) return
    const itemId = Number(item?.id)
    let codingId = item?.coding_assessment_id ? Number(item.coding_assessment_id) : null
    if (!codingId) {
      setBusy('create-coding')
      try {
        const res = await hiringService.ensureCoding(itemId)
        codingId = Number(res.assessmentId || res.codingAssessment?.id)
        toast.success('Coding test linked to Hire assessment')
        if (selected && Number(selected.id) === itemId) {
          setRetryCount(c => c + 1)
        }
        await load()
      } catch (err) {
        toast.error(err.message || 'Could not initialize coding test')
        setBusy('')
        return
      } finally {
        setBusy('')
      }
    }
    if (!codingId) return toast.error('Coding content is unavailable')
    const actionQuery = isCreate ? '&tab=problems&action=create' : ''
    navigate(`/trainer/coding/${codingId}?from=hire&hireId=${itemId}&hireTitle=${encodeURIComponent(item.title || '')}${actionQuery}`)
  }

  const manageContent = (item = selected) => {
    const itemId = Number(item?.id)
    const id = Number(item?.engine_id || (item?.assessment_type === 'CODING' ? item?.coding_assessment_id : item?.quiz_id))
    if (!id) return toast.error('Shared assessment content is unavailable')
    navigate(item.assessment_type === 'CODING'
      ? `/trainer/coding/${id}?from=hire&hireId=${itemId}&hireTitle=${encodeURIComponent(item.title || '')}`
      : `/trainer/quiz/${id}?from=hire&hireId=${itemId}&hireTitle=${encodeURIComponent(item.title || '')}`)
  }

  const publish = async (target = selected) => {
    // Guard: require at least one candidate before publishing
    const candidateCount = Number(
      target?.candidate_count ??
      target?.assigned_count ??
      target?.metrics?.candidate_count ??
      0
    )
    if (candidateCount === 0) {
      toast.error('Cannot publish: No candidates have been added or assigned. Please add participants before publishing.')
      return
    }
    setBusy('publish')
    try {
      await hiringService.publishAssessment(target.id)
      toast.success('Assessment published')
      if (selected) setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Publish failed')
    } finally {
      setBusy('')
    }
  }

  const closeAssessment = async (target = selected) => {
    setBusy('close')
    try {
      await hiringService.closeAssessment(target.id)
      toast.success('Assessment closed')
      if (selected) setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Close failed')
    } finally {
      setBusy('')
    }
  }

  const uploadCsv = async (file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setBusy('upload')
    try {
      const response = await hiringService.uploadCandidatesCsv(selected.id, formData)
      const summary = response.summary || {}
      toast.success(`${summary.registeredAndAssigned || 0} registered candidate(s) assigned; ${summary.unregistered || 0} pending`)
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'CSV upload failed')
    } finally {
      setBusy('')
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  const recheck = async () => {
    setBusy('recheck')
    try {
      const response = await hiringService.recheckRegistration(selected.id)
      toast.success(`${response.newlyAssigned || 0} newly registered candidate(s) assigned`)
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Registration check failed')
    } finally {
      setBusy('')
    }
  }

  const toggle = async (candidate) => {
    setBusy(`candidate-${candidate.id}`)
    try {
      await hiringService.toggleAssignCandidate(selected.id, candidate.id)
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not update assignment')
    } finally {
      setBusy('')
    }
  }

  const removeCandidate = async () => {
    if (!candidateToDelete) return
    setBusy(`delete-candidate-${candidateToDelete.id}`)
    try {
      await hiringService.removeCandidate(selected.id, candidateToDelete.id)
      toast.success('Candidate removed')
      setCandidateToDelete(null)
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not remove candidate')
    } finally {
      setBusy('')
    }
  }

  const revokeCandidate = async (candidate) => {
    const go = window.confirm(
      `Revoke the hiring assignment for ${candidate.full_name || candidate.email}? The candidate will immediately lose access to the assessment.`,
    )
    if (!go) return
    setBusy(`revoke-${candidate.id}`)
    try {
      await hiringService.revokeCandidate(selected.id, candidate.id)
      toast.success('Assignment revoked — candidate access removed')
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not revoke assignment')
    } finally {
      setBusy('')
    }
  }

  const reassignCandidate = async (candidate) => {
    setBusy(`reassign-${candidate.id}`)
    try {
      await hiringService.reassignCandidate(selected.id, candidate.id)
      toast.success('Candidate reassigned')
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not reassign candidate')
    } finally {
      setBusy('')
    }
  }

  const resetAttempt = async (candidate) => {
    const go = window.confirm(
      `Reset the attempt for ${candidate.full_name || candidate.email}? The previous attempt and its answers will be deleted so they can start fresh.`,
    )
    if (!go) return
    setBusy(`reset-${candidate.id}`)
    try {
      await hiringService.resetCandidateAttempt(selected.id, candidate.id)
      toast.success('Attempt reset — candidate can start fresh')
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not reset attempt')
    } finally {
      setBusy('')
    }
  }

  const extendTime = async (candidate) => {
    const minutes = window.prompt(`Extra minutes to grant ${candidate.full_name || candidate.email}:`, '15')
    if (!minutes) return
    setBusy(`extend-${candidate.id}`)
    try {
      const result = await hiringService.extendCandidateTime(selected.id, candidate.id, Number(minutes))
      toast.success(`Extended by ${result.extendedMinutes || minutes} minutes`)
      setRetryCount(c => c + 1)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not extend time')
    } finally {
      setBusy('')
    }
  }

  const exportPending = async () => {
    setBusy('export')
    try {
      const response = await fetch(`${API_BASE}/hire/assessments/${selected.id}/candidates/unregistered/export`, {
        headers: { Authorization: `Bearer ${user?.token || ''}` },
      })
      if (!response.ok) throw new Error('Export failed')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `unregistered-candidates-${selected.id}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  const savePolicy = async () => {
    if (!policyDraft) return
    const engineId = selected.engine_id || (selected.assessment_type === 'CODING' ? selected.coding_assessment_id : selected.quiz_id)
    setBusy('policy')
    try {
      const response = await hiringService.updateProctoringPolicy(selected.assessment_type, engineId, policyDraft)
      setPolicyDraft(response.policy)
      setSelected(value => ({ ...value, proctoring_config: response.policy }))
      toast.success('Hire proctoring policy saved')
    } catch (error) {
      toast.error(error.message || 'Could not save proctoring policy')
    } finally {
      setBusy('')
    }
  }

  const loadProctoringReview = async () => {
    setBusy('review')
    setReviewError('')
    try {
      const response = await hiringService.getReport(selected.id)
      setProctoringReview(response.report || { monitoring: [] })
    } catch (error) {
      setReviewError(error.message || 'Could not load AI proctoring review')
    } finally {
      setBusy('')
    }
  }

  const openEvidence = async (evidenceRef) => {
    try {
      const response = await fetch(`${BACKEND_ORIGIN}${evidenceRef}`, {
        headers: { Authorization: `Bearer ${user?.token || ''}` },
      })
      if (!response.ok) throw new Error('Evidence access denied')
      const objectUrl = URL.createObjectURL(await response.blob())
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      toast.error(error.message || 'Could not open evidence')
    }
  }

  const statCards = [
    { label: 'Total assessments', value: stats.total, Icon: FileQuestion, color: '#4F46E5', bg: '#EEF2FF' },
    { label: 'Published & active', value: stats.published, Icon: CheckCircle2, color: '#059669', bg: '#ECFDF5' },
    { label: 'Candidates assigned', value: stats.assigned, Icon: Users, color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Attempts in progress', value: stats.active, Icon: Clock3, color: '#EA580C', bg: '#FFF7ED' },
    { label: 'Pending registration', value: stats.pending, Icon: RefreshCw, color: '#7C3AED', bg: '#F5F3FF' },
  ]

  const filteredCandidates = useMemo(() => {
    if (!candidateFilter.trim()) return candidates
    const q = candidateFilter.toLowerCase()
    return candidates.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  }, [candidates, candidateFilter])

  // ==========================================
  // DETAIL VIEW
  // ==========================================
  const urlSelectedId = searchParams.get('selectedId') || searchParams.get('assessmentId')

  if (urlSelectedId || selected) {
    // If error occurs and we don't have full assessment data to render
    if (detailError && !selected?.title) {
      return (
        <div className="reg-admin">
          <div className="reg-admin-header" style={{ marginBottom: 20 }}>
            <button
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={handleBackToList}
              style={{ padding: '7px 12px' }}
            >
              <ArrowLeft size={15} /> Back to Assessments
            </button>
          </div>
          <div role="alert" className="reg-admin-card" style={{ borderColor: '#FECACA', background: '#FEF2F2', padding: 24, borderRadius: 12, margin: '20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#B91C1C', marginBottom: 8 }}>
              <AlertTriangle size={20} />
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {detailError.toLowerCase().includes('not found') ? 'Assessment Not Found' : 'Unable to Load Assessment'}
              </h4>
            </div>
            <p style={{ color: '#7F1D1D', margin: '0 0 16px', fontSize: 13 }}>{detailError}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="reg-admin-btn reg-admin-btn--primary"
                onClick={() => setRetryCount(c => c + 1)}
                style={{ background: '#DC2626', borderColor: '#DC2626' }}
              >
                <RefreshCw size={14} /> Retry
              </button>
              <button className="reg-admin-btn reg-admin-btn--secondary" onClick={handleBackToList}>
                <ArrowLeft size={14} /> Back to Assessments
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Initial loading state before title is loaded
    if ((detailLoading || (urlSelectedId && !selected)) && !selected?.title) {
      return (
        <div className="reg-admin">
          <div className="reg-admin-header" style={{ marginBottom: 20 }}>
            <button
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={handleBackToList}
              style={{ padding: '7px 12px' }}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <div style={{ flex: 1 }}>
              <h1 className="reg-admin-title" style={{ fontSize: 20 }}>Loading Assessment…</h1>
            </div>
          </div>
          <div className="reg-admin-loading" style={{ padding: 60 }}>
            <Loader2 className="bulk-spin" /> Loading assessment workflow…
          </div>
        </div>
      )
    }

    if (selected) {
      return (
        <div className="reg-admin">
          {/* Detail Header */}
          <div className="reg-admin-header" style={{ marginBottom: 20 }}>
            <button
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={handleBackToList}
              style={{ padding: '7px 12px' }}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
              {selected.assessment_type === 'CODING' ? <Code2 size={22} color="#16A34A" /> : <FileCode size={22} color="#16A34A" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 className="reg-admin-title" style={{ fontSize: 22 }}>{selected.title}</h1>
                <StatusBadge value={selected.status} />
              </div>
              <p className="reg-admin-subtitle" style={{ marginTop: 4 }}>
                Hire &bull; {selected.assessment_type === 'COMBINED' ? 'Combined Quiz + Coding' : selected.assessment_type === 'CODING' ? 'Coding assessment' : 'Quiz assessment'} &bull; {selected.duration_minutes || 60} mins &bull; {selected.passing_score || 60}% passing score
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="reg-admin-btn reg-admin-btn--secondary" disabled={detailLoading} onClick={() => startEdit(selected)}>
                <Edit2 size={14} /> Edit
              </button>

              {/* Direct Quiz Action */}
              {(selected.assessment_type === 'QUIZ' || selected.assessment_type === 'COMBINED') && (
                Number(selected.quiz_metrics?.question_count || 0) === 0 ? (
                  <button
                    className="reg-admin-btn reg-admin-btn--primary"
                    style={{ background: '#16A34A', borderColor: '#16A34A' }}
                    disabled={busy === 'create-quiz' || detailLoading}
                    onClick={() => handleOpenQuiz(selected, true)}
                  >
                    {busy === 'create-quiz' ? <Loader2 size={14} className="bulk-spin" /> : <Plus size={14} />} Create Quiz
                  </button>
                ) : (
                  <button
                    className="reg-admin-btn reg-admin-btn--secondary"
                    disabled={busy === 'create-quiz' || detailLoading}
                    onClick={() => handleOpenQuiz(selected, false)}
                  >
                    <Edit2 size={14} /> Edit Quiz
                  </button>
                )
              )}

              {/* Direct Coding Action */}
              {(selected.assessment_type === 'CODING' || selected.assessment_type === 'COMBINED') && (
                Number(selected.coding_metrics?.problem_count || 0) === 0 ? (
                  <button
                    className="reg-admin-btn reg-admin-btn--primary"
                    style={{ background: '#16A34A', borderColor: '#16A34A' }}
                    disabled={busy === 'create-coding' || detailLoading}
                    onClick={() => handleOpenCoding(selected, true)}
                  >
                    {busy === 'create-coding' ? <Loader2 size={14} className="bulk-spin" /> : <Plus size={14} />} Create Coding
                  </button>
                ) : (
                  <button
                    className="reg-admin-btn reg-admin-btn--secondary"
                    disabled={busy === 'create-coding' || detailLoading}
                    onClick={() => handleOpenCoding(selected, false)}
                  >
                    <Edit2 size={14} /> Edit Coding
                  </button>
                )
              )}

              <button className="reg-admin-btn reg-admin-btn--secondary" disabled={detailLoading} onClick={() => manageContent()}>
                <Eye size={14} /> Manage content & reports
              </button>
              {selected.engine_status === 'DRAFT' && (
                <button className="reg-admin-btn reg-admin-btn--primary" disabled={busy === 'publish' || detailLoading} onClick={() => publish(selected)}>
                  {busy === 'publish' ? <Loader2 size={14} className="bulk-spin" /> : <Send size={14} />} Publish
                </button>
              )}
              {selected.engine_status === 'PUBLISHED' && (
                <button className="reg-admin-btn reg-admin-btn--secondary" style={{ color: '#DC2626' }} disabled={busy === 'close' || detailLoading} onClick={() => closeAssessment(selected)}>
                  {busy === 'close' ? <Loader2 size={14} className="bulk-spin" /> : <XCircle size={14} />} Close test
                </button>
              )}
              <button
                className="reg-admin-btn reg-admin-btn--secondary"
                style={{ color: '#DC2626' }}
                disabled={detailLoading}
                onClick={() => openBulkDelete([selected.id], `Delete "${selected.title}"?`)}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          {detailLoading ? (
            <div className="reg-admin-loading" style={{ padding: 60 }}><Loader2 className="bulk-spin" /> Loading assessment workflow…</div>
          ) : detailError ? (
            <div role="alert" className="reg-admin-card" style={{ borderColor: '#FECACA', background: '#FEF2F2', padding: 24, borderRadius: 12, margin: '20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#B91C1C', marginBottom: 8 }}>
                <AlertTriangle size={20} />
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {detailError.toLowerCase().includes('not found') ? 'Assessment Not Found' : 'Unable to Load Assessment'}
                </h4>
              </div>
              <p style={{ color: '#7F1D1D', margin: '0 0 16px', fontSize: 13 }}>{detailError}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="reg-admin-btn reg-admin-btn--primary"
                  onClick={() => setRetryCount(c => c + 1)}
                  style={{ background: '#DC2626', borderColor: '#DC2626' }}
                >
                  <RefreshCw size={14} /> Retry
                </button>
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={handleBackToList}>
                  <ArrowLeft size={14} /> Back to Assessments
                </button>
              </div>
            </div>
          ) : (
          <>
            {/* SECTION 1: AI PROCTORING POLICY */}
            {policyDraft && (
              <div className="reg-admin-card" style={{ marginBottom: 20, padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', color: '#111827' }}>
                      <ShieldCheck size={20} color="#059669" /> AI proctoring
                    </h3>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13 }}>
                      Hire-only controls. Course and Training proctoring settings are unchanged.
                    </p>
                  </div>
                  <button className="reg-admin-btn reg-admin-btn--primary" onClick={savePolicy} disabled={busy === 'policy'}>
                    {busy === 'policy' ? <Loader2 size={14} className="bulk-spin" /> : <Check size={14} />} Save policy
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  {[
                    ['enabled', 'AI proctoring enabled', 'Master switch for candidate monitoring during this screening'],
                    ['identityVerification', 'Identity verification', 'Verify candidate ID with reference portrait snapshot'],
                    ['livenessDetection', 'Liveness challenge', 'Prevent spoofing with head pose and expression check'],
                    ['continuousFaceVerification', 'Continuous face verification', 'Flag multiple faces, looking away, or face missing'],
                    ['mobileRoomScan', 'QR mobile 180° room scan', 'Require smartphone left-to-right 180° camera sweep before starting'],
                    ['roomScan360Enabled', 'Guided five-step room verification', 'AI-guided front, left, right, bottom and desk captures with voice instructions'],
                    ['unauthorizedObjectDetection', 'Phone/object detection', 'AI detection of mobile phones, notes, or smart devices'],
                    ['evidenceCapture', 'Screenshot evidence', 'Capture flagged events as encrypted audit snapshots'],
                    ['voiceWarnings', 'Voice warnings', 'Speak audible warnings when suspicious activity is detected'],
                    ['allowParticipantLanguage', 'Candidate can select warning language', 'Allow candidate to select their preferred warning audio language'],
                  ].map(([key, label, desc]) => (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        padding: 14,
                        border: '1.5px solid #E2E8F0',
                        borderRadius: 10,
                        background: policyDraft[key] ? '#F0FDF4' : '#fff',
                        borderColor: policyDraft[key] ? '#86EFAC' : '#E2E8F0',
                        cursor: key !== 'enabled' && !policyDraft.enabled ? 'not-allowed' : 'pointer',
                        opacity: key !== 'enabled' && !policyDraft.enabled ? 0.5 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!policyDraft[key]}
                        disabled={key !== 'enabled' && !policyDraft.enabled}
                        onChange={event => setPolicyDraft({ ...policyDraft, [key]: event.target.checked })}
                        style={{ marginTop: 3, accentColor: '#16A34A', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: '#111827' }}>{label}</div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <div>
                    <label className="reg-field-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <Volume2 size={13} /> Default warning language
                    </label>
                    <select
                      className="reg-admin-select"
                      style={{ width: '100%' }}
                      value={policyDraft.defaultLanguage || 'en-IN'}
                      onChange={event => setPolicyDraft({ ...policyDraft, defaultLanguage: event.target.value })}
                    >
                      <option value="en-IN">English</option>
                      <option value="ta-IN">Tamil</option>
                    </select>
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Identity check interval (seconds)</label>
                    <input
                      className="reg-input"
                      type="number"
                      min="15"
                      max="300"
                        value={policyDraft.identityCheckIntervalSeconds ?? 30}
                      onChange={event => setPolicyDraft({ ...policyDraft, identityCheckIntervalSeconds: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Room scan frames</label>
                    <input
                      className="reg-input"
                      type="number"
                      min="4"
                      max="12"
                      value={policyDraft.roomScanMinFrames ?? 6}
                      onChange={event => setPolicyDraft({ ...policyDraft, roomScanMinFrames: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>180° coverage threshold (%)</label>
                    <input
                      className="reg-input"
                      type="number"
                      min="50"
                      max="100"
                      value={policyDraft.roomScanCoverageThreshold || 85}
                      onChange={event => setPolicyDraft({ ...policyDraft, roomScanCoverageThreshold: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Room reference match threshold (%)</label>
                    <input className="reg-input" type="number" value="60" readOnly />
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Repeated photo similarity threshold (%)</label>
                    <input className="reg-input" type="number" value="60" readOnly />
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Voice speed</label>
                    <input
                      className="reg-input"
                      type="number"
                      min="0.6"
                      max="1.4"
                      step="0.05"
                      value={policyDraft.voiceRate || 1.0}
                      onChange={event => setPolicyDraft({ ...policyDraft, voiceRate: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Voice volume</label>
                    <input
                      className="reg-input"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={policyDraft.voiceVolume !== undefined ? policyDraft.voiceVolume : 1.0}
                      onChange={event => setPolicyDraft({ ...policyDraft, voiceVolume: Number(event.target.value) })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: ASSESSMENT CONTENT & RESULTS */}
            <div className="reg-admin-card" style={{ marginBottom: 20, padding: 22 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Assessment content & results</h3>
                  <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13 }}>Generate and review questions, publish the test, and view candidate results.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => manageContent()}>
                    <Eye size={14} /> Manage content & reports
                  </button>
                  {selected.engine_status === 'DRAFT' && (
                    <button className="reg-admin-btn reg-admin-btn--primary" disabled={busy === 'publish'} onClick={() => publish(selected)}>
                      {busy === 'publish' ? <Loader2 size={14} className="bulk-spin" /> : <Send size={14} />} Publish
                    </button>
                  )}
                </div>
              </div>

              {/* Direct Content Creation Cards & Empty State */}
              {(() => {
                const isQuiz = selected.assessment_type === 'QUIZ' || selected.assessment_type === 'COMBINED'
                const isCoding = selected.assessment_type === 'CODING' || selected.assessment_type === 'COMBINED'
                const quizQCount = Number(selected.quiz_metrics?.question_count || 0)
                const codingPCount = Number(selected.coding_metrics?.problem_count || 0)
                const hasAnyContent = (isQuiz && quizQCount > 0) || (isCoding && codingPCount > 0)
                const quizStatusNorm = String(selected.quiz_metrics?.status || (selected.quiz_id ? 'DRAFT' : 'NOT_CREATED')).toUpperCase()
                const codingStatusNorm = String(selected.coding_metrics?.status || (selected.coding_assessment_id ? 'DRAFT' : 'NOT_CREATED')).toUpperCase()

                return (
                  <>
                    {!hasAnyContent && (
                      <div style={{
                        padding: '16px 20px',
                        marginBottom: 18,
                        borderRadius: 12,
                        background: '#F8FAFC',
                        border: '1.5px dashed #CBD5E1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 14
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 40, height: 40, borderRadius: 10, background: '#EFF6FF',
                            color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <FileQuestion size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>No assessment content yet</div>
                            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>Create the quiz or coding test that candidates will complete.</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {isQuiz && (
                            <button
                              className="reg-admin-btn reg-admin-btn--primary"
                              style={{ background: '#16A34A', borderColor: '#16A34A' }}
                              disabled={busy === 'create-quiz'}
                              onClick={() => handleOpenQuiz(selected, true)}
                            >
                              {busy === 'create-quiz' ? <Loader2 size={14} className="bulk-spin" /> : <Plus size={14} />} Create Quiz
                            </button>
                          )}
                          {isCoding && (
                            <button
                              className="reg-admin-btn reg-admin-btn--primary"
                              style={{ background: '#16A34A', borderColor: '#16A34A' }}
                              disabled={busy === 'create-coding'}
                              onClick={() => handleOpenCoding(selected, true)}
                            >
                              {busy === 'create-coding' ? <Loader2 size={14} className="bulk-spin" /> : <Plus size={14} />} Create Coding
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isQuiz && isCoding ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
                      gap: 14,
                      marginBottom: 20
                    }}>
                      {/* Quiz Card */}
                      {isQuiz && (
                        <div style={{
                          padding: 18,
                          borderRadius: 12,
                          border: '1.5px solid #E2E8F0',
                          background: '#FFFFFF',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 14,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 34, height: 34, borderRadius: 8, background: '#DCFCE7',
                                  color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                  <FileQuestion size={18} />
                                </div>
                                <div>
                                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Quiz</h4>
                                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>Multiple-choice assessment questions</div>
                                </div>
                              </div>
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 650,
                                background: quizQCount === 0 ? '#F1F5F9' : (quizStatusNorm === 'PUBLISHED' ? '#DCFCE7' : (quizStatusNorm === 'CLOSED' ? '#FEE2E2' : '#FEF3C7')),
                                color: quizQCount === 0 ? '#475569' : (quizStatusNorm === 'PUBLISHED' ? '#15803D' : (quizStatusNorm === 'CLOSED' ? '#DC2626' : '#92400E')),
                                border: `1px solid ${quizQCount === 0 ? '#CBD5E1' : (quizStatusNorm === 'PUBLISHED' ? '#86EFAC' : (quizStatusNorm === 'CLOSED' ? '#FCA5A5' : '#FCD34D'))}`,
                              }}>
                                {quizQCount === 0 ? 'Not created' : (quizStatusNorm === 'PUBLISHED' ? 'Published' : (quizStatusNorm === 'CLOSED' ? 'Closed' : 'Draft'))}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, fontSize: 13, color: '#334155' }}>
                              <div>
                                <span style={{ fontSize: 18, fontWeight: 750, color: '#111827' }}>{quizQCount}</span>
                                <span style={{ color: '#64748B', fontSize: 12, marginLeft: 4 }}>Questions</span>
                              </div>
                              <div style={{ width: 1, height: 16, background: '#E2E8F0' }} />
                              <div style={{ color: '#64748B', fontSize: 12 }}>
                                {selected.duration_minutes || 60} mins duration &bull; {selected.passing_score || 50}% pass mark
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
                            {quizQCount === 0 ? (
                              <button
                                className="reg-admin-btn reg-admin-btn--primary"
                                style={{ background: '#16A34A', borderColor: '#16A34A', padding: '6px 14px', fontSize: 12.5 }}
                                disabled={busy === 'create-quiz'}
                                onClick={() => handleOpenQuiz(selected, true)}
                              >
                                {busy === 'create-quiz' ? <Loader2 size={13} className="bulk-spin" /> : <Plus size={13} />} Create Quiz
                              </button>
                            ) : quizStatusNorm === 'CLOSED' ? (
                              <button
                                className="reg-admin-btn reg-admin-btn--secondary"
                                style={{ padding: '6px 14px', fontSize: 12.5 }}
                                onClick={() => handleOpenQuiz(selected, false)}
                              >
                                <Eye size={13} /> View Questions
                              </button>
                            ) : (
                              <>
                                <button
                                  className="reg-admin-btn reg-admin-btn--primary"
                                  style={{ background: '#16A34A', borderColor: '#16A34A', padding: '6px 14px', fontSize: 12.5 }}
                                  onClick={() => handleOpenQuiz(selected, false)}
                                >
                                  <Edit2 size={13} /> {quizStatusNorm === 'DRAFT' ? 'Continue Editing' : 'Edit Quiz'}
                                </button>
                                <button
                                  className="reg-admin-btn reg-admin-btn--secondary"
                                  style={{ padding: '6px 14px', fontSize: 12.5 }}
                                  onClick={() => handleOpenQuiz(selected, false)}
                                >
                                  <Eye size={13} /> View Questions
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Coding Card */}
                      {isCoding && (
                        <div style={{
                          padding: 18,
                          borderRadius: 12,
                          border: '1.5px solid #E2E8F0',
                          background: '#FFFFFF',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 14,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 34, height: 34, borderRadius: 8, background: '#EFF6FF',
                                  color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                  <Code2 size={18} />
                                </div>
                                <div>
                                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Coding</h4>
                                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>Programming problems, test cases & languages</div>
                                </div>
                              </div>
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 650,
                                background: codingPCount === 0 ? '#F1F5F9' : (codingStatusNorm === 'PUBLISHED' ? '#DCFCE7' : (codingStatusNorm === 'CLOSED' ? '#FEE2E2' : '#FEF3C7')),
                                color: codingPCount === 0 ? '#475569' : (codingStatusNorm === 'PUBLISHED' ? '#15803D' : (codingStatusNorm === 'CLOSED' ? '#DC2626' : '#92400E')),
                                border: `1px solid ${codingPCount === 0 ? '#CBD5E1' : (codingStatusNorm === 'PUBLISHED' ? '#86EFAC' : (codingStatusNorm === 'CLOSED' ? '#FCA5A5' : '#FCD34D'))}`,
                              }}>
                                {codingPCount === 0 ? 'Not created' : (codingStatusNorm === 'PUBLISHED' ? 'Published' : (codingStatusNorm === 'CLOSED' ? 'Closed' : 'Draft'))}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, fontSize: 13, color: '#334155' }}>
                              <div>
                                <span style={{ fontSize: 18, fontWeight: 750, color: '#111827' }}>{codingPCount}</span>
                                <span style={{ color: '#64748B', fontSize: 12, marginLeft: 4 }}>Problems</span>
                              </div>
                              <div style={{ width: 1, height: 16, background: '#E2E8F0' }} />
                              <div style={{ color: '#64748B', fontSize: 12 }}>
                                Algorithmic execution &bull; Multi-language Judge
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
                            {codingPCount === 0 ? (
                              <button
                                className="reg-admin-btn reg-admin-btn--primary"
                                style={{ background: '#16A34A', borderColor: '#16A34A', padding: '6px 14px', fontSize: 12.5 }}
                                disabled={busy === 'create-coding'}
                                onClick={() => handleOpenCoding(selected, true)}
                              >
                                {busy === 'create-coding' ? <Loader2 size={13} className="bulk-spin" /> : <Plus size={13} />} Create Coding
                              </button>
                            ) : codingStatusNorm === 'CLOSED' ? (
                              <button
                                className="reg-admin-btn reg-admin-btn--secondary"
                                style={{ padding: '6px 14px', fontSize: 12.5 }}
                                onClick={() => handleOpenCoding(selected, false)}
                              >
                                <Eye size={13} /> View Problems
                              </button>
                            ) : (
                              <>
                                <button
                                  className="reg-admin-btn reg-admin-btn--primary"
                                  style={{ background: '#16A34A', borderColor: '#16A34A', padding: '6px 14px', fontSize: 12.5 }}
                                  onClick={() => handleOpenCoding(selected, false)}
                                >
                                  <Edit2 size={13} /> {codingStatusNorm === 'DRAFT' ? 'Continue Editing' : 'Edit Coding'}
                                </button>
                                <button
                                  className="reg-admin-btn reg-admin-btn--secondary"
                                  style={{ padding: '6px 14px', fontSize: 12.5 }}
                                  onClick={() => handleOpenCoding(selected, false)}
                                >
                                  <Eye size={13} /> View Problems
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {[
                  ['Content', selected.content_count || 0],
                  ['Registered', selected.registered_count || 0],
                  ['Assigned', selected.assigned_count || 0],
                  ['In progress', selected.in_progress_count || 0],
                  ['Completed', selected.completed_count || 0],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: 14, border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC' }}>
                    <div style={{ fontSize: 22, fontWeight: 750, color: '#111827' }}>{val}</div>
                    <div style={{ color: '#64748B', fontSize: 11, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 3: AI PROCTORING REVIEW */}
            <div className="reg-admin-card" style={{ marginBottom: 20, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>AI proctoring review</h3>
                  <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13 }}>Shared monitoring risk, identity/liveness state, room scan and protected evidence for this hiring assessment.</p>
                </div>
                <button className="reg-admin-btn reg-admin-btn--secondary" onClick={loadProctoringReview} disabled={busy === 'review'}>
                  {busy === 'review' ? <Loader2 size={14} className="bulk-spin" /> : <RefreshCw size={14} />} {proctoringReview ? 'Refresh review' : 'Load review'}
                </button>
              </div>

              {reviewError && (
                <p role="alert" style={{ color: '#B91C1C', marginBottom: 14, padding: 10, background: '#FEF2F2', borderRadius: 8 }}>
                  {reviewError}
                </p>
              )}

              {proctoringReview && (
                <div className="reg-admin-table-wrap">
                  <table className="reg-admin-table reg-admin-table--static">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Attempt</th>
                        <th>Risk</th>
                        <th>Identity / room</th>
                        <th style={{ textAlign: 'right' }}>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!(proctoringReview.monitoring || []).length ? (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>
                            No monitored attempts yet.
                          </td>
                        </tr>
                      ) : (
                        (proctoringReview.monitoring || []).map(item => {
                          const candidate = candidates.find(person => String(person.participant_id || person.user_id) === String(item.participantId))
                          const identity = item.identity || {}
                          const isHighRisk = item.riskLevel === 'CRITICAL' || item.riskLevel === 'HIGH'
                          return (
                            <tr key={item.attemptId}>
                              <td>
                                <strong style={{ color: '#111827' }}>{candidate?.full_name || `Candidate #${item.participantId}`}</strong>
                                <div style={{ color: '#64748B', fontSize: 11 }}>{candidate?.email || ''}</div>
                              </td>
                              <td>
                                <div>#{item.attemptId}</div>
                                <div style={{ color: '#64748B', fontSize: 11 }}>{item.status}</div>
                              </td>
                              <td>
                                <strong style={{ color: isHighRisk ? '#B91C1C' : '#047857' }}>
                                  {Number(item.riskScore || 0).toFixed(1)} &bull; {item.riskLevel || 'LOW'}
                                </strong>
                              </td>
                              <td>
                                <div>{identity.identityVerifiedAt ? 'Identity verified' : 'Identity pending'}</div>
                                <div style={{ color: '#64748B', fontSize: 11 }}>
                                  {identity.livenessPassed ? 'Liveness passed' : 'Liveness pending'} &bull; {identity.roomScanClear ? 'Room clear' : 'Room scan pending/flagged'}
                                </div>
                                <details className="wi-hire-room-audit">
                                  <summary>Room verification timeline</summary>
                                  <div>Baseline: {identity.roomReference?.photos?.length || 0}/5 photos · Duplicate attempts: {(identity.roomCaptureAttempts || []).filter(attempt => attempt.duplicate).length}</div>
                                  <div>180° coverage: {Math.round(Number(identity.roomScanCoverage) || 0)}% · Verified sectors: {(identity.roomScanSectors || []).filter(sector => sector.verified).length}/{identity.roomPostScanReport?.arcDegrees === 180 ? 5 : 8}</div>
                                  <div>Room match: {identity.roomSimilarityReport?.overallSimilarity == null ? 'Pending'
                                    : `${Math.round(identity.roomSimilarityReport.overallSimilarity * 100)}%`} · Threshold: {Math.round((identity.roomSimilarityReport?.threshold ?? 0.6) * 100)}%</div>
                                  <div>Result: {identity.roomScanClear ? 'PASS' : identity.roomPostScanReport?.result || 'PENDING'}</div>
                                  <div>Post-scan checks: {Object.entries(identity.roomPostScanReport?.checks || {}).map(([key, passed]) =>
                                    `${key} ${passed ? '✓' : '✗'}`).join(' · ') || 'Pending'}</div>
                                  <div className="wi-hire-room-audit-gallery">
                                    {(identity.roomScanSampleIds || []).map((imageId, index) => <button key={`${imageId}-${index}`}
                                      type="button" onClick={() => openEvidence(imageId)}><Eye size={12} /> Scan sector {index + 1}</button>)}
                                  </div>
                                  <details>
                                    <summary>Photo capture attempts</summary>
                                    {(identity.roomCaptureAttempts || []).map(attempt => <div key={attempt.captureId}>
                                      {attempt.capturedAt || attempt.receivedAt} · {String(attempt.step || '').toUpperCase()} · {attempt.validationStatus || 'PENDING'}
                                      {attempt.visualSimilarityScore != null ? ` · ${Math.round(attempt.visualSimilarityScore * 100)}% visual overlap` : ''}
                                      {attempt.failureReason ? ` · ${attempt.failureReason}` : ''}
                                    </div>)}
                                  </details>
                                  <div className="wi-hire-room-audit-gallery">
                                    {(identity.roomReference?.photos || []).map(photo => <button key={photo.stepId} type="button"
                                      onClick={() => photo.imageId && openEvidence(photo.imageId)} disabled={!photo.imageId}>
                                      <Eye size={12} /> {photo.direction} baseline
                                    </button>)}
                                  </div>
                                  {(identity.roomSimilarityReport?.sectorResults || []).map(sector =>
                                    <div key={sector.sector}>{sector.sector}: {Math.round((sector.similarity || 0) * 100)}% · {sector.matchedReference || 'No match'} · {sector.status}</div>)}
                                  {(identity.roomPostScanReport?.baselineResults || []).map(item =>
                                    <div key={item.step}>{item.step.toUpperCase()} baseline: {Math.round((item.bestSimilarity || 0) * 100)}% · sector {item.bestSector == null ? 'none' : item.bestSector + 1} · {item.role}</div>)}
                                  {(identity.roomObjectEvents || []).map(event => <div key={event.eventId} className="wi-hire-room-object-event">
                                    <strong>{event.objectType} · sector {event.sector} · {event.status}</strong>
                                    <div>{event.beforeTimestamp || ''} → {event.afterTimestamp || 'Awaiting re-verification'}</div>
                                    <div className="wi-hire-room-audit-gallery">
                                      {event.beforeEvidenceId && <button type="button" onClick={() => openEvidence(event.beforeEvidenceId)}>Before image</button>}
                                      {event.afterEvidenceId && <button type="button" onClick={() => openEvidence(event.afterEvidenceId)}>After image</button>}
                                    </div>
                                    {event.afterVerificationResult && <div>Same area: {Math.round((event.afterVerificationResult.sameAreaSimilarity || 0) * 100)}% · Clear frames: {event.afterVerificationResult.clearFrames}</div>}
                                  </div>)}
                                </details>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {item.evidence?.length ? (
                                  <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {item.evidence.map((ev, idx) => (
                                      <button
                                        key={`${ev.evidenceRef}-${idx}`}
                                        className="reg-admin-btn reg-admin-btn--secondary"
                                        style={{ padding: '4px 8px', fontSize: 11 }}
                                        onClick={() => openEvidence(ev.evidenceRef)}
                                      >
                                        <Eye size={12} /> {String(ev.eventType || 'Evidence').replaceAll('_', ' ')}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94A3B8', fontSize: 12 }}>None</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 4: CANDIDATE ASSIGNMENT */}
            <div className="reg-admin-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Candidate assignment</h3>
                  <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13 }}>
                    CSV columns: Email, Name. Registered users are assigned once; others remain pending.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input ref={uploadRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => uploadCsv(e.target.files?.[0])} />
                  <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => uploadRef.current?.click()} disabled={busy === 'upload'}>
                    {busy === 'upload' ? <Loader2 size={14} className="bulk-spin" /> : <Upload size={14} />} Upload CSV
                  </button>
                  <button className="reg-admin-btn reg-admin-btn--secondary" onClick={recheck} disabled={busy === 'recheck'}>
                    {busy === 'recheck' ? <Loader2 size={14} className="bulk-spin" /> : <RefreshCw size={14} />} Re-check registration
                  </button>
                  <button className="reg-admin-btn reg-admin-btn--secondary" onClick={exportPending} disabled={!selected.pending_candidates || busy === 'export'}>
                    <Download size={14} /> Export pending ({selected.pending_candidates || 0})
                  </button>
                </div>
              </div>

              {/* Candidate Search filter */}
              {candidates.length > 5 && (
                <div style={{ marginBottom: 14, maxWidth: 360 }}>
                  <div className="reg-admin-search">
                    <Search size={15} />
                    <input
                      type="text"
                      placeholder="Search candidates by name or email…"
                      value={candidateFilter}
                      onChange={(e) => setCandidateFilter(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Candidate Bulk Actions Toolbar */}
              {selectedCandidateIds.size > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  marginBottom: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#16a34a',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}>
                      {selectedCandidateIds.size}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                      {selectedCandidateIds.size} candidate{selectedCandidateIds.size > 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="reg-admin-btn reg-admin-btn--secondary"
                      onClick={() => setSelectedCandidateIds(new Set())}
                      style={{ padding: '5px 10px', fontSize: '12px', height: '30px' }}
                    >
                      Deselect All
                    </button>
                    <button
                      type="button"
                      className="reg-admin-btn reg-admin-btn--primary"
                      onClick={handleBulkAssignCandidates}
                      disabled={busy === 'bulk-assign'}
                      style={{ padding: '5px 12px', fontSize: '12px', height: '30px' }}
                    >
                      {busy === 'bulk-assign' ? <Loader2 size={12} className="bulk-spin" /> : <CheckCircle size={13} />}
                      Bulk Assign ({selectedCandidateIds.size})
                    </button>
                    <button
                      type="button"
                      className="reg-admin-btn reg-admin-btn--danger"
                      onClick={handleBulkRemoveCandidates}
                      disabled={busy === 'bulk-remove-candidates'}
                      style={{ padding: '5px 12px', fontSize: '12px', height: '30px' }}
                    >
                      {busy === 'bulk-remove-candidates' ? <Loader2 size={12} className="bulk-spin" /> : <Trash2 size={13} />}
                      Bulk Remove ({selectedCandidateIds.size})
                    </button>
                  </div>
                </div>
              )}

              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table reg-admin-table--static">
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: 'center', padding: '10px 8px' }}>
                        <input
                          type="checkbox"
                          aria-label="Select all candidates"
                          checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidateIds.has(c.id))}
                          ref={el => {
                            if (el) {
                              const someSelected = filteredCandidates.some(c => selectedCandidateIds.has(c.id))
                              const allSelected = filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidateIds.has(c.id))
                              el.indeterminate = someSelected && !allSelected
                            }
                          }}
                          onChange={handleSelectAllCandidates}
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                        />
                      </th>
                      <th style={{ width: '36%' }}>Candidate</th>
                      <th style={{ width: '22%' }}>Registration</th>
                      <th style={{ width: '22%' }}>Assignment</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredCandidates.length ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: 36, color: '#94A3B8' }}>
                          {candidates.length ? 'No candidates matching search filter.' : 'No candidates uploaded yet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredCandidates.map((candidate) => {
                        const isChecked = selectedCandidateIds.has(candidate.id)
                        return (
                          <tr key={candidate.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                            <td style={{ width: 40, textAlign: 'center', padding: '10px 8px' }}>
                              <input
                                type="checkbox"
                                aria-label={`Select candidate ${candidate.full_name || candidate.email}`}
                                checked={isChecked}
                                onChange={() => handleToggleSelectCandidate(candidate.id)}
                                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                              />
                            </td>
                            <td>
                              <strong style={{ color: '#111827' }}>{candidate.full_name || 'Candidate'}</strong>
                              <div style={{ color: '#64748B', fontSize: 12 }}>{candidate.email}</div>
                            </td>
                            <td><StatusBadge value={candidate.registration_status} /></td>
                            <td><StatusBadge value={candidate.assignment_status} /></td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', position: 'relative' }} data-hire-menu={`cand-${candidate.id}`}>
                                <button
                                  className="reg-admin-btn reg-admin-btn--secondary"
                                  style={{ padding: '5px 10px', fontSize: 12 }}
                                  disabled={candidate.registration_status !== 'REGISTERED' || busy === `candidate-${candidate.id}`}
                                  onClick={() => toggle(candidate)}
                                >
                                  {candidate.assignment_status === 'ASSIGNED' ? 'Unassign' : 'Assign'}
                                </button>
                                <button
                                  className="reg-admin-action"
                                  style={{ width: 28, height: 28, borderRadius: 6, color: '#DC2626', borderColor: '#FECACA' }}
                                  title="Remove candidate"
                                  onClick={() => setCandidateToDelete(candidate)}
                                >
                                  <Trash2 size={13} />
                                </button>
                                <button
                                  className="reg-admin-action"
                                  style={{ width: 28, height: 28, borderRadius: 6 }}
                                  title="More actions"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const key = `cand-${candidate.id}`
                                    setActiveMenuId(activeMenuId === key ? null : key)
                                  }}
                                >
                                  <MoreVertical size={14} />
                                </button>
                                {activeMenuId === `cand-${candidate.id}` && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      right: 0,
                                      top: 34,
                                      background: '#fff',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: 10,
                                      boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
                                      padding: '6px 0',
                                      minWidth: 180,
                                      zIndex: 50,
                                      textAlign: 'left',
                                    }}
                                  >
                                    <MenuItem
                                      icon={<Ban size={14} color="#DC2626" />}
                                      label="Revoke assignment"
                                      danger
                                      disabled={busy === `revoke-${candidate.id}`}
                                      onClick={() => { setActiveMenuId(null); revokeCandidate(candidate) }}
                                    />
                                    <MenuItem
                                      icon={<UserCheck size={14} color="#2563EB" />}
                                      label="Reassign candidate"
                                      disabled={candidate.registration_status !== 'REGISTERED' || busy === `reassign-${candidate.id}`}
                                      onClick={() => { setActiveMenuId(null); reassignCandidate(candidate) }}
                                    />
                                    <MenuItem
                                      icon={<RotateCcw size={14} color="#B45309" />}
                                      label="Reset attempt"
                                      disabled={busy === `reset-${candidate.id}`}
                                      onClick={() => { setActiveMenuId(null); resetAttempt(candidate) }}
                                    />
                                    <MenuItem
                                      icon={<Timer size={14} color="#7C3AED" />}
                                      label="Extend time"
                                      disabled={busy === `extend-${candidate.id}`}
                                      onClick={() => { setActiveMenuId(null); extendTime(candidate) }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Delete Candidate Confirmation Modal */}
        {candidateToDelete && (
          <Modal onClose={() => setCandidateToDelete(null)} maxWidth={440}>
            <div className="reg-modal-header">
              <h3 style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <AlertTriangle size={18} /> Remove Candidate
              </h3>
              <button type="button" onClick={() => setCandidateToDelete(null)}><X size={18} /></button>
            </div>
            <div className="reg-modal-body">
              <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
                Are you sure you want to remove <strong>{candidateToDelete.full_name || candidateToDelete.email}</strong> from this hiring assessment?
              </p>
            </div>
            <div className="reg-modal-footer">
              <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setCandidateToDelete(null)}>Cancel</button>
              <button type="button" className="reg-admin-btn reg-admin-btn--danger" onClick={removeCandidate} disabled={!!busy}>
                {busy?.startsWith('delete-candidate') && <Loader2 size={14} className="bulk-spin" />} Remove
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }
}

  // ==========================================
  // LIST VIEW
  // ==========================================
  return (
    <div className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
          <Code2 size={24} color="#16A34A" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="reg-admin-title">Hire &bull; Quiz + Coding Assessments</h1>
          <p className="reg-admin-subtitle">Create screening tests, assign candidates, and review results.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="reg-admin-btn reg-admin-btn--secondary"
            onClick={load}
            disabled={loading}
            title="Refresh assessments list"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={15} className={loading ? 'bulk-spin' : ''} />
          </button>
          <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create Assessment
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="reg-admin-stats">
        {statCards.map(({ label, value, Icon, color, bg }) => (
          <div className="reg-admin-stat" key={label}>
            <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color, flexShrink: 0 }}>
              <Icon size={20} />
            </div>
            <div>
              <span className="reg-admin-stat-num">{value}</span>
              <span className="reg-admin-stat-label">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter Controls */}
      <div className="reg-admin-filters">
        <div className="reg-admin-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hiring assessments…"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tab Pills for quick assessment type filter */}
        <div className="reg-admin-filter-tabs">
          {[
            { key: 'ALL', label: 'All Types' },
            { key: 'QUIZ', label: 'Quiz' },
            { key: 'CODING', label: 'Coding' },
          ].map(t => (
            <button
              key={t.key}
              className={`reg-admin-filter-tab ${type === t.key ? 'reg-admin-filter-tab--active' : ''}`}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sync select kept for existing programmatic / aria accessibility queries */}
        <select
          aria-label="Assessment type"
          className="reg-admin-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ display: 'none' }}
        >
          <option value="ALL">All assessment types</option>
          <option value="QUIZ">Quiz</option>
          <option value="CODING">Coding</option>
        </select>
      </div>

      {loadError && (
        <div role="alert" className="reg-admin-card" style={{ borderColor: '#FECACA', background: '#FEF2F2', padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#B91C1C', margin: 0, fontWeight: 600 }}>{loadError}</p>
          <button className="reg-admin-btn reg-admin-btn--secondary" style={{ marginTop: 10 }} onClick={load}>
            Retry loading assessments
          </button>
        </div>
      )}

      {/* Multi-Select Bulk Actions Toolbar */}
      {selectedAssessmentIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          marginBottom: '14px',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              fontWeight: 700,
            }}>
              {selectedAssessmentIds.size}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
              {selectedAssessmentIds.size} assessment{selectedAssessmentIds.size > 1 ? 's' : ''} selected
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={() => setSelectedAssessmentIds(new Set())}
              style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
            >
              Deselect All
            </button>
            <button
              type="button"
              className="reg-admin-btn reg-admin-btn--danger"
              onClick={() => openBulkDelete(Array.from(selectedAssessmentIds))}
              style={{ padding: '6px 14px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={14} />
              Bulk Delete ({selectedAssessmentIds.size})
            </button>
          </div>
        </div>
      )}

      {/* Assessments Table Wrap */}
      <div className="reg-admin-table-wrap">
        {loading ? (
          <div className="reg-admin-loading" style={{ padding: 60 }}>
            <Loader2 className="bulk-spin" /> Loading…
          </div>
        ) : !items.length ? (
          <div className="reg-admin-empty" style={{ padding: 70 }}>
            <FileQuestion size={42} color="#94A3B8" />
            <h3>No hiring assessments</h3>
            <p>Create a workflow that references one shared Quiz or Coding assessment.</p>
            <button className="reg-admin-btn reg-admin-btn--primary" style={{ marginTop: 14 }} onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Create Assessment
            </button>
          </div>
        ) : (
          <table className="reg-admin-table reg-admin-table--static">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all assessments on this page"
                    checked={items.length > 0 && items.every(item => selectedAssessmentIds.has(item.id))}
                    ref={el => {
                      if (el) {
                        const someSelected = items.some(item => selectedAssessmentIds.has(item.id))
                        const allSelected = items.length > 0 && items.every(item => selectedAssessmentIds.has(item.id))
                        el.indeterminate = someSelected && !allSelected
                      }
                    }}
                    onChange={handleSelectAllAssessments}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                  />
                </th>
                <th style={{ width: '28%' }}>Assessment</th>
                <th style={{ width: '12%' }}>Engine</th>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ width: '10%' }}>Content</th>
                <th style={{ width: '18%' }}>Candidates</th>
                <th style={{ width: '16%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isChecked = selectedAssessmentIds.has(item.id)
                return (
                  <tr key={item.id} style={{ background: isChecked ? '#f0fdf4' : undefined }}>
                    <td style={{ width: 44, textAlign: 'center', padding: '12px 8px' }}>
                      <input
                        type="checkbox"
                        aria-label={`Select assessment ${item.title}`}
                        checked={isChecked}
                        onChange={() => handleToggleSelectAssessment(item.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a', verticalAlign: 'middle' }}
                      />
                    </td>
                    <td>
                      <strong style={{ fontSize: 14, color: '#111827', display: 'block' }}>{item.title}</strong>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        {item.duration_minutes || 60} minutes &bull; Pass: {item.passing_score || 60}%
                      </div>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: item.assessment_type === 'CODING' ? '#2563EB' : '#059669',
                        background: item.assessment_type === 'CODING' ? '#EFF6FF' : '#ECFDF5',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}>
                        {item.assessment_type === 'CODING' ? <Code2 size={13} /> : <FileCode size={13} />}
                        {item.assessment_type === 'CODING' ? 'Coding' : 'Quiz'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>
                      <span style={{ fontWeight: 650, color: '#111827' }}>{item.content_count || 0}</span>
                      <span style={{ fontSize: 11, color: '#64748B', marginLeft: 4 }}>
                        {item.assessment_type === 'CODING' ? 'problem(s)' : 'question(s)'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: '#111827', fontWeight: 600 }}>
                        {item.assigned_count || 0} assigned
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        {item.pending_candidates || 0} pending
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }} data-hire-menu={item.id}>
                        <button
                          className="reg-admin-btn reg-admin-btn--secondary"
                          onClick={() => openDetail(item)}
                          style={{ padding: '6px 12px', fontSize: 12 }}
                        >
                          <Eye size={13} /> Open
                        </button>
                        <button
                          className="reg-admin-btn reg-admin-btn--secondary"
                          onClick={() => manageContent(item)}
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          title="Manage shared assessment content in editor"
                        >
                          <BarChart3 size={13} /> Manage
                        </button>

                        {/* 3-Dot Action Menu for Edit, Delete, Publish, Close */}
                        <button
                          className="reg-admin-action"
                          style={{ width: 32, height: 32, borderRadius: 8 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveMenuId(activeMenuId === item.id ? null : item.id)
                          }}
                          title="More options"
                        >
                          <MoreVertical size={15} />
                        </button>

                        {activeMenuId === item.id && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 36,
                              background: '#fff',
                              border: '1px solid #E2E8F0',
                              borderRadius: 10,
                              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
                              padding: '6px 0',
                              minWidth: 160,
                              zIndex: 50,
                              textAlign: 'left',
                            }}
                          >
                            <button
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                width: '100%',
                                padding: '8px 14px',
                                background: 'none',
                                border: 'none',
                                fontSize: 13,
                                color: '#334155',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                              onClick={() => startEdit(item)}
                            >
                              <Edit2 size={14} color="#64748B" /> Edit details
                            </button>
                            {item.engine_status === 'DRAFT' && (
                              <button
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  width: '100%',
                                  padding: '8px 14px',
                                  background: 'none',
                                  border: 'none',
                                  fontSize: 13,
                                  color: '#047857',
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#ECFDF5'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                onClick={() => { setActiveMenuId(null); publish(item) }}
                              >
                                <Send size={14} /> Publish test
                              </button>
                            )}
                            {item.engine_status === 'PUBLISHED' && (
                              <button
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  width: '100%',
                                  padding: '8px 14px',
                                  background: 'none',
                                  border: 'none',
                                  fontSize: 13,
                                  color: '#DC2626',
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                onClick={() => { setActiveMenuId(null); closeAssessment(item) }}
                              >
                                <XCircle size={14} /> Close test
                              </button>
                            )}
                            <div style={{ height: 1, background: '#E2E8F0', margin: '4px 0' }} />
                            <button
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                width: '100%',
                                padding: '8px 14px',
                                background: 'none',
                                border: 'none',
                                fontSize: 13,
                                color: '#DC2626',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                              onClick={() => { setActiveMenuId(null); openBulkDelete([item.id], `Delete "${item.title}"?`) }}
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE ASSESSMENT MODAL */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} maxWidth={560}>
          <form onSubmit={create}>
            <div className="reg-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Create hiring assessment</h3>
                <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 12 }}>
                  Creates a Hire workflow linked to the selected existing assessment engine.
                </p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="reg-modal-body" style={{ display: 'grid', gap: 16 }}>
              {/* Type Selection Cards */}
              <div>
                <label className="reg-field-label">Assessment Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 4 }}>
                  {[
                    { type: 'QUIZ', label: 'Quiz Assessment', desc: 'Multiple-choice questions, auto-graded quizzes' },
                    { type: 'CODING', label: 'Coding Assessment', desc: 'Live code editor, algorithmic test cases' },
                    { type: 'COMBINED', label: 'Combined Quiz + Coding', desc: 'MCQ questions and live coding problems in a unified test' },
                  ].map(opt => (
                    <div
                      key={opt.type}
                      onClick={() => setForm({ ...form, assessmentType: opt.type })}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: `1.5px solid ${form.assessmentType === opt.type ? '#16A34A' : '#E2E8F0'}`,
                        background: form.assessmentType === opt.type ? '#F0FDF4' : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontWeight: 650, fontSize: 13, color: '#111827' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="reg-field-label">Title *</label>
                <input
                  className="reg-input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Graduate Developer Screening"
                  required
                />
              </div>

              <div>
                <label className="reg-field-label">Job role (optional)</label>
                <input
                  className="reg-input"
                  value={form.jobRole}
                  onChange={(e) => setForm({ ...form, jobRole: e.target.value })}
                  placeholder="e.g. Fullstack Engineer, Data Analyst"
                />
              </div>

              <div>
                <label className="reg-field-label">Description</label>
                <textarea
                  className="reg-textarea"
                  rows="3"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief instructions or notes about this test role…"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="reg-field-label">Duration (minutes)</label>
                  <input
                    className="reg-input"
                    type="number"
                    min="1"
                    max="480"
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="reg-field-label">Passing score (%)</label>
                  <input
                    className="reg-input"
                    type="number"
                    min="0"
                    max="100"
                    value={form.passingScore}
                    onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <div className="reg-modal-footer">
              <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="reg-admin-btn reg-admin-btn--primary" disabled={saving}>
                {saving && <Loader2 size={14} className="bulk-spin" />} Create & open
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* EDIT ASSESSMENT MODAL */}
      {editItem && (
        <Modal onClose={() => setEditItem(null)} maxWidth={520}>
          <form onSubmit={saveEdit}>
            <div className="reg-modal-header">
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Edit assessment</h3>
              <button type="button" onClick={() => setEditItem(null)}><X size={18} /></button>
            </div>
            <div className="reg-modal-body" style={{ display: 'grid', gap: 16 }}>
              <div>
                <label className="reg-field-label">Title *</label>
                <input
                  className="reg-input"
                  value={editItem.title}
                  onChange={(e) => setEditItem({ ...editItem, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="reg-field-label">Job role (optional)</label>
                <input
                  className="reg-input"
                  value={editItem.jobRole}
                  onChange={(e) => setEditItem({ ...editItem, jobRole: e.target.value })}
                  placeholder="e.g. Fullstack Engineer, Data Analyst"
                />
              </div>
              <div>
                <label className="reg-field-label">Description</label>
                <textarea
                  className="reg-textarea"
                  rows="3"
                  value={editItem.description}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="reg-field-label">Duration (minutes)</label>
                  <input
                    className="reg-input"
                    type="number"
                    min="1"
                    max="480"
                    value={editItem.durationMinutes}
                    onChange={(e) => setEditItem({ ...editItem, durationMinutes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="reg-field-label">Passing score (%)</label>
                  <input
                    className="reg-input"
                    type="number"
                    min="0"
                    max="100"
                    value={editItem.passingScore}
                    onChange={(e) => setEditItem({ ...editItem, passingScore: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <div className="reg-modal-footer">
              <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setEditItem(null)}>Cancel</button>
              <button className="reg-admin-btn reg-admin-btn--primary" disabled={saving}>
                {saving && <Loader2 size={14} className="bulk-spin" />} Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* REUSABLE BULK DELETE CONFIRM MODAL */}
      <BulkDeleteConfirmModal
        open={bulkDeleteModal.open}
        title={bulkDeleteModal.title}
        itemType={bulkDeleteModal.itemType}
        count={bulkDeleteModal.count}
        loading={bulkDeleteModal.loading}
        failedItems={bulkDeleteModal.failedItems}
        onClose={() => setBulkDeleteModal({ open: false, itemType: 'assessment', title: '', count: 0, ids: [], loading: false, failedItems: null })}
        onConfirm={handleExecuteBulkDelete}
        onClearFailed={() => setBulkDeleteModal(prev => ({ ...prev, failedItems: null }))}
      />
    </div>
  )
}
