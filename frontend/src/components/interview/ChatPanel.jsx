/**
 * ChatPanel Component
 * In-interview text chat with timestamps and message list.
 */
import { useState, useRef, useEffect } from 'react'

export default function ChatPanel({ messages, onSendMessage, currentUserId, isOpen, onClose }) {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-surface-200 w-80 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
        <h3 className="text-surface-900 font-semibold text-sm">Interview Chat</h3>
        <button onClick={onClose} className="text-surface-400 hover:text-surface-700 text-lg leading-none">×</button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-surface-50/60">
        {messages.length === 0 && (
          <div className="text-center text-surface-400 text-xs py-8">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.fromUserId === currentUserId ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[10px] text-surface-400 mb-0.5">
              {msg.fromUserName || 'You'} · {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
            </span>
            <div
              className={`max-w-[85%] px-3 py-1.5 rounded-xl text-sm ${
                msg.fromUserId === currentUserId
                  ? 'bg-primary-600 text-white rounded-br-sm'
                  : 'bg-white text-surface-700 border border-surface-200 rounded-bl-sm shadow-xs'
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-surface-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-surface-900 text-sm placeholder-surface-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-surface-300 text-white text-sm rounded-lg transition-colors"
          >
            →
          </button>
        </div>
      </form>
    </div>
  )
}
