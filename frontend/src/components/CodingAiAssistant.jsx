import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
  Lock,
  ShieldCheck,
  Lightbulb,
  Compass,
  Code2,
} from 'lucide-react'
import { API_BASE } from '../api/api'
import AiMentorPanel from './ai-mentor/AiMentorPanel'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

// A stuck upstream model call must never leave the participant's chat stuck in
// the loading state, so each mentor request is bounded and aborted on timeout.
const MENTOR_TIMEOUT_MS = 20000

const ASSISTANCE_LEVELS = [
  { level: 1, label: 'Level 1: Hint', icon: Lightbulb, color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', desc: 'Short, gentle clue to get you thinking' },
  { level: 2, label: 'Level 2: Approach', icon: Compass, color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Step-by-step conceptual solving direction in easy English' },
  { level: 3, label: 'Level 3: Code Guidance', icon: Code2, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', desc: 'High-level program structure conceptually without syntax' },
]

const QUICK_ACTIONS = [
  { action: 'explain_problem', level: 1, label: 'Explain this problem', prompt: 'Can you explain what this problem is asking in very simple English?' },
  { action: 'hint', level: 1, label: 'Give me a hint', prompt: 'Can you give me a small hint in simple words to point me in the right direction?' },
  { action: 'explain_io', level: 1, label: 'Explain input / output', prompt: 'How does the input relate to the output in simple terms?' },
  { action: 'approach', level: 2, label: 'Suggest an approach', prompt: 'What is the step-by-step thinking approach to solve this problem?' },
  { action: 'explain_error', level: 3, label: 'Understand my error', prompt: 'My code failed or gave an error. Can you explain what is conceptually wrong?' },
  { action: 'code_guidance', level: 3, label: 'Guide program structure', prompt: 'What program structure or parts should I think about for this problem?' },
]

const CodingAiAssistant = React.memo(function CodingAiAssistant({
  user, attemptId, problem, questionState, sessionToken, onClose,
}) {
  const [statusByProblem, setStatusByProblem] = useState({})
  const [selectedLevel, setSelectedLevel] = useState(1)
  const [chatHistoryByProblem, setChatHistoryByProblem] = useState({})
  const [inputByProblem, setInputByProblem] = useState({})
  const [sendingByProblem, setSendingByProblem] = useState({})
  const requests = useRef(new Map())
  const pendingConfirmation = useRef(null)
  const [aiAcknowledged, setAiAcknowledged] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const pId = problem?.id
  const enabled = statusByProblem[pId]?.enabled !== false
  const used = statusByProblem[pId]?.used || 0
  const loading = Boolean(sendingByProblem[pId])
  const messages = (pId && chatHistoryByProblem[pId]) || []
  const input = (pId && inputByProblem[pId]) || ''

  const setMessages = useCallback((updater) => {
    if (!pId) return
    setChatHistoryByProblem(prev => {
      const current = prev[pId] || []
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [pId]: next }
    })
  }, [pId])

  const setInput = useCallback((val) => {
    if (!pId) return
    setInputByProblem(prev => ({ ...prev, [pId]: val }))
  }, [pId])

  // Load AI usage acknowledgement from localStorage
  useEffect(() => {
    try {
      setAiAcknowledged(localStorage.getItem(`ai_mentor_acknowledged_${attemptId}`) === 'true')
    } catch (_) { /* Storage is optional; in-memory acknowledgement still works. */ }
  }, [attemptId])

  useEffect(() => () => {
    for (const controller of requests.current.values()) {
      clearTimeout(controller.mentorTimeout)
      controller.abort()
    }
    requests.current.clear()
  }, [])

  useEffect(() => {
    if (!user?.token || !attemptId || !pId) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MENTOR_TIMEOUT_MS)
    const loadStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/coding/participant/assist/status/${attemptId}/${pId}`, {
          headers: authHeaders(user.token),
          signal: controller.signal,
        })
        const data = await res.json()
        if (res.ok && data && !controller.signal.aborted) {
          setStatusByProblem(prev => ({ ...prev, [pId]: {
            enabled: data.enabled !== false,
            used: Math.max(prev[pId]?.used || 0, Number(data.used) || 0),
          } }))
        }
      } catch (_) {
        // Reporting availability must not lock the composer.
      } finally {
        clearTimeout(timeout)
      }
    }
    loadStatus()
    return () => { clearTimeout(timeout); controller.abort() }
  }, [user?.token, attemptId, pId])

  useEffect(() => {
    pendingConfirmation.current = null
    setShowConfirmation(false)
  }, [pId])

  if (!enabled) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Lock size={20} color="#CBD5E1" />
        <div>AI assistant is disabled for this assessment.</div>
      </div>
    )
  }

  const handleAiConfirmation = (confirmed) => {
    setShowConfirmation(false)
    const pending = pendingConfirmation.current
    pendingConfirmation.current = null
    if (confirmed) {
      try { localStorage.setItem(`ai_mentor_acknowledged_${attemptId}`, 'true') } catch (_) {}
      setAiAcknowledged(true)
      if (pending) ask(pending.question, pending.level, pending.action, true)
    }
  }

  const ask = async (customPrompt, overrideLevel = selectedLevel, action = 'custom', acknowledged = aiAcknowledged) => {
    const question = (customPrompt || input || '').trim()
    if (!question || !pId || !user?.token || requests.current.has(pId)) return
    // Show confirmation dialog on first AI usage
    if (!acknowledged) {
      pendingConfirmation.current = { question, level: overrideLevel, action }
      setShowConfirmation(true)
      return
    }

    const lvl = overrideLevel || selectedLevel

    const controller = new AbortController()
    requests.current.set(pId, controller)
    setSendingByProblem(prev => ({ ...prev, [pId]: true }))
    const userMsg = { role: 'user', text: question, level: lvl, at: Date.now() }
    setMessages(prev => [...prev, userMsg])
    // A quick action must not erase an unrelated draft the student is typing.
    if (!customPrompt || question === input.trim()) setInput('')

    const timeoutId = setTimeout(() => controller.abort(), MENTOR_TIMEOUT_MS)
    controller.mentorTimeout = timeoutId

    try {
      const headers = { ...authHeaders(user.token), 'Content-Type': 'application/json' }
      if (sessionToken) headers['X-Assessment-Session'] = sessionToken
      const res = await fetch(`${API_BASE}/coding/participant/assist`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          attemptId: Number(attemptId),
          problemId: pId,
          code: questionState?.code || '',
          language: questionState?.language || problem?.programmingLanguage || 'javascript',
          question,
          level: lvl,
          action,
          errorContext: questionState?.output || '',
        }),
      })
      const data = await res.json()
      if (requests.current.get(pId) !== controller) return
      if (!res.ok) {
        throw new Error(data.error || data.response || 'AI assistant unavailable')
      }

      setStatusByProblem(prev => ({ ...prev, [pId]: {
        ...prev[pId], used: Math.max(prev[pId]?.used || 0, Number(data.usageUsed) || used + 1),
      } }))
      setMessages(prev => [...prev, { role: 'assistant', text: data.response || '(no response)', level: lvl, at: Date.now() }])
    } catch (err) {
      if (requests.current.get(pId) !== controller) return
      if (err && err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', text: '', error: 'The mentor took too long to respond. Please try your question again.', at: Date.now() }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: '', error: err.message, at: Date.now() }])
      }
    } finally {
      clearTimeout(timeoutId)
      if (requests.current.get(pId) === controller) {
        requests.current.delete(pId)
        setSendingByProblem(prev => ({ ...prev, [pId]: false }))
      }
    }
  }

  const curLevelObj = ASSISTANCE_LEVELS.find(l => l.level === selectedLevel) || ASSISTANCE_LEVELS[0]

  const usageBadge = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700,
        background: curLevelObj.bg, color: curLevelObj.color, border: `1px solid ${curLevelObj.border}`,
      }}>
        Lvl {selectedLevel}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#15803D' }}>
        <ShieldCheck size={12} />
        Available
      </span>
      {used > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#4F46E5' }}>
          AI Assistance: Used ({used} interactions)
        </span>
      )}
    </div>
  )

  const chatTopContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
      {/* AI Usage Warning */}
      <div style={{
        background: '#FFF7ED',
        border: '1px solid #FED7AA',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 11.5,
        color: '#9A3412',
        lineHeight: 1.5,
      }}>
        <strong>AI Mentor assistance is available throughout this assessment.</strong> Your AI usage will be recorded and may affect your final evaluation score.
      </div>

      {/* Level selector buttons row */}
      <div style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginRight: 2 }}>Level:</span>
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
                  padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer',
                  background: isSel ? lvl.bg : '#FFFFFF',
                  color: isSel ? lvl.color : '#475569',
                  border: isSel ? `1px solid ${lvl.border}` : '1px solid #E2E8F0',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={11} color={isSel ? lvl.color : '#64748B'} />
                {lvl.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Intro instructions bubble */}
      <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.5, background: '#F8FAF9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 9 }}>
        Ask me about the problem, the concept behind it, or an error you are seeing. I will walk you towards it — the code stays yours to write.
      </div>

      {/* Starter Quick Actions Prompts inside chat (prominently shown when starting) */}
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
                onClick={() => ask(qa.prompt, qa.level, qa.action)}
                disabled={loading}
                title={qa.prompt}
                style={{
                  fontSize: 11, padding: '7px 9px', borderRadius: 8, textAlign: 'left',
                  background: '#FFFFFF',
                  color: '#3730A3',
                  border: '1px solid #E0E7FF',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  opacity: loading ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <Lightbulb size={11} color="#4F46E5" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qa.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // Sleek single-row horizontal scroll prompt chips above input
  const quickActions = (
    <div style={{ padding: '5px 10px', display: 'flex', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap', alignItems: 'center' }}>
      {QUICK_ACTIONS.map(qa => (
        <button
          key={qa.action}
          type="button"
          onClick={() => ask(qa.prompt, qa.level, qa.action)}
          disabled={loading}
          title={qa.prompt}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
            background: '#FFFFFF',
            color: '#4338CA',
            border: '1px solid #C7D2FE',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {qa.label}
        </button>
      ))}
    </div>
  )
  return (
    <>
      {/* AI Usage Confirmation Dialog */}
      {showConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="coding-mentor-confirmation" style={{
            background: '#FFFFFF',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }}>
            <h3 id="coding-mentor-confirmation" style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
              Use AI Mentor?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
              The AI Mentor can help you understand problems, concepts, and errors. Your AI assistance usage will be recorded as part of this assessment and may influence your final evaluation score.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleAiConfirmation(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAiConfirmation(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#0D9488',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Continue with AI Mentor
              </button>
            </div>
          </div>
        </div>
      )}

      <AiMentorPanel
        focusContext={pId}
        usageBadge={usageBadge}
        onClose={onClose}
        onClear={() => setMessages([])}
        chatTopContent={chatTopContent}
        messages={messages}
        loading={loading}
        loadingLabel="Thinking it through with you..."
        quickActions={quickActions}
        input={input}
        onInputChange={setInput}
        onSend={() => ask()}
        sendDisabled={loading || !input.trim()}
        inputDisabled={false}
      />
    </>
  )
})

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
  /** Closes the panel (the X control); the coding screen switches tab back. */
  onClose: PropTypes.func,
}

export default CodingAiAssistant
