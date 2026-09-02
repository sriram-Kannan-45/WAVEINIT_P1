import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import {
  ArrowLeft, Settings, Users, BarChart3, Trophy, FileText,
  Plus, Pencil, Trash2, Save, X, Check, Send, Loader2, Star,
  Search, Clock, Calendar, AlertCircle, AlertTriangle, RefreshCw,
  Code, Shield, ShieldCheck, Copy, Info, BarChart2, Sparkles,
  Eye, MoreVertical, ChevronDown, ChevronUp, GripVertical
} from 'lucide-react'
import { SingleAttemptProctoringModal } from '../proctoring/components/TrainerMonitoringReport'
import { API } from '../api/api'
import { getAuthHeaders } from '../api/request'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ui/AlertModal'
import CodeEditor from '../components/CodeEditor'
import { getDefaultStarterCode, getDefaultReferenceSolution } from '../utils/languageTemplates'
import {
  colors, btnPrimary, btnSuccess, btnDanger, btnOutline, iconBtn,
  lblStyle, inputStyle, selectStyle, textareaStyle,
} from '../theme/tokens'
import UserAvatar from '../components/common/UserAvatar'
import Pagination from '../components/common/Pagination'
import '../styles/course-tabs.css'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
]

const LANGUAGE_MONACO_MAP = {
  javascript: 'javascript', python: 'python', java: 'java', cpp: 'cpp',
  c: 'c', csharp: 'csharp', typescript: 'typescript', go: 'go',
  kotlin: 'kotlin', rust: 'rust', php: 'php',
}

const languageLabel = (id) => (LANGUAGES.find(l => l.value === id) || {}).label || id

export function normalizeCodingProblem(p) {
  if (!p || typeof p !== 'object') return null
  const id = p.id
  const title = String(p.title || '').trim()
  const description = String(p.description || '').trim()
  const difficulty = String(p.difficulty || 'MEDIUM').toUpperCase()
  const marks = Number(p.marks) || 10
  const timeLimit = Number(p.timeLimit) || 5
  const memoryLimit = Number(p.memoryLimit) || 256
  const inputFormat = p.inputFormat || ''
  const outputFormat = p.outputFormat || ''
  const constraints = p.constraints || ''
  const explanation = p.explanation || ''
  const sampleInput = p.sampleInput != null ? String(p.sampleInput) : ''
  const sampleOutput = p.sampleOutput != null ? String(p.sampleOutput) : ''
  const tags = Array.isArray(p.tags) ? p.tags : []
  const requiredConcepts = Array.isArray(p.requiredConcepts) ? p.requiredConcepts : []

  // Languages normalization
  let languages = []
  if (Array.isArray(p.languages) && p.languages.length > 0) {
    languages = p.languages.map(l => ({
      language: String(l.language || '').toLowerCase().trim(),
      starterCode: l.starterCode != null ? String(l.starterCode) : '',
      referenceSolution: l.referenceSolution != null ? String(l.referenceSolution) : '',
    }))
  } else if (p.languageSolutions && typeof p.languageSolutions === 'object') {
    languages = Object.entries(p.languageSolutions).map(([lang, sol]) => ({
      language: String(lang).toLowerCase().trim(),
      starterCode: sol?.starterCode != null ? String(sol.starterCode) : '',
      referenceSolution: sol?.referenceSolution != null ? String(sol.referenceSolution) : '',
    }))
  } else if (p.programmingLanguage) {
    languages = [{
      language: String(p.programmingLanguage).toLowerCase().trim(),
      starterCode: p.starterCode != null ? String(p.starterCode) : '',
      referenceSolution: p.expectedSolution != null ? String(p.expectedSolution) : '',
    }]
  }

  // LanguageSolutions map
  const languageSolutions = {}
  for (const l of languages) {
    languageSolutions[l.language] = {
      starterCode: l.starterCode,
      referenceSolution: l.referenceSolution,
    }
  }

  // Test cases normalization
  const rawTestCases = Array.isArray(p.testCases) ? p.testCases : []
  const testCases = rawTestCases.map((tc, idx) => ({
    id: tc.id,
    _localId: tc.id ? `tc_${tc.id}` : `tc_loc_${idx}_${Math.random().toString(36).substring(2, 9)}`,
    input: tc.input != null ? String(tc.input) : (tc.sampleInput != null ? String(tc.sampleInput) : ''),
    expectedOutput: tc.expectedOutput != null
      ? String(tc.expectedOutput)
      : (tc.output != null ? String(tc.output) : (tc.sampleOutput != null ? String(tc.sampleOutput) : '')),
    isHidden: Boolean(tc.isHidden ?? tc.is_hidden ?? false),
    description: tc.description || '',
    order: tc.order != null ? Number(tc.order) : idx,
  }))

  return {
    id,
    title,
    description,
    difficulty,
    marks,
    timeLimit,
    memoryLimit,
    inputFormat,
    outputFormat,
    constraints,
    sampleInput,
    sampleOutput,
    explanation,
    tags,
    requiredConcepts,
    languages,
    languageSolutions,
    programmingLanguage: languages[0]?.language || 'javascript',
    starterCode: languages[0]?.starterCode || '',
    expectedSolution: languages[0]?.referenceSolution || '',
    testCases,
    source: p.source || 'AI',
    aiValidationStatus: p.aiValidationStatus || 'DRAFT',
    aiValidationMessage: p.aiValidationMessage || null,
  }
}

export function normalizeCodingAssessment(a) {
  if (!a || typeof a !== 'object') return null
  const rawProblems = Array.isArray(a.problems) ? a.problems : []
  const problems = rawProblems.map(normalizeCodingProblem).filter(Boolean)
  const langs = Array.isArray(a.languages) && a.languages.length > 0
    ? a.languages.map(l => String(l).toLowerCase().trim())
    : ['javascript']

  return {
    ...a,
    languages: langs,
    problems,
    numProblems: problems.length,
  }
}

function MonoField({ language, value, onChange, readOnly = false, height = 160 }) {
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', background: '#1E1E1E' }}>
      <div style={{ height }}>
        <Editor
          key={`${language}_${readOnly ? 'ro' : 'rw'}`}
          height="100%"
          language={LANGUAGE_MONACO_MAP[language] || 'javascript'}
          value={value ?? ''}
          onChange={onChange}
          theme="vs-dark"
          options={{
            fontSize: 13,
            readOnly,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              alwaysConsumeMouseWheel: false,
              vertical: 'auto',
              horizontal: 'auto',
            },
            overviewRulerLanes: 0,
          }}
        />
      </div>
    </div>
  )
}

