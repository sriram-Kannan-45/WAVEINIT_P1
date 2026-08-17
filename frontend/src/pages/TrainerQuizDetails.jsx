import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Settings, Users, BarChart3, Trophy, FileText,
  Plus, Pencil, Trash2, Save, X, Send, Loader2, AlertTriangle, Eye, Star,
  Search, Clock, HelpCircle, CheckCircle2, AlertCircle, RefreshCw, Monitor, Ban, XCircle,
  Shield, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import { API, API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { TrainerProctoringDashboard } from '../proctoring'
import { SingleAttemptProctoringModal } from '../proctoring/components/TrainerMonitoringReport'

const STATUS_LABELS = {
  DRAFT: 'Draft', PUBLISHED: 'Published', CLOSED: 'Closed',
  RESULTS_PUBLISHED: 'Results Published', ARCHIVED: 'Archived',
}
const RESULT_LABELS = { HIDDEN: 'Hidden', PUBLISHED: 'Published' }

const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER', 'MATCHING']
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD']

const STATUS_BADGE = {
  DRAFT: { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' },
  PUBLISHED: { background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac' },
  CLOSED: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' },
  RESULTS_PUBLISHED: { background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd' },
  ARCHIVED: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
}
const RESULT_STATUS_BADGE = {
  HIDDEN: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  PUBLISHED: { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' },
}
const DIFF_BADGE = {
  EASY: { background: '#dcfce7', color: '#15803d' },
  MEDIUM: { background: '#fef3c7', color: '#92400e' },
  HARD: { background: '#fee2e2', color: '#dc2626' },
}
const ATTEMPT_STATUS = {
  NOT_STARTED: { bg: '#f1f5f9', fg: '#64748b', label: 'Not Started' },
  IN_PROGRESS: { bg: '#eff6ff', fg: '#2563eb', label: 'In Progress' },
  SUBMITTED: { bg: '#dcfce7', fg: '#15803d', label: 'Submitted' },
  COMPLETED: { bg: '#dcfce7', fg: '#15803d', label: 'Completed' },
  WAITING_RESULT: { badge: { background: '#fef3c7', color: '#92400e' }, label: 'Waiting Result' },
  RESULT_PUBLISHED: { bg: '#eff6ff', fg: '#2563eb', label: 'Result Published' },
  DISQUALIFIED: { bg: '#fee2e2', fg: '#dc2626', label: 'Disqualified' },
}
const PODIUM_COLORS = ['#F59E0B', '#94a3b8', '#d97706']
const MEDAL_COLORS = { 1: '#F59E0B', 2: '#94a3b8', 3: '#d97706' }

const smallDangerBtn = {
  width: 28, height: 28, borderRadius: 6, background: '#fee2e2', color: '#dc2626',
  border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0,
}
const addMoreBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 11,
  fontWeight: 600, color: '#475569', background: 'transparent', border: '1px solid #e2e8f0',
  borderRadius: 8, cursor: 'pointer',
}

export default function TrainerQuizDetails({ user, onLogout }) {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const auth = () => ({ Authorization: `Bearer ${user?.token}`, 'Content-Type': 'application/json' })

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('general')
  const [publishing, setPublishing] = useState(false)

  const fetchQuiz = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_DETAIL(quizId), { headers: auth() })
      const d = await r.json()
      if (d.quiz) setQuiz(d.quiz)
      else toast.error('Quiz not found')
    } catch (e) {
      toast.error('Failed to load quiz')
    } finally {
      setLoading(false)
    }
  }, [quizId])

  useEffect(() => { fetchQuiz() }, [fetchQuiz])

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.PUBLISH_QUIZ_NOW(quizId), {
        method: 'POST', headers: auth()
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Publish failed')
      toast.success('Quiz published successfully')
      fetchQuiz()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPublishing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this quiz permanently? This cannot be undone.')) return
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(quiz?.courseId || 0, quizId), {
        method: 'DELETE', headers: auth()
      })
      if (!r.ok) throw new Error('Delete failed')
      toast.success('Quiz deleted')
      navigate('/trainer')
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (loading) {
    return (
      <div className="reg-admin">
        <div className="reg-admin-loading">
          <Loader2 size={24} className="bulk-spin" />
          <span style={{ fontFamily: 'var(--font-primary)' }}>Loading quiz...</span>
        </div>
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="reg-admin">
        <div className="reg-admin-empty">
          <AlertCircle size={28} />
          <h3>Quiz not found</h3>
        </div>
      </div>
    )
  }

  const tabs = [
    { key: 'general',    label: 'General',    icon: FileText },
    { key: 'questions',  label: 'Questions',  icon: HelpCircle },
    { key: 'participants', label: 'Participants', icon: Users },
    ...(quiz.proctoringEnabled ? [{ key: 'proctor', label: 'Monitor Live', icon: Monitor }] : []),
    { key: 'results',    label: 'Results',    icon: BarChart3 },
    { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { key: 'analytics',  label: 'Analytics',  icon: Star },
    { key: 'settings',   label: 'Settings',   icon: Settings },
  ]

  return (
    <div className="reg-admin">
      <div className="reg-admin-header">
        <button className="reg-admin-btn reg-admin-btn--secondary" style={{ cursor: 'pointer' }} onClick={() => navigate('/trainer')}>
          <ArrowLeft size={14} /> Back to Courses
        </button>
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
          <FileText size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="reg-admin-title">{quiz.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="reg-admin-status" style={{ ...(STATUS_BADGE[quiz.status] || STATUS_BADGE.DRAFT) }}>{STATUS_LABELS[quiz.status] || 'Draft'}</span>
            <span className="reg-admin-status" style={{ ...(RESULT_STATUS_BADGE[quiz.resultStatus] || RESULT_STATUS_BADGE.HIDDEN) }}>Results: {RESULT_LABELS[quiz.resultStatus] || 'Hidden'}</span>
            {quiz.course && <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-primary)' }}>Course: {quiz.course.title}</span>}
            {quiz.training && <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-primary)' }}>Training: {quiz.training.title}</span>}
            <span style={{ fontSize: 12, color: '#94a3b8' }}>•</span>
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-primary)' }}>{quiz.questions?.length || 0} questions</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>•</span>
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-primary)' }}>{quiz.timeLimit || 30} min</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', marginBottom: 24, overflow: 'auto' }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#16A34A' : '#64748b',
                background: 'transparent',
                borderBottom: active ? '2px solid #16A34A' : '2px solid transparent',
                marginBottom: -2, whiteSpace: 'nowrap',
                fontFamily: 'var(--font-primary)',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div key={activeTab}>
        {activeTab === 'general' && (
          <GeneralTab quiz={quiz} onPublish={handlePublish} onDelete={handleDelete} publishing={publishing} onRefresh={fetchQuiz} auth={auth} />
        )}
        {activeTab === 'questions' && (
          <QuestionsTab quiz={quiz} onRefresh={fetchQuiz} auth={auth} toast={toast} />
        )}
        {activeTab === 'participants' && (
          <ParticipantsTab quiz={quiz} auth={auth} toast={toast} />
        )}
        {activeTab === 'proctor' && (
          <TrainerProctoringDashboard quizId={Number(quizId)} quizTitle={quiz.title} />
        )}
        {activeTab === 'results' && (
          <ResultsTab quiz={quiz} onRefresh={fetchQuiz} auth={auth} toast={toast} />
        )}
        {activeTab === 'leaderboard' && (
          <LeaderboardTab quiz={quiz} auth={auth} />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab quiz={quiz} auth={auth} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab quiz={quiz} onRefresh={fetchQuiz} auth={auth} toast={toast} />
        )}
      </div>
    </div>
  )
}

