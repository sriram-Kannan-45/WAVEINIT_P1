import { useState } from 'react'
import { User, LogOut, ChevronDown } from 'lucide-react'

export default function ProfileDropdown({ user, onProfile, onLogout }) {
  const [open, setOpen] = useState(false)
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const roleLabel = user?.role === 'ADMIN' ? 'Admin' : user?.role === 'TRAINER' ? 'Trainer' : 'Learner'
  const avatarBg = user?.role === 'ADMIN'
    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
    : user?.role === 'TRAINER'
    ? 'linear-gradient(135deg, #0d9488, #2dd4bf)'
    : 'linear-gradient(135deg, #16a34a, #4ade80)'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid #f1f5f9',
          background: open ? '#f9fafb' : '#ffffff',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 150ms ease',
        }}
      >
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: avatarBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
            {roleLabel}
          </div>
        </div>
        <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            zIndex: 11,
            marginBottom: 6,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
          }}>
            <button
              onClick={() => { setOpen(false); onProfile && onProfile() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', border: 'none', background: 'transparent',
                color: '#374151', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <User size={14} /> My Profile
            </button>
            <button
              onClick={() => { setOpen(false); onLogout && onLogout() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', border: 'none', borderTop: '1px solid #f3f4f6',
                background: 'transparent', color: '#ef4444', cursor: 'pointer',
                fontSize: 13, fontFamily: 'inherit', transition: 'background 150ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
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
