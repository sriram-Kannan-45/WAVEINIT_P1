import { motion } from 'framer-motion'
import { Search, Bell, ChevronDown, Plus, Sun, Moon } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAppTheme as useTheme } from '../../contexts/AppThemeContext'

const initials = (name) =>
  name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

export default function TopNavbar({ user, currentPageLabel, onOpenCreate, onProfile }) {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef(null)
  const { theme, toggleTheme } = useTheme()
  const roleLabel = user.role === 'ADMIN' ? 'Admin' : user.role === 'TRAINER' ? 'Trainer' : 'Learner'

  const avatarBg = 'linear-gradient(135deg, #16A34A, #22C55E)'

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>
            {today}
          </span>
          <span className="wl-topbar-breadcrumb-current">{currentPageLabel}</span>
        </div>
      </div>

      <div className="wl-topbar-right">
        {/* Search */}
        <div className="wl-topbar-search">
          <Search size={15} style={{ color: '#9CA3AF' }} />
          <span className="wl-topbar-search-text">Search...</span>
          <span className="wl-topbar-search-kbd">⌘K</span>
        </div>

        {/* Notifications */}
        <button className="wl-topbar-icon-btn" aria-label="Notifications">
          <Bell size={18} />
          <span className="wl-topbar-notification-dot" />
        </button>

        {/* Quick Create */}
        <motion.button
          className="wl-topbar-create-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onOpenCreate}
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Quick Create</span>
        </motion.button>

        {/* Theme Toggle */}
        <button
          className="wl-topbar-icon-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

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
          <ChevronDown size={14} style={{ color: '#9CA3AF', transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />

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
