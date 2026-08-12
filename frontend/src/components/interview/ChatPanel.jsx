/**
 * ChatPanel Component
 * In-interview text chat with timestamps and message list.
 * Dark theme to match interview context.
 */
import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, X } from 'lucide-react'

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
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700/50 w-80 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/90">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-slate-400" />
          <h3 className="text-white font-semibold text-sm">Interview Chat</h3>
        </div>
        <button 
          onClick={onClose} 
          className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700/50"
          aria-label="Close chat"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-900/50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-2">
              <MessageSquare size={22} className="text-slate-600" />
            </div>
            <p className="text-slate-500 text-xs">No messages yet</p>
            <p className="text-slate-600 text-[10px] mt-1">Start the conversation</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={msg.id || idx}
            className={`flex flex-col ${msg.fromUserId === currentUserId ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-slate-500 font-medium">
                {msg.fromUserName || 'You'}
              </span>
              <span className="text-[10px] text-slate-600">·</span>
              <span className="text-[10px] text-slate-600">
                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                msg.fromUserId === currentUserId
                  ? 'bg-primary-600 text-white rounded-br-sm shadow-lg shadow-primary-900/30'
                  : 'bg-slate-800 text-slate-200 border border-slate-700/50 rounded-bl-sm'
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700/50 bg-slate-800/90">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center min-w-[44px]"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}
