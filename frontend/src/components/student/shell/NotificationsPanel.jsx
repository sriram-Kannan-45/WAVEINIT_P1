import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck, Inbox, Sparkles, BookOpen, MessageSquare, Award, Info } from 'lucide-react'
import { useNotifications } from '../../../hooks/useNotifications'

const TYPE_ICON = {
  ENROLLMENT:    BookOpen,
  NOTE_UPLOAD:   Sparkles,
  APPROVAL:      Award,
  FEEDBACK_REPLY:MessageSquare,
  ASSIGNMENT:    Info,
  OTHER:         Bell,
}

const fmtAgo = (d) => {
  if (!d) return ''
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * NotificationsPanel — bell trigger + dropdown panel.
 * Lives in Layout.jsx's headerSlot for participant pages.
 */
export default function NotificationsPanel({ placement = 'bottom' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { notifications, unreadCount, loading, markRead, markAllRead, refetch } = useNotifications()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // ESC closes
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="header-btn ac-focus-ring"
        onClick={() => { setOpen((o) => !o); if (!open) refetch() }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{ position: 'relative' }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}
            style={{
              position: 'absolute', top: -2, right: -2,
              minWidth: 18, height: 18, padding: '0 4px',
              borderRadius: 9999,
              background: '#ef4444', color: '#fff',
              fontSize: 10, fontWeight: 800, lineHeight: '18px',
              textAlign: 'center',
              border: '2px solid #fff',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-label="Notifications"
            style={{
              position: 'absolute',
              ...(placement === 'top' ? { bottom: 'calc(100% + 8px)', left: 0 } : { top: 'calc(100% + 8px)', right: 0 }),
              width: 380,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'min(70vh, 560px)',
              background: 'var(--academic-surface)',
              border: '1px solid var(--academic-border)',
              borderRadius: 'var(--academic-radius-lg)',
              boxShadow: 'var(--academic-shadow-pop)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1000,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between"
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--academic-border-soft)',
              }}
            >
              <div>
                <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 15, fontWeight: 700, margin: 0 }}>
                  Notifications
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--academic-text-muted)', margin: 0 }}>
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="ac-btn ac-btn-ghost ac-btn-sm ac-focus-ring"
                  style={{ color: 'var(--academic-primary-700)', fontWeight: 700 }}
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading && notifications.length === 0 && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="ac-skeleton" style={{ height: 56 }} />
                  ))}
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div style={{ padding: 36, textAlign: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
                    background: 'var(--academic-bg-soft)', color: 'var(--academic-text-muted)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Inbox size={22} />
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--academic-text-muted)' }}>
                    No notifications yet.
                  </p>
                </div>
              )}

              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell
                const tone = n.isRead ? 'var(--academic-text-muted)' : 'var(--academic-primary)'
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.isRead && markRead(n.id)}
                    className="ac-focus-ring"
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '12px 18px',
                      border: 'none',
                      borderBottom: '1px solid var(--academic-border-soft)',
                      background: n.isRead ? 'transparent' : 'var(--academic-primary-50)',
                      cursor: n.isRead ? 'default' : 'pointer',
                      textAlign: 'left',
                      transition: 'background 200ms ease',
                    }}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: 'var(--academic-bg-soft)', color: tone,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={15} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, lineHeight: 1.45,
                        color: 'var(--academic-text)',
                        margin: 0,
                        fontWeight: n.isRead ? 500 : 600,
                      }}>
                        {n.message}
                      </p>
                      <p style={{
                        fontSize: 11, color: 'var(--academic-text-muted)',
                        marginTop: 4, marginBottom: 0,
                      }}>
                        {fmtAgo(n.createdAt || n.created_at)} ago
                      </p>
                    </div>
                    {!n.isRead && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--academic-primary)',
                        flexShrink: 0, marginTop: 8,
                      }} aria-label="unread" />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
