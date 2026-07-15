import { Bell, LogOut } from 'lucide-react'

/** Standalone route only — embedded pages use the app Layout header */
export default function QuizzesTopNav({ user, onLogout }) {
  const initials = user?.name
    ? user.name.trim().split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <header className="ai-quiz-standalone-nav">
      <div className="ai-quiz-standalone-nav__brand">
        <span className="ai-quiz-standalone-nav__logo">W</span>
        <div>
          <p className="ai-quiz-standalone-nav__name">WAVE INIT</p>
          <p className="ai-quiz-standalone-nav__tag">Learning Management</p>
        </div>
      </div>
      <div className="ai-quiz-standalone-nav__actions">
        <button type="button" className="ai-quiz-icon-btn" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <div className="ai-quiz-standalone-nav__user">
          <span className="ai-quiz-standalone-nav__avatar">{initials}</span>
          <span className="ai-quiz-standalone-nav__username">{user?.name || 'Participant'}</span>
        </div>
        {onLogout && (
          <button type="button" className="ai-quiz-icon-btn" onClick={onLogout} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        )}
      </div>
    </header>
  )
}
