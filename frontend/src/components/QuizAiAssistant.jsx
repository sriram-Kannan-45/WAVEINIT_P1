import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Loader2, ShieldCheck, Lock } from 'lucide-react'
import { API_BASE } from '../api/api'
import AiMentorPanel from './ai-mentor/AiMentorPanel'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

// A stuck upstream model call must never leave the participant's chat stuck in
// the loading state, so each mentor request is bounded and aborted on timeout.
const MENTOR_TIMEOUT_MS = 20000

/**
 * The approved quiz quick-action set, in the approved order.
 *
 * "Help me eliminate an option" is guidance only: the backend prompt answers it
 * with the criterion to apply rather than a verdict, and aiAnswerGuard blocks
 * any reply that names an option as the answer or asserts an option letter — so
 * this button cannot become an answer reveal even if a model tries.
 */
const QUICK_ACTIONS = [
  {
    action: 'explain',
    label: 'Explain this question',
    prompt: 'Can you explain what this question is asking in very simple English?',
  },
  {
    action: 'hint',
    label: 'Give me a hint',
    prompt: 'Can you give me a small guiding hint in simple words, without telling me the answer?',
  },
  {
    action: 'concept',
    label: 'Explain a term/concept',
    prompt: 'Can you explain the term or concept behind this question, as if I had not heard it before?',
  },
  {
    action: 'eliminate',
    label: 'Help me eliminate an option',
    prompt: 'What test should I apply to each option to rule some out myself? Give me the criterion, not which ones are wrong.',
  },
]

const QuizAiAssistant = React.memo(function QuizAiAssistant({
  user, attemptId, question, sessionToken, onError, onClose,
}) {
  const [enabled, setEnabled] = useState(true)
  const [limit, setLimit] = useState(3)
  const [used, setUsed] = useState(0)
  const [unlimited, setUnlimited] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  const qId = question?.id

  const loadStatus = useCallback(async (isInitial = false) => {
    if (!user?.token || !attemptId) return
    if (isInitial) setStatusLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ai-quiz/participant/${attemptId}/quiz-ai-status`, {
        headers: authHeaders(user.token),
      })
      const data = await res.json()
      if (res.ok && data) {
        setEnabled(data.enabled !== false)
        setLimit(Number(data.limit) || 3)
        setUsed(Number(data.used) || 0)
        setUnlimited(data.unlimited === true)
      }
    } catch (_) {} finally {
      if (isInitial) setStatusLoading(false)
    }
  }, [user?.token, attemptId])

  // Reload status whenever the question changes (status is per-attempt, not per-question, so keep once)
  useEffect(() => {
    loadStatus(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, user?.token])

  if (!enabled) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Lock size={20} color="#CBD5E1" />
        <div>AI mentor is disabled for this quiz.</div>
      </div>
    )
  }

  const remaining = unlimited ? -1 : Math.max(0, limit - used)
  const outOfHelp = remaining !== -1 && remaining <= 0

  const ask = async (customPrompt) => {
    const prompt = (customPrompt || input || '').trim()
    if (!prompt || loading || (remaining !== -1 && remaining <= 0)) {
      if (remaining !== -1 && remaining <= 0) {
        onError?.('You have used all your AI mentor help for this quiz.')
      }
      return
    }

    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', text: prompt, at: Date.now() }])
    setInput('')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MENTOR_TIMEOUT_MS)

    const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
    if (sessionToken) headers['X-Assessment-Session'] = sessionToken

    try {
      const res = await fetch(`${API_BASE}/ai-quiz/participant/${attemptId}/quiz-ai-assist`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          questionId: Number(qId),
          question: prompt,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setUsed(data.remaining === 0 ? limit : used)
        }
        throw new Error(data.error || data.response || 'AI mentor unavailable')
      }
      setUsed(Number(data.used) || used + 1)
      if (data.unlimited != null) setUnlimited(data.unlimited === true)
      if (data.limit != null) setLimit(Number(data.limit))
      setMessages(prev => [...prev, { role: 'assistant', text: data.response || '(no response)', at: Date.now() }])
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', text: '', error: 'The mentor took too long to respond. Please try your question again.', at: Date.now() }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: '', error: err.message, at: Date.now() }])
      }
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const usageBadge = statusLoading ? (
    <Loader2 size={12} className="animate-spin" color="#059669" />
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: remaining !== -1 && remaining <= 0 ? '#DC2626' : '#15803D' }}>
      <ShieldCheck size={12} />
      {unlimited ? 'Unlimited' : `${Math.max(0, remaining)}/${limit} help${limit === 1 ? '' : 's'} left`}
    </span>
  )

  const chatTopContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
      <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.5, background: '#F8FAF9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 9 }}>
        Ask me to explain the question, a term in it, or the rule it is testing. I will give you the test to apply — you decide which option passes it.
      </div>

      {messages.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            Suggested Prompts:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.action}
                type="button"
                onClick={() => ask(qa.prompt)}
                disabled={loading || outOfHelp}
                title={qa.prompt}
                style={{
                  fontSize: 11, padding: '7px 9px', borderRadius: 8, textAlign: 'left',
                  background: '#FFFFFF', color: '#3730A3',
                  border: '1px solid #E0E7FF', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  opacity: loading || outOfHelp ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qa.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const quickActions = (
    <div style={{ padding: '5px 10px', display: 'flex', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap', alignItems: 'center' }}>
      {QUICK_ACTIONS.map(qa => (
        <button
          key={qa.action}
          type="button"
          onClick={() => ask(qa.prompt)}
          disabled={loading || outOfHelp}
          title={qa.prompt}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
            background: '#FFFFFF', color: '#4338CA',
            border: '1px solid #C7D2FE', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            opacity: loading || outOfHelp ? 0.5 : 1,
          }}
        >
          {qa.label}
        </button>
      ))}
    </div>
  )

  return (
    <AiMentorPanel
      usageBadge={usageBadge}
      onClose={onClose}
      onClear={() => setMessages([])}
      chatTopContent={chatTopContent}
      messages={messages}
      loading={loading}
      loadingLabel="Helping you reason through it..."
      quickActions={quickActions}
      input={input}
      onInputChange={setInput}
      onSend={() => ask()}
      sendDisabled={loading || !input.trim() || outOfHelp}
      inputDisabled={outOfHelp}
    />
  )
})

QuizAiAssistant.propTypes = {
  user: PropTypes.shape({
    token: PropTypes.string,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  attemptId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  question: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    questionText: PropTypes.string,
    questionType: PropTypes.string,
    options: PropTypes.array,
  }),
  sessionToken: PropTypes.string,
  onError: PropTypes.func,
  /** Closes the panel (the X control); the quiz screen collapses the sidebar box. */
  onClose: PropTypes.func,
}

export default QuizAiAssistant
