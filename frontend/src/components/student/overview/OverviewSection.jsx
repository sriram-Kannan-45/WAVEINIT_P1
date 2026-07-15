import { motion } from 'framer-motion'
import { BookOpen, TrendingUp, Award, Clock, ArrowRight, Sparkles, BarChart3, ChevronRight, Trophy, Target } from 'lucide-react'
import { useStudentStats } from '../../../hooks/useStudentStats'
import { useContinueLearning } from '../../../hooks/useContinueLearning'
import { LineAreaChart } from '../../ui/ChartWrappers'

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
}

const fadeVariant = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function OverviewSection({
  user,
  trainings = [],
  enrollments = [],
  quizzes = [],
  onGoToCourses,
  onResume,
  onClickCourse,
  onClickQuiz,
}) {
  const { stats, loading } = useStudentStats()

  const enrolledCount = enrollments.length
  const completedCount = enrollments.filter(e => e.status === 'COMPLETED').length
  const quizCount = quizzes.length
  const avgScore = stats?.averageScore ?? 0

  const { continueLearning } = useContinueLearning()
  const recentItems = (continueLearning || []).slice(0, 4)

  const chartData = [
    { name: 'Week 1', score: 45 },
    { name: 'Week 2', score: 62 },
    { name: 'Week 3', score: 58 },
    { name: 'Week 4', score: 78 },
    { name: 'Week 5', score: 72 },
    { name: 'Week 6', score: 85 },
    { name: 'Week 7', score: 88 },
  ]

  const statCards = [
    { label: 'Enrolled Courses', value: enrolledCount, icon: BookOpen, bg: '#f0fdf4', color: '#16a34a' },
    { label: 'Completed Courses', value: completedCount, icon: TrendingUp, bg: '#f0f9ff', color: '#0284c7' },
    { label: 'Average Score', value: avgScore > 0 ? `${avgScore}%` : '—', icon: BarChart3, bg: '#fffbeb', color: '#d97706' },
    { label: 'Certificates', value: quizCount, icon: Award, bg: '#faf5ff', color: '#9333ea' },
  ]

  const recentActivity = [
    { id: 1, text: 'You completed a lesson in React Fundamentals', time: '2 hours ago', color: '#16a34a' },
    { id: 2, text: 'New quiz available: Advanced JavaScript', time: '5 hours ago', color: '#3b82f6' },
    { id: 3, text: 'Certificate earned for Node.js Basics', time: '1 day ago', color: '#9333ea' },
    { id: 4, text: 'Course progress updated: Python Essentials', time: '2 days ago', color: '#d97706' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Section */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" className="wl-welcome">
        <div>
          <h1 className="wl-welcome-title">
            Welcome back, {user?.name?.split(' ')[0] || 'Student'} 👋
          </h1>
          <p className="wl-welcome-sub">
            Track your learning progress and continue where you left off.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onGoToCourses}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            background: '#16a34a',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-primary)',
            transition: 'background 150ms ease',
            flexShrink: 0,
          }}
        >
          <BookOpen size={16} />
          Browse Courses
        </motion.button>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" className="wl-stat-grid">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: i * 0.06 }}
            className="wl-stat-card"
            whileHover={{ y: -2 }}
          >
            <div className="wl-stat-card-icon" style={{ background: s.bg, color: s.color }}>
              <s.icon size={20} />
            </div>
            <div>
              <div className="wl-stat-card-value">{s.value}</div>
              <div className="wl-stat-card-label">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Content Grid: Chart + Activity | Continue Learning */}
      <div className="wl-content-grid">
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Learning Progress Chart */}
          <motion.div variants={itemVariants} initial="hidden" animate="visible" className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Learning Progress</h3>
              <select style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none' }}>
                <option>This Month</option>
                <option>This Week</option>
                <option>Last Quarter</option>
              </select>
            </div>
            <div className="wl-chart-container">
              <LineAreaChart
                data={chartData}
                xKey="name"
                yKey="score"
                height={200}
                strokeColor="#16a34a"
                fillColorStart="#bbf7d0"
                fillColorEnd="#f0fdf4"
              />
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div variants={itemVariants} initial="hidden" animate="visible" className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Recent Activity</h3>
            </div>
            <div className="wl-dash-card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentActivity.map((act) => (
                  <div key={act.id} className="wl-activity-item">
                    <div className="wl-activity-dot" style={{ background: act.color }} />
                    <div style={{ flex: 1 }}>
                      <div className="wl-activity-text">{act.text}</div>
                      <div className="wl-activity-time">{act.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Continue Learning */}
          <motion.div variants={itemVariants} initial="hidden" animate="visible" className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Continue Learning</h3>
              <button className="wl-dash-card-link" onClick={onClickCourse}>
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="wl-dash-card-body" style={{ padding: '12px 16px 16px' }}>
              {recentItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  No recent activity yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="wl-course-card"
                      onClick={() => onResume?.(item)}
                    >
                      <div className="wl-course-card-icon" style={{
                        background: item.type === 'course' ? '#f0fdf4' : item.type === 'quiz' ? '#f0f9ff' : '#faf5ff',
                        color: item.type === 'course' ? '#16a34a' : item.type === 'quiz' ? '#3b82f6' : '#9333ea',
                      }}>
                        {item.type === 'course' ? <BookOpen size={18} /> : item.type === 'quiz' ? <Sparkles size={18} /> : <FileText size={18} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="wl-course-card-title">{item.title}</div>
                        <div className="wl-course-card-meta">
                          {item.type === 'course' ? 'Course' : item.type === 'quiz' ? 'Quiz' : 'Lesson'} · {item.subtitle || ''}
                        </div>
                      </div>
                      <ArrowRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Upcoming Classes */}
          <motion.div variants={itemVariants} initial="hidden" animate="visible" className="wl-dash-card">
            <div className="wl-dash-card-header">
              <h3 className="wl-dash-card-title">Upcoming Classes</h3>
            </div>
            <div className="wl-dash-card-body" style={{ padding: '8px 16px 16px' }}>
              {[
                { date: '16', month: 'JUL', title: 'React Advanced Concepts', time: '10:00 AM - 12:00 PM' },
                { date: '18', month: 'JUL', title: 'Node.js Best Practices', time: '02:00 PM - 04:00 PM' },
                { date: '20', month: 'JUL', title: 'Python Data Structures', time: '11:00 AM - 01:00 PM' },
              ].map((s, idx) => (
                <div key={idx} className="wl-session-card">
                  <div className="wl-session-date">
                    <span className="wl-session-date-month">{s.month}</span>
                    <span className="wl-session-date-day">{s.date}</span>
                  </div>
                  <div className="wl-session-info">
                    <div className="wl-session-title">{s.title}</div>
                    <div className="wl-session-time">{s.time}</div>
                  </div>
                  <span className="wl-session-badge">+ Live</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function FileText({ size = 18, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" x2="8" y1="13" y2="13"/>
      <line x1="16" x2="8" y1="17" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
