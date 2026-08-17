import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, Send, Sparkles, Code, X, BookOpen,
  BarChart3, Trophy, Check, AlertTriangle, ChevronDown, ChevronUp, Search, Clock,
} from 'lucide-react'
import { CodingAssessmentDetailModal } from '../../pages/TrainerCodingAssessmentDetails'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import {
  colors, btnPrimary, btnSecondary, iconBtn, STATUS_BADGE, RESULT_BADGE,
  lblStyle, lblTiny, inputStyle, th, td, skeletonStyle, typography, DIFF_BADGE,
} from '../../theme/tokens'
import '../../styles/course-tabs.css'

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
      onClick={() => !publishing && onClose()}
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
      onClick={onClose}
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
  const [problemCount, setProblemCount] = useState(3)
  const [difficulty, setDifficulty] = useState('Medium')
  const [languages, setLanguages] = useState('javascript, python')
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!promptText.trim()) { showError('Please enter a topic or prompt'); return }
    setGenerating(true)
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
          problemCount: parseInt(problemCount, 10),
          difficulty,
          languages: languages.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Generation failed')
      success('Coding assessment created successfully')
      onGenerated?.()
      onClose()
    } catch (err) { showError(err.message) }
    finally { setGenerating(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !generating && onClose()}
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
          background: colors.surface.primary, borderRadius: 14, width: '100%', maxWidth: 540,
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
            padding: '40px 20px', textAlign: 'center', display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, border: '4px solid #f3f3f3',
              borderTop: `4px solid ${colors.primary[600]}`, borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <div style={{ fontWeight: 700, fontSize: 15, color: colors.slate[900] }}>AI is crafting your coding assessment...</div>
            <div style={{ fontSize: 13, color: colors.slate[400], maxWidth: 360 }}>
              Generating problems with test cases and solutions. This may take up to 60 seconds.
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerate} style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...lblStyle, marginTop: 0 }}>Topic or Prompt <span style={{ color: colors.danger[600] }}>*</span></label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. JavaScript array methods, Python data structures, etc."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontSize: 13 }}
                required
              />
              <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 4 }}>
                Describe the coding topics or skills you want to assess.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ ...lblStyle, marginTop: 0 }}>Number of Problems</label>
                <select value={problemCount} onChange={(e) => setProblemCount(e.target.value)} style={inputStyle}>
                  {[1, 2, 3, 5, 7, 10].map(n => (
                    <option key={n} value={n}>{n} Problem{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...lblStyle, marginTop: 0 }}>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={inputStyle}>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ ...lblStyle, marginTop: 0 }}>Languages (comma-separated)</label>
              <input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="e.g. javascript, python, java, cpp"
                style={inputStyle}
              />
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
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)

  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null)
  const [publishAssessment, setPublishAssessment] = useState(null)
  const [leaderboardAssessment, setLeaderboardAssessment] = useState(null)
  const [leaderboardData, setLeaderboardData] = useState([])
  const [sendingAssessmentId, setSendingAssessmentId] = useState(null)

  const [bankSearch, setBankSearch] = useState('')
  const [bankExpanded, setBankExpanded] = useState(false)
  const [bankProblems, setBankProblems] = useState([])

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchAll = async () => {
    try {
      setLoading(true)
      const r = await fetch(`${API.CODING.LIST}?courseId=${courseId}`, { headers: auth() })
      const d = await r.json()
      if (d.success) setAssessments(d.assessments || [])
    } catch (e) {
      showError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [courseId])

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
      onCountChange?.()
      if (d.assessment?.id || d.id) {
        setSelectedAssessmentId(d.assessment?.id || d.id)
      }
    } catch (e) { showError(e.message) }
  }

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete assessment "${a.title}"? This cannot be undone.`)) return
    try {
      const r = await fetch(API.CODING.DELETE(a.id), { method: 'DELETE', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.message || d.error || 'Delete failed'); return }
      success('Assessment deleted')
      await fetchAll()
      onCountChange?.()
    } catch (e) { showError(e.message) }
  }

  const openPreview = async (a) => {
    const full = await fetchFullAssessment(a.id)
    if (full) setPreviewAssessment(full)
  }

  const publishToParticipants = async (a) => {
    if (!window.confirm(`Publish "${a.title}" to enrolled participants?`)) return
    setSendingAssessmentId(a.id)
    try {
      const r = await fetch(API.CODING.PUBLISH(a.id), { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok || d.success === false) { showError(d.error || d.message || 'Publish failed'); return }
      success('Assessment published to participants ✓')
      await fetchAll()
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
      ) : (
        <div className="cct-table-card">
          <table className="cct-table">
            <thead>
              <tr>
                <th>TITLE</th>
                <th>LESSON</th>
                <th>PROBLEMS</th>
                <th>STATUS</th>
                <th>RESULT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map(a => (
                <tr key={a.id}>
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
                    {a.lessonTitle || (Array.isArray(a.languages) && a.languages.length > 0 ? a.languages.join(', ') : '— Course-level —')}
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
              ))}
            </tbody>
          </table>
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
            onGenerated={() => { fetchAll(); onCountChange?.() }}
          />
        )}
        {publishAssessment && (
          <PublishCodingDialog
            user={user}
            assessment={publishAssessment}
            onClose={() => setPublishAssessment(null)}
            onPublished={fetchAll}
          />
        )}
        {selectedAssessmentId && (
          <CodingAssessmentDetailModal
            assessmentId={selectedAssessmentId}
            user={user}
            onClose={() => { setSelectedAssessmentId(null); fetchAll() }}
            onRefresh={fetchAll}
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
