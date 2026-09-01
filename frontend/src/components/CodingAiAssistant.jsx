import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
  Sparkles,
  Send,
  Loader2,
  ShieldCheck,
  Lock,
  Lightbulb,
  Compass,
  Code2,
  HelpCircle,
  AlertCircle,
  FileText,
} from 'lucide-react'
import { API_BASE } from '../api/api'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

const ASSISTANCE_LEVELS = [
  { level: 1, label: 'Level 1: Hint', icon: Lightbulb, color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', desc: 'A small guiding clue without spoiling the logic' },
  { level: 2, label: 'Level 2: Approach', icon: Compass, color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Algorithmic strategy & step-by-step logic in English' },
  { level: 3, label: 'Level 3: Code Guidance', icon: Code2, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', desc: 'Targeted feedback on your code & small syntax pointers' },
]

const QUICK_ACTIONS = [
  { action: 'hint', level: 1, label: '💡 Give me a hint', prompt: 'Can you give me a small hint to point me in the right direction?' },
  { action: 'approach', level: 2, label: '🧭 Suggest an approach', prompt: 'What is the recommended algorithmic approach or structure to solve this problem?' },
  { action: 'explain_problem', level: 2, label: '🔍 Explain this problem', prompt: 'Can you explain the problem statement and goal in simple terms?' },
  { action: 'explain_io', level: 1, label: '📥 Explain input / output', prompt: 'How does the input format relate to the expected output format for this problem?' },
  { action: 'explain_error', level: 3, label: '⚠️ Help me understand my error', prompt: 'My code failed a test case or generated an error. Can you help me understand why?' },
  { action: 'code_guidance', level: 3, label: '🛠️ Guide my code', prompt: 'Take a look at my current code and guide me on what step to fix next.' },
]

export default function CodingAiAssistant({
  user, attemptId, problem, questionState, sessionToken, onError,
}) {
  const [enabled, setEnabled] = useState(true)
  const [limit, setLimit] = useState(1)
  const [used, setUsed] = useState(0)
  const [unlimited, setUnlimited] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState(1)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const listRef = useRef(null)

  const pId = problem?.id

  const loadStatus = useCallback(async () => {
    if (!user?.token || !attemptId || !pId) return
    setStatusLoading(true)
    try {
      const res = await fetch(`${API_BASE}/coding/participant/assist/status/${attemptId}/${pId}`, {
        headers: authHeaders(user.token),
      })
      const data = await res.json()
      if (res.ok && data) {
        setEnabled(data.enabled !== false)
        setLimit(Number(data.limit) || 1)
        setUsed(Number(data.used) || 0)
        setUnlimited(data.unlimited === true)
      }
    } catch (_) {} finally {
      setStatusLoading(false)
    }
  }, [user?.token, attemptId, pId])

  useEffect(() => {
    setMessages([])
    setInput('')
    loadStatus()
  }, [pId, loadStatus])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  if (!enabled) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Lock size={20} color="#CBD5E1" />
        <div>AI assistant is disabled for this assessment.</div>
      </div>
    )
  }

  const remaining = unlimited ? -1 : Math.max(0, limit - used)

  const ask = async (customPrompt, overrideLevel = selectedLevel, action = 'custom') => {
    const question = (customPrompt || input || '').trim()
    if (!question || loading || (remaining !== -1 && remaining <= 0)) {
      if (remaining !== -1 && remaining <= 0) {
        onError?.('You have used all your AI assistant help for this question.')
      }
      return
    }

    setLoading(true)
    const userMsg = { role: 'user', text: question, level: overrideLevel }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken
      const res = await fetch(`${API_BASE}/coding/participant/assist`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          attemptId: Number(attemptId),
          problemId: pId,
          code: questionState?.code || '',
          language: questionState?.language || problem?.programmingLanguage || 'javascript',
          question,
          level: overrideLevel,
          action,
          errorContext: questionState?.output || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setUsed(data.remaining === 0 ? limit : used)
        }
        throw new Error(data.error || data.response || 'AI assistant unavailable')
      }
      setUsed(Number(data.usageUsed) || used + 1)
      if (data.unlimited != null) setUnlimited(data.unlimited === true)
      if (data.usageLimit != null) setLimit(Number(data.usageLimit))
      setMessages(prev => [...prev, { role: 'assistant', text: data.response || '(no response)', level: overrideLevel }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: '', error: err.message }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#FFFFFF' }}>
      {/* Top Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAF9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={14} color="#7C3AED" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>AI Coding Assistant</span>
          <span style={{ fontSize: 11, background: '#EDE9FE', color: '#6D28D9', padding: '1px 7px', borderRadius: 999, fontWeight: 600 }}>Socratic</span>
        </div>

        <div>
          {statusLoading ? (
            <Loader2 size={12} className="animate-spin text-emerald-600" />
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: remaining !== -1 && remaining <= 0 ? '#DC2626' : '#15803D' }}>
              <ShieldCheck size={12} />
              {unlimited ? 'Unlimited' : `${Math.max(0, remaining)}/${limit} hint${limit === 1 ? '' : 's'} left`}
            </span>
          )}
        </div>
      </div>

      {/* Assistance Level Selector */}
      <div style={{ padding: '6px 14px', background: '#FAFAFA', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginRight: 4 }}>Level:</span>
        {ASSISTANCE_LEVELS.map(lvl => {
          const Icon = lvl.icon
          const isSel = selectedLevel === lvl.level
          return (
            <button
              key={lvl.level}
              type="button"
              onClick={() => setSelectedLevel(lvl.level)}
              title={lvl.desc}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer',
                background: isSel ? lvl.bg : '#FFFFFF',
                color: isSel ? lvl.color : '#64748B',
                border: isSel ? `1px solid ${lvl.border}` : '1px solid #E2E8F0',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={12} color={isSel ? lvl.color : '#94A3B8'} />
              {lvl.label}
            </button>
          )
        })}
      </div>

      {/* Messages Scroll Area */}
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, background: '#F8FAF9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10 }}>
          💡 <strong>Guiding Policy</strong>: I am your Socratic AI coding coach. I will provide hints, step-by-step algorithms, or debug guidance — but I will never write the full solution for you or reveal hidden test cases.
        </div>

        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            {m.error ? (
              <div style={{ fontSize: 12.5, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 10, border: '1px solid #FECACA' }}>
                {m.error}
              </div>
            ) : (
              <div style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                padding: '10px 14px',
                borderRadius: 12,
                background: m.role === 'user' ? '#EDE9FE' : '#F8FAFC',
                border: `1px solid ${m.role === 'user' ? '#DDD6FE' : '#E2E8F0'}`,
                color: '#1E293B',
              }}>
                {m.text}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, color: '#7C3AED', fontSize: 12, fontWeight: 600 }}>
            <Loader2 size={13} className="animate-spin text-violet-600" /> Generating Socratic guidance...
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div style={{ padding: '8px 14px', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUICK_ACTIONS.map(qa => (
          <button
            key={qa.action}
            type="button"
            onClick={() => ask(qa.prompt, qa.level, qa.action)}
            disabled={loading || (remaining !== -1 && remaining <= 0)}
            style={{
              fontSize: 11.5, padding: '4px 9px', borderRadius: 6,
              background: '#FFFFFF', color: '#4338CA', border: '1px solid #C7D2FE',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              opacity: loading || (remaining !== -1 && remaining <= 0) ? 0.5 : 1,
            }}
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* Custom Question Input */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8, alignItems: 'flex-end', background: '#FFFFFF' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
          placeholder="Ask for a hint, explain an error, or request approach..."
          rows={2}
          style={{
            flex: 1, resize: 'none', padding: 8, fontSize: 12.5, borderRadius: 8,
            border: '1px solid #CBD5E1', outline: 'none', fontFamily: 'inherit'
          }}
        />
        <button
          type="button"
          onClick={() => ask()}
          disabled={loading || !input.trim() || (remaining !== -1 && remaining <= 0)}
          style={{
            padding: '8px 14px', background: '#7C3AED', color: '#FFF', border: 'none', borderRadius: 8,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
            opacity: loading || !input.trim() || (remaining !== -1 && remaining <= 0) ? 0.5 : 1
          }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Ask
        </button>
      </div>
    </div>
  )
}

CodingAiAssistant.propTypes = {
  user: PropTypes.shape({
    token: PropTypes.string,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  attemptId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  problem: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string,
    programmingLanguage: PropTypes.string,
  }),
  questionState: PropTypes.shape({
    code: PropTypes.string,
    language: PropTypes.string,
    output: PropTypes.string,
  }),
  sessionToken: PropTypes.string,
  onError: PropTypes.func,
}
