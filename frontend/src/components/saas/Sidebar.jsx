import { AnimatePresence, motion } from 'framer-motion'
import {
  Award, BookOpen, BookPlus, ClipboardList, Code, FileText, GraduationCap, Home,
  LayoutDashboard, LogOut, Menu, MessageSquare, Search, Bell, Settings, Shield,
  Sparkles, Trophy, User, UserPlus, Users, X, ChevronRight, Moon, Plus,
  BarChart3, Calendar, PieChart, Target, Lightbulb, BookMarked, Star,
} from 'lucide-react'
import { colors } from '../../theme/tokens'
import ProfileDropdown from './ProfileDropdown'

/* ═══════════════════════════════════════════════════════════════════
   Role-based icon sets — each role gets its own visual language
   ═══════════════════════════════════════════════════════════════════ */

const adminIcons = {
  Dashboard: <LayoutDashboard size={18} />,
  Trainings: <BookOpen size={18} />,
  Courses: <GraduationCap size={18} />,
  Trainers: <Users size={18} />,
  Participants: <Users size={18} />,
  Feedback: <MessageSquare size={18} />,
  Surveys: <ClipboardList size={18} />,
  'Add Trainer': <UserPlus size={18} />,
  'My Trainings': <BookOpen size={18} />,
  'My Courses': <GraduationCap size={18} />,
  'My Profile': <User size={18} />,
  Available: <BookOpen size={18} />,
  Enrollments: <BookPlus size={18} />,
  'Give Feedback': <MessageSquare size={18} />,
  'My Feedbacks': <MessageSquare size={18} />,
  'AI Quizzes': <Sparkles size={18} />,
  Overview: <PieChart size={18} />,
  Leaderboard: <Trophy size={18} />,
  Achievements: <Award size={18} />,
  Lessons: <FileText size={18} />,
  Coding: <Code size={18} />,
  Profile: <User size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  FileText: <FileText size={18} />,
  Notes: <FileText size={18} />,
  'UserPlus': <UserPlus size={18} />,
  'Enrollment Requests': <UserPlus size={18} />,
  'Trainer Reports': <BarChart3 size={18} />,
}

const trainerIcons = {
  Dashboard: <Home size={18} />,
  Trainings: <BookMarked size={18} />,
  Courses: <BookOpen size={18} />,
  Trainers: <Users size={18} />,
  Participants: <Users size={18} />,
  Feedback: <MessageSquare size={18} />,
  Surveys: <ClipboardList size={18} />,
  'Add Trainer': <UserPlus size={18} />,
  'My Trainings': <BookMarked size={18} />,
  'My Courses': <BookOpen size={18} />,
  'My Profile': <User size={18} />,
  Available: <BookOpen size={18} />,
  Enrollments: <BookPlus size={18} />,
  'Give Feedback': <MessageSquare size={18} />,
  'My Feedbacks': <MessageSquare size={18} />,
  'AI Quizzes': <Sparkles size={18} />,
  Overview: <Home size={18} />,
  Leaderboard: <Trophy size={18} />,
  Achievements: <Award size={18} />,
  Lessons: <FileText size={18} />,
  Coding: <Code size={18} />,
  Profile: <User size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  FileText: <FileText size={18} />,
  Notes: <Lightbulb size={18} />,
  'UserPlus': <UserPlus size={18} />,
  'Enrollment Requests': <UserPlus size={18} />,
  'Trainer Reports': <BarChart3 size={18} />,
}

const participantIcons = {
  Dashboard: <Home size={18} />,
  Trainings: <BookOpen size={18} />,
  Courses: <GraduationCap size={18} />,
  Trainers: <Users size={18} />,
  Participants: <Users size={18} />,
  Feedback: <MessageSquare size={18} />,
  Surveys: <ClipboardList size={18} />,
  'Add Trainer': <UserPlus size={18} />,
  'My Trainings': <BookOpen size={18} />,
  'My Courses': <GraduationCap size={18} />,
  'My Profile': <User size={18} />,
  Available: <BookOpen size={18} />,
  Enrollments: <BookPlus size={18} />,
  'Give Feedback': <MessageSquare size={18} />,
  'My Feedbacks': <MessageSquare size={18} />,
  'AI Quizzes': <Sparkles size={18} />,
  Overview: <Home size={18} />,
  Leaderboard: <Trophy size={18} />,
  Achievements: <Award size={18} />,
  Lessons: <FileText size={18} />,
  Coding: <Code size={18} />,
  Profile: <User size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  FileText: <FileText size={18} />,
  Notes: <FileText size={18} />,
  'UserPlus': <UserPlus size={18} />,
  'Enrollment Requests': <UserPlus size={18} />,
  'Trainer Reports': <BarChart3 size={18} />,
}

