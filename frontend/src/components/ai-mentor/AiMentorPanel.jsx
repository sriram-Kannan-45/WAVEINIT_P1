import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  Sparkles,
  Send,
  Loader2,
  X,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  CheckCheck,
  Trash2,
} from 'lucide-react'

/**
 * AiMentorPanel — the single shared shell for the AI Mentor on BOTH the Coding
 * and the Quiz assessment screens.
 *
 * The four strings below are static UI copy, deliberately NOT model-generated:
 * the participant always sees the constraint stated, whatever the server
 * returns and whether or not the response-level guard had to intervene. Both
 * screens render them verbatim — that is what makes the two panels identical.
 *
 * Everything that differs between the two screens is passed in as a node
 * (`usageBadge`, `subHeader`, `intro`, `quickActions`), so this file owns the
 * layout and neither screen can drift from the approved design.
 */
export const MENTOR_COPY = {
  title: 'AI Mentor',
  subtitle: 'I help you understand, not give answers.',
  placeholder: 'Ask a doubt... (Mentor only gives hints)',
  caption: 'AI Mentor never reveals the direct answer.',
}

/** 24h timestamp -> "11:35 AM", used on participant bubbles. */
export function formatClockTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts || Date.now())
  if (Number.isNaN(d.getTime())) return ''
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${suffix}`
}

/**
 * Splits a mentor reply into the short paragraphs the spec calls for. Single
 * newlines split too, so a reply that lists "Example: n % 2" style lines shows
 * one idea per bubble instead of one dense block.
 */
export function splitIntoParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const S = {
  shell: {
    display: 'flex', flexDirection: 'column', height: '100%',
    overflow: 'hidden', background: '#FFFFFF',
  },
  header: {
    padding: '9px 14px 10px', borderBottom: '1px solid #E2E8F0',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 10, background: '#F8FAF9', flexShrink: 0, flexWrap: 'wrap',
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' },
  subtitle: { fontSize: 11.5, color: '#64748B', marginTop: 2, lineHeight: 1.35 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%', paddingTop: 1 },
  closeBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 6, border: '1px solid transparent',
    background: 'transparent', color: '#64748B', cursor: 'pointer', padding: 0,
  },
  list: {
    flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  userRow: { alignSelf: 'flex-end', maxWidth: '88%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  userBubble: {
    fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    padding: '8px 12px', borderRadius: '12px 12px 4px 12px',
    background: '#DCFCE7', border: '1px solid #A7F3D0', color: '#14532D',
  },
  userMeta: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 10, color: '#64748B', marginTop: 3, paddingRight: 2,
  },
  mentorGroup: { alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 5 },
  mentorBubble: {
    fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    padding: '8px 12px', borderRadius: '12px 12px 12px 4px',
    background: '#FFFFFF', border: '1px solid #E2E8F0', color: '#1E293B',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  },
  actionRow: { display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 2, marginTop: 1 },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 5, border: '1px solid transparent',
    background: 'transparent', cursor: 'pointer', padding: 0, color: '#94A3B8',
  },
  quickActionsWrapper: {
    flexShrink: 0, borderTop: '1px solid #F1F5F9', background: '#F8FAFC',
    overflowX: 'auto', whiteSpace: 'nowrap',
  },
  inputRow: {
    padding: '8px 12px 6px', borderTop: '1px solid #E2E8F0',
    display: 'flex', gap: 8, alignItems: 'flex-end', background: '#FFFFFF',
    flexShrink: 0,
  },
  caption: {
    padding: '0 12px 8px', fontSize: 10.5, color: '#94A3B8',
    background: '#FFFFFF', lineHeight: 1.35, flexShrink: 0,
  },
}

/**
 * One mentor reply: short paragraph bubbles, with copy / thumbs-up /
 * thumbs-down beneath. Ratings are local acknowledgement only — no rating
 * endpoint exists for mentor exchanges, so nothing is sent to the server.
 */
function MentorReply({ text }) {
  const paragraphs = splitIntoParagraphs(text)
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(text || ''))
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1600)
    } catch (_) { /* clipboard blocked — ignore, nothing else to do */ }
  }

  return (
    <div style={S.mentorGroup}>
      {(paragraphs.length > 0 ? paragraphs : ['(no response)']).map((p, i) => (
        <div key={i} style={S.mentorBubble}>{p}</div>
      ))}
      <div style={S.actionRow}>
        <button type="button" onClick={copy} style={S.iconBtn} title={copied ? 'Copied' : 'Copy'} aria-label="Copy mentor reply">
          {copied ? <Check size={13} color="#15803D" /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          onClick={() => setVote(vote === 'up' ? null : 'up')}
          style={{ ...S.iconBtn, color: vote === 'up' ? '#15803D' : '#94A3B8' }}
          title="This helped"
          aria-label="Mark reply helpful"
          aria-pressed={vote === 'up'}
        >
          <ThumbsUp size={13} />
        </button>
        <button
          type="button"
          onClick={() => setVote(vote === 'down' ? null : 'down')}
          style={{ ...S.iconBtn, color: vote === 'down' ? '#DC2626' : '#94A3B8' }}
          title="This did not help"
          aria-label="Mark reply not helpful"
          aria-pressed={vote === 'down'}
        >
          <ThumbsDown size={13} />
        </button>
      </div>
    </div>
  )
}

MentorReply.propTypes = { text: PropTypes.string }

/** Participant message: right-aligned green bubble, timestamp + sent tick. */
function ParticipantBubble({ text, at }) {
  return (
    <div style={S.userRow}>
      <div style={S.userBubble}>{text}</div>
      <span style={S.userMeta}>
        {formatClockTime(at)}
        <CheckCheck size={11} color="#16A34A" aria-label="sent" />
      </span>
    </div>
  )
}

ParticipantBubble.propTypes = {
  text: PropTypes.string,
  at: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]),
}

/** A single rendered exchange row — participant, mentor, notice, or error. */
function MessageRow({ message, noticeRenderer }) {
  if (message.role === 'user') {
    return <ParticipantBubble text={message.text} at={message.at} />
  }
  if (message.error) {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
        <div style={{
          fontSize: 12.5, color: '#DC2626', background: '#FEF2F2',
          padding: '8px 12px', borderRadius: 10, border: '1px solid #FECACA',
        }}>
          {message.error}
        </div>
      </div>
    )
  }
  if (message.isLockedNotice && noticeRenderer) {
    return <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>{noticeRenderer(message)}</div>
  }
  return <MentorReply text={message.text} />
}

MessageRow.propTypes = {
  message: PropTypes.object.isRequired,
  noticeRenderer: PropTypes.func,
}

const AiMentorPanel = React.memo(function AiMentorPanel({
  usageBadge = null,
  onClose = null,
  onClear = null,
  subHeader = null,
  chatTopContent = null,
  intro = null,
  messages = [],
  loading = false,
  loadingLabel = 'Thinking it through with you...',
  noticeRenderer = null,
  quickActions = null,
  input = '',
  onInputChange,
  onSend,
  sendDisabled = false,
  inputDisabled = false,
  focusContext = null,
}) {
  const listRef = useRef(null)
  const shellRef = useRef(null)
  const inputRef = useRef(null)
  const previousRequest = useRef({ loading: false, context: focusContext })

  useEffect(() => {
    const previous = previousRequest.current
    previousRequest.current = { loading, context: focusContext }
    if (previous.loading && !loading && previous.context === focusContext && !inputDisabled) {
      const active = document.activeElement
      // Restore after Send/quick actions, but never steal focus from the editor
      // or monitoring controls if the student moved on while waiting.
      if (active === document.body || shellRef.current?.contains(active)) {
        if (inputRef.current?.getClientRects().length) inputRef.current.focus({ preventScroll: true })
      }
    }
  }, [loading, inputDisabled, focusContext])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, loading])

  return (
    <div ref={shellRef} style={S.shell}>
      <div style={S.header}>
        <div style={{ minWidth: 0 }}>
          <div style={S.titleRow}>
            <Sparkles size={15} color="#7C3AED" />
            <span style={S.title}>{MENTOR_COPY.title}</span>
          </div>
          <div style={S.subtitle}>{MENTOR_COPY.subtitle}</div>
        </div>
        <div style={S.headerRight}>
          {usageBadge}
          {onClear && (
            <button type="button" onClick={onClear} disabled={loading} style={S.closeBtn} title="Clear conversation" aria-label="Clear AI Mentor conversation">
              <Trash2 size={14} />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} style={S.closeBtn} title="Close AI Mentor" aria-label="Close AI Mentor">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {subHeader}

      <div ref={listRef} style={S.list}>
        {chatTopContent}
        {intro}
        {messages.map((m, i) => (
          <MessageRow key={i} message={m} noticeRenderer={noticeRenderer} />
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, color: '#7C3AED', fontSize: 12, fontWeight: 600, padding: '4px 0' }}>
            <Loader2 size={13} className="animate-spin" /> {loadingLabel}
          </div>
        )}
      </div>

      {quickActions && (
        <div style={S.quickActionsWrapper}>
          {quickActions}
        </div>
      )}

      <div style={S.inputRow}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!sendDisabled) onSend?.()
            }
          }}
          placeholder={MENTOR_COPY.placeholder}
          disabled={inputDisabled}
          rows={2}
          aria-label={MENTOR_COPY.placeholder}
          style={{
            flex: 1, minWidth: 0, resize: 'none', padding: '8px 10px', fontSize: 12.5, borderRadius: 10,
            border: '1px solid #CBD5E1', outline: 'none', fontFamily: 'inherit',
            background: inputDisabled ? '#F8FAFC' : '#FFFFFF', color: '#1E293B',
          }}
        />
        <button
          type="button"
          onClick={() => onSend?.()}
          disabled={sendDisabled}
          title="Send"
          aria-label="Send question to AI Mentor"
          style={{
            width: 38, height: 38, flexShrink: 0, background: '#7C3AED', color: '#FFF',
            border: 'none', borderRadius: 10, cursor: sendDisabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            opacity: sendDisabled ? 0.5 : 1,
          }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>

      <div style={S.caption}>{MENTOR_COPY.caption}</div>
    </div>
  )
})

AiMentorPanel.propTypes = {
  /** Right-of-header node — remaining-help badge, kept per-screen. */
  usageBadge: PropTypes.node,
  /** When provided, renders the close (X) control top-right. */
  onClose: PropTypes.func,
  /** Clears only the current assessment question's visible conversation. */
  onClear: PropTypes.func,
  /** Screen-specific rows between header and thread (legacy/compact top bar). */
  subHeader: PropTypes.node,
  /** Screen-specific content rendered at the top INSIDE the scrollable chat container (effort stats, levels, starter prompts). */
  chatTopContent: PropTypes.node,
  /** Optional intro node inside the thread. */
  intro: PropTypes.node,
  messages: PropTypes.arrayOf(PropTypes.shape({
    role: PropTypes.oneOf(['user', 'assistant']),
    text: PropTypes.string,
    error: PropTypes.string,
    isLockedNotice: PropTypes.bool,
    at: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.instanceOf(Date)]),
  })),
  loading: PropTypes.bool,
  loadingLabel: PropTypes.string,
  /** Renders `isLockedNotice` messages; falls back to a normal mentor reply. */
  noticeRenderer: PropTypes.func,
  /** Quick-action chip row, rendered in a compact horizontal scroll bar above the input. */
  quickActions: PropTypes.node,
  input: PropTypes.string,
  onInputChange: PropTypes.func,
  onSend: PropTypes.func,
  sendDisabled: PropTypes.bool,
  inputDisabled: PropTypes.bool,
  focusContext: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

export default AiMentorPanel
