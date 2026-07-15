import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Settings, BookOpen, Users, BarChart3, Trophy, FileText, ListChecks,
  Plus, Pencil, Trash2, Save, X, Check, Send, Loader2, AlertTriangle, Eye, Star,
  Download, Search, ChevronDown, ChevronUp, GripVertical, Clock, Calendar, User,
  HelpCircle, CheckCircle2, AlertCircle, RefreshCw, Monitor, Ban, XCircle,
} from 'lucide-react'
import { API, API_BASE } from '../api/api'
import { useToast } from '../components/Toast'
import { TrainerProctoringDashboard } from '../proctoring'
import {
  colors, btnPrimary, btnSuccess, btnDanger, btnOutline, iconBtn,
  STATUS_BADGE, RESULT_STATUS_BADGE, DIFF_BADGE, ATTEMPT_STATUS,
  lblStyle, inputStyle, selectStyle, th, td, skeletonStyle, typography,
  SEVERITY_STYLES, PODIUM_COLORS, MEDAL_COLORS,
} from '../theme/tokens'

const STATUS_LABELS = {
  DRAFT: 'Draft', PUBLISHED: 'Published', CLOSED: 'Closed',
  RESULTS_PUBLISHED: 'Results Published', ARCHIVED: 'Archived',
}
const RESULT_LABELS = { HIDDEN: 'Hidden', PUBLISHED: 'Published' }

const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER', 'MATCHING']
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD']

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
      <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400] }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
        Loading quiz…
      </div>
    )
  }

  if (!quiz) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: colors.danger[600] }}>
        <AlertCircle size={24} style={{ margin: '0 auto 12px' }} />
        Quiz not found
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/trainer')} style={iconBtn(colors.slate[100], colors.slate[600])}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.slate[900] }}>{quiz.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={STATUS_BADGE[quiz.status] || STATUS_BADGE.DRAFT}>{STATUS_LABELS[quiz.status] || 'Draft'}</span>
            <span style={RESULT_STATUS_BADGE[quiz.resultStatus] || RESULT_STATUS_BADGE.HIDDEN}>Results: {RESULT_LABELS[quiz.resultStatus] || 'Hidden'}</span>
            {quiz.course && <span style={{ fontSize: 12, color: colors.slate[500] }}>Course: {quiz.course.title}</span>}
            {quiz.training && <span style={{ fontSize: 12, color: colors.slate[500] }}>Training: {quiz.training.title}</span>}
            <span style={{ fontSize: 12, color: colors.slate[400] }}>•</span>
            <span style={{ fontSize: 12, color: colors.slate[500] }}>{quiz.questions?.length || 0} questions</span>
            <span style={{ fontSize: 12, color: colors.slate[400] }}>•</span>
            <span style={{ fontSize: 12, color: colors.slate[500] }}>{quiz.timeLimit || 30} min</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: `2px solid ${colors.slate[200]}`, marginBottom: 24, overflow: 'auto' }}>
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
                color: active ? colors.primary[600] : colors.slate[500],
                background: 'transparent',
                borderBottom: active ? `2px solid ${colors.primary[600]}` : '2px solid transparent',
                marginBottom: -2, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
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
        </motion.div>
      </AnimatePresence>
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
        <button onClick={() => setEditing(!editing)} style={btnOutline}>
          <Pencil size={14} /> {editing ? 'Cancel' : 'Edit Quiz'}
        </button>
        {quiz.status === 'DRAFT' && (
          <button onClick={onPublish} disabled={publishing} style={{ ...btnSuccess, opacity: publishing ? 0.6 : 1 }}>
            {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {publishing ? 'Publishing…' : 'Publish Quiz'}
          </button>
        )}
        {quiz.status === 'PUBLISHED' && (
          <span style={{ ...btnSuccess, opacity: 0.8, cursor: 'default' }}>
            <CheckCircle2 size={14} /> Published Successfully
          </span>
        )}
        <button onClick={onDelete} style={btnDanger}>
          <Trash2 size={14} /> Delete Quiz
        </button>
      </div>

      {editing ? (
        <div style={{ background: colors.surface.secondary, borderRadius: 12, padding: 20, marginBottom: 24, border: `1px solid ${colors.slate[200]}` }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: colors.slate[900] }}>Edit Quiz</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={lblStyle}>Title</label>
              <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label style={lblStyle}>Time Limit (minutes)</label>
              <input style={inputStyle} type="number" min={1} value={form.timeLimit} onChange={e => setForm({ ...form, timeLimit: parseInt(e.target.value) || 30 })} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={lblStyle}>Description</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleSave} style={btnPrimary}><Save size={14} /> Save Changes</button>
            <button onClick={() => setEditing(false)} style={btnOutline}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {meta.map(m => (
          <div key={m.label} style={{
            background: colors.surface.primary, border: `1px solid ${colors.slate[200]}`, borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.slate[900] }}>{m.value}</div>
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
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>{questions.length} Questions</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {questions.length > 0 && (
            <button onClick={() => setPreview(questions)} style={btnOutline}>
              <Eye size={14} /> Preview Quiz
            </button>
          )}
          <button onClick={() => { setEditQ(null); setShowForm(true) }} style={btnPrimary}>
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>

      <AnimatePresence>
        {(showForm || editQ) && (
          <QuestionForm
            question={editQ}
            onSave={handleSaveQuestion}
            onClose={() => { setShowForm(false); setEditQ(null) }}
            saving={saving}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {preview && (
          <QuestionPreview questions={preview} onClose={() => setPreview(null)} />
        )}
      </AnimatePresence>

      {questions.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: colors.slate[400], border: `2px dashed ${colors.slate[200]}`, borderRadius: 12 }}>
          <HelpCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>No questions yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Add your first question to get started</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${colors.slate[200]}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.surface.secondary }}>
                <th style={{ ...th, width: 40 }}>#</th>
                <th style={th}>Question</th>
                <th style={th}>Type</th>
                <th style={th}>Difficulty</th>
                <th style={{ ...th, width: 60, textAlign: 'center' }}>Marks</th>
                <th style={{ ...th, width: 100, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => {
                const previewText = q.questionText?.length > 80 ? q.questionText.slice(0, 80) + '…' : q.questionText
                return (
                  <tr key={q.id || i}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: colors.slate[400], fontSize: 12 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600, color: colors.slate[900], maxWidth: 400 }} title={q.questionText}>
                      {previewText}
                    </td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: colors.slate[600] }}>{q.questionType}</span></td>
                    <td style={td}>
                      <span style={DIFF_BADGE[q.difficulty] || DIFF_BADGE.MEDIUM}>
                        {q.difficulty || 'MEDIUM'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: colors.slate[600] }}>{q.marks || 1}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => { setEditQ(q); setShowForm(true) }} style={iconBtn(colors.secondary[100], colors.secondary[700])} title="Edit"><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(q.id)} style={iconBtn(colors.danger[100], colors.danger[600])} title="Delete"><Trash2 size={12} /></button>
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

