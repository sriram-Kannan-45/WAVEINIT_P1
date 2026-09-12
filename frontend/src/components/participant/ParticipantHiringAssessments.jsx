import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, Code2, FileQuestion, Loader2, Play, RefreshCw } from 'lucide-react'
import { API_BASE } from '../../api/api'
import hiringService from '../../services/hiringService'
import { useToast } from '../Toast'

const completedStatuses = new Set(['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED', 'COMPLETED'])

export default function ParticipantHiringAssessments({ user }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const response = await hiringService.getMyAssessments(); setItems(response.assessments || []) }
    catch (error) { toast.error(error.message || 'Could not load hiring assessments') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const launch = async (item) => {
    const assessment = item.assessment || {}
    const type = assessment.assessment_type
    const engineId = assessment.engine_id || (type === 'CODING' ? assessment.coding_assessment_id : assessment.quiz_id)
    if (!engineId) return toast.error('Assessment content is unavailable')
    const attempt = item.attempt
    if (attempt && completedStatuses.has(String(attempt.status).toUpperCase())) {
      navigate(type === 'CODING'
        ? `/trainings/hire/coding/${engineId}/result`
        : `/trainings/hire/quizzes/${engineId}/result`)
      return
    }
    setStarting(item.assignment_id)
    try {
      const endpoint = type === 'CODING'
        ? `${API_BASE}/coding/participant/start/${engineId}`
        : `${API_BASE}/quizzes/${engineId}/start`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not start assessment')
      const params = new URLSearchParams({
        attemptId: data.attemptId,
        sessionToken: data.sessionToken || '',
        monitoringSessionId: data.monitoringSessionId || '',
      })
      const policy = data.hireProctoring || assessment.proctoring_config || { enabled: true }
      sessionStorage.setItem(`hire_proctor_policy_${data.attemptId}`, JSON.stringify(policy))
      const needsGate = policy.enabled && (policy.identityVerification || policy.mobileRoomScan)
      navigate(type === 'CODING'
        ? `/trainings/hire/coding/${engineId}/${needsGate ? 'verification' : 'attempt'}?${params}`
        : `/trainings/hire/quizzes/${engineId}/${needsGate ? 'verification' : 'attempt'}?${params}`)
    } catch (error) { toast.error(error.message || 'Could not start assessment') }
    finally { setStarting(null) }
  }

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: 260, color: '#64748B' }}><Loader2 className="bulk-spin" /> Loading hiring assessments…</div>

  return (
    <section>
      <div className="reg-admin-header" style={{ marginBottom: 18 }}>
        <div className="reg-admin-header-icon"><Code2 size={22} /></div>
        <div style={{ flex: 1 }}><h1 className="reg-admin-title">Hiring Assessments</h1><p className="reg-admin-subtitle">Your assigned recruitment quizzes and coding tests use the same secure LMS assessment experience.</p></div>
        <button className="reg-admin-btn reg-admin-btn--secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {!items.length ? <div className="reg-admin-section reg-admin-empty" style={{ padding: 56 }}><FileQuestion size={38} /><h3>No hiring assessments assigned</h3><p>Assigned recruitment assessments will appear here.</p></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 16 }}>
        {items.map((item) => {
          const assessment = item.assessment || {}
          const isCoding = assessment.assessment_type === 'CODING'
          const status = String(item.attempt?.status || item.assignment_status || 'ASSIGNED').toUpperCase()
          const done = completedStatuses.has(status)
          const Icon = isCoding ? Code2 : FileQuestion
          return <article key={item.assignment_id} className="reg-admin-section" style={{ padding: 20, display: 'flex', flexDirection: 'column', minHeight: 235 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: isCoding ? '#EEF2FF' : '#ECFDF5', color: isCoding ? '#4F46E5' : '#059669' }}><Icon size={21} /></div><span style={{ fontSize: 11, fontWeight: 700, color: done ? '#15803D' : status === 'IN_PROGRESS' ? '#C2410C' : '#475569' }}>{status.replaceAll('_', ' ')}</span></div>
            <h3 style={{ margin: '16px 0 6px', fontSize: 17 }}>{assessment.title}</h3>
            <p style={{ margin: 0, color: '#64748B', fontSize: 13, lineHeight: 1.55, flex: 1 }}>{assessment.description || `${isCoding ? 'Coding' : 'Quiz'} screening assessment`}</p>
            <div style={{ display: 'flex', gap: 14, color: '#64748B', fontSize: 12, margin: '15px 0' }}><span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Clock3 size={13} /> {assessment.duration_minutes || item.engine?.timeLimit || 60} min</span><span>{assessment.content_count || item.engine?.numQuestions || item.engine?.numProblems || 0} items</span></div>
            <button className="reg-admin-btn reg-admin-btn--primary" onClick={() => launch(item)} disabled={starting === item.assignment_id}>{starting === item.assignment_id ? <Loader2 size={15} className="bulk-spin" /> : done ? <CheckCircle2 size={15} /> : <Play size={15} />}{done ? 'View result' : status === 'IN_PROGRESS' ? 'Resume assessment' : 'Start assessment'}</button>
          </article>
        })}
      </div>}
    </section>
  )
}
