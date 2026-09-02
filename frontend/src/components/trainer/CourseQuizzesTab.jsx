import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, Send, Sparkles, ListChecks, Search,
  X, Save, Check, AlertTriangle, ChevronDown, ChevronUp, BookOpen, Trophy,
  BarChart3, FileText, Upload, Clock, HelpCircle, Users, Star, Settings,
  Shield, CheckCircle2, RefreshCw, MoreVertical, ArrowLeft, ArrowRight, Loader2, AlertCircle,
  Calendar, Award, Activity, CheckSquare, Code, BarChart2, Info, Download
} from 'lucide-react'
import { SingleAttemptProctoringModal } from '../../proctoring/components/TrainerMonitoringReport'
import { API, API_BASE } from '../../api/api'
import { useToast } from '../Toast'
import { useConfirm } from '../ui/AlertModal'
import {
  colors, btnPrimary, btnSecondary, iconBtn, STATUS_BADGE, RESULT_BADGE,
  lblStyle, lblTiny, inputStyle, th, td, skeletonStyle, typography, DIFF_BADGE,
} from '../../theme/tokens'
import '../../styles/course-tabs.css'
import { getTwoLetterInitials } from '../common/UserAvatar'

const blankQuestion = () => ({
  question: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
})

export default function CourseQuizzesTab({ user, courseId, onCountChange }) {
  const { success, error: showError } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`course_quizzes_${courseId}`)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [lessons, setLessons] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`course_lessons_${courseId}`)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`course_quizzes_${courseId}`)
      return !cached
    } catch {
      return true
    }
  })
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedQuizzes, setSelectedQuizzes] = useState(new Set())
  const [builderState, setBuilderState] = useState(null)
  const [viewingQuizId, setViewingQuizId] = useState(null)
  const [publishQuiz, setPublishQuiz] = useState(null)
  const [sendingQuizId, setSendingQuizId] = useState(null)
  const [leaderboardQuiz, setLeaderboardQuiz] = useState(null)
  const [leaderboardData, setLeaderboardData] = useState([])
  const [bankExpanded, setBankExpanded] = useState(false)
  const [bankSearch, setBankSearch] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchAll = async () => {
    if (!courseId) return
    try {
      if (quizzes.length === 0) setLoading(true)
      const [qr, lr] = await Promise.all([
        fetch(`${API.TRAINER_COURSES.QUIZZES(courseId)}?page=${page}&limit=${limit}`, { headers: auth() })
          .then(async r => {
            if (!r.ok) return { success: false, quizzes: [] }
            const t = await r.text()
            try { return JSON.parse(t) } catch { return { success: false, quizzes: [] } }
          })
          .catch(() => ({ success: false, quizzes: [] })),
        fetch(API.TRAINER_COURSES.LESSONS(courseId), { headers: auth() })
          .then(async r => {
            if (!r.ok) return { success: false, lessons: [] }
            const t = await r.text()
            try { return JSON.parse(t) } catch { return { success: false, lessons: [] } }
          })
          .catch(() => ({ success: false, lessons: [] })),
      ])
      if (qr && qr.success) {
        setQuizzes(qr.quizzes || [])
        setTotal(qr.total !== undefined ? qr.total : (qr.quizzes ? qr.quizzes.length : 0))
        setTotalPages(qr.totalPages || Math.ceil((qr.total || (qr.quizzes?.length || 0)) / limit) || 1)
        try {
          sessionStorage.setItem(`course_quizzes_${courseId}`, JSON.stringify(qr.quizzes || []))
        } catch (_) {}
      }
      if (lr && lr.success) {
        setLessons(lr.lessons || [])
        try {
          sessionStorage.setItem(`course_lessons_${courseId}`, JSON.stringify(lr.lessons || []))
        } catch (_) {}
      }
    } catch {
      // Ignore network errors gracefully
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [courseId, page, limit])

  const fetchQuizForEdit = async (quizId) => {
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(courseId, quizId), { headers: auth() })
      const text = await r.text()
      let d = {}
      try { d = JSON.parse(text) } catch { d = {} }
      if (d.success && d.quiz) return d.quiz
      showError(d.error || 'Failed to load quiz')
      return null
    } catch (e) { showError(e.message); return null }
  }

  const remove = async (q) => {
    const ok = await confirm({
      title: 'Delete Quiz',
      message: `Are you sure you want to delete "${q.title}"? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Permanently',
    })
    if (!ok) return
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ(courseId, q.id), { method: 'DELETE', headers: auth() })
      const text = await r.text()
      let d = {}
      try { d = JSON.parse(text) } catch { d = {} }
      if (!r.ok || d.success === false) { showError(d.message || d.error || 'Delete failed'); return }
      success('Quiz deleted')
      setSelectedQuizzes(prev => {
        const next = new Set(prev)
        next.delete(q.id)
        return next
      })
      await fetchAll()
      onCountChange?.()
    } catch (e) { showError(e.message) }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedQuizzes(new Set(quizzes.map(q => q.id)))
    } else {
      setSelectedQuizzes(new Set())
    }
  }

  const handleSelectQuiz = (id) => {
    setSelectedQuizzes(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const bulkDelete = async () => {
    if (selectedQuizzes.size === 0) return
    const ok = await confirm({
      title: 'Bulk Delete Quizzes',
      message: `Are you sure you want to delete ${selectedQuizzes.size} selected quiz(zes)? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Selected',
    })
    if (!ok) return
    try {
      const r = await fetch(`${API.TRAINER_COURSES.QUIZZES(courseId)}/bulk-delete`, {
        method: 'DELETE',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedQuizzes) })
      })
      const text = await r.text()
      let d = {}
      try { d = JSON.parse(text) } catch { d = {} }
      if (!r.ok || d.success === false) { showError(d.message || d.error || 'Bulk delete failed'); return }
      success('Selected quizzes deleted')
      setSelectedQuizzes(new Set())
      await fetchAll()
      onCountChange?.()
    } catch (e) { showError(e.message) }
  }

  const openEdit = async (q) => {
    const full = await fetchQuizForEdit(q.id)
    if (full) setBuilderState({ quiz: full })
  }

  const sendQuiz = async (q) => {
    const ok = await confirm({
      title: 'Send Quiz',
      message: `Are you sure you want to send "${q.title}" to enrolled participants?`,
      type: 'publish',
      confirmText: 'Yes, Send',
    })
    if (!ok) return
    setSendingQuizId(q.id)
    try {
      const r = await fetch(API.TRAINER_COURSES.SEND_QUIZ(q.id), { method: 'POST', headers: auth() })
      const text = await r.text()
      let d = {}
      try { d = JSON.parse(text) } catch { d = {} }
      if (!r.ok || d.success === false) { showError(d.error || d.message || 'Send failed'); return }
      success(`Quiz sent to ${d.assignedCount || 0} participant(s)`)
      await fetchAll()
    } catch (e) { showError(e.message) }
    finally { setSendingQuizId(null) }
  }

  const openLeaderboard = async (q) => {
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_LEADERBOARD(q.id), { headers: auth() })
      const text = await r.text()
      let d = {}
      try { d = JSON.parse(text) } catch { d = {} }
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
    <div className="cqt-container">
      {/* Header bar */}
      <div className="cqt-header">
        <h3 className="cqt-title">
          {total || quizzes.length} Quiz{(total || quizzes.length) !== 1 ? 'zes' : ''}
        </h3>
        <div className="cqt-actions">
          {selectedQuizzes.size > 0 && (
            <button
              onClick={bulkDelete}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 600,
                fontSize: 12.5,
                cursor: 'pointer',
                marginRight: 8
              }}
            >
              <Trash2 size={13} /> Delete Selected ({selectedQuizzes.size})
            </button>
          )}
          <button
            onClick={() => setShowGenerator(true)}
            className="cqt-btn-ai"
          >
            <Sparkles size={13} /> Generate with AI
          </button>
          <button
            onClick={() => setBuilderState({})}
            className="cqt-btn-manual"
          >
            <Plus size={13} /> Create Manually
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 160, background: '#F8FAFC', borderRadius: 12, border: '1px solid #F1F5F9' }} />
      ) : quizzes.length === 0 ? (
        <div className="cqt-empty-state">
          <Sparkles size={32} color="#94A3B8" style={{ margin: '0 auto 6px' }} />
          <h4>No quizzes yet</h4>
          <p>Click <strong>Create Manually</strong> or <strong>Generate with AI</strong> to add the first one.</p>
        </div>
      ) : (
        <div className="cqt-table-card">
          <table className="cqt-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={quizzes.length > 0 && selectedQuizzes.size === quizzes.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>TITLE</th>
                <th>LESSON</th>
                <th>QUESTIONS</th>
                <th>STATUS</th>
                <th>RESULT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map(q => (
                <tr key={q.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedQuizzes.has(q.id)}
                      onChange={() => handleSelectQuiz(q.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <div className="cqt-quiz-title">{q.title}</div>
                    {q.isMandatory && (
                      <span className="cqt-badge-mandatory">MANDATORY</span>
                    )}
                  </td>
                  <td className="cqt-cell-muted">{q.lessonTitle || '— Course-level —'}</td>
                  <td className="cqt-cell-num">{q.questionCount ?? q.questions?.length ?? 0}</td>
                  <td>
                    <span className={`cqt-badge cqt-badge--${(q.status || 'DRAFT').toLowerCase()}`}>
                      {q.status || 'DRAFT'}
                    </span>
                  </td>
                  <td>
                    <span className={`cqt-badge cqt-badge--${(q.resultStatus || 'HIDDEN').toLowerCase()}`}>
                      {q.resultStatus || 'HIDDEN'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        title="View Quiz Details"
                        onClick={() => setViewingQuizId(q.id)}
                        className="cqt-action-btn"
                      >
                        <Eye size={12} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(q)} className="cqt-action-btn cqt-action-btn--edit">
                        <Pencil size={12} />
                      </button>
                      {q.status === 'DRAFT' ? (
                        <button title="Send to participants" onClick={() => sendQuiz(q)}
                          disabled={sendingQuizId === q.id}
                          className="cqt-action-btn cqt-action-btn--send"
                        >
                          <Send size={12} />
                        </button>
                      ) : (
                        <button
                          title={q.resultStatus === 'PUBLISHED' ? 'Already published' : 'Publish results'}
                          onClick={() => q.resultStatus !== 'PUBLISHED' && setPublishQuiz(q)}
                          disabled={q.resultStatus === 'PUBLISHED'}
                          className="cqt-action-btn cqt-action-btn--send"
                          style={{ opacity: q.resultStatus === 'PUBLISHED' ? 0.45 : 1 }}
                        >
                          <Send size={12} />
                        </button>
                      )}
                      <button
                        title="Manage / Analytics"
                        onClick={() => setViewingQuizId(q.id)}
                        className="cqt-action-btn cqt-action-btn--manage"
                      >
                        <BarChart3 size={12} />
                      </button>
                      <button title="Leaderboard" onClick={() => openLeaderboard(q)}
                        className="cqt-action-btn cqt-action-btn--trophy">
                        <Trophy size={12} />
                      </button>
                      <button title="Delete" onClick={() => remove(q)} className="cqt-action-btn cqt-action-btn--delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', borderRadius: '0 0 12px 12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  Showing <strong style={{ color: '#0F172A' }}>{((page - 1) * limit + 1)}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(page * limit, total || quizzes.length)}</strong> of <strong style={{ color: '#0F172A' }}>{total || quizzes.length}</strong> quizzes
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid #CBD5E1',
                    background: '#FFFFFF', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer',
                    color: page === 1 ? '#CBD5E1' : '#475569', display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <ArrowLeft size={12} /> Prev
                </button>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      style={{
                        width: 28, height: 28, borderRadius: 6, border: '1px solid #CBD5E1',
                        background: p === page ? '#16A34A' : '#FFFFFF',
                        color: p === page ? '#FFFFFF' : '#475569',
                        fontSize: 12, fontWeight: p === page ? 600 : 400, cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid #CBD5E1',
                    background: '#FFFFFF', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer',
                    color: page === totalPages ? '#CBD5E1' : '#475569', display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  Next <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Question Bank Accordion */}
      <div className="cqt-bank-card">
        <button
          onClick={() => setBankExpanded(v => !v)}
          className="cqt-bank-toggle"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={14} color="#16A34A" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
              Question Bank ({bankQuestions.length})
            </span>
          </div>
          {bankExpanded ? <ChevronUp size={14} color="#64748B" /> : <ChevronDown size={14} color="#64748B" />}
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
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13 }}
              />
            </div>
            {filteredBank.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.slate[400], fontSize: 12 }}>
                No questions found in this course's quizzes.
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredBank.map((qq, i) => (
                  <div key={qq.id || i} style={{
                    padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #F1F5F9',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {qq.questionText}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>From: {qq.sourceQuizTitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── NEW QUIZ DETAIL OVERLAY MODAL ── */}
      <AnimatePresence>
        {viewingQuizId && (
          <QuizDetailModal
            quizId={viewingQuizId}
            user={user}
            courseId={courseId}
            onClose={() => { setViewingQuizId(null); fetchAll() }}
          />
        )}
      </AnimatePresence>

      {/* ── AI QUIZ GENERATOR MODAL ── */}
      <AnimatePresence>
        {showGenerator && (
          <AIQuizGeneratorModal
            user={user}
            courseId={courseId}
            onClose={() => setShowGenerator(false)}
            onGenerated={() => { fetchAll(); onCountChange?.() }}
          />
        )}
      </AnimatePresence>

      {/* Quiz Builder Modal */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Publish Dialog */}
      <AnimatePresence>
        {publishQuiz && (
          <PublishDialog
            user={user}
            courseId={courseId}
            quiz={publishQuiz}
            onClose={() => setPublishQuiz(null)}
            onPublished={() => fetchAll()}
          />
        )}
      </AnimatePresence>

      {/* Leaderboard Modal */}
      <AnimatePresence>
        {leaderboardQuiz && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLeaderboardQuiz(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 620,
                maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 24,
                boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trophy size={18} color="#D97706" /> Leaderboard — {leaderboardQuiz.title}
                </h3>
                <button onClick={() => setLeaderboardQuiz(null)} style={iconBtn(colors.slate[100], colors.slate[600], 30)}><X size={14} /></button>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {leaderboardData.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No submissions yet for leaderboard.</div>
                ) : (
                  <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>RANK</th>
                          <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                          <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                          <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>TIME</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboardData.map((l, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12 }}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{l.name || l.participantName || `Participant #${l.participantId}`}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#16A34A', fontSize: 13 }}>{l.score != null ? `${l.score}%` : '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#64748B' }}>{l.timeTaken ? `${l.timeTaken}s` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LARGE POPUP / OVERLAY MODAL: QUIZ DETAIL MODAL
   ───────────────────────────────────────────────────────────────────────────── */
function QuizDetailModal({ quizId, user, courseId, onClose }) {
  const toast = useToast()
  const auth = () => ({ Authorization: `Bearer ${user?.token}`, 'Content-Type': 'application/json' })

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('details')
  const [questions, setQuestions] = useState([])
  const [participants, setParticipants] = useState([])
  const [results, setResults] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [selectedProctorAttempt, setSelectedProctorAttempt] = useState(null)

  const fetchQuizDetails = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(API.TRAINER_COURSES.QUIZ_DETAIL(quizId), { headers: auth() })
      const d = await r.json()
      if (d.quiz) {
        setQuiz(d.quiz)
        setQuestions(d.quiz.questions || [])
      } else {
        toast.error('Quiz details not found')
      }
    } catch {
      toast.error('Failed to load quiz')
    } finally {
      setLoading(false)
    }
  }, [quizId])

  useEffect(() => { fetchQuizDetails() }, [fetchQuizDetails])

  // Fetch tab-specific data on tab switch
  useEffect(() => {
    if (!quizId) return
    if (activeTab === 'participants') {
      fetch(API.TRAINER_COURSES.QUIZ_PARTICIPANTS(quizId), { headers: auth() })
        .then(r => r.json()).then(d => setParticipants(d.participants || [])).catch(() => {})
    } else if (activeTab === 'results') {
      fetch(API.TRAINER_COURSES.QUIZ_RESULTS(quizId), { headers: auth() })
        .then(r => r.json()).then(d => setResults(d.results || [])).catch(() => {})
    } else if (activeTab === 'analytics') {
      fetch(API.TRAINER_COURSES.RESULTS_SUMMARY(quizId), { headers: auth() })
        .then(r => r.json()).then(d => setAnalytics(d)).catch(() => {})
    } else if (activeTab === 'leaderboard') {
      fetch(API.TRAINER_COURSES.QUIZ_LEADERBOARD(quizId), { headers: auth() })
        .then(r => r.json()).then(d => setLeaderboard(d.leaderboard || [])).catch(() => {})
    }
  }, [activeTab, quizId])

  const tabs = [
    { key: 'details',      label: 'Quiz Details', icon: FileText },
    { key: 'questions',    label: 'Questions',    icon: HelpCircle },
    { key: 'participants', label: 'Participants', icon: Users },
    { key: 'results',      label: 'Results',      icon: BarChart3 },
    { key: 'analytics',    label: 'Analytics',    icon: BarChart3 },
    { key: 'leaderboard',  label: 'Leaderboard',  icon: Trophy },
    { key: 'settings',     label: 'Settings',     icon: Settings },
  ]

  const trainerName = user?.name || 'Trainer Kannan'
  const trainerInitials = getTwoLetterInitials(trainerName)

  // Disable background scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  return createPortal(
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
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
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
          width: 'min(1340px, 90vw)',
          height: 'min(860px, 90vh)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 80px -15px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1000000,
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
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
            <ArrowLeft size={14} /> Back to Quizzes
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748B' }}>
              <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto 12px', color: '#16A34A' }} />
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Loading quiz details…</div>
            </div>
          ) : !quiz ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#DC2626' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Quiz details not found</div>
            </div>
          ) : (
            <>
              {/* ── AI Quiz Header Card ── */}
              <div style={{
                background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16,
                padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, flexWrap: 'wrap', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', background: '#16A34A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }}>
                    <FileText size={24} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
                      {quiz.title || 'Candidate Information Form Quiz'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: '#EAF8F0', color: '#16A34A'
                      }}>
                        {quiz.status || 'Published'}
                      </span>
                      <span style={{
                        padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: '#EFF6FF', color: '#2563EB'
                      }}>
                        Results: {quiz.resultStatus || 'Hidden'}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>• {questions.length || 10} question(s)</span>
                      <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>• {quiz.timeLimit || 30} min</span>
                    </div>
                  </div>
                </div>

                {/* Right Header: Quiz ID with Copy Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
                    padding: '6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Quiz ID</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                        #QUIZ-2024-0046
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('#QUIZ-2024-0046')
                          toast.success('Quiz ID copied')
                        }}
                        title="Copy Quiz ID"
                        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: '#64748B' }}
                      >
                        <Code size={13} />
                      </button>
                    </div>
                  </div>

                  <button
                    style={{
                      width: 32, height: 32, borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', cursor: 'pointer'
                    }}
                  >
                    <MoreVertical size={15} />
                  </button>
                </div>
              </div>

              {/* ── Quiz Navigation Tabs ── */}
              <div style={{
                display: 'flex', gap: 6, borderBottom: '1px solid #E2E8F0', overflowX: 'auto', flexShrink: 0
              }}>
                {[
                  { key: 'details',      label: 'General',      icon: FileText },
                  { key: 'questions',    label: 'Questions',    icon: HelpCircle },
                  { key: 'participants', label: 'Participants', icon: Users },
                  { key: 'results',      label: 'Results',      icon: BarChart3 },
                  { key: 'leaderboard',  label: 'Leaderboard',  icon: Trophy },
                  { key: 'analytics',    label: 'Analytics',    icon: Star },
                  { key: 'settings',     label: 'Settings',     icon: Settings },
                ].map(tab => {
                  const Icon = tab.icon
                  const active = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '10px 16px', border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: active ? 600 : 500,
                        color: active ? '#16A34A' : '#64748B',
                        background: 'transparent',
                        borderBottom: active ? '2px solid #16A34A' : '2px solid transparent',
                        marginBottom: -1, whiteSpace: 'nowrap', transition: 'all 150ms ease',
                        fontFamily: 'inherit'
                      }}
                    >
                      <Icon size={14} color={active ? '#16A34A' : '#64748B'} strokeWidth={active ? 2.2 : 1.8} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* ── Action Buttons Row ── */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => openEdit(quiz)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 15px', borderRadius: 8, background: '#FFFFFF',
                    border: '1px solid #E2E8F0', fontSize: 12.5, fontWeight: 600,
                    color: '#334155', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                >
                  <Pencil size={13} /> Edit
                </button>

                <button
                  onClick={() => toast.info('Quiz closed')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 15px', borderRadius: 8, background: '#EA580C',
                    border: 'none', fontSize: 12.5, fontWeight: 600,
                    color: '#FFFFFF', cursor: 'pointer', boxShadow: '0 1px 2px rgba(234, 88, 12, 0.2)'
                  }}
                >
                  <X size={13} /> Close Quiz
                </button>

                <button
                  onClick={() => remove(quiz)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 15px', borderRadius: 8, background: '#DC2626',
                    border: 'none', fontSize: 12.5, fontWeight: 600,
                    color: '#FFFFFF', cursor: 'pointer', boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)'
                  }}
                >
                  <Trash2 size={13} /> Delete Quiz
                </button>
              </div>

              {/* ── TAB CONTENT PANELS ── */}
              <div>
                {/* 1. GENERAL TAB */}
                {activeTab === 'details' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* 8-Card Statistics Grid (4x2) */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14
                    }}>
                      {/* 1. Questions */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <HelpCircle size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Questions</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{questions.length || 10}</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Total Questions</div>
                        </div>
                      </div>

                      {/* 2. Duration */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Clock size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Duration</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{quiz.timeLimit || 30} minutes</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Total Time</div>
                        </div>
                      </div>

                      {/* 3. Passing Marks */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Passing Marks</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{quiz.passingMarks ? `${quiz.passingMarks}%` : '50%'}</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Minimum Pass</div>
                        </div>
                      </div>

                      {/* 4. Attempts Allowed */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <RefreshCw size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Attempts Allowed</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{quiz.maxAttempts || 1}</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Per Participant</div>
                        </div>
                      </div>

                      {/* 5. Total Marks */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Star size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Total Marks</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{questions.length ? `${questions.length}.00` : '10.00'}</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Maximum Marks</div>
                        </div>
                      </div>

                      {/* 6. Created */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Calendar size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Created</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>15 Aug 2025, 10:30 AM</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>By {trainerName}</div>
                        </div>
                      </div>

                      {/* 7. Negative Marking */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Shield size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Negative Marking</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{quiz.negativeMarking ? 'Yes' : 'No'}</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Penalty</div>
                        </div>
                      </div>

                      {/* 8. Participants */}
                      <div style={{
                        background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
                          color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Users size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Participants</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>{participants.length || '—'}</div>
                          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>Enrolled</div>
                        </div>
                      </div>
                    </div>

                    {/* 2-Column: Description & Instructions Card */}
                    <div style={{
                      background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16,
                      padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}>
                      {/* Left: Description */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <FileText size={17} color="#16A34A" />
                          <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#0F172A' }}>
                            Description
                          </h4>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                          {quiz.description || 'Comprehensive quiz to test knowledge of core programming concepts and principles.'}
                        </p>
                      </div>

                      {/* Right: Instructions */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <Info size={17} color="#16A34A" />
                          <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#0F172A' }}>
                            Instructions
                          </h4>
                        </div>
                        <ul style={{
                          margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#475569',
                          lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4
                        }}>
                          <li>Read each question carefully before choosing your answer.</li>
                          <li>Each question carries equal marks unless stated otherwise.</li>
                          <li>Select the correct answer from the choices provided.</li>
                          <li>You cannot change your answer once submitted.</li>
                          <li>Ensure you have a stable internet connection throughout the quiz.</li>
                        </ul>
                      </div>
                    </div>

                    {/* Bottom Status Bar */}
                    <div style={{
                      background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 14,
                      padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Calendar size={17} color="#16A34A" />
                        <div>
                          <div style={{ fontSize: 10.5, color: '#64748B' }}>Published on</div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>15 Aug 2025, 11:00 AM</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <RefreshCw size={17} color="#16A34A" />
                        <div>
                          <div style={{ fontSize: 10.5, color: '#64748B' }}>Last updated</div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>15 Aug 2025, 11:00 AM</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle2 size={17} color="#16A34A" />
                        <div>
                          <div style={{ fontSize: 10.5, color: '#64748B' }}>Status</div>
                          <span style={{
                            padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: '#EAF8F0', color: '#16A34A', display: 'inline-block', marginTop: 1
                          }}>
                            ✓ Active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. QUESTIONS TAB */}
                {activeTab === 'questions' && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                        {questions.length} Questions
                      </h3>
                      <button
                        onClick={() => toast.info('Use Quiz Builder to edit full question set')}
                        style={{ ...btnPrimary, padding: '7px 16px', fontSize: 13 }}
                      >
                        <Plus size={13} style={{ marginRight: 4 }} /> Add Question
                      </button>
                    </div>

                    <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', width: 40 }}>#</th>
                            <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>QUESTION</th>
                            <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', width: 100 }}>TYPE</th>
                            <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', width: 100 }}>DIFFICULTY</th>
                            <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center', width: 70 }}>MARKS</th>
                            <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center', width: 100 }}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questions.map((q, i) => (
                            <tr key={q.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                              <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#94A3B8', fontSize: 13 }}>{i + 1}</td>
                              <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A', fontSize: 13.5 }}>
                                {q.questionText || q.question}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, color: '#64748B' }}>{q.questionType || 'MCQ'}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                  background: q.difficulty === 'EASY' ? '#EAF8F0' : q.difficulty === 'HARD' ? '#FEF2F2' : '#FEF3C7',
                                  color: q.difficulty === 'EASY' ? '#16A34A' : q.difficulty === 'HARD' ? '#DC2626' : '#D97706',
                                }}>
                                  {q.difficulty || 'MEDIUM'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{q.marks || 1}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                  <button className="cqt-action-btn"><Eye size={12} /></button>
                                  <button className="cqt-action-btn cqt-action-btn--edit"><Pencil size={12} /></button>
                                  <button className="cqt-action-btn cqt-action-btn--delete"><Trash2 size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. PARTICIPANTS TAB */}
                {activeTab === 'participants' && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      {participants.length} Participants
                    </h3>
                    {participants.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No participants found for this quiz.</div>
                    ) : (
                      <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>EMAIL</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>ATTEMPT STATUS</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'right' }}>SUBMITTED</th>
                            </tr>
                          </thead>
                          <tbody>
                            {participants.map(p => (
                              <tr key={p.id || p.participantId} style={{ borderBottom: '1px solid #F8FAFC' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>{p.name || 'Participant'}</td>
                                <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{p.email || '—'}</td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#EAF8F0', color: '#16A34A' }}>
                                    {p.attemptStatus || 'Completed'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>{p.score != null ? `${p.score}%` : '—'}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B', fontSize: 12 }}>{p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. RESULTS TAB */}
                {activeTab === 'results' && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                        {results.length} Results
                      </h3>
                      {results.length > 0 && (
                        <button
                          onClick={async () => {
                            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                            const token = storedUser?.token || localStorage.getItem('token') || sessionStorage.getItem('token');
                            const downloadUrl = `${API_BASE}/monitoring/reports/assessment/${quiz.id}/excel?contextType=QUIZ&token=${encodeURIComponent(token || '')}`;
                            try {
                              const res = await fetch(downloadUrl, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {}
                              });
                              if (!res.ok) throw new Error('Download failed');
                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `assessment_marks_${quiz.id}.xlsx`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              window.URL.revokeObjectURL(url);
                            } catch (e) {
                              window.open(downloadUrl, '_blank');
                            }
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: '1px solid #10b981',
                            background: '#ecfdf5',
                            color: '#047857',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Download size={14} /> Download Excel Marks
                        </button>
                      )}
                    </div>
                    {results.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No submissions yet.</div>
                    ) : (
                      <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>PERCENTAGE</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>STATUS</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>PROCTORING</th>
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
                  </div>
                )}

                {/* 5. ANALYTICS TAB */}
                {activeTab === 'analytics' && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      Quiz Analytics
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TOTAL PARTICIPANTS</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{analytics?.enrolled || 0}</div>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>COMPLETED</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{analytics?.completed || 0}</div>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>AVERAGE SCORE</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{analytics?.averageScore != null ? `${Math.round(analytics.averageScore)}%` : '—'}</div>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>PASS RATE</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{analytics?.passRate != null ? `${Math.round(analytics.passRate)}%` : '—'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. LEADERBOARD TAB */}
                {activeTab === 'leaderboard' && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Trophy size={18} color="#D97706" /> Leaderboard
                    </h3>
                    {leaderboard.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>No rankings available yet.</div>
                    ) : (
                      <div style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', width: 60, textAlign: 'center' }}>RANK</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B' }}>PARTICIPANT</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>SCORE</th>
                              <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748B', textAlign: 'center' }}>PERCENTAGE</th>
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
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>{l.percentage != null ? `${Math.round(l.percentage)}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. SETTINGS TAB */}
                {activeTab === 'settings' && (
                  <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 16, padding: 22, maxWidth: 600 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      Quiz Settings
                    </h3>
                    <div style={{ display: 'grid', gap: 14 }}>
                      <div>
                        <label style={lblStyle}>Time Limit (minutes)</label>
                        <input style={inputStyle} type="number" defaultValue={quiz.timeLimit || 120} />
                      </div>
                      <div>
                        <label style={lblStyle}>Attempts Allowed</label>
                        <input style={inputStyle} type="number" defaultValue={quiz.maxAttempts || 1} />
                      </div>
                      <div>
                        <label style={lblStyle}>Passing Marks (%)</label>
                        <input style={inputStyle} type="number" defaultValue={50} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Single Attempt Proctoring Modal if opened */}
      {selectedProctorAttempt && (
        <SingleAttemptProctoringModal
          attemptId={selectedProctorAttempt}
          auth={auth}
          onClose={() => setSelectedProctorAttempt(null)}
        />
      )}
    </motion.div>,
    document.body
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
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
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

function QuizBuilder({ user, courseId, lessons, existingQuiz, onClose, onSaved }) {
  const { success, error: showError } = useToast()
  const [title, setTitle] = useState(existingQuiz?.title || '')
  const [lessonId, setLessonId] = useState(existingQuiz?.lessonId || '')
  const [isMandatory, setIsMandatory] = useState(existingQuiz?.isMandatory ?? true)
  const [timeLimit, setTimeLimit] = useState(existingQuiz?.timeLimit || 30)
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
        timeLimit: parseInt(timeLimit, 10) || 30,
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
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 4 }}>
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
              <label style={lblStyle}>Time Limit (minutes)</label>
              <input
                type="number"
                min="1"
                max="360"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                placeholder="e.g. 30"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={lblStyle}>Settings</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 8, fontSize: 13, color: colors.slate[600] }}>
                <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
                Mandatory to complete
              </label>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.slate[900] }}>
                Questions ({questions.length})
              </span>
              <span style={{ fontSize: 11, color: colors.slate[500] }}>Pick the radio on the correct option</span>
            </div>

            {questions.map((q, i) => (
              <div key={i} style={{
                background: colors.surface.secondary, border: `1px solid ${colors.slate[200]}`, borderRadius: 10, padding: 14, marginBottom: 10,
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
                        name={`q_${i}_opt`}
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

// ════════════════════════════════════════════════════════════════════════════
// AI QUIZ GENERATOR MODAL
// ════════════════════════════════════════════════════════════════════════════
function AIQuizGeneratorModal({ user, courseId, onClose, onGenerated }) {
  const { success, error: showError } = useToast()
  const [activeTab, setActiveTab] = useState('prompt') // 'prompt' | 'document'

  // Prompt Fields
  const [promptText, setPromptText] = useState('')
  const [questionCount, setQuestionCount] = useState(10)
  const [difficulty, setDifficulty] = useState('Medium')
  const [timeLimit, setTimeLimit] = useState(30)
  const [generating, setGenerating] = useState(false)

  // Document Fields
  const [file, setFile] = useState(null)
  const [fileGenerating, setFileGenerating] = useState(false)
  const fileInputRef = useRef(null)

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
          courseId,
          trainingId: courseId,
          prompt: promptText.trim(),
          questionCount: parseInt(questionCount, 10),
          difficulty,
          timeLimit: parseInt(timeLimit, 10) || 30
        })
      })
      const text = await response.text()
      let data = {}
      try { data = JSON.parse(text) } catch { data = { error: 'AI server response was not valid JSON' } }
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.details || data.message || 'Failed to generate quiz')
      }

      success('AI Quiz Generated Successfully!')
      onGenerated?.()
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
    formData.append('timeLimit', timeLimit)

    try {
      const response = await fetch(API.AI_QUIZ.GENERATE_FROM_DOCUMENT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`
        },
        body: formData
      })
      const text = await response.text()
      let data = {}
      try { data = JSON.parse(text) } catch { data = { error: 'AI server response was not valid JSON' } }
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.details || data.message || 'Failed to generate quiz from document')
      }

      success('AI Quiz Generated Successfully from Document!')
      onGenerated?.()
      onClose()
    } catch (err) {
      showError(err.message)
    } finally {
      setFileGenerating(false)
    }
  }

  const isWorking = generating || fileGenerating

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.50)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 999999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, boxSizing: 'border-box'
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          width: '100%',
          maxWidth: 560,
          boxShadow: '0 25px 70px -10px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#FFFFFF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: '#EAF8F0',
              color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                AI Quiz Generator
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                Generate Quiz with AI
              </h3>
            </div>
          </div>
          <button
            onClick={() => !isWorking && onClose()}
            disabled={isWorking}
            style={{
              width: 30, height: 30, borderRadius: 8, background: '#F8FAFC',
              border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#64748B', cursor: isWorking ? 'not-allowed' : 'pointer'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Mode Tabs */}
        {!isWorking && (
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
            <button
              onClick={() => setActiveTab('prompt')}
              style={{
                flex: 1, padding: '12px 16px', border: 'none', cursor: 'pointer',
                background: activeTab === 'prompt' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'prompt' ? '#16A34A' : '#64748B',
                fontWeight: 600, fontSize: 13,
                borderBottom: activeTab === 'prompt' ? '2px solid #16A34A' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 150ms ease'
              }}
            >
              <Sparkles size={14} /> Topic / Prompt
            </button>
            <button
              onClick={() => setActiveTab('document')}
              style={{
                flex: 1, padding: '12px 16px', border: 'none', cursor: 'pointer',
                background: activeTab === 'document' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'document' ? '#16A34A' : '#64748B',
                fontWeight: 600, fontSize: 13,
                borderBottom: activeTab === 'document' ? '2px solid #16A34A' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 150ms ease'
              }}
            >
              <Upload size={14} /> Document / File Upload
            </button>
          </div>
        )}

        {/* Modal Body */}
        {isWorking ? (
          <div style={{
            padding: '50px 24px', textAlign: 'center', display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: 14
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: '#EAF8F0',
              color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(22, 163, 74, 0.2)'
            }}>
              <Loader2 size={26} className="animate-spin" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>
                AI is generating your quiz questions...
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4, maxWidth: 380, lineHeight: 1.5 }}>
                Creating question stems, distractors, correct answers, and explanations. This usually takes 10–25 seconds.
              </div>
            </div>
          </div>
        ) : activeTab === 'prompt' ? (
          <form onSubmit={handleGenerateFromPrompt} style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Topic / Subject Prompt <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. Python list comprehensions, lambda functions, generators, and exception handling..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1',
                  fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
                required
              />
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                Describe what specific topics, skills, or lesson areas you want the quiz to test.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Questions (1 to N)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 10"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5, boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5 }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Time Limit (mins)
                </label>
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 30"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5, boxSizing: 'border-box' }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px', borderRadius: 8, background: '#FFFFFF', border: '1px solid #E2E8F0',
                  fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 8, background: '#16A34A', border: 'none',
                  fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                }}
              >
                <Sparkles size={14} /> Generate Quiz
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleGenerateFromDocument} style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Upload Syllabus or Course Material <span style={{ color: '#DC2626' }}>*</span>
              </label>

              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files[0] || null)}
                accept=".pdf,.docx,.txt,.md"
                style={{ display: 'none' }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #CBD5E1', borderRadius: 10, padding: 24, textAlign: 'center',
                  background: '#F8FAFC', cursor: 'pointer', transition: 'all 150ms ease'
                }}
              >
                <Upload size={24} color="#16A34A" style={{ margin: '0 auto 8px' }} />
                {file ? (
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{file.name}</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {(file.size / 1024).toFixed(1)} KB — Click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      Click to upload document (PDF, Word, Text)
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      AI will analyze the file and generate matching questions
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Questions (1 to N)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 10"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5, boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5 }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Time Limit (mins)
                </label>
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 30"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 12.5, boxSizing: 'border-box' }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px', borderRadius: 8, background: '#FFFFFF', border: '1px solid #E2E8F0',
                  fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 8,
                  background: file ? '#16A34A' : '#94A3B8', border: 'none',
                  fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                  cursor: file ? 'pointer' : 'not-allowed',
                  boxShadow: file ? '0 2px 6px rgba(22, 163, 74, 0.25)' : 'none'
                }}
              >
                <Sparkles size={14} /> Generate from File
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>,
    document.body
  )
}
