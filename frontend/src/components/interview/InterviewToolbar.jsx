/**
 * InterviewToolbar Component
 * Bottom toolbar with mic, camera, screen share, chat, settings, and end controls.
 */
import { useState } from 'react'

export default function InterviewToolbar({
  isMuted,
  onToggleMute,
  isCameraOff,
  onToggleCamera,
  isScreenSharing,
  onToggleScreenShare,
  isChatOpen,
  onToggleChat,
  isRecording,
  onToggleRecording,
  onEndInterview,
  onLeaveInterview,
  isInterviewer,
  className = '',
}) {
  const [showSettings, setShowSettings] = useState(false)

  const ToolbarButton = ({ onClick, active, danger, icon, label, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200
        ${danger
          ? 'bg-danger-600 hover:bg-danger-700 text-white shadow-card'
          : active
            ? 'bg-primary-50 text-primary-700 border border-primary-200'
            : 'bg-surface-100 hover:bg-surface-200 text-surface-600 hover:text-surface-900 border border-transparent'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )

  return (
    <div className={`flex items-center justify-center gap-2 p-3 bg-white/90 backdrop-blur-sm border-t border-surface-200 shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] ${className}`}>
      <ToolbarButton
        onClick={onToggleMute}
        active={!isMuted}
        icon={isMuted ? '🔇' : '🎤'}
        label={isMuted ? 'Unmute' : 'Mute'}
      />

      <ToolbarButton
        onClick={onToggleCamera}
        active={!isCameraOff}
        icon={isCameraOff ? '📷' : '📹'}
        label={isCameraOff ? 'Camera On' : 'Camera Off'}
      />

      <ToolbarButton
        onClick={onToggleScreenShare}
        active={isScreenSharing}
        icon={isScreenSharing ? '🖥️' : '📱'}
        label={isScreenSharing ? 'Stop Share' : 'Share Screen'}
      />

      <ToolbarButton
        onClick={onToggleRecording}
        active={isRecording}
        icon={isRecording ? '⏹️' : '⏺️'}
        label={isRecording ? 'Stop Rec' : 'Record'}
      />

      <div className="w-px h-8 bg-surface-200 mx-1" />

      <ToolbarButton
        onClick={onToggleChat}
        active={isChatOpen}
        icon="💬"
        label="Chat"
      />

      <ToolbarButton
        onClick={() => setShowSettings(!showSettings)}
        icon="⚙️"
        label="Settings"
      />

      {isInterviewer ? (
        <>
          <div className="w-px h-8 bg-surface-200 mx-1" />
          <ToolbarButton
            onClick={onEndInterview}
            danger
            icon="🔴"
            label="End"
          />
        </>
      ) : onLeaveInterview ? (
        <>
          <div className="w-px h-8 bg-surface-200 mx-1" />
          <ToolbarButton
            onClick={onLeaveInterview}
            danger
            icon="🔴"
            label="Leave"
          />
        </>
      ) : null}
    </div>
  )
}
