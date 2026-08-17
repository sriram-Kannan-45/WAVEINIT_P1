import { useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Settings, Users, BarChart3, Trophy, FileText,
  Plus, Pencil, Trash2, Save, X, Check, Send, Loader2, Star,
  Search, Clock, Calendar, AlertCircle, RefreshCw,
  Code, Shield, ShieldCheck, Copy, Info, BarChart2, Sparkles,
  Eye, MoreVertical
} from 'lucide-react'
import { SingleAttemptProctoringModal } from '../proctoring/components/TrainerMonitoringReport'
import { API } from '../api/api'
import { useToast } from '../components/Toast'
import CodeEditor from '../components/CodeEditor'
import {
  colors, btnPrimary, btnSuccess, btnDanger, btnOutline, iconBtn,
  lblStyle, inputStyle, selectStyle, textareaStyle,
} from '../theme/tokens'
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
  const auth = () => ({ Authorization: `Bearer ${user?.token}`, 'Content-Type': 'application/json' })

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

  const fetchAssessment = useCallback(async () => {
    if (!assessmentId) return
    setLoading(true)
    try {
      const r = await fetch(API.CODING.DETAIL(assessmentId), { headers: auth() })
      const d = await r.json()
      if (d.assessment) {
        setAssessment(d.assessment)
        setEditForm({
          title: d.assessment.title || '',
          description: d.assessment.description || '',
          timeLimit: d.assessment.timeLimit || 120,
          languages: d.assessment.languages || ['javascript', 'python'],
        })
      } else {
        toast.error('Assessment not found')
      }
    } catch (e) {
      toast.error('Failed to load assessment')
    } finally {
      setLoading(false)
    }
  }, [assessmentId])

  useEffect(() => { fetchAssessment() }, [fetchAssessment])

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const r = await fetch(API.CODING.PUBLISH(assessmentId), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Publish failed')
      toast.success('Assessment published')
      fetchAssessment()
      onRefresh?.()
    } catch (e) { toast.error(e.message) }
    finally { setPublishing(false) }
  }

  const handleCloseAssessment = async () => {
    if (!confirm('Close this assessment? Participants will no longer be able to submit.')) return
    try {
      const r = await fetch(API.CODING.CLOSE(assessmentId), { method: 'POST', headers: auth() })
      if (!r.ok) throw new Error('Close failed')
      toast.success('Assessment closed')
      fetchAssessment()
      onRefresh?.()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this assessment permanently? This cannot be undone.')) return
    try {
      const r = await fetch(API.CODING.DELETE(assessmentId), { method: 'DELETE', headers: auth() })
      if (!r.ok) throw new Error('Delete failed')
      toast.success('Assessment deleted')
      onRefresh?.()
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
      toast.success('Assessment updated successfully')
      setEditingAssessment(false)
      fetchAssessment()
      onRefresh?.()
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
      onClick={onClose}
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
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#DC2626' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Assessment details not found</div>
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
                {assessment.status === 'DRAFT' && (
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 36, padding: '0 16px', background: '#16A34A', border: 'none',
                      borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#FFFFFF', cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)', transition: 'all 150ms ease', fontFamily: 'inherit',
                      opacity: publishing ? 0.6 : 1
                    }}
                  >
                    {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {publishing ? 'Publishing…' : 'Publish Assessment'}
                  </button>
                )}

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
                  <ProblemsTab assessment={assessment} onRefresh={fetchAssessment} auth={auth} toast={toast} />
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
  const statCards = [
    {
      icon: FileText,
      label: 'Problems',
      value: assessment.problems?.length ?? assessment.numProblems ?? 1,
      subtitle: 'Total Problems'
    },
    {
      icon: Clock,
      label: 'Duration',
      value: `${assessment.timeLimit || 120} minutes`,
      subtitle: 'Total Time'
    },
    {
      icon: Code,
      label: 'Languages',
      value: (assessment.languages && assessment.languages.length > 0 ? assessment.languages.join(', ') : 'javascript, python'),
      subtitle: 'Allowed Languages'
    },
    {
      icon: RefreshCw,
      label: 'Attempts Allowed',
      value: assessment.maxAttempts || 1,
      subtitle: 'Per Participant'
    },
    {
      icon: Star,
      label: 'Total Marks',
      value: assessment.totalMarks ? Number(assessment.totalMarks).toFixed(2) : '10.00',
      subtitle: 'Maximum Marks'
    },
    {
      icon: Calendar,
      label: 'Created',
      value: assessment.createdAt
        ? new Date(assessment.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '15 Aug 2025, 10:30 AM',
      subtitle: `By ${trainerDisplayName}`
    },
    {
      icon: BarChart2,
      label: 'Difficulty',
      value: assessment.difficulty || 'EASY',
      subtitle: 'Challenge Level'
    },
    {
      icon: Users,
      label: 'Participants',
      value: assessment.participantCount ?? '—',
      subtitle: 'Enrolled'
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── 8 Statistics Cards Grid (4 columns × 2 rows) ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
      }}>
        {statCards.map((c, i) => {
          const Icon = c.icon
          return (
            <div
              key={i}
              style={{
                background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#EAF8F0',
                color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon size={18} strokeWidth={2.2} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#64748B', marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 400, color: '#94A3B8', marginTop: 2 }}>{c.subtitle}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Description & Instructions 2-Column Card ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16,
        padding: '20px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32
      }}>
        {/* Left Column: Description */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={17} color="#16A34A" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Description</h3>
          </div>
          <p style={{
            margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6,
            fontWeight: 400
          }}>
            {assessment.description || 'Solve the basic output problems and demonstrate your understanding of core programming concepts.'}
          </p>
        </div>

        {/* Right Column: Instructions */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Info size={17} color="#16A34A" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Instructions</h3>
          </div>
          <ul style={{
            margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#475569',
            lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 3
          }}>
            <li>Read each problem carefully before writing code.</li>
            <li>Your code will be tested with multiple test cases.</li>
            <li>Make sure your output matches the expected format.</li>
            <li>No external libraries are allowed unless specified.</li>
          </ul>
        </div>
      </div>

      {/* ── Bottom Status Section Bar ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
        padding: '14px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16
      }}>
        {/* Published Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={17} color="#16A34A" />
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: '#94A3B8' }}>Published on</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>
              {assessment.publishedAt
                ? new Date(assessment.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '15 Aug 2025, 11:00 AM'}
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RefreshCw size={17} color="#16A34A" />
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: '#94A3B8' }}>Last updated</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>
              {assessment.updatedAt
                ? new Date(assessment.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '15 Aug 2025, 11:00 AM'}
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8' }}>Status</div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: '#EAF8F0', color: '#16A34A'
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
function ProblemsTab({ assessment, onRefresh, auth, toast }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProblem, setEditingProblem] = useState(null)
  const [showAIWizard, setShowAIWizard] = useState(false)
  const problems = assessment.problems || []

  const handleDeleteProblem = async (probId) => {
    if (!confirm('Delete this problem?')) return
    try {
      const r = await fetch(API.CODING.DELETE_PROBLEM(probId), { method: 'DELETE', headers: auth() })
      if (!r.ok) throw new Error('Delete failed')
      toast.success('Problem deleted')
      onRefresh()
    } catch (e) { toast.error(e.message) }
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
          <button onClick={() => { setEditingProblem(null); setModalOpen(true) }} style={{ ...btnPrimary, padding: '7px 16px', fontSize: 13 }}>
            <Plus size={13} style={{ marginRight: 4 }} /> Add Problem
          </button>
        </div>
      </div>

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
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748B', width: 100, textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={p.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}>
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
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => { setEditingProblem(p); setModalOpen(true) }} className="cqt-action-btn cqt-action-btn--edit" title="Edit Problem">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDeleteProblem(p.id)} className="cqt-action-btn cqt-action-btn--delete" title="Delete Problem">
                        <Trash2 size={12} />
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
          assessmentId={assessment.id}
          existingProblem={editingProblem}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); onRefresh() }}
          auth={auth}
          toast={toast}
        />
      )}
    </div>
  )
}

function ProblemFormModal({ assessmentId, existingProblem, onClose, onSaved, auth, toast }) {
  const [form, setForm] = useState({
    title: existingProblem?.title || '',
    description: existingProblem?.description || '',
    difficulty: existingProblem?.difficulty || 'EASY',
    marks: existingProblem?.marks || 10,
    timeLimit: existingProblem?.timeLimit || 2,
    memoryLimit: existingProblem?.memoryLimit || 256,
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const url = existingProblem
        ? API.CODING.UPDATE_PROBLEM(existingProblem.id)
        : API.CODING.ADD_PROBLEM(assessmentId)
      const r = await fetch(url, {
        method: existingProblem ? 'PUT' : 'POST',
        headers: auth(),
        body: JSON.stringify(form),
      })
      if (!r.ok) throw new Error('Save failed')
      toast.success(existingProblem ? 'Problem updated' : 'Problem created')
      onSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      zIndex: 1000002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 640, padding: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A' }}>
            {existingProblem ? 'Edit Problem' : 'Add Problem'}
          </h3>
          <button onClick={onClose} style={iconBtn('#F1F5F9', '#64748B')}><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lblStyle}>Title *</label>
            <input style={inputStyle} required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label style={lblStyle}>Description *</label>
            <textarea style={textareaStyle} rows={4} required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

  useEffect(() => {
    fetch(API.CODING.PARTICIPANTS(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => { setParticipants(d.participants || []) })
      .catch(() => toast.error('Failed to load participants'))
      .finally(() => setLoading(false))
  }, [assessment.id])

  const filtered = useMemo(() => {
    if (!search) return participants
    const q = search.toLowerCase()
    return participants.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    )
  }, [participants, search])

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
              {filtered.map(p => (
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

  useEffect(() => {
    fetch(API.CODING.RESULTS(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => { setResults(d.results || []) })
      .catch(() => toast.error('Failed to load results'))
      .finally(() => setLoading(false))
  }, [assessment.id])

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
        {results.length} Results
      </h3>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading results…</div>
      ) : results.length === 0 ? (
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
              {results.map((r, i) => (
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

  useEffect(() => {
    fetch(API.CODING.LEADERBOARD(assessment.id), { headers: auth() })
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false))
  }, [assessment.id])

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
              {leaderboard.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>{l.name || l.participantName || `Participant #${l.participantId}`}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>{l.score ?? '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontSize: 12.5 }}>{l.timeTaken ? `${l.timeTaken}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div style={{ marginTop: 8 }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
