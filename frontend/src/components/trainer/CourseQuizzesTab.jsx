import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, Send, Sparkles, ListChecks, Search,
  X, Save, Check, AlertTriangle, ChevronDown, ChevronUp, BookOpen, Trophy,
  BarChart3, FileText, Upload,
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import {
  colors, btnPrimary, btnSecondary, iconBtn, STATUS_BADGE, RESULT_BADGE,
  lblStyle, lblTiny, inputStyle, th, td, skeletonStyle, typography, DIFF_BADGE,
} from '../../theme/tokens'

function Badge({ value, map }) {
  const v = map[value] || map.DRAFT
  return <span style={v}>{value}</span>
}

const blankQuestion = () => ({
  question: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
})

function QuizBuilder({ user, courseId, lessons, existingQuiz, onClose, onSaved }) {
  const { success, error: showError } = useToast()
  const [title, setTitle] = useState(existingQuiz?.title || '')
  const [lessonId, setLessonId] = useState(existingQuiz?.lessonId || '')
  const [isMandatory, setIsMandatory] = useState(existingQuiz?.isMandatory ?? true)
  const [status, setStatus] = useState(existingQuiz?.status || 'DRAFT')
  const [questions, setQuestions] = useState(() => {
    if (!existingQuiz?.questions?.length) return [blankQuestion()]
    return existingQuiz.questions.map(q => {
      const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : ['', '', '', '']
      while (opts.length < 4) opts.push('')
      const correctIndex = Math.max(0, opts.findIndex(o => o === q.correctAnswer))
      return { question: q.questionText || '', options: opts, correctIndex, explanation: q.explanation || '' }
    })
  })
  const [saving, setSaving] = useState(false)

  const auth = () => ({ Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' })

  const addQ = () => setQuestions([...questions, blankQuestion()])
  const removeQ = (i) => setQuestions(questions.filter((_, x) => x !== i))
  const updateQ = (i, patch) => setQuestions(questions.map((q, x) => x === i ? { ...q, ...patch } : q))
  const updateOption = (qi, oi, val) => {
    const next = [...questions]
    next[qi].options[oi] = val
    setQuestions(next)
  }

  const validate = () => {
    if (!title.trim()) return 'Title is required'
    if (questions.length === 0) return 'Add at least one question'
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question.trim()) return `Question ${i + 1} text is empty`
      if (q.options.some(o => !String(o).trim())) return `Question ${i + 1}: all 4 options are required`
      if (q.correctIndex < 0 || q.correctIndex > 3) return `Question ${i + 1}: pick the correct answer`
    }
    return null
  }

  const submit = async () => {
    const err = validate()
    if (err) { showError(err); return }
    try {
      setSaving(true)
      const url = existingQuiz
        ? API.TRAINER_COURSES.QUIZ(courseId, existingQuiz.id)
        : API.TRAINER_COURSES.QUIZ_MANUAL(courseId)

      const body = {
        title: title.trim(),
        lessonId: lessonId || null,
        isMandatory,
        questions,
      }
      if (existingQuiz) body.status = status

      const r = await fetch(url, {
        method: existingQuiz ? 'PUT' : 'POST',
        headers: auth(),
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Save failed'); return }
      success(existingQuiz ? 'Quiz updated' : 'Quiz created (DRAFT)')
      onSaved?.()
      onClose()
    } catch (e) { showError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 720,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: 18, borderBottom: `1px solid ${colors.slate[200]}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={lblTiny}>{existingQuiz ? 'Edit quiz' : 'Create quiz manually'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
              {title || (existingQuiz ? 'Editing…' : 'New quiz')}
            </div>
          </div>
          <button onClick={onClose} disabled={saving} style={iconBtn(colors.slate[100], colors.slate[600])}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          <label style={lblStyle}>Quiz title <span style={{ color: colors.danger[600] }}>*</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Module 2 Knowledge Check" style={inputStyle} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
            <div>
              <label style={lblStyle}>Link to lesson (optional)</label>
              <select value={lessonId || ''} onChange={(e) => setLessonId(e.target.value || '')} style={inputStyle}>
                <option value="">— Course-level (no specific lesson) —</option>
                {lessons.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Settings</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 8, fontSize: 13, color: colors.slate[600] }}>
                <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
                Mandatory quiz
              </label>
              {existingQuiz && (
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                  <option value="DRAFT">DRAFT</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              )}
            </div>
          </div>

          <h4 style={{ fontSize: 13, fontWeight: 700, color: colors.slate[900], textTransform: 'uppercase',
                       letterSpacing: 0.5, marginTop: 22, marginBottom: 12 }}>
            Questions ({questions.length})
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {questions.map((q, i) => (
              <div key={i} style={{
                background: colors.surface.secondary, border: `1px solid ${colors.slate[200]}`, borderRadius: 10, padding: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary[600], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Question {i + 1}
                  </span>
                  {questions.length > 1 && (
                    <button onClick={() => removeQ(i)} style={iconBtn(colors.danger[100], colors.danger[600])} title="Remove">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                <textarea
                  value={q.question}
                  onChange={(e) => updateQ(i, { question: e.target.value })}
                  placeholder="Type the question…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  {q.options.map((opt, oi) => (
                    <label key={oi} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: 8,
                      background: q.correctIndex === oi ? colors.success[100] : colors.surface.primary,
                      border: `1px solid ${q.correctIndex === oi ? colors.success[300] : colors.slate[300]}`,
                      borderRadius: 8, transition: 'all 0.1s',
                    }}>
                      <input
                        type="radio"
                        checked={q.correctIndex === oi}
                        onChange={() => updateQ(i, { correctIndex: oi })}
                      />
                      <input
                        value={opt}
                        onChange={(e) => updateOption(i, oi, e.target.value)}
                        placeholder={`Option ${'ABCD'[oi]}`}
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13 }}
                      />
                      {q.correctIndex === oi && <Check size={14} color={colors.success[700]} />}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>Explanation (Optional)</label>
                  <input
                    value={q.explanation || ''}
                    onChange={(e) => updateQ(i, { explanation: e.target.value })}
                    placeholder="Provide context or explanation for why the correct option is correct..."
                    style={{ ...inputStyle, marginTop: 4, padding: '8px 12px', fontSize: 13 }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button" onClick={addQ}
            style={{
              marginTop: 12, padding: '10px 14px', background: colors.surface.primary,
              border: `1px dashed ${colors.slate[300]}`, borderRadius: 8, fontSize: 12, fontWeight: 600,
              color: colors.slate[600], cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Add question
          </button>
        </div>

        <div style={{
          padding: 16, borderTop: `1px solid ${colors.slate[200]}`,
          display: 'flex', justifyContent: 'flex-end', gap: 10, background: colors.bg.base,
        }}>
          <button onClick={onClose} disabled={saving} style={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={saving} style={btnPrimary}>
            <Save size={14} style={{ marginRight: 6 }} />
            {saving ? 'Saving…' : (existingQuiz ? 'Save Changes' : 'Save as Draft')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function PublishDialog({ user, courseId, quiz, onClose, onPublished }) {
  const { success, error: showError } = useToast()
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [forceMode, setForceMode]   = useState(false)
  const [reason, setReason]         = useState('')

  const auth = () => ({ Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' })

  useEffect(() => {
    let aborted = false
    setLoading(true)
    setStats(null)
    setForceMode(false)
    setReason('')
    ;(async () => {
      try {
        const r = await fetch(API.TRAINER_COURSES.RESULTS_SUMMARY(quiz.id), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const d = await r.json()
        if (!aborted && d.success) setStats(d)
        else if (!aborted) setStats(null)
      } catch { if (!aborted) setStats(null) }
      finally  { if (!aborted) setLoading(false) }
    })()
    return () => { aborted = true }
  }, [quiz.id])

  const publish = async () => {
    try {
      setPublishing(true)
      const r = await fetch(API.TRAINER_COURSES.PUBLISH_ALL_RESULTS(quiz.id), {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ override: forceMode, reason: reason.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || d.message || 'Publish failed'); return }
      success(`Results published to ${d.enrolled ?? stats?.enrolled ?? 0} participants ✓`)
      onPublished?.()
      onClose()
    } catch (e) { showError(e.message) }
    finally { setPublishing(false) }
  }

  const ready    = stats && stats.enrolled > 0 && stats.pending === 0
  const canClick = !publishing && !!stats && stats.enrolled > 0 && (stats.pending === 0 || forceMode)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !publishing && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: colors.surface.primary, borderRadius: 16, width: '100%', maxWidth: 500, padding: 26,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
          Publish Quiz Results
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.slate[500] }}>{quiz.title}</p>

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ height: 64, borderRadius: 10, background: colors.slate[100],
                animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {!loading && !stats && (
          <div style={{ padding: 14, background: colors.danger[50], color: colors.danger[600], borderRadius: 8,
            fontSize: 13, marginBottom: 20 }}>
            Failed to load quiz data. Please close and try again.
          </div>
        )}

        {!loading && stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
              <StatCard label="ENROLLED"  value={stats.enrolled}  color={colors.primary[600]} bg={colors.primary[50]} />
              <StatCard label="COMPLETED" value={stats.completed} color={colors.success[700]} bg={colors.success[100]} />
              <StatCard label="PENDING"   value={stats.pending}   color={colors.warning[800]} bg={colors.warning[100]} />
              {stats.averageScore != null && (
                <StatCard label="AVG SCORE" value={`${stats.averageScore}%`} color="#0891B2" bg={colors.primary[50]} />
              )}
              {stats.passRate != null && (
                <StatCard label="PASS RATE" value={`${stats.passRate}%`} color={colors.primary[600]} bg={colors.primary[50]} />
              )}
            </div>

            {ready ? (
              <div style={{ padding: '11px 14px', background: colors.success[100], color: colors.success[700],
                borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <Check size={16} /> All participants completed. Ready to publish.
              </div>
            ) : stats.enrolled === 0 ? (
              <div style={{ padding: '11px 14px', background: colors.slate[100], color: colors.slate[600],
                borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <AlertTriangle size={16} /> No enrolled participants — nothing to notify.
              </div>
            ) : (
              <div style={{ padding: '11px 14px', background: colors.warning[100], color: colors.warning[800],
                borderRadius: 9, fontSize: 13, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <AlertTriangle size={16} />
                  <span><strong>{stats.pending}</strong> participant{stats.pending !== 1 ? 's' : ''} haven't completed yet.</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={forceMode} onChange={(e) => setForceMode(e.target.checked)} />
                  Publish anyway (override)
                </label>
                {forceMode && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for override (recommended for audit trail)…"
                    rows={2}
                    style={{ marginTop: 8, width: '100%', fontSize: 12, padding: '6px 8px',
                      border: `1px solid ${colors.warning[400]}`, borderRadius: 6, resize: 'vertical',
                      fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                  />
                )}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} disabled={publishing} style={btnSecondary}>Cancel</button>
          <button
            onClick={publish}
            disabled={!canClick}
            style={{ ...btnPrimary, opacity: canClick ? 1 : 0.45 }}
          >
            <Send size={14} style={{ marginRight: 6 }} />
            {publishing ? 'Publishing…' : 'Publish Results'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function StatCard({ label, value, color, bg }) {
  return (
    <div style={{ padding: '12px 10px', background: bg, borderRadius: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color, opacity: 0.75, letterSpacing: 0.4 }}>{label}</div>
    </div>
  )
}

function QuizPreview({ quiz, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 640,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: 18, borderBottom: `1px solid ${colors.slate[200]}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={lblTiny}>Quiz preview</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>{quiz.title}</div>
          </div>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}>
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {(quiz.questions || []).map((q, i) => (
            <div key={q.id} style={{
              background: colors.surface.secondary, border: `1px solid ${colors.slate[200]}`, borderRadius: 10, padding: 14, marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary[600], marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Q{i + 1}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.slate[900], marginBottom: 8 }}>
                {q.questionText}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(q.options || []).map((o, oi) => (
                  <div key={oi} style={{
                    padding: '6px 10px', fontSize: 13, borderRadius: 6,
                    background: o === q.correctAnswer ? colors.success[100] : colors.surface.primary,
                    color: o === q.correctAnswer ? colors.success[700] : colors.slate[600],
                    border: `1px solid ${o === q.correctAnswer ? colors.success[300] : colors.slate[200]}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 11 }}>{'ABCD'[oi]}.</span>
                    <span style={{ flex: 1 }}>{o}</span>
                    {o === q.correctAnswer && <Check size={14} color={colors.success[700]} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function CourseQuizzesTab({ user, courseId, onCountChange }) {
  const navigate = useNavigate()
  const { success, error: showError, info } = useToast()
  const [quizzes, setQuizzes] = useState([])
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [bankSearch, setBankSearch] = useState('')
  const [bankExpanded, setBankExpanded] = useState(false)

  const [builderState, setBuilderState] = useState(null)
  const [previewQuiz, setPreviewQuiz] = useState(null)
  const [publishQuiz, setPublishQuiz] = useState(null)
  const [showGenerator, setShowGenerator] = useState(false)
  const [leaderboardQuiz, setLeaderboardQuiz] = useState(null)
  const [leaderboardData, setLeaderboardData] = useState([])
  const [sendingQuizId, setSendingQuizId] = useState(null)

  const handleQuizGenerated = (questions, title) => {
    if (questions === null) {
      fetchAll()
      onCountChange?.()
    } else {
      setBuilderState({
        quiz: {
          title: title,
          questions: questions
        }
      })
    }
  }

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [qr, lr] = await Promise.all([
        fetch(API.TRAINER_COURSES.QUIZZES(courseId), { headers: auth() }).then(r => r.json()),
        fetch(API.TRAINER_COURSES.LESSONS(courseId), { headers: auth() }).then(r => r.json()),
      ])
      if (qr.success) setQuizzes(qr.quizzes || [])
      if (lr.success) setLessons(lr.lessons || [])
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchAll() }, [courseId])

  const fetchQuizForEdit = async (quizId) => {
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(courseId, quizId), { headers: auth() })
      const d = await r.json()
      if (d.success) return d.quiz
      showError(d.error || 'Failed to load quiz')
      return null
    } catch (e) { showError(e.message); return null }
  }

  const remove = async (q) => {
    if (!window.confirm(`Delete quiz "${q.title}"? This cannot be undone.`)) return
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(courseId, q.id), { method: 'DELETE', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.message || d.error || 'Delete failed'); return }
      success('Quiz deleted')
      await fetchAll()
      onCountChange?.()
    } catch (e) { showError(e.message) }
  }

  const openEdit = async (q) => {
    const full = await fetchQuizForEdit(q.id)
    if (full) setBuilderState({ quiz: full })
  }

  const openPreview = async (q) => {
    const full = await fetchQuizForEdit(q.id)
    if (full) setPreviewQuiz(full)
  }

  const sendQuiz = async (q) => {
    if (!window.confirm(`Send "${q.title}" to enrolled participants?`)) return
    setSendingQuizId(q.id)
    try {
      const r = await fetch(API.TRAINER_COURSES.SEND_QUIZ(q.id), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || d.message || 'Send failed'); return }
      success(`Quiz sent to ${d.assignedCount || 0} participant(s)`)
      await fetchAll()
    } catch (e) { showError(e.message) }
    finally { setSendingQuizId(null) }
  }

  const openLeaderboard = async (q) => {
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_LEADERBOARD(q.id), { headers: auth() })
      const d = await r.json()
      if (d.success) setLeaderboardData(d.leaderboard || [])
      else setLeaderboardData([])
    } catch { setLeaderboardData([]) }
    setLeaderboardQuiz(q)
  }

  const [bankQuestions, setBankQuestions] = useState([])
  useEffect(() => {
    if (!bankExpanded) return
    let aborted = false
    ;(async () => {
      const collected = []
      for (const q of quizzes) {
        try {
          const r = await fetch(API.TRAINER_COURSES.QUIZ(courseId, q.id), { headers: auth() })
          const d = await r.json()
          if (d.success && d.quiz?.questions) {
            d.quiz.questions.forEach(qq => collected.push({
              ...qq, sourceQuizId: d.quiz.id, sourceQuizTitle: d.quiz.title,
            }))
          }
        } catch {}
      }
      if (!aborted) setBankQuestions(collected)
    })()
    return () => { aborted = true }
  }, [bankExpanded, quizzes])

  const filteredBank = useMemo(() => {
    if (!bankSearch) return bankQuestions
    const q = bankSearch.toLowerCase()
    return bankQuestions.filter(qq =>
      (qq.questionText || '').toLowerCase().includes(q) ||
      (qq.sourceQuizTitle || '').toLowerCase().includes(q)
    )
  }, [bankQuestions, bankSearch])

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, flexWrap: 'wrap', gap: 12,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: colors.slate[900] }}>
          {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowGenerator(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', background: `linear-gradient(135deg, ${colors.primary[400]}, ${colors.primary[600]})`,
              color: colors.surface.primary, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} /> Generate with AI
          </button>
          <button
            onClick={() => setBuilderState({})}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', background: colors.surface.primary, color: colors.primary[600],
              border: `1px solid ${colors.primary[600]}`, borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Create Manually
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 240, background: colors.slate[100], borderRadius: 10 }} />
      ) : quizzes.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: colors.surface.primary, border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
        }}>
          <Sparkles size={40} color={colors.slate[300]} style={{ margin: '0 auto 8px' }} />
          <p style={{ margin: '0 0 6px', color: colors.slate[600], fontWeight: 600 }}>No quizzes yet</p>
          <p style={{ margin: 0, color: colors.slate[400], fontSize: 13 }}>
            Click <strong>Create Manually</strong> to add the first one.
          </p>
        </div>
      ) : (
        <div style={{
          background: colors.surface.primary, border: `1px solid ${colors.slate[200]}`, borderRadius: 12, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: colors.surface.secondary }}>
              <tr>
                <th style={th}>Title</th>
                <th style={th}>Lesson</th>
                <th style={th}>Questions</th>
                <th style={th}>Status</th>
                <th style={th}>Result</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map(q => (
                <tr key={q.id} style={{ borderTop: `1px solid ${colors.slate[100]}` }}>
                  <td style={td}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900] }}>{q.title}</div>
                    {q.isMandatory && (
                      <span style={{ fontSize: 9, color: colors.danger[600], fontWeight: 700, letterSpacing: 0.5 }}>MANDATORY</span>
                    )}
                  </td>
                  <td style={{ ...td, color: colors.slate[500], fontSize: 12 }}>{q.lessonTitle || '— Course-level —'}</td>
                  <td style={{ ...td, fontSize: 13, color: colors.slate[600] }}>{q.questionCount}</td>
                  <td style={td}><Badge value={q.status} map={STATUS_BADGE} /></td>
                  <td style={td}><Badge value={q.resultStatus} map={RESULT_BADGE} /></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button title="Preview" onClick={() => openPreview(q)} style={iconBtn(colors.slate[100], colors.slate[600])}>
                        <Eye size={12} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(q)} style={iconBtn(colors.primary[50], colors.primary[600])}>
                        <Pencil size={12} />
                      </button>
                      {q.status === 'DRAFT' ? (
                        <button title="Send to participants" onClick={() => sendQuiz(q)}
                          disabled={sendingQuizId === q.id}
                          style={{
                            ...iconBtn(colors.success[100], colors.success[700]),
                            opacity: sendingQuizId === q.id ? 0.5 : 1,
                            cursor: sendingQuizId === q.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <Send size={12} />
                        </button>
                      ) : (
                        <button
                          title={q.resultStatus === 'PUBLISHED' ? 'Already published' : 'Publish results'}
                          onClick={() => q.resultStatus !== 'PUBLISHED' && setPublishQuiz(q)}
                          disabled={q.resultStatus === 'PUBLISHED'}
                          style={{
                            ...iconBtn(colors.success[100], colors.success[700]),
                            opacity: q.resultStatus === 'PUBLISHED' ? 0.4 : 1,
                            cursor: q.resultStatus === 'PUBLISHED' ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <Send size={12} />
                        </button>
                      )}
                      <button title="Manage" onClick={() => navigate(`/trainer/quiz/${q.id}`)}
                        style={iconBtn(colors.primary[100], colors.primary[700])}>
                        <BarChart3 size={12} />
                      </button>
                      <button title="Leaderboard" onClick={() => openLeaderboard(q)}
                        style={iconBtn(colors.warning[100], colors.warning[800])}>
                        <Trophy size={12} />
                      </button>
                      <button title="Delete" onClick={() => remove(q)} style={iconBtn(colors.danger[100], colors.danger[600])}>
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

      <div style={{
        marginTop: 24, background: colors.surface.primary, border: `1px solid ${colors.slate[200]}`, borderRadius: 12,
      }}>
        <button
          onClick={() => setBankExpanded(v => !v)}
          style={{
            width: '100%', padding: 14, border: 'none', cursor: 'pointer', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: colors.slate[900] }}>
            <ListChecks size={16} /> Question Bank ({bankQuestions.length})
          </span>
          {bankExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {bankExpanded && (
          <div style={{ borderTop: `1px solid ${colors.slate[200]}`, padding: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              border: `1px solid ${colors.slate[200]}`, borderRadius: 8, marginBottom: 12,
            }}>
              <Search size={14} color={colors.slate[400]} />
              <input
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Search question text or source quiz…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13 }}
              />
            </div>
            {filteredBank.length === 0 ? (
              <div style={{ padding: 14, textAlign: 'center', color: colors.slate[400], fontSize: 12 }}>
                No questions match your search.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredBank.map(qq => (
                  <div key={`${qq.sourceQuizId}-${qq.id}`} style={{
                    padding: 10, border: `1px solid ${colors.slate[200]}`, borderRadius: 8, fontSize: 13,
                  }}>
                    <div style={{ color: colors.slate[900], marginBottom: 4 }}>{qq.questionText}</div>
                    <div style={{ fontSize: 11, color: colors.slate[500] }}>
                      <BookOpen size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {qq.sourceQuizTitle} · Correct: <strong>{qq.correctAnswer}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showGenerator && (
          <AIQuizGeneratorModal
            user={user}
            courseId={courseId}
            onClose={() => setShowGenerator(false)}
            onGenerated={handleQuizGenerated}
          />
        )}
        {builderState && (
          <QuizBuilder
            user={user}
            courseId={courseId}
            lessons={lessons}
            existingQuiz={builderState.quiz}
            onClose={() => setBuilderState(null)}
            onSaved={() => { fetchAll(); onCountChange?.() }}
          />
        )}
        {publishQuiz && (
          <PublishDialog
            user={user}
            courseId={courseId}
            quiz={publishQuiz}
            onClose={() => setPublishQuiz(null)}
            onPublished={fetchAll}
          />
        )}
        {previewQuiz && (
          <QuizPreview quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />
        )}
        {leaderboardQuiz && (
          <LeaderboardModal
            quiz={leaderboardQuiz}
            data={leaderboardData}
            onClose={() => setLeaderboardQuiz(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function AIQuizGeneratorModal({ user, courseId, onClose, onGenerated }) {
  const { success, error: showError } = useToast()
  const [activeTab, setActiveTab] = useState('prompt')
  
  const [promptText, setPromptText] = useState('')
  const [questionCount, setQuestionCount] = useState(10)
  const [difficulty, setDifficulty] = useState('Medium')
  const [generating, setGenerating] = useState(false)
  
  const [file, setFile] = useState(null)
  const [fileGenerating, setFileGenerating] = useState(false)
  const fileInputRef = useRef()

  const handleGenerateFromPrompt = async (e) => {
    e.preventDefault()
    if (!promptText.trim()) {
      showError('Please enter a prompt or topic')
      return
    }
    setGenerating(true)
    try {
      const response = await fetch(API.AI_QUIZ.GENERATE_FROM_PROMPT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          courseId: courseId,
          trainingId: courseId,
          prompt: promptText.trim(),
          questionCount: parseInt(questionCount, 10),
          difficulty: difficulty
        })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz')
      }
      
      success('Quiz Created Successfully')
      onGenerated(null)
      onClose()
    } catch (err) {
      showError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateFromDocument = async (e) => {
    e.preventDefault()
    if (!file) {
      showError('Please select a file to upload')
      return
    }
    setFileGenerating(true)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('courseId', courseId)
    formData.append('trainingId', courseId)
    formData.append('questionCount', questionCount)
    formData.append('difficulty', difficulty)

    try {
      const response = await fetch(API.AI_QUIZ.GENERATE_FROM_DOCUMENT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`
        },
        body: formData
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz from document')
      }
      
      success('Quiz Created Successfully')
      onGenerated(null)
      onClose()
    } catch (err) {
      showError(err.message)
    } finally {
      setFileGenerating(false)
    }
  }

  const modalStyle = {
    position: 'fixed', inset: 0, background: colors.bg.overlay,
    zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }

  const contentStyle = {
    background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 540,
    boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)', overflow: 'hidden',
    position: 'relative'
  }

  const tabStyle = (active) => ({
    flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
    background: active ? colors.surface.primary : colors.surface.secondary,
    color: active ? colors.primary[600] : colors.slate[500],
    fontWeight: 600, borderBottom: active ? `2px solid ${colors.primary[600]}` : `1px solid ${colors.slate[200]}`,
    fontSize: 13, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={modalStyle} onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} style={contentStyle}>
        
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${colors.slate[200]}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 1 }}>AI Quiz Wizard</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.slate[900], display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={16} /> Generate Quiz with AI</div>
          </div>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex' }}>
          <button type="button" onClick={() => setActiveTab('prompt')} style={tabStyle(activeTab === 'prompt')}>
            <Sparkles size={14} /> From Prompt / Topic
          </button>
          <button type="button" onClick={() => setActiveTab('document')} style={tabStyle(activeTab === 'document')}>
            <BookOpen size={14} /> From Document
          </button>
        </div>

        {generating || fileGenerating ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="generating-spinner" style={{ width: 40, height: 40, border: `4px solid ${colors.slate[200]}`, borderTop: `4px solid ${colors.primary[600]}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <div style={{ fontWeight: 700, fontSize: 15, color: colors.slate[900], marginTop: 8 }}>Generating quiz...</div>
            <div style={{ fontSize: 13, color: colors.slate[500], maxWidth: 360 }}>
              Analyzing document and generating questions. This may take up to 2 minutes. The AI service will automatically retry if temporarily unavailable.
            </div>
            <div style={{ width: '100%', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 16, background: colors.slate[100], borderRadius: 4, width: '70%' }} />
              <div style={{ height: 12, background: colors.slate[100], borderRadius: 4, width: '100%' }} />
              <div style={{ height: 12, background: colors.slate[100], borderRadius: 4, width: '85%' }} />
            </div>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            {activeTab === 'prompt' ? (
              <form onSubmit={handleGenerateFromPrompt}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...lblStyle, marginTop: 0 }}>Topic or Prompt <span style={{ color: colors.danger[600] }}>*</span></label>
                  <textarea
                    value={promptText}
                    onChange={e => setPromptText(e.target.value)}
                    placeholder="e.g. Java OOP Concepts (Inheritance, Polymorphism, Encapsulation, Abstraction)"
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical', fontSize: 13 }}
                    required
                  />
                  <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 4 }}>
                    Provide a specific topic or content snippet to guide question generation.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ ...lblStyle, marginTop: 0 }}>Number of Questions</label>
                    <select
                      value={questionCount}
                      onChange={e => setQuestionCount(e.target.value)}
                      style={inputStyle}
                    >
                      {[5, 10, 15, 20, 25, 30, 40, 50].map(n => (
                        <option key={n} value={n}>{n} Questions</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...lblStyle, marginTop: 0 }}>Difficulty</label>
                    <select
                      value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: `1px solid ${colors.slate[200]}`, paddingTop: 16 }}>
                  <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
                  <button type="submit" style={{ ...btnPrimary, background: `linear-gradient(135deg, ${colors.primary[400]}, ${colors.primary[600]})` }}>
                    <Sparkles size={14} /> Generate Quiz
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleGenerateFromDocument}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...lblStyle, marginTop: 0 }}>Select File <span style={{ color: colors.danger[600] }}>*</span></label>
                  <div style={{ fontSize: 11, color: colors.warning[800], background: colors.warning[100], padding: '8px 12px', borderRadius: 6, marginBottom: 8, display: 'flex', gap: 6 }}>
                    <AlertTriangle size={14} />
                    <span>Only PDF, DOCX, PPTX, and TXT files are supported. Images are not supported.</span>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.docx,.pptx,.txt"
                    onChange={e => setFile(e.target.files[0])}
                    style={{ display: 'none' }}
                  />
                  <div
                    onClick={() => fileInputRef.current.click()}
                    style={{
                      border: `2px dashed ${colors.slate[300]}`, borderRadius: 8, padding: '24px 12px',
                      textAlign: 'center', cursor: 'pointer', background: colors.surface.secondary,
                      transition: 'all 0.15s'
                    }}
                  >
                    {file ? (
                      <div>
                        <div style={{ marginBottom: 4 }}><FileText size={24} /></div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900] }}>{file.name}</div>
                        <div style={{ fontSize: 11, color: colors.slate[500], marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ marginBottom: 4, color: colors.slate[400] }}><Upload size={24} /></div>
                        <div style={{ fontSize: 13, fontWeight: 550, color: colors.slate[600] }}>Click to select a file</div>
                        <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 2 }}>PDF, DOCX, PPTX, or TXT up to 25MB</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ ...lblStyle, marginTop: 0 }}>Number of Questions</label>
                    <select
                      value={questionCount}
                      onChange={e => setQuestionCount(e.target.value)}
                      style={inputStyle}
                    >
                      {[5, 10, 15, 20].map(n => (
                        <option key={n} value={n}>{n} Questions</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...lblStyle, marginTop: 0 }}>Difficulty</label>
                    <select
                      value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: `1px solid ${colors.slate[200]}`, paddingTop: 16 }}>
                  <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={!file} style={{ ...btnPrimary, opacity: file ? 1 : 0.5 }}>
                    <Sparkles size={14} /> Upload &amp; Generate
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function LeaderboardModal({ quiz, data, onClose }) {
  const sorted = [...data].sort((a, b) => (b.score || 0) - (a.score || 0))
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 500, padding: 22, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
            <Trophy size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: colors.warning[500] }} />
            Leaderboard — {quiz.title}
          </h3>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}><X size={14} /></button>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400], fontSize: 14 }}>
            No submissions yet.
          </div>
        ) : (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${colors.slate[200]}` }}>
                  <th style={{ ...th, width: 40 }}>#</th>
                  <th style={th}>Participant</th>
                  <th style={{ ...th, textAlign: 'right' }}>Score</th>
                  <th style={{ ...th, textAlign: 'right' }}>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, i) => (
                  <tr key={entry.participantId || i} style={{ borderBottom: `1px solid ${colors.slate[100]}` }}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: i < 3 ? colors.warning[500] : colors.slate[400], fontSize: 13 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: colors.slate[900], fontSize: 13 }}>
                      {entry.participantName || 'Anonymous'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: colors.slate[600], fontSize: 13 }}>
                      {entry.score ?? '-'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: (entry.percentage || 0) >= 80 ? colors.success[100] : (entry.percentage || 0) >= 50 ? colors.warning[100] : colors.danger[100],
                        color: (entry.percentage || 0) >= 80 ? colors.success[700] : (entry.percentage || 0) >= 50 ? colors.warning[800] : colors.danger[600],
                      }}>
                        {entry.percentage != null ? `${Math.round(entry.percentage)}%` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
