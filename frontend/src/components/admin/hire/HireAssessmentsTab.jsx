import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, CheckCircle2, Clock3, Code2, Download, Eye,
  FileQuestion, Loader2, Plus, RefreshCw, Search, Send, Upload, Users, X,
  ShieldCheck, Volume2, Trash2, Edit2, MoreVertical, ExternalLink,
  AlertTriangle, Shield, Check, FileCode, CheckCircle, XCircle
} from 'lucide-react'
import { API_BASE, BACKEND_ORIGIN } from '../../../api/api'
import hiringService from '../../../services/hiringService'
import { useToast } from '../../Toast'

const emptyForm = { title: '', assessmentType: 'QUIZ', description: '', durationMinutes: 60, passingScore: 60 }

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
  const toast = useToast()
  const uploadRef = useRef(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [detailError, setDetailError] = useState('')
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
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

  useEffect(() => () => { detailRequest.current += 1 }, [])

  const stats = useMemo(() => ({
    total: items.length,
    published: items.filter((item) => item.engine_status === 'PUBLISHED').length,
    assigned: items.reduce((sum, item) => sum + Number(item.assigned_count || 0), 0),
    active: items.reduce((sum, item) => sum + Number(item.in_progress_count || 0), 0),
    pending: items.reduce((sum, item) => sum + Number(item.pending_candidates || 0), 0),
  }), [items])

  const openDetail = async (item) => {
    const request = ++detailRequest.current
    setSelected(item)
    setCandidates([])
    setProctoringReview(null)
    setReviewError('')
    setDetailError('')
    setDetailLoading(true)
    try {
      const [workflow, people] = await Promise.all([
        hiringService.getAssessment(item.id),
        hiringService.listCandidates(item.id),
      ])
      if (request === detailRequest.current) {
        setSelected(workflow.assessment || item)
        setPolicyDraft((workflow.assessment || item).proctoring_config || null)
        setCandidates(people.candidates || [])
      }
    } catch (error) {
      if (request === detailRequest.current) setDetailError(error.message || 'Could not load workflow')
    } finally {
      if (request === detailRequest.current) setDetailLoading(false)
    }
  }

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
      await hiringService.updateAssessment(editItem.id, editItem)
      toast.success('Assessment updated')
      setEditItem(null)
      await load()
      if (selected && selected.id === editItem.id) {
        await openDetail({ ...selected, ...editItem })
      }
    } catch (error) {
      toast.error(error.message || 'Could not update assessment')
    } finally {
      setSaving(false)
    }
  }

  const executeDelete = async () => {
    if (!deleteConfirm) return
    setSaving(true)
    try {
      await hiringService.deleteAssessment(deleteConfirm.id)
      toast.success('Assessment deleted successfully')
      setDeleteConfirm(null)
      if (selected?.id === deleteConfirm.id) {
        setSelected(null)
      }
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not delete assessment')
    } finally {
      setSaving(false)
    }
  }

  const manageContent = (item = selected) => {
    const id = item?.engine_id || (item?.assessment_type === 'CODING' ? item?.coding_assessment_id : item?.quiz_id)
    if (!id) return toast.error('Shared assessment content is unavailable')
    navigate(item.assessment_type === 'CODING' ? `/trainer/coding/${id}?from=hire` : `/trainer/quiz/${id}?from=hire`)
  }

  const publish = async (target = selected) => {
    setBusy('publish')
    try {
      await hiringService.publishAssessment(target.id)
      toast.success('Assessment published')
      if (selected) await openDetail(selected)
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
      if (selected) await openDetail(selected)
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
      await openDetail(selected)
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
      await openDetail(selected)
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
      await openDetail(selected)
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
      await openDetail(selected)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not remove candidate')
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
  if (selected) {
    return (
      <div className="reg-admin">
        {/* Detail Header */}
        <div className="reg-admin-header" style={{ marginBottom: 20 }}>
          <button
            className="reg-admin-btn reg-admin-btn--secondary"
            onClick={() => { detailRequest.current += 1; setSelected(null); setCandidates([]) }}
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
              Hire &bull; {selected.assessment_type === 'CODING' ? 'Coding assessment' : 'Quiz assessment'} &bull; {selected.duration_minutes || 60} mins &bull; {selected.passing_score || 60}% passing score
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => startEdit(selected)}>
              <Edit2 size={14} /> Edit
            </button>
            <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => manageContent()}>
              <Eye size={14} /> Manage content & reports
            </button>
            {selected.engine_status === 'DRAFT' && (
              <button className="reg-admin-btn reg-admin-btn--primary" disabled={busy === 'publish'} onClick={() => publish(selected)}>
                {busy === 'publish' ? <Loader2 size={14} className="bulk-spin" /> : <Send size={14} />} Publish
              </button>
            )}
            {selected.engine_status === 'PUBLISHED' && (
              <button className="reg-admin-btn reg-admin-btn--secondary" style={{ color: '#DC2626' }} disabled={busy === 'close'} onClick={() => closeAssessment(selected)}>
                {busy === 'close' ? <Loader2 size={14} className="bulk-spin" /> : <XCircle size={14} />} Close test
              </button>
            )}
          </div>
        </div>

        {detailLoading ? (
          <div className="reg-admin-loading" style={{ padding: 60 }}><Loader2 className="bulk-spin" /> Loading assessment workflow…</div>
        ) : detailError ? (
          <div role="alert" className="reg-admin-card" style={{ borderColor: '#FECACA', background: '#FEF2F2', padding: 20 }}>
            <p style={{ color: '#B91C1C', margin: 0, fontWeight: 600 }}>{detailError}</p>
            <button className="reg-admin-btn reg-admin-btn--secondary" style={{ marginTop: 12 }} onClick={() => openDetail(selected)}>Retry</button>
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
                    ['mobileRoomScan', 'QR mobile 360° room scan', 'Require smartphone 360 camera sweep before starting'],
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
                      <option value="hi-IN">Hindi</option>
                      <option value="ta-IN">Tamil</option>
                      <option value="te-IN">Telugu</option>
                      <option value="kn-IN">Kannada</option>
                      <option value="ml-IN">Malayalam</option>
                      <option value="mr-IN">Marathi</option>
                      <option value="bn-IN">Bengali</option>
                      <option value="gu-IN">Gujarati</option>
                      <option value="pa-IN">Punjabi</option>
                    </select>
                  </div>
                  <div>
                    <label className="reg-field-label" style={{ fontSize: 12 }}>Identity check interval (seconds)</label>
                    <input
                      className="reg-input"
                      type="number"
                      min="15"
                      max="300"
                      value={policyDraft.identityCheckIntervalSeconds || 30}
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
                      value={policyDraft.roomScanMinFrames || 6}
                      onChange={event => setPolicyDraft({ ...policyDraft, roomScanMinFrames: Number(event.target.value) })}
                    />
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

              <div className="reg-admin-table-wrap">
                <table className="reg-admin-table reg-admin-table--static">
                  <thead>
                    <tr>
                      <th style={{ width: '38%' }}>Candidate</th>
                      <th style={{ width: '22%' }}>Registration</th>
                      <th style={{ width: '22%' }}>Assignment</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredCandidates.length ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: 36, color: '#94A3B8' }}>
                          {candidates.length ? 'No candidates matching search filter.' : 'No candidates uploaded yet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredCandidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td>
                            <strong style={{ color: '#111827' }}>{candidate.full_name || 'Candidate'}</strong>
                            <div style={{ color: '#64748B', fontSize: 12 }}>{candidate.email}</div>
                          </td>
                          <td><StatusBadge value={candidate.registration_status} /></td>
                          <td><StatusBadge value={candidate.assignment_status} /></td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
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
                            </div>
                          </td>
                        </tr>
                      ))
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
                <th style={{ width: '30%' }}>Assessment</th>
                <th style={{ width: '12%' }}>Engine</th>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ width: '10%' }}>Content</th>
                <th style={{ width: '20%' }}>Candidates</th>
                <th style={{ width: '16%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
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

                      {/* 3-Dot Action Menu for Edit, Delete, Publish */}
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
                            onClick={() => { setActiveMenuId(null); setDeleteConfirm(item) }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  {[
                    { type: 'QUIZ', label: 'Quiz Assessment', desc: 'Multiple-choice questions, auto-graded quizzes' },
                    { type: 'CODING', label: 'Coding Assessment', desc: 'Live code editor, algorithmic test cases' },
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

      {/* DELETE ASSESSMENT CONFIRMATION MODAL */}
      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} maxWidth={440}>
          <div className="reg-modal-header">
            <h3 style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <AlertTriangle size={20} /> Delete Assessment
            </h3>
            <button type="button" onClick={() => setDeleteConfirm(null)}><X size={18} /></button>
          </div>
          <div className="reg-modal-body">
            <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deleteConfirm.title}</strong>? This will remove the hiring workflow and candidate assignments.
            </p>
          </div>
          <div className="reg-modal-footer">
            <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </button>
            <button type="button" className="reg-admin-btn reg-admin-btn--danger" onClick={executeDelete} disabled={saving}>
              {saving && <Loader2 size={14} className="bulk-spin" />} Delete assessment
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
