/**
 * ActiveRoom
 * The live interview UI (step 5). Video grid, shared code editor, chat,
 * recording, device statuses, and the end/leave controls.
 *
 * Handles multiple remote peers: the interviewer sees the participant's laptop
 * feed plus their paired mobile camera feed.
 *
 * Layout: CSS Grid with fixed header/footer and flexible content area.
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
    <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-lg aspect-video">
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      {mediaState !== 'ready' && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-slate-400 text-xs">Camera not ready</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent z-10">
        <span className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded-md text-white text-xs font-medium">
          {label}
        </span>
      </div>
      {isCameraOff && (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center z-20">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyTile({ icon, title, subtitle }) {
  return (
    <div className="relative rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col items-center justify-center aspect-video">
      <span className="text-2xl mb-1">{icon}</span>
      <p className="text-slate-400 text-xs">{title}</p>
      {subtitle && <p className="text-slate-500 text-[10px] mt-1">{subtitle}</p>}
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
    <div className="h-screen w-screen overflow-hidden bg-slate-900 grid grid-rows-[auto_auto_1fr_auto]">
      {/* Status strip */}
      <StatusStrip
        devices={devices}
        isCameraActive={!isCameraOff}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        alertCount={alerts.length}
      />

      {/* Connection + timer bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700/50">
        <div className={`flex items-center gap-2 text-xs font-medium ${
          peerConnected ? 'text-emerald-400' : 'text-amber-400'
        }`}>
          <span className={`w-2 h-2 rounded-full bg-current ${peerConnected ? '' : 'animate-pulse'}`} />
          <span>{connectionStatus}</span>
          {isInterviewer && notice && (
            <span className="text-slate-400 normal-case font-normal ml-1">· {notice}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-lg">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-mono text-base font-semibold text-white">{formatTime(elapsed)}</span>
          </div>
          <span className="text-slate-400 text-xs hidden sm:block">
            {interviewData?.type || 'Interview'} · {interviewData?.durationMinutes || 60} min
          </span>
        </div>
      </div>

      {/* Main content area - CSS Grid */}
      <div className="min-h-0 overflow-hidden grid grid-cols-[auto_1fr_auto] lg:grid-cols-[280px_1fr_320px]">
        {/* Left sidebar (interviewer info / QR) */}
        <div className="hidden lg:flex flex-col bg-slate-800/50 border-r border-slate-700/50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700/50">
            <h3 className="text-white font-semibold text-sm mb-3">
              {isInterviewer ? 'Candidate Info' : 'Interviewer'}
            </h3>
            <div className="space-y-2">
              <div>
                <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Name</p>
                <p className="text-slate-200 text-sm">
                  {isInterviewer
                    ? interviewData?.candidate?.name || '—'
                    : interviewData?.interviewer?.name || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Type</p>
                <p className="text-slate-200 text-sm">{interviewData?.type || 'Technical'} Interview</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Scheduled</p>
                <p className="text-slate-200 text-xs">
                  {interviewData?.scheduledAt ? new Date(interviewData.scheduledAt).toLocaleString() : '—'}
                </p>
              </div>
            </div>
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
        <div className="flex flex-col min-h-0 overflow-hidden p-4 gap-4">
          {/* Video grid - fixed height */}
          <div
            className={`grid gap-3 flex-shrink-0 ${
              isInterviewer && remoteTiles.length >= 1 ? 'grid-cols-3' : 'grid-cols-2'
            }`}
            style={{ height: 'min(240px, 28vh)' }}
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

            {/* Waiting for peer */}
            {!isInterviewer && !remoteTiles.length && (
              <EmptyTile
                icon="👤"
                title={`Waiting for ${isInterviewer ? 'participant' : 'interviewer'}`}
                subtitle={connectionStatus}
              />
            )}

            {/* Mobile camera status */}
            {!isInterviewer && (
              devices.mobile ? (
                <EmptyTile icon="📱" title="Mobile connected" subtitle="Your phone is streaming" />
              ) : (
                <EmptyTile
                  icon="📱"
                  title="Mobile not connected"
                  subtitle="Scan QR to pair your phone"
                />
              )
            )}
          </div>

          {/* Shared code editor - fills remaining space */}
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