export default function TrainerCodingAssessmentDetails({ user }) {
  const { assessmentId } = useParams()
  const navigate = useNavigate()

  return (
    <CodingAssessmentDetailModal
      assessmentId={assessmentId}
      user={user}
      onClose={() => navigate('/trainer')}
      isFullPageRoute={true}
    />
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LARGE POPUP / OVERLAY MODAL: CODING ASSESSMENT DETAIL MODAL
   ───────────────────────────────────────────────────────────────────────────── */
export function CodingAssessmentDetailModal({ assessmentId, user, onClose, onRefresh, isFullPageRoute }) {
  const toast = useToast()
  const confirm = useConfirm()
  const auth = useCallback(() => ({
    'Content-Type': 'application/json',
    ...getAuthHeaders(user),
  }), [user])

  const [assessment, setAssessment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('general')
  const [publishing, setPublishing] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [editingAssessment, setEditingAssessment] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    timeLimit: 120,
    languages: ['javascript', 'python'],
  })

  // Disable background scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const fetchAssessment = useCallback(async (isQuiet = false) => {
    if (!assessmentId) return
    if (!isQuiet && !assessment) {
      setLoading(true)
    }
    try {
      const r = await fetch(API.CODING.DETAIL(assessmentId), { headers: auth() })
      const d = await r.json()
      if (d.assessment) {
        setAssessment(d.assessment)
        setEditForm({
          title: d.assessment.title || '',
          description: d.assessment.description || '',
          timeLimit: d.assessment.timeLimit || 120,
          languages: Array.isArray(d.assessment.languages) ? d.assessment.languages : ['javascript', 'python'],
        })
      } else if (!isQuiet) {
        toast.error('Assessment not found')
      }
    } catch (e) {
      if (!isQuiet && !assessment) {
        toast.error('Failed to load assessment')
      }
    } finally {
      setLoading(false)
    }
  }, [assessmentId, auth, assessment])

  useEffect(() => { fetchAssessment(false) }, [assessmentId])

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const r = await fetch(API.CODING.PUBLISH(assessmentId), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok) {
        const list = d.unvalidated?.map(u => `• ${u.title} (${u.status})`).join('\n') || ''
        toast.error((d.error || 'Publish failed') + (list ? `\n${list}` : ''))
        return
      }
      toast.success('Coding assessment published successfully')
      setAssessment(prev => prev ? { ...prev, status: 'PUBLISHED' } : prev)
      fetchAssessment(true)
      onRefresh?.(true)
    } catch (e) { toast.error(e.message) }
    finally { setPublishing(false) }
  }

  const handleCloseAssessment = async () => {
    const ok = await confirm({
      title: 'Close Assessment',
      message: 'Are you sure you want to close this assessment? Participants will no longer be able to submit.',
      type: 'warning',
      confirmText: 'Close Assessment',
    })
    if (!ok) return
    try {
      const r = await fetch(API.CODING.CLOSE(assessmentId), { method: 'POST', headers: auth() })
      if (!r.ok) throw new Error('Close failed')
      toast.success('Coding assessment closed')
      setAssessment(prev => prev ? { ...prev, status: 'CLOSED' } : prev)
      fetchAssessment(true)
      onRefresh?.(true)
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Assessment',
      message: 'Are you sure you want to delete this assessment permanently? This cannot be undone.',
      type: 'danger',
      confirmText: 'Delete Permanently',
    })
    if (!ok) return
    try {
      const r = await fetch(API.CODING.DELETE(assessmentId), { method: 'DELETE', headers: auth() })
      if (!r.ok) throw new Error('Delete failed')
      toast.success('Coding assessment deleted successfully')
      onRefresh?.(true)
      onClose?.()
    } catch (e) { toast.error(e.message) }
  }

  const handleSaveAssessmentEdit = async () => {
    try {
      const r = await fetch(API.CODING.UPDATE(assessment.id), {
        method: 'PUT', headers: auth(),
        body: JSON.stringify(editForm)
      })
      if (!r.ok) throw new Error('Save failed')
      toast.success('Coding assessment updated successfully')
      setAssessment(prev => prev ? { ...prev, ...editForm } : prev)
      setEditingAssessment(false)
      fetchAssessment(true)
      onRefresh?.(true)
    } catch (e) { toast.error(e.message) }
  }

  const formattedAssessmentId = useMemo(() => {
    const idNum = assessment?.id ? String(assessment.id).padStart(4, '0') : '0046'
    return `#ASSM-2024-${idNum}`
  }, [assessment])

  const handleCopyId = () => {
    navigator.clipboard.writeText(formattedAssessmentId)
    setCopiedId(true)
    toast.success('Assessment ID copied to clipboard')
    setTimeout(() => setCopiedId(false), 2000)
  }

  const trainerDisplayName = user?.name || 'sriram'

  const tabs = [
    { key: 'general',      label: 'General',      icon: FileText },
    { key: 'problems',     label: 'Problems',     icon: Code },
    { key: 'participants', label: 'Participants', icon: Users },
    { key: 'results',      label: 'Results',      icon: BarChart3 },
    { key: 'leaderboard',  label: 'Leaderboard',  icon: Trophy },
    { key: 'analytics',    label: 'Analytics',    icon: Star },
    { key: 'settings',     label: 'Settings',     icon: Settings },
  ]

  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.50)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 18,
          width: 'min(1360px, 85vw)',
          height: 'min(880px, 85vh)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 70px -10px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1000000,
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: '#0F172A'
        }}
      >
        {/* ── Top Bar with Back & Close ── */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', flexShrink: 0
        }}>
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none', padding: 0,
              fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer',
              transition: 'color 150ms ease'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#16A34A'}
            onMouseOut={e => e.currentTarget.style.color = '#475569'}
          >
            <ArrowLeft size={14} /> Back to Assessments
          </button>

          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, background: '#F8FAFC',
              border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#64748B', cursor: 'pointer',
              transition: 'all 150ms ease'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A' }}
            onMouseOut={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable Body Area ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 26px',
          display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0
        }}>
          {loading ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748B' }}>
              <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto 12px', color: '#16A34A' }} />
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Loading assessment details…</div>
            </div>
          ) : !assessment ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#DC2626', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={32} style={{ margin: '0 auto' }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Assessment details not found</div>
              <p style={{ fontSize: 13, color: '#64748B', maxWidth: 360, margin: '4px 0 12px' }}>
                We could not retrieve the details for this coding assessment.
              </p>
              <button
                type="button"
                className="reg-admin-btn reg-admin-btn--primary"
                onClick={() => fetchAssessment()}
                style={{ height: 36, padding: '0 18px', borderRadius: 8, fontSize: 13, background: '#16A34A' }}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* ── Common Assessment Header Card (ALWAYS VISIBLE) ── */}
              <div style={{
                background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16,
                padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)', flexWrap: 'wrap', gap: 16, flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Green Code Icon Circle */}
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', background: '#16A34A',
                    color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(22,163,74,0.18)'
                  }}>
                    <Code size={22} strokeWidth={2.4} />
                  </div>

                  <div>
                    <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                      {assessment.title || 'Basic Output Challenges'}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      {/* Published Badge */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600,
                        background: assessment.status === 'PUBLISHED' ? '#EAF8F0' : '#F1F5F9',
                        color: assessment.status === 'PUBLISHED' ? '#16A34A' : '#64748B',
                      }}>
                        {assessment.status === 'PUBLISHED' ? 'Published' : assessment.status || 'Draft'}
                      </span>

                      {/* Results: Hidden Badge */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600,
                        background: assessment.resultStatus === 'PUBLISHED' ? '#EAF8F0' : '#EFF6FF',
                        color: assessment.resultStatus === 'PUBLISHED' ? '#16A34A' : '#2563EB',
                      }}>
                        Results: {assessment.resultStatus === 'PUBLISHED' ? 'Published' : 'Hidden'}
                      </span>

                      {/* Metadata row */}
                      <span style={{ fontSize: 12.5, color: '#64748B' }}>• {assessment.problems?.length || 1} problem</span>
                      <span style={{ fontSize: 12.5, color: '#64748B' }}>• {(assessment.languages || ['javascript', 'python']).length} language(s)</span>
                      <span style={{ fontSize: 12.5, color: '#64748B' }}>• {assessment.timeLimit || 120} min</span>
                    </div>
                  </div>
                </div>

                {/* Assessment ID & Copy Button & More menu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: '#94A3B8', marginBottom: 2 }}>Assessment ID</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                        {formattedAssessmentId}
                      </span>
                      <button
                        onClick={handleCopyId}
                        title="Copy Assessment ID"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
                          color: copiedId ? '#16A34A' : '#94A3B8', display: 'flex', alignItems: 'center',
                          transition: 'color 150ms ease'
                        }}
                      >
                        {copiedId ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <button style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}>
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>

              {/* ── Navigation Tabs (ALWAYS VISIBLE) ── */}
              <div style={{
                display: 'flex', gap: 4, borderBottom: '1px solid #E2E8F0', overflowX: 'auto', flexShrink: 0
              }}>
                {tabs.map(tab => {
                  const Icon = tab.icon
                  const active = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '10px 16px', border: 'none', cursor: 'pointer',
                        fontSize: 13.5, fontWeight: active ? 600 : 500,
                        color: active ? '#16A34A' : '#64748B',
                        background: 'transparent',
                        borderBottom: active ? '2px solid #16A34A' : '2px solid transparent',
                        marginBottom: -1, whiteSpace: 'nowrap', transition: 'all 150ms ease',
                        fontFamily: 'inherit'
                      }}
                    >
                      <Icon size={15} color={active ? '#16A34A' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* ── Action Buttons Row (ALWAYS VISIBLE) ── */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                {/* Edit Button */}
                <button
                  onClick={() => setEditingAssessment(!editingAssessment)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 36, padding: '0 16px', background: '#FFFFFF', border: '1.5px solid #E2E8F0',
                    borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#334155', cursor: 'pointer',
                    transition: 'all 150ms ease', fontFamily: 'inherit'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseOut={e => e.currentTarget.style.background = '#FFFFFF'}
                >
                  <Pencil size={13} /> {editingAssessment ? 'Cancel Edit' : 'Edit'}
                </button>

                {/* Close Assessment Button */}
                {assessment.status === 'PUBLISHED' && (
                  <button
                    onClick={handleCloseAssessment}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 36, padding: '0 16px', background: '#EA580C', border: 'none',
                      borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#FFFFFF', cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(234, 88, 12, 0.2)', transition: 'all 150ms ease', fontFamily: 'inherit'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#C2410C'}
                    onMouseOut={e => e.currentTarget.style.background = '#EA580C'}
                  >
                    <X size={14} /> Close Assessment
                  </button>
                )}

                {/* Publish Assessment Button (if draft) */}
                {assessment.status === 'DRAFT' && (() => {
                  const probList = assessment.problems || [];
                  const allPassed = probList.length > 0 && probList.every(p => p.aiValidationStatus === 'VALIDATED' || p.aiValidationStatus === 'PASSED');
                  return (
                    <button
                      onClick={handlePublish}
                      disabled={publishing || !allPassed}
                      title={!allPassed ? 'All problems must pass validation before publishing. Please validate or fix any failing problems.' : 'Publish assessment to participants'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        height: 36, padding: '0 16px', background: '#16A34A', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#FFFFFF',
                        cursor: (publishing || !allPassed) ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)', transition: 'all 150ms ease', fontFamily: 'inherit',
                        opacity: (publishing || !allPassed) ? 0.5 : 1
                      }}
                    >
                      {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      {publishing ? 'Publishing…' : 'Publish Assessment'}
                    </button>
                  );
                })()}

                {/* Delete Assessment Button */}
                <button
                  onClick={handleDelete}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 36, padding: '0 16px', background: '#DC2626', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#FFFFFF', cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)', transition: 'all 150ms ease', fontFamily: 'inherit'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#B91C1C'}
                  onMouseOut={e => e.currentTarget.style.background = '#DC2626'}
                >
                  <Trash2 size={13} /> Delete Assessment
                </button>
              </div>

              {/* Edit Form Card Drawer */}
              {editingAssessment && (
                <div style={{
                  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
                  padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                    Edit Assessment Details
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={lblStyle}>Title</label>
                      <input style={inputStyle} value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                    </div>
                    <div>
                      <label style={lblStyle}>Time Limit (minutes)</label>
                      <input style={inputStyle} type="number" min={1} value={editForm.timeLimit} onChange={e => setEditForm({ ...editForm, timeLimit: parseInt(e.target.value) || 60 })} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={lblStyle}>Description</label>
                      <textarea style={textareaStyle} rows={3} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button onClick={handleSaveAssessmentEdit} style={{ ...btnPrimary, padding: '7px 16px', fontSize: 13 }}>
                      <Save size={13} style={{ marginRight: 4 }} /> Save Changes
                    </button>
                    <button onClick={() => setEditingAssessment(false)} style={{ ...btnOutline, padding: '7px 16px', fontSize: 13 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── 5. Selected Tab Content Area ── */}
              <div>
                {activeTab === 'general' && (
                  <GeneralTabContent
                    assessment={assessment}
                    trainerDisplayName={trainerDisplayName}
                  />
                )}
                {activeTab === 'problems' && (
                  <ProblemsTab assessment={assessment} setAssessment={setAssessment} onRefresh={fetchAssessment} auth={auth} toast={toast} />
                )}
                {activeTab === 'participants' && (
                  <ParticipantsTab assessment={assessment} auth={auth} toast={toast} />
                )}
                {activeTab === 'results' && (
                  <ResultsTab assessment={assessment} auth={auth} toast={toast} onRefresh={fetchAssessment} />
                )}
                {activeTab === 'leaderboard' && (
                  <LeaderboardTab assessment={assessment} auth={auth} />
                )}
                {activeTab === 'analytics' && (
                  <AnalyticsTab assessment={assessment} auth={auth} />
                )}
                {activeTab === 'settings' && (
                  <SettingsTab assessment={assessment} onRefresh={fetchAssessment} auth={auth} toast={toast} />
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(modalContent, document.body)
}

/* ─────────────────────────────────────────────────────────────────────────────
   1. GENERAL TAB CONTENT
   ───────────────────────────────────────────────────────────────────────────── */
function GeneralTabContent({ assessment, trainerDisplayName }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Description & Instructions 2-Column Card ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16,
        padding: '20px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32
      }}>
        {/* Left Column: Description */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={16} color="#16A34A" />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Assessment Description</h4>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            {assessment.description || 'Test foundational coding concepts and problem solving skills.'}
          </p>
        </div>

        {/* Right Column: Instructions */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertCircle size={16} color="#16A34A" />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Instructions for Participants</h4>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            {assessment.instructions || 'Read the problem statement carefully and submit your code within the time limit. All test cases must pass for full score.'}
          </p>
        </div>
      </div>

      {/* ── Additional Rules & Metadata ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16,
        padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 2 }}>Passing Criteria</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{assessment.passingScore || 60}% Marks</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 2 }}>Proctoring Enabled</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: assessment.proctoringEnabled ? '#16A34A' : '#64748B' }}>
              {assessment.proctoringEnabled ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 2 }}>AI Hints Allowed</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: assessment.aiAssistEnabled ? '#16A34A' : '#64748B' }}>
              {assessment.aiAssistEnabled ? 'Yes (Socratic Tutor)' : 'No'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8,
            fontSize: 11.5, fontWeight: 600, background: '#EAF8F0', color: '#16A34A'
          }}>
            <Check size={12} strokeWidth={2.8} /> Active
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. PROBLEMS TAB
   ───────────────────────────────────────────────────────────────────────────── */
function ProblemsTab({ assessment, setAssessment, onRefresh, auth, toast }) {
  const confirm = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProblem, setEditingProblem] = useState(null)
  const [showAIWizard, setShowAIWizard] = useState(false)
  const [validatingId, setValidatingId] = useState(null)
  const [validatingAll, setValidatingAll] = useState(false)
  const [deletingProblemId, setDeletingProblemId] = useState(null)
  const problems = assessment.problems || []

  const aiStatusStyle = (status) => {
    const map = {
      VALIDATED: { bg: '#EAF8F0', color: '#16A34A', label: 'Validated' },
      PASSED: { bg: '#EAF8F0', color: '#16A34A', label: 'Validated' },
      PUBLISHED: { bg: '#EAF8F0', color: '#16A34A', label: 'Validated' },
      AI_GENERATED: { bg: '#EFF6FF', color: '#2563EB', label: 'Pending Validation' },
      VALIDATING: { bg: '#FEF3C7', color: '#D97706', label: 'Validating…' },
      VALIDATION_FAILED: { bg: '#FEF2F2', color: '#DC2626', label: 'Validation Failed' },
      FAILED: { bg: '#FEF2F2', color: '#DC2626', label: 'Validation Failed' },
      NEEDS_TRAINER_REVIEW: { bg: '#FEF3C7', color: '#B45309', label: 'Needs Review' },
      PENDING_REVIEW: { bg: '#FEF3C7', color: '#B45309', label: 'Needs Review' },
    }
    return map[status] || { bg: '#F1F5F9', color: '#64748B', label: status || 'Draft' }
  }

  const handleValidate = async (probId) => {
    if (!probId) {
      toast.error('Problem ID is missing')
      return
    }
    setValidatingId(probId)
    try {
      const endpoint = API.CODING.VALIDATE_PROBLEM(probId)
      const r = await fetch(endpoint, { method: 'POST', headers: auth() })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.success === false) throw new Error(data.error || data.message || 'Validation failed')
      toast.success(data.validation?.recommendedStatus === 'VALIDATED' ? 'Problem validated successfully' : `Validation outcome: ${data.validation?.recommendedStatus}`)
      if (data.validation?.issues?.length) toast.error(data.validation.issues.join(' ').slice(0, 300))
      
      // Optimistic update of the validated problem
      if (setAssessment && data.validation) {
        setAssessment(prev => {
          if (!prev) return prev
          const updated = (prev.problems || []).map(p => {
            if (p.id === probId) {
              return {
                ...p,
                aiValidationStatus: data.validation.recommendedStatus || 'VALIDATED',
                aiValidationMessage: data.validation.issues?.join(' ') || null,
              }
            }
            return p
          })
          return { ...prev, problems: updated }
        })
      }
      onRefresh?.(true)
    } catch (e) { toast.error(e.message) } finally { setValidatingId(null) }
  }

  const handleValidateAll = async () => {
    if (!assessment?.id) {
      toast.error('Assessment ID is missing')
      return
    }
    const ok = await confirm({
      title: 'Validate All Questions',
      message: 'Run the reference solution against every test case for all questions? AI-generated questions must pass validation before publishing.',
      type: 'warning',
      confirmText: 'Validate All',
    })
    if (!ok) return
    setValidatingAll(true)
    try {
      const endpoint = API.CODING.VALIDATE_ALL(assessment.id)
      const r = await fetch(endpoint, { method: 'POST', headers: auth() })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.success === false) throw new Error(data.error || data.message || 'Validation failed')
      const failed = (data.results || []).filter(x => x.recommendedStatus !== 'VALIDATED').length
      toast.success(failed === 0 ? 'All questions validated ✓' : `${data.results?.length} validated, ${failed} need attention`)
      
      // Optimistic update of all problems
      if (setAssessment) {
        setAssessment(prev => {
          if (!prev) return prev
          const resultMap = {}
          for (const res of (data.results || [])) {
            if (res.problemId) resultMap[res.problemId] = res
          }
          const updated = (prev.problems || []).map(p => {
            const res = resultMap[p.id]
            if (res) {
              return {
                ...p,
                aiValidationStatus: res.recommendedStatus || 'VALIDATED',
                aiValidationMessage: res.issues?.join(' ') || null,
              }
            }
            return { ...p, aiValidationStatus: 'VALIDATED' }
          })
          return { ...prev, problems: updated }
        })
      }
      onRefresh?.(true)
    } catch (e) { toast.error(e.message) } finally { setValidatingAll(false) }
  }

  const handleDeleteProblem = async (probId) => {
    if (!probId) {
      toast.error('Problem ID is missing')
      return
    }
    const ok = await confirm({
      title: 'Delete Problem',
      message: 'Are you sure you want to delete this problem?',
      type: 'danger',
      confirmText: 'Delete Problem',
    })
    if (!ok) return
    setDeletingProblemId(probId)
    try {
      const endpoint = API.CODING.DELETE_PROBLEM(probId)
      const r = await fetch(endpoint, { method: 'DELETE', headers: auth() })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.success === false) throw new Error(data.error || data.message || 'Delete failed')
      toast.success('Problem deleted')
      
      // Optimistically remove problem from state
      if (setAssessment) {
        setAssessment(prev => prev ? {
          ...prev,
          problems: (prev.problems || []).filter(p => p.id !== probId)
        } : prev)
      }
      onRefresh?.(true)
    } catch (e) { toast.error(e.message) }
    finally { setDeletingProblemId(null) }
  }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
          {problems.length} Problem{problems.length !== 1 ? 's' : ''}
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowAIWizard(true)} style={{ ...btnOutline, padding: '7px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13} color="#16A34A" /> Generate with AI
          </button>
          <button onClick={handleValidateAll} disabled={validatingAll} style={{ ...btnOutline, padding: '7px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {validatingAll ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} color="#7C3AED" />}
            {validatingAll ? 'Validating…' : 'Validate All'}
          </button>
          <button onClick={() => { setEditingProblem(null); setModalOpen(true) }} style={{ ...btnPrimary, padding: '7px 16px', fontSize: 13 }}>
            <Plus size={13} style={{ marginRight: 4 }} /> Add Problem
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {problems.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12, marginBottom: 18, padding: '14px 18px',
          background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Problems</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{problems.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Languages</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {(assessment.languages || ['javascript']).map(l => (
                <span key={l} style={{ padding: '2px 7px', background: '#EDE9FE', color: '#6D28D9', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                  {languageLabel(l)}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Difficulty</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginTop: 3 }}>
              {assessment.difficulty || 'MEDIUM'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Marks</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
              {problems.reduce((sum, p) => sum + (p.marks || 10), 0)}
            </div>
          </div>
        </div>
      )}

      {problems.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          No coding problems yet. Click <strong>Add Problem</strong> or <strong>Generate with AI</strong>.
        </div>
      ) : (
        <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 40 }}>#</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>TITLE</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 110 }}>DIFFICULTY</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 80, textAlign: 'center' }}>MARKS</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 90, textAlign: 'center' }}>TEST CASES</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 140 }}>VALIDATION</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 120, textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={p.id || `prob_${i}`} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#94A3B8', fontSize: 12.5 }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13.5 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, maxWidth: 450, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.description}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: p.difficulty === 'EASY' ? '#EAF8F0' : p.difficulty === 'HARD' ? '#FEF2F2' : '#FEF3C7',
                      color: p.difficulty === 'EASY' ? '#16A34A' : p.difficulty === 'HARD' ? '#DC2626' : '#D97706',
                    }}>
                      {p.difficulty || 'MEDIUM'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
                    {p.marks || 10}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12.5, color: '#64748B' }}>
                    {p.testCases?.length || 0}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {(() => {
                      const st = aiStatusStyle(p.aiValidationStatus || (p.source === 'AI' ? 'AI_GENERATED' : 'DRAFT'))
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              title={p.aiValidationMessage || st.label}
                              style={{
                                padding: '3px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                                background: st.bg, color: st.color, whiteSpace: 'nowrap',
                                display: 'inline-flex', alignItems: 'center', gap: 4
                              }}
                            >
                              {p.aiValidationStatus === 'VALIDATED' || p.aiValidationStatus === 'PASSED' ? (
                                <ShieldCheck size={11} color="#16A34A" />
                              ) : p.aiValidationStatus === 'VALIDATION_FAILED' || p.aiValidationStatus === 'FAILED' ? (
                                <AlertTriangle size={11} color="#DC2626" />
                              ) : p.aiValidationStatus === 'NEEDS_TRAINER_REVIEW' || p.aiValidationStatus === 'PENDING_REVIEW' ? (
                                <AlertTriangle size={11} color="#B45309" />
                              ) : (
                                <Sparkles size={11} color="#2563EB" />
                              )}
                              {st.label}
                            </span>
                            <button
                              onClick={() => handleValidate(p.id)}
                              disabled={validatingId === p.id}
                              title="Validate with AI (runs reference solution against all test cases)"
                              style={{ ...iconBtn('#F5F3FF', '#7C3AED'), width: 24, height: 24 }}
                            >
                              {validatingId === p.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                            </button>
                          </div>
                          {p.aiValidationMessage && (p.aiValidationStatus === 'VALIDATION_FAILED' || p.aiValidationStatus === 'NEEDS_TRAINER_REVIEW') && (
                            <div style={{ fontSize: 10.5, color: '#DC2626', maxWidth: 220, lineHeight: 1.2 }} title={p.aiValidationMessage}>
                              {p.aiValidationMessage.slice(0, 75)}...
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => { setEditingProblem(p); setModalOpen(true) }} className="cqt-action-btn cqt-action-btn--edit" title="Edit Problem">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDeleteProblem(p.id)} disabled={deletingProblemId === p.id} className="cqt-action-btn cqt-action-btn--delete" title="Delete Problem">
                        {deletingProblemId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProblemFormModal
          key={`prob-modal-${editingProblem?.id || 'new'}`}
          assessmentId={assessment.id}
          existingProblem={editingProblem ? normalizeCodingProblem(editingProblem) : null}
          onClose={() => { setModalOpen(false); setEditingProblem(null) }}
          onSaved={(savedProb) => {
            setModalOpen(false)
            setEditingProblem(null)
            if (setAssessment && savedProb && savedProb.id) {
              const normSaved = normalizeCodingProblem(savedProb)
              setAssessment(prev => {
                if (!prev) return prev
                const exists = (prev.problems || []).some(p => p.id === normSaved.id)
                const updated = exists
                  ? prev.problems.map(p => p.id === normSaved.id ? { ...p, ...normSaved } : p)
                  : [...(prev.problems || []), normSaved]
                return { ...prev, problems: updated, numProblems: updated.length }
              })
            }
            onRefresh?.(true)
          }}
          auth={auth}
          toast={toast}
        />
      )}

      {showAIWizard && (
        <AIProblemWizardModal
          assessmentId={assessment.id}
          initialLanguages={assessment.languages || ['javascript']}
          onClose={() => setShowAIWizard(false)}
          onSuccess={(updatedAssessment) => {
            setShowAIWizard(false)
            if (updatedAssessment && setAssessment) {
              const norm = normalizeCodingAssessment(updatedAssessment)
              setAssessment(norm)
            }
            onRefresh?.(true)
          }}
          auth={auth}
          toast={toast}
        />
      )}
    </div>
  )
}

function AIProblemWizardModal({ assessmentId, initialLanguages = ['javascript'], onClose, onSuccess, auth, toast }) {
  const [topic, setTopic] = useState('')
  const [problemCount, setProblemCount] = useState(1)
  const [difficulty, setDifficulty] = useState('EASY')
  const [selectedLangs, setSelectedLangs] = useState(initialLanguages.length > 0 ? initialLanguages : ['python', 'javascript'])
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const [langSearch, setLangSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState(null)
  const reqSeqRef = useRef(0)

  const toggleLang = (id) => {
    setSelectedLangs(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev
        return prev.filter(l => l !== id)
      }
      return [...prev, id]
    })
  }

  const handleGenerate = async (e) => {
    if (e) e.preventDefault()
    if (!topic.trim()) {
      toast.error('Please enter a topic or prompt')
      return
    }
    if (selectedLangs.length === 0) {
      toast.error('Select at least one programming language')
      return
    }

    const countToSend = Math.max(1, Math.min(parseInt(problemCount, 10) || 1, 10))
    const currentSeq = ++reqSeqRef.current

    setLoading(true)
    setError(null)
    setLoadingStep(`Generating ${countToSend} problem(s) specification for "${topic.trim()}"...`)

    try {
      const stepTimer1 = setTimeout(() => {
        if (currentSeq === reqSeqRef.current) {
          setLoadingStep(`Generating ${selectedLangs.map(l => languageLabel(l)).join(', ')} starter & reference solutions...`)
        }
      }, 1500)
      const stepTimer2 = setTimeout(() => {
        if (currentSeq === reqSeqRef.current) {
          setLoadingStep('Synthesizing test cases and running validation checks...')
        }
      }, 4500)

      const res = await fetch(API.CODING.GENERATE_FOR_ASSESSMENT ? API.CODING.GENERATE_FOR_ASSESSMENT(assessmentId) : `${API.CODING.LIST}/${assessmentId}/generate-problems`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          prompt: topic.trim(),
          difficulty,
          problemCount: countToSend,
          languages: selectedLangs,
        }),
      })

      clearTimeout(stepTimer1)
      clearTimeout(stepTimer2)

      if (currentSeq !== reqSeqRef.current) return

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'AI Problem Generation failed')

      toast.success(`Successfully generated ${countToSend} problem(s) for "${topic.trim()}"`)
      onSuccess(data.assessment)
    } catch (err) {
      if (currentSeq === reqSeqRef.current) {
        setError(err.message || 'AI Generation failed. Please try again.')
      }
    } finally {
      if (currentSeq === reqSeqRef.current) {
        setLoading(false)
      }
    }
  }

  const availableLangs = LANGUAGES.filter(l => !selectedLangs.includes(l.value))
  const filteredAvailable = availableLangs.filter(l =>
    l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
    l.value.toLowerCase().includes(langSearch.toLowerCase())
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000003,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 580,
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        <div style={{
          padding: '18px 24px 14px', borderBottom: '1px solid #F1F5F9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} color="#16A34A" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Generate Problem with AI</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Topic-strict generation for all selected languages</p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading} style={iconBtn('#F1F5F9', '#64748B')}><X size={14} /></button>
        </div>

        <form onSubmit={handleGenerate} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div>
            <label style={lblStyle}>Topic or Prompt *</label>
            <input
              style={{ ...inputStyle, fontSize: 13.5, padding: '9px 12px' }}
              required
              disabled={loading}
              placeholder='e.g. "Generate 3 easy problems on array sorting" or "Write a program that prints HI"'
              value={topic}
              onChange={e => {
                const val = e.target.value
                setTopic(val)
                const m = val.match(/\b([1-9]|10)\s*(?:(?:easy|medium|hard|simple|basic|coding|programming|algorithm)\s+)*(?:problems?|questions?|tasks?|challenges?)\b/i)
                if (m && m[1]) {
                  setProblemCount(parseInt(m[1], 10))
                }
              }}
            />
            <span style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
              Describe the coding topics or skills you want to assess, including how many problems you'd like (e.g. 'Generate 3 easy problems on array sorting'). If not specified, 1 problem will be generated.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lblStyle}>Difficulty</label>
              <select style={selectStyle} disabled={loading} value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label style={lblStyle}>Number of Problems</label>
              <select style={selectStyle} disabled={loading} value={problemCount} onChange={e => setProblemCount(parseInt(e.target.value, 10))}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'Problem' : 'Problems'}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={lblStyle}>Languages * ({selectedLangs.length} selected)</label>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                  border: '1px solid #CBD5E1', borderRadius: 10, padding: '8px 10px',
                  background: '#FFFFFF', minHeight: 42, cursor: 'pointer',
                }}
                onClick={() => setLangDropdownOpen(o => !o)}
              >
                {selectedLangs.length === 0 ? (
                  <span style={{ fontSize: 12.5, color: '#94A3B8' }}>Select one or more languages…</span>
                ) : (
                  selectedLangs.map(id => (
                    <span
                      key={id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE',
                        borderRadius: 999, padding: '3px 6px 3px 9px', fontSize: 11.5, fontWeight: 600,
                      }}
                    >
                      {languageLabel(id)}
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, color: '#6D28D9' }}
                        onClick={(e) => { e.stopPropagation(); toggleLang(id) }}
                        title="Remove language"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', color: '#64748B' }}>
                  <ChevronDown size={14} />
                </span>
              </div>

              {langDropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.12)', overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                    <Search size={13} color="#94A3B8" />
                    <input
                      autoFocus
                      value={langSearch}
                      onChange={e => setLangSearch(e.target.value)}
                      placeholder="Search languages…"
                      style={{ border: 'none', outline: 'none', fontSize: 12.5, width: '100%', background: 'transparent' }}
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {filteredAvailable.length === 0 ? (
                      <div style={{ padding: 12, textAlign: 'center', color: '#94A3B8', fontSize: 12.5 }}>No languages found.</div>
                    ) : (
                      filteredAvailable.map(l => (
                        <button
                          key={l.value}
                          type="button"
                          onClick={() => { toggleLang(l.value); setLangSearch('') }}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            width: '100%', padding: '9px 12px', textAlign: 'left',
                            border: 'none', borderBottom: '1px solid #F8FAFC', background: '#FFFFFF',
                            cursor: 'pointer', fontSize: 13, color: '#0F172A',
                          }}
                        >
                          {l.label}
                          <Plus size={13} color="#94A3B8" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div style={{ padding: '14px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Loader2 size={18} className="animate-spin" color="#16A34A" />
              <div style={{ fontSize: 12.5, color: '#166534', fontWeight: 600 }}>
                {loadingStep || 'Generating problem with AI...'}
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle size={16} color="#DC2626" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 12.5, color: '#991B1B' }}>
                <div><strong>Generation Error:</strong> {error}</div>
                <button type="button" onClick={handleGenerate} style={{ marginTop: 6, background: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  Retry Generation
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} disabled={loading} style={btnOutline}>Cancel</button>
            <button type="submit" disabled={loading || !topic.trim()} style={{ ...btnPrimary, background: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate with AI</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProblemFormModal({ assessmentId, existingProblem, onClose, onSaved, auth, toast }) {
  useEffect(() => {
    console.log('[EDIT_MODAL_DATA] problemId=%s title="%s" languagesCount=%d',
      existingProblem?.id, existingProblem?.title, (existingProblem?.languages || []).length);
  }, [existingProblem]);

  const [form, setForm] = useState({
    title: existingProblem?.title || '',
    description: existingProblem?.description || '',
    difficulty: existingProblem?.difficulty || 'EASY',
    marks: existingProblem?.marks || 10,
    timeLimit: existingProblem?.timeLimit || 2,
    memoryLimit: existingProblem?.memoryLimit || 256,
    constraints: existingProblem?.constraints || '',
    inputFormat: existingProblem?.inputFormat || '',
    outputFormat: existingProblem?.outputFormat || '',
    explanation: existingProblem?.explanation || '',
  })

  const [requiredConcepts, setRequiredConcepts] = useState(() => {
    if (Array.isArray(existingProblem?.requiredConcepts)) {
      return existingProblem.requiredConcepts
    }
    return []
  })

  const [customConcept, setCustomConcept] = useState('')

  const [languages, setLanguages] = useState(() => {
    if (existingProblem?.languages && existingProblem.languages.length) {
      return existingProblem.languages.map(l => ({
        language: l.language,
        starterCode: (l.starterCode != null && String(l.starterCode).trim())
          ? l.starterCode
          : getDefaultStarterCode(l.language, existingProblem),
        referenceSolution: (l.referenceSolution != null && String(l.referenceSolution).trim())
          ? l.referenceSolution
          : getDefaultReferenceSolution(l.language, existingProblem),
      }))
    }
    if (existingProblem?.languageSolutions && typeof existingProblem.languageSolutions === 'object') {
      const entries = Object.entries(existingProblem.languageSolutions)
      if (entries.length > 0) {
        return entries.map(([lang, sol]) => ({
          language: lang,
          starterCode: (sol?.starterCode != null && String(sol.starterCode).trim())
            ? sol.starterCode
            : getDefaultStarterCode(lang, existingProblem),
          referenceSolution: (sol?.referenceSolution != null && String(sol.referenceSolution).trim())
            ? sol.referenceSolution
            : getDefaultReferenceSolution(lang, existingProblem),
        }))
      }
    }
    const legacy = existingProblem?.programmingLanguage || 'javascript'
    return [{
      language: legacy,
      starterCode: (existingProblem?.starterCode != null && String(existingProblem.starterCode).trim())
        ? existingProblem.starterCode
        : getDefaultStarterCode(legacy, existingProblem),
      referenceSolution: (existingProblem?.expectedSolution != null && String(existingProblem.expectedSolution).trim())
        ? existingProblem.expectedSolution
        : getDefaultReferenceSolution(legacy, existingProblem),
    }]
  })
  const [activeLangTab, setActiveLangTab] = useState(null)
  const [langSearch, setLangSearch] = useState('')
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const [testCases, setTestCases] = useState(() =>
    (existingProblem?.testCases || []).map((tc, idx) => ({
      _localId: tc.id ? `tc_${tc.id}` : `tc_loc_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      id: tc.id,
      input: tc.input != null ? String(tc.input) : '',
      expectedOutput: tc.expectedOutput != null ? String(tc.expectedOutput) : (tc.output != null ? String(tc.output) : ''),
      isHidden: Boolean(tc.isHidden),
      description: tc.description || '',
    }))
  )
  const [saving, setSaving] = useState(false)

  const selectedLangIds = languages.map(l => l.language)
  const activeLang = activeLangTab || languages[0]?.language || null
  const availableLangs = LANGUAGES.filter(l => !selectedLangIds.includes(l.value))
  const activeLangObj = languages.find(l => l.language === activeLang)
  const filteredAvailable = availableLangs.filter(l =>
    l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
    l.value.toLowerCase().includes(langSearch.toLowerCase())
  )

  const toggleConcept = (id) => {
    setRequiredConcepts(prev => {
      const exists = prev.some(c => (typeof c === 'string' ? c === id : c.id === id))
      if (exists) {
        return prev.filter(c => (typeof c === 'string' ? c !== id : c.id !== id))
      }
      return [...prev, id]
    })
  }

  const addCustomConcept = () => {
    if (!customConcept.trim()) return
    const query = customConcept.trim()
    setRequiredConcepts(prev => [...prev, { id: 'custom', mode: 'contains', query, label: query }])
    setCustomConcept('')
  }

  const removeConceptByIndex = (idx) => {
    setRequiredConcepts(prev => prev.filter((_, i) => i !== idx))
  }

  const isConceptActive = (id) => {
    return requiredConcepts.some(c => (typeof c === 'string' ? c === id : c.id === id))
  }

  const updateActiveLang = (field, val) => {
    if (!activeLang) return
    setLanguages(prev => prev.map(l => (l.language === activeLang ? { ...l, [field]: val } : l)))
  }

  const selectLangTab = (langId) => {
    setActiveLangTab(langId)
  }

  const toggleLang = (id) => {
    if (selectedLangIds.includes(id)) {
      if (languages.length === 1) {
        toast.error('At least one language is required')
        return
      }
      setLanguages(prev => prev.filter(l => l.language !== id))
      if (activeLang === id) setActiveLangTab(null)
    } else {
      const newStarter = getDefaultStarterCode(id, form)
      const newRef = getDefaultReferenceSolution(id, form)
      setLanguages(prev => [...prev, {
        language: id,
        starterCode: newStarter,
        referenceSolution: newRef,
      }])
      setActiveLangTab(id)
    }
  }

  const updateTc = (i, key, val) => {
    setTestCases(prev => prev.map((tc, idx) => (idx === i ? { ...tc, [key]: val } : tc)))
  }
  const addTc = () => setTestCases(prev => [
    ...prev,
    {
      _localId: `tc_new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      input: '',
      expectedOutput: '',
      isHidden: false,
      description: '',
    }
  ])
  const removeTc = (i) => setTestCases(prev => prev.filter((_, idx) => idx !== i))
  const moveTc = (i, dir) => {
    setTestCases(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(i, 1)
      copy.splice(j, 0, item)
      return copy
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!languages.length) {
      toast.error('Select at least one language')
      return
    }
    if (languages.some(l => !l.referenceSolution.trim())) {
      toast.error('Provide a reference solution for every selected language')
      return
    }
    setSaving(true)
    try {
      const languageSolutions = {}
      for (const l of languages) {
        languageSolutions[l.language] = {
          starterCode: l.starterCode,
          referenceSolution: l.referenceSolution,
        }
      }

      const cleanTestCases = testCases.map((tc, idx) => ({
        input: tc.input != null ? String(tc.input) : '',
        expectedOutput: tc.expectedOutput != null ? String(tc.expectedOutput) : '',
        isHidden: Boolean(tc.isHidden),
        description: tc.description || '',
        order: idx,
      }))

      const payload = {
        ...form,
        requiredConcepts,
        languages: languages.map(l => ({
          language: l.language,
          starterCode: l.starterCode,
          referenceSolution: l.referenceSolution,
          starterCodeSource: 'manual',
          referenceSolutionSource: 'manual',
          generationStatus: 'completed',
        })),
        languageSolutions,
        testCases: cleanTestCases,
      }
      if (!existingProblem && !assessmentId) {
        throw new Error('Assessment ID is required')
      }
      const url = existingProblem
        ? API.CODING.UPDATE_PROBLEM(existingProblem.id)
        : API.CODING.CREATE_PROBLEM(assessmentId)
      const r = await fetch(url, {
        method: existingProblem ? 'PUT' : 'POST',
        headers: auth ? auth() : { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.success === false) {
        throw new Error(d.message || d.error || 'Save failed')
      }
      toast.success(existingProblem ? 'Problem updated' : 'Problem created')
      onSaved(d.problem || d.data || { ...payload, id: existingProblem?.id || d.id })
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000002,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      {/* Modal: flex column; content area has contained scrolling. Header stays fixed. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 980,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column', minHeight: 0,
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        <div style={{
          flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px 14px', borderBottom: '1px solid #F1F5F9', background: '#FFFFFF',
        }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A' }}>
            {existingProblem ? 'Edit Problem' : 'Add Problem'}
          </h3>
          <button type="button" onClick={onClose} style={iconBtn('#F1F5F9', '#64748B')} title="Close"><X size={14} /></button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
            overscrollBehavior: 'contain',
            padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <div>
            <label style={lblStyle}>Title *</label>
            <input style={inputStyle} required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label style={lblStyle}>Description *</label>
            <textarea style={textareaStyle} rows={4} required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lblStyle}>Difficulty</label>
              <select style={selectStyle} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label style={lblStyle}>Marks</label>
              <input style={inputStyle} type="number" min={1} value={form.marks} onChange={e => setForm({ ...form, marks: parseInt(e.target.value) || 10 })} />
            </div>
            <div>
              <label style={lblStyle}>Time / Memory Limit (defaults)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputStyle} type="number" min={1} value={form.timeLimit} onChange={e => setForm({ ...form, timeLimit: parseInt(e.target.value) || 2 })} title="Time limit (seconds)" />
                <input style={inputStyle} type="number" min={32} value={form.memoryLimit} onChange={e => setForm({ ...form, memoryLimit: parseInt(e.target.value) || 256 })} title="Memory limit (MB)" />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lblStyle}>Problem Constraints (Time/Memory/Bounds)</label>
              <textarea style={textareaStyle} rows={2} placeholder="e.g. 1 <= N <= 10^5, Time Limit: 5.0s, Memory Limit: 256MB" value={form.constraints} onChange={e => setForm({ ...form, constraints: e.target.value })} />
            </div>
            <div>
              <label style={lblStyle}>Input Format</label>
              <textarea style={textareaStyle} rows={2} value={form.inputFormat} onChange={e => setForm({ ...form, inputFormat: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lblStyle}>Output Format</label>
              <textarea style={textareaStyle} rows={2} value={form.outputFormat} onChange={e => setForm({ ...form, outputFormat: e.target.value })} />
            </div>
            <div>
              <label style={lblStyle}>Explanation (optional)</label>
              <textarea style={textareaStyle} rows={2} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} />
            </div>
          </div>

          {/* ── Required Concepts / Code Requirements (Separated from Constraints) ── */}
          <div style={{ border: '1px solid #E0E7FF', borderRadius: 12, padding: 14, background: '#EEF2FF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...lblStyle, margin: 0, color: '#3730A3', fontSize: 13 }}>
                Required Concepts / Code Requirements
              </label>
              <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 600 }}>Language-aware AST / Syntax validation</span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#4338CA' }}>
              Participant submissions will be checked for these required concepts. If missing, submission verdict will be <strong>FAILED REQUIREMENTS</strong>.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {[
                { id: 'for_loop', label: 'for loop' },
                { id: 'while_loop', label: 'while loop' },
                { id: 'if_else', label: 'if/else' },
                { id: 'function', label: 'function' },
                { id: 'recursion', label: 'recursion' },
                { id: 'array', label: 'array / list' },
                { id: 'class', label: 'class' },
              ].map(c => {
                const active = isConceptActive(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleConcept(c.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: active ? '#4F46E5' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#4338CA',
                      border: active ? '1px solid #4F46E5' : '1px solid #C7D2FE',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    {active && <Check size={12} />}
                    {c.label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...inputStyle, background: '#FFFFFF', flex: 1 }}
                placeholder="Add custom required concept/pattern (e.g. binary_search, math.sqrt)..."
                value={customConcept}
                onChange={e => setCustomConcept(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomConcept() } }}
              />
              <button
                type="button"
                onClick={addCustomConcept}
                style={{ ...btnOutline, background: '#FFFFFF', color: '#4338CA', borderColor: '#C7D2FE', padding: '8px 14px', fontSize: 12.5 }}
              >
                <Plus size={13} style={{ marginRight: 4 }} /> Add Custom
              </button>
            </div>

            {requiredConcepts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {requiredConcepts.map((concept, idx) => {
                  const labelText = typeof concept === 'string' ? concept : (concept.label || concept.query || concept.id)
                  return (
                    <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#FFFFFF', color: '#4338CA', border: '1px solid #C7D2FE', borderRadius: 999, padding: '3px 8px', fontSize: 11.5, fontWeight: 600 }}>
                      Requirement: {labelText}
                      <button type="button" onClick={() => removeConceptByIndex(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 1, color: '#DC2626' }}>
                        <X size={11} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Languages multi-select ── */}
          <div>
            <label style={lblStyle}>Languages * ({languages.length} selected)</label>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', border: '1px solid #CBD5E1', borderRadius: 10, padding: '8px 10px', background: '#FFFFFF', minHeight: 42, cursor: 'pointer' }} onClick={() => setLangDropdownOpen(o => !o)}>
                {selectedLangIds.length === 0 ? (
                  <span style={{ fontSize: 12.5, color: '#94A3B8' }}>Select one or more languages…</span>
                ) : (
                  selectedLangIds.map(id => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE', borderRadius: 999, padding: '3px 6px 3px 9px', fontSize: 11.5, fontWeight: 600 }}>
                      {languageLabel(id)}
                      <button type="button" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, color: '#6D28D9' }} onClick={(e) => { e.stopPropagation(); toggleLang(id) }} title="Remove language">
                        <X size={11} />
                      </button>
                    </span>
                  ))
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', color: '#64748B' }}><ChevronDown size={14} /></span>
              </div>

              {langDropdownOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                    <Search size={13} color="#94A3B8" />
                    <input
                      autoFocus
                      value={langSearch}
                      onChange={e => setLangSearch(e.target.value)}
                      placeholder="Search languages…"
                      style={{ border: 'none', outline: 'none', fontSize: 12.5, width: '100%', background: 'transparent' }}
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {filteredAvailable.length === 0 ? (
                      <div style={{ padding: 12, textAlign: 'center', color: '#94A3B8', fontSize: 12.5 }}>No languages found.</div>
                    ) : (
                      filteredAvailable.map(l => (
                        <button
                          key={l.value}
                          type="button"
                          onClick={() => { toggleLang(l.value); setLangSearch('') }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '9px 12px', textAlign: 'left', border: 'none', borderBottom: '1px solid #F8FAFC', background: '#FFFFFF', cursor: 'pointer', fontSize: 13, color: '#0F172A' }}
                        >
                          {l.label}
                          <Plus size={13} color="#94A3B8" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Per-language tabs ── */}
          {languages.length > 0 && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, background: '#FAFBFD' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {languages.map(l => (
                  <button
                    key={l.language}
                    type="button"
                    onClick={() => selectLangTab(l.language)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: activeLang === l.language ? '#6D28D9' : '#F1F5F9',
                      color: activeLang === l.language ? '#FFFFFF' : '#334155',
                      border: activeLang === l.language ? '1px solid #6D28D9' : '1px solid #E2E8F0',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {languageLabel(l.language)}
                    {l.generating ? <Loader2 size={11} className="animate-spin" /> : (!l.referenceSolution.trim() && <span style={{ marginLeft: 2, color: activeLang === l.language ? '#FDE68A' : '#F59E0B' }}>*</span>)}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ ...lblStyle, marginBottom: 6, fontSize: 12.5 }}>Starter Code ({languageLabel(activeLang)})</label>
                  <div style={{ marginTop: 4 }}>
                    <MonoField
                      key={`${activeLang}_starter`}
                      language={activeLang}
                      value={activeLangObj?.starterCode || ''}
                      onChange={(v) => updateActiveLang('starterCode', v || '')}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ ...lblStyle, marginBottom: 6, fontSize: 12.5 }}>
                    Reference Solution ({languageLabel(activeLang)}) * — used to auto-validate the problem
                  </label>
                  <div style={{ marginTop: 4 }}>
                    <MonoField
                      key={`${activeLang}_ref`}
                      language={activeLang}
                      value={activeLangObj?.referenceSolution || ''}
                      onChange={(v) => updateActiveLang('referenceSolution', v || '')}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 11.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={13} /> Starter code is an optional template participants may rewrite. Reference solution stays server-side (never visible to participants). Test cases are shared across all languages; each language&apos;s reference must pass them before publishing.
              </div>
            </div>
          )}

          {/* ── Test case manager ── */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ ...lblStyle, margin: 0, fontSize: 13 }}>Test Cases ({testCases.length})</label>
              <button type="button" onClick={addTc} style={{ ...btnOutline, padding: '5px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={13} /> Add Test Case
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10 }}>
              Hidden test cases are never shown to participants. Mark them with <ShieldCheck size={12} style={{ verticalAlign: 'middle', display: 'inline' }} /> Hidden.
            </div>
            {testCases.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12.5, padding: 16 }}>
                No test cases yet. Add at least one visible (sample) and a few hidden cases.
              </div>
            ) : (
              testCases.map((tc, i) => (
                <div key={tc._localId || tc.id || `tc_idx_${i}`} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 26, textAlign: 'center', paddingTop: 8, fontWeight: 700, color: '#94A3B8', fontSize: 12 }}>{i + 1}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" onClick={() => moveTc(i, -1)} disabled={i === 0} style={{ ...iconBtn('#F1F5F9', '#64748B'), width: 24, height: 24, opacity: i === 0 ? 0.4 : 1 }} title="Move up"><ChevronUp size={12} /></button>
                      <button type="button" onClick={() => moveTc(i, 1)} disabled={i === testCases.length - 1} style={{ ...iconBtn('#F1F5F9', '#64748B'), width: 24, height: 24, opacity: i === testCases.length - 1 ? 0.4 : 1 }} title="Move down"><ChevronDown size={12} /></button>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <textarea style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 34, height: 34, resize: 'vertical' }} rows={1} placeholder="Input" value={tc.input} onChange={e => updateTc(i, 'input', e.target.value)} />
                    <textarea style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 34, height: 34, resize: 'vertical' }} rows={1} placeholder="Expected output" value={tc.expectedOutput} onChange={e => updateTc(i, 'expectedOutput', e.target.value)} />
                    <input style={inputStyle} placeholder="Description (e.g. Edge case)" value={tc.description} onChange={e => updateTc(i, 'description', e.target.value)} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: tc.isHidden ? '#7C3AED' : '#64748B', cursor: 'pointer' }}>
                        <input type="checkbox" checked={tc.isHidden} onChange={e => updateTc(i, 'isHidden', e.target.checked)} />
                        <ShieldCheck size={12} /> Hidden
                      </label>
                      <button type="button" onClick={() => removeTc(i)} style={iconBtn('#FEF2F2', '#DC2626')} title="Remove test case"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancel</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Saving…' : 'Save Problem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. PARTICIPANTS TAB
   ───────────────────────────────────────────────────────────────────────────── */
function ParticipantsTab({ assessment, auth, toast }) {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    fetch(API.CODING.PARTICIPANTS(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => { setParticipants(d.participants || []) })
      .catch(() => toast.error('Failed to load participants'))
      .finally(() => setLoading(false))
  }, [assessment.id])

  useEffect(() => {
    setPage(1)
  }, [search])

  const filtered = useMemo(() => {
    if (!search) return participants
    const q = search.toLowerCase()
    return participants.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    )
  }, [participants, search])

  const pagedParticipants = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
          {participants.length} Participants
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 8, width: 240 }}>
          <Search size={14} color="#94A3B8" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search participants…"
            style={{ border: 'none', outline: 'none', fontSize: 12.5, width: '100%', background: 'transparent' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading participants…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No participants found.</div>
      ) : (
        <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>EMAIL</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>ATTEMPT STATUS</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'right' }}>SUBMITTED</th>
              </tr>
            </thead>
            <tbody>
              {pagedParticipants.map(p => (
                <tr key={p.id || p.participantId} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>{p.name || 'Participant'}</td>
                  <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{p.email || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#EAF8F0', color: '#16A34A' }}>
                      {p.attemptStatus || 'Completed'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>{p.score != null ? `${p.score}` : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B', fontSize: 12 }}>{p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            recordLabel="participants"
          />
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   4. RESULTS TAB
   ───────────────────────────────────────────────────────────────────────────── */
function ResultsTab({ assessment, auth, toast, onRefresh }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProctorAttempt, setSelectedProctorAttempt] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    fetch(API.CODING.RESULTS(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => { setResults(d.results || []) })
      .catch(() => toast.error('Failed to load results'))
      .finally(() => setLoading(false))
  }, [assessment.id])

  useEffect(() => {
    setPage(1)
  }, [search])

  const filtered = useMemo(() => {
    if (!search) return results
    const q = search.toLowerCase()
    return results.filter(r =>
      (r.participantName || r.name || '').toLowerCase().includes(q) ||
      (r.participant?.email || r.email || '').toLowerCase().includes(q)
    )
  }, [results, search])

  const pagedResults = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
          {results.length} Results
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 8, width: 240 }}>
          <Search size={14} color="#94A3B8" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search results…"
            style={{ border: 'none', outline: 'none', fontSize: 12.5, width: '100%', background: 'transparent' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading results…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No submissions yet.</div>
      ) : (
        <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>PERCENTAGE</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>STATUS</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>PROCTORING</th>
              </tr>
            </thead>
            <tbody>
              {pagedResults.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>{r.participantName || r.name || `Participant #${r.participantId}`}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>{r.score ?? '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>{r.percentage != null ? `${Math.round(r.percentage)}%` : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#EAF8F0', color: '#16A34A' }}>
                      Submitted
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => setSelectedProctorAttempt(r.attemptId || r.id)}
                      style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', cursor: 'pointer' }}
                    >
                      <Shield size={12} style={{ marginRight: 4 }} /> Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            recordLabel="results"
          />
        </div>
      )}

      {selectedProctorAttempt && (
        <SingleAttemptProctoringModal
          attemptId={selectedProctorAttempt}
          auth={auth}
          onClose={() => setSelectedProctorAttempt(null)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. LEADERBOARD TAB
   ───────────────────────────────────────────────────────────────────────────── */
function LeaderboardTab({ assessment, auth }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    fetch(API.CODING.LEADERBOARD(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false))
  }, [assessment.id])

  const pagedLeaderboard = leaderboard.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Trophy size={18} color="#D97706" /> Leaderboard
      </h3>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading leaderboard…</div>
      ) : leaderboard.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No rankings available yet.</div>
      ) : (
        <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 60, textAlign: 'center' }}>RANK</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>TIME</th>
              </tr>
            </thead>
            <tbody>
              {pagedLeaderboard.map((l, i) => {
                const rankNum = (page - 1) * pageSize + i + 1
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {rankNum === 1 ? (
                        <span style={{ padding: '3px 8px', background: '#FEF3C7', color: '#B45309', borderRadius: 9999, fontWeight: 800, fontSize: 11, border: '1px solid #FCD34D' }}>#1</span>
                      ) : rankNum === 2 ? (
                        <span style={{ padding: '3px 8px', background: '#F1F5F9', color: '#475569', borderRadius: 9999, fontWeight: 800, fontSize: 11, border: '1px solid #CBD5E1' }}>#2</span>
                      ) : rankNum === 3 ? (
                        <span style={{ padding: '3px 8px', background: '#FFF7ED', color: '#C2410C', borderRadius: 9999, fontWeight: 800, fontSize: 11, border: '1px solid #FDBA74' }}>#3</span>
                      ) : (
                        <span style={{ fontWeight: 700, color: '#64748B', fontSize: 12 }}>#{rankNum}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <UserAvatar
                          src={l.avatar || l.profilePic || l.profileImage || l.image}
                          name={l.name || l.participantName}
                          size={32}
                          fontSize={11}
                          rank={rankNum}
                        />
                        <span style={{ fontWeight: 600, color: '#0F172A', fontSize: 13.5 }}>
                          {l.name || l.participantName || `Participant #${l.participantId}`}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>{l.score ?? l.percentage ?? '—'}%</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontSize: 12.5 }}>{l.timeTaken ? `${l.timeTaken}s` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(leaderboard.length / pageSize))}
            totalItems={leaderboard.length}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            recordLabel="performers"
          />
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. ANALYTICS TAB
   ───────────────────────────────────────────────────────────────────────────── */
function AnalyticsTab({ assessment, auth }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(API.CODING.RESULTS_SUMMARY(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => setSummary(d))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false))
  }, [assessment.id])

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
        Coding Assessment Analytics
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TOTAL PARTICIPANTS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{summary?.enrolled || 0}</div>
        </div>
        <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>COMPLETED</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{summary?.completed || 0}</div>
        </div>
        <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>AVERAGE SCORE</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{summary?.averageScore != null ? `${Math.round(summary.averageScore)}%` : '—'}</div>
        </div>
        <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>PASS RATE</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{summary?.passRate != null ? `${Math.round(summary.passRate)}%` : '—'}</div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   7. SETTINGS TAB
   ───────────────────────────────────────────────────────────────────────────── */
function SettingsTab({ assessment, onRefresh, auth, toast }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: assessment.title || '',
    timeLimit: assessment.timeLimit || 120,
    maxAttempts: assessment.maxAttempts || 1,
    passingMarks: assessment.passingMarks || 50,
    aiAssistantEnabled: assessment.aiAssistantEnabled !== false,
    aiHelpLimit: assessment.aiHelpLimit ?? 1,
  })

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch(API.CODING.UPDATE(assessment.id), {
        method: 'PUT', headers: auth(),
        body: JSON.stringify(form),
      })
      if (!r.ok) throw new Error('Update failed')
      toast.success('Settings updated')
      onRefresh()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22, maxWidth: 600 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
        Assessment Settings
      </h3>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={lblStyle}>Title</label>
          <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lblStyle}>Time Limit (minutes)</label>
            <input style={inputStyle} type="number" min={1} value={form.timeLimit} onChange={e => setForm({ ...form, timeLimit: parseInt(e.target.value) || 60 })} />
          </div>
          <div>
            <label style={lblStyle}>Max Attempts</label>
            <input style={inputStyle} type="number" min={1} value={form.maxAttempts} onChange={e => setForm({ ...form, maxAttempts: parseInt(e.target.value) || 1 })} />
          </div>
        </div>

        {/* ── AI Student Assistant settings ── */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, background: '#FAFBFD' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color="#7C3AED" /> AI Student Assistant
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.aiAssistantEnabled} onChange={e => setForm({ ...form, aiAssistantEnabled: e.target.checked })} />
              Enable AI hints for participants
            </label>
            <div>
              <label style={{ ...lblStyle, margin: 0, fontSize: 12.5 }}>Hints allowed per question (0 = disabled, -1 = unlimited)</label>
              <input style={inputStyle} type="number" min={-1} value={form.aiHelpLimit} onChange={e => setForm({ ...form, aiHelpLimit: parseInt(e.target.value) || 0 })} />
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>
                Hints are Socratic (guided questions, never full solutions). When exhausted, participants are blocked.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
