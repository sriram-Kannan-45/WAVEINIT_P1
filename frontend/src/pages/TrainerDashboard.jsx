import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Users, Star, FileText, CheckCircle, Clock, MessageSquare,
  TrendingUp, BookOpen, Award, ArrowRight, Activity, Video, Plus, Code, Layers, Sparkles, Coffee,
  Search
} from 'lucide-react'
import interviewService from '../services/interviewService'
import { LineAreaChart } from '../components/ui/ChartWrappers'
import NotesSection from '../components/trainer/notes/NotesSection'
import ParticipantProfileView from '../components/shared/ParticipantProfileView'
import TrainerCourses from './TrainerCourses'
import { useToast } from '../components/Toast'
import Pagination from '../components/Pagination'
import { Button, Badge, EmptyState, StatCard, ProgressBar } from '../components/ui'
import CourseArtwork from '../components/common/CourseArtwork'
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

function ReactMiniArtwork() {
  return (
    <svg viewBox="0 0 120 76" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="rm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00D8FF" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0A1128" stopOpacity="0" />
        </radialGradient>
        <filter id="rm-filter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="120" height="76" fill="#0A1128" />
      <rect width="120" height="76" fill="url(#rm-glow)" />
      
      {/* 3 Orbits */}
      <ellipse cx="60" cy="38" rx="24" ry="9" fill="none" stroke="#00D8FF" strokeWidth="1.2" opacity="0.9" filter="url(#rm-filter)" />
      <ellipse cx="60" cy="38" rx="24" ry="9" fill="none" stroke="#00D8FF" strokeWidth="1.2" opacity="0.9" transform="rotate(60 60 38)" filter="url(#rm-filter)" />
      <ellipse cx="60" cy="38" rx="24" ry="9" fill="none" stroke="#00D8FF" strokeWidth="1.2" opacity="0.9" transform="rotate(120 60 38)" filter="url(#rm-filter)" />
      
      {/* Core */}
      <circle cx="60" cy="38" r="4.2" fill="#00D8FF" opacity="0.95" filter="url(#rm-filter)" />
      <circle cx="60" cy="38" r="1.8" fill="#FFFFFF" />
    </svg>
  )
}

