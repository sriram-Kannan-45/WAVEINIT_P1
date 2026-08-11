/**
 * InterviewToolbar Component
 * Bottom toolbar with mic, camera, screen share, chat, settings, and end controls.
 * Dark theme to match video interview context.
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
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
    </button>
  )

  return (
    <div className={`flex items-center justify-center gap-1.5 p-3 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 ${className}`}>
      <ToolbarButton
        onClick={onToggleMute}
        active={!isMuted}
        icon={isMuted ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
        label={isMuted ? 'Unmute' : 'Mute'}
      />

      <ToolbarButton
        onClick={onToggleCamera}
        active={!isCameraOff}
        icon={isCameraOff ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        label={isCameraOff ? 'Camera On' : 'Camera Off'}
      />

      <ToolbarButton
        onClick={onToggleScreenShare}
        active={isScreenSharing}
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
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
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
        label="Chat"
      />

      <ToolbarButton
        onClick={() => setShowSettings(!showSettings)}
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        label="Settings"
      />

      {isInterviewer ? (
        <>
          <div className="w-px h-8 bg-slate-700 mx-1" />
          <ToolbarButton
            onClick={onEndInterview}
            danger
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            }
            label="End"
          />
        </>
      ) : onLeaveInterview ? (
        <>
          <div className="w-px h-8 bg-slate-700 mx-1" />
          <ToolbarButton
            onClick={onLeaveInterview}
            danger
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            }
            label="Leave"
          />
        </>
      ) : null}
    </div>
  )
}
