/**
 * ActiveRoom
 * The live interview UI (step 5). Video grid, shared code editor, chat,
 * recording, device statuses, and the end/leave controls.
 *
 * Handles multiple remote peers: the interviewer sees the participant's laptop
 * feed plus their paired mobile camera feed.
 */
import { motion } from 'framer-motion'
import ChatPanel from '../ChatPanel'
import InterviewToolbar from '../InterviewToolbar'
import QRPairing from '../QRPairing'
import SharedCodeEditor from '../SharedCodeEditor'
import StatusStrip from '../StatusStrip'
import VideoTile from '../VideoTile'

function SelfTile({ localVideoRef, mediaState, isCameraOff, label }) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-surface-200 shadow-card">
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full min-h-[180px] object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      {mediaState !== 'ready' && (
        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl mb-1">🚫</div>
            <p className="text-white/80 text-xs">Camera not ready</p>
          </div>
        </div>
      )}
      <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded-lg text-white text-xs">
        {label}
      </span>
      {isCameraOff && (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
          <span className="text-3xl">📷</span>
        </div>
      )}
    </div>
  )
}

function EmptyTile({ icon, title, subtitle }) {
  return (
    <div className="relative rounded-2xl bg-white border border-dashed border-surface-300 shadow-card flex flex-col items-center justify-center min-h-[180px]">
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-surface-500 text-xs">{title}</p>
      {subtitle && <p className="text-surface-400 text-[10px] mt-1">{subtitle}</p>}
    </div>
  )
}

export default function ActiveRoom({
  interviewData,
  isInterviewer,
  user,
  localVideoRef,
  mediaState,
  remoteStreams,
  peers,
  devices,
  qrPayload,
  onRefreshQr,
  isMuted,
  onToggleMute,
  isCameraOff,
  onToggleCamera,
  isScreenSharing,
  onToggleScreenShare,
  isRecording,
  onToggleRecording,
  isChatOpen,
  onToggleChat,
  chatMessages,
  onSendMessage,
  alerts,
  elapsed,
  formatTime,
  peerConnected,
  connectionStatus,
  notice,
  handleEndInterview,
  handleLeaveInterview,
  socket,
  interviewId,
  sessionId,
  expandedTile,
  onToggleTile,
}) {
  const meLabel = isInterviewer ? `You (Trainer)` : `You (Participant)`

  const remoteEntries = Object.entries(remoteStreams)
  const remoteTiles = remoteEntries.map(([socketId, stream]) => {
    const peer = peers.find((p) => p.socketId === socketId)
    const isMobile = peer?.deviceType === 'MOBILE'
    const label = isMobile
      ? `${peer?.userName || 'Participant'}'s mobile camera`
      : peer?.userName || (isInterviewer ? 'Participant' : 'Trainer')
    return { key: socketId, stream, label, isMobile }
  })
  // Interviewer side: show the participant's laptop feed first, mobile last.
  if (isInterviewer) {
    remoteTiles.sort((a, b) => Number(a.isMobile) - Number(b.isMobile))
  }

  return (
    <div className="h-screen w-full flex flex-col bg-surface-50 overflow-hidden">
      <StatusStrip
        devices={devices}
        isCameraActive={!isCameraOff}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        alertCount={alerts.length}
      />

      {/* Connection + timer bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white/80 border-b border-surface-200">
        <div className={`flex items-center gap-2 text-xs font-medium ${
          peerConnected ? 'text-primary-700' : 'text-warning-600'
        }`}>
          <span className={`w-2 h-2 rounded-full bg-current ${peerConnected ? '' : 'animate-pulse'}`} />
          <span>{connectionStatus}</span>
          {isInterviewer && notice && (
            <span className="text-surface-400 normal-case font-normal">· {notice}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-surface-900">⏱️ {formatTime(elapsed)}</span>
          <span className="text-surface-400 text-xs">
            {interviewData?.type || 'Interview'} · {interviewData?.durationMinutes || 60} min
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar (interviewer info / QR) */}
        <div className="hidden lg:flex flex-col w-64 bg-white border-r border-surface-200 p-4 overflow-y-auto">
          <div className="bg-surface-50 rounded-xl p-4 mb-4 border border-surface-200">
            <h3 className="text-surface-900 font-semibold text-sm mb-2">
              {isInterviewer ? 'Candidate Info' : 'Interviewer'}
            </h3>
            <p className="text-surface-500 text-xs">
              {isInterviewer
                ? interviewData?.candidate?.name || '—'
                : interviewData?.interviewer?.name || '—'}
            </p>
            <p className="text-surface-400 text-xs mt-1">{interviewData?.type || 'Technical'} Interview</p>
            <p className="text-surface-400 text-xs mt-1">
              Scheduled:{' '}
              {interviewData?.scheduledAt ? new Date(interviewData.scheduledAt).toLocaleString() : '—'}
            </p>
          </div>

          {!isInterviewer && qrPayload && (
            <QRPairing
              qrPayload={qrPayload}
              onRefresh={onRefreshQr}
              expiresAt={qrPayload?.expiresAt}
            />
          )}
        </div>

        {/* Center — work area */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {/* Video grid */}
          <div
            className={`grid gap-3 flex-shrink-0 ${
              isInterviewer && remoteTiles.length >= 1 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'
            }`}
            style={{ maxHeight: '42%' }}
          >
            <SelfTile
              localVideoRef={localVideoRef}
              mediaState={mediaState}
              isCameraOff={isCameraOff}
              label={meLabel}
            />

            {remoteTiles.map((tile) => (
              <VideoTile
                key={tile.key}
                stream={tile.stream}
                label={tile.label}
                isExpanded={expandedTile === tile.key}
                onToggleExpand={() => onToggleTile(tile.key)}
                isScreenShare={isScreenSharing && !isInterviewer}
              />
            ))}

            {/* Mobile camera status for the participant (their phone is remote to the interviewer only) */}
            {!isInterviewer && !remoteTiles.length && (
              <EmptyTile
                icon="👤"
                title={`Waiting for ${isInterviewer ? 'participant' : 'interviewer'} video`}
                subtitle={`Connection status: ${connectionStatus}`}
              />
            )}

            {!isInterviewer && (
              devices.mobile ? (
                <EmptyTile icon="📱" title="Mobile camera connected" subtitle="Your phone is streaming." />
              ) : (
                <EmptyTile
                  icon="📱"
                  title="Mobile camera not connected"
                  subtitle="Use the QR code to pair your phone."
                />
              )
            )}
          </div>

          {/* Shared code editor */}
          <div className="flex-1 min-h-0">
            <SharedCodeEditor
              socket={socket}
              interviewId={interviewId}
              sessionId={sessionId}
              readOnly={false}
            />
          </div>
        </div>

        {/* Chat panel */}
        <ChatPanel
          messages={chatMessages}
          onSendMessage={onSendMessage}
          currentUserId={user?.id}
          isOpen={isChatOpen}
          onClose={() => onToggleChat(false)}
        />
      </div>

      {/* Bottom toolbar */}
      <InterviewToolbar
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        isCameraOff={isCameraOff}
        onToggleCamera={onToggleCamera}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={onToggleScreenShare}
        isChatOpen={isChatOpen}
        onToggleChat={() => onToggleChat(!isChatOpen)}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
        onEndInterview={handleEndInterview}
        onLeaveInterview={isInterviewer ? undefined : handleLeaveInterview}
        isInterviewer={isInterviewer}
      />
    </div>
  )
}
