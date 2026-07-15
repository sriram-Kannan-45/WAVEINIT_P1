import { motion } from 'framer-motion'
import { Search, Bell, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const initials = (name) =>
  name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

export default function TopNavbar({ user, currentPageLabel, onOpenCreate, onProfile }) {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef(null)
  const roleLabel = user.role === 'ADMIN' ? 'Admin' : user.role === 'TRAINER' ? 'Trainer' : 'Learner'

  const avatarBg = user.role === 'ADMIN'
    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
    : user.role === 'TRAINER'
    ? 'linear-gradient(135deg, #0d9488, #2dd4bf)'
    : 'linear-gradient(135deg, #16a34a, #4ade80)'

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header className="wl-topbar">
      <div className="wl-topbar-left">
        <div className="wl-topbar-breadcrumb">
          <span style={{ color: '#9ca3af' }}>Home</span>
          <ChevronRight size={14} style={{ color: '#d1d5db' }} />
          <span className="wl-topbar-breadcrumb-current">{currentPageLabel}</span>
        </div>
      </div>

      <div className="wl-topbar-right">
        {/* Search */}
        <div className="wl-topbar-search">
          <Search size={15} style={{ color: '#9ca3af' }} />
          <span className="wl-topbar-search-text">Search...</span>
          <span className="wl-topbar-search-kbd">⌘K</span>
        </div>

        {/* Notifications */}
        <button className="wl-topbar-icon-btn" aria-label="Notifications">
          <Bell size={18} />
          <span className="wl-topbar-notification-dot" />
        </button>

        {/* Create button (Trainer only) */}
        {user.role === 'TRAINER' && (
          <motion.button
            onClick={onOpenCreate}
            className="wl-topbar-create-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={15} />
            <span>Create</span>
          </motion.button>
        )}

        {/* User */}
        <div className="wl-topbar-user" ref={menuRef} onClick={() => setShowUserMenu(!showUserMenu)}>
          <div style={{ position: 'relative' }}>
            <div className="wl-topbar-avatar" style={{ background: avatarBg }}>
              {initials(user.name)}
            </div>
          </div>
          <div className="wl-topbar-user-info">
            <span className="wl-topbar-user-name">{user.name}</span>
            <span className="wl-topbar-user-role">{roleLabel}</span>
          </div>
          <ChevronDown size={14} style={{ color: '#9ca3af', transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />

          {showUserMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowUserMenu(false)} />
              <div className="wl-topbar-dropdown">
                <button className="wl-topbar-dropdown-item" onClick={() => { setShowUserMenu(false); onProfile?.() }}>
                  My Profile
                </button>
                <button className="wl-topbar-dropdown-item wl-topbar-dropdown-item--danger" onClick={() => { setShowUserMenu(false); onProfile?.() }}>
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
