/**
 * InvitationScreen Component (Stage 2: Interview Details)
 * Displays interview details card within standard LMS design system.
 */
import InterviewShell from './InterviewShell'
import { Play, Video, User, Calendar, Clock, FileText, ArrowRight, XCircle } from 'lucide-react'

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

export default function InvitationScreen({
  interviewData,
  isInterviewer,
  isBusy,
  isTerminal,
  onContinue,
  onExit,
}) {
  const interviewId = interviewData?.id
  const candidate = interviewData?.candidate?.name || '—'
  const candidateEmail = interviewData?.candidate?.email || ''
  const interviewer = interviewData?.interviewer?.name || '—'
  const interviewerEmail = interviewData?.interviewer?.email || ''
  const scheduled = formatDate(
    interviewData?.scheduledAt ?? interviewData?.scheduled_at ?? null
  )
  const duration =
    interviewData?.durationMinutes ?? interviewData?.duration_minutes ?? 60

  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'Scheduled'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Interview #${interviewId || '13'}`}
      step="Stage 1 of 4"
      headerRight={
        <button
          onClick={onExit}
          className="reg-admin-btn reg-admin-btn--secondary"
        >
          Back to Interviews
        </button>
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 840, margin: '0 auto', background: '#fff' }}>
        {/* Header bar inside card */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}>
            <Video size={20} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Interview Details Card
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
              {isInterviewer
                ? 'Review the details and click Start Interview when ready.'
                : 'Review your scheduled interview details before joining.'}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div style={{ padding: 24 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Candidate
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{candidate}</div>
              {candidateEmail && <div style={{ fontSize: 12, color: '#64748b' }}>{candidateEmail}</div>}
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Interviewer
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{interviewer}</div>
              {interviewerEmail && <div style={{ fontSize: 12, color: '#64748b' }}>{interviewerEmail}</div>}
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Interview Type
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                {interviewData?.type || 'HR'} Interview
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Date
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                {scheduled ? scheduled.date : '—'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Time
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                {scheduled ? scheduled.time : '—'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Duration
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                {duration} minutes
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                Status
              </span>
              <span className="reg-admin-status" style={{
                background: interviewData?.status === 'IN_PROGRESS' ? '#fef3c7' : '#dcfce7',
                color: interviewData?.status === 'IN_PROGRESS' ? '#d97706' : '#15803D',
                borderColor: interviewData?.status === 'IN_PROGRESS' ? '#fcd34d' : '#bbf7d0',
                fontWeight: 600,
                fontSize: 12,
              }}>
                {interviewData?.status?.replace('_', ' ') || 'Scheduled'}
              </span>
            </div>

            {interviewData?.meeting_type && (
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
                  Meeting Type
                </span>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>
                  {interviewData.meeting_type.replace('_', ' ')}
                </div>
              </div>
            )}
          </div>

          {interviewData?.description && (
            <div style={{ marginBottom: 20, padding: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Notes / Instructions
              </span>
              <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>{interviewData.description}</p>
            </div>
          )}

          {isTerminal && (
            <div style={{
              padding: 12,
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 13,
              textAlign: 'center',
              marginBottom: 20,
              fontWeight: 500,
            }}>
              This interview has been {interviewData?.status?.replace('_', ' ').toLowerCase()}.
            </div>
          )}

          {/* Action Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={onExit}
              className="reg-admin-btn reg-admin-btn--secondary"
            >
              Cancel
            </button>

            <button
              onClick={onContinue}
              disabled={isBusy || isTerminal}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{ padding: '10px 24px', fontSize: 14 }}
            >
              {isBusy ? (
                <span>Preparing...</span>
              ) : (
                <>
                  <Play size={16} fill="currentColor" />
                  <span>{isInterviewer ? 'Start Interview' : 'Join Interview'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