const iconSets = { ADMIN: adminIcons, TRAINER: trainerIcons, PARTICIPANT: participantIcons }

/* ── Navigation Structure ─────────────────────────────────────── */
export const navGroups = {
  ADMIN: [
    { title: 'OVERVIEW', items: [{ key: 'overview', label: 'Dashboard', icon: 'Dashboard' }] },
    {
      title: 'MANAGEMENT',
      items: [
        { key: 'pending', label: 'Pending Approval', icon: 'Overview' },
        { key: 'trainings', label: 'Trainings', icon: 'Trainings' },
        { key: 'trainers', label: 'Trainers', icon: 'Trainers' },
        { key: 'participants', label: 'Participants', icon: 'Participants' },
      ],
    },
    {
      title: 'CONTENT',
      items: [
        { key: 'sessions', label: 'Sessions', icon: 'AI Quizzes' },
        { key: 'notes', label: 'Notes', icon: 'Lessons' },
        { key: 'feedback', label: 'Feedback', icon: 'Feedback' },
        { key: 'surveys', label: 'Surveys', icon: 'Surveys' },
      ],
    },
  ],
  TRAINER: [
    { title: 'OVERVIEW', items: [{ key: 'overview', label: 'Dashboard', icon: 'Dashboard' }, { key: 'courses', label: 'My Courses', icon: 'Courses' }] },
    { title: 'CONTENT', items: [{ key: 'notes', label: 'Notes', icon: 'Notes' }, { key: 'assignments', label: 'Assignments', icon: 'ClipboardList' }] },
    { title: 'INSIGHTS', items: [{ key: 'reports', label: 'Reports', icon: 'Trainer Reports' }, { key: 'feedback', label: 'Feedback', icon: 'Feedback' }] },
    { title: 'ACCOUNT', items: [{ key: 'profile', label: 'My Profile', icon: 'My Profile' }] },
  ],
  PARTICIPANT: [
    { title: 'OVERVIEW', items: [{ key: 'overview', label: 'Dashboard', icon: 'Overview' }] },
    { title: 'LEARNING', items: [{ key: 'myEnrollments', label: 'My Courses', icon: 'My Courses' }, { key: 'leaderboard', label: 'Leaderboard', icon: 'Leaderboard' }, { key: 'achievements', label: 'Achievements', icon: 'Achievements' }] },
    { title: 'ACTIVITY', items: [{ key: 'reports', label: 'My Reports', icon: 'Feedback' }, { key: 'certificates', label: 'Certificates', icon: 'Achievements' }, { key: 'feedback', label: 'Give Feedback', icon: 'Give Feedback' }, { key: 'myFeedbacks', label: 'My Feedbacks', icon: 'My Feedbacks' }] },
    { title: 'ACCOUNT', items: [{ key: 'profile', label: 'Profile', icon: 'Profile' }] },
  ],
}

const pageDescriptions = {
  overview: 'Monitor your platform activity and key metrics',
  pending: 'Review and approve pending registrations',
  trainings: 'Manage all training programs',
  trainers: 'Manage trainer accounts and assignments',
  participants: 'View and manage learner accounts',
  sessions: 'Manage assessment and quiz sessions',
  notes: 'Organize course notes and resources',
  feedback: 'View and respond to feedback',
  surveys: 'Create and manage surveys',
  courses: 'Manage your training courses',
  reports: 'View detailed analytics and reports',
  profile: 'Manage your account settings',
  myEnrollments: 'Your enrolled training programs',
  leaderboard: 'See how you rank among learners',
  achievements: 'Your badges and accomplishments',
  certificates: 'Download your completion certificates',
  myFeedbacks: 'Feedback you\'ve submitted',
  assignments: 'Manage course assignments',
}

