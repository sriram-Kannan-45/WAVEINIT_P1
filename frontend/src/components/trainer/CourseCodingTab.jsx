import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, Send, Sparkles, Code, X, BookOpen,
  BarChart3, Trophy, Check, AlertTriangle, ChevronDown, ChevronUp, Search, Clock,
  Loader2, RefreshCw,
} from 'lucide-react'
import { CodingAssessmentDetailModal } from '../../pages/TrainerCodingAssessmentDetails'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import { useConfirm } from '../ui/AlertModal'
import {
  colors, btnPrimary, btnSecondary, iconBtn, STATUS_BADGE, RESULT_BADGE,
  lblStyle, lblTiny, inputStyle, th, td, skeletonStyle, typography, DIFF_BADGE,
} from '../../theme/tokens'
import Pagination from '../Pagination'
import '../../styles/course-tabs.css'

// Stable internal IDs match the judge engine runtimes; labels are friendly names.
const WIZARD_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
]
const wizardLangLabel = (id) => (WIZARD_LANGUAGES.find((l) => l.value === id) || {}).label || id

function LanguageMultiSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const toggle = (id) => {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    onChange(next.length > 0 ? next : ['javascript'])
  }

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = WIZARD_LANGUAGES.filter((l) =>
    !query || l.label.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          border: `1px solid ${colors.border.default}`, borderRadius: 10, minHeight: 44,
          padding: '6px 10px', cursor: 'pointer', display: 'flex', flexWrap: 'wrap',
          gap: 6, alignItems: 'center', background: colors.surface.primary,
        }}
      >
        {value.map((id) => (
          <span key={id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
            borderRadius: 999, background: colors.primary[50], color: colors.primary[700],
            fontSize: 12, fontWeight: 600,
          }}>
            {wizardLangLabel(id)}
            <span
              onClick={(e) => { e.stopPropagation(); toggle(id) }}
              style={{ cursor: 'pointer', display: 'inline-flex' }}
            >
              <X size={12} />
            </span>
          </span>
        ))}
        <span style={{ fontSize: 12.5, color: colors.slate[400], marginLeft: value.length ? 4 : 0 }}>
          {value.length ? '' : 'Select languages'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', color: colors.slate[400] }}>
          <ChevronDown size={16} />
        </span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
          background: colors.surface.primary, borderRadius: 10, boxShadow: '0 12px 30px -8px rgba(0,0,0,0.25)',
          border: `1px solid ${colors.border.default}`, overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${colors.border.default}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.slate[50], borderRadius: 8, padding: '6px 9px' }}>
              <Search size={14} style={{ color: colors.slate[400] }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search languages..."
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: colors.slate[900], width: '100%' }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12.5, color: colors.slate[400] }}>No languages found</div>
            )}
            {filtered.map((l) => {
              const selected = value.includes(l.value)
              return (
                <div
                  key={l.value}
                  onClick={() => toggle(l.value)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 14px', cursor: 'pointer', background: selected ? colors.primary[50] : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: selected ? 600 : 400, color: colors.slate[900] }}>{l.label}</span>
                  {selected && <Check size={16} style={{ color: colors.primary[600] }} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
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

function PublishCodingDialog({ user, assessment, onClose, onPublished }) {
  const { success, error: showError } = useToast()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [forceMode, setForceMode] = useState(false)
  const [reason, setReason] = useState('')

  const auth = () => ({ Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' })

  useEffect(() => {
    let aborted = false
    setLoading(true)
    setStats(null)
    setForceMode(false)
    setReason('')
    ;(async () => {
      try {
        const r = await fetch(API.CODING.RESULTS_SUMMARY(assessment.id), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const d = await r.json()
        if (!aborted && d.success) setStats(d)
        else if (!aborted) setStats(null)
      } catch {
        if (!aborted) setStats(null)
      } finally {
        if (!aborted) setLoading(false)
      }
    })()
    return () => { aborted = true }
  }, [assessment.id])

  const publish = async () => {
    try {
      setPublishing(true)
      const r = await fetch(API.CODING.PUBLISH_RESULT(assessment.id), {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ override: forceMode, reason: reason.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) {
        showError(d.error || d.message || 'Publish results failed')
        return
      }
      success(`Coding results published to ${d.enrolled ?? stats?.enrolled ?? 0} participants ✓`)
      onPublished?.()
      onClose()
    } catch (e) {
      showError(e.message)
    } finally {
      setPublishing(false)
    }
  }

  const ready = stats && stats.enrolled > 0 && stats.pending === 0
  const canClick = !publishing && !!stats && stats.enrolled > 0 && (stats.pending === 0 || forceMode)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface.primary, borderRadius: 16, width: '100%', maxWidth: 500, padding: 26,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
          Publish Coding Results
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.slate[500] }}>{assessment.title}</p>

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  height: 64, borderRadius: 10, background: colors.slate[100],
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}

        {!loading && !stats && (
          <div style={{
            padding: 14, background: colors.danger[50], color: colors.danger[600], borderRadius: 8,
            fontSize: 13, marginBottom: 20,
          }}>
            Failed to load assessment summary data.
          </div>
        )}

        {!loading && stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
              <StatCard label="ENROLLED" value={stats.enrolled} color={colors.primary[600]} bg={colors.primary[50]} />
              <StatCard label="COMPLETED" value={stats.completed} color={colors.success[700]} bg={colors.success[100]} />
              <StatCard label="PENDING" value={stats.pending} color={colors.warning[800]} bg={colors.warning[100]} />
              {stats.averageScore != null && (
                <StatCard label="AVG SCORE" value={`${stats.averageScore}%`} color="#0891B2" bg={colors.primary[50]} />
              )}
              {stats.passRate != null && (
                <StatCard label="PASS RATE" value={`${stats.passRate}%`} color={colors.primary[600]} bg={colors.primary[50]} />
              )}
            </div>

            {ready ? (
              <div style={{
                padding: '11px 14px', background: colors.success[100], color: colors.success[700],
                borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
              }}>
                <Check size={16} /> All participants completed. Ready to publish.
              </div>
            ) : stats.enrolled === 0 ? (
              <div style={{
                padding: '11px 14px', background: colors.slate[100], color: colors.slate[600],
                borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
              }}>
                <AlertTriangle size={16} /> No enrolled participants — nothing to notify.
              </div>
            ) : (
              <div style={{
                padding: '11px 14px', background: colors.warning[100], color: colors.warning[800],
                borderRadius: 9, fontSize: 13, marginBottom: 18,
              }}>
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
                    style={{
                      marginTop: 8, width: '100%', fontSize: 12, padding: '6px 8px',
                      border: `1px solid ${colors.warning[400]}`, borderRadius: 6, resize: 'vertical',
                      fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                    }}
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

function CodingPreview({ assessment, onClose }) {
  const problems = assessment?.problems || []
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 680,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: 18, borderBottom: `1px solid ${colors.slate[200]}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={lblTiny}>Coding assessment preview</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
              {assessment.title}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', fontSize: 12, color: colors.slate[500] }}>
              <span>{problems.length} Problem{problems.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{assessment.timeLimit || 120} mins</span>
              {assessment.difficulty && (
                <>
                  <span>·</span>
                  <span style={{ fontWeight: 600, color: colors.primary[700] }}>{assessment.difficulty}</span>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {problems.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: colors.slate[400], fontSize: 14 }}>
              No problems configured in this assessment yet.
            </div>
          ) : (
            problems.map((p, i) => (
              <div
                key={p.id || i}
                style={{
                  background: colors.surface.secondary, border: `1px solid ${colors.slate[200]}`,
                  borderRadius: 10, padding: 14, marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary[600], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Problem {i + 1}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {p.difficulty && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
                        background: p.difficulty === 'EASY' ? colors.success[100] : p.difficulty === 'HARD' ? colors.danger[100] : colors.warning[100],
                        color: p.difficulty === 'EASY' ? colors.success[700] : p.difficulty === 'HARD' ? colors.danger[700] : colors.warning[800],
                      }}>
                        {p.difficulty}
                      </span>
                    )}
                    {p.marks != null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: colors.slate[600] }}>
                        {p.marks} pts
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 14, fontWeight: 600, color: colors.slate[900], marginBottom: 8 }}>
                  {p.title || 'Untitled Problem'}
                </div>

                {p.description && (
                  <div style={{ fontSize: 13, color: colors.slate[700], whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 10 }}>
                    {p.description}
                  </div>
                )}

                {p.testCases && p.testCases.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: `1px dashed ${colors.slate[200]}`, paddingTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colors.slate[500], textTransform: 'uppercase', marginBottom: 6 }}>
                      Sample Test Cases ({p.testCases.filter(t => !t.isHidden).length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.testCases.filter(t => !t.isHidden).slice(0, 2).map((tc, tci) => (
                        <div
                          key={tc.id || tci}
                          style={{
                            background: colors.surface.primary, padding: '8px 10px', borderRadius: 6,
                            border: `1px solid ${colors.slate[200]}`, fontSize: 12, fontFamily: 'monospace',
                          }}
                        >
                          <div><strong>Input:</strong> {tc.input || 'None'}</div>
                          <div><strong>Expected:</strong> {tc.expectedOutput || ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function CodingLeaderboardModal({ assessment, data, onClose }) {
  const sorted = [...data].sort((a, b) => (parseFloat(b.percentage || b.score || 0)) - (parseFloat(a.percentage || a.score || 0)))
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 520,
          padding: 22, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.slate[900] }}>
            <Trophy size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: colors.warning[500] }} />
            Leaderboard — {assessment.title}
          </h3>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}>
            <X size={14} />
          </button>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.slate[400], fontSize: 14 }}>
            No submissions or published results yet.
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
                {sorted.map((entry, i) => {
                  const pct = entry.percentage != null ? parseFloat(entry.percentage) : null
                  return (
                    <tr key={entry.participantId || entry.id || i} style={{ borderBottom: `1px solid ${colors.slate[100]}` }}>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: i < 3 ? colors.warning[500] : colors.slate[400], fontSize: 13 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: colors.slate[900], fontSize: 13 }}>
                        {entry.participant?.name || entry.participantName || entry.name || 'Anonymous'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: colors.slate[600], fontSize: 13 }}>
                        {entry.score ?? entry.totalScore ?? '-'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: pct >= 80 ? colors.success[100] : pct >= 50 ? colors.warning[100] : colors.danger[100],
                          color: pct >= 80 ? colors.success[700] : pct >= 50 ? colors.warning[800] : colors.danger[600],
                        }}>
                          {pct != null ? `${Math.round(pct)}%` : '-'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function AICodingWizard({ user, courseId, onClose, onGenerated }) {
  const { success, error: showError } = useToast()
  const [promptText, setPromptText] = useState('')
  const [problemCount, setProblemCount] = useState(1)
  const [difficulty, setDifficulty] = useState('MEDIUM')
  const [timeLimit, setTimeLimit] = useState(60)
  const [languages, setLanguages] = useState(['javascript', 'python'])
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState(0)
  const [genError, setGenError] = useState('')
  const reqSeqRef = useRef(0)

  const genSteps = useMemo(() => {
    const base = [
      'Generating problem statements & test cases',
      ...languages.map((l) => `Generating ${wizardLangLabel(l)} starter code + reference solution`),
      'Validating every language solution',
    ]
    return base
  }, [languages])

  useEffect(() => {
    if (!generating) return
    setGenStep(0)
    const id = setInterval(() => {
      setGenStep((s) => Math.min(s + 1, genSteps.length - 1))
    }, 1400)
    return () => clearInterval(id)
  }, [generating, genSteps.length])

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!promptText.trim()) { showError('Please enter a topic or prompt'); return }
    if (languages.length === 0) { showError('Please select at least one language'); return }
    setGenError('')
    setGenerating(true)
    const countToSend = Math.max(1, Math.min(parseInt(problemCount, 10) || 1, 10))
    const currentSeq = ++reqSeqRef.current

    try {
      const r = await fetch(API.CODING.GENERATE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          courseId,
          prompt: promptText.trim(),
          problemCount: countToSend,
          difficulty: difficulty.toUpperCase(),
          timeLimit: parseInt(timeLimit, 10) || 60,
          languages,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Generation failed')
      console.log('[FRONTEND_STATE] Assessment created:', d.assessment)
      success('Coding assessment created successfully')
      onGenerated?.()
      onClose()
    } catch (err) {
      if (currentSeq === reqSeqRef.current) {
        setGenError(err.message)
        showError(err.message)
      }
    } finally {
      if (currentSeq === reqSeqRef.current) {
        setGenerating(false)
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: colors.bg.overlay,
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 580,
          boxShadow: '0 25px 60px -10px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '18px 20px', borderBottom: `1px solid ${colors.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={lblTiny}>AI Coding Wizard</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.slate[900] }}>
              Generate Coding Assessment with AI
            </div>
          </div>
          <button onClick={onClose} style={iconBtn(colors.slate[100], colors.slate[600])}>
            <X size={16} />
          </button>
        </div>

        {generating ? (
          <div style={{
            padding: '36px 28px', textAlign: 'center', display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 40, height: 40, border: '4px solid #f3f3f3',
              borderTop: `4px solid ${colors.primary[600]}`, borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <div style={{ fontWeight: 700, fontSize: 15, color: colors.slate[900] }}>
              AI is crafting your coding assessment...
            </div>
            <div style={{ width: '100%', maxWidth: 360, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {genSteps.map((step, i) => {
                const done = i < genStep
                const active = i === genStep
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: done ? colors.success[600] : active ? colors.primary[50] : colors.slate[100],
                      color: done ? '#fff' : active ? colors.primary[600] : colors.slate[400],
                    }}>
                      {done ? <Check size={11} /> : active ? <Loader2 size={11} className="animate-spin" /> : <span style={{ fontSize: 10 }}>{i + 1}</span>}
                    </span>
                    <span style={{ color: done ? colors.success[600] : active ? colors.slate[900] : colors.slate[400], fontWeight: done || active ? 600 : 400 }}>
                      {step}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : genError ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <AlertTriangle size={34} style={{ color: colors.warning[500] }} />
            <div style={{ fontWeight: 700, fontSize: 15, color: colors.slate[900] }}>Generation failed</div>
            <div style={{ fontSize: 13, color: colors.slate[500], maxWidth: 380, wordBreak: 'break-word' }}>{genError}</div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Close</button>
              <button type="button" onClick={handleGenerate} style={{ ...btnPrimary, background: `linear-gradient(135deg, ${colors.primary[400]}, ${colors.primary[600]})` }}>
                <RefreshCw size={14} style={{ marginRight: 6 }} /> Retry Generation
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerate} style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...lblStyle, marginTop: 0 }}>Topic or Prompt <span style={{ color: colors.danger[600] }}>*</span></label>
              <textarea
                value={promptText}
                onChange={(e) => {
                  const val = e.target.value
                  setPromptText(val)
                  const m = val.match(/\b([1-9]|10)\s*(?:(?:easy|medium|hard|simple|basic|coding|programming|algorithm)\s+)*(?:problems?|questions?|tasks?|challenges?)\b/i)
                  if (m && m[1]) {
                    setProblemCount(parseInt(m[1], 10))
                  }
                }}
                placeholder='e.g. "Generate 3 easy problems on array sorting" or "Write a program that prints HI"'
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontSize: 13 }}
                required
              />
              <div style={{ fontSize: 11, color: colors.slate[500], marginTop: 4, lineHeight: 1.4 }}>
                Describe the coding topics or skills you want to assess, including how many problems you'd like (e.g. 'Generate 3 easy problems on array sorting'). If not specified, 1 problem will be generated.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ ...lblStyle, marginTop: 0 }}>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={inputStyle}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                  <option value="MIXED">Mixed</option>
                </select>
              </div>
              <div>
                <label style={{ ...lblStyle, marginTop: 0 }}>Problems</label>
                <select value={problemCount} onChange={(e) => setProblemCount(parseInt(e.target.value, 10))} style={inputStyle}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'Problem' : 'Problems'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...lblStyle, marginTop: 0 }}>Time Limit (mins)</label>
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 60"
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ ...lblStyle, marginTop: 0 }}>
                Languages <span style={{ color: colors.danger[600] }}>*</span>
              </label>
              <LanguageMultiSelect value={languages} onChange={setLanguages} />
              <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 4 }}>
                AI generates a starter template and a reference solution for every selected language.
              </div>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              borderTop: `1px solid ${colors.border.default}`, paddingTop: 16,
            }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
              <button type="submit" style={{ ...btnPrimary, background: `linear-gradient(135deg, ${colors.primary[400]}, ${colors.primary[600]})` }}>
                <Sparkles size={14} style={{ marginRight: 6 }} /> Generate Assessment
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function CourseCodingTab({ user, courseId, onCountChange }) {
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const confirm = useConfirm()
  const [assessments, setAssessments] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`course_coding_${courseId}`)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`course_coding_${courseId}`)
      return !cached
    } catch {
      return true
    }
  })
  const [showWizard, setShowWizard] = useState(false)

  // Filters, Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState([])
  const selectAllRef = useRef(null)

  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null)
  const [publishAssessment, setPublishAssessment] = useState(null)
  const [leaderboardAssessment, setLeaderboardAssessment] = useState(null)
  const [leaderboardData, setLeaderboardData] = useState([])
  const [sendingAssessmentId, setSendingAssessmentId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const [bankSearch, setBankSearch] = useState('')
  const [bankExpanded, setBankExpanded] = useState(false)
  const [bankProblems, setBankProblems] = useState([])

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchAll = async (isQuiet = false) => {
    try {
      if (!isQuiet && assessments.length === 0) {
        setLoading(true)
      }
      const r = await fetch(`${API.CODING.LIST}?courseId=${courseId}`, { headers: auth() })
      const d = await r.json()
      if (d.success) {
        setAssessments(d.assessments || [])
        try {
          sessionStorage.setItem(`course_coding_${courseId}`, JSON.stringify(d.assessments || []))
        } catch (_) {}
      }
    } catch (e) {
      if (!isQuiet) showError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll(false) }, [courseId])

  // Filtered & Paginated Assessments
  const filteredAssessments = useMemo(() => {
    return assessments.filter(a => {
      if (statusFilter !== 'ALL' && (a.status || 'DRAFT') !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (a.title || '').toLowerCase().includes(q)
        const matchLesson = (a.lessonTitle || '').toLowerCase().includes(q)
        const matchDiff = (a.difficulty || '').toLowerCase().includes(q)
        if (!matchTitle && !matchLesson && !matchDiff) return false
      }
      return true
    })
  }, [assessments, statusFilter, searchQuery])

  // Reset page when search or status filter changes
  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredAssessments.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedAssessments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredAssessments.slice(start, start + pageSize)
  }, [filteredAssessments, currentPage, pageSize])

  // Selection Checkbox Helpers
  const isAllSelected = pagedAssessments.length > 0 && pagedAssessments.every(a => selectedIds.includes(a.id))
  const isSomeSelected = pagedAssessments.some(a => selectedIds.includes(a.id)) && !isAllSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSomeSelected
    }
  }, [isSomeSelected])

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const pagedIds = new Set(pagedAssessments.map(a => a.id))
      setSelectedIds(prev => prev.filter(id => !pagedIds.has(id)))
    } else {
      const pagedIds = pagedAssessments.map(a => a.id)
      setSelectedIds(prev => Array.from(new Set([...prev, ...pagedIds])))
    }
  }

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleCreate = async () => {
    try {
      const r = await fetch(API.CODING.CREATE, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, trainingId: courseId }),
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || 'Creation failed'); return }
      success('Assessment created (DRAFT)')
      onCountChange?.(true)
      fetchAll(true)
      if (d.assessment?.id || d.id) {
        setSelectedAssessmentId(d.assessment?.id || d.id)
      }
    } catch (e) { showError(e.message) }
  }

  const handleDelete = async (a) => {
    const ok = await confirm({
      title: 'Delete Assessment',
      message: `Are you sure you want to delete "${a.title}"? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Permanently',
    })
    if (!ok) return
    setDeletingId(a.id)
    try {
      const r = await fetch(API.CODING.DELETE(a.id), { method: 'DELETE', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.message || d.error || 'Delete failed'); return }
      success('Assessment deleted')
      setSelectedIds(prev => prev.filter(id => id !== a.id))
      const remainingCount = filteredAssessments.length - 1
      const newTotalPages = Math.max(1, Math.ceil(remainingCount / pageSize))
      if (currentPage > newTotalPages) {
        setPage(newTotalPages)
      }
      fetchAll(true)
      onCountChange?.(true)
    } catch (e) { showError(e.message) }
    finally { setDeletingId(null) }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    const ok = await confirm({
      title: 'Delete Selected Assessments',
      message: `Are you sure you want to delete ${selectedIds.length} assessment${selectedIds.length === 1 ? '' : 's'}? This will permanently remove all related problems, test cases, and submissions.`,
      type: 'danger',
      confirmText: `Delete ${selectedIds.length} Assessment${selectedIds.length === 1 ? '' : 's'}`,
    })
    if (!ok) return

    try {
      let r = await fetch(API.CODING.BULK_DELETE, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })

      if (r.status === 404) {
        // Fallback for servers running instances before bulk route was registered
        let lastError = null
        const results = await Promise.all(
          selectedIds.map(async (id) => {
            try {
              const res = await fetch(API.CODING.DELETE(id), { method: 'DELETE', headers: auth() })
              const data = await res.json().catch(() => ({}))
              if (res.ok && data.success !== false && !data.error) {
                return true
              }
              lastError = data.error || data.message || lastError
              return false
            } catch (err) {
              lastError = err.message || lastError
              return false
            }
          })
        )
        const deletedCount = results.filter(Boolean).length
        if (deletedCount > 0) {
          success(`${deletedCount} assessment${deletedCount === 1 ? '' : 's'} deleted successfully`)
        } else {
          showError(lastError || 'Failed to delete assessments')
          return
        }
      } else {
        const d = await r.json()
        if (!r.ok || d.success === false) {
          showError(d.error || d.message || 'Bulk delete failed')
          return
        }
        success(`${d.count || selectedIds.length} assessment${selectedIds.length === 1 ? '' : 's'} deleted successfully`)
      }

      const remainingTotal = filteredAssessments.length - selectedIds.length
      const newTotalPages = Math.max(1, Math.ceil(remainingTotal / pageSize))
      if (currentPage > newTotalPages) {
        setPage(newTotalPages)
      }
      setSelectedIds([])
      fetchAll(true)
      onCountChange?.(true)
    } catch (e) {
      showError(e.message || 'Bulk delete failed')
    }
  }

  const publishToParticipants = async (a) => {
    const ok = await confirm({
      title: 'Publish Assessment',
      message: `Are you sure you want to publish "${a.title}" to enrolled participants?`,
      type: 'publish',
      confirmText: 'Yes, Publish',
    })
    if (!ok) return
    setSendingAssessmentId(a.id)
    try {
      const r = await fetch(API.CODING.PUBLISH(a.id), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || d.message || 'Publish failed'); return }
      success('Assessment published to participants ✓')
      fetchAll(true)
      onCountChange?.(true)
    } catch (e) { showError(e.message) }
    finally { setSendingAssessmentId(null) }
  }

  const openLeaderboard = async (a) => {
    try {
      const r = await fetch(API.CODING.LEADERBOARD(a.id), { headers: auth() })
      const d = await r.json()
      if (d.success) setLeaderboardData(d.leaderboard || [])
      else setLeaderboardData([])
    } catch { setLeaderboardData([]) }
    setLeaderboardAssessment(a)
  }

  // Fetch Problem Bank when expanded
  useEffect(() => {
    if (!bankExpanded) return
    let aborted = false
    ;(async () => {
      const collected = []
      for (const a of assessments) {
        try {
          const r = await fetch(API.CODING.DETAIL(a.id), { headers: auth() })
          const d = await r.json()
          if (d.assessment?.problems) {
            d.assessment.problems.forEach(prob => collected.push({
              ...prob, sourceAssessmentId: d.assessment.id, sourceAssessmentTitle: d.assessment.title,
            }))
          }
        } catch {}
      }
      if (!aborted) setBankProblems(collected)
    })()
    return () => { aborted = true }
  }, [bankExpanded, assessments])

  const filteredBank = useMemo(() => {
    if (!bankSearch) return bankProblems
    const q = bankSearch.toLowerCase()
    return bankProblems.filter(prob =>
      (prob.title || '').toLowerCase().includes(q) ||
      (prob.description || '').toLowerCase().includes(q) ||
      (prob.sourceAssessmentTitle || '').toLowerCase().includes(q)
    )
  }, [bankProblems, bankSearch])

  return (
    <div className="cct-container">
      {/* Header bar */}
      <div className="cct-header">
        <h3 className="cct-title">
          {assessments.length} Coding Assessment{assessments.length !== 1 ? 's' : ''}
        </h3>
        <div className="cct-actions">
          <button
            onClick={() => setShowWizard(true)}
            className="cct-btn-ai"
          >
            <Sparkles size={13} /> Generate with AI
          </button>
          <button
            onClick={handleCreate}
            className="cct-btn-primary"
          >
            <Plus size={13} /> Create Assessment
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        background: '#FFFFFF',
        padding: '10px 16px',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240, maxWidth: 400 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: '6px 12px',
            width: '100%',
          }}>
            <Search size={14} color="#94A3B8" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assessments..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%', color: '#1E293B' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94A3B8' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">All Statuses ({assessments.length})</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Multi-Selection Floating Action Bar */}
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 10,
            padding: '8px 16px',
            color: '#991B1B',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{selectedIds.length} assessment{selectedIds.length === 1 ? '' : 's'} selected</span>
            <button
              onClick={() => setSelectedIds([])}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '0 4px',
              }}
            >
              Clear
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(220, 38, 38, 0.3)',
            }}
          >
            <Trash2 size={13} />
            Delete Selected ({selectedIds.length})
          </button>
        </motion.div>
      )}

      {loading ? (
        <div style={{ height: 160, background: '#F8FAFC', borderRadius: 12, border: '1px solid #F1F5F9' }} />
      ) : assessments.length === 0 ? (
        <div className="cct-empty-state">
          <div className="cct-empty-icon">
            <Code size={26} color="#16A34A" />
          </div>
          <h4>No coding assessments yet</h4>
          <p>Click <strong>Create Assessment</strong> or <strong>Generate with AI</strong> to add the first one.</p>
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="cct-empty-state" style={{ padding: 32 }}>
          <h4>No matching assessments found</h4>
          <p>Try adjusting your search query or status filter.</p>
          <button
            onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }}
            style={{
              marginTop: 8,
              padding: '6px 14px',
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="cct-table-card">
          <table className="cct-table">
            <thead>
              <tr>
                <th style={{ width: 38, textAlign: 'center', padding: '10px 8px' }}>
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#16A34A' }}
                    aria-label="Select all assessments on current page"
                  />
                </th>
                <th>TITLE</th>
                <th>LESSON</th>
                <th>PROBLEMS</th>
                <th>STATUS</th>
                <th>RESULT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {pagedAssessments.map(a => {
                const isSelected = selectedIds.includes(a.id)
                return (
                  <tr key={a.id} style={{ background: isSelected ? '#F0FDF4' : 'transparent' }}>
                    <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(a.id)}
                        style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#16A34A' }}
                        aria-label={`Select assessment ${a.title}`}
                      />
                    </td>
                    <td>
                      <div className="cct-title-cell">{a.title || 'Untitled Assessment'}</div>
                      {a.isMandatory && (
                        <span className="cct-badge-mandatory">MANDATORY</span>
                      )}
                      {a.difficulty && (
                        <span className="cct-badge-tag">{a.difficulty}</span>
                      )}
                    </td>
                    <td className="cct-cell-muted">
                      {a.lessonTitle || (Array.isArray(a.languages) && a.languages.length > 0 ? a.languages.map(wizardLangLabel).join(', ') : '— Course-level —')}
                    </td>
                    <td className="cct-cell-num">{a.problemCount ?? a.problems?.length ?? a.numProblems ?? 0}</td>
                    <td>
                      <span className={`cct-badge cct-badge--${(a.status || 'DRAFT').toLowerCase()}`}>
                        {a.status || 'DRAFT'}
                      </span>
                    </td>
                    <td>
                      <span className={`cct-badge cct-badge--${(a.resultStatus || 'HIDDEN').toLowerCase()}`}>
                        {a.resultStatus || 'HIDDEN'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          title="View Assessment Details"
                          onClick={() => setSelectedAssessmentId(a.id)}
                          className="cct-action-btn"
                        >
                          <Eye size={12} />
                        </button>
                        <button
                          title="Edit Assessment"
                          onClick={() => setSelectedAssessmentId(a.id)}
                          className="cct-action-btn"
                        >
                          <Pencil size={12} />
                        </button>
                        {a.status === 'DRAFT' ? (
                          <button
                            title="Publish to participants"
                            onClick={() => publishToParticipants(a)}
                            disabled={sendingAssessmentId === a.id}
                            className="cct-action-btn"
                          >
                            <Send size={12} />
                          </button>
                        ) : (
                          <button
                            title={a.resultStatus === 'PUBLISHED' ? 'Already published' : 'Publish results'}
                            onClick={() => a.resultStatus !== 'PUBLISHED' && setPublishAssessment(a)}
                            disabled={a.resultStatus === 'PUBLISHED'}
                            className="cct-action-btn"
                            style={{ opacity: a.resultStatus === 'PUBLISHED' ? 0.45 : 1 }}
                          >
                            <Send size={12} />
                          </button>
                        )}
                        <button
                          title="Manage / Analytics"
                          onClick={() => setSelectedAssessmentId(a.id)}
                          className="cct-action-btn"
                        >
                          <BarChart3 size={12} />
                        </button>
                        <button
                          title="Leaderboard"
                          onClick={() => openLeaderboard(a)}
                          className="cct-action-btn"
                        >
                          <Trophy size={12} />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => handleDelete(a)}
                          className="cct-action-btn"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredAssessments.length}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            pageSizeOptions={[10, 25, 50, 100]}
            recordLabel="assessments"
          />
        </div>
      )}

      {/* Problem Bank Accordion */}
      <div className="cct-bank-card">
        <button
          onClick={() => setBankExpanded(v => !v)}
          className="cct-bank-toggle"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={14} color="#16A34A" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
              Problem Bank ({bankProblems.length})
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
                placeholder="Search problem title, description, or assessment…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13 }}
              />
            </div>
            {filteredBank.length === 0 ? (
              <div style={{ padding: 14, textAlign: 'center', color: colors.slate[400], fontSize: 12 }}>
                No problems match your search.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredBank.map(prob => (
                  <div key={`${prob.sourceAssessmentId}-${prob.id}`} style={{
                    padding: 10, border: `1px solid ${colors.slate[200]}`, borderRadius: 8, fontSize: 13,
                  }}>
                    <div style={{ color: colors.slate[900], fontWeight: 600, marginBottom: 4 }}>{prob.title}</div>
                    <div style={{ fontSize: 11, color: colors.slate[500], display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span><BookOpen size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />{prob.sourceAssessmentTitle}</span>
                      {prob.difficulty && <span>· Difficulty: <strong>{prob.difficulty}</strong></span>}
                      {prob.marks != null && <span>· {prob.marks} pts</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showWizard && (
          <AICodingWizard
            user={user}
            courseId={courseId}
            onClose={() => setShowWizard(false)}
            onGenerated={() => { fetchAll(true); onCountChange?.(true) }}
          />
        )}
        {publishAssessment && (
          <PublishCodingDialog
            user={user}
            assessment={publishAssessment}
            onClose={() => setPublishAssessment(null)}
            onPublished={() => { fetchAll(true); onCountChange?.(true) }}
          />
        )}
        {selectedAssessmentId && (
          <CodingAssessmentDetailModal
            assessmentId={selectedAssessmentId}
            user={user}
            onClose={() => { setSelectedAssessmentId(null); fetchAll(true); onCountChange?.(true) }}
            onRefresh={() => { fetchAll(true); onCountChange?.(true) }}
          />
        )}
        {leaderboardAssessment && (
          <CodingLeaderboardModal
            assessment={leaderboardAssessment}
            data={leaderboardData}
            onClose={() => setLeaderboardAssessment(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
