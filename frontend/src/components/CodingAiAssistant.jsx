import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
  Sparkles,
  Send,
  Loader2,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Lightbulb,
  Compass,
  Code2,
  HelpCircle,
  AlertCircle,
  Clock,
  Edit3,
  Play,
} from 'lucide-react'
import { API_BASE } from '../api/api'

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
})

const ASSISTANCE_LEVELS = [
  { level: 1, label: 'Level 1: Hint', icon: Lightbulb, color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', desc: 'Short, gentle clue to get you thinking (Unlocks after 2m + 1 attempt)' },
  { level: 2, label: 'Level 2: Approach', icon: Compass, color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', desc: 'Step-by-step conceptual solving direction in easy English (Unlocks after 4m)' },
  { level: 3, label: 'Level 3: Code Guidance', icon: Code2, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', desc: 'High-level program structure conceptually without syntax (Unlocks after 6m)' },
]

const QUICK_ACTIONS = [
  { action: 'explain_problem', level: 1, label: '🔍 Explain this problem', prompt: 'Can you explain what this problem is asking in very simple English?' },
  { action: 'hint', level: 1, label: '💡 Give me a hint', prompt: 'Can you give me a small hint in simple words to point me in the right direction?' },
  { action: 'explain_io', level: 1, label: '📥 Explain input / output', prompt: 'How does the input relate to the output in simple terms?' },
  { action: 'approach', level: 2, label: '🧭 Suggest an approach', prompt: 'What is the step-by-step thinking approach to solve this problem?' },
  { action: 'explain_error', level: 3, label: '⚠️ Help me understand my error', prompt: 'My code failed or gave an error. Can you explain what is conceptually wrong?' },
  { action: 'code_guidance', level: 3, label: '🛠️ Guide my program structure', prompt: 'What program structure or parts should I think about for this problem?' },
]

const CodingAiAssistant = React.memo(function CodingAiAssistant({
  user, attemptId, problem, questionState, sessionToken, onError,
}) {
  const [enabled, setEnabled] = useState(true)
  const [limit, setLimit] = useState(1)
  const [used, setUsed] = useState(0)
  const [unlimited, setUnlimited] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState(1)
  const [chatHistoryByProblem, setChatHistoryByProblem] = useState({})
  const [inputByProblem, setInputByProblem] = useState({})
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [unlockStatus, setUnlockStatus] = useState(null)
  const listRef = useRef(null)

  const pId = problem?.id
  const messages = (pId && chatHistoryByProblem[pId]) || []
  const input = (pId && inputByProblem[pId]) || ''

  const timeSpentSeconds = questionState?.timeSpentSeconds || 0
  const editCount = questionState?.editCount || 0
  const typedChars = questionState?.typedChars || 0
  const runAttempts = questionState?.runAttempts || 0

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

  const metricsRef = useRef({
    timeSpentSeconds: 0,
    editCount: 0,
    typedChars: 0,
    runAttempts: 0,
  })

  useEffect(() => {
    metricsRef.current = {
      timeSpentSeconds: questionState?.timeSpentSeconds || 0,
      editCount: questionState?.editCount || 0,
      typedChars: questionState?.typedChars || 0,
      runAttempts: questionState?.runAttempts || 0,
    }
  }, [questionState?.timeSpentSeconds, questionState?.editCount, questionState?.typedChars, questionState?.runAttempts])

  const loadStatus = useCallback(async (isInitial = false) => {
    if (!user?.token || !attemptId || !pId) return
    if (isInitial) setStatusLoading(true)
    try {
      const { timeSpentSeconds, editCount, typedChars, runAttempts } = metricsRef.current
      const qParams = new URLSearchParams({
        timeSpentSeconds: String(timeSpentSeconds),
        editCount: String(editCount),
        typedChars: String(typedChars),
        runAttempts: String(runAttempts),
      })
      const res = await fetch(`${API_BASE}/coding/participant/assist/status/${attemptId}/${pId}?${qParams.toString()}`, {
        headers: authHeaders(user.token),
      })
      const data = await res.json()
      if (res.ok && data) {
        setEnabled(data.enabled !== false)
        setLimit(Number(data.limit) || 1)
        setUsed(Number(data.used) || 0)
        setUnlimited(data.unlimited === true)
        if (data.unlockStatus) setUnlockStatus(data.unlockStatus)
      }
    } catch (_) {} finally {
      if (isInitial) setStatusLoading(false)
    }
  }, [user?.token, attemptId, pId])

  // Load status once on problem mount/change
  useEffect(() => {
    if (pId) {
      loadStatus(true)
    }
  }, [pId, loadStatus])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  // Helper to determine if a level is unlocked
  const isLevelUnlocked = (lvl) => {
    if (unlockStatus?.levels?.[lvl]) {
      return unlockStatus.levels[lvl].unlocked
    }
    const { timeSpentSeconds, editCount, typedChars, runAttempts } = metricsRef.current
    if (lvl === 1) return timeSpentSeconds >= 120 && (editCount >= 1 || typedChars >= 15 || runAttempts >= 1)
    if (lvl === 2) return timeSpentSeconds >= 240 && (editCount >= 2 || runAttempts >= 1 || used >= 1)
    if (lvl === 3) return timeSpentSeconds >= 360 && (used >= 1 || runAttempts >= 2)
    return false
  }

  const getLevelLockReason = (lvl) => {
    if (isLevelUnlocked(lvl)) return 'Available'
    if (unlockStatus?.levels?.[lvl]?.message) return unlockStatus.levels[lvl].message
    const { timeSpentSeconds } = metricsRef.current
    if (lvl === 1) return `Spend ${Math.max(0, 120 - timeSpentSeconds)}s more & try code/run to unlock hint`
    if (lvl === 2) return `Spend ${Math.max(0, 240 - timeSpentSeconds)}s more & try code/run to unlock approach`
    if (lvl === 3) return `Spend ${Math.max(0, 360 - timeSpentSeconds)}s more & use hints/runs to unlock code guidance`
    return 'Locked'
  }

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

    const lvl = overrideLevel || selectedLevel
    const unlocked = isLevelUnlocked(lvl)

    // If level is locked and action requires that level, display encouragement directly
    if (!unlocked) {
      const reason = getLevelLockReason(lvl)
      setMessages(prev => [
        ...prev,
        { role: 'user', text: question, level: lvl },
        {
          role: 'assistant',
          text: `WHAT THE QUESTION WANTS:\n${reason}\n\nWHAT YOU NEED TO THINK ABOUT:\nTake a few minutes to try writing the code or run test cases in the editor.\n\nNEXT STEP:\nMake an attempt first, and your hint options will unlock as you progress!`,
          level: lvl,
          isLockedNotice: true,
        }
      ])
      setInput('')
      return
    }

    setLoading(true)
    const userMsg = { role: 'user', text: question, level: lvl }
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
          level: lvl,
          action,
          errorContext: questionState?.output || '',
          activity: {
            timeSpentSeconds: metricsRef.current.timeSpentSeconds || 0,
            editCount: metricsRef.current.editCount || 0,
            typedChars: metricsRef.current.typedChars || 0,
            runAttempts: metricsRef.current.runAttempts || 0,
          }
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setUsed(data.remaining === 0 ? limit : used)
        }
        throw new Error(data.error || data.response || 'AI assistant unavailable')
      }

      if (data.isLocked) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.response, level: lvl, isLockedNotice: true }])
      } else {
        setUsed(Number(data.usageUsed) || used + 1)
        if (data.unlimited != null) setUnlimited(data.unlimited === true)
        if (data.usageLimit != null) setLimit(Number(data.usageLimit))
        setMessages(prev => [...prev, { role: 'assistant', text: data.response || '(no response)', level: lvl }])
      }

      if (data.unlockStatus) setUnlockStatus(data.unlockStatus)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: '', error: err.message }])
    } finally {
      setLoading(false)
    }
  }

  // Format seconds to mm:ss
  const formatSecs = (s) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}m ${secs.toString().padStart(2, '0')}s`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#FFFFFF' }}>
      {/* Top Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAF9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={14} color="#7C3AED" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>AI Coding Assistant</span>
          <span style={{ fontSize: 11, background: '#EDE9FE', color: '#6D28D9', padding: '1px 7px', borderRadius: 999, fontWeight: 600 }}>Mentor Mode</span>
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

      {/* Effort & Activity Tracker Sub-header */}
      <div style={{ padding: '5px 14px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color="#64748B" /> Time: <strong>{formatSecs(timeSpentSeconds)}</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Edit3 size={11} color="#64748B" /> Edits: <strong>{editCount}</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Play size={11} color="#64748B" /> Runs: <strong>{runAttempts}</strong>
          </span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: isLevelUnlocked(1) ? '#15803D' : '#D97706' }}>
          {isLevelUnlocked(1) ? '✓ Level 1 Unlocked' : `🔒 Hint unlocks at 2m + attempt (${Math.max(0, 120 - timeSpentSeconds)}s)`}
        </div>
      </div>

      {/* Assistance Level Selector */}
      <div style={{ padding: '6px 14px', background: '#FAFAFA', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginRight: 4 }}>Level:</span>
        {ASSISTANCE_LEVELS.map(lvl => {
          const Icon = lvl.icon
          const isSel = selectedLevel === lvl.level
          const unlocked = isLevelUnlocked(lvl.level)
          return (
            <button
              key={lvl.level}
              type="button"
              onClick={() => setSelectedLevel(lvl.level)}
              title={`${lvl.desc} — Status: ${getLevelLockReason(lvl.level)}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer',
                background: isSel ? lvl.bg : '#FFFFFF',
                color: isSel ? lvl.color : (unlocked ? '#475569' : '#94A3B8'),
                border: isSel ? `1px solid ${lvl.border}` : (unlocked ? '1px solid #E2E8F0' : '1px dashed #CBD5E1'),
                transition: 'all 0.15s ease',
                opacity: unlocked ? 1 : 0.75,
              }}
            >
              {unlocked ? (
                <Icon size={12} color={isSel ? lvl.color : '#64748B'} />
              ) : (
                <Lock size={11} color="#94A3B8" />
              )}
              {lvl.label}
              {unlocked ? (
                <span style={{ fontSize: 10, color: '#15803D' }}>✓</span>
              ) : (
                <span style={{ fontSize: 10, color: '#94A3B8' }}>🔒</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Messages Scroll Area */}
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, background: '#F8FAF9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10 }}>
          💡 <strong>Patient Coding Mentor</strong>: I explain logic step by step in simple English and give directions to help you think. I will never write code for you or reveal answers during this assessment.
        </div>

        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
            {m.error ? (
              <div style={{ fontSize: 12.5, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 10, border: '1px solid #FECACA' }}>
                {m.error}
              </div>
            ) : m.isLockedNotice ? (
              <div style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                padding: '10px 14px',
                borderRadius: 12,
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                color: '#92400E',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, marginBottom: 4, color: '#B45309' }}>
                  <Lock size={13} /> Hint Option Locked
                </div>
                {m.text}
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
            <Loader2 size={13} className="animate-spin text-violet-600" /> Thinking step-by-step guidance...
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div style={{ padding: '8px 14px', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUICK_ACTIONS.map(qa => {
          const unlocked = isLevelUnlocked(qa.level)
          return (
            <button
              key={qa.action}
              type="button"
              onClick={() => ask(qa.prompt, qa.level, qa.action)}
              disabled={loading || (remaining !== -1 && remaining <= 0)}
              title={unlocked ? qa.prompt : getLevelLockReason(qa.level)}
              style={{
                fontSize: 11.5, padding: '4px 9px', borderRadius: 6,
                background: unlocked ? '#FFFFFF' : '#F1F5F9',
                color: unlocked ? '#4338CA' : '#94A3B8',
                border: unlocked ? '1px solid #C7D2FE' : '1px dashed #CBD5E1',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                opacity: loading || (remaining !== -1 && remaining <= 0) ? 0.5 : 1,
              }}
            >
              {!unlocked && <Lock size={10} color="#94A3B8" />}
              {qa.label}
            </button>
          )
        })}
      </div>

      {/* Custom Question Input */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8, alignItems: 'flex-end', background: '#FFFFFF' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
          placeholder="Ask a question in English, Tamil, or Tanglish (e.g. 'explain problem' or 'enaku purila')..."
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
    timeSpentSeconds: PropTypes.number,
    editCount: PropTypes.number,
    typedChars: PropTypes.number,
    runAttempts: PropTypes.number,
  }),
  sessionToken: PropTypes.string,
  onError: PropTypes.func,
}

export default CodingAiAssistant
