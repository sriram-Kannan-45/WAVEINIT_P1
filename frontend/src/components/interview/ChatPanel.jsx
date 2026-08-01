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
    <div className="flex flex-col h-full bg-gray-800/95 backdrop-blur-sm border-l border-gray-700/50 w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <h3 className="text-white font-semibold text-sm">Interview Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">×</button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-8">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.fromUserId === currentUserId ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[10px] text-gray-400 mb-0.5">
              {msg.fromUserName || 'You'} · {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
            </span>
            <div
              className={`max-w-[85%] px-3 py-1.5 rounded-xl text-sm ${
                msg.fromUserId === currentUserId
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-700 text-gray-100 rounded-bl-sm'
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            →
          </button>
        </div>
      </form>
    </div>
  )
}