function GeneralTab({ quiz, onPublish, onDelete, publishing, onRefresh, auth }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: quiz.title, description: quiz.description || '', timeLimit: quiz.timeLimit || 30 })

  const handleSave = async () => {
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(quiz.courseId || 0, quiz.id), {
        method: 'PUT', headers: auth(),
        body: JSON.stringify(form)
      })
      if (!r.ok) throw new Error('Save failed')
      toast.success('Quiz updated')
      setEditing(false)
      onRefresh()
    } catch (e) { toast.error(e.message) }
  }

  const meta = [
    { label: 'Lesson', value: quiz.lessonId ? `Lesson #${quiz.lessonId}` : '—' },
    { label: 'Total Questions', value: quiz.questions?.length || 0 },
    { label: 'Duration', value: `${quiz.timeLimit || 30} minutes` },
    { label: 'Attempts Allowed', value: quiz.maxAttempts || 1 },
    { label: 'Created By', value: `Trainer #${quiz.trainerId || quiz.createdBy || '—'}` },
    { label: 'Created Date', value: quiz.createdAt ? new Date(quiz.createdAt).toLocaleDateString() : '—' },
    { label: 'Difficulty', value: quiz.difficulty || 'MIXED' },
    { label: 'Total Marks', value: quiz.totalMarks || '—' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="reg-admin-btn reg-admin-btn--secondary" style={{ cursor: 'pointer' }} onClick={() => setEditing(!editing)}>
          <Pencil size={14} /> {editing ? 'Cancel' : 'Edit Quiz'}
        </button>
        {quiz.status === 'DRAFT' && (
          <button className="reg-admin-btn reg-admin-btn--primary" onClick={onPublish} disabled={publishing} style={{ cursor: publishing ? 'not-allowed' : 'pointer', opacity: publishing ? 0.6 : 1 }}>
            {publishing ? <Loader2 size={14} className="reg-spin" /> : <Send size={14} />}
            {publishing ? 'Publishing…' : 'Publish Quiz'}
          </button>
        )}
        {quiz.status === 'PUBLISHED' && (
          <span className="reg-admin-status" style={{ ...STATUS_BADGE.PUBLISHED, padding: '8px 16px', fontSize: 13, fontFamily: 'var(--font-primary)' }}>
            <CheckCircle2 size={14} /> Published Successfully
          </span>
        )}
        <button className="reg-admin-btn reg-admin-btn--danger" style={{ cursor: 'pointer' }} onClick={onDelete}>
          <Trash2 size={14} /> Delete Quiz
        </button>
      </div>

      {editing ? (
        <div className="reg-admin-table-wrap" style={{ marginBottom: 24, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>Edit Quiz</h3>
          <div className="reg-form-grid">
            <div>
              <label className="reg-field-label">Title</label>
              <input className="reg-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="reg-field-label">Time Limit (minutes)</label>
              <input className="reg-input" type="number" min={1} value={form.timeLimit} onChange={e => setForm({ ...form, timeLimit: parseInt(e.target.value) || 30 })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="reg-field-label">Description</label>
              <textarea className="reg-textarea" style={{ minHeight: 80 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="reg-form-actions" style={{ marginTop: 16 }}>
            <div className="reg-grow" />
            <button className="reg-admin-btn reg-admin-btn--secondary" style={{ cursor: 'pointer' }} onClick={() => setEditing(false)}>Cancel</button>
            <button className="reg-admin-btn reg-admin-btn--primary" style={{ cursor: 'pointer' }} onClick={handleSave}><Save size={14} /> Save Changes</button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {meta.map(m => (
          <div key={m.label} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuestionsTab({ quiz, onRefresh, auth, toast }) {
  const [questions, setQuestions] = useState(quiz.questions || [])
  const [showForm, setShowForm] = useState(false)
  const [editQ, setEditQ] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadQuestions = async () => {
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_QUESTIONS(quiz.id), { headers: auth() })
      const d = await r.json()
      setQuestions(d.questions || [])
    } catch { /* ignore */ }
  }

  const handleDelete = async (qId) => {
    if (!confirm('Delete this question?')) return
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_QUESTION(qId), { method: 'DELETE', headers: auth() })
      if (!r.ok) throw new Error('Delete failed')
      toast.success('Question deleted')
      loadQuestions()
    } catch (e) { toast.error(e.message) }
  }

  const handleSaveQuestion = async (data) => {
    setSaving(true)
    try {
      const isEdit = !!editQ
      const url = isEdit
        ? API.TRAINER_COURSES.QUIZ_QUESTION(editQ.id)
        : API.TRAINER_COURSES.QUIZ_QUESTIONS(quiz.id)
      const r = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: auth(),
        body: JSON.stringify(data)
      })
      if (!r.ok) throw new Error('Save failed')
      toast.success(isEdit ? 'Question updated' : 'Question added')
      setShowForm(false)
      setEditQ(null)
      loadQuestions()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>{questions.length} Questions</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {questions.length > 0 && (
            <button className="reg-admin-btn reg-admin-btn--secondary" style={{ cursor: 'pointer' }} onClick={() => setPreview(questions)}>
              <Eye size={14} /> Preview Quiz
            </button>
          )}
          <button className="reg-admin-btn reg-admin-btn--primary" style={{ cursor: 'pointer' }} onClick={() => { setEditQ(null); setShowForm(true) }}>
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>

      {(showForm || editQ) && (
        <QuestionForm
          question={editQ}
          onSave={handleSaveQuestion}
          onClose={() => { setShowForm(false); setEditQ(null) }}
          saving={saving}
        />
      )}

      {preview && (
        <QuestionPreview questions={preview} onClose={() => setPreview(null)} />
      )}

      {questions.length === 0 ? (
        <div className="reg-admin-empty" style={{ border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <HelpCircle size={32} style={{ opacity: 0.5 }} />
          <h3>No questions yet</h3>
          <p>Add your first question to get started</p>
        </div>
      ) : (
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Question</th>
                <th>Type</th>
                <th>Difficulty</th>
                <th style={{ width: 60, textAlign: 'center' }}>Marks</th>
                <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => {
                const previewText = q.questionText?.length > 80 ? q.questionText.slice(0, 80) + '…' : q.questionText
                return (
                  <tr key={q.id || i}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: '#111827', maxWidth: 400 }} title={q.questionText}>
                      {previewText}
                    </td>
                    <td><span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{q.questionType}</span></td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, ...(DIFF_BADGE[q.difficulty] || DIFF_BADGE.MEDIUM) }}>
                        {q.difficulty || 'MEDIUM'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#475569' }}>{q.marks || 1}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button className="reg-admin-action" title="Edit" style={{ cursor: 'pointer' }} onClick={() => { setEditQ(q); setShowForm(true) }}><Pencil size={12} /></button>
                        <button className="reg-admin-action reg-admin-action--reject" title="Delete" style={{ cursor: 'pointer' }} onClick={() => handleDelete(q.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
function ParticipantsTab({ quiz, auth, toast }) {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(API.TRAINER_COURSES.QUIZ_PARTICIPANTS(quiz.id), { headers: auth() })
        const d = await r.json()
        setParticipants(d.participants || [])
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [quiz.id])

  const filtered = participants.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
          {participants.length} Participants
        </h3>
        <div style={{ position: 'relative', width: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search participants…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '6px 12px 6px 32px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 12, outline: 'none'
            }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <Loader2 size={20} className="reg-spin" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13 }}>Loading participants…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="reg-admin-empty" style={{ border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <Users size={32} style={{ opacity: 0.5 }} />
          <h3>No participants found</h3>
          <p>Assigned course/training participants will appear here</p>
        </div>
      ) : (
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Email</th>
                <th>Attempt Status</th>
                <th style={{ textAlign: 'center' }}>Score</th>
                <th style={{ textAlign: 'right' }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const statusMeta = ATTEMPT_STATUS[p.attemptStatus] || ATTEMPT_STATUS.NOT_STARTED
                return (
                  <tr key={p.id || p.participantId}>
                    <td style={{ fontWeight: 600, color: '#111827' }}>{p.name || 'Participant'}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{p.email || '—'}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: statusMeta.bg || '#f1f5f9', color: statusMeta.fg || '#64748b'
                      }}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                      {p.percentage != null ? `${Math.round(p.percentage)}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>
                      {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ResultsTab({ quiz, onRefresh, auth, toast }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [selectedProctorAttempt, setSelectedProctorAttempt] = useState(null)

  const loadResults = async () => {
    setLoading(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_RESULTS(quiz.id), { headers: auth() })
      const d = await r.json()
      setResults(d.results || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadResults() }, [quiz.id])

  const handlePublishResults = async () => {
    setPublishing(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.PUBLISH_QUIZ_RESULTS(quiz.id), {
        method: 'POST', headers: auth()
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to publish results')
      toast.success('Results published to participants')
      onRefresh?.()
      loadResults()
    } catch (e) { toast.error(e.message) }
    finally { setPublishing(false) }
  }

  const handleHideResults = async () => {
    setPublishing(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.HIDE_QUIZ_RESULTS(quiz.id), {
        method: 'POST', headers: auth()
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to hide results')
      toast.success('Results hidden from participants')
      onRefresh?.()
      loadResults()
    } catch (e) { toast.error(e.message) }
    finally { setPublishing(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
          {results.length} Participant Submissions
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {quiz.resultStatus === 'HIDDEN' && results.length > 0 && (
            <button
              className="reg-admin-btn reg-admin-btn--primary"
              onClick={handlePublishResults}
              disabled={publishing}
              style={{ cursor: 'pointer' }}
            >
              <Send size={14} /> Publish All Results
            </button>
          )}
          {quiz.resultStatus === 'PUBLISHED' && (
            <button
              className="reg-admin-btn reg-admin-btn--secondary"
              onClick={handleHideResults}
              disabled={publishing}
              style={{ cursor: 'pointer' }}
            >
              <X size={14} /> Hide Results
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <Loader2 size={20} className="reg-spin" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13 }}>Loading quiz results…</p>
        </div>
      ) : results.length === 0 ? (
        <div className="reg-admin-empty" style={{ border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <BarChart3 size={32} style={{ opacity: 0.5 }} />
          <h3>No results submitted yet</h3>
          <p>Participant attempts and monitoring reports will appear here</p>
        </div>
      ) : (
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th style={{ textAlign: 'center' }}>Score</th>
                <th style={{ textAlign: 'center' }}>%</th>
                <th style={{ textAlign: 'center' }}>Pass / Fail</th>
                <th style={{ textAlign: 'center' }}>Submitted</th>
                <th style={{ textAlign: 'right', paddingRight: 20 }}>Monitoring &amp; Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((entry, idx) => {
                const pct = entry.percentage
                const passed = pct != null && pct >= (quiz.passingPercentage || 50)
                const isDisqualified = entry.attemptStatus === 'disqualified_copy_violation' || entry.attemptStatus === 'disqualified_policy_violation'

                return (
                  <tr key={entry.id || entry.attemptId || idx}>
                    <td style={{ fontWeight: 600, color: '#111827' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>{entry.participantName || entry.participant?.name || `Participant #${entry.participantId}`}</span>
                        {entry.participant?.email && (
                          <span style={{ fontSize: 11, color: '#64748b' }}>{entry.participant.email}</span>
                        )}
                        {isDisqualified && (
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: '#fee2e2', color: '#dc2626', width: 'fit-content'
                          }}>
                            🚫 Disqualified
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                      {entry.totalScore != null ? `${entry.totalScore}/${entry.maxScore || quiz.totalMarks || 100}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: pct >= 80 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : '#fee2e2',
                        color: pct >= 80 ? '#15803d' : pct >= 50 ? '#92400e' : '#dc2626'
                      }}>
                        {pct != null ? `${Math.round(pct)}%` : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {pct != null ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: passed ? '#15803d' : '#dc2626' }}>
                          {passed ? '✅ Pass' : '❌ Fail'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                      {entry.evaluatedAt || entry.submittedAt ? new Date(entry.evaluatedAt || entry.submittedAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 20 }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {entry.attemptId && (
                          <button
                            onClick={() => setSelectedProctorAttempt(entry.attemptId)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="View full automated proctoring & risk report"
                          >
                            <Shield size={12} /> Proctoring Report
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Single Attempt Proctoring Report Modal */}
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

function LeaderboardTab({ quiz, auth }) {
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(API.TRAINER_COURSES.QUIZ_LEADERBOARD(quiz.id), { headers: auth() })
        const d = await r.json()
        setLeaders(d.leaderboard || [])
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [quiz.id])

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
        Quiz Leaderboard
      </h3>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}><Loader2 size={20} className="reg-spin" /></div>
      ) : leaders.length === 0 ? (
        <div className="reg-admin-empty" style={{ border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <Trophy size={32} style={{ opacity: 0.5 }} />
          <h3>No submissions yet</h3>
          <p>Top performers will be ranked here</p>
        </div>
      ) : (
        <div className="reg-admin-table-wrap">
          <table className="reg-admin-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: 'center' }}>Rank</th>
                <th>Participant</th>
                <th style={{ textAlign: 'center' }}>Score</th>
                <th style={{ textAlign: 'center' }}>Percentage</th>
                <th style={{ textAlign: 'right' }}>Time Taken</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((entry, idx) => (
                <tr key={entry.participantId || idx}>
                  <td style={{ textAlign: 'center', fontWeight: 800, color: idx < 3 ? PODIUM_COLORS[idx] : '#64748b' }}>
                    {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`}
                  </td>
                  <td style={{ fontWeight: 600, color: '#111827' }}>{entry.participantName || `Participant #${entry.participantId}`}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{entry.totalScore}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{Math.round(entry.percentage)}%</td>
                  <td style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>
                    {entry.timeTaken ? `${entry.timeTaken}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AnalyticsTab({ quiz, auth }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(API.TRAINER_COURSES.QUIZ_ANALYTICS(quiz.id), { headers: auth() })
        const d = await r.json()
        setStats(d.analytics || null)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [quiz.id])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={20} className="reg-spin" /></div>

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
        Performance Analytics
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Avg Score</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{stats?.avgScore != null ? `${Math.round(stats.avgScore)}%` : '—'}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Pass Rate</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>{stats?.passRate != null ? `${Math.round(stats.passRate)}%` : '—'}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Attempts</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>{stats?.totalAttempts || 0}</div>
        </div>
      </div>
    </div>
  )
}

function SettingsTab({ quiz, onRefresh, auth, toast }) {
  const [form, setForm] = useState({
    proctoringEnabled: !!quiz.proctoringEnabled,
    copyProtection: !!quiz.copyProtection,
    shuffleQuestions: !!quiz.shuffleQuestions,
    maxAttempts: quiz.maxAttempts || 1,
    passingPercentage: quiz.passingPercentage || 50,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(quiz.courseId || 0, quiz.id), {
        method: 'PUT', headers: auth(),
        body: JSON.stringify(form)
      })
      if (!r.ok) throw new Error('Failed to update settings')
      toast.success('Quiz settings saved')
      onRefresh?.()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
        Assessment Settings
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.proctoringEnabled}
            onChange={e => setForm({ ...form, proctoringEnabled: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: '#16a34a' }}
          />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Enable Automated Proctoring &amp; Upper-Body Monitoring</span>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Requires camera calibration, eye &amp; head tracking, and integrity reporting.</p>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.copyProtection}
            onChange={e => setForm({ ...form, copyProtection: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: '#16a34a' }}
          />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Enable Copy/Paste &amp; Clipboard Protection</span>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Prevents right clicking, copying quiz text, and taking screenshots.</p>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.shuffleQuestions}
            onChange={e => setForm({ ...form, shuffleQuestions: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: '#16a34a' }}
          />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Shuffle Question Order</span>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Randomizes order of questions for each participant attempt.</p>
          </div>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div>
            <label className="reg-field-label">Passing Percentage (%)</label>
            <input
              className="reg-input"
              type="number"
              min={1}
              max={100}
              value={form.passingPercentage}
              onChange={e => setForm({ ...form, passingPercentage: parseInt(e.target.value) || 50 })}
            />
          </div>
          <div>
            <label className="reg-field-label">Max Attempts Allowed</label>
            <input
              className="reg-input"
              type="number"
              min={1}
              max={10}
              value={form.maxAttempts}
              onChange={e => setForm({ ...form, maxAttempts: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>

        <button
          className="reg-admin-btn reg-admin-btn--primary"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: 12, alignSelf: 'flex-start', cursor: 'pointer' }}
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function QuestionForm({ question, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    questionText: question?.questionText || '',
    questionType: question?.questionType || 'MCQ',
    difficulty: question?.difficulty || 'MEDIUM',
    marks: question?.marks || 1,
    options: question?.options || ['', '', '', ''],
    correctAnswer: question?.correctAnswer || '',
    explanation: question?.explanation || '',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'var(--font-primary)' }}>
        {question ? 'Edit Question' : 'New Question'}
      </h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label className="reg-field-label">Question Text</label>
          <textarea
            className="reg-textarea"
            required
            value={form.questionText}
            onChange={e => setForm({ ...form, questionText: e.target.value })}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="reg-field-label">Type</label>
            <select className="reg-input" value={form.questionType} onChange={e => setForm({ ...form, questionType: e.target.value })}>
              {QUESTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="reg-field-label">Difficulty</label>
            <select className="reg-input" value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="reg-field-label">Marks</label>
            <input className="reg-input" type="number" min={1} value={form.marks} onChange={e => setForm({ ...form, marks: parseInt(e.target.value) || 1 })} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="reg-admin-btn reg-admin-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="reg-admin-btn reg-admin-btn--primary" disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save Question'}
          </button>
        </div>
      </form>
    </div>
  )
}

function QuestionPreview({ questions, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
    }}>
      <div style={{ background: '#fff', borderRadius: 14, maxWidth: 680, width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Quiz Preview ({questions.length} Questions)</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {questions.map((q, idx) => (
            <div key={q.id || idx} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{idx + 1}. {q.questionText}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
