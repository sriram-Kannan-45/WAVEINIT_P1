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
            ...iconBtn(colors.slate[100], colors.slate[600]),
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
          background: colors.surface.primary, borderRadius: 20, width: '100%', maxWidth: 520,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
          border: `1px solid ${colors.border.default}`,
        }}
      >
        <div style={{
          padding: 20, borderBottom: `1px solid ${colors.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: colors.slate[900], fontFamily: typography.fontFamily }}>
              Invite Participant
            </div>
            <div style={{ fontSize: 12, color: colors.slate[500], marginTop: 4 }}>
              Select a registered participant to enroll them directly.
            </div>
          </div>
          <button onClick={onClose} style={{
            ...iconBtn(colors.slate[100], colors.slate[600]),
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
          <div className="wl-participants-search">
            <Search size={16} className="wl-participants-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
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
            <div className="wl-participants-list">
              {filtered.map(p => (
                <div key={p.id} className="wl-participant-card" style={{ height: 'auto', padding: '12px 16px' }}>
                  <div className="wl-participant-avatar" style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[400]})`,
                    color: colors.surface.primary,
                    display: 'grid', placeItems: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="wl-participant-name" style={{ fontSize: 14 }}>{p.name}</div>
                    <div className="wl-participant-email">{p.email}</div>
                  </div>
                  <button
                    disabled={invitingId === p.id}
                    onClick={() => handleInvite(p.id)}
                    style={{
                      ...iconBtn(invitingId === p.id ? colors.slate[200] : colors.primary[600], invitingId === p.id ? colors.slate[400] : colors.surface.primary, 36),
                      borderRadius: 10, fontSize: 12, fontWeight: 600,
                      cursor: invitingId === p.id ? 'not-allowed' : 'pointer',
                      opacity: invitingId === p.id ? 0.6 : 1,
                    }}
                  >
                    {invitingId === p.id ? '...' : <UserPlus size={14} />}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: typography.fontFamily }}>
      {/* ── KPI Stats ── */}
      <div className="wl-participants-kpi">
        {[
          { label: 'Total Enrolled', value: stats.total, icon: Users, bg: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[400]})` },
          { label: 'Avg Completion', value: `${stats.avgCompletion.toFixed(1)}%`, icon: TrendingUp, bg: `linear-gradient(135deg, ${colors.success[500]}, ${colors.success[400]})` },
          { label: 'Avg Quiz Score', value: stats.avgScore != null ? `${stats.avgScore.toFixed(1)}%` : '—', icon: Award, bg: `linear-gradient(135deg, ${colors.warning[500]}, ${colors.warning[400]})` },
        ].map((s) => (
          <div key={s.label} className="wl-participants-kpi-card">
            <div className="wl-participants-kpi-icon" style={{ background: s.bg, color: '#ffffff' }}>
              <s.icon size={24} />
            </div>
            <div className="wl-participants-kpi-data">
              <div className="wl-participants-kpi-number">{s.value}</div>
              <div className="wl-participants-kpi-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar: Search + Filter + Invite ── */}
      <div className="wl-participants-toolbar">
        <div className="wl-participants-search">
          <Search size={16} className="wl-participants-search-icon" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
        </div>
        <div className="wl-participants-filter-group">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="wl-participants-filter-select"
          >
            <option value="progress">Progress (high → low)</option>
            <option value="score">Quiz Score (high → low)</option>
            <option value="name">Name (A → Z)</option>
          </select>
        </div>
        <button className="wl-participants-btn-primary" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={16} />
          Invite
        </button>
      </div>

      {/* ── Participant List ── */}
      {loading ? (
        <div className="wl-participants-list">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="wl-participant-card" style={{ background: colors.surface.secondary }}>
              <div style={{ ...skeletonStyle, width: 48, height: 48, borderRadius: 14 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...skeletonStyle, width: '40%', height: 16 }} />
                <div style={{ ...skeletonStyle, width: '60%', height: 12 }} />
              </div>
              <div style={{ ...skeletonStyle, width: 140, height: 10, borderRadius: 999 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="wl-participants-empty" style={{
          padding: 48, textAlign: 'center', color: colors.slate[400], fontSize: 14,
          background: colors.surface.primary, border: `1px solid ${colors.border.default}`, borderRadius: 20,
        }}>
          {participants.length === 0 ? 'No participants enrolled yet.' : 'No participants match your search.'}
        </div>
      ) : (
        <div className="wl-participants-list">
          {filtered.map((p, i) => {
            const pct = p.progressPercent || 0
            const badgeText = pct >= 80 ? 'Top Learner' : pct >= 40 ? 'On Track' : 'Just Started'
            const badgeBg = pct >= 80 ? colors.success[100] : pct >= 40 ? colors.warning[100] : colors.slate[100]
            const badgeFg = pct >= 80 ? colors.success[700] : pct >= 40 ? colors.warning[800] : colors.slate[500]
            return (
              <div
                key={p.participantId}
                className="wl-participant-card"
                style={{ cursor: 'pointer' }}
                onClick={() => setOpenDetailId(p.participantId)}
              >
                {/* Avatar */}
                <div className="wl-participant-avatar" style={{
                  background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[400]})`,
                }}>
                  {initials(p.name)}
                </div>

                {/* Name / Email / Date */}
                <div className="wl-participant-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="wl-participant-name">{p.name}</div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                      borderRadius: 9999, fontSize: 10, fontWeight: 700,
                      background: badgeBg, color: badgeFg, whiteSpace: 'nowrap',
                    }}>
                      {badgeText}
                    </span>
                  </div>
                  <div className="wl-participant-email">{p.email}</div>
                  <div className="wl-participant-date" style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={10} /> Enrolled {fmtDate(p.enrolledAt)}
                  </div>
                </div>

                {/* Progress */}
                <div className="wl-participant-progress">
                  <div className="wl-participant-progress-label">
                    <span className="wl-participant-progress-text">Course Progress</span>
                    <span className="wl-participant-progress-value">{Math.round(pct)}%</span>
                  </div>
                  <div className="wl-participant-progress-bar">
                    <motion.div
                      className="wl-participant-progress-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.05 }}
                      style={{
                        background: pct >= 80
                          ? `linear-gradient(90deg, ${colors.success[600]}, ${colors.success[500]})`
                          : pct >= 40
                          ? `linear-gradient(90deg, ${colors.warning[500]}, ${colors.warning[400]})`
                          : `linear-gradient(90deg, ${colors.primary[500]}, ${colors.primary[400]})`,
                      }}
                    />
                  </div>
                </div>

                {/* Quiz Score */}
                <div className="wl-participant-quiz">
                  <strong>{p.avgQuizScore != null ? `${Number(p.avgQuizScore).toFixed(0)}%` : '—'}</strong>
                  quiz
                </div>

                {/* Actions */}
                <div className="wl-participant-actions">
                  <div className="wl-participant-action-btn" title="Lessons" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 'auto', height: 'auto', padding: '6px 10px', gap: 2, border: 'none', background: 'transparent' }}>
                    <BookOpen size={14} style={{ color: colors.primary[500] }} />
                    <span style={{ fontSize: 11, color: colors.slate[500] }}>{p.lessonsDone}/{p.totalLessons}</span>
                  </div>
                </div>
              </div>
            )
          })}
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
