/**
 * FullscreenPromptStep Component (Step 3 of 3: Fullscreen Prompt)
 * Prompts the user to enter fullscreen mode before loading the final interview room,
 * with graceful fallback if declined or unsupported.
 */
import InterviewShell from './InterviewShell'
import { Maximize2, ArrowRight, ArrowLeft, Shield, Sparkles } from 'lucide-react'

export default function FullscreenPromptStep({
  interviewId,
  interviewData,
  isInterviewer,
  onEnterFullscreen,
  onSkipFullscreen,
  onBack,
}) {
  const handleFullscreenClick = async () => {
    try {
      if (document.documentElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
      }
    } catch (err) {
      console.warn('[INTERVIEW] Browser fullscreen request blocked or declined:', err.message)
    }
    onEnterFullscreen?.()
  }

  return (
    <InterviewShell
      interviewId={interviewId}
      title="Interview Room"
      statusBadge={interviewData?.status || 'Scheduled'}
      subtitle={`${interviewData?.type || 'HR'} Interview · Final Preparation`}
      step="Step 4 of 4"
      headerRight={
        onBack && (
          <button onClick={onBack} className="reg-admin-btn reg-admin-btn--secondary">
            Back
          </button>
        )
      }
    >
      <div className="reg-admin-table-wrap" style={{ maxWidth: 540, margin: '0 auto', background: '#fff' }}>
        {/* Card Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#f8fafc',
        }}>
          <div className="reg-admin-header-icon" style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)', width: 36, height: 36 }}>
            <Maximize2 size={18} color="#fff" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Step 4: Fullscreen Experience
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
              Maximize your screen for uninterrupted interview focus.
            </p>
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: '28px 24px', textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(22,163,74,0.12), rgba(34,197,94,0.18))',
            border: '1px solid rgba(22,163,74,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Maximize2 size={28} color="#16A34A" />
          </div>

          <h4 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Ready to Enter the Interview Room
          </h4>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 auto 24px', maxWidth: 420, lineHeight: 1.5 }}>
            Entering fullscreen mode removes browser distractions and ensures all video feeds, interview details, and notes fit seamlessly on your screen.
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxWidth: 340,
            margin: '0 auto',
          }}>
            <button
              onClick={handleFullscreenClick}
              className="reg-admin-btn reg-admin-btn--primary"
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                minHeight: 46,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(22,163,74,0.25)',
              }}
            >
              <Maximize2 size={16} />
              <span>Enter Fullscreen & Start</span>
            </button>

            <button
              onClick={onSkipFullscreen}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                padding: '8px 12px',
                textDecoration: 'underline',
                minHeight: 36,
              }}
            >
              Continue without Fullscreen
            </button>
          </div>

          {/* Back Action */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-start' }}>
            <button
              onClick={onBack}
              className="reg-admin-btn reg-admin-btn--secondary"
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={15} /> Back to QR Pairing
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
