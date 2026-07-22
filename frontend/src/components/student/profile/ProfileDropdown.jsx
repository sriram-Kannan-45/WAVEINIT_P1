import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Settings, LogOut, ChevronDown } from 'lucide-react'

export default function ProfileDropdown({ user, onTabChange, onLogout }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '10px 14px', borderRadius: 10, border: 'none',
          background: open ? 'var(--bg-hover)' : 'transparent',
          color: 'var(--text-primary)', cursor: 'pointer',
          transition: 'background 0.2s', fontFamily: 'inherit',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {user?.role || 'PARTICIPANT'}
          </div>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 11,
            marginBottom: 4, borderRadius: 10, overflow: 'hidden',
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          }}>
            <button
              onClick={() => { setOpen(false); navigate('/my-profile') }}
              style={dropdownItemStyle}
            >
              <User size={14} /> My Profile
            </button>
            <button
              onClick={() => { setOpen(false); onLogout?.() }}
              style={{ ...dropdownItemStyle, color: 'var(--danger)', borderTop: '1px solid var(--border-muted)' }}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const dropdownItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '10px 16px', border: 'none', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
  fontFamily: 'inherit', transition: 'background 0.15s',
}