export { pageDescriptions }

const initials = (name) =>
  name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

export default function Sidebar({ user, activeTab, onTabChange, onLogout, onCloseSidebar, sidebarOpen, onOpenSidebar }) {
  const groups = navGroups[user.role] || []
  const isParticipant = user.role === 'PARTICIPANT'
  const icons = iconSets[user.role] || adminIcons

  const currentPageLabel = (() => {
    for (const group of groups) {
      const found = group.items.find(i => i.key === activeTab)
      if (found) return found.label
    }
    return 'Dashboard'
  })()

  const roleClass = user.role === 'ADMIN' ? 'admin' : user.role === 'TRAINER' ? 'trainer' : 'participant'

  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: 90,
            }}
            onClick={onCloseSidebar}
          />
        )}
      </AnimatePresence>

      <aside 
        className={`enterprise-sidebar enterprise-sidebar--${roleClass} ${sidebarOpen ? 'open' : ''}`}
        style={{ transform: sidebarOpen ? 'translateX(0)' : undefined }}
      >
        {/* Header */}
        <div className="enterprise-sidebar__header">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 3 }}
            whileTap={{ scale: 0.95 }}
            className={`enterprise-sidebar__logo enterprise-sidebar__logo--${roleClass}`}
          >
            W
          </motion.div>
          <div className="enterprise-sidebar__brand">
            <span className="enterprise-sidebar__brand-name" style={{ color: isParticipant ? 'var(--neutral-900)' : 'white' }}>
              WAVE INIT
            </span>
            <span className="enterprise-sidebar__brand-tagline" style={{ color: isParticipant ? 'var(--neutral-400)' : 'rgba(255,255,255,0.5)' }}>
              {user.role === 'ADMIN' ? 'Admin Portal' : user.role === 'TRAINER' ? 'Trainer Hub' : 'Learning Portal'}
            </span>
          </div>
          <button
            onClick={onCloseSidebar}
            style={{
              position: 'relative',
              zIndex: 1,
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: isParticipant ? 'var(--neutral-100)' : 'rgba(255,255,255,0.1)',
              color: isParticipant ? 'var(--neutral-500)' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="enterprise-sidebar__nav">
          {groups.map((group, gi) => (
            <div key={gi} className="enterprise-sidebar__group">
              <div className="enterprise-sidebar__group-label" style={{ color: isParticipant ? 'var(--neutral-400)' : 'rgba(255,255,255,0.4)' }}>
                {group.title}
              </div>
              {group.items.map((item) => {
                const isActive = activeTab === item.key
                const itemColor = isParticipant 
                  ? (isActive ? 'var(--brand-participant-dark)' : 'var(--neutral-600)')
                  : (isActive ? 'white' : 'rgba(255,255,255,0.6)')
                
                return (
                  <motion.button
                    key={item.key}
                    className={`enterprise-sidebar__item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (item.key === 'profile' && user?.role === 'TRAINER') {
                        onTabChange('profile')
                      } else {
                        onTabChange(item.key)
                      }
                      onCloseSidebar && onCloseSidebar()
                    }}
                    whileTap={{ scale: 0.98 }}
                    style={isActive && !isParticipant ? {
                      background: 'rgba(255, 255, 255, 0.12)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    } : undefined}
                  >
                    <span className="enterprise-sidebar__item-icon" style={{ color: itemColor }}>
                      {icons[item.icon] || icons.Dashboard}
                    </span>
                    <span style={{ color: itemColor }}>{item.label}</span>
                  </motion.button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="enterprise-sidebar__footer">
          <ProfileDropdown
            user={user}
            onProfile={() => onTabChange('profile')}
            onLogout={onLogout}
          />
        </div>
      </aside>

      {/* Mobile toggle */}
      {!sidebarOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenSidebar}
          aria-label="Open navigation menu"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-xl)',
            border: 'none',
            background: 'var(--neutral-900)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 80,
          }}
        >
          <Menu size={20} />
        </motion.button>
      )}
    </>
  )
}
