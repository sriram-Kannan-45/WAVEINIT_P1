import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, LogOut, ChevronDown } from 'lucide-react'

export default function ProfileDropdown({ user, onProfile, onLogout }) {
  const [open, setOpen] = useState(false)
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const roleLabel = user?.role === 'ADMIN' ? 'Admin' : user?.role === 'TRAINER' ? 'Trainer' : 'Learner'
  const avatarBg = 'linear-gradient(135deg, #16A34A, #22C55E)'

  return (
    <div style={{ position: 'relative' }}>
      <motion.button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid #F3F4F6',
          background: open ? '#F9FAFB' : '#FFFFFF',
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: avatarBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
          fontFamily: 'Inter, sans-serif',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
            {roleLabel} &middot; Online
          </div>
        </div>
        <ChevronDown size={14} style={{ color: '#9CA3AF', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                zIndex: 11,
                marginBottom: 8,
                borderRadius: 14,
                overflow: 'hidden',
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.1)',
                padding: 6,
              }}
            >
              <button
                onClick={() => { setOpen(false); onProfile && onProfile() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', border: 'none', background: 'transparent',
                  color: '#374151', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter, sans-serif',
                  borderRadius: 10, fontWeight: 500,
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <User size={15} /> My Profile
              </button>
              <button
                onClick={() => { setOpen(false); onLogout && onLogout() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', border: 'none', borderTop: '1px solid #F3F4F6',
                  background: 'transparent', color: '#EF4444', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'Inter, sans-serif', borderRadius: 10,
                  fontWeight: 500, transition: 'background 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <LogOut size={15} /> Sign Out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
