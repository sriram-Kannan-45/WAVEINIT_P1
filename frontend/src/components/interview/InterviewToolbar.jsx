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
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : active
            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
            : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 hover:text-white border border-transparent'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )

  return (
    <div className={`flex items-center justify-center gap-2 p-3 bg-gray-900/80 backdrop-blur-sm border-t border-gray-700/50 ${className}`}>
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

      <div className="w-px h-8 bg-gray-700 mx-1" />

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

      {isInterviewer && (
        <>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <ToolbarButton
            onClick={onEndInterview}
            danger
            icon="🔴"
            label="End"
          />
        </>
      )}
    </div>
  )
}
