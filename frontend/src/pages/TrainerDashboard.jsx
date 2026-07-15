import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Users, Star, FileText, CheckCircle, Clock, MessageSquare,
  TrendingUp, BookOpen, Award, ArrowRight, Activity, Video, Plus, Code, Layers, Sparkles, Coffee
} from 'lucide-react'
import NotesSection from '../components/trainer/notes/NotesSection'
import ParticipantProfileView from '../components/shared/ParticipantProfileView'
import TrainerCourses from './TrainerCourses'
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
        color: t.status === 'PUBLISHED' ? '#10B981' : '#F59E0B',
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
        <Star key={s} size={13} style={{ color: s <= v ? '#F59E0B' : '#E5E7EB', fill: s <= v ? '#F59E0B' : 'none' }} />
      ))}
    </span>
  )

  const paginatedFeedbacks = [...feedbacks].slice(
    (feedbackPage - 1) * feedbackItemsPerPage,
    feedbackPage * feedbackItemsPerPage
  )
  const totalFeedbackPages = Math.ceil(feedbacks.length / feedbackItemsPerPage)

  return (
    <motion.div variants={container} initial="hidden" animate="show" style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px', minHeight: '100vh', fontFamily: 'var(--font-primary)' }}>
      {/* ── Welcome Banner (only on overview tab) ── */}
      {tab === 'overview' && (
        <>
          <motion.div
            variants={item}
            style={{
              borderRadius: 'var(--radius-2xl)',
              padding: '32px',
              background: 'linear-gradient(135deg, #0D9488 0%, #10B981 100%)',
              color: '#fff',
              marginBottom: '24px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                  Welcome back, {user.name?.split(' ')[0] || 'Trainer'} 👋
                </h1>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: '6px 0 0' }}>
                  Here's what's happening with your trainings today.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onTabChange('reports')}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                    transition: 'background 150ms ease'
                  }}
                >
                  View Reports
                </button>
                <button
                  onClick={() => onTabChange('profile')}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: '#fff',
                    color: '#0D9488',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 150ms ease'
                  }}
                >
                  My Profile
                </button>
              </div>
            </div>
          </motion.div>

          {/* KPI Cards */}
          <motion.div variants={item} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <StatCard icon={BookOpen} label="Total Courses" value={stats.totalTrainings} variant="blue" />
            <StatCard icon={Users} label="Active Learners" value={stats.totalLearners} variant="emerald" />
            <StatCard icon={Star} label="Average Rating" value={stats.avgTrainerRating ? Number(stats.avgTrainerRating).toFixed(1) : '—'} variant="amber" />
            <StatCard icon={MessageSquare} label="Feedback Received" value={stats.totalFeedbacks} variant="violet" />
          </motion.div>
        </>
      )}

      {/* Overview Grid Layout */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px', alignItems: 'start' }}>
          
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* My Trainings Section */}
            <motion.div variants={item} className="enterprise-card">
              <div className="enterprise-card__header">
                <div>
                  <h3 className="enterprise-card__title">My Courses</h3>
                  <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Quick access to your active courses</p>
                </div>
                <button onClick={() => onTabChange('courses')} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-trainer)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  View all <ArrowRight size={12} />
                </button>
              </div>
              <div className="enterprise-card__body">
                {trainings.length === 0 ? (
                  <EmptyState icon={BookOpen} title="No courses assigned yet" description="Your assigned courses will appear here." />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {trainings.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          border: '1px solid var(--neutral-150)',
                          borderRadius: 'var(--radius-xl)',
                          padding: '20px',
                          background: 'var(--neutral-0)',
                          cursor: 'pointer',
                          transition: 'border-color 150ms ease, box-shadow 150ms ease'
                        }}
                        onClick={() => onTabChange('courses')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <div style={{
                            width: '40px', height: '40px', borderRadius: 'var(--radius-lg)',
                            background: c.status === 'PUBLISHED' ? 'rgba(37, 99, 235, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                            color: c.status === 'PUBLISHED' ? '#0D9488' : '#F59E0B',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            <BookOpen size={18} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-800)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.title}
                            </h4>
                            <span style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>
                              {(c.enrolledCount || c.participantCount || 0)} learners
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 600,
                            padding: '3px 10px', borderRadius: 'var(--radius-full)',
                            background: c.status === 'PUBLISHED' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                            color: c.status === 'PUBLISHED' ? '#10B981' : '#F59E0B'
                          }}>
                            {c.status || 'Draft'}
                          </span>
                          <ArrowRight size={14} style={{ color: 'var(--neutral-300)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Learning Analytics Overview */}
            <motion.div variants={item} className="enterprise-card">
              <div className="enterprise-card__header">
                <div>
                  <h3 className="enterprise-card__title">Learning Analytics</h3>
                  <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Performance insights across all active tracks</p>
                </div>
                <select style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--neutral-200)', fontSize: '12px', fontWeight: 600, background: 'white', color: 'var(--neutral-700)', cursor: 'pointer', outline: 'none' }}>
                  <option>This Month</option>
                  <option>This Week</option>
                  <option>Last Quarter</option>
                </select>
              </div>
              <div className="enterprise-card__body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                  {[
                    { label: 'Enrollments', value: '12', trend: '+12%', color: '#0D9488' },
                    { label: 'Completions', value: '7', trend: '+8%', color: '#10B981' },
                    { label: 'Avg. Quiz Score', value: '78%', trend: '+15%', color: '#F59E0B' },
                    { label: 'Attendance Rate', value: '85%', trend: '+10%', color: '#059669' }
                  ].map((m, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--neutral-150)', borderRadius: 'var(--radius-lg)', padding: '16px', background: 'var(--neutral-50)', transition: 'background 150ms ease' }}>
                      <span style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 500, display: 'block' }}>{m.label}</span>
                      <span style={{ fontSize: '24px', color: 'var(--neutral-900)', fontWeight: 800, fontFamily: 'var(--font-display)', display: 'block', margin: '4px 0', letterSpacing: '-0.03em' }}>{m.value}</span>
                      <span style={{ fontSize: '11px', color: 'var(--status-success-dark)', fontWeight: 600 }}>{m.trend}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Upcoming Sessions Card */}
            <motion.div variants={item} className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Upcoming Sessions</h3>
                <button onClick={() => onTabChange('courses')} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-trainer)', background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
              </div>
              <div className="enterprise-card__body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { date: '16', month: 'JUL', title: 'React Advanced Concepts', time: '10:00 AM - 12:00 PM' },
                    { date: '18', month: 'JUL', title: 'Node.js Best Practices', time: '02:00 PM - 04:00 PM' },
                    { date: '20', month: 'JUL', title: 'Java Collections Framework', time: '11:00 AM - 01:00 PM' }
                  ].map((s, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', borderRadius: 'var(--radius-lg)', transition: 'background 150ms ease', cursor: 'pointer' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', background: 'var(--brand-trainer-bg)', color: 'var(--brand-trainer)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', lineHeight: 1 }}>{s.month}</span>
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>{s.date}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--neutral-800)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--neutral-400)', fontWeight: 500 }}>{s.time}</span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--brand-trainer)', background: 'var(--brand-trainer-bg)', borderRadius: 'var(--radius-full)', padding: '2px 8px', textTransform: 'uppercase', flexShrink: 0 }}>
                        + Live
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Recent Activity Card */}
            <motion.div variants={item} className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Recent Activity</h3>
                <button onClick={() => onTabChange('courses')} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-trainer)', background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
              </div>
              <div className="enterprise-card__body">
                {recentActivity.length === 0 ? (
                  <EmptyState icon={Activity} title="No activity yet" description="Activity will appear here." />
                ) : (
                  <div style={{ position: 'relative', paddingLeft: '24px' }}>
                    <div style={{ position: 'absolute', left: '8px', top: '8px', bottom: '8px', width: '2px', background: 'var(--neutral-150)', pointerEvents: 'none' }} />
                    {recentActivity.slice(0, 4).map((act) => (
                      <div key={act.id} style={{ position: 'relative', marginBottom: '20px' }}>
                        <div style={{ position: 'absolute', left: '-20px', top: '6px', width: '10px', height: '10px', borderRadius: '50%', background: act.color, border: '2px solid white', boxShadow: '0 0 0 4px var(--neutral-50)' }} />
                        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--neutral-700)', lineHeight: 1.4, margin: 0 }}>{act.message}</p>
                        <span style={{ fontSize: '11px', color: 'var(--neutral-400)', fontWeight: 500 }}>{fmtTimeAgo(act.time)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Quick Actions Card */}
            <motion.div variants={item} className="enterprise-card">
              <div className="enterprise-card__header">
                <h3 className="enterprise-card__title">Quick Actions</h3>
              </div>
              <div className="enterprise-card__body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Create Course', icon: Plus, bg: 'rgba(5, 150, 105, 0.08)', color: '#0D9488', action: () => { onTabChange('courses'); setTimeout(() => { window.dispatchEvent(new CustomEvent('open-create-course')) }, 100); } },
                    { label: 'Live Session', icon: Video, bg: 'rgba(16, 185, 129, 0.08)', color: '#10B981', action: () => { window.location.href = '/trainer/monitoring'; } },
                    { label: 'Create Quiz', icon: Sparkles, bg: 'rgba(245, 158, 11, 0.08)', color: '#F59E0B', action: () => { success('Launch AI Quiz generator from any Course structure!'); } },
                    { label: 'New Assignment', icon: FileText, bg: 'rgba(16, 185, 129, 0.08)', color: '#059669', action: () => { success('Open Assignments editor from Course Details page'); } }
                  ].map((act, idx) => (
                    <motion.button
                      key={idx}
                      onClick={act.action}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--neutral-150)',
                        background: 'var(--neutral-50)',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-lg)', background: act.bg, color: act.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                        <act.icon size={18} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--neutral-700)' }}>{act.label}</span>
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

      {/* Feedback Tab */}
      {tab === 'feedback' && (
        <motion.div variants={item} className="enterprise-card">
          <div className="enterprise-card__header">
            <div>
              <h2 className="enterprise-card__title">Feedback Received</h2>
              <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Ratings and comments from participants</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-md)' }}>
              <Star size={14} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#B45309' }}>{stats.avgTrainerRating ? Number(stats.avgTrainerRating).toFixed(1) : '—'}</span>
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
