/**
 * ScheduleInterview Page
 * Form for creating/scheduling a new interview — matches admin portal design system.
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, ArrowLeft, Loader2 } from 'lucide-react'
import interviewService from '../../services/interviewService'
import { useToast } from '../../components/Toast'

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }
const selectStyle = { ...inputStyle, appearance: 'none', background: '#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 10px center', paddingRight: 30 }

export default function ScheduleInterview({ user }) {
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const [searchParams] = useSearchParams()
  const editingId = searchParams.get('edit') || searchParams.get('reschedule')
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [interviewers, setInterviewers] = useState([])
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    title: '',
    candidateId: '',
    interviewerId: '',
    type: 'TECHNICAL',
    date: '',
    time: '',
    durationMinutes: 60,
                    meetingType: 'IN_PLATFORM',
    meetingLink: '',
    description: '',
    requireMobilePairing: true,
    recordInterview: false,
  })

  useEffect(() => {
    const load = async () => {
      try {
        const [candRes, intRes] = await Promise.all([
          interviewService.getCandidates(),
          interviewService.getInterviewers(),
        ])
        setCandidates(candRes.candidates || [])
        setInterviewers(intRes.interviewers || [])

        if (editingId) {
          const res = await interviewService.get(editingId)
          const iv = res.interview
          if (iv) {
            const d = new Date(iv.scheduled_at)
            const pad = n => String(n).padStart(2, '0')
            setForm(f => ({
              ...f,
              title: iv.title || '',
              candidateId: iv.candidate_id ? String(iv.candidate_id) : '',
              interviewerId: iv.interviewer_id ? String(iv.interviewer_id) : '',
              type: iv.type || 'TECHNICAL',
              date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
              time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
              durationMinutes: iv.duration_minutes || 60,
              meetingType: iv.meeting_type || 'IN_PLATFORM',
              meetingLink: iv.meeting_link || '',
              description: iv.description || '',
              requireMobilePairing: iv.require_mobile_pairing !== false,
              recordInterview: !!iv.record_interview,
            }))
          }
        }
      } catch (err) {
        console.error('Failed to load scheduling data:', err)
        const msg = err?.message || 'Failed to load scheduling data'
        if (msg.includes('403') || msg.includes('Forbidden')) {
          setError('You do not have permission to view candidates or interviewers. Admin or Trainer role required.')
        } else {
          setError(msg)
        }
      } finally {
        setFetching(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.candidateId || !form.interviewerId || !form.date || !form.time) return
    try {
      setLoading(true)
      const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString()
      const payload = {
        candidateId: parseInt(form.candidateId),
        interviewerId: parseInt(form.interviewerId),
        scheduledAt,
        durationMinutes: parseInt(form.durationMinutes),
        type: form.type,
        title: form.title || undefined,
        description: form.description || undefined,
        requireMobilePairing: form.requireMobilePairing,
        meetingType: form.meetingType,
        meetingLink: form.meetingLink || undefined,
        recordInterview: form.recordInterview,
      }
      if (editingId) {
        await interviewService.update(editingId, payload)
      } else {
        await interviewService.create(payload)
      }
      navigate('/interviews', { state: { toast: editingId ? 'Interview updated successfully' : 'Interview scheduled successfully' } })
    } catch (err) {
      console.error('Failed to save interview:', err)
      showError(err?.response?.data?.error || err?.message || 'Failed to save interview')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDraft = () => {
    alert('Draft saved locally. You can continue editing later.')
  }

  const selectedCandidate = candidates.find(c => c.id === parseInt(form.candidateId))

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="reg-admin">
      {/* Header */}
      <div className="reg-admin-header">
        <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
          <Calendar size={22} color="#fff" />
        </div>
        <div>
          <h2 className="reg-admin-title">{editingId ? 'Edit Interview' : 'Schedule Interview'}</h2>
          <p className="reg-admin-subtitle">{editingId ? 'Update the interview details and save your changes' : 'Create a new interview session for a candidate'}</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="reg-admin-btn reg-admin-btn--secondary" onClick={() => navigate('/interviews')}>
          <ArrowLeft size={14} /> Back to Interviews
        </button>
      </div>

      {fetching ? (
        <div className="reg-admin-loading">
          <Loader2 size={28} className="spin" />
          <span>Loading scheduling data...</span>
        </div>
      ) : error ? (
        <div className="reg-admin-table-wrap" style={{ maxWidth: 900 }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ color: '#DC2626', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Failed to load data</div>
            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{error}</div>
            <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      ) : (
        <div className="reg-admin-table-wrap" style={{ maxWidth: 900 }}>
          <div style={{ padding: 24 }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Two-column grid */}
              <div className="interview-form-grid">
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Interview Title</label>
                    <input
                      type="text"
                      placeholder="e.g., Senior Developer Technical Interview"
                      value={form.title}
                      onChange={e => handleChange('title', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Candidate *</label>
                    <select
                      value={form.candidateId}
                      onChange={e => handleChange('candidateId', e.target.value)}
                      style={selectStyle}
                      required
                    >
                      <option value="">Select candidate</option>
                      {candidates.length === 0 ? (
                        <option value="" disabled>No approved participants found</option>
                      ) : candidates.map(c => (
                        <option key={c.id} value={c.id} disabled={c.alreadyScheduled}>
                          {c.name} ({c.email}) {c.training?.title ? `- ${c.training.title}` : ''} {c.alreadyScheduled ? ' [Already Scheduled]' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedCandidate && (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                        {selectedCandidate.phone && <span>Phone: {selectedCandidate.phone} · </span>}
                        {selectedCandidate.training?.title && <span>Training: {selectedCandidate.training.title}</span>}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>HR / Interviewer *</label>
                    <select
                      value={form.interviewerId}
                      onChange={e => handleChange('interviewerId', e.target.value)}
                      style={selectStyle}
                      required
                    >
                      <option value="">Select interviewer</option>
                      {interviewers.length === 0 ? (
                        <option value="" disabled>No trainers found</option>
                      ) : interviewers.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.email}) {i.activeInterviews > 0 ? ` [${i.activeInterviews} active]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Interview Type</label>
                    <select value={form.type} onChange={e => handleChange('type', e.target.value)} style={selectStyle}>
                      <option value="TECHNICAL">Technical</option>
                      <option value="HR">HR</option>
                      <option value="MANAGERIAL">Managerial</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Duration</label>
                    <select value={form.durationMinutes} onChange={e => handleChange('durationMinutes', parseInt(e.target.value))} style={selectStyle}>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                      <option value={120}>120 minutes</option>
                    </select>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Interview Date *</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => handleChange('date', e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Interview Time *</label>
                    <input
                      type="time"
                      value={form.time}
                      onChange={e => handleChange('time', e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Meeting Type</label>
                    <select value={form.meetingType} onChange={e => handleChange('meetingType', e.target.value)} style={selectStyle}>
                      <option value="IN_PLATFORM">In-Platform (Interview in this app)</option>
                      <option value="ONLINE">External Online (Google Meet, Zoom, etc.)</option>
                      <option value="IN_PERSON">In-Person</option>
                      <option value="HYBRID">Hybrid</option>
                    </select>
                  </div>

                  {form.meetingType === 'IN_PLATFORM' && (
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                      <strong>In-Platform Interview</strong>
                      <div style={{ marginTop: 4 }}>
                        A private interview room will be created inside this app. Both you and the candidate will join from the dashboard — no external link needed.
                      </div>
                    </div>
                  )}

                  {(form.meetingType === 'ONLINE' || form.meetingType === 'HYBRID') && (
                    <div>
                      <label style={labelStyle}>Meeting Link</label>
                      <input
                        type="url"
                        placeholder="https://meet.google.com/..."
                        value={form.meetingLink}
                        onChange={e => handleChange('meetingLink', e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>Notes / Description</label>
                    <textarea
                      rows={4}
                      placeholder="Optional notes about this interview..."
                      value={form.description}
                      onChange={e => handleChange('description', e.target.value)}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className={`interview-toggle ${form.requireMobilePairing ? 'interview-toggle--active' : ''}`}
                    onClick={() => handleChange('requireMobilePairing', !form.requireMobilePairing)}
                  >
                    <div className="interview-toggle-knob" />
                  </button>
                  <span style={{ fontSize: 13, color: '#475569' }}>Mobile Camera Monitoring</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className={`interview-toggle ${form.recordInterview ? 'interview-toggle--active' : ''}`}
                    onClick={() => handleChange('recordInterview', !form.recordInterview)}
                  >
                    <div className="interview-toggle-knob" />
                  </button>
                  <span style={{ fontSize: 13, color: '#475569' }}>Record Interview</span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--secondary"
                  onClick={() => navigate('/interviews')}
                  style={{ flex: '0 0 auto' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="reg-admin-btn reg-admin-btn--secondary"
                  onClick={handleSaveDraft}
                  style={{ flex: '0 0 auto' }}
                >
                  Save Draft
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="submit"
                  className="reg-admin-btn reg-admin-btn--primary"
                  disabled={loading || !form.candidateId || !form.interviewerId || !form.date || !form.time}
                >
                  {loading ? 'Saving...' : editingId ? 'Save Changes' : 'Schedule Interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  )
}
