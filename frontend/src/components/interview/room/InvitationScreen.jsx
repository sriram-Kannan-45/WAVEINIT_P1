/**
 * InvitationScreen
 * Step 1 of the interview room flow. Shows interview details and a single
 * call to action (Join for participants, Start for interviewers).
 * Also used when a user deep-links into /interview/:id/join.
 */
import InterviewShell from './InterviewShell'

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
      <span className="text-surface-400 text-sm">{label}</span>
      <span className="font-medium text-surface-900 text-sm text-right">{value || '—'}</span>
    </div>
  )
}

export default function InvitationScreen({
  interviewData,
  isInterviewer,
  isBusy,
  isTerminal,
  onContinue,
  onExit,
}) {
  const candidate = interviewData?.candidate?.name
  const interviewer = interviewData?.interviewer?.name
  const scheduledAt = interviewData?.scheduledAt

  return (
    <InterviewShell
      headerRight={
        <button
          onClick={onExit}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
        >
          Exit
        </button>
      }
    >
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-8 py-10 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {isInterviewer ? 'Interview Room' : "You're invited to an Interview"}
          </h1>
          <p className="text-indigo-100 text-sm">
            {interviewData?.type || 'Interview'}
            {interviewer ? ` with ${interviewer}` : ''}
            {scheduledAt ? ` · ${new Date(scheduledAt).toLocaleString()}` : ''}
          </p>
        </div>

        <div className="px-8 py-6">
          <div className="bg-surface-50 rounded-xl px-5 py-3 border border-surface-200 mb-6">
            <DetailRow label="Candidate" value={isInterviewer ? candidate : 'You'} />
            <DetailRow label="Interviewer" value={isInterviewer ? 'You' : interviewer} />
            <DetailRow label="Type" value={interviewData?.type || 'Interview'} />
            <DetailRow label="Scheduled" value={scheduledAt ? new Date(scheduledAt).toLocaleString() : '—'} />
            <DetailRow label="Duration" value={`${interviewData?.durationMinutes || 60} minutes`} />
            {interviewData?.description && (
              <p className="text-surface-500 text-xs mt-3">{interviewData.description}</p>
            )}
          </div>

          {isTerminal && (
            <p className="text-warning-600 text-sm text-center mb-4">
              This interview has already been{' '}
              {interviewData?.status?.replace('_', ' ').toLowerCase()}.
            </p>
          )}

          <button
            onClick={onContinue}
            disabled={isBusy || isTerminal}
            className="w-full px-6 py-3.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-primary-600/25"
          >
            {isBusy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isInterviewer ? 'Preparing room...' : 'Joining...'}
              </span>
            ) : (
              <span>{isInterviewer ? '▶ Start Interview' : '▶ Join Interview'}</span>
            )}
          </button>

          <p className="text-surface-400 text-xs text-center mt-4">
            {isInterviewer
              ? 'You will check your camera and microphone before starting.'
              : 'You will review your camera, microphone, and monitoring consent before joining.'}
          </p>
        </div>
      </div>
    </InterviewShell>
  )
}
