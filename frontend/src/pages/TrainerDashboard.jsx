import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Users, Star, FileText, CheckCircle, Clock, MessageSquare,
  TrendingUp, BookOpen, Award, ArrowRight, Activity, Video, Plus, Code, Layers, Sparkles, Coffee
} from 'lucide-react'
import { LineAreaChart } from '../components/ui/ChartWrappers'
import NotesSection from '../components/trainer/notes/NotesSection'
import ParticipantProfileView from '../components/shared/ParticipantProfileView'
import TrainerCourses from './TrainerCourses'
import ParticipantCredentials from '../components/trainer/ParticipantCredentials'
import { useToast } from '../components/Toast'
import Pagination from '../components/Pagination'
import { Button, Badge, EmptyState, StatCard, ProgressBar } from '../components/ui'
import { API_BASE } from '../api/api'

const API = API_BASE

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } }
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
}

function TrainerDashboard({ user, onLogout, activeTab, onTabChange }) {
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const tab = activeTab === 'trainings' ? 'courses' : (activeTab || 'overview')
  const [trainings, setTrainings] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [stats, setStats] = useState({
    totalTrainings: 0, avgTrainerRating: 0, totalFeedbacks: 0,
    totalLearners: 0, publishedCourses: 0,
  })
  const [feedbackPage, setFeedbackPage] = useState(1)
  const feedbackItemsPerPage = 5
  const [recentActivity, setRecentActivity] = useState([])
  const [replyModal, setReplyModal] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [viewingParticipant, setViewingParticipant] = useState(null)
  const [trainerReport, setTrainerReport] = useState(null)

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` })

  const fetchTrainerReport = async () => {
    try {
      const r = await fetch(`${API}/reports/trainer`, { headers: auth() })
      const d = await r.json()
      if (r.ok && d.success) setTrainerReport(d.data)
    } catch (e) { console.error('fetchTrainerReport error:', e.message) }
  }

  const handleRegenerateCertificate = async () => {
    try {
      const r = await fetch(`${API}/trainer/certificates/regenerate`, { method: 'POST', headers: auth() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      success('Certificate check/regeneration triggered!')
      fetchTrainerReport()
    } catch (e) { showError(e.message) }
  }

  useEffect(() => { fetchTrainings(); fetchFeedbacks() }, [])
  useEffect(() => { if (tab === 'reports') fetchTrainerReport() }, [tab])

  const fetchTrainings = async () => {
    try {
      const r = await fetch(`${API}/trainer/trainings`, { headers: auth() })
      const d = await r.json()
      const list = d.trainings || []
      setTrainings(list)
      const published = list.filter(t => t.status === 'PUBLISHED').length
      const totalLearners = list.reduce((sum, t) => sum + (t.enrolledCount || t.participantCount || 0), 0)
      setStats(p => ({ ...p, totalTrainings: list.length, publishedCourses: published, totalLearners }))
      const activities = list.slice(0, 8).map((t, i) => ({
        id: i, type: 'course', icon: BookOpen,
        color: t.status === 'PUBLISHED' ? '#16a34a' : '#d97706',
        message: `"${t.title}" is ${t.status === 'PUBLISHED' ? 'published' : 'in draft'}`,
        time: t.updatedAt || t.createdAt,
      }))
      setRecentActivity(activities)
    } catch (e) { console.error('fetchTrainings error:', e.message) }
  }

  const fetchFeedbacks = async () => {
    try {
      const r = await fetch(`${API}/trainer/feedbacks`, { headers: auth() })
      const d = await r.json()
      const list = d.feedbacks || []
      setFeedbacks(list)
      setStats(p => ({ ...p, avgTrainerRating: d.averageTrainerRating || 0, totalFeedbacks: list.length }))
    } catch (e) { console.error('fetchFeedbacks error:', e.message) }
  }

  const handleReply = async (e) => {
    e.preventDefault()
    try {
      const r = await fetch(`${API}/feedback/${replyModal.id}/reply`, {
        method: 'POST', headers: auth(), body: JSON.stringify({ trainerResponse: replyText })
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.success === false) { showError(d.error || 'Failed to save reply'); return }
      success('Reply submitted!')
      setReplyModal(null); setReplyText(''); fetchFeedbacks()
    } catch (e) { showError(e.message) }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
  const fmtTimeAgo = (d) => {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }
  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'
  const Stars = ({ v }) => (
    <span style={{ display: 'flex', gap: '2px' }}>
      {[1,2,3,4,5].map(s => (
        <Star key={s} size={13} style={{ color: s <= v ? '#f59e0b' : '#e5e7eb', fill: s <= v ? '#f59e0b' : 'none' }} />
      ))}
    </span>
  )

  const paginatedFeedbacks = [...feedbacks].slice(
    (feedbackPage - 1) * feedbackItemsPerPage,
    feedbackPage * feedbackItemsPerPage
  )
  const totalFeedbackPages = Math.ceil(feedbacks.length / feedbackItemsPerPage)

  const chartData = [
    { name: 'Week 1', enrollments: 8 },
    { name: 'Week 2', enrollments: 12 },
    { name: 'Week 3', enrollments: 10 },
    { name: 'Week 4', enrollments: 18 },
    { name: 'Week 5', enrollments: 15 },
    { name: 'Week 6', enrollments: 22 },
    { name: 'Week 7', enrollments: 20 },
  ]

  const overviewStatCards = [
    { label: 'Total Courses', value: stats.totalTrainings, icon: BookOpen, bg: '#f0f9ff', color: '#0284c7' },
    { label: 'Active Learners', value: stats.totalLearners, icon: Users, bg: '#f0fdf4', color: '#16a34a' },
    { label: 'Average Rating', value: stats.avgTrainerRating ? Number(stats.avgTrainerRating).toFixed(1) : '—', icon: Star, bg: '#fffbeb', color: '#d97706' },
    { label: 'Feedback Received', value: stats.totalFeedbacks, icon: MessageSquare, bg: '#faf5ff', color: '#9333ea' },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Welcome Banner (only on overview tab) ── */}
      {tab === 'overview' && (
        <>
          <motion.div variants={item} className="wl-welcome">
            <div>
              <h1 className="wl-welcome-title">
                Welcome back, {user.name?.split(' ')[0] || 'Trainer'} 👋
              </h1>
              <p className="wl-welcome-sub">
                Here's what's happening with your trainings today.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onTabChange('reports')}
                style={{
                  padding: '10px 20px', borderRadius: 10,
                  border: '1px solid #e5e7eb', background: '#fff',
                  color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-primary)',
                  transition: 'all 150ms ease',
                }}
              >
                View Reports
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onTabChange('profile')}
                style={{
                  padding: '10px 20px', borderRadius: 10,
                  border: 'none', background: '#16a34a',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-primary)',
                  transition: 'all 150ms ease',
                }}
              >
                My Profile
              </motion.button>
            </div>
          </motion.div>

          {/* KPI Cards */}
          <motion.div variants={item} className="wl-stat-grid">
            {overviewStatCards.map((s, i) => (
              <motion.div key={s.label} className="wl-stat-card" whileHover={{ y: -2 }} transition={{ delay: i * 0.05 }}>
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
        </>
      )}

      {/* Overview Grid Layout */}
      {tab === 'overview' && (
        <div className="wl-content-grid">
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Course Analytics Chart */}
            <motion.div variants={item} className="wl-dash-card">
              <div className="wl-dash-card-header">
                <div>
                  <h3 className="wl-dash-card-title">Course Analytics</h3>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Performance insights across all active tracks</p>
                </div>
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
                  yKey="enrollments"
                  height={200}
                  strokeColor="#0d9488"
                  fillColorStart="#99f6e4"
                  fillColorEnd="#f0fdfa"
                />
              </div>
            </motion.div>

            {/* My Courses */}
            <motion.div variants={item} className="wl-dash-card">
              <div className="wl-dash-card-header">
                <h3 className="wl-dash-card-title">My Courses</h3>
                <button className="wl-dash-card-link" onClick={() => onTabChange('courses')}>
                  View all <ArrowRight size={12} />
                </button>
              </div>
              <div className="wl-dash-card-body" style={{ padding: '12px 16px 16px' }}>
                {trainings.length === 0 ? (
                  <EmptyState icon={BookOpen} title="No courses assigned yet" description="Your assigned courses will appear here." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {trainings.slice(0, 3).map((c) => (
                      <div key={c.id} className="wl-course-card" onClick={() => onTabChange('courses')}>
                        <div className="wl-course-card-icon" style={{
                          background: c.status === 'PUBLISHED' ? '#f0fdf4' : '#fffbeb',
                          color: c.status === 'PUBLISHED' ? '#16a34a' : '#d97706',
                        }}>
                          <BookOpen size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="wl-course-card-title">{c.title}</div>
                          <div className="wl-course-card-meta">
                            {(c.enrolledCount || c.participantCount || 0)} learners
                          </div>
                        </div>
                        <span className="wl-course-card-badge" style={{
                          background: c.status === 'PUBLISHED' ? '#f0fdf4' : '#fffbeb',
                          color: c.status === 'PUBLISHED' ? '#16a34a' : '#d97706',
                        }}>
                          {c.status || 'Draft'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Student Activity */}
            <motion.div variants={item} className="wl-dash-card">
              <div className="wl-dash-card-header">
                <h3 className="wl-dash-card-title">Student Activity</h3>
              </div>
              <div className="wl-dash-card-body">
                {recentActivity.length === 0 ? (
                  <EmptyState icon={Activity} title="No activity yet" description="Activity will appear here." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {recentActivity.slice(0, 5).map((act) => (
                      <div key={act.id} className="wl-activity-item">
                        <div className="wl-activity-dot" style={{ background: act.color }} />
                        <div style={{ flex: 1 }}>
                          <div className="wl-activity-text">{act.message}</div>
                          <div className="wl-activity-time">{fmtTimeAgo(act.time)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Upcoming Sessions */}
            <motion.div variants={item} className="wl-dash-card">
              <div className="wl-dash-card-header">
                <h3 className="wl-dash-card-title">Upcoming Sessions</h3>
                <button className="wl-dash-card-link" onClick={() => onTabChange('courses')}>View All</button>
              </div>
              <div className="wl-dash-card-body" style={{ padding: '8px 16px 16px' }}>
                {[
                  { date: '16', month: 'JUL', title: 'React Advanced Concepts', time: '10:00 AM - 12:00 PM' },
                  { date: '18', month: 'JUL', title: 'Node.js Best Practices', time: '02:00 PM - 04:00 PM' },
                  { date: '20', month: 'JUL', title: 'Java Collections Framework', time: '11:00 AM - 01:00 PM' }
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

            {/* Recent Enrollments */}
            <motion.div variants={item} className="wl-dash-card">
              <div className="wl-dash-card-header">
                <h3 className="wl-dash-card-title">Recent Enrollments</h3>
              </div>
              <div className="wl-dash-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {recentActivity.slice(0, 4).map((act) => (
                    <div key={act.id} className="wl-activity-item">
                      <div className="wl-activity-dot" style={{ background: act.color }} />
                      <div style={{ flex: 1 }}>
                        <div className="wl-activity-text">{act.message}</div>
                        <div className="wl-activity-time">{fmtTimeAgo(act.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div variants={item} className="wl-dash-card">
              <div className="wl-dash-card-header">
                <h3 className="wl-dash-card-title">Quick Actions</h3>
              </div>
              <div className="wl-dash-card-body">
                <div className="wl-action-grid">
                  {[
                    { label: 'Create Course', icon: Plus, bg: '#f0fdf4', color: '#16a34a', action: () => { onTabChange('courses'); setTimeout(() => { window.dispatchEvent(new CustomEvent('open-create-course')) }, 100); } },
                    { label: 'Live Session', icon: Video, bg: '#f0f9ff', color: '#0284c7', action: () => { window.location.href = '/trainer/monitoring'; } },
                    { label: 'Create Quiz', icon: Sparkles, bg: '#fffbeb', color: '#d97706', action: () => { success('Launch AI Quiz generator from any Course structure!'); } },
                    { label: 'New Assignment', icon: FileText, bg: '#faf5ff', color: '#9333ea', action: () => { success('Open Assignments editor from Course Details page'); } }
                  ].map((act, idx) => (
                    <motion.button
                      key={idx}
                      onClick={act.action}
                      className="wl-action-btn"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="wl-action-icon" style={{ background: act.bg, color: act.color }}>
                        <act.icon size={18} />
                      </div>
                      <span className="wl-action-label">{act.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Courses Tab */}
      {tab === 'courses' && (
        <motion.div variants={item}>
          <TrainerCourses user={user} />
        </motion.div>
      )}

      {/* Credentials Tab */}
      {tab === 'credentials' && (
        <motion.div variants={item}>
          <ParticipantCredentials user={user} />
        </motion.div>
      )}

      {/* Feedback Tab */}
      {tab === 'feedback' && (
        <motion.div variants={item} className="enterprise-card">
          <div className="enterprise-card__header">
            <div>
              <h2 className="enterprise-card__title">Feedback Received</h2>
              <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Ratings and comments from participants</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-md)' }}>
              <Star size={14} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>{stats.avgTrainerRating ? Number(stats.avgTrainerRating).toFixed(1) : '—'}</span>
            </div>
          </div>
          <div className="enterprise-card__body">
            {feedbacks.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No Feedback Yet" description="Feedback from participants will appear here." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {paginatedFeedbacks.map((fb, i) => (
                  <motion.div
                    key={fb.id || i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{ display: 'flex', gap: '12px', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--neutral-150)', transition: 'border-color 150ms ease' }}
                  >
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--neutral-100)', color: 'var(--neutral-600)', border: '1px solid var(--neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                      {fb.anonymous ? '?' : initials(fb.participantName)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--neutral-800)' }}>{fb.anonymous ? 'Anonymous' : fb.participantName}</span>
                        <span style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>·</span>
                        <span style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{fmtDate(fb.submittedAt)}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginBottom: '8px' }}>
                        for <span style={{ fontWeight: 500, color: 'var(--neutral-700)' }}>{fb.trainingTitle}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>Trainer:</span>
                          <Stars v={fb.trainerRating} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>Subject:</span>
                          <Stars v={fb.subjectRating} />
                        </div>
                      </div>
                      {fb.comments && (
                        <p style={{ fontSize: '13px', color: 'var(--neutral-600)', background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', padding: '12px', margin: 0 }}>{fb.comments}</p>
                      )}
                      {fb.trainerResponse ? (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--brand-trainer)', background: 'var(--brand-trainer-bg)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                          <span style={{ fontWeight: 600 }}>Your reply:</span> {fb.trainerResponse}
                        </div>
                      ) : (
                        <button onClick={() => { setReplyModal(fb); setReplyText(''); }} style={{ marginTop: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--brand-trainer)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Reply →
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {totalFeedbackPages > 1 && (
                  <Pagination currentPage={feedbackPage} totalPages={totalFeedbackPages} onPageChange={setFeedbackPage} />
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Notes Tab */}
      {tab === 'notes' && (
        <motion.div variants={item}>
          <NotesSection user={user} />
        </motion.div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <motion.div variants={item} className="enterprise-card">
          <div className="enterprise-card__header">
            <div>
              <h2 className="enterprise-card__title">Reports & Analytics</h2>
              <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Participant progress, quiz results, and submissions</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleRegenerateCertificate} className="btn-enterprise btn-enterprise--secondary" style={{ fontSize: '13px' }}>
                Issue Certificates
              </button>
              <button onClick={fetchTrainerReport} className="btn-enterprise btn-enterprise--primary" style={{ fontSize: '13px' }}>
                Refresh
              </button>
            </div>
          </div>
          <div className="enterprise-card__body">
            {!trainerReport ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '192px' }}>
                <div style={{ textAlign: 'center' }}>
                  <Activity size={32} style={{ color: 'var(--neutral-300)', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Loading report data...</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                  <StatCard label="Average Progress" value={`${trainerReport.averageCompletion || 0}%`} icon={TrendingUp} variant="primary" />
                  <StatCard label="Pending Reviews" value={trainerReport.pendingReviews?.length || 0} icon={Clock} variant="amber" />
                  <StatCard label="Quiz Submissions" value={trainerReport.quizScores?.length || 0} icon={FileText} variant="blue" />
                </div>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-700)', marginBottom: '12px' }}>Participant Progress</h3>
                  {(!trainerReport.participantProgress || trainerReport.participantProgress.length === 0) ? (
                    <EmptyState icon={Users} title="No participants enrolled" description="No participants enrolled yet." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {trainerReport.participantProgress.slice(0, 5).map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--neutral-150)' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-100)', color: 'var(--neutral-600)', border: '1px solid var(--neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600 }}>
                            {initials(p.participantName)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--neutral-800)' }}>{p.participantName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{p.title}</div>
                          </div>
                          <div style={{ width: '96px' }}>
                            <ProgressBar value={p.progressPercent} max={100} showLabel color="primary" />
                          </div>
                          <Badge color="success">{p.avgQuizScore}%</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Reply Modal */}
      <AnimatePresence>
        {replyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
            onClick={() => setReplyModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="enterprise-card"
              style={{ width: '100%', maxWidth: '448px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="enterprise-card__header" style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--neutral-900)', fontFamily: 'var(--font-display)', margin: 0 }}>Reply to Feedback</h3>
                  <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>from {replyModal.participantName}</p>
                </div>
              </div>
              <form onSubmit={handleReply} style={{ padding: '24px' }}>
                <div className="field-group">
                  <label className="field-label">Your Response</label>
                  <textarea
                    className="field-input"
                    style={{ resize: 'none' }}
                    rows={4}
                    value={replyText}
                    required
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type your response..."
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                  <button type="button" onClick={() => setReplyModal(null)} className="btn-enterprise btn-enterprise--ghost">
                    Cancel
                  </button>
                  <button type="submit" className="btn-enterprise btn-enterprise--primary">
                    Submit Reply
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Participant Profile Modal */}
      <AnimatePresence>
        {viewingParticipant && (
          <ParticipantProfileView participant={viewingParticipant} onClose={() => setViewingParticipant(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default TrainerDashboard