function OverviewAreaChart() {
  return (
    <div className="tdb-chart-box">
      <svg viewBox="0 0 460 120" width="100%" height="120" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="tdb-green-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A34A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#16A34A" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Axis Grid lines & labels */}
        {[
          { label: '1', y: 16 },
          { label: '0.75', y: 38 },
          { label: '0.5', y: 60 },
          { label: '0.25', y: 82 },
          { label: '0', y: 104 },
        ].map((g, i) => (
          <g key={i}>
            <text x="24" y={g.y + 3.5} fill="#94A3B8" fontSize="9.5" textAnchor="end" fontFamily="inherit" fontWeight="500">
              {g.label}
            </text>
            <line x1="34" y1={g.y} x2="450" y2={g.y} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
          </g>
        ))}

        {/* Area fill */}
        <path
          d="M 45 104 L 115 104 C 145 104 165 92 185 82 C 205 82 225 82 250 82 C 290 82 335 48 375 28 C 405 18 425 16 440 16 L 440 104 Z"
          fill="url(#tdb-green-grad)"
        />

        {/* Smooth curve line */}
        <path
          d="M 45 104 L 115 104 C 145 104 165 92 185 82 C 205 82 225 82 250 82 C 290 82 335 48 375 28 C 405 18 425 16 440 16"
          fill="none"
          stroke="#16A34A"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Data point dots */}
        <circle cx="185" cy="82" r="3.2" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="250" cy="82" r="3.2" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="440" cy="16" r="3.8" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />

        {/* X Axis labels */}
        {[
          { label: 'Mar', x: 45 },
          { label: 'Apr', x: 115 },
          { label: 'May', x: 185 },
          { label: 'Jun', x: 250 },
          { label: 'Jul', x: 360 },
          { label: 'Aug', x: 440 },
        ].map((m, i) => (
          <text key={i} x={m.x} y="118" fill="#94A3B8" fontSize="9.5" textAnchor="middle" fontFamily="inherit" fontWeight="500">
            {m.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

function TrainerDashboard({ user, onLogout, activeTab, onTabChange }) {
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const tab = activeTab || 'overview'
  const [trainings, setTrainings] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [interviews, setInterviews] = useState([])
  const [stats, setStats] = useState({
    totalTrainings: 0, avgTrainerRating: 0, totalFeedbacks: 0,
    totalLearners: 0, publishedCourses: 0,
  })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [feedbackPage, setFeedbackPage] = useState(1)
  const feedbackItemsPerPage = 5
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [trainerReport, setTrainerReport] = useState(null)
  const [replyModal, setReplyModal] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [viewingParticipant, setViewingParticipant] = useState(null)

  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` })

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

  const fetchTrainings = async () => {
    try {
      const [rTrainings, rCourses] = await Promise.all([
        fetch(`${API}/trainer/trainings`, { headers: auth() }).then(r => r.json()).catch(() => ({ trainings: [] })),
        fetch(`${API}/trainer/courses`, { headers: auth() }).then(r => r.json()).catch(() => ({ courses: [] }))
      ])
      const list = rTrainings.trainings || []
      const cList = rCourses.courses || []
      setTrainings(list.length > 0 ? list : cList)
      const dataset = list.length > 0 ? list : cList
      const published = dataset.filter(t => (t.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED').length
      const totalLearners = dataset.reduce((sum, t) => sum + (t.enrolledCount || t.participantCount || 0), 0)
      setStats(p => ({
        ...p,
        totalTrainings: dataset.length,
        publishedCourses: published,
        totalLearners: totalLearners
      }))
    } catch (e) {
      console.error('fetchTrainings error:', e.message)
    }
  }

  const fetchFeedbacks = async () => {
    try {
      const r = await fetch(`${API}/trainer/feedbacks`, { headers: auth() })
      const d = await r.json()
      if (d.success) setFeedbacks(d.feedbacks || [])
    } catch (e) {
      console.error('fetchFeedbacks error:', e.message)
    }
  }

  const fetchInterviews = async () => {
    try {
      const res = await interviewService.getTrainerInterviews()
      const list = res.interviews || res.data || []
      setInterviews(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('fetchInterviews error:', e.message)
    }
  }

  useEffect(() => {
    fetchTrainings()
    fetchFeedbacks()
    fetchInterviews()
  }, [])

  useEffect(() => {
    if (tab === 'reports') fetchTrainerReport()
  }, [tab])

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'
  const Stars = ({ v }) => (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} size={13} style={{ fill: s <= v ? '#f59e0b' : 'none', color: s <= v ? '#f59e0b' : '#cbd5e1' }} />
      ))}
    </span>
  )

  const paginatedFeedbacks = useMemo(() => {
    return [...feedbacks].slice(
      (feedbackPage - 1) * feedbackItemsPerPage,
      feedbackPage * feedbackItemsPerPage
    )
  }, [feedbacks, feedbackPage, feedbackItemsPerPage])

  const totalFeedbackPages = Math.ceil((feedbacks.length || 0) / feedbackItemsPerPage) || 1

  const trainerFirstName = user?.name?.trim().split(' ')[0] || 'Sriram'
  const trainerInitials = useMemo(() => {
    if (!user?.name) return 'SK'
    return user.name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }, [user?.name])

  return (
    <>
      {/* ── OVERVIEW TAB: EXACT ZERO-SCROLLBAR TRAINER DASHBOARD ── */}
      {tab === 'overview' && (
        <div className="tdb-dashboard-page">
          {/* 1. Page Header Card */}
          <div className="tdb-page-header">
            <div className="tdb-header-left">
              <div className="tdb-header-icon-box">
                <TrendingUp size={20} strokeWidth={2.4} />
              </div>
              <div>
                <h1 className="tdb-header-title">Welcome back, {trainerFirstName}!</h1>
                <p className="tdb-header-subtitle">Here's an overview of your training activities.</p>
              </div>
            </div>

            <button
              className="tdb-create-btn"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={15} strokeWidth={2.5} /> Create Course
            </button>
          </div>

          {/* 2. Statistics Cards Row (4 Cards) */}
          <div className="tdb-stats-grid">
            {/* Card 1: Total Trainings */}
            <div className="tdb-stat-card">
              <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--green">
                <BookOpen size={18} strokeWidth={2} />
              </div>
              <div className="tdb-stat-text-wrap">
                <span className="tdb-stat-label">Total Trainings</span>
                <div className="tdb-stat-value">{stats.totalTrainings}</div>
                <span className="tdb-stat-sub">All courses created</span>
              </div>
            </div>

            {/* Card 2: Published */}
            <div className="tdb-stat-card">
              <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--blue">
                <CheckCircle size={18} strokeWidth={2} />
              </div>
              <div className="tdb-stat-text-wrap">
                <span className="tdb-stat-label">Published</span>
                <div className="tdb-stat-value">{stats.publishedCourses}</div>
                <span className="tdb-stat-sub">Courses live</span>
              </div>
            </div>

            {/* Card 3: Drafts */}
            <div className="tdb-stat-card">
              <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--amber">
                <FileText size={18} strokeWidth={2} />
              </div>
              <div className="tdb-stat-text-wrap">
                <span className="tdb-stat-label">Drafts</span>
                <div className="tdb-stat-value">0</div>
                <span className="tdb-stat-sub">In progress</span>
              </div>
            </div>

            {/* Card 4: Total Students */}
            <div className="tdb-stat-card">
              <div className="tdb-stat-icon-wrap tdb-stat-icon-wrap--purple">
                <Users size={18} strokeWidth={2} />
              </div>
              <div className="tdb-stat-text-wrap">
                <span className="tdb-stat-label">Total Students</span>
                <div className="tdb-stat-value">{stats.totalLearners}</div>
                <span className="tdb-stat-sub">Across all courses</span>
              </div>
            </div>
          </div>

          {/* 3. Main Two-Column Grid */}
          <div className="tdb-main-grid">
            {/* LEFT COLUMN: Training Overview Card + Metric Strip */}
            <div className="tdb-card">
              <div className="tdb-card-header">
                <h2 className="tdb-card-title">Training Overview</h2>
                <select className="tdb-select" defaultValue="This Month">
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                  <option value="This Year">This Year</option>
                </select>
              </div>

              {/* Chart */}
              <OverviewAreaChart />

              {/* Mini Metric Strip */}
              <div className="tdb-metric-strip">
                <div className="tdb-metric-item">
                  <div className="tdb-metric-icon" style={{ background: '#EAF8F0', color: '#16A34A' }}>
                    <Users size={14} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="tdb-metric-val">{stats.totalLearners}</div>
                    <div className="tdb-metric-sub">Active Students</div>
                  </div>
                </div>

                <div className="tdb-metric-item">
                  <div className="tdb-metric-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
                    <BookOpen size={14} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="tdb-metric-val">{stats.totalTrainings}</div>
                    <div className="tdb-metric-sub">Assigned Courses</div>
                  </div>
                </div>

                <div className="tdb-metric-item">
                  <div className="tdb-metric-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                    <FileText size={14} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="tdb-metric-val">{feedbacks.length}</div>
                    <div className="tdb-metric-sub">Feedback Reviews</div>
                  </div>
                </div>

                <div className="tdb-metric-item">
                  <div className="tdb-metric-icon" style={{ background: '#FAF5FF', color: '#8B5CF6' }}>
                    <Star size={14} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="tdb-metric-val">{interviews.length}</div>
                    <div className="tdb-metric-sub">Interviews</div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Stacked Cards (Recent Trainings + Upcoming Sessions) */}
            <div className="tdb-right-col">
              {/* Card 1: Recent Trainings */}
              <div className="tdb-card" style={{ flex: 1.1 }}>
                <div className="tdb-card-header">
                  <h2 className="tdb-card-title">Recent Trainings</h2>
                  <button
                    className="tdb-link-btn"
                    onClick={() => onTabChange?.('courses')}
                  >
                    View all →
                  </button>
                </div>

                {trainings.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                    <BookOpen size={30} style={{ margin: '0 auto 8px', color: '#CBD5E1' }} />
                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#475569' }}>No assigned trainings yet</p>
                    <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Trainings assigned to you by administrators will appear here.</span>
                  </div>
                ) : (
                  trainings.slice(0, 2).map((tr) => (
                    <div
                      key={tr.id}
                      className="tdb-course-row"
                      onClick={() => onTabChange?.('courses')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="tdb-course-thumb">
                        <div className="tdb-course-badge-status">{tr.status || 'PUBLISHED'}</div>
                        <div className="tdb-course-badge-students">
                          <Users size={9} /> {tr.enrolledCount || 0}
                        </div>
                        <CourseArtwork title={tr.title} category={tr.category} />
                      </div>

                      <div className="tdb-course-info">
                        <span className="tdb-category-pill">{tr.category || 'TRAINING'}</span>
                        <h3 className="tdb-course-name">{tr.title}</h3>
                        <p className="tdb-course-desc">
                          {tr.description || `Training curriculum for ${tr.title}.`}
                        </p>
                        <div className="tdb-course-meta">
                          <span>{tr.capacity ? `${tr.capacity} Max Seats` : 'Unlimited'}</span>
                          <span>|</span>
                          <span>{tr.enrolledCount || 0} Students</span>
                        </div>
                        <div className="tdb-course-footer-row">
                          <div className="tdb-author-avatar">{trainerInitials}</div>
                          <span>{tr.startDate ? fmtDate(tr.startDate) : 'Active'}</span>
                          <span>•</span>
                          <span>Assigned by Admin</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Card 2: Upcoming Sessions */}
              <div className="tdb-card" style={{ flex: 0.9 }}>
                <div className="tdb-card-header">
                  <h2 className="tdb-card-title">Upcoming Sessions</h2>
                  <button
                    className="tdb-link-btn"
                    onClick={() => onTabChange?.('interviews')}
                  >
                    View all →
                  </button>
                </div>

                {interviews.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8' }}>
                    <Calendar size={30} style={{ margin: '0 auto 8px', color: '#CBD5E1' }} />
                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#475569' }}>No upcoming sessions</p>
                    <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Scheduled interviews and sessions will appear here.</span>
                  </div>
                ) : (
                  interviews.slice(0, 2).map((iv) => {
                    const d = iv.scheduledAt ? new Date(iv.scheduledAt) : new Date()
                    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
                    const day = d.getDate()
                    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={iv.id} className="tdb-session-row" onClick={() => onTabChange?.('interviews')} style={{ cursor: 'pointer' }}>
                        <div className="tdb-session-left">
                          <div className="tdb-date-badge">
                            <span className="tdb-date-month">{month}</span>
                            <span className="tdb-date-day">{day}</span>
                          </div>
                          <div>
                            <h4 className="tdb-session-title">{iv.title || iv.candidateName || 'Interview Session'}</h4>
                            <p className="tdb-session-time">{time} • {iv.role || 'Evaluation'}</p>
                          </div>
                        </div>
                        <span className="tdb-badge-upcoming">{iv.status || 'Upcoming'}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* 4. Bottom Card: Quick Actions */}
          <div className="tdb-quick-card">
            <div className="tdb-card-header" style={{ marginBottom: 6 }}>
              <h2 className="tdb-card-title">Quick Actions</h2>
            </div>

            <div className="tdb-quick-actions-grid">
              <div
                className="tdb-action-card"
                onClick={() => setCreateModalOpen(true)}
              >
                <div className="tdb-action-icon tdb-action-icon--green">
                  <Plus size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <h4 className="tdb-action-title">Create Course</h4>
                  <div className="tdb-action-sub">Start a new training</div>
                </div>
              </div>

              <div
                className="tdb-action-card"
                onClick={() => onTabChange?.('courses')}
              >
                <div className="tdb-action-icon tdb-action-icon--blue">
                  <BookOpen size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <h4 className="tdb-action-title">My Trainings</h4>
                  <div className="tdb-action-sub">View assigned courses</div>
                </div>
              </div>

              <div
                className="tdb-action-card"
                onClick={() => onTabChange?.('reports')}
              >
                <div className="tdb-action-icon tdb-action-icon--amber">
                  <TrendingUp size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <h4 className="tdb-action-title">View Reports</h4>
                  <div className="tdb-action-sub">Track performance</div>
                </div>
              </div>

              <div
                className="tdb-action-card"
                onClick={() => setBulkImportOpen(true)}
              >
                <div className="tdb-action-icon tdb-action-icon--purple">
                  <FileText size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <h4 className="tdb-action-title">Bulk Import</h4>
                  <div className="tdb-action-sub">Import multiple courses</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Create Course Modal ── */}
          <AnimatePresence>
            {createModalOpen && (
              <motion.div
                className="wl-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCreateModalOpen(false)}
                style={{ zIndex: 1000 }}
              >
                <motion.div
                  className="wl-modal-card"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className="wl-modal-title">Create Course</h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                    New courses are assigned under Training Programs by administrators. You can create learning modules and lessons inside assigned courses.
                  </p>
                  <div className="wl-modal-actions" style={{ marginTop: 24 }}>
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(false)}
                      className="wl-btn-secondary"
                      style={{ height: 40 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateModalOpen(false)
                        onTabChange?.('courses')
                      }}
                      className="wl-btn-primary"
                      style={{ height: 40 }}
                    >
                      Open Course Manager
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Bulk Import Modal ── */}
          <AnimatePresence>
            {bulkImportOpen && (
              <motion.div
                className="wl-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setBulkImportOpen(false)}
                style={{ zIndex: 1000 }}
              >
                <motion.div
                  className="wl-modal-card"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className="wl-modal-title">Bulk Import Course Content</h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                    Upload curriculum structure, lesson notes, or quiz questions via JSON or CSV.
                  </p>
                  <div style={{
                    border: '2px dashed #E2E8F0',
                    borderRadius: 12,
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: '#F8FAFC',
                    cursor: 'pointer'
                  }}>
                    <FileText size={32} color="#8B5CF6" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Drop curriculum files here or click to browse</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Supports .json, .csv, .docx formats</div>
                  </div>
                  <div className="wl-modal-actions" style={{ marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => setBulkImportOpen(false)}
                      className="wl-btn-secondary"
                      style={{ height: 40 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkImportOpen(false)
                        success('Bulk import template ready.')
                      }}
                      className="wl-btn-primary"
                      style={{ height: 40 }}
                    >
                      Import Files
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Courses Tab */}
      {tab === 'courses' && (
        <motion.div variants={item}>
          <TrainerCourses user={user} onLogout={onLogout} onTabChange={onTabChange} />
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
    </>
  )
}

export default TrainerDashboard
