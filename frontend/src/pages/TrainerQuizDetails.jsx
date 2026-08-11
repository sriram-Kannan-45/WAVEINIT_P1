import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Settings, Users, BarChart3, Trophy, FileText,
  Plus, Pencil, Trash2, Save, X, Send, Loader2, AlertTriangle, Eye, Star,
  Search, Clock, HelpCircle, CheckCircle2, AlertCircle, RefreshCw, Monitor, Ban, XCircle,
} from 'lucide-react'
import { API, API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { TrainerProctoringDashboard } from '../proctoring'

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

/* __NEXT__ */
