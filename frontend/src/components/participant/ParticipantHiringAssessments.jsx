import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Clock3, Code2, FileQuestion, Loader2, Play, RefreshCw, ShieldCheck, TimerOff, X
} from 'lucide-react'
import { API_BASE } from '../../api/api'
import hiringService from '../../services/hiringService'
import { useToast } from '../Toast'

const completedStatuses = new Set(['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED', 'COMPLETED'])
const blockedStatuses = new Set(['REVOKED', 'EXPIRED', 'DROPPED'])

export default function ParticipantHiringAssessments({ user }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)
  const [prelaunch, setPrelaunch] = useState(null)
  const [launching, setLaunching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const response = await hiringService.getMyAssessments(); setItems(response.assessments || []) }
    catch (error) { toast.error(error.message || 'Could not load hiring assessments') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const startAssessment = async (item) => {
    const assessment = item.assessment || {}
    const type = assessment.assessment_type
    const engineId = assessment.engine_id || (type === 'CODING' ? assessment.coding_assessment_id : assessment.quiz_id)
    if (!engineId) return toast.error('Assessment content is unavailable')
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

  const launch = (item) => {
    const assessment = item.assessment || {}
    const type = assessment.assessment_type
    const stateCode = String(item.attempt?.status || item.assignment_status || 'ASSIGNED').toUpperCase()
    const done = completedStatuses.has(stateCode)
    if (done) {
      const engineId = assessment.engine_id || (type === 'CODING' ? assessment.coding_assessment_id : assessment.quiz_id)
      navigate(type === 'CODING'
        ? `/trainings/hire/coding/${engineId}/result`
        : `/trainings/hire/quizzes/${engineId}/result`)
      return
    }
    // Pre-assessment validation screen before any attempt is created.
    setPrelaunch(item)
  }

  const resume = (item) => startAssessment(item)

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: 260, color: '#64748B' }}><Loader2 className="bulk-spin" /> Loading hiring assessments…</div>

  return (
    <section>
      <div className="reg-admin-header" style={{ marginBottom: 18 }}>
        <div className="reg-admin-header-icon"><Code2 size={22} /></div>
        <div style={{ flex: 1 }}><h1 className="reg-admin-title">Hiring Assessments</h1><p className="reg-admin-subtitle">Your assigned recruitment quizzes and coding tests use the same secure LMS assessment experience.</p></div>
        <button className="reg-admin-btn reg-admin-btn--secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {!items.length ? (
        <div className="reg-admin-section reg-admin-empty" style={{ padding: 56, background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0' }}>
          <FileQuestion size={38} />
          <h3>No hiring assessments assigned</h3>
          <p>Assigned recruitment assessments will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {items.map((item) => {
            const assessment = item.assessment || {}
            const isCoding = assessment.assessment_type === 'CODING'
            const assignmentState = String(item.assignment_status || 'ASSIGNED').toUpperCase()
            const attemptState = String(item.attempt?.status || '').toUpperCase()
            const stateCode = attemptState || assignmentState
            const done = completedStatuses.has(stateCode)
            const blocked = blockedStatuses.has(stateCode)
            const inProgress = stateCode === 'IN_PROGRESS'
            const Icon = isCoding ? Code2 : FileQuestion
            return (
              <article
                key={item.assignment_id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 14,
                  padding: '22px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 235,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.2s ease',
                  ...(blocked ? { opacity: 0.78, background: '#F8FAFC' } : {})
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: isCoding ? '#EEF2FF' : '#ECFDF5', color: isCoding ? '#4F46E5' : '#059669' }}>
                    <Icon size={21} />
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: done ? '#DCFCE7' : inProgress ? '#FFEDD5' : blocked ? '#FEE2E2' : '#F1F5F9',
                    color: done ? '#15803D' : inProgress ? '#C2410C' : blocked ? '#B91C1C' : '#475569'
                  }}>
                    {stateCode.replaceAll('_', ' ')}
                  </span>
                </div>
                <h3 style={{ margin: '16px 0 6px', fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{assessment.title}</h3>
                <p style={{ margin: 0, color: '#64748B', fontSize: 13, lineHeight: 1.55, flex: 1 }}>{assessment.description || `${isCoding ? 'Coding' : 'Quiz'} screening assessment`}</p>
                <div style={{ display: 'flex', gap: 16, color: '#64748B', fontSize: 12, margin: '16px 0' }}>
                  <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Clock3 size={13} /> {assessment.duration_minutes || item.engine?.timeLimit || 60} min</span>
                  <span>{assessment.content_count || item.engine?.numQuestions || item.engine?.numProblems || 0} items</span>
                </div>
                {blocked ? (
                  <button className="reg-admin-btn" style={{ background: '#E2E8F0', color: '#64748B', cursor: 'not-allowed', width: '100%', justifyContent: 'center' }}>
                    {['REVOKED', 'DROPPED'].includes(stateCode) ? <AlertTriangle size={15} /> : <TimerOff size={15} />}
                    {stateCode === 'REVOKED' ? 'Assignment revoked' : stateCode === 'DROPPED' ? 'Assignment dropped' : 'Assessment expired'}
                  </button>
                ) : (
                  <button
                    className="reg-admin-btn reg-admin-btn--primary"
                    onClick={() => inProgress ? resume(item) : launch(item)}
                    disabled={starting === item.assignment_id}
                    style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    {starting === item.assignment_id ? <Loader2 size={15} className="bulk-spin" /> : done ? <CheckCircle2 size={15} /> : inProgress ? <Play size={15} /> : <Play size={15} />}
                    {done ? 'View result' : inProgress ? 'Resume assessment' : 'Start assessment'}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}

      {prelaunch && (
        <PrelaunchModal
          item={prelaunch}
          launching={launching}
          onClose={() => setPrelaunch(null)}
          onBegin={async (item) => {
            setLaunching(true)
            await startAssessment(item)
            setLaunching(false)
            setPrelaunch(null)
          }}
        />
      )}
    </section>
  )
}

function PrelaunchModal({ item, launching, onClose, onBegin }) {
  const assessment = item.assessment || {}
  const isCoding = assessment.assessment_type === 'CODING'
  const policy = assessment.proctoring_config || { enabled: true }
  const proctoringOn = Boolean(policy.enabled)

  const rows = [
    ['Duration', `${assessment.duration_minutes || item.engine?.timeLimit || 60} minutes`],
    ['Number of items', String(assessment.content_count || item.engine?.numQuestions || item.engine?.numProblems || 0)],
    ['Passing threshold', `${assessment.passing_score || item.engine?.passingPercentage || 50}%`],
    ['Attempts allowed', item.engine?.allowMultipleAttempts ? `${item.engine?.maxAttempts || 'Multiple'}` : '1 (single attempt)'],
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'grid',
        placeItems: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: 540,
          width: '100%',
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          border: '1px solid #E2E8F0',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: '#94A3B8',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Close"
        >
          <X size={18} />
        </button>

        <div style={{ padding: '28px 24px 0', textAlign: 'center' }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 14,
              margin: '0 auto 14px',
              display: 'grid',
              placeItems: 'center',
              background: isCoding ? '#EEF2FF' : '#ECFDF5',
              color: isCoding ? '#4F46E5' : '#059669'
            }}
          >
            {isCoding ? <Code2 size={26} /> : <FileQuestion size={26} />}
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-primary)' }}>
            {assessment.title}
          </h2>
          <p style={{ margin: '0 auto', color: '#64748B', fontSize: 13.5, maxWidth: 460, lineHeight: 1.55 }}>
            {assessment.instructions || assessment.description || 'Please read the instructions carefully before you begin.'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '20px 24px' }}>
          {rows.map(([label, value]) => (
            <div
              key={label}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: '14px 16px'
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {proctoringOn && (
          <div
            style={{
              margin: '0 24px 16px',
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid #FDE68A',
              background: '#FFFBEB',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start'
            }}
          >
            <ShieldCheck size={18} color="#B45309" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.55 }}>
              <strong style={{ color: '#78350F' }}>Proctoring is active.</strong> This assessment uses camera-based monitoring (identity verification, gaze and head tracking, and integrity reporting). Proceed with your camera on in a quiet, well-lit space.
            </div>
          </div>
        )}

        <div
          style={{
            padding: '16px 24px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            borderTop: '1px solid #F1F5F9',
            background: '#FAFAFA'
          }}
        >
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--secondary"
            onClick={onClose}
            disabled={launching}
            style={{ cursor: 'pointer', padding: '10px 20px', borderRadius: 10 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="reg-admin-btn reg-admin-btn--primary"
            onClick={() => onBegin(item)}
            disabled={launching}
            style={{ cursor: 'pointer', padding: '10px 22px', borderRadius: 10, background: '#16A34A', borderColor: '#16A34A' }}
          >
            {launching ? (
              <><Loader2 size={15} className="bulk-spin" /> Starting…</>
            ) : (
              <><Play size={15} /> Begin assessment</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}