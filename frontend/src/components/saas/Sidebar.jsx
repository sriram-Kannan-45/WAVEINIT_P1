import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, ClipboardList, FileText, GraduationCap,
  MessageSquare, Trophy, User, Users, X,
  BarChart3, Calendar, Award,
  Menu, AppWindow, CircleCheck,
  UserCheck, ClipboardCheck, NotebookPen,
  UserCog, ShieldCheck
} from 'lucide-react'
import ProfileDropdown from './ProfileDropdown'

const initials = (name) =>
  name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

const navGroups = {
  ADMIN: [
    {
      title: 'Overview',
      items: [
        { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Management',
      items: [
        { key: 'applications', label: 'Applications', icon: AppWindow },
        { key: 'trainings', label: 'Training Programs', icon: BookOpen },
        { key: 'courseManagement', label: 'Course Management', icon: GraduationCap },
        { key: 'trainers', label: 'Trainers', icon: UserCheck },
        { key: 'participants', label: 'Participants', icon: Users },
      ],
    },
    {
      title: 'Content',
      items: [
        { key: 'sessions', label: 'Sessions', icon: Calendar },
        { key: 'assignments', label: 'Assignments', icon: ClipboardCheck },
        { key: 'notes', label: 'Notes', icon: NotebookPen },
        { key: 'surveys', label: 'Surveys', icon: ClipboardList },
      ],
    },
    {
      title: 'Reports',
      items: [
        { key: 'feedback', label: 'Feedback', icon: MessageSquare },
        { key: 'reports', label: 'Analytics', icon: BarChart3 },
      ],
    },
    {
      title: 'Settings',
      items: [
        { key: 'bulkImport', label: 'User Management', icon: UserCog },
        { key: 'programs', label: 'Roles & Permissions', icon: ShieldCheck },
      ],
    },
  ],
  TRAINER: [
    { title: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: LayoutDashboard }, { key: 'courses', label: 'My Courses', icon: GraduationCap }] },
    { title: 'Content', items: [{ key: 'credentials', label: 'Participant Credentials', icon: FileText }, { key: 'notes', label: 'Notes', icon: NotebookPen }, { key: 'assignments', label: 'Assignments', icon: ClipboardCheck }] },
    { title: 'Insights', items: [{ key: 'reports', label: 'Reports', icon: BarChart3 }, { key: 'feedback', label: 'Feedback', icon: MessageSquare }] },
    { title: 'Account', items: [{ key: 'profile', label: 'My Profile', icon: User }] },
  ],
  PARTICIPANT: [
    { title: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: LayoutDashboard }] },
    { title: 'Learning', items: [{ key: 'myEnrollments', label: 'My Courses', icon: GraduationCap }, { key: 'leaderboard', label: 'Leaderboard', icon: Trophy }, { key: 'achievements', label: 'Achievements', icon: Award }] },
    { title: 'Activity', items: [{ key: 'reports', label: 'My Reports', icon: BarChart3 }, { key: 'certificates', label: 'Certificates', icon: Award }, { key: 'feedback', label: 'Give Feedback', icon: MessageSquare }, { key: 'myFeedbacks', label: 'My Feedbacks', icon: MessageSquare }] },
    { title: 'Account', items: [{ key: 'profile', label: 'Profile', icon: User }] },
  ],
}

const pageDescriptions = {
  overview: 'Monitor your platform activity and key metrics',
  applications: 'Review and manage registration applications',
  trainings: 'Manage all training programs',
  courseManagement: 'Organize courses within training programs',
  trainers: 'Manage trainer accounts and assignments',
  participants: 'View and manage learner accounts',
  bulkImport: 'Bulk import participants from Excel files',
  sessions: 'Manage assessment and quiz sessions',
  assignments: 'Manage course assignments',
  notes: 'Organize course notes and resources',
  feedback: 'View and respond to feedback',
  surveys: 'Create and manage surveys',
  courses: 'Manage your training courses',
  credentials: 'Send login credentials to participants',
  reports: 'View detailed analytics and reports',
  profile: 'Manage your account settings',
  myEnrollments: 'Your enrolled training programs',
  leaderboard: 'See how you rank among learners',
  achievements: 'Your badges and accomplishments',
  certificates: 'Download your completion certificates',
  myFeedbacks: 'Feedback you\'ve submitted',
}

export { pageDescriptions }
export { navGroups }

export default function Sidebar({ user, activeTab, onTabChange, onLogout, onCloseSidebar, sidebarOpen, onOpenSidebar }) {
  const navigate = useNavigate()
  const groups = navGroups[user.role] || []
  const isAdmin = user.role === 'ADMIN'
  const isTrainer = user.role === 'TRAINER'

  const roleLabel = user.role === 'ADMIN' ? 'Admin' : user.role === 'TRAINER' ? 'Trainer' : 'Learner'
  const avatarGradient = isAdmin
    ? 'linear-gradient(135deg, #16A34A, #22C55E)'
    : isTrainer
    ? 'linear-gradient(135deg, #16A34A, #22C55E)'
    : 'linear-gradient(135deg, #22C55E, #4ADE80)'

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
              background: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(4px)',
              zIndex: 90,
            }}
            onClick={onCloseSidebar}
          />
        )}
      </AnimatePresence>

      <aside
        className={`wl-sidebar ${sidebarOpen ? 'wl-sidebar--open' : ''}`}
        style={{ transform: sidebarOpen ? 'translateX(0)' : undefined }}
      >
        <div className="wl-sidebar-inner">
          {/* Logo Header */}
          <div className="wl-sidebar-logo">
            <div className="wl-sidebar-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="wl-sidebar-brand">Wave Init</div>
              <div className="wl-sidebar-tagline">{roleLabel} Portal</div>
            </div>
            <button onClick={onCloseSidebar} className="wl-sidebar-close">
              <X size={14} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="wl-sidebar-nav" id="sidebar-nav">
            {groups.map((group, gi) => (
              <div key={gi} className="wl-sidebar-group">
                <div className="wl-sidebar-group-label">{group.title}</div>
                {group.items.map((item) => {
                  const isActive = activeTab === item.key
                  const Icon = item.icon
                  return (
                    <motion.button
                      key={item.key}
                      className={`wl-sidebar-item ${isActive ? 'wl-sidebar-item--active' : ''}`}
                      onClick={() => {
                        if (item.key === 'profile') {
                          navigate('/my-profile')
                        } else {
                          onTabChange(item.key)
                        }
                        onCloseSidebar && onCloseSidebar()
                      }}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                    >
                      <span className="wl-sidebar-item-icon">
                        <Icon size={18} strokeWidth={isActive ? 2 : 1.8} />
                      </span>
                      <span>{item.label}</span>
                    </motion.button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Profile Card Fixed at Bottom */}
        <div className="wl-sidebar-footer">
          <ProfileDropdown
            user={user}
            onProfile={() => navigate('/my-profile')}
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
          className="wl-sidebar-mobile-toggle"
        >
          <Menu size={20} />
        </motion.button>
      )}
    </>
  )
}
