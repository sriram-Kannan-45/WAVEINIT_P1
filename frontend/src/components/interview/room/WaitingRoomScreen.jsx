/**
 * WaitingRoomScreen
 * Step 4 of the interview room flow. The participant has consented and joined
 * the signaling room. Participants see the mobile pairing QR; the interviewer
 * sees the candidate info + a Start button.
 */
import InterviewShell from './InterviewShell'
import QRPairing from '../QRPairing'

function StatusPill({ label, ok }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border ${
        ok
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-surface-50 text-surface-400 border-surface-200'
      }`}
    >
      <span className={`w-2 h-2 rounded-full bg-current ${ok ? '' : 'animate-pulse'}`} />
      {label}
    </div>
  )
}

export default function WaitingRoomScreen({
  isInterviewer,
  interviewData,
  qrPayload,
  onRefreshQr,
  localVideoRef,
  mediaState,
  devices,
  peerConnected,
  connectionStatus,
  notice,
  isStarting,
  onStartNow,
  onExit,
}) {
  const otherParty = isInterviewer
    ? interviewData?.candidate?.name || 'the participant'
    : interviewData?.interviewer?.name || 'the interviewer'
  const canStart = devices.laptop && devices.mobile

  return (
    <InterviewShell
      headerRight={
        <button
          onClick={onExit}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
        >
          {isInterviewer ? 'Leave Room' : 'Exit'}
        </button>
      }
    >
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-8 py-6 border-b border-surface-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-surface-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {isInterviewer ? 'Waiting for the participant' : 'You are in the waiting room'}
              </h1>
              <p className="text-surface-500 text-sm mt-1">
                {isInterviewer
                  ? `${otherParty} will connect here shortly.`
                  : `Waiting for ${otherParty} to start the interview.`}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary-700">
              <span className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
              {connectionStatus}
            </div>
          </div>
        </div>

        <div className="px-8 py-6 grid lg:grid-cols-2 gap-6">
          {/* QR pairing (participant) */}
          <div>
            {!isInterviewer && (
              <QRPairing
                qrPayload={qrPayload}
                onRefresh={onRefreshQr}
                expiresAt={qrPayload?.expiresAt}
              />
            )}
            {isInterviewer && (
              <div className="bg-surface-50 rounded-2xl border border-surface-200 p-5">
                <h3 className="text-surface-900 font-semibold text-sm mb-3">Interview details</h3>
                <p className="text-surface-500 text-xs">
                  {interviewData?.type || 'Technical'} Interview
                </p>
                <p className="text-surface-400 text-xs mt-1">
                  Candidate: {interviewData?.candidate?.name || '—'}
                </p>
                <p className="text-surface-400 text-xs mt-1">
                  Scheduled:{' '}
                  {interviewData?.scheduledAt
                    ? new Date(interviewData.scheduledAt).toLocaleString()
                    : '—'}
                </p>
              </div>
            )}

            {/* Device statuses */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <StatusPill label="Laptop connected" ok={devices.laptop} />
              <StatusPill label="Mobile camera" ok={devices.mobile} />
            </div>

            {notice && !isInterviewer && (
              <p className="mt-4 text-warning-600 text-xs">{notice}</p>
            )}

            {isInterviewer && (
              <>
                {notice && <p className="mt-4 text-warning-600 text-xs">{notice}</p>}
                <button
                  onClick={onStartNow}
                  disabled={isStarting}
                  className="mt-5 w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-primary-600/25"
                >
                  {isStarting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    '▶ Start Interview'
                  )}
                </button>
                <p className="text-surface-400 text-[11px] mt-2 text-center">
                  {canStart
                    ? 'Both devices are connected — you can start now.'
                    : 'Starts automatically once the participant connects their laptop and mobile.'}
                </p>
              </>
            )}
          </div>

          {/* Preview */}
          <div>
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-surface-200 shadow-card aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {mediaState !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
                  <div className="text-center text-white/80">
                    <div className="text-3xl mb-2">📷</div>
                    <p className="text-xs">Camera preview</p>
                  </div>
                </div>
              )}
              <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 rounded-lg text-white text-xs">
                You · live preview
              </span>
            </div>
            <p className="text-surface-400 text-[11px] mt-2 text-center">
              {peerConnected
                ? 'Connection established — the interview is ready to begin.'
                : 'Keep this tab open. The video starts when the other side connects.'}
            </p>
          </div>
        </div>
      </div>
    </InterviewShell>
  )
}
