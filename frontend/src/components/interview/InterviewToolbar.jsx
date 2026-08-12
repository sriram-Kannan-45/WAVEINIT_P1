/**
 * InterviewToolbar Component
 * Bottom toolbar with mic, camera, screen share, chat, settings, and end controls.
 * Dark theme to match video interview context.
 */
import { useState } from 'react'
import { LogOut, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Settings, Video, VideoOff } from 'lucide-react'

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
      className={`relative flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl transition-all duration-200
        ${danger
          ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/30'
          : active
            ? 'bg-slate-700 text-white border border-slate-600'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className="leading-none">{icon}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
    </button>
  )

  return (
    <div className={`flex items-center justify-center gap-1.5 p-3 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 ${className}`}>
      <ToolbarButton
        onClick={onToggleMute}
        active={!isMuted}
        icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        label={isMuted ? 'Unmute' : 'Mute'}
      />

      <ToolbarButton
        onClick={onToggleCamera}
        active={!isCameraOff}
        icon={isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
        label={isCameraOff ? 'Camera On' : 'Camera Off'}
      />

      <ToolbarButton
        onClick={onToggleScreenShare}
        active={isScreenSharing}
        icon={<MonitorUp size={20} />}
        label={isScreenSharing ? 'Stop Share' : 'Share'}
      />

      <ToolbarButton
        onClick={onToggleRecording}
        active={isRecording}
        icon={
          <div className={`w-4 h-4 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'border-2 border-current'}`} />
        }
        label={isRecording ? 'Stop Rec' : 'Record'}
      />

      <div className="w-px h-8 bg-slate-700 mx-1" />

      <ToolbarButton
        onClick={onToggleChat}
        active={isChatOpen}
        icon={<MessageSquare size={20} />}
        label="Chat"
      />

      <ToolbarButton
        onClick={() => setShowSettings(!showSettings)}
        icon={<Settings size={20} />}
        label="Settings"
      />

      {isInterviewer ? (
        <>
          <div className="w-px h-8 bg-slate-700 mx-1" />
          <ToolbarButton
            onClick={onEndInterview}
            danger
            icon={<PhoneOff size={20} />}
            label="End"
          />
        </>
      ) : onLeaveInterview ? (
        <>
          <div className="w-px h-8 bg-slate-700 mx-1" />
          <ToolbarButton
            onClick={onLeaveInterview}
            danger
            icon={<LogOut size={20} />}
            label="Leave"
          />
        </>
      ) : null}
    </div>
  )
}