function QuestionForm({ question, onSave, onClose, saving }) {
  const isEdit = !!question
  const [form, setForm] = useState({
    questionText: question?.questionText || '',
    questionType: question?.questionType || 'MCQ',
    options: question?.options || ['', '', '', ''],
    correctAnswer: question?.correctAnswer || '',
    acceptableAnswers: question?.acceptableAnswers || [],
    pairs: question?.pairs || [{ left: '', right: '' }],
    explanation: question?.explanation || '',
    difficulty: question?.difficulty || 'MEDIUM',
    marks: question?.marks || 1,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { ...form }
    if (form.questionType === 'MCQ') data.options = form.options
    else { data.options = null }
    if (form.questionType === 'MATCHING') data.pairs = form.pairs
    else { data.pairs = null }
    if (form.questionType === 'FILL_BLANK') data.acceptableAnswers = form.acceptableAnswers
    else { data.acceptableAnswers = null }
    onSave(data)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        style={{ background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'auto', padding: 24 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.slate[900] }}>
            {isEdit ? 'Edit Question' : 'Add Question'}
          </h3>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={lblStyle}>Question Text *</label>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} required value={form.questionText} onChange={e => setForm({ ...form, questionText: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={lblStyle}>Type</label>
              <select style={selectStyle} value={form.questionType} onChange={e => setForm({ ...form, questionType: e.target.value })}>
                {QUESTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Difficulty</label>
              <select style={selectStyle} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {form.questionType === 'MCQ' && (
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>Options (mark correct by selecting radio)</label>
              {form.options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    type="radio" name="correctOpt"
                    checked={form.correctAnswer === String(i) || form.correctAnswer === String.fromCharCode(65 + i)}
                    onChange={() => setForm({ ...form, correctAnswer: String(i) })}
                  />
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    value={opt}
                    onChange={e => {
                      const opts = [...form.options]
                      opts[i] = e.target.value
                      setForm({ ...form, options: opts })
                    }}
                  />
                  <button type="button" onClick={() => {
                    const opts = form.options.filter((_, j) => j !== i)
                    setForm({ ...form, options: opts })
                  }} style={iconBtn(colors.danger[100], colors.danger[600])}><X size={10} /></button>
                </div>
              ))}
              {form.options.length < 6 && (
                <button type="button" onClick={() => setForm({ ...form, options: [...form.options, ''] })} style={{ ...btnOutline, fontSize: 11, padding: '5px 12px' }}>
                  <Plus size={11} /> Add Option
                </button>
              )}
            </div>
          )}

          {form.questionType === 'TRUE_FALSE' && (
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>Correct Answer</label>
              <select style={selectStyle} value={form.correctAnswer} onChange={e => setForm({ ...form, correctAnswer: e.target.value })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>
          )}

          {['FILL_BLANK', 'SHORT_ANSWER'].includes(form.questionType) && (
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>Correct Answer *</label>
              <input style={inputStyle} required value={form.correctAnswer} onChange={e => setForm({ ...form, correctAnswer: e.target.value })} />
              <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 4 }}>Leave blank if using acceptable answers below</div>
            </div>
          )}

          {form.questionType === 'MATCHING' && (
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>Matching Pairs</label>
              {form.pairs.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input style={inputStyle} placeholder="Left item" value={p.left} onChange={e => {
                    const pairs = [...form.pairs]; pairs[i] = { ...pairs[i], left: e.target.value }; setForm({ ...form, pairs })
                  }} />
                  <input style={inputStyle} placeholder="Right item" value={p.right} onChange={e => {
                    const pairs = [...form.pairs]; pairs[i] = { ...pairs[i], right: e.target.value }; setForm({ ...form, pairs })
                  }} />
                  <button type="button" onClick={() => setForm({ ...form, pairs: form.pairs.filter((_, j) => j !== i) })} style={iconBtn(colors.danger[100], colors.danger[600])}><X size={10} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setForm({ ...form, pairs: [...form.pairs, { left: '', right: '' }] })} style={{ ...btnOutline, fontSize: 11, padding: '5px 12px' }}>
                <Plus size={11} /> Add Pair
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={lblStyle}>Marks</label>
              <input style={inputStyle} type="number" min={1} value={form.marks} onChange={e => setForm({ ...form, marks: parseInt(e.target.value) || 1 })} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lblStyle}>Explanation (optional)</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, borderTop: `1px solid ${colors.slate[200]}`, paddingTop: 16 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Update' : 'Add'} Question
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

function QuestionPreview({ questions, onClose }) {
  const [idx, setIdx] = useState(0)
  const q = questions[idx]
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: colors.bg.overlay, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        style={{ background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', padding: 24 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>Quiz Preview</h3>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}><X size={14} /></button>
        </div>
        {q && (
          <div>
            <div style={{ fontSize: 12, color: colors.slate[400], marginBottom: 8 }}>
              Question {idx + 1} of {questions.length}
            </div>
            <div style={{ fontWeight: 600, color: colors.slate[900], fontSize: 15, marginBottom: 16 }}>{q.questionText}</div>
            <div style={{ fontSize: 11, color: colors.slate[500], marginBottom: 12 }}>Type: {q.questionType} • Marks: {q.marks || 1}</div>
            {q.options?.map((opt, i) => (
              <div key={i} style={{ padding: '8px 12px', marginBottom: 6, border: `1px solid ${colors.slate[200]}`, borderRadius: 8, background: colors.surface.secondary, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: colors.slate[500], marginRight: 8 }}>{String.fromCharCode(65 + i)}.</span>
                {opt}
                {q.correctAnswer === String(i) && <span style={{ marginLeft: 8, color: colors.success[600], fontWeight: 700 }}><CheckCircle2 size={12} /></span>}
              </div>
            ))}
            {q.questionType === 'TRUE_FALSE' && (
              <div style={{ padding: '8px 12px', border: `1px solid ${colors.slate[200]}`, borderRadius: 8, background: colors.surface.secondary, fontSize: 13 }}>
                Correct: {q.correctAnswer === 'true' ? 'True' : 'False'}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <button disabled={idx === 0} onClick={() => setIdx(idx - 1)} style={btnOutline}>Previous</button>
              <button disabled={idx === questions.length - 1} onClick={() => setIdx(idx + 1)} style={btnPrimary}>Next</button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function ParticipantsTab({ quiz, auth, toast }) {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const fetchParticipants = useCallback(() => {
    setLoading(true)
    fetch(API.TRAINER_COURSES.QUIZ_PARTICIPANTS(quiz.id), { headers: auth() })
      .then(r => r.json())
      .then(d => setParticipants(d.participants || []))
      .catch(() => toast?.error('Failed to load participants'))
      .finally(() => setLoading(false))
  }, [quiz.id])

  useEffect(() => {
    fetchParticipants()
  }, [fetchParticipants])

  const handleReinstate = async (attemptId) => {
    if (!confirm('Are you sure you want to reinstate this participant? Their warning count will be reset, copy violations cleared, and they will be allowed to resume the attempt.')) return
    try {
      const res = await fetch(`${API_BASE}/quizzes/attempts/${attemptId}/reinstate`, {
        method: 'POST',
        headers: auth()
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast?.success(data.message || 'Participant reinstated successfully.')
        fetchParticipants()
      } else {
        toast?.error(data.error || 'Failed to reinstate participant.')
      }
    } catch (err) {
      toast?.error('Failed to reinstate participant.')
    }
  }

  const filtered = participants.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
                          (p.email || '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400] }}><Loader2 size={20} className="animate-spin" /></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>{filtered.length} Participants</h3>
      </div>

      {participants.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.slate[400] }} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...selectStyle, width: 180 }}
          >
            <option value="ALL">All Statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="DISQUALIFIED">Disqualified</option>
            <option value="RESULT_PUBLISHED">Result Published</option>
          </select>
        </div>
      )}

      {participants.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: colors.slate[400], border: `2px dashed ${colors.slate[200]}`, borderRadius: 12 }}>
          <Users size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>No participants enrolled</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400], border: `1px solid ${colors.slate[200]}`, borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No participants match filter criteria</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${colors.slate[200]}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.surface.secondary }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Status</th>
                <th style={th}>Submitted</th>
                <th style={{ ...th, textAlign: 'right' }}>Score</th>
                <th style={{ ...th, textAlign: 'right', paddingRight: 20 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const sv = ATTEMPT_STATUS[p.status] || ATTEMPT_STATUS.NOT_STARTED
                const svStyle = sv.badge || { background: sv.bg, color: sv.fg }
                const showScore = p.resultPublished && p.score != null
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 600, color: colors.slate[900] }}>{p.name}</td>
                    <td style={{ ...td, color: colors.slate[500], fontSize: 12 }}>{p.email}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span style={{ ...svStyle, padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                          {sv.label}
                        </span>
                        {p.violationCount > 0 && (
                          <span style={{ fontSize: 11, color: colors.warning[500], fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <AlertTriangle size={12} /> {p.violationCount} violation{p.violationCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: 12, color: colors.slate[500] }}>
                      {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: showScore ? colors.slate[900] : colors.slate[400] }}>
                      {showScore ? `${p.percentage}%` : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', paddingRight: 20 }}>
                      {p.status === 'DISQUALIFIED' && p.attemptId && (
                        <button
                          onClick={() => handleReinstate(p.attemptId)}
                          style={{
                            padding: '6px 12px',
                            background: colors.success[500],
                            color: colors.text.inverse,
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = colors.success[600]}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = colors.success[500]}
                        >
                          Reinstate
                        </button>
                      )}
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
  const [summary, setSummary] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [violationModal, setViolationModal] = useState(null)
  const [violationsLoading, setViolationsLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, resultsRes] = await Promise.all([
        fetch(API.TRAINER_COURSES.RESULTS_SUMMARY(quiz.id), { headers: auth() }),
        fetch(API.TRAINER_COURSES.QUIZ_RESULTS(quiz.id), { headers: auth() }),
      ])
      const [sData, rData] = await Promise.all([summaryRes.json(), resultsRes.json()])
      if (sData.success) setSummary(sData)
      setResults(rData.results || [])
    } catch { toast?.error('Failed to load results') }
    finally { setLoading(false) }
  }, [quiz.id])

  useEffect(() => { fetchData() }, [fetchData])

  const publishAll = async (override = false) => {
    setPublishing(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.PUBLISH_ALL_RESULTS(quiz.id), {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ override, reason: overrideReason.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { toast?.error(d.message || 'Publish failed'); return }
      toast?.success(`Results published to ${d.enrolled ?? 0} participants ✓`)
      setShowOverride(false)
      setOverrideReason('')
      fetchData()
      onRefresh?.()
    } catch (e) { toast?.error(e.message) }
    finally { setPublishing(false) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400] }}><Loader2 size={20} className="animate-spin" /></div>

  const alreadyPublished = quiz.resultStatus === 'PUBLISHED'

  return (
    <div>
      {summary && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'ENROLLED',  value: summary.enrolled,  color: colors.primary[600], bg: colors.primary[100] },
              { label: 'COMPLETED', value: summary.completed, color: colors.success[700], bg: colors.success[100] },
              { label: 'PENDING',   value: summary.pending,   color: colors.warning[800], bg: colors.warning[100] },
              ...(summary.averageScore != null ? [{ label: 'AVG SCORE', value: `${summary.averageScore}%`, color: colors.info[600], bg: colors.info[100] }] : []),
              ...(summary.passRate != null ? [{ label: 'PASS RATE', value: `${summary.passRate}%`, color: colors.secondary[600], bg: colors.secondary[100] }] : []),
            ].map(card => (
              <div key={card.label} style={{ padding: '12px 10px', background: card.bg, borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: card.color, opacity: 0.75, letterSpacing: 0.4 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {alreadyPublished ? (
            <div style={{ padding: '10px 14px', background: colors.success[100], color: colors.success[700], borderRadius: 9, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} /> Results have been published to participants.
            </div>
          ) : summary.enrolled === 0 ? (
            <div style={{ padding: '10px 14px', background: colors.slate[100], color: colors.slate[600], borderRadius: 9, fontSize: 13 }}>
              No enrolled participants — nothing to publish.
            </div>
          ) : summary.pending > 0 ? (
            <div style={{ padding: '10px 14px', background: colors.warning[100], color: colors.warning[800], borderRadius: 9, fontSize: 13 }}>
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} />
                <strong>{summary.pending}</strong> participant(s) haven't completed yet.
              </div>
              {!showOverride ? (
                <button onClick={() => setShowOverride(true)}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, border: `1px solid ${colors.warning[500]}`,
                    background: 'transparent', color: colors.warning[800], cursor: 'pointer', fontWeight: 600 }}>
                  Publish Anyway (Override)
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                    placeholder="Reason for override (recommended)…" rows={2}
                    style={{ fontSize: 12, padding: '6px 8px', border: `1px solid ${colors.warning[400]}`, borderRadius: 6,
                      resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => publishAll(true)} disabled={publishing}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, border: 'none',
                        background: colors.warning[500], color: colors.text.inverse, cursor: 'pointer', fontWeight: 700, opacity: publishing ? 0.6 : 1 }}>
                      {publishing ? 'Publishing…' : 'Confirm Override'}
                    </button>
                    <button onClick={() => setShowOverride(false)}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, border: `1px solid ${colors.slate[200]}`,
                        background: colors.surface.primary, color: colors.slate[600], cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => publishAll(false)} disabled={publishing}
              style={{ ...btnSuccess, opacity: publishing ? 0.6 : 1 }}>
              <Send size={14} /> {publishing ? 'Publishing…' : `Publish All Results (${summary.completed} completed)`}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>{results.length} Submissions</h3>
      </div>

      {results.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: colors.slate[400], border: `2px dashed ${colors.slate[200]}`, borderRadius: 12 }}>
          <BarChart3 size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>No submissions yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Results will appear once participants submit the quiz</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${colors.slate[200]}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.surface.secondary }}>
                <th style={th}>Participant</th>
                <th style={{ ...th, textAlign: 'right' }}>Score</th>
                <th style={{ ...th, textAlign: 'right' }}>%</th>
                <th style={th}>Pass/Fail</th>
                <th style={th}>Submitted</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right', paddingRight: 20 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map(entry => {
                const pct = entry.percentage
                const isPending = !entry.resultPublished
                const passed = pct != null && pct >= 50
                return (
                  <tr key={entry.participantId}>
                    <td style={{ ...td, fontWeight: 600, color: colors.slate[900] }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span>{entry.participantName}</span>
                        {(entry.attemptStatus === 'disqualified_copy_violation' || entry.attemptStatus === 'disqualified_policy_violation') && (
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: colors.danger[100], color: colors.danger[600], display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Ban size={10} /> Disqualified
                          </span>
                        )}
                        {entry.violationCount > 0 && (
                          <span style={{ fontSize: 11, color: colors.warning[500], fontWeight: 600 }}>
                            <AlertTriangle size={12} /> {entry.violationCount} violation{entry.violationCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: colors.slate[600] }}>
                      {entry.totalScore != null ? `${entry.totalScore}/${entry.maxScore}` : '-'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: pct >= 80 ? colors.success[100] : pct >= 50 ? colors.warning[100] : colors.danger[100],
                        color: pct >= 80 ? colors.success[700] : pct >= 50 ? colors.warning[800] : colors.danger[600] }}>
                        {pct != null ? `${Math.round(pct)}%` : '-'}
                      </span>
                    </td>
                    <td style={{ ...td }}>
                      {pct != null ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: passed ? colors.success[700] : colors.danger[600], display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {passed ? <><CheckCircle2 size={11} /> Pass</> : <><XCircle size={11} /> Fail</>}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: colors.slate[500] }}>
                      {entry.evaluatedAt ? new Date(entry.evaluatedAt).toLocaleDateString() : '-'}
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: isPending ? colors.warning[50] : colors.success[50],
                        color: isPending ? colors.warning[800] : colors.success[700] }}>
                        {isPending ? <><Clock size={11} /> Pending</> : <><CheckCircle2 size={11} /> Published</>}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', paddingRight: 20 }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {entry.violationCount > 0 && entry.attemptId && (
                          <button
                            onClick={async () => {
                              setViolationsLoading(true)
                              setViolationModal({ participantName: entry.participantName, attemptId: entry.attemptId, violations: [] })
                              try {
                                const res = await fetch(`${API_BASE}/quizzes/attempts/${entry.attemptId}/violations`, { headers: auth() })
                                const data = await res.json()
                                if (res.ok && data.success) {
                                  setViolationModal(prev => ({ ...prev, violations: data.violations }))
                                }
                              } catch (err) {
                                toast?.error('Failed to fetch violations.')
                              }
                              setViolationsLoading(false)
                            }}
                            style={{
                              padding: '6px 10px',
                              background: colors.slate[100],
                              color: colors.slate[600],
                              border: `1px solid ${colors.slate[200]}`,
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'background-color 0.2s',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = colors.slate[200]}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = colors.slate[100]}
                          >
                            <FileText size={11} /> View
                          </button>
                        )}
                        {(entry.attemptStatus === 'disqualified_copy_violation' || entry.attemptStatus === 'disqualified_policy_violation') && entry.attemptId && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to reinstate ${entry.participantName}? Their warning count will be reset, copy violations cleared, and they will be allowed to resume the attempt.`)) return
                              try {
                                const res = await fetch(`${API_BASE}/quizzes/attempts/${entry.attemptId}/reinstate`, {
                                  method: 'POST',
                                  headers: auth()
                                })
                                const data = await res.json()
                                if (res.ok && data.success) {
                                  toast?.success(data.message || 'Participant reinstated successfully.')
                                  fetchData()
                                  onRefresh?.()
                                } else {
                                  toast?.error(data.error || 'Failed to reinstate participant.')
                                }
                              } catch (err) {
                                toast?.error('Failed to reinstate participant.')
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              background: colors.success[500],
                              color: colors.text.inverse,
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'background-color 0.2s',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = colors.success[600]}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = colors.success[500]}
                          >
                            Reinstate
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

      {violationModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: colors.bg.overlay,
          backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: colors.surface.primary, borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '80vh',
            overflow: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
                Violation Log — {violationModal.participantName}
              </h3>
              <button
                onClick={() => setViolationModal(null)}
                style={{
                  width: 30, height: 30, border: 'none', borderRadius: 8,
                  background: colors.slate[100], cursor: 'pointer', fontSize: 16, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.slate[500],
                }}
              >
                ✕
              </button>
            </div>

            {violationsLoading ? (
              <p style={{ color: colors.slate[400], fontSize: 14 }}>Loading violations...</p>
            ) : violationModal.violations.length === 0 ? (
              <p style={{ color: colors.slate[400], fontSize: 14 }}>No violations recorded.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 120, padding: '10px 14px', borderRadius: 10, background: colors.danger[50], border: `1px solid ${colors.danger[200]}` }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: colors.danger[600] }}>
                      {violationModal.violations.filter(v => (v.weight || 1.0) >= 1.0).length}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.danger[700] }}>Hard violations</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, padding: '10px 14px', borderRadius: 10, background: colors.warning[50], border: `1px solid ${colors.accent[200]}` }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: colors.warning[600] }}>
                      {violationModal.violations.filter(v => (v.weight || 1.0) < 1.0).length}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.warning[800] }}>Soft violations</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, padding: '10px 14px', borderRadius: 10, background: colors.info[50], border: `1px solid ${colors.info[200]}` }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: colors.info[600] }}>
                      {violationModal.violations.length}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.info[700] }}>Total</div>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.slate[200]}` }}>
                      <th style={{ textAlign: 'left', padding: '8px 8px 8px 0', fontWeight: 700, color: colors.slate[600] }}>Type</th>
                      <th style={{ textAlign: 'center', padding: 8, fontWeight: 700, color: colors.slate[600] }}>Weight</th>
                      <th style={{ textAlign: 'center', padding: 8, fontWeight: 700, color: colors.slate[600] }}>Question</th>
                      <th style={{ textAlign: 'right', padding: '8px 0 8px 8px', fontWeight: 700, color: colors.slate[600] }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violationModal.violations.map((v, i) => (
                      <tr key={v.id || i} style={{ borderBottom: `1px solid ${colors.slate[100]}` }}>
                        <td style={{ padding: '8px 8px 8px 0', fontWeight: 600, color: colors.slate[900] }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 11,
                            background: (v.weight || 1.0) >= 1.0 ? colors.danger[100] : colors.warning[50],
                            color: (v.weight || 1.0) >= 1.0 ? colors.danger[600] : colors.warning[600],
                            fontWeight: 700,
                          }}>
                            {v.type}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: 8, color: colors.slate[500] }}>{v.weight || 1.0}</td>
                        <td style={{ textAlign: 'center', padding: 8, color: colors.slate[500] }}>Q{v.questionNumber || '-'}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0 8px 8px', color: colors.slate[400], fontSize: 12 }}>
                          {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LeaderboardTab({ quiz, auth }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLeaderboard = useCallback(() => {
    setLoading(true)
    fetch(API.TRAINER_COURSES.QUIZ_LEADERBOARD(quiz.id), { headers: auth() })
      .then(r => r.json())
      .then(d => setData(d.leaderboard || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [quiz.id])

  useEffect(() => {
    fetchLeaderboard()
    let socket
    try {
      const io = window.io
      if (io) {
        socket = io()
        const room = `leaderboard:quiz:${quiz.id}`
        socket.emit('join', room)
        socket.on('leaderboard:update', (payload) => {
          if (payload.scope === 'quiz' && String(payload.id) === String(quiz.id)) {
            setData(payload.leaderboard || [])
          }
        })
      }
    } catch {}
    return () => {
      if (socket) { socket.emit('leave', `leaderboard:quiz:${quiz.id}`); socket.disconnect() }
    }
  }, [quiz.id, fetchLeaderboard])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400] }}><Loader2 size={20} className="animate-spin" /></div>

  const podium = data.slice(0, 3)
  const rest   = data.slice(3)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>Leaderboard</h3>
        <button onClick={fetchLeaderboard} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.slate[500], fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {data.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: colors.slate[400], border: `2px dashed ${colors.slate[200]}`, borderRadius: 12 }}>
          <Trophy size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Leaderboard hidden</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Results must be published for the leaderboard to appear</div>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 24, padding: '20px 0' }}>
              {[podium[1], podium[0], podium[2]].filter(Boolean).map((entry, visualIdx) => {
                const dataIdx = visualIdx === 0 ? 1 : visualIdx === 1 ? 0 : 2
                const heights = [90, 120, 75]
                const height = heights[visualIdx] || 75
                const color = PODIUM_COLORS[dataIdx]
                return (
                  <div key={entry.userId} style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ marginBottom: 4, color: MEDAL_COLORS[dataIdx + 1] }}><Trophy size={22} /></div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: colors.slate[900], marginBottom: 2 }}>{entry.name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: colors.slate[500], marginBottom: 8 }}>{Math.round(entry.score || 0)}%</div>
                    <div style={{ height, background: `${color}22`, border: `2px solid ${color}`, borderRadius: '8px 8px 0 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontWeight: 800, color, fontSize: 15 }}>#{dataIdx + 1}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ border: `1px solid ${colors.slate[200]}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: colors.surface.secondary }}>
                  <th style={{ ...th, width: 50 }}>#</th>
                  <th style={th}>Participant</th>
                  <th style={{ ...th, textAlign: 'right' }}>Score</th>
                  <th style={{ ...th, textAlign: 'right' }}>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry, i) => (
                  <tr key={entry.userId || i}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 14, color: i < 3 ? PODIUM_COLORS[i] : colors.slate[400] }}>
                      {i < 3 ? <Trophy size={14} style={{ color: MEDAL_COLORS[i + 1] }} /> : `#${i + 1}`}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: colors.slate[900] }}>{entry.name || 'Anonymous'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: colors.slate[600] }}>{entry.totalScore != null ? `${entry.totalScore}/${entry.maxScore}` : '-'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: (entry.score || 0) >= 80 ? colors.success[100] : (entry.score || 0) >= 50 ? colors.warning[100] : colors.danger[100],
                        color: (entry.score || 0) >= 80 ? colors.success[700] : (entry.score || 0) >= 50 ? colors.warning[800] : colors.danger[600] }}>
                        {entry.score != null ? `${Math.round(entry.score)}%` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function AnalyticsTab({ quiz, auth }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/ai-quiz/leaderboard/${quiz.id}`, { headers: auth() })
      .then(r => r.json())
      .then(d => {
        const lb = d.leaderboard || []
        const total = lb.length
        const avg = total > 0 ? lb.reduce((s, e) => s + (e.score || 0), 0) / total : 0
        const passed = lb.filter(e => (e.score || 0) >= 50).length
        const topScore = total > 0 ? Math.max(...lb.map(e => e.score || 0)) : 0
        setStats({ total, average: avg.toFixed(1), passed, failed: total - passed, topScore: topScore.toFixed(1) })
      })
      .catch(() => setStats({ total: 0, average: '0', passed: 0, failed: 0, topScore: '0' }))
      .finally(() => setLoading(false))
  }, [quiz.id])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400] }}><Loader2 size={20} className="animate-spin" /></div>

  const cards = [
    { label: 'Total Submissions', value: stats?.total || 0, color: colors.primary[600], bg: colors.primary[100] },
    { label: 'Average Score', value: `${stats?.average || 0}%`, color: colors.success[600], bg: colors.success[100] },
    { label: 'Passed', value: stats?.passed || 0, color: colors.success[600], bg: colors.success[100] },
    { label: 'Failed', value: stats?.failed || 0, color: colors.danger[600], bg: colors.danger[100] },
    { label: 'Top Score', value: `${stats?.topScore || 0}%`, color: colors.warning[600], bg: colors.warning[100] },
  ]

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>Quiz Analytics</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>
      {stats?.total === 0 && (
        <div style={{ marginTop: 20, padding: 40, textAlign: 'center', color: colors.slate[400], border: `2px dashed ${colors.slate[200]}`, borderRadius: 12 }}>
          <BarChart3 size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div>No analytics available yet</div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({ quiz, onRefresh, auth, toast }) {
  const [form, setForm] = useState({
    showResultImmediately: quiz.showResultImmediately || false,
    showCorrectAnswersOnResult: quiz.showCorrectAnswersOnResult !== false,
    shuffleQuestions: quiz.shuffleQuestions || false,
    allowMultipleAttempts: quiz.allowMultipleAttempts || false,
    maxAttempts: quiz.maxAttempts || 1,
    difficulty: quiz.difficulty || 'MIXED',
    timeLimit: quiz.timeLimit || 30,
    isMandatory: quiz.isMandatory !== false,
    copyProtectionEnabled: quiz.copyProtectionEnabled || false,
    maxCopyWarnings: quiz.maxCopyWarnings || 3,
    copyViolationActions: quiz.copyViolationActions || ['COPY', 'CUT', 'RIGHT_CLICK', 'PRINT', 'BLOCKED_SHORTCUT'],
    copyWarningMessage: quiz.copyWarningMessage || '',
    copyDisqualifyAction: quiz.copyDisqualifyAction || 'AUTO_SUBMIT',
    proctoringEnabled: quiz.proctoringEnabled || false,
    proctoringLevel: quiz.proctoringLevel || 'MEDIUM',
    gracePeriodMinutes: quiz.gracePeriodMinutes || 2,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(quiz.courseId || 0, quiz.id), {
        method: 'PUT', headers: auth(),
        body: JSON.stringify(form)
      })
      if (!r.ok) throw new Error('Save failed')
      toast.success('Settings saved')
      onRefresh()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>Quiz Settings</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ToggleRow label="Shuffle Questions" desc="Randomize question order for each participant" checked={form.shuffleQuestions} onChange={v => setForm({ ...form, shuffleQuestions: v })} />
        <ToggleRow label="Show Correct Answers" desc="Display correct answers after result publication" checked={form.showCorrectAnswersOnResult} onChange={v => setForm({ ...form, showCorrectAnswersOnResult: v })} />
        <ToggleRow label="Show Result Immediately" desc="Bypass trainer publishing — show score right after submission" checked={form.showResultImmediately} onChange={v => setForm({ ...form, showResultImmediately: v })} />
        <ToggleRow label="Allow Multiple Attempts" desc="Let participants retake the quiz" checked={form.allowMultipleAttempts} onChange={v => setForm({ ...form, allowMultipleAttempts: v })} />
        {form.allowMultipleAttempts && (
          <div style={{ paddingLeft: 44 }}>
            <label style={lblStyle}>Max Attempts</label>
            <input style={inputStyle} type="number" min={1} max={99} value={form.maxAttempts} onChange={e => setForm({ ...form, maxAttempts: parseInt(e.target.value) || 1 })} />
          </div>
        )}
        <ToggleRow label="Mandatory Quiz" desc="Participants must complete this quiz" checked={form.isMandatory} onChange={v => setForm({ ...form, isMandatory: v })} />
        <div>
          <label style={lblStyle}>Difficulty</label>
          <select style={selectStyle} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
            {['EASY', 'MEDIUM', 'HARD', 'MIXED'].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={lblStyle}>Time Limit (minutes)</label>
          <input style={inputStyle} type="number" min={1} value={form.timeLimit} onChange={e => setForm({ ...form, timeLimit: parseInt(e.target.value) || 30 })} />
        </div>

        <ToggleRow label="Enable Copy Protection" desc="Prevent copying questions, blocking shortcuts, context menus" checked={form.copyProtectionEnabled} onChange={v => setForm({ ...form, copyProtectionEnabled: v })} />
        {form.copyProtectionEnabled && (
          <div style={{ paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: `2px solid ${colors.slate[200]}`, marginTop: 8 }}>
            <div>
              <label style={lblStyle}>Max Warnings</label>
              <input style={inputStyle} type="number" min={1} max={10} value={form.maxCopyWarnings} onChange={e => setForm({ ...form, maxCopyWarnings: parseInt(e.target.value) || 3 })} />
            </div>
            <div>
              <label style={lblStyle}>Warning Message Text</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                placeholder="Use {violationCount} and {maxWarnings} for placeholders. Leave blank for default message."
                value={form.copyWarningMessage}
                onChange={e => setForm({ ...form, copyWarningMessage: e.target.value })}
              />
            </div>
            <div>
              <label style={lblStyle}>Disqualification Action</label>
              <select style={selectStyle} value={form.copyDisqualifyAction} onChange={e => setForm({ ...form, copyDisqualifyAction: e.target.value })}>
                <option value="AUTO_SUBMIT">Auto-Submit Attempt</option>
                <option value="LOCK">Lock Screen Only</option>
              </select>
            </div>
            <div>
              <label style={lblStyle}>Restricted Actions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {[
                  { key: 'COPY', label: 'Prevent Copying' },
                  { key: 'CUT', label: 'Prevent Cutting' },
                  { key: 'RIGHT_CLICK', label: 'Disable Right-Click' },
                  { key: 'PRINT', label: 'Prevent Printing' },
                  { key: 'BLOCKED_SHORTCUT', label: 'Block DevTools/SelectAll Shortcuts' },
                ].map(act => {
                  const checked = form.copyViolationActions.includes(act.key)
                  return (
                    <label key={act.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const nextActions = e.target.checked
                            ? [...form.copyViolationActions, act.key]
                            : form.copyViolationActions.filter(x => x !== act.key)
                          setForm({ ...form, copyViolationActions: nextActions })
                        }}
                      />
                      {act.label}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <ToggleRow label="Enable Screen Monitoring & Live Proctoring" desc="Require participants to share their screen and be monitored live by the trainer" checked={form.proctoringEnabled} onChange={v => setForm({ ...form, proctoringEnabled: v })} />
        {form.proctoringEnabled && (
          <div style={{ paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: `2px solid ${colors.slate[200]}`, marginTop: 8 }}>
            <div>
              <label style={lblStyle}>Proctoring / Monitoring Level</label>
              <select style={selectStyle} value={form.proctoringLevel} onChange={e => setForm({ ...form, proctoringLevel: e.target.value })}>
                <option value="LOW">Low (Permissive constraints)</option>
                <option value="MEDIUM">Medium (Standard constraints)</option>
                <option value="HIGH">High (Strict constraints)</option>
              </select>
            </div>
            <div>
              <label style={lblStyle}>Reconnection Grace Period (minutes)</label>
              <input style={inputStyle} type="number" min={1} max={10} value={form.gracePeriodMinutes} onChange={e => setForm({ ...form, gracePeriodMinutes: parseInt(e.target.value) || 2 })} />
            </div>
          </div>
        )}
      </div>
      <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, marginTop: 24, opacity: saving ? 0.6 : 1 }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Save Settings
      </button>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, flexShrink: 0, marginTop: 2, cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{
          position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 20,
          background: checked ? colors.primary[600] : colors.slate[300], transition: '0.2s',
        }}>
          <span style={{
            position: 'absolute', left: checked ? 18 : 2, top: 2, width: 16, height: 16,
            borderRadius: '50%', background: colors.surface.primary, transition: '0.2s',
          }} />
        </span>
      </label>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900] }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 2 }}>{desc}</div>}
      </div>
    </div>
  )
}
