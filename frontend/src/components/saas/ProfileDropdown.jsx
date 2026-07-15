import { useState } from 'react'
import { User, LogOut, ChevronDown } from 'lucide-react'
import { colors } from '../../theme/tokens'

const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '10px 16px', border: 'none', background: 'transparent',
  color: '#E2E8F0', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
  transition: 'background 0.15s',
}

export default function ProfileDropdown({ user, onProfile, onLogout }) {
  const [open, setOpen] = useState(false)
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
          cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.brand.violet}, ${colors.brand.violetLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>
            {initials}
          </div>
          <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: colors.success[500], border: '2px solid rgba(255,255,255,0.1)' }} />
        </div>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {user?.role || 'TRAINER'}
          </div>
        </div>
        <ChevronDown size={16} style={{ color: 'rgba(148,163,184,0.8)', flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 11,
            marginBottom: 6, borderRadius: 12, overflow: 'hidden',
            background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          }}>
            <button
              onClick={() => { setOpen(false); onProfile && onProfile() }}
              style={itemStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <User size={14} /> My Profile
            </button>
            <button
              onClick={() => { setOpen(false); onLogout && onLogout() }}
              style={{ ...itemStyle, color: '#F87171', borderTop: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
