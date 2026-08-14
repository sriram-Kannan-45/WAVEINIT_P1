import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, Sparkles, Code, X, BookOpen,
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import { colors, btnPrimary as _btnPrimary, btnSecondary as _btnSecondary, btnDanger as _btnDanger, iconBtn as _iconBtn, STATUS_BADGE as _STATUS_BADGE, lblStyle as _lblStyle, inputStyle as _inputStyle, th as _th, td as _td, skeletonStyle, typography } from '../../theme/tokens'
import '../../styles/course-tabs.css'


function Badge({ value, map }) {
  const v = map[value] || map.DRAFT
  return (
    <span style={{
      display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, background: v.bg, color: v.fg,
      letterSpacing: 0.4, textTransform: 'uppercase',
    }}>{value}</span>
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
            <div style={_lblTiny}>AI Coding Wizard</div>
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
              <label style={{ ..._lblStyle, marginTop: 0 }}>Topic or Prompt <span style={{ color: colors.danger[600] }}>*</span></label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. JavaScript array methods, Python data structures, etc."
                rows={4}
                style={{ ..._inputStyle, resize: 'vertical', fontSize: 13 }}
                required
              />
              <div style={{ fontSize: 11, color: colors.slate[400], marginTop: 4 }}>
                Describe the coding topics or skills you want to assess.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ ..._lblStyle, marginTop: 0 }}>Number of Problems</label>
                <select value={problemCount} onChange={(e) => setProblemCount(e.target.value)} style={_inputStyle}>
                  {[1, 2, 3, 5, 7, 10].map(n => (
                    <option key={n} value={n}>{n} Problem{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ..._lblStyle, marginTop: 0 }}>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={_inputStyle}>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ ..._lblStyle, marginTop: 0 }}>Languages (comma-separated)</label>
              <input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="e.g. javascript, python, java, cpp"
                style={_inputStyle}
              />
            </div>

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              borderTop: `1px solid ${colors.border.default}`, paddingTop: 16,
            }}>
              <button type="button" onClick={onClose} style={_btnSecondary}>Cancel</button>
              <button type="submit" style={{ ..._btnPrimary, background: `linear-gradient(135deg, ${colors.primary[400]}, ${colors.primary[600]})` }}>
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

  const auth = () => ({ Authorization: `Bearer ${user.token}` })

  const fetchAll = async () => {
    try {
      setLoading(true)
      const r = await fetch(`${API.CODING.LIST}?courseId=${courseId}`, { headers: auth() })
      const d = await r.json()
      if (d.success) setAssessments(d.assessments || [])
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
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
      navigate(`/trainer/coding/${d.assessment?.id || d.id}`)
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
          <p>Click <strong>Create Assessment</strong> to add the first one.</p>
        </div>
      ) : (
        <div className="cct-table-card">
          <table className="cct-table">
            <thead>
              <tr>
                <th>TITLE</th>
                <th>PROBLEMS</th>
                <th>LANGUAGES</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map(a => (
                <tr key={a.id}>
                  <td>
                    <div className="cct-title-cell">{a.title || 'Untitled Assessment'}</div>
                  </td>
                  <td className="cct-cell-num">{a.problemCount ?? a.problems?.length ?? 0}</td>
                  <td className="cct-cell-muted">
                    {(a.languages || []).length > 0 ? a.languages.join(', ') : '—'}
                  </td>
                  <td>
                    <span className={`cct-badge cct-badge--${(a.status || 'DRAFT').toLowerCase()}`}>
                      {a.status || 'DRAFT'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        title="View / Manage"
                        onClick={() => navigate(`/trainer/coding/${a.id}`)}
                        className="cct-action-btn"
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        title="Edit"
                        onClick={() => navigate(`/trainer/coding/${a.id}`)}
                        className="cct-action-btn cct-action-btn--edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => handleDelete(a)}
                        className="cct-action-btn cct-action-btn--delete"
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

      <AnimatePresence>
        {showWizard && (
          <AICodingWizard
            user={user}
            courseId={courseId}
            onClose={() => setShowWizard(false)}
            onGenerated={() => { fetchAll(); onCountChange?.() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── shared helpers ──
const _lblTiny = { fontSize: 10, fontWeight: 600, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 1 }
const iconBtn = (bg, fg) => ({
  width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6,
  background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center',
})
