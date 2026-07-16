import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, BookPlus, ClipboardList, Code, FileText, GraduationCap, Home,
  MessageSquare, Bell, Settings, Shield, Sparkles, Trophy, User, UserPlus, Users, X,
  BarChart3, Calendar, PieChart, Lightbulb, BookMarked, Award,
  Menu, TrendingUp, Target, LogOut, ChevronDown
} from 'lucide-react'
import ProfileDropdown from './ProfileDropdown'

const initials = (name) =>
  name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

const roleIcons = {
  ADMIN: {
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
    UserPlus: <UserPlus size={18} />,
    'Enrollment Requests': <UserPlus size={18} />,
    'Trainer Reports': <BarChart3 size={18} />,
  },
  TRAINER: {
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
    UserPlus: <UserPlus size={18} />,
    'Enrollment Requests': <UserPlus size={18} />,
    'Trainer Reports': <BarChart3 size={18} />,
  },
  PARTICIPANT: {
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
    UserPlus: <UserPlus size={18} />,
    'Enrollment Requests': <UserPlus size={18} />,
    'Trainer Reports': <BarChart3 size={18} />,
  },
}

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
        { key: 'bulkImport', label: 'Bulk Import', icon: 'Participants' },
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
  bulkImport: 'Bulk import participants from Excel files',
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

export default function Sidebar({ user, activeTab, onTabChange, onLogout, onCloseSidebar, sidebarOpen, onOpenSidebar }) {
  const groups = navGroups[user.role] || []
  const icons = roleIcons[user.role] || roleIcons.PARTICIPANT
  const isTrainer = user.role === 'TRAINER'
  const isAdmin = user.role === 'ADMIN'

  const roleLabel = user.role === 'ADMIN' ? 'Admin' : user.role === 'TRAINER' ? 'Trainer' : 'Learner'
  const roleColor = isAdmin ? '#7c3aed' : isTrainer ? '#0d9488' : '#16a34a'

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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
          <nav className="wl-sidebar-nav">
            {groups.map((group, gi) => (
              <div key={gi} className="wl-sidebar-group">
                <div className="wl-sidebar-group-label">{group.title}</div>
                {group.items.map((item) => {
                  const isActive = activeTab === item.key
                  return (
                    <button
                      key={item.key}
                      className={`wl-sidebar-item ${isActive ? 'wl-sidebar-item--active' : ''}`}
                      onClick={() => {
                        if (item.key === 'profile' && user?.role === 'TRAINER') {
                          onTabChange('profile')
                        } else {
                          onTabChange(item.key)
                        }
                        onCloseSidebar && onCloseSidebar()
                      }}
                    >
                      <span className="wl-sidebar-item-icon">
                        {icons[item.icon] || icons.Dashboard}
                      </span>
                      <span>{item.label}</span>
                    </button>
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
          className="wl-sidebar-mobile-toggle"
        >
          <Menu size={20} />
        </motion.button>
      )}
    </>
  )
}
