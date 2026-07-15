import { motion } from 'framer-motion'
import { Search, Bell, Plus, ChevronRight } from 'lucide-react'

const initials = (name) =>
  name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

export default function TopNavbar({ user, currentPageLabel, onOpenCreate, onProfile }) {
  const roleClass = user.role === 'ADMIN' ? 'admin' : user.role === 'TRAINER' ? 'trainer' : 'participant'

  return (
    <header className="enterprise-navbar">
      <div className="enterprise-navbar__left">
        <div className="enterprise-navbar__breadcrumb">
          <span style={{ color: 'var(--neutral-400)' }}>Home</span>
          <ChevronRight size={14} style={{ color: 'var(--neutral-300)' }} />
          <span className="enterprise-navbar__breadcrumb-current">{currentPageLabel}</span>
        </div>
      </div>

      <div className="enterprise-navbar__right">
        {/* Search */}
        <div className="enterprise-navbar__search">
          <Search size={15} style={{ color: 'var(--neutral-400)' }} />
          <span className="enterprise-navbar__search-text">Search...</span>
          <span className="enterprise-navbar__search-kbd">⌘K</span>
        </div>

        {/* Notifications */}
        <button className="enterprise-navbar__icon-btn" aria-label="Notifications">
          <Bell size={18} />
          <span className="enterprise-navbar__badge" />
        </button>

        {/* Create button (Trainer only) */}
        {user.role === 'TRAINER' && (
          <motion.button
            onClick={onOpenCreate}
            className="btn-enterprise btn-enterprise--primary"
            style={{ padding: '8px 14px', fontSize: '13px' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={15} />
            <span>Create</span>
          </motion.button>
        )}

        {/* User */}
        <div className="enterprise-navbar__user" onClick={onProfile} role="button" tabIndex={0}>
          <div className={`enterprise-navbar__avatar enterprise-navbar__avatar--${roleClass}`}>
            {initials(user.name)}
          </div>
          <div className="enterprise-navbar__user-info">
            <span className="enterprise-navbar__user-name">{user.name}</span>
            <span className="enterprise-navbar__user-role">{user.role}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
