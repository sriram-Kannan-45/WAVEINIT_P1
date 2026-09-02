import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    Award,
    BookOpen,
    ChevronDown,
    Clock,
    FileText,
    GraduationCap,
    LayoutDashboard,
    Menu,
    Search,
    Trophy,
    User,
    UserCheck,
    Users,
    Video,
    Calendar,
    MessageSquare,
    TrendingUp,
    BarChart2,
    ShieldCheck,
    X
} from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { API } from '../../api/api'
import ProfileDropdown from './ProfileDropdown'
import { WaveInitLogoIcon } from '../common/WaveInitLogo'
import { getTwoLetterInitials } from '../common/UserAvatar'

const ROLE_HOME = {
  ADMIN: '/admin',
  TRAINER: '/trainer',
  PARTICIPANT: '/participant',
}

const initials = (name) => getTwoLetterInitials(name)

const navGroups = {
  ADMIN: [
    {
      title: 'OVERVIEW',
      items: [
        { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'MANAGEMENT',
      items: [
        { key: 'trainings', label: 'Training Programs', icon: BookOpen },
        { key: 'trainers', label: 'Trainers', icon: UserCheck },
        { key: 'participants', label: 'Participants', icon: Users },
      ],
    },
    {
      title: 'ACADEMICS & FEEDBACK',
      items: [
        { key: 'attendance', label: 'Attendance Center', icon: Calendar },
        { key: 'feedback', label: 'Feedback & Sentiment', icon: MessageSquare },
      ],
    },
    {
      title: 'INTERVIEWS',
      items: [
        { key: 'interviews', label: 'Interviews', icon: Video },
      ],
    },
    {
      title: 'ANALYTICS',
      items: [
        { key: 'reports', label: 'Reports & Analytics', icon: BarChart2 },
      ],
    },
  ],
  TRAINER: [
    {
      title: 'OVERVIEW',
      items: [
        { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'TEACHING & CLASSES',
      items: [
        { key: 'courses', label: 'My Trainings', icon: GraduationCap },
        { key: 'attendance', label: 'Attendance', icon: Calendar },
        { key: 'feedback', label: 'Student Feedback', icon: MessageSquare },
      ],
    },
    {
      title: 'PERFORMANCE',
      items: [
        { key: 'analytics', label: 'Performance Analytics', icon: BarChart2 },
        { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
      ],
    },
    {
      title: 'INTERVIEWS',
      items: [
        { key: 'interviews', label: 'Interviews', icon: Video },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { key: 'profile', label: 'My Profile', icon: User },
      ],
    },
  ],
  PARTICIPANT: [
    {
      title: 'OVERVIEW',
      items: [
        { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'LEARNING',
      items: [
        { key: 'myEnrollments', label: 'My Courses', icon: GraduationCap },
        { key: 'attendance', label: 'Attendance', icon: Calendar },
        { key: 'progress', label: 'Progress & Analytics', icon: TrendingUp },
      ],
    },
    {
      title: 'ASSESSMENTS & RANKING',
      items: [
        { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
        { key: 'achievements', label: 'Achievements', icon: Award },
      ],
    },
    {
      title: 'ACTIVITY & RECORDS',
      items: [
        { key: 'certificates', label: 'Certificates', icon: Award },
        { key: 'feedback', label: 'Feedback', icon: MessageSquare },
      ],
    },
    {
      title: 'INTERVIEWS',
      items: [
        { key: 'interviews', label: 'Interviews', icon: Video },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { key: 'profile', label: 'Profile', icon: User },
      ],
    },
  ],
}

const pageDescriptions = {
  overview: 'Monitor your platform activity and key metrics',
  trainings: 'Manage all training programs',
  trainers: 'Manage trainer accounts and assignments',
  participants: 'View and manage learner accounts',
  courses: 'Manage your training courses',
  attendance: 'Track class participation and attendance rates',
  feedback: 'Course ratings and student sentiment',
  progress: 'Track your overall milestones and skill strengths',
  profile: 'Manage your account settings',
  myEnrollments: 'Your enrolled training programs',
  leaderboard: 'See how you rank among learners',
  achievements: 'Your badges and accomplishments',
  certificates: 'Download your completion certificates',
  interviews: 'Schedule and manage interviews',
  analytics: 'Detailed learner performance metrics and pass rates',
  reports: 'Organization-wide reports and statistics',
}

export { navGroups, pageDescriptions }

export default function Sidebar({ user, activeTab, onTabChange, onLogout, onCloseSidebar, sidebarOpen, onOpenSidebar }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const groups = navGroups[user.role] || []
  const isAdmin = user.role === 'ADMIN'
  const isTrainer = user.role === 'TRAINER'

  const [courses, setCourses] = useState([])
  const [coursesOpen, setCoursesOpen] = useState(true)
  const [courseFilter, setCourseFilter] = useState('')

  // Hydrate assigned courses from cache and revalidate in background
  useEffect(() => {
    let aborted = false
    const cacheKey = user?.role === 'TRAINER' ? `trainer_courses_${user?.id}` : `participant_courses_${user?.id}`
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCourses(parsed)
        }
      }
    } catch (_) {}

    const fetchAssignedCourses = async () => {
      if (!user?.token) return
      try {
        let endpoint = ''
        if (user.role === 'TRAINER') endpoint = API.TRAINER_COURSES.LIST
        else if (user.role === 'PARTICIPANT') endpoint = API.PARTICIPANT_COURSES.LIST
        if (!endpoint) return

        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const data = await res.json()
        if (!aborted && data.success && Array.isArray(data.courses)) {
          const normalized = data.courses.map(c => ({
            ...c,
            id: c.id ?? c.courseId,
            courseId: c.courseId ?? c.id
          }))
          setCourses(normalized)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(normalized))
          } catch (_) {}
        }
      } catch (err) {
        console.error('Sidebar failed to fetch assigned courses:', err.message)
      }
    }
    fetchAssignedCourses()
    return () => { aborted = true }
  }, [user?.token, user?.role, user?.id])

  const filteredCourses = useMemo(() => {
    if (!courseFilter) return courses
    const q = courseFilter.toLowerCase()
    return courses.filter(c => (c.title || '').toLowerCase().includes(q))
  }, [courses, courseFilter])

  const roleLabel = user.role === 'ADMIN' ? 'Admin' : user.role === 'TRAINER' ? 'Trainer' : 'Learner'

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

      <aside className={`wl-sidebar ${sidebarOpen ? 'wl-sidebar--open' : ''}`} id="main-sidebar">
        <div className="wl-sidebar-inner">
          {/* Logo Header */}
          <div className="wl-sidebar-logo">
            <div className="wl-sidebar-logo-mark" onClick={() => navigate(ROLE_HOME[user.role] || '/')}>
              <WaveInitLogoIcon size={24} color="#16A34A" />
            </div>
            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(ROLE_HOME[user.role] || '/')}>
              <div className="wl-sidebar-brand">WAVE INIT LMS</div>
              <div className="wl-sidebar-tagline">{roleLabel} Portal</div>
            </div>
            {onCloseSidebar && (
              <button
                type="button"
                className="wl-sidebar-close"
                onClick={onCloseSidebar}
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="wl-sidebar-nav" id="sidebar-nav">
            {groups.map((group, gi) => (
              <div key={gi} className="wl-sidebar-group">
                <div className="wl-sidebar-group-label">{group.title}</div>
                {group.items.map((item) => {
                  const isProfileRoute = location.pathname === '/my-profile' || location.pathname === '/trainer/profile'
                  const isInterviewRoute = location.pathname.startsWith('/interview')
                  const currentActive = isProfileRoute ? 'profile' : (isInterviewRoute ? 'interviews' : activeTab)
                  const isActive = currentActive === item.key
                  const Icon = item.icon
                  const isCourseItem = item.key === 'courses' || item.key === 'myEnrollments'

                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column' }}>
                      <motion.button
                        className={`wl-sidebar-item ${isActive ? 'wl-sidebar-item--active' : ''}`}
                        onClick={() => {
                          if (isCourseItem && courses.length > 0) {
                            setCoursesOpen(prev => !prev)
                          }
                          if (item.key === 'profile') {
                            navigate('/my-profile')
                          } else if (item.key === 'interviews') {
                            navigate('/interviews')
                          } else {
                            const home = ROLE_HOME[user?.role] || '/admin'
                            const params = new URLSearchParams()
                            params.set('tab', item.key)
                            navigate({ pathname: home, search: params.toString() })
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
                        <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>

                        {isCourseItem && courses.length > 0 && (
                          <>
                            <span className="wl-sidebar-count-badge">
                              {courses.length}
                            </span>
                            <span
                              className={`wl-sidebar-chevron ${coursesOpen ? 'wl-sidebar-chevron--open' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setCoursesOpen(prev => !prev)
                              }}
                            >
                              <ChevronDown size={14} />
                            </span>
                          </>
                        )}
                      </motion.button>

                      {/* Expandable Scrollable Course Menu */}
                      <AnimatePresence>
                        {isCourseItem && coursesOpen && courses.length > 0 && (
                          <motion.div
                            className="wl-sidebar-submenu-box"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            {courses.length >= 4 && (
                              <div className="wl-sidebar-submenu-search">
                                <Search size={11} color="#94A3B8" />
                                <input
                                  type="text"
                                  placeholder="Filter courses..."
                                  value={courseFilter}
                                  onChange={(e) => setCourseFilter(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                            <div className="wl-sidebar-submenu-scroll">
                              {filteredCourses.map((c) => {
                                const targetCourseId = c.id ?? c.courseId
                                const activeCourseId = searchParams.get('courseId')
                                const isSelected = activeCourseId && (
                                  Number(activeCourseId) === targetCourseId ||
                                  activeCourseId === String(targetCourseId)
                                )
                                return (
                                  <button
                                    key={targetCourseId || c.title}
                                    type="button"
                                    className={`wl-sidebar-course-item ${isSelected ? 'wl-sidebar-course-item--active' : ''}`}
                                    title={c.title}
                                    onClick={() => {
                                      const home = ROLE_HOME[user?.role] || '/admin'
                                      const params = new URLSearchParams()
                                      params.set('tab', item.key)
                                      if (targetCourseId) {
                                        params.set('courseId', String(targetCourseId))
                                      }
                                      navigate({ pathname: home, search: params.toString() })
                                      onCloseSidebar && onCloseSidebar()
                                    }}
                                  >
                                    <span className="wl-sidebar-course-dot" />
                                    <span className="wl-sidebar-course-name">{c.title}</span>
                                    {c.lessonCount != null && (
                                      <span className="wl-sidebar-course-badge">{c.lessonCount}L</span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                            <button
                              type="button"
                              className="wl-sidebar-view-all"
                              onClick={() => {
                                const home = ROLE_HOME[user?.role] || '/admin'
                                const params = new URLSearchParams()
                                params.set('tab', item.key)
                                navigate({ pathname: home, search: params.toString() })
                                onCloseSidebar && onCloseSidebar()
                              }}
                            >
                              View all ({courses.length}) courses &rarr;
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
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
