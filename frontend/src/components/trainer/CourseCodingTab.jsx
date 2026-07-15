import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, Sparkles, Code, X, BookOpen,
} from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import { colors, btnPrimary as _btnPrimary, btnSecondary as _btnSecondary, btnDanger as _btnDanger, iconBtn as _iconBtn, STATUS_BADGE as _STATUS_BADGE, lblStyle as _lblStyle, inputStyle as _inputStyle, th as _th, td as _td, skeletonStyle, typography } from '../../theme/tokens'

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
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, flexWrap: 'wrap', gap: 12,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: colors.slate[900] }}>
          {assessments.length} coding assessment{assessments.length !== 1 ? 's' : ''}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowWizard(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', background: `linear-gradient(135deg, ${colors.primary[400]}, ${colors.primary[600]})`,
              color: colors.text.inverse, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} /> Generate with AI
          </button>
          <button
            onClick={handleCreate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', background: colors.surface.primary, color: colors.secondary[600],
              border: `1px solid ${colors.secondary[600]}`, borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Create Assessment
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 240, background: colors.slate[100], borderRadius: 10 }} />
      ) : assessments.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: colors.surface.primary, border: `1px dashed ${colors.border.dashed}`, borderRadius: 12,
        }}>
          <Code size={40} color={colors.slate[300]} style={{ margin: '0 auto 8px' }} />
          <p style={{ margin: '0 0 6px', color: colors.slate[600], fontWeight: 600 }}>No coding assessments yet</p>
          <p style={{ margin: 0, color: colors.slate[400], fontSize: 13 }}>
            Click <strong>Create Assessment</strong> to add the first one.
          </p>
        </div>
      ) : (
        <div style={{
          background: colors.surface.primary, border: `1px solid ${colors.border.default}`, borderRadius: 12, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: colors.slate[50] }}>
              <tr>
                <th style={_th}>Title</th>
                <th style={_th}>Problems</th>
                <th style={_th}>Languages</th>
                <th style={_th}>Status</th>
                <th style={_th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map(a => (
                <tr key={a.id} style={{ borderTop: `1px solid ${colors.slate[100]}` }}>
                  <td style={_td}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.slate[900] }}>{a.title || 'Untitled'}</div>
                  </td>
                  <td style={{ ..._td, color: colors.slate[600] }}>{a.problemCount ?? a.problems?.length ?? 0}</td>
                  <td style={{ ..._td, fontSize: 12, color: colors.slate[500] }}>
                    {(a.languages || []).length > 0 ? a.languages.join(', ') : '—'}
                  </td>
                  <td style={_td}><Badge value={a.status} map={_STATUS_BADGE} /></td>
                  <td style={_td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        title="View / Manage"
                        onClick={() => navigate(`/trainer/coding/${a.id}`)}
                        style={iconBtn(colors.secondary[100], colors.secondary[700])}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        title="Edit"
                        onClick={() => navigate(`/trainer/coding/${a.id}`)}
                        style={iconBtn(colors.primary[100], colors.primary[600])}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => handleDelete(a)}
                        style={iconBtn(colors.danger[100], colors.danger[600])}
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
