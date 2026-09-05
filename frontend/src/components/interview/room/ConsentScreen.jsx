/**
 * ConsentScreen Component (Stage 3: Recording & Monitoring Consent)
 * Standard LMS consent modal / card step.
 */
import InterviewShell from './InterviewShell'
import { ShieldCheck, Check, AlertTriangle, XCircle } from 'lucide-react'

const CONSENT_POINTS = [
  'Your camera and microphone are used for the live interview. Recording is available when enabled for this session.',
  'Screen sharing content may be recorded if screen share is activated.',
  'Camera and microphone inputs are monitored for identity and presence verification.',
  'Tab changes, copy/paste events, and system activity may be logged for audit purposes.',
  'Interview recordings and logs are available through the LMS to authorized session users.',
]

export default function ConsentScreen({ onConsent, onDecline, isBusy, error, interviewId }) {
  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge="Consent Required"
      subtitle="Recording & Monitoring Agreement"
      step="Stage 2 of 4"
      headerRight={
        <button
          onClick={onDecline}
          disabled={isBusy}
          className="reg-admin-btn reg-admin-btn--secondary"
        >
          Decline & Exit
        </button>
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 760, margin: '0 auto', background: '#fff' }}>
        {/* Card Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A' }}>
            <ShieldCheck size={22} color="#16A34A" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Recording & Monitoring Consent
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
              Please review and accept the session recording and activity monitoring policy.
            </p>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {error && (
            <div style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              fontSize: 13,
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            {CONSENT_POINTS.map((point, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#16A34A',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  <Check size={12} strokeWidth={3} />
                </div>
                <span style={{ fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                  {point}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={onDecline}
              disabled={isBusy}
              className="reg-admin-btn reg-admin-btn--secondary"
            >
              Decline & Exit
            </button>

            <button
              onClick={onConsent}
              disabled={isBusy}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{ padding: '10px 24px', fontSize: 14 }}
            >
              {isBusy ? (
                <span>Recording consent...</span>
              ) : (
                <span>I Consent — Continue</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
