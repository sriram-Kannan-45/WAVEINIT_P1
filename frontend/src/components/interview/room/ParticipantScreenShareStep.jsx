/**
 * ParticipantScreenShareStep Component (Participant Step 3: Screen Share)
 * Prompts the participant to start sharing their screen before proceeding to fullscreen/room.
 */
import { Monitor, ArrowRight, ArrowLeft, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import InterviewShell from './InterviewShell'

export default function ParticipantScreenShareStep({
  interviewId,
  interviewData,
  isScreenSharing,
  onToggleScreenShare,
  onContinue,
  onSkip,
  onBack,
}) {
  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'Scheduled'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Screen Sharing`}
      step="Step 3 of 4"
      headerRight={
        onBack && (
          <button onClick={onBack} className="reg-admin-btn reg-admin-btn--secondary">
            Back
          </button>
        )
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 560, margin: '0 auto', background: '#fff' }}>
        {/* Card Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', width: 36, height: 36 }}>
            <Monitor size={18} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Step 3: Screen Share
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
              Share your screen for coding exercises and interview monitoring.
            </p>
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: '28px 24px', textAlign: 'center' }}>
          {isScreenSharing ? (
            /* Screen Share Active State */
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 12,
              padding: '24px 16px',
              marginBottom: 20,
            }}>
              <CheckCircle2 size={40} color="#16A34A" style={{ margin: '0 auto 10px' }} />
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#15803D', margin: '0 0 6px' }}>
                Screen Sharing is Active!
              </h4>
              <p style={{ fontSize: 12, color: '#166534', margin: '0 auto 14px', maxWidth: 380 }}>
                Your screen is currently being broadcast to the interviewer.
              </p>
              <button
                onClick={onToggleScreenShare}
                className="reg-admin-btn reg-admin-btn--secondary"
                style={{ fontSize: 12, padding: '6px 14px' }}
              >
                Stop or Change Screen
              </button>
            </div>
          ) : (
            /* Ready to Share State */
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '24px 16px',
              marginBottom: 20,
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(37,99,235,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <Monitor size={28} color="#2563eb" />
              </div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
                Start Screen Sharing
              </h4>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 auto 16px', maxWidth: 400, lineHeight: 1.5 }}>
                Click below to select and share your entire screen or window with the interviewer.
              </p>
              <button
                onClick={onToggleScreenShare}
                className="reg-admin-btn reg-admin-btn--primary"
                style={{
                  minHeight: 44,
                  padding: '10px 22px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Monitor size={16} />
                <span>Start Screen Share</span>
              </button>
            </div>
          )}

          {/* Action Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid #f1f5f9',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={onBack}
              className="reg-admin-btn reg-admin-btn--secondary"
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={15} /> Back
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!isScreenSharing && onSkip && (
                <button
                  onClick={onSkip}
                  className="reg-admin-btn reg-admin-btn--secondary"
                  style={{ minHeight: 44 }}
                  title="Proceed to interview without screen sharing"
                >
                  Skip for now
                </button>
              )}

              <button
                onClick={onContinue}
                className="reg-admin-btn reg-admin-btn--primary"
                style={{
                  padding: '10px 24px',
                  fontSize: 13,
                  fontWeight: 600,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>Continue</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
