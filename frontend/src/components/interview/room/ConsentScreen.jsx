/**
 * ConsentScreen
 * Step 3 (participant only). Explicit recording & monitoring consent before
 * the participant joins the signaling room.
 */
import InterviewShell from './InterviewShell'

const CONSENT_POINTS = [
  'Video and audio will be recorded from your camera and microphone',
  'Screen sharing content may be recorded if you enable it',
  'The interviewer can view your laptop and mobile camera feeds',
  'Activity logs (tab switches, code editor changes) are tracked',
  'Recordings are accessible only by authorized interviewers and admins',
]

export default function ConsentScreen({ onConsent, onDecline, isBusy }) {
  return (
    <InterviewShell
      headerRight={
        <button
          onClick={onDecline}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
        >
          Decline & Exit
        </button>
      }
    >
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-8 py-7 text-center border-b border-surface-100">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
            <span className="text-2xl">📹</span>
          </div>
          <h1 className="text-xl font-bold text-surface-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Recording & Monitoring Consent
          </h1>
          <p className="text-surface-500 text-sm leading-relaxed max-w-md mx-auto">
            This interview session will be recorded for quality and evaluation purposes.
            AI-based monitoring may be active to detect tab switches, copy/paste
            activity, and camera status changes.
          </p>
        </div>

        <div className="px-8 py-6">
          <div className="bg-primary-50 rounded-xl px-5 py-4 mb-6 border border-primary-100 space-y-2">
            {CONSENT_POINTS.map((point) => (
              <p key={point} className="text-sm text-surface-700 flex items-start gap-2">
                <span className="text-primary-600 font-bold leading-snug">•</span>
                <span>{point}</span>
              </p>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onDecline}
              className="px-5 py-3 bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-medium rounded-xl transition-colors"
            >
              Decline & Exit
            </button>
            <button
              onClick={onConsent}
              disabled={isBusy}
              className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-primary-600/25"
            >
              I Consent — Continue
            </button>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
