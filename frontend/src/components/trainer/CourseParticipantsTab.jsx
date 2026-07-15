import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, User, Calendar, BookOpen, Sparkles, ClipboardList, Eye, Users, TrendingUp, Award, UserPlus, Check } from 'lucide-react'
import { API } from '../../api/api'
import { Button } from '../ui'
import { useToast } from '../Toast'
import { colors, iconBtn, skeletonStyle, typography, cardStyle } from '../../theme/tokens'

function ProgressBar({ percent, color = colors.primary[600] }) {
  const v = Math.max(0, Math.min(100, Number(percent || 0)))
  return (
    <div style={{
      height: 6, width: '100%', minWidth: 80, background: colors.slate[100],
      borderRadius: 999, overflow: 'hidden',
    }}>
      <div style={{ width: `${v}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ParticipantDetailModal({ user, courseId, participantId, onClose }) {
  const { error: showError } = useToast()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('progress')

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch(API.TRAINER_COURSES.PARTICIPANT(courseId, participantId), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const d = await r.json()
        if (aborted) return
        if (d.success) setData(d)
        else showError(d.error || 'Failed to load participant detail')
      } catch (e) { showError(e.message) }
    })()
    return () => { aborted = true }
  }, [participantId])

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
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 720,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: 18, borderBottom: `1px solid ${colors.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 999,
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[400]})`, color: colors.surface.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
            }}>
              {initials(data?.participant?.name)}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.slate[900] }}>
                {data?.participant?.name || 'Loading…'}
              </div>
              {data?.participant?.email && (
                <div style={{ fontSize: 12, color: colors.slate[500] }}>{data.participant.email}</div>
              )}
              {data?.enrollment && (
                <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 2 }}>
                  Enrolled {fmtDate(data.enrollment.enrolledAt)} · Progress {Math.round(data.enrollment.progressPercent)}%
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: colors.slate[100], color: colors.slate[600],
            padding: 8, borderRadius: 8, cursor: 'pointer',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 12, borderBottom: `1px solid ${colors.border.default}`, display: 'flex', gap: 4 }}>
          {[
            { key: 'progress',    label: 'Progress',     icon: <BookOpen size={14} /> },
            { key: 'quizzes',     label: 'Quiz Results', icon: <Sparkles size={14} /> },
            { key: 'assessments', label: 'Assessments',  icon: <ClipboardList size={14} /> },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', border: 'none', cursor: 'pointer',
                borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: tab === t.key ? colors.primary[600] : 'transparent',
                color: tab === t.key ? colors.surface.primary : colors.slate[600],
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {!data ? (
            <div style={{ height: 200, background: colors.slate[100], borderRadius: 10 }} />
          ) : tab === 'progress' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.lessons || []).map((l) => (
                <div key={l.lessonId} style={{
                  display: 'flex', gap: 12, alignItems: 'center', padding: 12,
                  border: `1px solid ${colors.border.default}`, borderRadius: 8, background: colors.surface.primary,
                }}>
                  <div style={{ flex: 1, fontSize: 13, color: colors.slate[900], fontWeight: 600 }}>
                    {l.title}
                  </div>
                  <div style={{ fontSize: 11, color: colors.slate[500], display: 'flex', gap: 8, flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {l.contentViewed ? <><Check size={12} /> Viewed</> : <><X size={12} /> Not viewed</>}
                    </span>
                    <span>·</span>
                    <span style={{ color: l.status === 'COMPLETED' ? colors.success[700] : l.status === 'IN_PROGRESS' ? colors.warning[800] : colors.slate[400], fontWeight: 600 }}>
                      {l.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
              {(!data.lessons || data.lessons.length === 0) && (
                <div style={{
                  padding: 30, textAlign: 'center', color: colors.slate[400], fontSize: 13,
                  background: colors.surface.primary, border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
                }}>No lessons in this course yet.</div>
              )}
            </div>
          ) : tab === 'quizzes' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.quizzes || []).map(q => (
                <div key={q.quizId} style={{
                  display: 'flex', gap: 12, alignItems: 'center', padding: 12,
                  border: `1px solid ${colors.border.default}`, borderRadius: 8, background: colors.surface.primary,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900] }}>{q.title}</div>
                    <div style={{ fontSize: 11, color: colors.slate[500], marginTop: 2 }}>
                      {q.submitted ? 'Submitted' : 'Not submitted yet'}
                      {q.resultPublished && q.score != null && ' · Result published'}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: q.score != null && q.resultPublished ? colors.success[700] : colors.slate[400] }}>
                    {q.score != null && q.resultPublished ? `${q.score.toFixed(0)}%` : '—'}
                  </div>
                </div>
              ))}
              {(!data.quizzes || data.quizzes.length === 0) && (
                <div style={{
                  padding: 30, textAlign: 'center', color: colors.slate[400], fontSize: 13,
                  background: colors.surface.primary, border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
                }}>No quizzes for this course.</div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.assessments || []).map(a => (
                <div key={a.submissionId} style={{
                  display: 'block', gap: 12, alignItems: 'center', padding: 12,
                  border: `1px solid ${colors.border.default}`, borderRadius: 8, background: colors.surface.primary,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900] }}>
                      {a.title || `Assessment #${a.assessmentId}`}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: a.status === 'PUBLISHED' ? colors.success[100] : a.status === 'REVIEWED' ? colors.warning[100] : colors.info[100],
                      color:      a.status === 'PUBLISHED' ? colors.success[700] : a.status === 'REVIEWED' ? colors.warning[800] : colors.info[700],
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {a.status}
                    </span>
                  </div>
                  {a.score != null && (
                    <div style={{ fontSize: 12, color: colors.slate[600], marginTop: 6 }}>
                      Score: <strong>{a.score}</strong>
                    </div>
                  )}
                  {a.feedback && (
                    <div style={{
                      fontSize: 12, color: colors.slate[500], marginTop: 6,
                      padding: 8, background: colors.surface.secondary, borderRadius: 6,
                    }}>
                      {a.feedback}
                    </div>
                  )}
                </div>
              ))}
              {(!data.assessments || data.assessments.length === 0) && (
                <div style={{
                  padding: 30, textAlign: 'center', color: colors.slate[400], fontSize: 13,
                  background: colors.surface.primary, border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
                }}>No assessments submitted.</div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function InviteModal({ user, courseId, onClose, onInviteSuccess }) {
  const { error: showError, success } = useToast()
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [invitingId, setInvitingId] = useState(null)

  useEffect(() => {
    let aborted = false
    const fetchAvailable = async () => {
      try {
        const r = await fetch(API.TRAINER_COURSES.AVAILABLE_PARTICIPANTS(courseId), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const d = await r.json()
        if (aborted) return
        if (d.success) {
          setParticipants(d.participants || [])
        } else {
          showError(d.error || 'Failed to load available participants')
        }
      } catch (e) {
        if (!aborted) showError(e.message)
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    fetchAvailable()
    return () => { aborted = true }
  }, [courseId])

  const handleInvite = async (participantId) => {
    try {
      setInvitingId(participantId)
      const r = await fetch(API.TRAINER_COURSES.PARTICIPANTS(courseId), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ participantId }),
      })
      const d = await r.json()
      if (d.success) {
        success('Participant invited successfully!')
        setParticipants(prev => prev.filter(p => p.id !== participantId))
        onInviteSuccess()
      } else {
        showError(d.error || 'Failed to invite participant')
      }
    } catch (e) {
      showError(e.message)
    } finally {
      setInvitingId(null)
    }
  }

  const filtered = useMemo(() => {
    if (!search) return participants
    const q = search.toLowerCase()
    return participants.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    )
  }, [participants, search])

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
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 520,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: 18, borderBottom: `1px solid ${colors.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: colors.slate[900] }}>
              Invite Participant
            </div>
            <div style={{ fontSize: 12, color: colors.slate[500], marginTop: 2 }}>
              Select a registered participant to enroll them directly.
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: colors.slate[100], color: colors.slate[600],
            padding: 8, borderRadius: 8, cursor: 'pointer',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 12, borderBottom: `1px solid ${colors.border.default}` }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: colors.surface.secondary, border: `1px solid ${colors.border.default}`, borderRadius: 10,
            padding: '8px 12px',
          }}>
            <Search size={14} color={colors.slate[400]} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <span style={{ fontSize: 13, color: colors.slate[500] }}>Loading available participants...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              padding: 30, textAlign: 'center', color: colors.slate[400], fontSize: 13,
              border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
            }}>
              {participants.length === 0
                ? 'All registered participants are already enrolled.'
                : 'No participants match your search.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'center', padding: 10,
                    border: `1px solid ${colors.border.default}`, borderRadius: 8, background: colors.surface.primary,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[400]})`, color: colors.surface.primary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: colors.slate[500], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.email}
                    </div>
                  </div>
                  <button
                    disabled={invitingId === p.id}
                    onClick={() => handleInvite(p.id)}
                    style={{
                      padding: '6px 12px', background: colors.primary[600], color: colors.surface.primary,
                      border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'opacity 0.2s',
                      opacity: invitingId === p.id ? 0.6 : 1,
                    }}
                  >
                    {invitingId === p.id ? 'Adding...' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function CourseParticipantsTab({ user, courseId }) {
  const { error: showError, success } = useToast()
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('progress')
  const [openDetailId, setOpenDetailId] = useState(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const fetchParticipants = async () => {
    try {
      setLoading(true)
      const r = await fetch(API.TRAINER_COURSES.PARTICIPANTS(courseId), {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      const d = await r.json()
      if (d.success) setParticipants(d.participants || [])
      else showError(d.error || 'Failed to load participants')
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchParticipants()
  }, [courseId])

  const filtered = useMemo(() => {
    let out = participants
    if (search) {
      const q = search.toLowerCase()
      out = out.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    }
    out = [...out].sort((a, b) => {
      if (sortBy === 'name')     return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'progress') return (b.progressPercent || 0) - (a.progressPercent || 0)
      if (sortBy === 'score')    return (b.avgQuizScore || 0) - (a.avgQuizScore || 0)
      return 0
    })
    return out
  }, [participants, search, sortBy])

  const stats = useMemo(() => {
    const n = participants.length
    if (n === 0) return { total: 0, avgCompletion: 0, avgScore: null }
    const avgCompletion = participants.reduce((s, p) => s + Number(p.progressPercent || 0), 0) / n
    const scoresOnly = participants.map(p => Number(p.avgQuizScore || 0)).filter(x => x > 0)
    const avgScore = scoresOnly.length ? scoresOnly.reduce((s, x) => s + x, 0) / scoresOnly.length : null
    return { total: n, avgCompletion, avgScore }
  }, [participants])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Enrolled', value: stats.total, icon: Users, color: 'text-primary-600 bg-primary-50 dark:bg-primary-950/30' },
          { label: 'Avg Completion', value: `${stats.avgCompletion.toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Avg Quiz Score', value: stats.avgScore != null ? `${stats.avgScore.toFixed(1)}%` : '—', icon: Award, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.value}</div>
                <div className="text-xs font-medium text-slate-500">{s.label}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
        >
          <option value="progress">Progress (high → low)</option>
          <option value="score">Quiz Score (high → low)</option>
          <option value="name">Name (A → Z)</option>
        </select>
        <Button onClick={() => setShowInviteModal(true)} icon={UserPlus} size="sm">
          Invite
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-sm text-slate-400">
          {participants.length === 0 ? 'No participants enrolled yet.' : 'No participants match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p, i) => (
            <motion.div
              key={p.participantId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md shadow-primary-200 dark:shadow-primary-900/20">
                  {initials(p.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{p.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                      (p.progressPercent || 0) >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : (p.progressPercent || 0) >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {(p.progressPercent || 0) >= 80 ? 'Top Learner' : (p.progressPercent || 0) >= 40 ? 'On Track' : 'Just Started'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{p.email}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <Calendar size={10} /> Enrolled {fmtDate(p.enrolledAt)}
                  </p>
                </div>
                <button
                  onClick={() => setOpenDetailId(p.participantId)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-2 rounded-lg bg-primary-50 dark:bg-primary-950/30 text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/40"
                  title="View details"
                >
                  <Eye size={14} />
                </button>
              </div>

              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs">
                  <BookOpen size={12} className="text-primary-500" />
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{p.lessonsDone}/{p.totalLessons}</span>
                  <span className="text-slate-400">lessons</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Sparkles size={12} className="text-amber-500" />
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{p.avgQuizScore != null ? `${Number(p.avgQuizScore).toFixed(0)}%` : '—'}</span>
                  <span className="text-slate-400">quiz</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Course Progress</span>
                  <span className="text-[11px] font-bold text-primary-600">{Math.round(p.progressPercent)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, p.progressPercent || 0))}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.05 }}
                    className="h-full rounded-full"
                    style={{
                      background: (p.progressPercent || 0) >= 80
                        ? `linear-gradient(90deg, ${colors.success[600]}, ${colors.success[500]})`
                        : (p.progressPercent || 0) >= 40
                        ? `linear-gradient(90deg, ${colors.warning[500]}, ${colors.warning[400]})`
                        : `linear-gradient(90deg, ${colors.primary[500]}, ${colors.primary[400]})`,
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {openDetailId && (
          <ParticipantDetailModal
            user={user}
            courseId={courseId}
            participantId={openDetailId}
            onClose={() => setOpenDetailId(null)}
          />
        )}
        {showInviteModal && (
          <InviteModal
            user={user}
            courseId={courseId}
            onClose={() => setShowInviteModal(false)}
            onInviteSuccess={fetchParticipants}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
